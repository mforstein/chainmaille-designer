// src/App.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./index.css";
import "./ui/ui-grid.css";
import RingRenderer, { generateRings } from "./components/RingRenderer";

// =========================
// Types
// =========================
export type SupplierId = "cmj" | "trl" | "mdz";
export type ColorMode = "solid" | "checker";
export type Unit = "mm" | "in";

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

// =========================
// Helpers
// =========================
const keyAt = (r: number, c: number) => `${r},${c}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mmToIn = (mm: number) => mm / 25.4;

// =========================
// Draggable Panel Component
// =========================
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

  // === Touch + Mouse Drag Support ===
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
    setPos({ x: clientX - offset.current.x, y: clientY - offset.current.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY);
  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  };

  // Save position persistently
  useEffect(() => {
    localStorage.setItem(`panel-pos-${id}`, JSON.stringify(pos));
  }, [pos]);

  // Ensure panels snap back into view if off-screen
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
  }, []);

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 20,
        background: "rgba(18,20,26,0.95)",
        borderRadius: 8,
        padding: 10,
        width: 260,
        cursor: dragging ? "grabbing" : "default",
        touchAction: "none",
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onTouchMove={handleTouchMove}
      onTouchEnd={stopDrag}
    >
      {/* Header with drag + collapse controls */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#ddd",
          fontWeight: "bold",
          marginBottom: 8,
          userSelect: "none",
        }}
      >
        {title}
        <button
          className={`icon-btn ${collapsed ? "collapsed" : ""}`}
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            color: "#ddd",
            cursor: "pointer",
            fontSize: 18,
            padding: 0,
          }}
        />
      </div>

      {!collapsed && <div>{children}</div>}
    </div>
  );
}
// =========================
// Main App
// =========================
export default function App() {
  // === Chainmail parameters ===
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

  // === Canvas & UI state ===
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [paintMode, setPaintMode] = useState(true);
  const [eraseMode, setEraseMode] = useState(false);
  const [activeColor, setActiveColor] = useState("#8F00FF");

  // Persist params & paint
  useEffect(() => {
    localStorage.setItem("cmd.params", JSON.stringify(params));
  }, [params]);
  useEffect(() => {
    localStorage.setItem("cmd.paint", JSON.stringify(Array.from(paint.entries())));
  }, [paint]);

  // Regenerate weave grid
  useEffect(() => {
    setRings(generateRings(params));
  }, [params.rows, params.cols, params.innerDiameter, params.wireDiameter]);

  // Reset tools
  const resetGrid = () => setPaint(new Map());
  const resetColours = () => setPaint(new Map());

  // Keyboard shortcut (space = toggle rotation)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setRotationEnabled((r) => !r);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // === Colour summary ===
  const colourUsage = useMemo(() => {
    const map = new Map<string, number>();
    for (const [, v] of paint.entries()) {
      if (!v) continue;
      map.set(v, (map.get(v) || 0) + 1);
    }
    return [...map.entries()]
      .map(([hex, count]) => ({ hex, count }))
      .sort((a, b) => b.count - a.count);
  }, [paint]);

  // === Layout ===
  return (
    <div
      className="chainmail-stage"
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background:
          "radial-gradient(#2A2C34 1px, transparent 1px) 0 0 / 22px 22px, radial-gradient(#1B1D22 1px, transparent 1px) 11px 11px / 22px 22px, #0E0F12",
      }}
    >
      {/* === Canvas Center === */}
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
          rings={rings}
          params={params}
          paint={paint}
          setPaint={setPaint}
          paintMode={paintMode}
          eraseMode={eraseMode}
          activeColor={activeColor}
          rotationEnabled={rotationEnabled}
        />
      </div>

      {/* === Rotation Toggle === */}
      <button
        id="rotateToggle"
        onClick={() => setRotationEnabled((r) => !r)}
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          zIndex: 50,
          background: rotationEnabled ? "#666" : "#222",
          color: "#fff",
          border: "1px solid #444",
          borderRadius: 6,
          padding: "6px 10px",
          cursor: "pointer",
        }}
      >
        {rotationEnabled ? "Lock Rotation" : "Rotate / Pan"}
      </button>

      {/* === Tools Panel === */}
      <DraggablePanel id="tools" title="Tools" defaultPosition={{ x: 20, y: window.innerHeight - 240 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => {
              setPaintMode(true);
              setEraseMode(false);
            }}
          >
            🎨 Paint
          </button>
          <button
            onClick={() => {
              setEraseMode(true);
              setPaintMode(false);
            }}
          >
            🧽 Erase
          </button>
          <button onClick={resetColours}>♻️ Reset</button>
        </div>

        <div style={{ fontWeight: "bold", marginBottom: 6 }}>Palette</div>
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
                width: 24,
                height: 24,
                borderRadius: 4,
                border: activeColor === hex ? "2px solid white" : "1px solid #333",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </DraggablePanel>

      {/* === Controls Panel === */}
      <DraggablePanel id="controls" title="Controls" defaultPosition={{ x: window.innerWidth - 260, y: 20 }}>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Grid Size</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              value={params.cols}
              onChange={(e) => setParams({ ...params, cols: parseInt(e.target.value) })}
              style={{ width: "50%" }}
            />
            <input
              type="number"
              value={params.rows}
              onChange={(e) => setParams({ ...params, rows: parseInt(e.target.value) })}
              style={{ width: "50%" }}
            />
          </div>
        </div>
      </DraggablePanel>
        {/* === Pattern Info Panel === */}
      <DraggablePanel id="info" title="Pattern Info" defaultPosition={{ x: window.innerWidth - 280, y: 320 }}>
        <div style={{ display: "grid", gap: 6, color: "#ccc", fontSize: 13 }}>
          <div>
            <b>Colours Used</b>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {colourUsage.length === 0 && <div style={{ opacity: 0.6 }}>None</div>}
            {colourUsage.map((u) => (
              <div
                key={u.hex}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    background: u.hex,
                    borderRadius: 2,
                    border: "1px solid #444",
                  }}
                />
                <span style={{ opacity: 0.8 }}>{u.hex}</span>
                <span style={{ marginLeft: "auto" }}>{u.count}</span>
              </div>
            ))}
          </div>

          <div style={{ height: 6 }} />
          <div>
            <b>Pattern Size</b>
          </div>
          <div>
            {params.cols} × {params.rows} rings
          </div>

          <div style={{ height: 6 }} />
          <div style={{ fontWeight: "bold" }}>Ring Spec</div>
          <div style={{ opacity: 0.9 }}>{params.ringSpec}</div>

          <div style={{ height: 6 }} />
          <div style={{ fontWeight: "bold" }}>Supplier</div>
          <div style={{ opacity: 0.9 }}>{params.supplier.toUpperCase()}</div>

          <button
            onClick={() => printReport()}
            style={{
              marginTop: 8,
              background: "#222",
              color: "#fff",
              border: "1px solid #444",
              borderRadius: 4,
              padding: "6px",
              cursor: "pointer",
            }}
          >
            🖨️ Print Report
          </button>
        </div>
      </DraggablePanel>
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

  const totalRings = params.rows * params.cols;

  // Create printable popup
  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.document.write(`
    <html>
    <head><title>Chainmaille Pattern Report</title></head>
    <body style="font-family:system-ui;padding:20px;color:#111;">
      <h2>Chainmaille Pattern Report</h2>
      <p><b>Grid:</b> ${params.cols} × ${params.rows}</p>
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