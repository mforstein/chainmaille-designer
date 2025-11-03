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
  fetch("/wovenrainbows_listings_featured.json")
    .then((res) => res.json())
    .then((data) => {
      console.log("✅ Loaded Etsy items:", data);
      setItems(Array.isArray(data) ? data : data.items || []);
    })
    .catch((err) => console.error("❌ Failed to load Etsy listings:", err));
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
        background: "linear-gradient(180deg, #0f1115 0%, #1a1c22 100%)",
        color: "#f1f5f9",
        fontFamily: "Inter, sans-serif",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        margin: 0,
      }}
    >
      {/* ======= Page Content Wrapper ======= */}
      <div style={{ flex: 1, padding: "40px 20px 0" }}>
        {/* ======= Logo ======= */}
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <img
            src="/images/logo.jpg"
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

        {/* ======= Blog Section ======= */}
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
    margin: "0 auto 60px",
  }}
>
  {items.map((item, i) => {
    // ✅ Determine correct image source
    const imageSrc = item.image_url?.startsWith("http")
      ? item.image_url // Etsy-hosted
      : `/images/etsy/${item.image_url
          ?.replace(/^\.\/|^\/?images\/etsy\//, "") // clean any leading ./ or /images/etsy/
          .trim()}`;

    return (
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
  src={
    item.image_url?.startsWith("http")
      ? item.image_url // ✅ Use Etsy-hosted image directly
      : item.image_url?.startsWith("/")
      ? item.image_url // ✅ Local /images/etsy/ path
      : `/images/etsy/${item.image_url}` // ✅ Fallback for local files without slash
  }
  alt={item.title || "Etsy listing"}
  onError={(e) => {
    console.warn("⚠️ Image failed:", item.image_url);
    e.currentTarget.src = "/images/placeholder.png";
  }}
  style={{
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    background: "#222",
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
    );
  })}
</div>
        {/* ======= Designer Button ======= */}
        <div style={{ textAlign: "center", paddingBottom: 40 }}>
          <h2 style={{ fontSize: "1.8rem", marginBottom: 20 }}>
            💎 Explore the Chainmaille Designer
          </h2>
          <p
            style={{
              color: "#cbd5e1",
              fontSize: "1rem",
              maxWidth: 600,
              margin: "0 auto 30px",
              lineHeight: 1.6,
            }}
          >
            Experiment with patterns, colors, and layouts using the interactive
            Chainmaille Designer tool — created to help you visualize and plan
            your next woven artwork.
          </p>
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
            }}
          >
            🧩 Access Designer
          </button>
        </div>
      </div>
      {/* ======= Hidden Feather (Easter Egg Blog Access) ======= */}
      {showFeather && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 1000,
            cursor: "pointer",
            opacity: 0.8,
            transform: "translateY(0)",
            transition: "opacity 0.4s ease, transform 0.4s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
          onClick={() =>
            navigate("/wovenrainbowsbyerin/login", {
              state: { redirect: "/wovenrainbowsbyerin/blog" },
            })
          }
        >
          <span
            role="img"
            aria-label="feather"
            style={{
              fontSize: "2rem",
              filter: "drop-shadow(0 0 6px rgba(255,255,255,0.4))",
              animation: "floatFeather 3s ease-in-out infinite",
            }}
          >
            🪶
          </span>
        </div>
      )}
      {/* ======= Footer Band (removes white line) ======= */}
      <div
        style={{
          height: "20px",
          background: "#1a1c22",
          width: "100%",
        }}
      />
    </div>
  );
};
// Floating feather animation
const styleSheet = document.styleSheets[0];
if (
  styleSheet &&
  !Array.from(styleSheet.cssRules).some(
    (rule) => (rule as CSSKeyframesRule).name === "floatFeather"
  )
) {
  styleSheet.insertRule(
    `
    @keyframes floatFeather {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }
  `,
    styleSheet.cssRules.length
  );
}

export default HomeWovenRainbows;