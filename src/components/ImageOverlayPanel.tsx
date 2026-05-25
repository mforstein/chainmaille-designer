// src/components/ImageOverlayPanel.tsx
import React, { useRef, useState, useCallback, useEffect } from "react";

export interface OverlayState {
  dataUrl: string | null;
  scale: number; // used for non-repeat image
  rotation: number; // degrees, applied to preview layer
  offsetX: number; // pan for non-repeat or backgroundPosition for tile
  offsetY: number;
  opacity: number;
  repeat?: "none" | "tile";
  patternScale?: number; // % scale for tiling background (100 = original)
  // Image Fill: when true, transfer paints the actual image region onto each
  // scale (averaged over the scale's footprint) instead of a single-pixel sample.
  imageFill?: boolean;
  // Inset from scale edge (0–50%): 0 = image covers edge-to-edge, larger = framed.
  boundaryPct?: number;
  // Optional shape hint for the in-panel test preview (matches active scale shape).
  testScaleShape?: "teardrop" | "leaf" | "round" | "kite";
}

interface Props {
  onApply: (overlay: OverlayState) => void;
  gridAspect?: number; // width/height ratio of the ring grid — preview matches this
  onClose?: () => void;
  // Hide the scale-specific subpanel (Image Fill on Scales / Test Scale Shape /
  // Image Boundary / scale test canvas). Use on ring-only pages like /designer.
  hideScaleControls?: boolean;
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
  imageFill: false,
  boundaryPct: 0,
  testScaleShape: "teardrop",
};

/* ------------------- component ------------------- */
export const ImageOverlayPanel: React.FC<Props> = ({ onApply, gridAspect, onClose, hideScaleControls = false }) => {
  // Preview height matches the ring grid's aspect ratio (width ÷ aspect).
  // Panel content width is 412px (440px - 14px padding × 2).
  const PREVIEW_W = 412;
  const previewH = gridAspect ? Math.max(120, Math.min(320, Math.round(PREVIEW_W / gridAspect))) : 240;
  const [overlay, setOverlay] = useState<OverlayState>(defaultOverlay);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Test preview canvas — shows a single scale outline with the image clipped
  // and inset by boundaryPct so the user can see exactly how much of the scale
  // the transferred image will cover.
  const testCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const testImgRef = useRef<HTMLImageElement | null>(null);

  /* ----- scale outline path (matches drawScaleFromExport / RingRenderer shapes) ----- */
  const buildScalePath = useCallback(
    (
      shape: "teardrop" | "leaf" | "round" | "kite",
      w: number,
      h: number,
      holeR: number,
    ): { outer: Path2D; hole: Path2D } => {
      const halfW = w / 2;
      const topY = -h * 0.08;
      const midY = h * 0.38;
      const tipY = h * 0.98;
      const outer = new Path2D();
      switch (shape) {
        case "leaf":
          outer.moveTo(0, topY);
          outer.bezierCurveTo(halfW * 0.95, h * 0.08, halfW * 1.05, midY, halfW * 0.34, h * 0.76);
          outer.bezierCurveTo(halfW * 0.18, h * 0.9, halfW * 0.08, h * 0.96, 0, tipY);
          outer.bezierCurveTo(-halfW * 0.08, h * 0.96, -halfW * 0.18, h * 0.9, -halfW * 0.34, h * 0.76);
          outer.bezierCurveTo(-halfW * 1.05, midY, -halfW * 0.95, h * 0.08, 0, topY);
          outer.closePath();
          break;
        case "round":
          outer.moveTo(0, topY);
          outer.bezierCurveTo(halfW * 0.95, topY, halfW * 1.05, h * 0.46, 0, tipY);
          outer.bezierCurveTo(-halfW * 1.05, h * 0.46, -halfW * 0.95, topY, 0, topY);
          outer.closePath();
          break;
        case "kite":
          outer.moveTo(0, topY);
          outer.lineTo(halfW * 0.96, h * 0.2);
          outer.lineTo(halfW * 0.56, h * 0.78);
          outer.lineTo(0, tipY);
          outer.lineTo(-halfW * 0.56, h * 0.78);
          outer.lineTo(-halfW * 0.96, h * 0.2);
          outer.closePath();
          break;
        case "teardrop":
        default:
          outer.moveTo(0, topY);
          outer.bezierCurveTo(halfW, h * 0.16, halfW, midY, 0, tipY);
          outer.bezierCurveTo(-halfW, midY, -halfW, h * 0.16, 0, topY);
          outer.closePath();
          break;
      }
      const hole = new Path2D();
      hole.arc(0, 0, holeR, 0, Math.PI * 2);
      return { outer, hole };
    },
    [],
  );

  /* ----- load the image once for the test preview (cached) ----- */
  useEffect(() => {
    if (!overlay.dataUrl) {
      testImgRef.current = null;
      return;
    }
    const im = new Image();
    im.onload = () => {
      testImgRef.current = im;
    };
    im.src = overlay.dataUrl;
  }, [overlay.dataUrl]);

  /* ----- redraw the test preview whenever any input that affects it changes ----- */
  useEffect(() => {
    const cvs = testCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const W = cvs.width;
    const H = cvs.height;
    ctx.clearRect(0, 0, W, H);

    // Dark backdrop so the scale shape reads against the panel chrome
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    // Scale geometry within the preview area
    const margin = 14;
    const scaleH = H - margin * 2;
    const scaleW = scaleH * 0.62; // teardrop aspect ratio
    const holeR = scaleW * 0.13;
    const cx = W / 2;
    const cy = margin;
    const shape = overlay.testScaleShape ?? "teardrop";
    const { outer, hole } = buildScalePath(shape, scaleW, scaleH, holeR);

    ctx.save();
    ctx.translate(cx, cy);

    // Outer shape filled with the unfilled scale color (light grey, matches app)
    ctx.fillStyle = "#cbd5e1";
    const baseShape = new Path2D();
    baseShape.addPath(outer);
    baseShape.addPath(hole);
    ctx.fill(baseShape, "evenodd");

    // Now build the inset path used to clip the image. Slider value = % of the
    // smaller of (scaleW, scaleH) to pull the boundary inward.
    const boundary = Math.max(0, Math.min(50, overlay.boundaryPct ?? 0));
    const insetPx = (Math.min(scaleW, scaleH) * boundary) / 100;
    const insetScaleW = Math.max(2, scaleW - insetPx * 2);
    const insetScaleH = Math.max(2, scaleH - insetPx * 2);
    const insetHoleR = Math.max(1, holeR + insetPx); // hole grows inward symmetrically
    const { outer: insetOuter, hole: insetHole } = buildScalePath(
      shape,
      insetScaleW,
      insetScaleH,
      insetHoleR,
    );

    // Draw image clipped to inset shape (only when an image is loaded).
    const img = testImgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      // Translate so the inset shape is centered at the same place as the outer
      const cyInset = (scaleH - insetScaleH) / 2;
      ctx.translate(0, cyInset);
      // Build a clip path that is the inset outer minus the inset hole
      const clip = new Path2D();
      clip.addPath(insetOuter);
      clip.addPath(insetHole);
      ctx.clip(clip, "evenodd");

      // Cover the inset shape's bounding box with the image (object-fit: cover-like).
      const bbW = insetScaleW;
      const bbH = insetScaleH;
      const iW = img.naturalWidth;
      const iH = img.naturalHeight;
      const scaleFit = Math.max(bbW / iW, bbH / iH);
      const drawW = iW * scaleFit;
      const drawH = iH * scaleFit;
      const dx = -drawW / 2;
      const dy = (bbH - drawH) / 2;
      ctx.globalAlpha = Math.max(0, Math.min(1, overlay.opacity));
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.restore();
    }

    // Re-stroke the original outer scale outline so the boundary is visible
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#e2e8f0";
    ctx.stroke(outer);
    ctx.stroke(hole);

    // Stroke the inset outline (the "image boundary") in cyan
    if (boundary > 0) {
      ctx.save();
      const cyInset = (scaleH - insetScaleH) / 2;
      ctx.translate(0, cyInset);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(34,211,238,0.95)";
      ctx.lineWidth = 1.2;
      ctx.stroke(insetOuter);
      ctx.stroke(insetHole);
      ctx.restore();
    }
    ctx.restore();

    // Label
    ctx.fillStyle = "rgba(226,232,240,0.7)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      boundary === 0 ? "Image fills scale edge-to-edge" : `Image inset ${boundary}%`,
      W / 2,
      H - 4,
    );
  }, [
    overlay.dataUrl,
    overlay.boundaryPct,
    overlay.opacity,
    overlay.testScaleShape,
    overlay.imageFill,
    buildScalePath,
  ]);

  /* ---------------- snapshot: capture visible preview as a new flat image ---------------- */
  const createSnapshot = useCallback((): Promise<OverlayState | null> => {
    if (!overlay.dataUrl) return Promise.resolve(null);

    // Tile mode: don't bake the image into a flat snapshot. The renderer
    // tiles the original image itself using overlay.repeat + patternScale +
    // offsetX/offsetY; snapshotting would collapse the repeat into a single
    // pre-positioned image and lose the tiling behavior. Pass the overlay
    // state through unchanged.
    if (overlay.repeat === "tile") {
      return Promise.resolve({ ...overlay });
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const iW = img.naturalWidth || img.width;
        const iH = img.naturalHeight || img.height;
        if (!iW || !iH) { resolve(null); return; }
        const dispH = PREVIEW_W * iH / iW;

        const canvas = document.createElement("canvas");
        canvas.width = PREVIEW_W;
        canvas.height = previewH;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
        if (!ctx) { resolve(null); return; }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, PREVIEW_W, previewH);

        // Replicate the CSS preview transform:
        // img is flex-centered → transform-origin = (PREVIEW_W/2, previewH/2) in viewport
        // CSS: translate(offsetX,offsetY) scale(scale) rotate(rotation)
        ctx.save();
        ctx.translate(PREVIEW_W / 2 + overlay.offsetX, previewH / 2 + overlay.offsetY);
        ctx.scale(overlay.scale, overlay.scale);
        ctx.rotate(overlay.rotation * (Math.PI / 180));
        ctx.drawImage(img, -PREVIEW_W / 2, -dispH / 2, PREVIEW_W, dispH);
        ctx.restore();

        resolve({
          dataUrl: canvas.toDataURL("image/jpeg", 0.95),
          scale: 1,
          rotation: 0,
          offsetX: 0,
          offsetY: 0,
          opacity: overlay.opacity,
          repeat: "none",
          patternScale: 100,
          imageFill: !!overlay.imageFill,
          boundaryPct: Math.max(0, Math.min(50, Number(overlay.boundaryPct ?? 0))),
          testScaleShape: overlay.testScaleShape ?? "teardrop",
        });
      };
      img.onerror = () => resolve(null);
      img.src = overlay.dataUrl!;
    });
  }, [overlay, previewH]);

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
        width: "min(440px, calc(100vw - 32px))",
        background: "rgba(17,24,39,0.97)",
        border: "1px solid #1f2937",
        borderRadius: 18,
        padding: 14,
        color: "#f3f4f6",
        boxShadow: "0 8px 25px rgba(0,0,0,.5)",
        zIndex: 9999,
        maxHeight: "90vh",
        overflowY: "auto",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#e5e7eb",
            margin: 0,
          }}
        >
          🖼️ Image Overlay
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, color: "#9ca3af", cursor: "pointer", fontSize: 14, padding: "4px 8px", lineHeight: 1 }}
            title="Close"
          >✕</button>
        )}
      </div>

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
            height: previewH,
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
                backgroundSize: `${overlay.patternScale ?? 100}% auto`,
                backgroundPosition: `${overlay.offsetX}px ${overlay.offsetY}px`,
                pointerEvents: "none",
              }}
            />
          )}

          {/* Transfer zone indicator — always the full preview area */}
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
            {/* Corner label */}
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
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  setOverlay((s) => ({
                    ...s,
                    // Number.isFinite guard: typing "0" with the old
                    // `Number(x) || 1` pattern jumped to 1; now it clamps
                    // through Math.max to the real minimum (0.1).
                    scale: Number.isFinite(n)
                      ? Math.max(0.1, Math.min(5, n))
                      : 1,
                  }));
                }}
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
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  setOverlay((s) => ({
                    ...s,
                    patternScale: Number.isFinite(n)
                      ? Math.max(10, Math.min(400, n))
                      : 100,
                  }));
                }}
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
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                setOverlay((s) => ({
                  ...s,
                  rotation: Number.isFinite(n) ? n : 0,
                }));
              }}
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
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                setOverlay((s) => ({
                  ...s,
                  // Real bug fixed here: the old `Number(x) || 0.8` pattern
                  // refused to accept opacity 0 (fully transparent), bouncing
                  // it back to 0.8. parseFloat + isFinite preserves zero.
                  opacity: Number.isFinite(n)
                    ? Math.max(0, Math.min(1, n))
                    : 0.8,
                }));
              }}
              style={numStyle}
            />
          </label>

          {/* ───── Scale Image Fill (new) ───── */}
          {!hideScaleControls && (
          <div
            style={{
              marginTop: 6,
              padding: 10,
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              display: "grid",
              gap: 8,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
              title="When on, transfer paints the actual image region onto each scale (averaged inside its outline) instead of a single-pixel color sample."
            >
              <span style={{ fontWeight: 600, color: "#cbd5e1" }}>
                Image Fill on Scales
              </span>
              <input
                type="checkbox"
                checked={!!overlay.imageFill}
                onChange={(e) =>
                  setOverlay((s) => ({ ...s, imageFill: e.target.checked }))
                }
              />
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>Test Scale Shape</span>
              <select
                value={overlay.testScaleShape ?? "teardrop"}
                onChange={(e) =>
                  setOverlay((s) => ({
                    ...s,
                    testScaleShape: e.target.value as
                      | "teardrop"
                      | "leaf"
                      | "round"
                      | "kite",
                  }))
                }
                style={{
                  background: "#1f2937",
                  color: "#f3f4f6",
                  borderRadius: 6,
                  border: "1px solid #374151",
                  padding: "3px 8px",
                  cursor: "pointer",
                }}
              >
                {/* Only Standard (internally "leaf") is selectable. */}
                <option value="leaf">Standard</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span title="0 = image fills the scale edge-to-edge. Higher values frame the image inside the scale.">
                  Image Boundary (%)
                </span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: "#94a3b8",
                    minWidth: 32,
                    textAlign: "right",
                  }}
                >
                  {Math.round(overlay.boundaryPct ?? 0)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={Math.round(overlay.boundaryPct ?? 0)}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  setOverlay((s) => ({
                    ...s,
                    boundaryPct: Number.isFinite(n)
                      ? Math.max(0, Math.min(50, n))
                      : 0,
                  }));
                }}
                style={{ width: "100%" }}
              />
            </label>

            {/* Test preview canvas — shows one scale with the image clipped */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: 4,
              }}
            >
              <canvas
                ref={testCanvasRef}
                width={220}
                height={220}
                style={{
                  width: 220,
                  height: 220,
                  borderRadius: 8,
                  background: "#0b1220",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
                aria-label="Test preview of image on a single scale with boundary inset"
              />
            </div>
          </div>
          )}
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
            onClick={async () => {
              const snapshot = await createSnapshot();
              if (snapshot) onApply(snapshot);
            }}
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
