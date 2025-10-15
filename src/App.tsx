


// ===============
// src/App.tsx
// ===============
import React, { useState, useEffect, useMemo, useRef } from "react";
import "./index.css";
import "./ui/ui-grid.css";
import RingRenderer, { generateRings, RingRendererHandle } from "./components/RingRenderer";
export type SupplierId = "cmj" | "trl" | "mdz";

type ColorMode = "solid" | "checker";
type Unit = "mm" | "in";

interface Params {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
  overlapX: number;
  overlapY: number;
  colorMode: ColorMode;
  ringColor: string;
  altColor: string;
  bgColor: string;
  supplier: SupplierId;
  ringSpec: string;
  unit: Unit;
}

type PaintMap = Map<string, string | null>;

const IconBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tooltip?: string }
> = ({ active, tooltip, children, ...rest }) => (
  <div
    className="tooltip-parent"
    style={{
      position: "relative",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      width: 40,
      height: 40,
    }}
  >
    <button
      {...rest}
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        background: active ? "#2563eb" : "#1f2937",
        color: active ? "white" : "#d1d5db",
        border: "1px solid #111827",
        boxShadow: "0 2px 10px rgba(0,0,0,.35)",
        cursor: "pointer",
        userSelect: "none",
        padding: 0,
        boxSizing: "border-box",
      }}
      aria-label={tooltip}
      title={tooltip}
    >
      {children}
    </button>
  </div>
);

export default function App() {
  const [params, setParams] = useState<Params>(() => {
    const saved = localStorage.getItem("cmd.params");
    return (
      (saved && JSON.parse(saved)) || {
        rows: 20,
        cols: 20,
        innerDiameter: 6.35,
        wireDiameter: 1.6,
        overlapX: 0.3,
        overlapY: 0.3,
        colorMode: "solid",
        ringColor: "#C9C9C9",
        altColor: "#B2B2B2",
        bgColor: "#0F1115",
        supplier: "cmj",
        ringSpec: "ID 6.35 mm / WD 1.6 mm (AR≈5.0)",
        unit: "mm",
      }
    );
  });

  const [rings, setRings] = useState(() => generateRings(params));
  const [paint, setPaint] = useState<PaintMap>(() => {
    const saved = localStorage.getItem("cmd.paint");
    return saved ? new Map(JSON.parse(saved)) : new Map();
  });

  const [paintMode, setPaintMode] = useState(true);
  const [eraseMode, setEraseMode] = useState(false);
  const [rotationLocked, setRotationLocked] = useState(true);
  const [activeColor, setActiveColor] = useState("#8F00FF");
  const [activeMenu, setActiveMenu] = useState<"camera" | "controls" | null>(null);

  const rendererRef = useRef<RingRendererHandle | null>(null);

  useEffect(() => {
    localStorage.setItem("cmd.params", JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem("cmd.paint", JSON.stringify(Array.from(paint.entries())));
  }, [paint]);
  
// We intentionally limit this effect to geometry-changing params only.
 
useEffect(() => {
  setRings(generateRings(params));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [params.rows, params.cols, params.innerDiameter, params.wireDiameter]);

  useEffect(() => {
    rendererRef.current?.setPaintMode(paintMode);
  }, [paintMode]);

  // If paint turns off, also turn off eraser so resume is "paint", not "erase".
  useEffect(() => {
    if (!paintMode && eraseMode) setEraseMode(false);
  }, [paintMode, eraseMode]);

  const _colourUsage = useMemo(() => {
    const map = new Map<string, number>();
    for (const [, v] of paint.entries()) {
      if (!v) continue;
      map.set(v, (map.get(v) || 0) + 1);
    }
    return [...map.entries()]
      .map(([hex, count]) => ({ hex, count }))
      .sort((a, b) => b.count - a.count);
  }, [paint]);

  // ---- Deterministic lock setter (fixes reversed behavior) ----
  const setLock = (locked: boolean) => {
    rendererRef.current?.forceLockRotation?.(locked);
    setRotationLocked(locked);
    if (!locked) {
      // Unlocking to 3D -> turn off paint mode (requested)
      setPaintMode(false);
    }
  };

  const toggleExclusive = (menu: "camera" | "controls") =>
    setActiveMenu((prev) => (prev === menu ? null : menu));

  const doZoomIn = () => rendererRef.current?.zoomIn();
  const doZoomOut = () => rendererRef.current?.zoomOut();
  const doReset = () => rendererRef.current?.resetView();
  const doClearPaint = () => rendererRef.current?.clearPaint();

  // Eraser binds to base ring color
  const effectiveColor = eraseMode ? params.ringColor : activeColor;

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background:
          "radial-gradient(#2A2C34 1px, transparent 1px) 0 0 / 22px 22px, radial-gradient(#1B1D22 1px, transparent 1px) 11px 11px / 22px 22px, #0E0F12",
      }}
    >
      {/* Canvas */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1,
        }}
      >
        <RingRenderer
          ref={rendererRef}
          key={`${params.rows}x${params.cols}`}
          rings={rings}
          params={params}
          paint={paint}
          setPaint={setPaint}
          initialPaintMode={paintMode}
          initialEraseMode={eraseMode}
          initialRotationLocked={rotationLocked}
          activeColor={effectiveColor}
        />
      </div>

      {/* Left toolbar (camera + triangle) */}
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 20,
          zIndex: 30,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
          background: "rgba(17,24,39,.9)",
          border: "1px solid rgba(0,0,0,.6)",
          boxShadow: "0 8px 30px rgba(0,0,0,.35)",
          borderRadius: 14,
          padding: 10,
        }}
      >
        <IconBtn tooltip="Camera Tools" active={activeMenu === "camera"} onClick={() => toggleExclusive("camera")}>
          📷
        </IconBtn>

        <IconBtn tooltip="Controls Menu" active={activeMenu === "controls"} onClick={() => toggleExclusive("controls")}>
          ▶
        </IconBtn>

        {/* Camera subpanel */}
        {activeMenu === "camera" && (
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "#0f172a",
              border: "1px solid #0b1020",
              padding: 8,
              borderRadius: 12,
              width: 52,
              alignItems: "center",
            }}
          >
            <IconBtn
              tooltip="Paint Mode"
              active={paintMode}
              onClick={() => {
                const next = !paintMode;
                setPaintMode(next);
                if (next) {
                  // Do NOT close palette and DO NOT recenter
                  setLock(true); // lock to 2D, keep camera where it is
                }
              }}
            >
              🎨
            </IconBtn>

            <IconBtn tooltip="Erase Mode" active={eraseMode} onClick={() => setEraseMode((v) => !v)}>
              🧽
            </IconBtn>

            <IconBtn tooltip="Zoom In" onClick={doZoomIn}>＋</IconBtn>
            <IconBtn tooltip="Zoom Out" onClick={doZoomOut}>－</IconBtn>
            <IconBtn tooltip="Reset View" onClick={doReset}>↺</IconBtn>

            {/* Correct emoji + tooltip semantics */}
            <IconBtn
              tooltip={rotationLocked ? "Unlock 3D Rotation" : "Lock to Flat 2D"}
              onClick={() => setLock(!rotationLocked)}
            >
              {rotationLocked ? "🔒" : "🔓"}
            </IconBtn>

            <IconBtn tooltip="Clear Paint" onClick={doClearPaint}>🧹</IconBtn>
          </div>
        )}

        {/* Controls subpanel (triangle) */}
        {activeMenu === "controls" && (
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "#0f172a",
              border: "1px solid #0b1020",
              padding: 10,
              borderRadius: 12,
              width: 180,
              color: "#ddd",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: "bold" }}>Grid Size</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="number"
                value={params.cols}
                min={1}
                max={200}
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val)) return;
                  if (val > 200) val = 200;
                  const updated = { ...params, cols: val };
                  setParams(updated);
                  setRings(generateRings(updated));
                }}
                style={{ width: "50%" }}
              />
              <input
                type="number"
                value={params.rows}
                min={1}
                max={200}
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val)) return;
                  if (val > 200) val = 200;
                  const updated = { ...params, rows: val };
                  setParams(updated);
                  setRings(generateRings(updated));
                }}
                style={{ width: "50%" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Color palette (only when painting; no text) */}
      {paintMode && (
        <div
          style={{
            position: "fixed",
            left: 20,
            bottom: 20,
            zIndex: 25,
            background: "rgba(18,20,26,0.95)",
            borderRadius: 12,
            padding: 10,
            width: 260,
            boxShadow: "0 6px 24px rgba(0,0,0,.35)",
            border: "1px solid rgba(0,0,0,.6)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
            {[
              "#F2F2F2", "#BFBFBF", "#7A7A7A", "#0C0C0C",
              "#FFD700", "#E38B29", "#C93F00",
              "#4593FF", "#1E5AEF", "#28A745", "#007F5F",
              "#B069FF", "#8F00FF", "#FF3B81",
            ].map((hex) => (
              <div
                key={hex}
                onClick={() => setActiveColor(hex)}
                style={{
                  background: hex,
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  border: activeColor === hex ? "2px solid white" : "1px solid #333",
                  cursor: "pointer",
                  transform: activeColor === hex ? "scale(1.15)" : "scale(1.0)",
                  transition: "transform 0.1s ease, border 0.2s ease",
                }}
                title={hex}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}