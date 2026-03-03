// src/components/ShapePanel.tsx
import React from "react";

export type ShapeTool =
  | "square"
  | "circle"
  | "hex"
  | "oct"
  | "heart"
  | "tri";

export default function ShapePanel(props: {
  open: boolean;
  onClose: () => void;
  active: ShapeTool;
  onPick: (t: ShapeTool) => void;
}) {
  const { open, onClose, active, onPick } = props;
  if (!open) return null;

  const btn: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#e5e7eb",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  };

  const btnOn: React.CSSProperties = {
    ...btn,
    background: "rgba(59,130,246,0.35)",
    border: "1px solid rgba(59,130,246,0.65)",
  };

  const wrap: React.CSSProperties = {
    position: "absolute",
    left: 120,
    top: 160,
    zIndex: 50,
    width: 220,
    padding: 14,
    borderRadius: 16,
    background: "rgba(2,6,23,0.78)",
    border: "1px solid rgba(255,255,255,0.10)",
    backdropFilter: "blur(12px)",
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    marginTop: 10,
  };

  const header: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#e5e7eb",
    fontWeight: 800,
    fontSize: 12,
  };

  const hint: React.CSSProperties = {
    marginTop: 10,
    fontSize: 11,
    opacity: 0.8,
    lineHeight: 1.35,
    color: "#e5e7eb",
  };

  const X = () => (
    <button
      type="button"
      onClick={onClose}
      style={{
        width: 28,
        height: 28,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        color: "#e5e7eb",
        cursor: "pointer",
      }}
      title="Close"
    >
      ✕
    </button>
  );

  const Item = (id: ShapeTool, label: string) => (
    <button
      type="button"
      style={active === id ? btnOn : btn}
      onClick={() => onPick(id)}
      title={label}
    >
      {label}
    </button>
  );

  return (
    <div style={wrap}>
      <div style={header}>
        <div>Shapes</div>
        <X />
      </div>

      <div style={grid}>
        {Item("square", "□")}
        {Item("circle", "○")}
        {Item("hex", "⬡")}
        {Item("oct", "⯃")}
        {Item("heart", "♥")}
        {Item("tri", "◺")}
      </div>

      <div style={hint}>
        Drag on canvas to fill the shape.
        <br />
        Uses the same cursor→ring mapping as the stable freeform tool.
      </div>
    </div>
  );
}