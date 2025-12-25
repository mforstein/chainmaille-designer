// ======================================================
// src/main.tsx — Root Renderer (Single Router, Clean)
// ======================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { clampPersistedDims } from "./utils/limits";
// ------------------------------------------------------
// Global Styles
// ------------------------------------------------------
import "./index.css";
// 🔒 Early storage fix to avoid OOM before React mounts.
try {
  // Do this for each grid-based page that persists dims:
  clampPersistedDims("erin", { rows: 20, cols: 20 });
  clampPersistedDims("designer", { rows: 20, cols: 20 }); // if you have a second page
} catch {}
// ======================================================
// Root Renderer
// ======================================================
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
