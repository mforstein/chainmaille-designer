// ======================================================
// src/pages/BlogEditor.tsx — Full Version with Back Button
// ======================================================

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface BlogEntry {
  author: string;
  content: string;
  timestamp: string;
}

const BlogEditor: React.FC = () => {
  const [entries, setEntries] = useState<BlogEntry[]>([]);
  const [newContent, setNewContent] = useState("");
  const navigate = useNavigate();

  // Load blog entries
  useEffect(() => {
    fetch("/blog_entries.json")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const sorted = [...data].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );
          setEntries(sorted);
        }
      })
      .catch(() => setEntries([]));
  }, []);

  // Save blog entries to file (local dev only)
  const saveEntries = (updated: BlogEntry[]) => {
    setEntries(updated);
    try {
      fetch("/save-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      }).catch(() => {});
    } catch {
      console.warn("Save-blog route unavailable (static environment)");
    }
  };

  // Add new post
  const handleAddPost = () => {
    if (!newContent.trim()) return;
    const newEntry: BlogEntry = {
      author: "Erin",
      content: newContent.trim(),
      timestamp: new Date().toISOString(),
    };
    const updated = [newEntry, ...entries];
    setNewContent("");
    saveEntries(updated);
  };

  // Delete a post
  const handleDelete = (index: number) => {
    if (!window.confirm("Delete this entry?")) return;
    const updated = entries.filter((_, i) => i !== index);
    saveEntries(updated);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f1115",
        color: "#f1f5f9",
        fontFamily: "Inter, sans-serif",
        padding: "40px 20px",
      }}
    >
      {/* ======= Navigation ======= */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>🪶 Blog Editor</h1>
        <button
          onClick={() => navigate("/wovenrainbowsbyerin")}
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 500,
            boxShadow: "0 4px 10px rgba(37,99,235,0.4)",
            transition: "transform 0.2s ease",
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
        >
          🏠 Back to Home
        </button>
      </div>

      {/* ======= New Post Form ======= */}
      <div
        style={{
          background: "#1f2937",
          borderRadius: 12,
          padding: 20,
          marginBottom: 40,
          boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
          maxWidth: 800,
          marginInline: "auto",
        }}
      >
        <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>
          ✍️ Add New Post
        </h2>
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={5}
          placeholder="Write something new..."
          style={{
            width: "100%",
            borderRadius: 8,
            padding: 10,
            background: "#111827",
            color: "#f1f5f9",
            border: "1px solid #374151",
            marginBottom: 10,
            resize: "vertical",
          }}
        />
        <button
          onClick={handleAddPost}
          style={{
            background: "#16a34a",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "1rem",
            boxShadow: "0 4px 10px rgba(22,163,74,0.4)",
          }}
        >
          ➕ Post Entry
        </button>
      </div>

      {/* ======= Blog Entries List ======= */}
      <div
        style={{
          maxWidth: 800,
          marginInline: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {entries.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center" }}>
            No posts yet. Add your first update above!
          </p>
        ) : (
          entries.map((entry, i) => (
            <div
              key={i}
              style={{
                background: "#1f2937",
                borderRadius: 10,
                padding: 16,
                boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {entry.content}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#9ca3af",
                  fontSize: 13,
                }}
              >
                <span>
                  — {entry.author}, {new Date(entry.timestamp).toLocaleString()}
                </span>
                <button
                  onClick={() => handleDelete(i)}
                  style={{
                    background: "#b91c1c",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  ❌ Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BlogEditor;
