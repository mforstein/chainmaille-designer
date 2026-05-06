// src/pages/ReleaseNotes.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DraggableCompassNav, DraggablePill } from "../App";
import { IconHamburger } from "../components/icons/ToolIcons";

interface BlogEntry {
  author: string;
  content: string;
  timestamp: string;
}

export default function ReleaseNotes() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<BlogEntry[]>([]);
  const [showCompass, setShowCompass] = useState(false);
  const isAdmin = localStorage.getItem("authUser") === "erin" || localStorage.getItem("authUser") === "micah";

  useEffect(() => {
    fetch("/blog_entries.json")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEntries([...data].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ background: "linear-gradient(180deg, #0f1115 0%, #1a1c22 100%)", color: "#f1f5f9", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>

      {/* Header */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(15,17,21,0.97)", borderBottom: "1px solid #1e293b", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => navigate("/wovenrainbowsbyerin")}
          style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          ← Home
        </button>
        <span style={{ fontWeight: 800, fontSize: "1rem" }}>Release Notes</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => navigate("/manual")}
            style={{ background: "#1e293b", color: "#60a5fa", border: "1px solid #334155", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            📖 User Manual
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate("/blog-editor")}
              style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
            >
              + Post Update
            </button>
          )}
        </div>
      </div>

      {/* Hamburger */}
      <DraggablePill id="relnotes-nav" defaultPosition={{ x: 20, y: 80 }}>
        <button
          onClick={() => setShowCompass(v => !v)}
          style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid #1e293b", background: "#1f2937", color: "#d1d5db", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <IconHamburger size={18} />
        </button>
      </DraggablePill>
      {showCompass && <DraggableCompassNav onNavigate={() => setShowCompass(false)} />}

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "100px 20px 60px" }}>

        <p style={{ color: "#64748b", marginBottom: 32, fontSize: 14 }}>
          All release notes and updates for Chainmail Studio by Woven Rainbows by Erin.
        </p>

        {entries.length === 0 && (
          <div style={{ textAlign: "center", color: "#475569", padding: 40 }}>No release notes yet.</div>
        )}

        {entries.map((e, i) => (
          <div
            key={i}
            style={{
              background: i === 0 ? "#1a2540" : "#1f2937",
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
              border: i === 0 ? "1px solid #3b82f6" : "1px solid transparent",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            {i === 0 && (
              <div style={{ display: "inline-block", background: "#1d4ed8", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, marginBottom: 10 }}>
                LATEST
              </div>
            )}
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 14, marginBottom: 10 }}>
              {e.content}
            </div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>
              — {e.author}, {new Date(e.timestamp).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
        ))}

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <button
            onClick={() => navigate("/manual")}
            style={{ background: "#1e293b", color: "#60a5fa", border: "1px solid #334155", borderRadius: 10, padding: "10px 22px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
          >
            📖 Open User Manual
          </button>
        </div>
      </div>
    </div>
  );
}
