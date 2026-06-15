// src/components/OverlayPreview.tsx
//
// Shared image-overlay preview used by BOTH the Designer (ImageOverlayPanel)
// and the Freeform overlay panel, so the two look and behave identically:
//   • one-finger drag (or mouse drag) pans       -> offsetX / offsetY
//   • two-finger pinch (or scroll wheel) zooms    -> scale (patternScale in tile mode)
// All interaction is via pointer events, so touch works on iPad/iPhone where
// there is no scroll wheel.
import React, { useCallback, useRef, useState } from "react";
import type { OverlayState } from "./ImageOverlayPanel";

interface OverlayPreviewProps {
  overlay: OverlayState;
  /** Preview box height in px. Width is always 100% of the parent. */
  height: number;
  /** Apply a partial update (pan/zoom) to the overlay. */
  onChange: (patch: Partial<OverlayState>) => void;
  /** Show the dashed "Transfer area" indicator (default true). */
  showTransferArea?: boolean;
}

const SCALE_MIN = 0.1;
const SCALE_MAX = 6;
const PAT_MIN = 5;
const PAT_MAX = 400;

export const OverlayPreview: React.FC<OverlayPreviewProps> = ({
  overlay,
  height,
  onChange,
  showTransferArea = true,
}) => {
  const isTile = overlay.repeat === "tile";
  const [dragging, setDragging] = useState(false);

  // Live pointers + gesture baselines. A ref so it survives re-renders and the
  // handlers always read the latest gesture state without re-binding.
  const g = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    panStartX: number;
    panStartY: number;
    startOffsetX: number;
    startOffsetY: number;
    pinchStartDist: number | null;
    pinchStartZoom: number;
  }>({
    pointers: new Map(),
    panStartX: 0,
    panStartY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pinchStartDist: null,
    pinchStartZoom: 1,
  });

  const seedPan = useCallback(
    (x: number, y: number) => {
      g.current.panStartX = x;
      g.current.panStartY = y;
      g.current.startOffsetX = overlay.offsetX ?? 0;
      g.current.startOffsetY = overlay.offsetY ?? 0;
    },
    [overlay.offsetX, overlay.offsetY],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const s = g.current;
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.pointers.size === 1) {
        setDragging(true);
        seedPan(e.clientX, e.clientY);
      } else if (s.pointers.size === 2) {
        const pts = [...s.pointers.values()];
        s.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || null;
        s.pinchStartZoom = isTile ? overlay.patternScale ?? 100 : overlay.scale ?? 1;
      }
    },
    [isTile, overlay.patternScale, overlay.scale, seedPan],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = g.current;
      if (!s.pointers.has(e.pointerId)) return;
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.pointers.size >= 2 && s.pinchStartDist) {
        const pts = [...s.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const ratio = dist / s.pinchStartDist;
        if (isTile) {
          onChange({ patternScale: Math.max(PAT_MIN, Math.min(PAT_MAX, s.pinchStartZoom * ratio)) });
        } else {
          onChange({ scale: Math.max(SCALE_MIN, Math.min(SCALE_MAX, s.pinchStartZoom * ratio)) });
        }
      } else if (s.pointers.size === 1) {
        const dx = e.clientX - s.panStartX;
        const dy = e.clientY - s.panStartY;
        onChange({ offsetX: s.startOffsetX + dx, offsetY: s.startOffsetY + dy });
      }
    },
    [isTile, onChange],
  );

  const endPointer = useCallback((e: React.PointerEvent) => {
    const s = g.current;
    s.pointers.delete(e.pointerId);
    if (s.pointers.size < 2) s.pinchStartDist = null;
    if (s.pointers.size === 0) setDragging(false);
    // If one finger remains after a pinch, re-seed the pan baseline to it so
    // the image doesn't jump on the next move.
    if (s.pointers.size === 1) {
      const pt = [...s.pointers.values()][0];
      seedPan(pt.x, pt.y);
    }
  }, [seedPan]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      if (isTile) {
        onChange({ patternScale: Math.max(PAT_MIN, Math.min(PAT_MAX, (overlay.patternScale ?? 100) * factor)) });
      } else {
        onChange({ scale: Math.max(SCALE_MIN, Math.min(SCALE_MAX, (overlay.scale ?? 1) * factor)) });
      }
    },
    [isTile, onChange, overlay.patternScale, overlay.scale],
  );

  const offsetX = overlay.offsetX ?? 0;
  const offsetY = overlay.offsetY ?? 0;
  const scale = overlay.scale ?? 1;
  const rotation = overlay.rotation ?? 0;
  const opacity = overlay.opacity ?? 0.8;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 8,
        overflow: "hidden",
        background: "#000",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        boxShadow: "inset 0 0 12px rgba(0,0,0,0.4)",
        marginBottom: 12,
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
    >
      {!isTile ? (
        <img
          src={overlay.dataUrl ?? undefined}
          alt="Overlay preview"
          style={{
            position: "absolute",
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: "center",
            width: "100%",
            height: "auto",
            objectFit: "contain",
            opacity,
            transition: dragging ? "none" : "transform 0.12s ease",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          aria-label="Tiled overlay"
          style={{
            position: "absolute",
            inset: 0,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "center",
            opacity,
            backgroundImage: `url(${overlay.dataUrl ?? ""})`,
            backgroundRepeat: "repeat",
            backgroundSize: `${overlay.patternScale ?? 100}% auto`,
            backgroundPosition: `${offsetX}px ${offsetY}px`,
            pointerEvents: "none",
          }}
        />
      )}

      {showTransferArea && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "2px dashed rgba(255,255,255,0.75)",
            borderRadius: 6,
            pointerEvents: "none",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 5,
              left: 7,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.85)",
              textShadow: "0 1px 3px rgba(0,0,0,0.9)",
              textTransform: "uppercase",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            Transfer area
          </div>
        </div>
      )}
    </div>
  );
};

export default OverlayPreview;
