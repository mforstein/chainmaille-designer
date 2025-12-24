// src/components/GeometryPanel.tsx
import React from "react";

interface GeometryPanelProps {
  rows: number;
  cols: number;
  onChange: (field: "rows" | "cols", value: number) => void;
}

export default function GeometryPanel({
  rows,
  cols,
  onChange,
}: GeometryPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontWeight: 600, fontSize: 14 }}>Grid Size</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>
            Rows
          </label>
          <input
            type="number"
            value={rows}
            min={1}
            max={500}
            onChange={(e) => onChange("rows", parseInt(e.target.value, 10))}
            style={{
              width: "100%",
              background: "#1a1c20",
              color: "#e6e8ef",
              border: "1px solid #333",
              borderRadius: 4,
              padding: "4px 6px",
            }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>
            Cols
          </label>
          <input
            type="number"
            value={cols}
            min={1}
            max={500}
            onChange={(e) => onChange("cols", parseInt(e.target.value, 10))}
            style={{
              width: "100%",
              background: "#1a1c20",
              color: "#e6e8ef",
              border: "1px solid #333",
              borderRadius: 4,
              padding: "4px 6px",
            }}
          />
        </div>
      </div>
    </div>
  );
}
