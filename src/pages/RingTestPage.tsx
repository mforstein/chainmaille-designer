// ==============================
// src/pages/RingTestPage.tsx
// ==============================
import React, { useMemo, useState } from "react";
import RingRenderer, {
  computeRingVarsFixedID,
  generateRingsDesigner as generateRings,
} from "../components/RingRenderer";
// 🧮 Convert ½" to mm
const HALF_INCH_MM = 25.4 / 2; // = 12.7 mm

export default function RingTestPage() {
  // Example parameters for testing
  const [idInches, setIdInches] = useState("3/16");
  const [wireMm, setWireMm] = useState(2.0);

  // Compute ring dimensions
  const { ID_mm, WD_mm, OD_mm } = useMemo(
    () => computeRingVarsFixedID(idInches, wireMm),
    [idInches, wireMm]
  );

  // Generate one ring (centered)
  const rings = useMemo(
    () =>
      generateRings({
        rows: 1,
        cols: 1,
        innerDiameter: ID_mm,
        wireDiameter: WD_mm,
      }),
    [ID_mm, WD_mm]
  );

  const [paint, setPaint] = useState(new Map());

  // --- Test bounding square (½″ = 12.7 mm) ---
  console.log("Testing ring fit into 12.7 mm square:");
  console.log({
    ID_mm,
    WD_mm,
    OD_mm,
    fits: OD_mm <= HALF_INCH_MM ? "✅ Fits" : "⚠️ Too large",
  });

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0f1115" }}>
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          color: "white",
          fontFamily: "monospace",
          zIndex: 10,
        }}
      >
        <div>
          <label>
            Inner Diameter (in):{" "}
            <select value={idInches} onChange={(e) => setIdInches(e.target.value)}>
              {["3/16", "1/4", "5/16", "3/8", "7/16", "1/2"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <label>
            Wire (mm):{" "}
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="3"
              value={wireMm}
              onChange={(e) => setWireMm(parseFloat(e.target.value))}
            />
          </label>
        </div>
        <div>
          <strong>ID:</strong> {ID_mm.toFixed(3)} mm |{" "}
          <strong>OD:</strong> {OD_mm.toFixed(3)} mm
        </div>
      </div>

      {/* Render single ring using your existing renderer */}
      <RingRenderer
        rings={rings}
        params={{
          rows: 1,
          cols: 1,
          innerDiameter: ID_mm,
          wireDiameter: WD_mm,
          ringColor: "#AAAAAA",
          bgColor: "#0F1115",
        }}
        paint={paint}
        setPaint={setPaint}
        activeColor="#FFFFFF"
      />
    </div>
  );
}