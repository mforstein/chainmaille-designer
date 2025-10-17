// ===============
// src/App.tsx
// ===============
import React, { useState, useEffect, useMemo, useRef } from "react";
import "./index.css";
import "./ui/ui-grid.css";
import RingRenderer, { generateRings, RingRendererHandle } from "./components/RingRenderer";
import { UNIVERSAL_COLORS, MATERIALS } from "./utils/colors";

// ---------------- Types ----------------
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

// ---------------- Helpers ----------------
const keyAt = (r: number, c: number) => `${r},${c}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------- Minimal Draggable Pill (no header, no minus/square) ----------
function DraggablePill({
  id,
  defaultPosition = { x: 20, y: 20 },
  children,
}: {
  id: string;
  defaultPosition?: { x: number; y: number };
  children: React.ReactNode;
}) {
  const [pos, setPos] = React.useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem(`pill-pos-${id}`);
    return saved ? JSON.parse(saved) : defaultPosition;
  });
  const draggingRef = React.useRef(false);
  const offsetRef = React.useRef({ x: 0, y: 0 });

  const start = (clientX: number, clientY: number) => {
    draggingRef.current = true;
    offsetRef.current = { x: clientX - pos.x, y: clientY - pos.y };
  };
  const move = (clientX: number, clientY: number) => {
    if (!draggingRef.current) return;
    setPos({ x: clientX - offsetRef.current.x, y: clientY - offsetRef.current.y });
  };
  const stop = () => { draggingRef.current = false; };

  React.useEffect(() => {
    localStorage.setItem(`pill-pos-${id}`, JSON.stringify(pos));
  }, [id, pos]);

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 30,
        // outer pill container look (matches “second/third image”)
        background: "rgba(17,24,39,.92)",
        border: "1px solid rgba(0,0,0,.6)",
        boxShadow: "0 12px 40px rgba(0,0,0,.45)",
        borderRadius: 24,
        padding: 12,
        userSelect: "none",
      }}
      onMouseDown={(e) => start(e.clientX, e.clientY)}
      onMouseMove={(e) => move(e.clientX, e.clientY)}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => {
        const t = e.touches[0]; start(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0]; move(t.clientX, t.clientY);
      }}
      onTouchEnd={stop}
    >
      {children}
    </div>
  );
}
// ---------------- Draggable Panel ----------------
function DraggablePanel({
  id,
  title,
  children,
  defaultPosition = { x: 0, y: 0 },
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultPosition?: { x: number; y: number };
}) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem(`panel-pos-${id}`);
    return saved ? JSON.parse(saved) : defaultPosition;
  });
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const startDrag = (clientX: number, clientY: number) => {
    setDragging(true);
    offset.current = { x: clientX - pos.x, y: clientY - pos.y };
  };

  const handleMouseDown = (e: React.MouseEvent) => startDrag(e.clientX, e.clientY);
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  };

  const stopDrag = () => setDragging(false);

  const handleMove = (clientX: number, clientY: number) => {
    if (!dragging) return;
    setPos({
      x: clientX - offset.current.x,
      y: clientY - offset.current.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);
  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  };

  useEffect(() => {
    localStorage.setItem(`panel-pos-${id}`, JSON.stringify(pos));
  }, [id, pos]);

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 40,
        padding: 10,
        background: "rgba(17,24,39,.95)",
        borderRadius: 12,
        color: "#ddd",
        border: "1px solid rgba(0,0,0,.6)",
        boxShadow: "0 8px 30px rgba(0,0,0,.35)",
        minWidth: 240,
        userSelect: "none",
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onTouchMove={handleTouchMove}
      onTouchEnd={stopDrag}
    >
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          cursor: "grab",
          fontWeight: 700,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>{title}</span>
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "#1f2937",
            color: "#d1d5db",
            border: "1px solid #111827",
            cursor: "pointer",
          }}
          aria-label="Collapse panel"
        >
          {collapsed ? "▢" : "—"}
        </button>
      </div>

      {!collapsed && <div>{children}</div>}
    </div>
  );
}

// ---------------- Icon Button ----------------
const IconBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tooltip?: string }
> = ({ active, tooltip, children, ...rest }) => (
  <div style={{ position: "relative", width: 40, height: 40 }}>
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
      }}
      title={tooltip}
    >
      {children}
    </button>
  </div>
);

// ---------------- Main App ----------------
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
        ringColor: MATERIALS.find((m) => m.name === "Aluminum")?.hex || "#C0C0C0",
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
  const [showMaterialPalette, setShowMaterialPalette] = useState(false);

  const rendererRef = useRef<RingRendererHandle | null>(null);

  useEffect(() => {
    localStorage.setItem("cmd.params", JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem("cmd.paint", JSON.stringify(Array.from(paint.entries())));
  }, [paint]);

useEffect(() => {
  setRings(generateRings(params));
}, [
  params.rows,
  params.cols,
  params.innerDiameter,
  params.wireDiameter,
  params.ringColor, // ✅ re-render when base material changes
]);

  useEffect(() => {
    rendererRef.current?.setPaintMode(paintMode);
  }, [paintMode]);

  useEffect(() => {
    if (!paintMode && eraseMode) setEraseMode(false);
  }, [paintMode, eraseMode]);

  const setLock = (locked: boolean) => {
    rendererRef.current?.forceLockRotation?.(locked);
    setRotationLocked(locked);
    if (!locked) setPaintMode(false);
  };

  const toggleExclusive = (menu: "camera" | "controls") =>
    setActiveMenu((prev) => (prev === menu ? null : menu));

  const doZoomIn = () => rendererRef.current?.zoomIn();
  const doZoomOut = () => rendererRef.current?.zoomOut();
  const doReset = () => rendererRef.current?.resetView();
const doClearPaint = () => {
  rendererRef.current?.clearPaint();
  setPaint(new Map());
};
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
      {/* === Canvas === */}
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
          key={`${params.rows}x${params.cols}-${params.ringColor}`}
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

{/* === Left Toolbar (compact pill ➜ expands to tall column) === */}
<DraggablePill id="camera-pill" defaultPosition={{ x: 20, y: 20 }}>
  {/* Compact pill (always visible) */}
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 14,
      alignItems: "center",
      width: 76,
      padding: 10,
      background: "#0f172a",
      border: "1px solid #0b1020",
      borderRadius: 20,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
    }}
  >
    <IconBtn
      tooltip="Camera Tools"
      active={activeMenu === "camera"}
      onClick={(e) => { e.stopPropagation(); toggleExclusive("camera"); }}
    >
      📷
    </IconBtn>

    <IconBtn
      tooltip="Controls Menu"
      active={activeMenu === "controls"}
      onClick={(e) => { e.stopPropagation(); toggleExclusive("controls"); }}
    >
      ▶
    </IconBtn>
  </div>

  {/* --- Camera Tools Menu --- */}
  {activeMenu === "camera" && (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "center",
        width: 76,
        padding: 14,
        background: "#0b1324",
        border: "1px solid #0b1020",
        borderRadius: 20,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <IconBtn tooltip="Paint Mode" active={paintMode}
        onClick={() => {
          const next = !paintMode;
          setPaintMode(next);
          if (next) setLock(true);
        }}
      >
        🎨
      </IconBtn>

      <IconBtn tooltip="Erase Mode" active={eraseMode}
        onClick={() => setEraseMode((v) => !v)}
      >
        🧽
      </IconBtn>

      <IconBtn tooltip="Zoom In" onClick={doZoomIn}>＋</IconBtn>
      <IconBtn tooltip="Zoom Out" onClick={doZoomOut}>－</IconBtn>
      <IconBtn tooltip="Reset View" onClick={doReset}>↺</IconBtn>

      <IconBtn
        tooltip={rotationLocked ? "Unlock 3D Rotation" : "Lock to Flat 2D"}
        onClick={() => setLock(!rotationLocked)}
      >
        {rotationLocked ? "🔒" : "🔓"}
      </IconBtn>

      <IconBtn tooltip="Clear Paint" onClick={doClearPaint}>🧹</IconBtn>

      <IconBtn
        tooltip="Select Base Material"
        onClick={() => setShowMaterialPalette((v) => !v)}
      >
        🧲
      </IconBtn>

      <div
        style={{
          fontSize: 12,
          color: "#d8dee9",
          marginTop: 6,
          textAlign: "center",
          width: "100%",
          userSelect: "none",
          lineHeight: 1.15,
        }}
      >
        Base:
        <br />
        {MATERIALS.find((m) => m.hex === params.ringColor)?.name || "Custom"}
      </div>
    </div>
  )}

  {/* --- Controls Menu --- */}
  {activeMenu === "controls" && (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 200,
        background: "#0b1324",
        border: "1px solid #0b1020",
        borderRadius: 16,
        padding: 12,
        color: "#ddd",
        fontSize: 13,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 700 }}>Grid Size</div>
      <div style={{ display: "flex", gap: 8 }}>
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
</DraggablePill>
{/* === Draggable Color Palette (no title bar, compact) === */}
{paintMode && (
  <DraggablePill
    id="color-palette"
    defaultPosition={{ x: 20, y: window.innerHeight - 260 }}
  >
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        background: "rgba(17,24,39,0.96)",
        border: "1px solid rgba(0,0,0,0.6)",
        borderRadius: 14,
        padding: 8,
        boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
        userSelect: "none",
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: 5,
        }}
      >
        {UNIVERSAL_COLORS.map((hex) => (
          <div
            key={hex}
            onClick={() => setActiveColor(hex)}
            style={{
              background: hex,
              width: 22, // 30% smaller than 32px
              height: 22,
              borderRadius: 5,
              border:
                activeColor === hex ? "2px solid white" : "1px solid #333",
              cursor: "pointer",
              transition: "transform 0.1s ease, border 0.2s ease",
              transform: activeColor === hex ? "scale(1.15)" : "scale(1.0)",
            }}
            title={hex}
          />
        ))}
      </div>
    </div>
  </DraggablePill>
)}

{/* --- Material Palette --- */}
{showMaterialPalette && (
  <DraggablePill id="material-selector" defaultPosition={{ x: 120, y: 80 }}>
    <div
      style={{
        background: "rgba(17,24,39,0.96)",
        border: "1px solid rgba(0,0,0,0.6)",
        borderRadius: 14,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: "0 8px 22px rgba(0,0,0,.45)",
        userSelect: "none",
        minWidth: 120,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: "#ddd" }}>
        Base Material
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
        }}
      >
        {MATERIALS.map((mat) => (
          <div
            key={mat.name}
            onClick={() => {
              setParams((prev) => ({ ...prev, ringColor: mat.hex }));
              setShowMaterialPalette(false);
            }}
            title={mat.name}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: mat.hex === "transparent" ? "none" : mat.hex,
              border:
                params.ringColor === mat.hex
                  ? "2px solid white"
                  : "1px solid #444",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 11,
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            {mat.hex === "transparent" ? "×" : ""}
          </div>
        ))}
      </div>
    </div>
  </DraggablePill>
)}
    </div>
  );
}

// =========================
// Print / Report Function
// =========================
function printReport() {
  const params = JSON.parse(localStorage.getItem("cmd.params") || "{}");
  const paint = new Map<string, string | null>(
    JSON.parse(localStorage.getItem("cmd.paint") || "[]")
  );
  const colorUsage: Record<string, number> = {};
  for (const [, color] of paint.entries()) {
    if (!color) continue;
    colorUsage[color] = (colorUsage[color] || 0) + 1;
  }
  const usageHTML = Object.entries(colorUsage)
    .map(
      ([hex, count]) => `
      <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <span style="width:14px;height:14px;border-radius:3px;border:1px solid #000;display:inline-block;background:${hex}"></span>
        <span>${hex}</span>
        <span style="margin-left:auto">${count}</span>
      </div>`
    )
    .join("");
  const totalRings = (params.rows || 0) * (params.cols || 0);
  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.document.write(`
    <html>
    <head><title>Chainmaille Pattern Report</title></head>
    <body style="font-family:system-ui;padding:20px;color:#111;">
      <h2>Chainmaille Pattern Report</h2>
      <p><b>Grid:</b> ${params.cols ?? "—"} × ${params.rows ?? "—"}</p>
      <p><b>Supplier:</b> ${params.supplier || "—"}</p>
      <p><b>Ring Spec:</b> ${params.ringSpec || "—"}</p>
      <p><b>Total Rings:</b> ${totalRings}</p>
      <h3>Colours Used</h3>
      ${usageHTML || "<i>No painted colours.</i>"}
    </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
}