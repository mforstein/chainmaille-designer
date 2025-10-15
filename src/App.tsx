// ===============
// src/App.tsx
// ===============
import React, { useState, useEffect, useMemo, useRef } from "react";
import "./index.css";
import "./ui/ui-grid.css";
import RingRenderer, { generateRings, RingRendererHandle } from "./components/RingRenderer";

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
const mmToIn = (mm: number) => mm / 25.4;

// ---------------- Draggable Panel (HEAD UI) ----------------
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

  // Touch + Mouse Drag
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

  // Snap back in view on resize
  useEffect(() => {
    const snapBack = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const next = {
        x: clamp(pos.x, 10 - w / 2, vw - w / 2 - 10),
        y: clamp(pos.y, 10, vh - h - 10),
      };
      setPos(next);
    };
    snapBack();
    window.addEventListener("resize", snapBack);
    return () => window.removeEventListener("resize", snapBack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          gap: 8,
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
          title="Collapse"
        >
          {collapsed ? "▢" : "—"}
        </button>
      </div>

      {!collapsed && <div>{children}</div>}
    </div>
  );
}

// ---------------- Icon Button (restore-legacy-ui UI) ----------------
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

  // Persist params & paint
  useEffect(() => {
    localStorage.setItem("cmd.params", JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem("cmd.paint", JSON.stringify(Array.from(paint.entries())));
  }, [paint]);

  // Rebuild rings on geometry-changing params only
  useEffect(() => {
    setRings(generateRings(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.rows, params.cols, params.innerDiameter, params.wireDiameter]);

  // Keep RingRenderer paint mode in sync
  useEffect(() => {
    rendererRef.current?.setPaintMode(paintMode);
  }, [paintMode]);

  // If paint turns off, also turn off eraser so resume is "paint"
  useEffect(() => {
    if (!paintMode && eraseMode) setEraseMode(false);
  }, [paintMode, eraseMode]);

  // Color usage memo
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

  // Deterministic lock setter
  const setLock = (locked: boolean) => {
    rendererRef.current?.forceLockRotation?.(locked);
    setRotationLocked(locked);
    if (!locked) {
      // Switching to 3D: turn off paint mode
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
      {/* Canvas (centered container works well for both UIs) */}
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

      {/* === restore-legacy-ui: Left toolbar (📷 ▶) === */}
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
                  // Lock to 2D but keep current camera position
                  setLock(true);
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

            <IconBtn
              tooltip={rotationLocked ? "Unlock 3D Rotation" : "Lock to Flat 2D"}
              onClick={() => setLock(!rotationLocked)}
            >
              {rotationLocked ? "🔒" : "🔓"}
            </IconBtn>

            <IconBtn tooltip="Clear Paint" onClick={doClearPaint}>🧹</IconBtn>
          </div>
        )}

        {/* Controls subpanel */}
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

      {/* === HEAD UI: Draggable Color Palette Panel === */}
 {paintMode && (
  <DraggablePanel
    id=""
    title=""
    defaultPosition={{ x: 20, y: window.innerHeight - 240 }}
  >
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        color: "#ddd",
        fontSize: 14,
      }}
    >

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: 6,
        }}
      >
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
              transition: "transform 0.1s ease, border 0.2s ease",
              transform: activeColor === hex ? "scale(1.15)" : "scale(1.0)",
            }}
            title={hex}
          />
        ))}
      </div>


    </div>
  </DraggablePanel>
)}

    </div>
  );
}

// =========================
// Print / Report Function
// =========================
function printReport() {
  // Load stored parameters
  const params = JSON.parse(localStorage.getItem("cmd.params") || "{}");

  // Explicitly type the paint map so TypeScript knows its contents
  const paint = new Map<string, string | null>(
    JSON.parse(localStorage.getItem("cmd.paint") || "[]")
  );

  // Track how many times each color is used
  const colorUsage: Record<string, number> = {};

  for (const [, color] of paint.entries()) {
    if (!color) continue;
    colorUsage[color] = (colorUsage[color] || 0) + 1;
  }

  // Generate the HTML for the color usage table
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

  // Create printable popup
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