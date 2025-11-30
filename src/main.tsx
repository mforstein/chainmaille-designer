// ======================================================
// src/main.tsx — Root Renderer (Final Clean Version)
// ======================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// ------------------------------------------------------
// Core Pages & Components
// ------------------------------------------------------
import HomeWovenRainbows from "./pages/HomeWovenRainbows";
import PasswordGate from "./pages/PasswordGate";
import BlogEditor from "./pages/BlogEditor";
import ChainmailDesigner from "./App";
import ErinPattern2D from "./pages/ErinPattern2D";
import RingSizeChart from "./pages/RingSizeChart";
import ChainmailWeaveTuner from "./pages/ChainmailWeaveTuner";
import ChainmailWeaveAtlas from "./pages/ChainmailWeaveAtlas";
import FreeformChainmail2D from "./pages/FreeformChainmail2D";

// ------------------------------------------------------
// Global Styles
// ------------------------------------------------------
import "./index.css";

// ------------------------------------------------------
// Developer Tools (Loaded ONLY in Dev Mode)
// ------------------------------------------------------
let DevRoutes = null;

if (import.meta.env.DEV) {
  const ImageMatcher = React.lazy(() => import("./pages/ImageMatcher"));
  const DesignerGalleryEditor = React.lazy(() => import("./pages/DesignerGalleryEditor"));

  DevRoutes = (
    <>
      <Route
        path="/matcher"
        element={
          <React.Suspense fallback={<div style={{ color: "white", padding: 20 }}>Loading matcher...</div>}>
            <ImageMatcher />
          </React.Suspense>
        }
      />

      <Route
        path="/designer-editor"
        element={
          <React.Suspense fallback={<div style={{ color: "white", padding: 20 }}>Loading editor...</div>}>
            <DesignerGalleryEditor />
          </React.Suspense>
        }
      />
    </>
  );
}

// ======================================================
// Root Renderer with Router
// ======================================================
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Default redirect to main homepage */}
        <Route path="/" element={<Navigate to="/wovenrainbowsbyerin" replace />} />

        {/* Public pages */}
        <Route path="/wovenrainbowsbyerin" element={<HomeWovenRainbows />} />
        <Route path="/wovenrainbowsbyerin/login" element={<PasswordGate />} />
        <Route path="/wovenrainbowsbyerin/blog" element={<BlogEditor />} />

        {/* Core chainmail pages */}
        <Route path="/designer" element={<ChainmailDesigner />} />
        <Route path="/erin2d" element={<ErinPattern2D />} />
        <Route path="/chart" element={<RingSizeChart />} />
        <Route path="/tuner" element={<ChainmailWeaveTuner />} />
        <Route path="/atlas" element={<ChainmailWeaveAtlas />} />
        <Route path="/blog-editor" element={<BlogEditor />} />

        {/* Dev-only routes */}
        {DevRoutes}

        {/* 🧰 Freeform Mode — ALWAYS protected (dev + prod) */}
        <Route
          path="/freeform"
          element={
            localStorage.getItem("freeformAuth") === "true"
              ? <FreeformChainmail2D />
              : <Navigate to="/wovenrainbowsbyerin/login" state={{ redirect: "/freeform" }} />
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/wovenrainbowsbyerin" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);