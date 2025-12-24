// ========================================
// src/pages/ChainmailWeaveTuner.tsx (FINAL FIXED)
// FIX: RingRenderer must be allowed to own the full viewport.
// The old centering/scale wrapper was fighting RingRenderer’s own 100vw/100vh
// sizing and camera math, causing “midline-only / clipped / offset” behavior
// in some layouts.
// ========================================

import React, { useMemo, useState } from "react";
import * as THREE from "three";
import RingRenderer from "../components/RingRenderer";
import { computeRingVarsIndependent } from "../utils/ringMath";
import { DraggableCompassNav, DraggablePill } from "../App";

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

// Helper: convert fractional inch string to mm
function convertToMM(idValue: string): number {
  const [num, den] = idValue.split("/").map(Number);
  return den ? 25.4 * (num / den) : parseFloat(idValue);
}

// ========================================
// MAIN COMPONENT
// ========================================
export default function ChainmailWeaveTuner() {
  const [id, setId] = useState("5/16");
  const [wire, setWire] = useState(1.6);
  const [centerSpacing, setCenterSpacing] = useState(8.0);
  const [angleIn, setAngleIn] = useState(25);
  const [angleOut, setAngleOut] = useState(-25);
  const [status, setStatus] = useState<"valid" | "no_solution">("valid");
  const [showCompass, setShowCompass] = useState(false);
  const [version, setVersion] = useState(0); // 🔁 force rebuild key

  // ============================================================
  // Derived: AR display (use same authoritative math as renderer)
  // ============================================================
  const arDisplay = useMemo(() => {
    const { ID_mm, WD_mm } = computeRingVarsIndependent(id, wire);
    return (WD_mm > 0 ? ID_mm / WD_mm : 0).toFixed(2);
  }, [id, wire]);

  // ============================================================
  // Generate rings whenever any geometry input changes
  // ============================================================
  const rings = useMemo(() => {
    const { ID_mm, WD_mm, OD_mm } = computeRingVarsIndependent(id, wire);
    const spacing = centerSpacing;
    const rows = 6;
    const cols = 6;
    const arr: any[] = [];

    for (let r = 0; r < rows; r++) {
      const y = r * spacing * 0.866;
      const rowOffset = r % 2 === 1 ? spacing / 2 : 0;
      const rowTilt = r % 2 === 0 ? angleIn : angleOut;

      for (let c = 0; c < cols; c++) {
        const x = c * spacing + rowOffset;
        arr.push({
          row: r,
          col: c,
          x,
          y,
          innerDiameter: ID_mm,
          wireDiameter: WD_mm,
          radius: OD_mm / 2,
          tiltRad: THREE.MathUtils.degToRad(rowTilt),
        });
      }
    }

    return arr;
  }, [id, wire, centerSpacing, angleIn, angleOut]);

  // ============================================================
  // Build params object (reactive to ID/Wire/etc.)
  // ============================================================
  const params = useMemo(() => {
    const { ID_mm, WD_mm } = computeRingVarsIndependent(id, wire);
    return {
      rows: 6,
      cols: 6,
      innerDiameter: ID_mm,
      wireDiameter: WD_mm,
      ringColor: "#BFBFBF",
      bgColor: "#0E0F12",
      centerSpacing,
    };
  }, [id, wire, centerSpacing]);

  // ============================================================
  // Save configuration to localStorage
  // ============================================================
  const handleSave = () => {
    const { ID_mm, WD_mm } = computeRingVarsIndependent(id, wire);
    const entry = {
      id: `${id}_${wire}mm`,
      innerDiameter: ID_mm,
      wireDiameter: WD_mm,
      centerSpacing,
      angleIn,
      angleOut,
      status,
      aspectRatio: (ID_mm / WD_mm).toFixed(2),
      savedAt: new Date().toISOString(),
    };

    const existing = JSON.parse(
      localStorage.getItem("chainmailMatrix") || "[]",
    );
    const updated = [...existing.filter((e: any) => e.id !== entry.id), entry];
    localStorage.setItem("chainmailMatrix", JSON.stringify(updated, null, 2));
    alert(`✅ Saved ${entry.id} (${status})`);
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0E0F12",
        color: "#dbe4ee",
        position: "relative",
        overflow: "hidden", // ✅ keep renderer clean
      }}
    >
      {/* ======================= */}
      {/* Main Ring Renderer */}
      {/* FIX: Give RingRenderer the full viewport instead of wrapping it
          in a centered transform that fights its own 100vw/100vh sizing. */}
      {/* ======================= */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      >
        <RingRenderer
          key={version} // 🔁 ensures full geometry rebuild on parameter change
          rings={rings}
          params={params}
          paint={new Map()}
          setPaint={() => {}}
          activeColor="#FFFFFF"
        />
      </div>

      {/* ======================= */}
      {/* Top Control Panel */}
      {/* ======================= */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(18,24,32,0.94)",
          border: "1px solid #0b1020",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          zIndex: 10,
          fontSize: 13,
          backdropFilter: "blur(6px)",
        }}
      >
        <label>
          Wire
          <select
            value={wire}
            onChange={(e) => {
              setWire(parseFloat(e.target.value));
              setVersion((v) => v + 1);
            }}
            style={{ marginLeft: 6 }}
          >
            {WIRE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v} mm
              </option>
            ))}
          </select>
        </label>

        <label>
          ID
          <select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setVersion((v) => v + 1);
            }}
            style={{ marginLeft: 6 }}
          >
            {ID_OPTIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>

        <label>
          Center
          <input
            type="range"
            min="2"
            max="25"
            step="0.1"
            value={centerSpacing}
            onChange={(e) => {
              setCenterSpacing(parseFloat(e.target.value));
              setVersion((v) => v + 1);
            }}
            style={{ width: 140, marginLeft: 6 }}
          />
          <span style={{ marginLeft: 6 }}>{centerSpacing.toFixed(1)} mm</span>
        </label>

        <label>
          Angle In
          <input
            type="range"
            min="-75"
            max="75"
            step="1"
            value={angleIn}
            onChange={(e) => {
              setAngleIn(parseFloat(e.target.value));
              setVersion((v) => v + 1);
            }}
            style={{ width: 110, marginLeft: 6 }}
          />
          <span style={{ marginLeft: 6 }}>{angleIn}°</span>
        </label>

        <label>
          Angle Out
          <input
            type="range"
            min="-75"
            max="75"
            step="1"
            value={angleOut}
            onChange={(e) => {
              setAngleOut(parseFloat(e.target.value));
              setVersion((v) => v + 1);
            }}
            style={{ width: 110, marginLeft: 6 }}
          />
          <span style={{ marginLeft: 6 }}>{angleOut}°</span>
        </label>

        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            style={{ marginLeft: 6 }}
          >
            <option value="valid">✅ Valid</option>
            <option value="no_solution">❌ No Solution</option>
          </select>
        </label>

        {/* Keep helper visible, but display uses authoritative math */}
        <div
          style={{ marginLeft: 6, fontSize: 13 }}
          title={`ID(mm) ≈ ${convertToMM(id).toFixed(3)}`}
        >
          AR ≈ {arDisplay}
        </div>

        <button
          onClick={handleSave}
          style={{
            background: "#1e293b",
            color: "#93c5fd",
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #334155",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Save
        </button>
      </div>

      {/* ======================= */}
      {/* 🧭 Floating Compass */}
      {/* ======================= */}
      <DraggablePill id="tuner-compass" defaultPosition={{ x: 20, y: 20 }}>
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

      {showCompass && (
        <DraggableCompassNav onNavigate={() => setShowCompass(false)} />
      )}
    </div>
  );
}
