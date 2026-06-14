// src/components/AutoCalibrateButton.tsx
//
// Small "C" button for the color palettes (Designer + Freeform). Clicking it
// runs a headless color calibration in place — no page, no dialog. While it
// runs, the button is replaced by a compact progress bar; when it finishes the
// calibration is already saved + applied (RingRenderer refreshes via the
// `calibrationUpdated` event), and the button flashes a ✓ before returning.

import React, { useRef, useState } from "react";
import { runAutoColorCalibration } from "../lib/autoColorCalibration";

type Status = "idle" | "running" | "done";

export default function AutoCalibrateButton({ from }: { from?: "designer" | "freeform" }) {
  const [status, setStatus] = useState<Status>("idle");
  const [pct, setPct] = useState(0);
  const busyRef = useRef(false);

  const run = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("running");
    setPct(0);
    try {
      await runAutoColorCalibration((p) => {
        setPct(Math.round((p.done / p.total) * 100));
      });
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 1300);
    } catch (err) {
      // Headless WebGL can fail on locked-down devices — fail quietly back to idle.
      console.warn("Auto color calibration failed:", err);
      setStatus("idle");
    } finally {
      busyRef.current = false;
    }
  };

  // Compact progress bar shown while running (the "status bar").
  if (status === "running") {
    return (
      <div
        data-nondrag
        title={`Calibrating colors… ${pct}%`}
        style={{
          width: 116,
          height: 22,
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(255,255,255,0.06)",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "linear-gradient(90deg, #2563eb, #7c3aed)",
            transition: "width 0.15s ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "#f8fafc",
            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}
        >
          Calibrating… {pct}%
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-nondrag
      onClick={run}
      title={
        status === "done"
          ? "Colors calibrated"
          : `Calibrate colors${from ? ` (${from})` : ""} — auto-match on-screen colors to real rings`
      }
      style={{
        width: 28,
        height: 26,
        borderRadius: 8,
        border: status === "done" ? "1px solid #19c37d" : "1px solid rgba(255,255,255,0.16)",
        background: status === "done" ? "rgba(25,195,125,0.22)" : "rgba(255,255,255,0.06)",
        color: status === "done" ? "#19c37d" : "#f8fafc",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {status === "done" ? "✓" : "C"}
    </button>
  );
}
