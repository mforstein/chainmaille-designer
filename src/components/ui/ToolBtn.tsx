import React from "react";

export const ToolBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ active, children, style: styleProp, ...rest }) => (
  <button
    {...rest}
    style={{
      width: 44,
      height: 44,
      borderRadius: 12,
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
      fontSize: 20,
      lineHeight: 1,
      ...styleProp,
    }}
  >
    {children}
  </button>
);
