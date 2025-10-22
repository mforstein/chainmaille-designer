import React from "react";

type Entry = {
  id: string; // e.g., "5/16_1.6mm"
  innerDiameter: number; // mm
  wireDiameter: number;  // mm
  centerSpacing: number; // mm
  angleIn: number;       // deg
  angleOut: number;      // deg
  status: "valid" | "no_solution";
  savedAt?: string;
};

export default function AtlasPalette({
  onApply,
}: {
  onApply: (e: Entry) => void;
}) {
  const raw = localStorage.getItem("chainmailMatrix") || "[]";
  let rows: Entry[] = [];
  try { rows = JSON.parse(raw); } catch { rows = []; }

  if (!Array.isArray(rows)) rows = [];

  return (
    <div
      style={{
        background: "rgba(17,24,39,0.96)",
        border: "1px solid rgba(0,0,0,0.6)",
        borderRadius: 12,
        padding: 10,
        width: 420,
        maxHeight: 420,
        overflow: "auto",
      }}
    >
      <div style={{ marginBottom: 8, color: "#9ca3af", fontSize: 12 }}>
        Atlas Matrix (from JSON)
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {rows.map((e) => (
          <div
            key={e.id}
            style={{
              border: "1px solid #1f2937",
              borderRadius: 10,
              padding: 10,
              background: "#0b1324",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
              {e.id} <span style={{ color: "#93c5fd" }}>({e.status})</span>
            </div>
            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.35 }}>
              <div>ID: {e.innerDiameter.toFixed(3)} mm</div>
              <div>WD: {e.wireDiameter.toFixed(3)} mm</div>
              <div>Spacing: {e.centerSpacing.toFixed(2)} mm</div>
              <div>Angle In/Out: {e.angleIn}° / {e.angleOut}°</div>
            </div>
            <button
              style={{
                marginTop: 8,
                width: "100%",
                background: "#1e293b",
                color: "#93c5fd",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "6px 8px",
                cursor: "pointer",
              }}
              onClick={() => onApply(e)}
            >
              Apply
            </button>
          </div>
        ))}
      </div>
      {rows.length === 0 && (
        <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 8 }}>
          No Atlas data found. Save entries from the Weave Tuner first.
        </div>
      )}
    </div>
  );
}