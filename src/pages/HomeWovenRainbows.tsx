// ======================================================
// src/pages/HomeWovenRainbows.tsx — FINAL VERSION
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

const HomeWovenRainbows: React.FC = () => {
  const [items, setItems] = useState<EtsyItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/wovenrainbows_listings_local.json")
      .then((res) => res.json())
      .then((data) => setItems(data.items || []))
      .catch((err) => console.error("Failed to load Etsy listings:", err));
  }, []);

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

      {/* ======= Product Grid ======= */}
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
        <h2 style={{ fontSize: "1.8rem", marginBottom: 30 }}>
          💎 What You Can Do with the Chainmaille Designer
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "24px",
            padding: "0 10px",
          }}
        >
          {[
            {
              img: "/images/designer/designer-main.png",
              title: "Design in 3D",
              desc: "Visualize chainmaille patterns in full 3D — rotate, zoom, and explore your weave from every angle.",
            },
            {
              img: "/images/designer/designer-paint.png",
              title: "Paint & Color Rings",
              desc: "Use paint and eraser tools to color individual rings, experiment with gradients, and preview metal finishes.",
            },
            {
              img: "/images/designer/designer-materials.png",
              title: "Choose Materials & Suppliers",
              desc: "Select rings from real suppliers and see instant AR (aspect ratio) and material effects.",
            },
            {
              img: "/images/designer/designer-overlay.png",
              title: "Overlay Images",
              desc: "Load a background image to trace patterns or align your chainmaille design with artwork.",
            },
            {
              img: "/images/designer/designer-tuner.png",
              title: "Weave Atlas & Tuner",
              desc: "Access an atlas of known weaves and fine-tune ring geometry to achieve perfect alignment.",
            },
            {
              img: "/images/designer/designer-chart.png",
              title: "Export & Share",
              desc: "Export designs as images or PDFs, and share your creations directly with customers or social media.",
            },
          ].map((feature, i) => (
            <div
              key={i}
              style={{
                background: "#1f2937",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              <img
                src={feature.img}
                alt={feature.title}
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
                  {feature.title}
                </h3>
                <p style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.4 }}>
                  {feature.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ======= Footer / Access Button ======= */}
      <div style={{ textAlign: "center", marginTop: 50 }}>
        <button
          onClick={() => navigate("/wovenrainbowsbyerin/login")}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: 500,
            boxShadow: "0 4px 14px rgba(37,99,235,0.4)",
            transition: "transform 0.2s ease",
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
        >
          🧩 Access Designer
        </button>
      </div>
    </div>
  );
};

export default HomeWovenRainbows;