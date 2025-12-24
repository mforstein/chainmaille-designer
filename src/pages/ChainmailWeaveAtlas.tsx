// ==============================
// src/pages/ChainmailWeaveAtlas.tsx
// ==============================
import React, { useEffect, useState } from "react";
import { DraggableCompassNav, DraggablePill } from "../App";

const ID_ORDER = [
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

const WIRE_ORDER = [0.9, 1.2, 1.6, 2.0, 2.5, 3.0];

export default function ChainmailWeaveAtlas() {
  const [matrix, setMatrix] = useState<any[]>([]);
  const [activeWeaveId, setActiveWeaveId] = useState<string | null>(null);
  const [showCompass, setShowCompass] = useState(false);

  // Load matrix data from localStorage
  useEffect(() => {
    const data = localStorage.getItem("chainmailMatrix");
    if (!data) {
      console.warn("⚠️ No chainmailMatrix found in localStorage!");
      return;
    }
    try {
      const parsed = JSON.parse(data);
      console.log("🧵 Loaded chainmail matrix:", parsed.length, "entries");
      setMatrix(parsed);
    } catch (err) {
      console.error("❌ Failed to parse chainmailMatrix:", err);
    }
  }, []);

  const getEntry = (id: string, wire: number) =>
    matrix.find((e) => e.id === `${id}_${wire}mm`);

  // ✅ Handle selecting a weave to apply it to the Designer
  const handleSelectWeave = (weave: any) => {
    try {
      console.log("🎯 Applying weave to Designer:", weave);
      setActiveWeaveId(weave.id);

      // Save and trigger update event
      localStorage.setItem("chainmailSelected", JSON.stringify(weave));
      window.dispatchEvent(new Event("weave-updated"));
    } catch (err) {
      console.error("❌ Failed to apply weave:", err);
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0b0f14",
        color: "#dbe4ee",
        overflow: "auto",
        padding: 24,
        position: "relative",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>
        🌐 Chainmail Weave Atlas
      </h1>

      <table
        style={{
          borderCollapse: "collapse",
          fontSize: 14,
          width: "100%",
          maxWidth: 1000,
          textAlign: "center",
        }}
      >
        <thead>
          <tr style={{ background: "#111820" }}>
            <th style={{ padding: "6px 8px", border: "1px solid #1f2a36" }}>
              Wire (mm) ↓ / ID →
            </th>
            {ID_ORDER.map((id) => (
              <th
                key={id}
                style={{
                  padding: "6px 8px",
                  border: "1px solid #1f2a36",
                  color: "#9fb6d1",
                }}
              >
                {id}"
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {WIRE_ORDER.map((wire) => (
            <tr key={wire}>
              <td
                style={{
                  padding: "6px 8px",
                  border: "1px solid #1f2a36",
                  background: "#111820",
                  color: "#9fb6d1",
                  fontWeight: 500,
                }}
              >
                {wire.toFixed(1)} mm
              </td>

              {ID_ORDER.map((id) => {
                const entry = getEntry(id, wire);
                if (!entry)
                  return (
                    <td
                      key={id}
                      style={{
                        border: "1px solid #1f2a36",
                        background: "#151d27",
                        color: "#3f556a",
                      }}
                    >
                      ☐
                    </td>
                  );

                const color = entry.status === "valid" ? "#19c37d" : "#ef4444";
                const isActive = entry.id === activeWeaveId;

                return (
                  <td
                    key={id}
                    onClick={() => handleSelectWeave(entry)}
                    title={`ID: ${id}" | Wire: ${wire}mm
Center: ${entry.centerSpacing}mm
Angles: ${entry.angleIn}/${entry.angleOut}°`}
                    style={{
                      border: "1px solid #1f2a36",
                      padding: "6px 8px",
                      cursor: "pointer",
                      background: isActive
                        ? "#19324d"
                        : entry.status === "valid"
                          ? "#0f1720"
                          : "#1a1111",
                      color,
                      fontWeight: "bold",
                      transition: "background 0.2s ease",
                    }}
                  >
                    {entry.status === "valid" ? "✅" : "❌"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {matrix.length === 0 && (
        <div style={{ marginTop: 32, color: "#8fa1b3" }}>
          ⚠️ No data found — open the <strong>Weave Tuner</strong> and save a
          few combinations first.
        </div>
      )}

      {/* ======================= */}
      {/* 🧭 Floating Compass */}
      {/* ======================= */}
      <DraggablePill id="atlas-compass" defaultPosition={{ x: 20, y: 20 }}>
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
