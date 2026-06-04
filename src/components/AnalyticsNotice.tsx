// src/components/AnalyticsNotice.tsx
// First-visit transparency banner. We tell users plainly that we use
// first-party, privacy-friendly analytics and point them to the opt-out in the
// Privacy Policy. Dismissible; shown once (tracked in localStorage).
import { useState } from "react";
import { Link } from "react-router-dom";
import { analyticsOptedOut } from "../lib/analytics";

const SEEN_KEY = "chainmail_analytics_notice_seen";

export default function AnalyticsNotice() {
  const [show, setShow] = useState<boolean>(() => {
    try {
      if (analyticsOptedOut()) return false;
      return localStorage.getItem(SEEN_KEY) !== "1";
    } catch {
      return false;
    }
  });

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — banner just won't be suppressed next time */
    }
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Analytics notice"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 9000,
        maxWidth: 560,
        margin: "0 auto",
        background: "rgba(17,24,39,0.97)",
        border: "1px solid #334155",
        borderRadius: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: "#e5e7eb",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>🔒</span>
      <span style={{ flex: 1 }}>
        We use <strong>private, first-party analytics</strong> to see which features get
        used and improve the app — no third-party trackers or ads.{" "}
        <Link to="/privacy" style={{ color: "#60a5fa", textDecoration: "none" }}>
          Learn more or opt out
        </Link>
        .
      </span>
      <button
        onClick={dismiss}
        style={{
          flexShrink: 0,
          background: "#7c3aed",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "7px 14px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Got it
      </button>
    </div>
  );
}
