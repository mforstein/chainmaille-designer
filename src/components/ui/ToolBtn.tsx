import React from "react";

export const ToolBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ active, children, style: styleProp, ...rest }) => (
  <button
    {...rest}
    style={{
      // Reduced 20% (was 44×44 / radius 12 / font 20) so the long Freeform
      // toolbar fits on shorter viewports without the bottom icons clipping.
      width: 35,
      height: 35,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.08)",
      cursor: "pointer",
      background: active ? "#2563eb" : "#1f2937",
      color: active ? "#f9fafb" : "#d1d5db",
      boxShadow: active
        ? "0 0 0 2px rgba(37,99,235,0.4), 0 4px 12px rgba(0,0,0,0.4)"
        : "0 2px 8px rgba(0,0,0,0.35)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      userSelect: "none",
      fontSize: 16,
      lineHeight: 1,
      ...styleProp,
    }}
  >
    {children}
  </button>
);
