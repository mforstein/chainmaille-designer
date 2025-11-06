import React from "react";

export default function ComparePage() {
  return (
    <div style={wrapper}>
      <h1>🎨 Renderer Comparison</h1>
      <p style={{ marginBottom: 20 }}>
        Compare <strong>Canvas2D</strong> vs <strong>PixiJS</strong> vs <strong>Three.js</strong>
      </p>
      <div style={{ display: "flex", gap: 20 }}>
        <a href="/canvas" style={btn}>🖼️ Canvas 2D</a>
        <a href="/pixi" style={btn}>🚀 PixiJS</a>
        <a href="/ringrenderer" style={btn}>🔺 Three.js</a>
      </div>
    </div>
  );
}

const wrapper: React.CSSProperties = {
  background: "#111827",
  color: "#fff",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "sans-serif",
};

const btn: React.CSSProperties = {
  padding: "10px 20px",
  background: "#2563eb",
  borderRadius: 8,
  color: "#fff",
  textDecoration: "none",
  fontSize: 18,
};