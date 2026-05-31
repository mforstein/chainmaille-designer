// ======================================================
// src/pages/HomeWovenRainbows.tsx
// Simplified home (per Erin, 2026-05-31): logo + title + tagline,
// workspace navigator panel inline (replaces the standalone
// /workspace page), latest release notes + manual. Etsy strip,
// designer features gallery, blog feed, and the redundant
// "Access Studio" hero were all removed.
// ======================================================

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

interface BlogEntry {
  author: string;
  content: string;
  timestamp: string;
}

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
  const [latestPost, setLatestPost] = useState<BlogEntry | null>(null);

  // Load most recent release note (used to be the "blog" entries; same source).
  useEffect(() => {
    fetch("/blog_entries.json")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const sorted = [...data].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );
          setLatestPost(sorted[0]);
        }
      })
      .catch(() => setLatestPost(null));
  }, []);

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

        {/* Byline */}
        <p
          style={{
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
            marginBottom: 36,
          }}
        >
          This app was created by{" "}
          <strong style={{ color: "#e5e7eb" }}>Micah Forstein</strong>
        </p>

        {/* Workspace Navigator panel */}
        <section style={sectionPanel}>
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
              Workspace Navigator
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link
                to="/pricing"
                style={{
                  fontSize: 12,
                  color: "#a78bfa",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Pricing
              </Link>
              <span
                style={{
                  background: TIER_BADGE_COLOR[tier] ?? "#6b7280",
                  color: "white",
                  borderRadius: 6,
                  padding: "3px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "capitalize",
                }}
              >
                {tier}
              </span>
              {user ? (
                <button
                  onClick={async () => {
                    await signOut();
                  }}
                  style={{
                    background: "none",
                    border: "1px solid #374151",
                    borderRadius: 6,
                    color: "#9ca3af",
                    padding: "3px 10px",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Sign out
                </button>
              ) : (
                <Link
                  to="/auth"
                  style={{
                    background: "none",
                    border: "1px solid #374151",
                    borderRadius: 6,
                    color: "#9ca3af",
                    padding: "3px 10px",
                    fontSize: 12,
                    textDecoration: "none",
                  }}
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>

          {user && (
            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 10 }}>
              {user.email}
            </div>
          )}

          <div style={{ color: "#9ca3af", marginBottom: 12, fontSize: 13 }}>
            Choose a workspace:
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <Link to="/erin2d" style={tileStyle}>
              🪡 Basic
            </Link>
            <Link to="/designer" style={tileStyle}>
              🧩 Designer (3D)
            </Link>
            <Link to="/freeform" style={tileStyle}>
              ✨ Studio
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
            <Link to="/tuner" style={tileStyle}>
              ⚙️ Weave Tuner
            </Link>
            <Link to="/atlas" style={tileStyle}>
              🌐 Weave Atlas
            </Link>
          </div>
        </section>

        {/* Latest Release Notes */}
        {latestPost && (
          <section style={sectionPanel}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>
              Latest Release Notes
            </h3>
            <p
              style={{
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                color: "#cbd5e1",
                margin: "0 0 10px",
              }}
            >
              {latestPost.content}
            </p>
            <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 14 }}>
              — {latestPost.author},{" "}
              {new Date(latestPost.timestamp).toLocaleDateString()}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
            </div>
          </section>
        )}

        {/* Footer */}
        <footer
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 14,
            marginTop: 32,
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          <Link to="/eula" style={{ color: "#6b7280", textDecoration: "none" }}>
            EULA
          </Link>
          <span>·</span>
          <Link to="/privacy" style={{ color: "#6b7280", textDecoration: "none" }}>
            Privacy
          </Link>
          <span>·</span>
          <Link to="/manual" style={{ color: "#6b7280", textDecoration: "none" }}>
            Manual
          </Link>
        </footer>
      </div>
    </div>
  );
};

export default HomeWovenRainbows;
