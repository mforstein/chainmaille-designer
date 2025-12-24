import React, { useEffect, useState } from "react";

interface BlogEntry {
  author: string;
  content: string;
  timestamp: string;
}

const BlogManager: React.FC = () => {
  const [entries, setEntries] = useState<BlogEntry[]>([]);
  const [newPost, setNewPost] = useState("");

  useEffect(() => {
    fetch("/blog_entries.json")
      .then((res) => res.json())
      .then((data) => setEntries(data || []))
      .catch(() => setEntries([]));
  }, []);

  const handleAddPost = () => {
    if (!newPost.trim()) return;
    const newEntry = {
      author: "Erin",
      content: newPost,
      timestamp: new Date().toISOString(),
    };
    const updated = [newEntry, ...entries];
    setEntries(updated);
    setNewPost("");

    // Optional local persistence for dev
    fetch("/save-blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    }).catch(console.error);
  };
  const isErin = localStorage.getItem("authUser") === "erin";
  if (!isErin) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
          background: "#0f1115",
        }}
      >
        🔒 Blog access restricted to Erin.
      </div>
    );
  }
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#0f1115,#1a1c22)",
        color: "#f1f5f9",
        fontFamily: "Inter, sans-serif",
        padding: "40px 20px",
      }}
    >
      <h1 style={{ fontSize: "1.8rem", marginBottom: 20 }}>
        🪶 Erin’s Blog Manager
      </h1>

      <div
        style={{
          background: "#1f2937",
          borderRadius: 10,
          padding: 20,
          maxWidth: 800,
          margin: "0 auto 30px",
        }}
      >
        <textarea
          rows={4}
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          placeholder="Write a new note or studio update..."
          style={{
            width: "100%",
            borderRadius: 8,
            padding: 10,
            background: "#111827",
            color: "#f1f5f9",
            border: "1px solid #374151",
            marginBottom: 10,
          }}
        />
        <button
          onClick={handleAddPost}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ➕ Add Entry
        </button>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ fontSize: "1.4rem", marginBottom: 12 }}>Previous Posts</h2>
        {entries.length === 0 && (
          <p style={{ color: "#94a3b8" }}>
            No blog entries yet — start by writing one!
          </p>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            style={{
              background: "#1e293b",
              borderRadius: 10,
              padding: 14,
              marginBottom: 10,
            }}
          >
            <p style={{ marginBottom: 6 }}>{entry.content}</p>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              — {entry.author}, {new Date(entry.timestamp).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BlogManager;
