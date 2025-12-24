// src/components/BOMButtons.tsx
import React from "react";
import type { BOMMeta, RingLike } from "./BOMExport";
import { exportBOMCsv, exportBOMPng, openBOMPrintWindow } from "./BOMExport";

type Props = {
  rings: RingLike[]; // [{ colorHex }]
  meta?: Partial<BOMMeta>; // supplier/material/pack size/etc
  title?: string; // panel label (optional)
  compact?: boolean; // smaller buttons
};

const btnStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#111827",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

export default function BOMButtons({
  rings,
  meta,
  title = "Color BOM",
  compact,
}: Props) {
  if (!rings?.length) return null;

  const onCsv = () => exportBOMCsv(rings, meta, "freeform-bom.csv");
  const onPng = () => exportBOMPng(rings, meta, "freeform-bom.png");
  const onPdf = () => openBOMPrintWindow(rings, meta, title);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: compact ? "column" : "row",
        gap: 8,
        alignItems: "stretch",
        width: compact ? 160 : "auto",
      }}
    >
      <button onClick={onCsv} style={btnStyle}>
        📄 BOM CSV
      </button>
      <button onClick={onPng} style={btnStyle}>
        🧾 BOM PNG
      </button>
      <button
        onClick={onPdf}
        style={{
          ...btnStyle,
          background: "#2563eb",
          border: "none",
          fontWeight: 700,
        }}
      >
        🖨 PDF (Print)
      </button>
    </div>
  );
}
