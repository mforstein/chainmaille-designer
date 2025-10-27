// ======================================================
// src/main.tsx — Root Renderer (Router-Wrapped Final Version)
// ======================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// ------------------------------------------------------
// Core App + Pages
// ------------------------------------------------------
import ChainmailDesigner from "./App";
import RingSizeChart from "./pages/RingSizeChart";
import ChainmailWeaveTuner from "./pages/ChainmailWeaveTuner";
import ChainmailWeaveAtlas from "./pages/ChainmailWeaveAtlas";
import HomeWovenRainbows from "./pages/HomeWovenRainbows";
import PasswordGate from "./pages/PasswordGate"; // ✅ import your access page

// ------------------------------------------------------
// Global Styles
// ------------------------------------------------------
import "./index.css";

// ------------------------------------------------------
// ROOT RENDERER
// ------------------------------------------------------
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/wovenrainbowsbyerin" replace />} />

        {/* 🏠 Home Page */}
        <Route path="/wovenrainbowsbyerin" element={<HomeWovenRainbows />} />

        {/* 🔐 Access Code Page (PasswordGate) */}
        <Route path="/wovenrainbowsbyerin/login" element={<PasswordGate />} />

        {/* 🧩 Main Designer */}
        <Route path="/designer" element={<ChainmailDesigner />} />

        {/* 📊 Chart */}
        <Route path="/chart" element={<RingSizeChart />} />

        {/* ⚙️ Tuner */}
        <Route path="/tuner" element={<ChainmailWeaveTuner />} />

        {/* 🌐 Atlas */}
        <Route path="/atlas" element={<ChainmailWeaveAtlas />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/wovenrainbowsbyerin" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);