// ======================================================
// src/main.tsx — Root Renderer (Router-Wrapped Final Version)
// ======================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BlogEditor from "./pages/BlogEditor"; // 🪶 Erin’s Private Blog Page

// ------------------------------------------------------
// Core App + Pages
// ------------------------------------------------------
import ChainmailDesigner from "./App";
import RingSizeChart from "./pages/RingSizeChart";
import ChainmailWeaveTuner from "./pages/ChainmailWeaveTuner";
import ChainmailWeaveAtlas from "./pages/ChainmailWeaveAtlas";
import HomeWovenRainbows from "./pages/HomeWovenRainbows";
import PasswordGate from "./pages/PasswordGate"; // ✅ Access control

// ------------------------------------------------------
// Global Styles
// ------------------------------------------------------
import "./index.css";

// ------------------------------------------------------
// 🔧 Conditionally load developer-only tools (only during dev)
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
          <React.Suspense
            fallback={<div style={{ color: "white", padding: 20 }}>Loading matcher...</div>}
          >
            <ImageMatcher />
          </React.Suspense>
        }
      />
      <Route
        path="/designer-editor"
        element={
          <React.Suspense
            fallback={<div style={{ color: "white", padding: 20 }}>Loading editor...</div>}
          >
            <DesignerGalleryEditor />
          </React.Suspense>
        }
      />
    </>
  );
}

// ------------------------------------------------------
// ROOT RENDERER
// ------------------------------------------------------
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 🏠 Default redirect to home */}
        <Route path="/" element={<Navigate to="/wovenrainbowsbyerin" replace />} />

        {/* 🌈 Home Page */}
        <Route path="/wovenrainbowsbyerin" element={<HomeWovenRainbows />} />

        {/* 🔐 Access Code Page */}
        <Route path="/wovenrainbowsbyerin/login" element={<PasswordGate />} />

        {/* 🧩 Main Chainmail Designer */}
        <Route path="/designer" element={<ChainmailDesigner />} />

        {/* 📊 Ring Size Chart */}
        <Route path="/chart" element={<RingSizeChart />} />

        {/* ⚙️ Weave Tuner */}
        <Route path="/tuner" element={<ChainmailWeaveTuner />} />

        {/* 🌐 Weave Atlas */}
        <Route path="/atlas" element={<ChainmailWeaveAtlas />} />

        {/* 🪶 Erin’s Blog Editor (Private Page) */}
        <Route path="/blog-editor" element={<BlogEditor />} />

        {/* 🧰 Developer Tools (only visible in dev mode) */}
        {DevRoutes}

        {/* 🚫 Fallback — redirect all unknown routes to home */}
        <Route path="*" element={<Navigate to="/wovenrainbowsbyerin" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);