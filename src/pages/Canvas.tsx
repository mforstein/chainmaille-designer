import React, { Suspense, lazy } from "react";

const Canvas2DGrid = lazy(() => import("../components/Canvas2DGrid"));

export default function CanvasPage() {
  return (
    <div style={pageStyle}>
      <h2>🖼️ Canvas2D Grid Demo</h2>
      <Suspense fallback={<div style={{ color: "#fff" }}>Loading Canvas…</div>}>
        <Canvas2DGrid />
      </Suspense>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#0f172a",
  width: "100vw",
  height: "100vh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
};