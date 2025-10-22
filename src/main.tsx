import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom";

// Core app + pages
import App from "./App";
import RingSizeChart from "./pages/RingSizeChart";
import ChainmailWeaveTuner from "./pages/ChainmailWeaveTuner";
import ChainmailWeaveAtlas from "./pages/ChainmailWeaveAtlas";
import RingTestPage from "./pages/RingTestPage";

// Global styles
import "./index.css";

// ======================================================
// === ROOT RENDERER ====================================
// ======================================================
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* 
      BrowserRouter provides client-side routing.
      You can switch to <HashRouter> if you deploy to static hosting
      (like GitHub Pages) where server-side fallback isn't supported.
    */}
    <BrowserRouter>
      <Routes>
        {/* Redirect root → /designer */}
        <Route path="/" element={<Navigate to="/designer" replace />} />

        {/* Main Designer App */}
        <Route path="/designer/*" element={<App />} />

        {/* Supporting Pages */}
        <Route path="/chart" element={<RingSizeChart />} />
        <Route path="/weave-tuner" element={<ChainmailWeaveTuner />} />
        <Route path="/weave-atlas" element={<ChainmailWeaveAtlas />} />
        <Route path="/test" element={<RingTestPage />} />

        {/* Catch-all → Redirect to designer */}
        <Route path="*" element={<Navigate to="/designer" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);