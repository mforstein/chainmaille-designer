import React, { useEffect, useMemo, useState } from "react";

// Calibrated-ring selection strip for the 3D Designer. Mirrors the Freeform
// "Calibrated Rings" strip: each Tuner-saved ring is drawn to its TRUE relative
// proportions (stroke = wire diameter, centerline radius = (ID+WD)/2) and
// colored by Atlas solution status. Click a ring to apply it; the ring matching
// the current params is highlighted as active. Reads the same Tuner store
// (`chainmailMatrix`) the Weave Tuner / Atlas write to.

type Entry = {
  id: string; // e.g., "5/16_1.6mm"
  innerDiameter: number; // mm
  wireDiameter: number; // mm
  centerSpacing: number; // mm
  angleIn: number; // deg
  angleOut: number; // deg
  status: "valid" | "rings_only" | "no_solution";
  savedAt?: string;
};

function readMatrix(): Entry[] {
  try {
    const rows = JSON.parse(localStorage.getItem("chainmailMatrix") || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export default function DesignerRingStrip({
  onApply,
  activeMatch,
}: {
  onApply: (e: Entry) => void;
  activeMatch?: { innerDiameter: number; wireDiameter: number } | null;
}) {
  // Re-read the Tuner-saved matrix on demand (refresh ↻) and whenever the Tuner
  // broadcasts an update or another tab writes the store.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("weave-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("weave-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const rows = useMemo(() => readMatrix(), [tick]);

  // Scale every ring so the largest one's outer edge fills the swatch.
  const CELL = 44;
  const PAD = 4;
  const avail = CELL / 2 - 2; // px available for the outer radius
  const maxOD = rows.reduce(
    (m, r) => Math.max(m, r.innerDiameter + 2 * r.wireDiameter),
    0.001,
  );
  const mmToPx = avail / (maxOD / 2);

  const isActive = (e: Entry) =>
    !!activeMatch &&
    Math.abs(e.innerDiameter - activeMatch.innerDiameter) < 1e-3 &&
    Math.abs(e.wireDiameter - activeMatch.wireDiameter) < 1e-3;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        title="Calibrated Rings"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 }}
      >
        <span style={{ fontSize: 14 }}>🔗</span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 9.5, color: "#64748b", lineHeight: 1.3, textAlign: "center" }}>
          Save rings in the Tuner
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            maxHeight: 292 /* ~5 swatches (52px + 8 gap); more scroll */,
            overflowY: "auto",
          }}
        >
          {rows.map((e) => {
            const active = isActive(e);
            const ringR = ((e.innerDiameter + e.wireDiameter) / 2) * mmToPx;
            const wirePx = Math.max(1.2, e.wireDiameter * mmToPx);
            const AR = e.innerDiameter / e.wireDiameter;
            // green = valid, yellow = rings_only, red = no_solution, gray = unknown.
            const statusColor =
              e.status === "valid"
                ? "#19c37d"
                : e.status === "rings_only"
                  ? "#f59e0b"
                  : e.status === "no_solution"
                    ? "#ef4444"
                    : "#c7ced8";
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onApply(e)}
                title={`${e.id} — ID ${e.innerDiameter.toFixed(2)} · WD ${e.wireDiameter.toFixed(2)} mm · AR ${AR.toFixed(2)} · ${e.status}`}
                style={{
                  width: CELL + PAD * 2,
                  height: CELL + PAD * 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  borderRadius: 10,
                  border: active ? "1px solid #3b82f6" : "1px solid #1e293b",
                  background: active ? "rgba(37,99,235,0.22)" : "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                }}
              >
                <svg width={CELL} height={CELL} viewBox={`0 0 ${CELL} ${CELL}`} style={{ display: "block" }}>
                  <circle
                    cx={CELL / 2}
                    cy={CELL / 2}
                    r={Math.max(2, ringR)}
                    fill="none"
                    stroke={statusColor}
                    strokeWidth={wirePx}
                  />
                </svg>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setTick((t) => t + 1)}
        title="Refresh from Tuner"
        style={{
          background: "transparent",
          border: "1px solid #1e293b",
          borderRadius: 8,
          color: "#94a3b8",
          cursor: "pointer",
          fontSize: 11,
          padding: "3px 9px",
        }}
      >
        ↻
      </button>
    </div>
  );
}
