import React, { Suspense, lazy } from "react";

const PixiGrid = lazy(() => import("../components/PixiGrid"));

export default function PixiPage() {
  return (
    <div style={pageStyle}>
      <h2>🚀 PixiJS (WebGL2D) Grid Demo</h2>
      <Suspense fallback={<div style={{ color: "#fff" }}>Loading Pixi…</div>}>
        <PixiGrid />
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