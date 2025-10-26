// ========================================
// src/pages/RingSizeChart.tsx (FINAL DOUBLE SCALE)
// ========================================
import React, { useMemo, useState } from "react";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import RingRenderer, {
  computeRingVarsFixedID,
} from "../components/RingRenderer";
import { DraggableCompassNav, DraggablePill } from "../App";

// ========================================
// CONSTANTS
// ========================================
const ID_OPTIONS = [
  "7/64", "1/8", "9/64", "5/32", "3/16", "1/4",
  "5/16", "3/8", "7/16", "1/2", "5/8",
];
const WIRE_OPTIONS = [0.9, 1.2, 1.6, 2.0, 2.5, 3.0];

// ========================================
// MAIN COMPONENT
// ========================================
export default function RingSizeChart() {
  const [showCompass, setShowCompass] = useState(false);

  // ============================================================
  // Generate all ring combinations (each unique size)
  // ============================================================
  const rings = useMemo(() => {
    const grid: any[] = [];
    const rows = WIRE_OPTIONS.length;
    const cols = ID_OPTIONS.length;

    // Global visual scaling constants
    const spacing = 20; // a bit wider spacing
    const SCALE_NORMALIZER = 0.30; // doubled ring size from 0.15 → 0.30

    WIRE_OPTIONS.forEach((wire, r) => {
      ID_OPTIONS.forEach((id, c) => {
        const { ID_mm, WD_mm, OD_mm } = computeRingVarsFixedID(id, wire);

        const x = c * spacing;
        const y = r * spacing * 1.1;

        // Apply normalization to fit view and avoid giant rings
        const scaledID = ID_mm * SCALE_NORMALIZER;
        const scaledWD = WD_mm * SCALE_NORMALIZER;
        const scaledOD = OD_mm * SCALE_NORMALIZER;

        // ✅ Proper SpriteText label (consistent small text)
        const label = new SpriteText(
          `${WD_mm.toFixed(1)}mm / ${ID_mm.toFixed(2)}mm`
        );
        label.color = "#CCCCCC";
        label.textHeight = 0.9; // fixed small text
        label.position.set(x, -y - scaledOD * 0.75, 0); // just below the ring
        label.center.set(0.5, 1.0);

        grid.push({
          row: r,
          col: c,
          x,
          y,
          innerDiameter: scaledID,
          wireDiameter: scaledWD,
          radius: scaledOD / 2,
          tiltRad: 0,
          _chartLabel: label,
        });
      });
    });

    return grid;
  }, []);

  // ============================================================
  // Build params dynamically for rendering
  // ============================================================
  const params = useMemo(() => {
    return {
      rows: WIRE_OPTIONS.length,
      cols: ID_OPTIONS.length,
      innerDiameter: 6,
      wireDiameter: 1,
      ringColor: "#C0C0C0",
      bgColor: "#0E0F12",
      centerSpacing: 20,
    };
  }, []);

  // ============================================================
  // Render Chart
  // ============================================================
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0E0F12",
        color: "#dbe4ee",
        position: "relative",
      }}
    >
      {/* ======================= */}
      {/* Main 3D Renderer */}
      {/* ======================= */}
      <RingRenderer
        rings={rings}
        params={params}
        paint={new Map()}
        setPaint={() => {}}
        activeColor="#FFFFFF"
        initialRotationLocked={true}
      />

      {/* ======================= */}
      {/* Floating Compass Control */}
      {/* ======================= */}
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

      {/* ======================= */}
      {/* Draggable Compass Nav */}
      {/* ======================= */}
      {showCompass && (
        <DraggableCompassNav onNavigate={() => setShowCompass(false)} />
      )}
    </div>
  );
}