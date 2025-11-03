// ======================================================
// src/main.tsx — Root Renderer (Router-Wrapped Final Version)
// ======================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// ------------------------------------------------------
// 🪶 Core Pages & Components
// ------------------------------------------------------
import HomeWovenRainbows from "./pages/HomeWovenRainbows";  // 🌈 Erin’s main homepage
import PasswordGate from "./pages/PasswordGate";            // 🔐 Password access screen
import BlogEditor from "./pages/BlogEditor";                // 🪶 Blog viewer & editor
import ChainmailDesigner from "./App";                      // 🧩 Main 3D Designer
import ErinPattern2D from "./pages/ErinPattern2D";          // 🧶 Erin’s 2D Designer
import RingSizeChart from "./pages/RingSizeChart";          // 📊 Size Chart
import ChainmailWeaveTuner from "./pages/ChainmailWeaveTuner"; // ⚙️ Weave Tuner
import ChainmailWeaveAtlas from "./pages/ChainmailWeaveAtlas"; // 🌐 Weave Atlas

// ------------------------------------------------------
// 🧰 Global Styles
// ------------------------------------------------------
import "./index.css";

// ------------------------------------------------------
// 🧑‍💻 Developer-Only Tools (Loaded only in dev mode)
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

// ------------------------------------------------------
// 🧭 Root Router + Route Definitions
// ------------------------------------------------------
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 🏠 Default redirect to home */}
        <Route path="/" element={<Navigate to="/wovenrainbowsbyerin" replace />} />

        {/* 🌈 Home Page */}
        <Route path="/wovenrainbowsbyerin" element={<HomeWovenRainbows />} />

        {/* 🔐 Access Code Page (Password Gate) */}
        <Route path="/wovenrainbowsbyerin/login" element={<PasswordGate />} />

        {/* 🪶 Erin’s Blog Page (Public After Login) */}
        <Route path="/wovenrainbowsbyerin/blog" element={<BlogEditor />} />

        {/* 🧩 Main Chainmail Designer (3D) */}
        <Route path="/designer" element={<ChainmailDesigner />} />

        {/* 🧶 Erin’s 2D Pattern Page */}
        <Route path="/erin2d" element={<ErinPattern2D />} />

        {/* 📊 Ring Size Chart */}
        <Route path="/chart" element={<RingSizeChart />} />

        {/* ⚙️ Weave Tuner */}
        <Route path="/tuner" element={<ChainmailWeaveTuner />} />

        {/* 🌐 Weave Atlas */}
        <Route path="/atlas" element={<ChainmailWeaveAtlas />} />

        {/* 🪶 Blog Editor (Direct Access — Internal Use) */}
        <Route path="/blog-editor" element={<BlogEditor />} />

        {/* 🧰 Developer Tools (only visible in dev mode) */}
        {DevRoutes}

        {/* 🚫 Fallback — redirect unknown routes to home */}
        <Route path="*" element={<Navigate to="/wovenrainbowsbyerin" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);