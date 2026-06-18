// ======================================================
// src/pages/HomeWovenRainbows.tsx
// Simplified home (per Erin, 2026-05-31): logo + title + tagline,
// workspace navigator panel inline (replaces the standalone
// /workspace page), latest release notes + manual. Etsy strip,
// designer features gallery, blog feed, and the redundant
// "Access Studio" hero were all removed.
// ======================================================

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const TIER_BADGE_COLOR: Record<string, string> = {
  free: "#6b7280",
  maker: "#0369a1",
  crafter: "#059669",
  studio: "#7c3aed",
};

const tileStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 14px",
  borderRadius: 12,
  textDecoration: "none",
  color: "#dbeafe",
  background: "rgba(15, 23, 42, 0.85)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 20px rgba(0,0,0,.35)",
  fontWeight: 600,
  fontSize: 14,
};

const sectionPanel: React.CSSProperties = {
  background: "rgba(17,24,39,0.6)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 12px 40px rgba(0,0,0,.45)",
  marginBottom: 16,
};

const HomeWovenRainbows: React.FC = () => {
  const navigate = useNavigate();
  const { user, tier, signOut } = useAuth();
  const [showAbout, setShowAbout] = useState(false);

  // Plan shown on the home page: Free unless the user is signed in AND has a
  // Stripe customer (i.e. a real paid subscription set by the Stripe webhook).
  // This ignores dev/legacy tier overrides for display so the badge reflects the
  // actual billed plan — Free when not signed in or no Stripe account.
  const stripeCustomerId = (user as any)?.user_metadata?.stripeCustomerId as
    | string
    | undefined;
  const displayPlan = user && stripeCustomerId ? tier : "free";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0E0F12",
        color: "#e5e7eb",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "env(safe-area-inset-top, 32px) 24px 48px",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <img
            src="/images/logo.png"
            alt="Woven Rainbows by Erin logo"
            style={{
              width: 140,
              height: 140,
              borderRadius: 24,
              background: "white",
              padding: 6,
              boxShadow: "0 12px 40px rgba(255,255,255,0.08)",
            }}
            onError={(e) => {
              // Mobile builds strip the gallery images — hide gracefully so
              // the page still looks intentional.
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = "none";
            }}
          />
        </div>

        {/* Title */}
        <h1
          style={{
            textAlign: "center",
            fontSize: "2rem",
            fontWeight: 800,
            margin: "20px 0 6px",
            color: "#f9fafb",
          }}
        >
          🌈 Woven Rainbows by Erin
        </h1>

        {/* Sub-title */}
        <div
          style={{
            textAlign: "center",
            fontSize: "1.15rem",
            fontWeight: 700,
            color: "#a78bfa",
            margin: "0 0 32px",
          }}
        >
          Chainmail Studio
        </div>

        {/* Workspace Navigator panel */}
        <section style={sectionPanel}>
          {/* Header */}
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 12px", textAlign: "center" }}>
            Workspace Navigator
          </h2>

          <div style={{ color: "#9ca3af", marginBottom: 12, fontSize: 13, textAlign: "center" }}>
            Choose a workspace:
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            {/* Basic (/erin2d) and Freeform (/freeform, "Studio") tiles removed
                per Erin's review — those tools are hidden from the home page.
                Routes remain for deep-linking; manual sections marked "under
                construction". */}
            <Link to="/designer" style={tileStyle}>
              🧩 Designer (3D)
            </Link>
          </div>

          <div
            style={{
              color: "#6b7280",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1,
              margin: "22px 0 10px",
              textAlign: "center",
            }}
          >
            Utilities
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <Link to="/chart" style={tileStyle}>
              📊 Ring Size Chart
            </Link>
            {/* Weave Tuner + Weave Atlas hidden for first release (per Erin);
                they return with scales. Routes remain for deep-linking. */}
          </div>
        </section>

        {/* Plan & Account panel */}
        <section style={sectionPanel}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px", textAlign: "center" }}>
            Plan
          </h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => navigate("/pricing")}
              style={{
                background: "#0f172a",
                color: "#a78bfa",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "7px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              💲 Pricing
            </button>
            <button
              onClick={() => navigate("/pricing")}
              title="Your current plan"
              style={{
                background: TIER_BADGE_COLOR[displayPlan] ?? "#0f172a",
                color: "#fff",
                border: `1px solid ${TIER_BADGE_COLOR[displayPlan] ?? "#334155"}`,
                borderRadius: 8,
                padding: "7px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 800,
                textTransform: "capitalize",
              }}
            >
              {displayPlan}
            </button>
            {user ? (
              <button
                onClick={async () => { await signOut(); }}
                style={{
                  background: "#0f172a",
                  color: "#9ca3af",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => navigate("/auth")}
                style={{
                  background: "#0f172a",
                  color: "#9ca3af",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Sign In
              </button>
            )}
          </div>
        </section>

        {/* Release Notes / Manual / About */}
        <section style={sectionPanel}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px", textAlign: "center" }}>
            Documentation
          </h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => navigate("/release-notes")}
              style={{
                background: "#0f172a",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "7px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              View All Release Notes
            </button>
            <button
              onClick={() => navigate("/manual")}
              style={{
                background: "#0f172a",
                color: "#60a5fa",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "7px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              📖 User Manual
            </button>
            <button
              onClick={() => setShowAbout(true)}
              style={{
                background: "#0f172a",
                color: "#a78bfa",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "7px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ℹ️ About
            </button>
            <button
              onClick={() => navigate("/eula")}
              style={{
                background: "#0f172a",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "7px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              EULA
            </button>
            <button
              onClick={() => navigate("/privacy")}
              style={{
                background: "#0f172a",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "7px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Privacy
            </button>
          </div>
        </section>

        {/* About dialog */}
        {showAbout && (
          <div
            onClick={() => setShowAbout(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
              zIndex: 100000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#0f172a",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 18,
                padding: "28px 32px",
                maxWidth: 360,
                width: "100%",
                textAlign: "center",
                boxShadow: "0 24px 64px rgba(0,0,0,0.75)",
                color: "#e5e7eb",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
                Chainmail Studio
              </div>
              <div style={{ fontSize: 14, color: "#a78bfa", fontWeight: 700, marginBottom: 16 }}>
                Version 1.0
              </div>
              <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.7 }}>
                Written by Micah Forstein
                <br />
                6/10/2026
              </div>
              <button
                onClick={() => setShowAbout(false)}
                style={{
                  marginTop: 22,
                  background: "rgba(167,139,250,0.18)",
                  color: "#e5e7eb",
                  border: "1px solid rgba(167,139,250,0.5)",
                  borderRadius: 10,
                  padding: "9px 22px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeWovenRainbows;
