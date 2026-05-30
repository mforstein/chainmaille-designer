// ==============================
// src/pages/ChainmailWeaveAtlas.tsx
// ==============================
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DraggableCompassNav, DraggablePill } from "../App";
import { IconHamburger } from "../components/icons/ToolIcons";

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

// Cell background: active entry highlights bright; otherwise a faint tint of
// the status color so the grid reads at a glance.
function isActiveBg(entry: any, activeId: string | null): string {
  if (entry?.id === activeId) return "#19324d";
  switch (entry?.status) {
    case "valid":
      return "#0f1720";       // dark green-ish neutral
    case "rings_only":
      return "#1a1408";       // dark amber tint
    case "no_solution":
    default:
      return "#1a1111";       // dark red tint
  }
}

export default function ChainmailWeaveAtlas() {
  const navigate = useNavigate();
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

  const handleSelectWeave = (weave: any) => {
    try {
      setActiveWeaveId(weave.id);
      localStorage.setItem("chainmailSelected", JSON.stringify(weave));
      window.dispatchEvent(new Event("weave-updated"));
    } catch (err) {
      console.error("❌ Failed to apply weave:", err);
    }
  };

  const handleTuneUnchecked = (ringId: string, wireGauge: number) => {
    const params = new URLSearchParams({
      id: ringId,
      wire: String(wireGauge),
      guided: "1",
    });
    navigate(`/tuner?${params.toString()}`);
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
                      onClick={() => handleTuneUnchecked(id, wire)}
                      title={`${id}" / ${wire}mm — click to tune this combination`}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#111d2e";
                        e.currentTarget.style.color = "#4a7a9b";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#0f1520";
                        e.currentTarget.style.color = "#2d4a5f";
                      }}
                      style={{
                        border: "1px solid #1f2a36",
                        background: "#0f1520",
                        color: "#2d4a5f",
                        cursor: "pointer",
                        fontSize: 16,
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      +
                    </td>
                  );

                // 3-state color coding:
                //   valid       → green (rings + scales both work)
                //   rings_only  → orange (rings work, scales don't)
                //   no_solution → red (neither works)
                // Backward compatibility: any unknown status string is
                // treated as "no_solution" rather than crashing.
                const cellColor =
                  entry.status === "valid"
                    ? "#19c37d"
                    : entry.status === "rings_only"
                      ? "#f59e0b"
                      : "#ef4444";
                const cellBg = isActiveBg(entry, activeWeaveId);
                const cellIcon =
                  entry.status === "valid"
                    ? "✅"
                    : entry.status === "rings_only"
                      ? "🟠"
                      : "❌";
                const cellTitle =
                  entry.status === "valid"
                    ? "Rings + Scales both valid"
                    : entry.status === "rings_only"
                      ? "Rings valid — scales not woven at this AR"
                      : "No solution (rings or scales)";

                return (
                  <td
                    key={id}
                    onClick={() => handleSelectWeave(entry)}
                    title={`${cellTitle}
ID: ${id}" | Wire: ${wire}mm
Center: ${entry.centerSpacing}mm
Angles: ${entry.angleIn}/${entry.angleOut}°`}
                    style={{
                      border: "1px solid #1f2a36",
                      padding: "6px 8px",
                      cursor: "pointer",
                      background: cellBg,
                      color: cellColor,
                      fontWeight: "bold",
                      transition: "background 0.2s ease",
                    }}
                  >
                    {cellIcon}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, color: "#64748b", fontSize: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <span style={{ color: "#19c37d" }}>✅ Rings + Scales — both weave</span>
        <span style={{ color: "#f59e0b" }}>🟠 Rings only — scales don't weave at this AR</span>
        <span style={{ color: "#ef4444" }}>❌ No solution — neither weaves</span>
        <span style={{ color: "#4a7a9b" }}>+ Untested — click to tune</span>
      </div>

      {matrix.length === 0 && (
        <div style={{ marginTop: 24, color: "#8fa1b3" }}>
          ⚠️ No saved data yet — click any <span style={{ color: "#4a7a9b", fontWeight: 700 }}>+</span> cell to tune a combination in the Weave Tuner, or open the Tuner and save entries manually.
        </div>
      )}

      {/* ======================= */}
      {/* 🧭 Floating Compass */}
      {/* ======================= */}
      <DraggablePill id="atlas-compass" defaultPosition={{ x: 20, y: 20 }}>
        <button
          onClick={() => setShowCompass((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
          <IconHamburger size={18} />
        </button>
      </DraggablePill>

      {showCompass && (
        <DraggableCompassNav onNavigate={() => setShowCompass(false)} />
      )}
    </div>
  );
}
