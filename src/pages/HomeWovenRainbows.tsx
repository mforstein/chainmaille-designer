// ======================================================
// src/pages/HomeWovenRainbows.tsx — with Blog System + Feather Access Button
// ======================================================

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface EtsyItem {
  title: string;
  price: string;
  currency: string;
  image_url: string;
  url: string;
}

interface DesignerFeature {
  file: string;
  title: string;
  description: string;
}

interface BlogEntry {
  author: string;
  content: string;
  timestamp: string;
}

const HomeWovenRainbows: React.FC = () => {
  const [items, setItems] = useState<EtsyItem[]>([]);
  const [features, setFeatures] = useState<DesignerFeature[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [blogEntries, setBlogEntries] = useState<BlogEntry[]>([]);
  const [newPost, setNewPost] = useState("");
  const navigate = useNavigate();

  // Simulated Erin login (to be replaced with PasswordGate or real auth)
  const [isErin, setIsErin] = useState(() => {
    return localStorage.getItem("authUser") === "erin";
  });

  // Secret feather fade-in control
  const [showFeather, setShowFeather] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowFeather(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Load Etsy items
  useEffect(() => {
    fetch("/wovenrainbows_listings_featured.json")
      .then((res) => res.json())
      .then((data) => setItems(data.items || []))
      .catch((err) => console.error("Failed to load Etsy listings:", err));
  }, []);

  // Load Designer features
  useEffect(() => {
    fetch("/designer_features.json")
      .then((res) => res.json())
      .then((data) => setFeatures(data || []))
      .catch((err) => console.error("Failed to load designer features:", err));
  }, []);

  // Load Blog Entries
  useEffect(() => {
    fetch("/blog_entries.json")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const sorted = [...data].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setBlogEntries(sorted);
        } else {
          setBlogEntries([]);
        }
      })
      .catch(() => setBlogEntries([]));
  }, []);

  // Add new blog post (for Erin only)
  const handleAddPost = () => {
    if (!newPost.trim()) return;
    const newEntry: BlogEntry = {
      author: "Erin",
      content: newPost.trim(),
      timestamp: new Date().toISOString(),
    };
    const updated = [newEntry, ...blogEntries];
    setBlogEntries(updated);
    setNewPost("");

    // Save locally in dev mode — Netlify won’t persist this
    try {
      fetch("/save-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      }).catch(() => {});
    } catch {
      console.warn("Save-blog route unavailable (local only)");
    }
  };

  const latestPost = blogEntries[0];
  const olderPosts = blogEntries.slice(1);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0f1115 0%, #1a1c22 100%)",
        color: "#f1f5f9",
        fontFamily: "Inter, sans-serif",
        padding: "40px 20px",
      }}
    >
      {/* ======= Logo ======= */}
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <img
          src="/images/logo.png"
          alt="Woven Rainbows by Erin"
          style={{
            width: "180px",
            height: "auto",
            borderRadius: "12px",
            boxShadow: "0 0 18px rgba(255,255,255,0.2)",
          }}
        />
      </div>

      {/* ======= About Section ======= */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          textAlign: "center",
          marginBottom: 40,
          lineHeight: 1.6,
        }}
      >
        <h1 style={{ fontSize: "2rem", marginBottom: 10 }}>
          🌈 Woven Rainbows by Erin
        </h1>
        <p style={{ marginBottom: 10 }}>
          This app was created by <strong>Micah Forstein</strong> for his wife{" "}
          <strong>Erin Forstein</strong>’s 50th birthday as a special present.
        </p>
        <p style={{ marginBottom: 10 }}>
          Erin is my muse and inspiration for everything I do, and I love her deeply.
        </p>
        <p>
          You can see Erin’s beautiful chainmaille creations on her Etsy shop:{" "}
          <a
            href="https://www.etsy.com/shop/WovenRainbowsByErin"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#60a5fa", textDecoration: "none" }}
          >
            Woven Rainbows by Erin on Etsy
          </a>
          .
        </p>
      </div>

      {/* ======= ✍️ Blog Input (Top, only for Erin) ======= */}
      {isErin && (
        <div
          style={{
            maxWidth: 800,
            margin: "0 auto 60px",
            background: "#1f2937",
            padding: 20,
            borderRadius: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", marginBottom: 10 }}>✍️ Add a New Blog Entry</h2>
          <textarea
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            rows={4}
            placeholder="Write a new update, design note, or thought..."
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
            ➕ Post Entry
          </button>
        </div>
      )}

      {/* ======= 🪶 Latest Blog Entry (Top of Etsy Section) ======= */}
      {latestPost && (
        <div
          style={{
            maxWidth: 800,
            margin: "0 auto 40px",
            background: "#1f2937",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
<h2 style={{ fontSize: "1.6rem", marginBottom: 10 }}>
  <span
    role="img"
    aria-label="feather"
    style={{
      fontSize: "1.6rem",
      marginRight: 8,
      verticalAlign: "middle",
      filter: "drop-shadow(0 0 2px rgba(255,255,255,0.3))",
    }}
  >
    🪶
  </span>
  Erin’s Latest Studio Note
</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{latestPost.content}</p>
          <div style={{ marginTop: 10, color: "#9ca3af", fontSize: 13 }}>
            — {latestPost.author}, {new Date(latestPost.timestamp).toLocaleDateString()}
          </div>
        </div>
      )}

      {/* ======= Etsy Product Grid ======= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "22px",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        {items.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#1f2937",
              borderRadius: 12,
              overflow: "hidden",
              textDecoration: "none",
              color: "inherit",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 200,
                overflow: "hidden",
                background: "#111",
              }}
            >
              <img
                src={item.image_url}
                alt={item.title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "1rem",
                  marginBottom: 6,
                  lineHeight: 1.3,
                }}
              >
                {item.title}
              </div>
              <div style={{ color: "#93c5fd" }}>
                {item.price} {item.currency}
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* ======= Designer Showcase Section ======= */}
      <div
        style={{
          maxWidth: 1200,
          margin: "80px auto 60px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: "1.8rem", marginBottom: 20 }}>
          💎 What You Can Do with the Chainmaille Designer
        </h2>

        <div style={{ marginBottom: 40 }}>
          <button
            onClick={() => navigate("/wovenrainbowsbyerin/login")}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              padding: "12px 24px",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: "1.1rem",
              fontWeight: 600,
              boxShadow: "0 4px 14px rgba(37,99,235,0.4)",
              transition: "transform 0.2s ease",
            }}
          >
            🧩 Access Designer
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "24px",
            padding: "0 10px",
          }}
        >
          {features.map((f, i) => (
            <div
              key={i}
              onClick={() => setLightbox(`/images/designer/${f.file}`)}
              style={{
                background: "#1f2937",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                cursor: "pointer",
              }}
            >
              <img
                src={`/images/designer/${f.file}`}
                alt={f.title}
                style={{
                  width: "100%",
                  height: 180,
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <div style={{ padding: "12px 14px" }}>
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 600,
                    marginBottom: 6,
                    color: "#f9fafb",
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.4 }}>
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ======= 📰 Older Blog Posts ======= */}
      {olderPosts.length > 0 && (
        <div
          style={{
            maxWidth: 800,
            margin: "60px auto",
            background: "#1f2937",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <h2 style={{ fontSize: "1.6rem", marginBottom: 20, textAlign: "center" }}>
            📰 Past Studio Notes
          </h2>
          {olderPosts.map((b, i) => (
            <div
              key={i}
              style={{
                background: "#111827",
                borderRadius: 8,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <p style={{ marginBottom: 6 }}>{b.content}</p>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                — {b.author}, {new Date(b.timestamp).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

{/* ======= Lightbox ======= */}
{lightbox && (
  <div
    onClick={() => setLightbox(null)}
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      cursor: "zoom-out",
    }}
  >
    <img
      src={lightbox}
      alt="Preview"
      style={{
        maxWidth: "90%",
        maxHeight: "90%",
        borderRadius: 12,
        boxShadow: "0 0 20px rgba(255,255,255,0.2)",
      }}
    />
  </div>
)}

{/* ======= 🪶 Secret Blog Access Button (for Erin) ======= */}
{showFeather && (
  <div
    style={{
      position: "fixed",
      bottom: 20,
      right: 20,
      opacity: 0.4,
      transition: "opacity 0.2s ease",
      zIndex: 2000,
    }}
    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
  >
    <button
      onClick={() => {
        const pass = prompt("Enter Erin’s access code:");
        if (pass === "ERIN50") {
          navigate("/blog-editor");
        } else if (pass) {
          alert("Incorrect code ❌");
        }
      }}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        userSelect: "none",
      }}
      title="Secret Blog Access"
    >
      <span
        style={{
          fontSize: "2rem",
          opacity: 0.85,
          filter: "drop-shadow(0 0 6px rgba(255,255,255,0.25))",
          transition: "transform 0.3s ease",
          display: "inline-block",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
      >
        🪶
      </span>
    </button>
  </div>
)}
{/* ✅ closes main container */}
</div>
);
};

export default HomeWovenRainbows;