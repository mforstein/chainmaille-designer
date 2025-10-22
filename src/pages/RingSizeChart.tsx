// ========================================
// src/pages/RingSizeChart.tsx
// ========================================
import React, { useMemo, useState, useRef, useEffect } from "react";
import RingRenderer, {
  computeRingVarsFixedID,
  generateRingsChart,
} from "../components/RingRenderer";
import { DraggableCompassNav, DraggablePill } from "../App";

// ========================================
// === Constants ===
// ========================================
const ID_OPTIONS = [
  "7/64", "1/8", "9/64", "5/32", "3/16",
  "1/4", "5/16", "3/8", "7/16", "1/2",
];
const WIRE_OPTIONS = [0.9, 1.2, 1.6, 2.0, 2.5, 3.0]; // mm
const INCH_MM = 25.4; // 1 inch = 25.4 mm

// ========================================
// === Main Component ===
// ========================================
export default function RingSizeChart() {
  const [paint, setPaint] = useState(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [showCompass, setShowCompass] = useState(false);

  // Responsive scaling
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scaleFactor = Math.min(w / 1200, h / 800);
      setScale(scaleFactor);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ========================================
  // === Generate chart ring data ===
  // ========================================
  const { layout, chartWidth, chartHeight } = useMemo(() => {
    const rings: any[] = [];
    const cellSize = INCH_MM;
    const offsetX = -(ID_OPTIONS.length * cellSize) / 2 + cellSize / 2;
    const offsetY = -(WIRE_OPTIONS.length * cellSize) / 2 + cellSize / 2;

    WIRE_OPTIONS.forEach((wd, row) => {
      ID_OPTIONS.forEach((id, col) => {
        const v = computeRingVarsFixedID(id, wd);
        rings.push({
          row,
          col,
          x: col * cellSize + offsetX,
          y: row * cellSize + offsetY,
          innerDiameter: v.ID_mm,
          wireDiameter: v.WD_mm,
          centerSpacing: cellSize,
        });
      });
    });

    return {
      layout: rings,
      chartWidth: ID_OPTIONS.length * cellSize,
      chartHeight: WIRE_OPTIONS.length * cellSize,
    };
  }, []);

  // ========================================
  // === Generate 3D Rings w/ SpriteText ===
  // ========================================
  const ringObjs = useMemo(() => {
    return generateRingsChart({
      rows: WIRE_OPTIONS.length,
      cols: ID_OPTIONS.length,
      innerDiameter: "1/4", // placeholder
      wireDiameter: 1.2,    // placeholder
      centerSpacing: INCH_MM,
      layout,
      angleIn: 0,   // ✅ Flat
      angleOut: 0,  // ✅ Flat
    });
  }, [layout]);

  // ========================================
  // === Render Scene ===
  // ========================================
  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0F1115",
        position: "relative",
        overflow: "hidden",
        color: "white",
      }}
    >
      {/* === Centered Ring Size Chart === */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${scale})`,
          zIndex: 1,
        }}
      >
        <RingRenderer
          rings={ringObjs}
          params={{
            rows: WIRE_OPTIONS.length,
            cols: ID_OPTIONS.length,
            innerDiameter: 5,
            wireDiameter: 1,
            ringColor: "#BFBFBF",
            bgColor: "#0F1115",
            centerSpacing: INCH_MM,
          }}
          paint={paint}
          setPaint={setPaint}
          activeColor="#FFFFFF"
          initialPaintMode={false}
          initialRotationLocked={false}
          initialEraseMode={false}
        />
      </div>

      {/* === Floating Compass Button === */}
      <DraggablePill id="chart-compass" defaultPosition={{ x: 20, y: 20 }}>
        <button
          onClick={() => setShowCompass((v) => !v)}
          style={{
            fontSize: 22,
            width: 40,
            height: 40,
            borderRadius: 10,
            border: "1px solid #111",
            background: "#1f2937",
            color: "#d1d5db",
            cursor: "pointer",
          }}
          title="Open Navigation"
        >
          🧭
        </button>
      </DraggablePill>

      {/* === Floating Navigation Panel === */}
      {showCompass && (
        <DraggableCompassNav onNavigate={() => setShowCompass(false)} />
      )}
    </div>
  );
}