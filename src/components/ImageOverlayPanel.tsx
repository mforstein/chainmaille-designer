import React, { useRef, useState } from "react";

export interface OverlayState {
  dataUrl: string | null;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
  repeat?: "none" | "tile";
  patternScale?: number; // percentage for tiling (e.g., 100 = original size)
}

interface Props {
  onApply: (overlay: OverlayState) => void;
}

// =========================
// 🔧 Default State
// =========================
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

// =========================
// 🖼️ Image Overlay Panel
// =========================
export const ImageOverlayPanel: React.FC<Props> = ({ onApply }) => {
  const [overlay, setOverlay] = useState<OverlayState>(defaultOverlay);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // =========================
  // 📁 File Upload Handling
  // =========================
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
  };

  // =========================
  // 🎨 UI Rendering
  // =========================
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

      {/* Upload Zone */}
      <div
        style={{
          border: "2px dashed #374151",
          borderRadius: 10,
          padding: 12,
          textAlign: "center",
          marginBottom: 16,
        }}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ width: "100%", cursor: "pointer" }}
        />
        <p style={{ fontSize: 12, color: "#9ca3af" }}>
          Select or drop an image to overlay
        </p>
      </div>

      {/* Centered Image Preview with Pan + Zoom */}
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
          }}
          onWheel={(e) => {
            e.preventDefault();
            const nextScale = overlay.scale * (e.deltaY < 0 ? 1.1 : 0.9);
            setOverlay((s) => ({
              ...s,
              scale: Math.min(5, Math.max(0.1, nextScale)),
            }));
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
          }}
          onMouseMove={(e) => {
            if (!dragging || !dragStart) return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            setOverlay((s) => ({
              ...s,
              offsetX: s.offsetX + dx,
              offsetY: s.offsetY + dy,
            }));
            setDragStart({ x: e.clientX, y: e.clientY });
          }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
        >
          <img
            ref={imgRef}
            src={overlay.dataUrl}
            alt="Overlay Preview"
            style={{
              position: "absolute",
              transform: `
                translate(${overlay.offsetX}px, ${overlay.offsetY}px)
                scale(${overlay.scale})
                rotate(${overlay.rotation ?? 0}deg)
              `,
              transformOrigin: "center",
              width: "100%",
              height: "auto",
              objectFit: overlay.repeat === "tile" ? "cover" : "contain",
              opacity: overlay.opacity ?? 1,
              transition: dragging ? "none" : "transform 0.2s ease",
              backgroundImage:
                overlay.repeat === "tile"
                  ? `url(${overlay.dataUrl})`
                  : undefined,
              backgroundRepeat: "repeat",
              backgroundSize:
                overlay.repeat === "tile"
                  ? `${overlay.patternScale ?? 100}% auto`
                  : undefined,
            }}
          />
        </div>
      )}

      {/* Repeat Mode */}
      {overlay.dataUrl && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          <label style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Repeat Mode:</span>
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

          {overlay.repeat === "tile" && (
            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Pattern Scale (%):</span>
              <input
                type="number"
                min={10}
                max={400}
                step={5}
                value={overlay.patternScale ?? 100}
                onChange={(e) =>
                  setOverlay((s) => ({
                    ...s,
                    patternScale: parseFloat(e.target.value),
                  }))
                }
                style={{
                  width: 70,
                  background: "#111827",
                  color: "#f9fafb",
                  border: "1px solid #374151",
                  borderRadius: 6,
                  textAlign: "right",
                  padding: "3px 6px",
                }}
              />
            </label>
          )}
        </div>
      )}

      {/* Transfer Button */}
      {overlay.dataUrl && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 16,
          }}
        >
          <button
            onClick={() => onApply(overlay)}
            style={{
              background: "#10b981",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            📤 Transfer to Rings
          </button>
        </div>
      )}
    </div>
  );
};