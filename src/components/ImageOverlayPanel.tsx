// src/components/ImageOverlayPanel.tsx
import React, { useRef, useState, useCallback } from "react";

export interface OverlayState {
  dataUrl: string | null;
  scale: number; // used for non-repeat image
  rotation: number; // degrees, applied to preview layer
  offsetX: number; // pan for non-repeat or backgroundPosition for tile
  offsetY: number;
  opacity: number;
  repeat?: "none" | "tile";
  patternScale?: number; // % scale for tiling background (100 = original)
}

interface Props {
  onApply: (overlay: OverlayState) => void;
}

/* ----------------------- defaults ----------------------- */
const defaultOverlay: OverlayState = {
  dataUrl: null,
  scale: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  opacity: 0.8,
  repeat: "none",
  patternScale: 100,
};

/* ------------------- component ------------------- */
export const ImageOverlayPanel: React.FC<Props> = ({ onApply }) => {
  const [overlay, setOverlay] = useState<OverlayState>(defaultOverlay);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ---------------- handlers ---------------- */
  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setOverlay((o) => ({
        ...o,
        dataUrl: result,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      }));
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) loadFile(f);
  };

  const startDrag = (x: number, y: number) => {
    setDragging(true);
    dragStart.current = { x, y };
  };
  const moveDrag = (x: number, y: number) => {
    if (!dragging || !dragStart.current) return;
    const dx = x - dragStart.current.x;
    const dy = y - dragStart.current.y;
    setOverlay((s) => ({
      ...s,
      offsetX: s.offsetX + dx,
      offsetY: s.offsetY + dy,
    }));
    dragStart.current = { x, y };
  };
  const endDrag = () => {
    setDragging(false);
    dragStart.current = null;
  };

  /* Wheel zoom:
     - non-repeat: adjust overlay.scale
     - tile: adjust overlay.patternScale
  */
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (overlay.repeat === "tile") {
      const next = (overlay.patternScale ?? 100) * (e.deltaY < 0 ? 1.08 : 0.92);
      setOverlay((s) => ({
        ...s,
        patternScale: Math.max(10, Math.min(400, next)),
      }));
    } else {
      const next = overlay.scale * (e.deltaY < 0 ? 1.1 : 0.9);
      setOverlay((s) => ({ ...s, scale: Math.max(0.1, Math.min(5, next)) }));
    }
  };

  /* ---------------- UI ---------------- */
  return (
    <div
      style={{
        width: 380,
        background: "rgba(17,24,39,0.97)",
        border: "1px solid #1f2937",
        borderRadius: 18,
        padding: 14,
        color: "#f3f4f6",
        boxShadow: "0 8px 25px rgba(0,0,0,.5)",
        zIndex: 9999,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <h3
        style={{
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 10,
          color: "#e5e7eb",
        }}
      >
        🖼️ Image Overlay
      </h3>

      {/* Upload / Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: "2px dashed #374151",
          borderRadius: 10,
          padding: 12,
          textAlign: "center",
          marginBottom: 12,
          cursor: "pointer",
          userSelect: "none",
        }}
        title="Click or drop an image"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          Click or drop an image to overlay
        </div>
      </div>

      {/* Preview (pan/zoom/rotate) */}
      {overlay.dataUrl && (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 220,
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
          onWheel={handleWheel}
          onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
          onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={(e) => {
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            moveDrag(t.clientX, t.clientY);
          }}
          onTouchEnd={endDrag}
        >
          {/* Non-repeat: use <img> so translate/scale work intuitively */}
          {overlay.repeat !== "tile" ? (
            <img
              src={overlay.dataUrl}
              alt="Overlay Preview"
              style={{
                position: "absolute",
                transform: `
                  translate(${overlay.offsetX}px, ${overlay.offsetY}px)
                  scale(${overlay.scale})
                  rotate(${overlay.rotation}deg)
                `,
                transformOrigin: "center",
                width: "100%",
                height: "auto",
                objectFit: "contain",
                opacity: overlay.opacity,
                transition: dragging ? "none" : "transform 0.15s ease",
                pointerEvents: "none",
              }}
            />
          ) : (
            /* Repeat (tile): use a background layer so repeat/size/position are correct */
            <div
              aria-label="Tiled overlay"
              style={{
                position: "absolute",
                inset: 0,
                transform: `rotate(${overlay.rotation}deg)`,
                transformOrigin: "center",
                opacity: overlay.opacity,
                backgroundImage: `url(${overlay.dataUrl})`,
                backgroundRepeat: "repeat",
                // patternScale is percentage; keep aspect by scaling width and letting height auto
                backgroundSize: `${overlay.patternScale ?? 100}% auto`,
                // offsetX/offsetY pan the pattern
                backgroundPosition: `${overlay.offsetX}px ${overlay.offsetY}px`,
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      )}

      {/* Controls */}
      {overlay.dataUrl && (
        <div
          style={{ display: "grid", gap: 8, fontSize: 13, marginBottom: 10 }}
        >
          {/* Repeat mode */}
          <label
            style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
          >
            <span>Repeat Mode</span>
            <select
              value={overlay.repeat ?? "none"}
              onChange={(e) =>
                setOverlay((s) => ({
                  ...s,
                  repeat: e.target.value as "none" | "tile",
                }))
              }
              style={{
                background: "#1f2937",
                color: "#f3f4f6",
                borderRadius: 6,
                border: "1px solid #374151",
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              <option value="none">None</option>
              <option value="tile">Tile</option>
            </select>
          </label>

          {/* For non-repeat: Scale */}
          {overlay.repeat !== "tile" && (
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>Scale</span>
              <input
                type="number"
                step={0.1}
                min={0.1}
                max={5}
                value={overlay.scale}
                onChange={(e) =>
                  setOverlay((s) => ({
                    ...s,
                    scale: Math.max(0.1, Number(e.target.value) || 1),
                  }))
                }
                style={numStyle}
              />
            </label>
          )}

          {/* For tiling: Pattern scale */}
          {overlay.repeat === "tile" && (
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>Pattern Scale (%)</span>
              <input
                type="number"
                min={10}
                max={400}
                step={5}
                value={overlay.patternScale ?? 100}
                onChange={(e) =>
                  setOverlay((s) => ({
                    ...s,
                    patternScale: Math.max(
                      10,
                      Math.min(400, Number(e.target.value) || 100),
                    ),
                  }))
                }
                style={numStyle}
              />
            </label>
          )}

          {/* Rotation */}
          <label
            style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
          >
            <span>Rotation (°)</span>
            <input
              type="number"
              step={1}
              value={overlay.rotation}
              onChange={(e) =>
                setOverlay((s) => ({
                  ...s,
                  rotation: Number(e.target.value) || 0,
                }))
              }
              style={numStyle}
            />
          </label>

          {/* Opacity */}
          <label
            style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
          >
            <span>Opacity</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={overlay.opacity}
              onChange={(e) =>
                setOverlay((s) => ({
                  ...s,
                  opacity: Math.max(
                    0,
                    Math.min(1, Number(e.target.value) || 0.8),
                  ),
                }))
              }
              style={numStyle}
            />
          </label>
        </div>
      )}

      {/* Apply / Reset */}
      {overlay.dataUrl && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
          }}
        >
          <button
            onClick={() => setOverlay(defaultOverlay)}
            style={btnSecondary}
            title="Remove overlay and reset settings"
          >
            Reset
          </button>
          <button
            onClick={() => onApply(overlay)}
            style={btnPrimary}
            title="Send overlay settings to the main canvas/rings layer"
          >
            📤 Transfer to Rings
          </button>
        </div>
      )}
    </div>
  );
};

/* ---------------- styles ---------------- */
const numStyle: React.CSSProperties = {
  width: 90,
  background: "#111827",
  color: "#f9fafb",
  border: "1px solid #374151",
  borderRadius: 6,
  textAlign: "right",
  padding: "3px 6px",
};

const btnPrimary: React.CSSProperties = {
  background: "#10b981",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
};

const btnSecondary: React.CSSProperties = {
  background: "#1f2937",
  color: "#e5e7eb",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: "10px 16px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};
