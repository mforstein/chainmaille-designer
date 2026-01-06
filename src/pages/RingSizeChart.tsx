// ========================================
// src/pages/RingSizeChart.tsx (iPad FIXED)
// ========================================
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { computeRingVars } from "../utils/computeRingVars";
import { DraggableCompassNav, DraggablePill } from "../App";
import RingRenderer from "../components/RingRenderer";

// ========================================
// CONSTANTS
// ========================================
const ID_OPTIONS = [
  "7/64",
  "1/8",
  "9/64",
  "5/32",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "5/8",
];

const WIRE_OPTIONS = [0.9, 1.2, 1.6, 2.0, 2.5, 3.0];

// ========================================
// MAIN COMPONENT
// ========================================
export default function RingSizeChart() {
  const [showCompass, setShowCompass] = useState(false);

  // ✅ iPad Safari sometimes mounts WebGL at 0×0 during route transitions / address bar resize.
  // Remount the renderer on resize/orientation to force a correct canvas size.
  const [rendererKey, setRendererKey] = useState(0);
  useEffect(() => {
    const bump = () => setRendererKey((k) => k + 1);

    // Initial post-mount bump helps iOS Safari after navigation
    const t1 = window.setTimeout(bump, 0);
    const t2 = window.setTimeout(bump, 250);

    window.addEventListener("resize", bump);
    window.addEventListener("orientationchange", bump);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", bump);
      window.removeEventListener("orientationchange", bump);
    };
  }, []);

  // ============================================================
  // Generate all ring combinations (each unique size)
  // ✅ iPad fix: provide id + color + z + tilt fields expected by RingRenderer
  // ✅ iPad fix: center the whole chart around (0,0) so camera always sees it
  // ============================================================
  const rings = useMemo(() => {
    const grid: any[] = [];

    const spacing = 20;
    const SCALE_NORMALIZER = 0.3; // chart scale

    // Build in local grid coordinates
    const min = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new THREE.Vector2(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    WIRE_OPTIONS.forEach((wire, r) => {
      ID_OPTIONS.forEach((id, c) => {
        const { ID_mm, WD_mm, OD_mm } = computeRingVars(id, wire);

        const x = c * spacing;
        const y = r * spacing * 1.1;

        min.x = Math.min(min.x, x);
        min.y = Math.min(min.y, y);
        max.x = Math.max(max.x, x);
        max.y = Math.max(max.y, y);

        const scaledID = ID_mm * SCALE_NORMALIZER;
        const scaledWD = WD_mm * SCALE_NORMALIZER;
        const scaledOD = OD_mm * SCALE_NORMALIZER;

        // Label (optional: RingRenderer may ignore this, but keep for future)
        const label = new SpriteText(`${WD_mm.toFixed(1)}mm / ${ID_mm.toFixed(2)}mm`);
        label.color = "#CCCCCC";
        label.textHeight = 0.9;
        label.center.set(0.5, 1.0);

        grid.push({
          id: `chart-${r},${c}`,
          row: r,
          col: c,
          x,
          y,
          z: 0,
          innerDiameter: scaledID,
          wireDiameter: scaledWD,
          radius: scaledOD / 2,
          tilt: 0,
          tiltRad: 0,
          color: "#C0C0C0",
          _chartLabel: label,
          _raw: { ID_mm, WD_mm, OD_mm },
        });
      });
    });

    // Center the entire chart around origin so it’s visible on all aspect ratios.
    const cx = (min.x + max.x) * 0.5;
    const cy = (min.y + max.y) * 0.5;

    for (const item of grid) {
      item.x = item.x - cx;
      item.y = item.y - cy;

      // Keep label in sync with the shifted ring position
      const od = (item.radius ?? 0) * 2;
      if (item._chartLabel) {
        item._chartLabel.position.set(item.x, -item.y - od * 0.75, 0);
      }
    }

    return grid;
  }, []);

  // ============================================================
  // Params for RingRenderer
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

  // ✅ stable paint map (avoid recreating Map each render)
  const paint = useMemo(() => new Map<string, string | null>(), []);

  // ============================================================
  // Render Chart
  // ✅ iPad fix: use fixed/inset container (avoids 100vh Safari bugs)
  // ============================================================
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        minHeight: "100vh",
        background: "#0E0F12",
        color: "#dbe4ee",
        overflow: "hidden",
      }}
    >
      {/* 3D CHART */}
      <RingRenderer
        key={rendererKey}
        rings={rings}
        params={params}
        paint={paint}
        setPaint={() => {}}
        activeColor="#FFFFFF"
        initialRotationLocked={true}
      />

      {/* Compass Toggle */}
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

      {showCompass && <DraggableCompassNav onNavigate={() => setShowCompass(false)} />}
    </div>
  );
}