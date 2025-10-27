// ======================================================
// src/pages/ImageMatcher.tsx — Paste directly into Etsy Preview
// ======================================================

import React, { useState, useEffect, useRef } from "react";

interface EtsyItem {
  title: string;
  url: string;
  image_url: string;
  matchedImage?: string;
}

const ImageMatcher: React.FC = () => {
  const [etsyItems, setEtsyItems] = useState<EtsyItem[]>([]);
  const [localImages, setLocalImages] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");

  const previewRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    fetch("/wovenrainbows_listings_local.json")
      .then((res) => res.json())
      .then((data) => setEtsyItems(data.items || []))
      .catch(() => setStatus("⚠️ Failed to load Etsy listings"));
  }, []);

  useEffect(() => {
    const imgs = [
      "/images/designer/designer-main.png",
      "/images/designer/designer-tuner.png",
      "/images/designer/designer-overlay.png",
      "/images/designer/designer-materials.png",
      "/images/designer/designer-chart.png",
      "/images/designer/designer-paint.png",
    ];
    setLocalImages(imgs);
  }, []);

  // Handle paste on a specific preview box
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>, i: number) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image")) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = (event) => {
          const pasted = event.target?.result as string;
          const updated = [...etsyItems];
          updated[i].image_url = pasted;
          setEtsyItems(updated);
          setStatus(`📋 Pasted new image for "${updated[i].title}"`);
        };
        reader.readAsDataURL(blob);
      }
    }
  };

  const updateMatch = (index: number, value: string) => {
    const updated = [...etsyItems];
    updated[index].matchedImage = value;
    setEtsyItems(updated);
  };

  const saveMatches = () => {
    const blob = new Blob([JSON.stringify({ items: etsyItems }, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "wovenrainbows_matched.json";
    link.click();
    setStatus("✅ Exported wovenrainbows_matched.json");
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "Inter, sans-serif",
        background: "#0f1115",
        color: "#e2e8f0",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ marginBottom: 10 }}>🖼️ Etsy Image Matcher Tool</h1>
      <p style={{ marginBottom: 20, color: "#94a3b8" }}>
        Click a preview box, then press <strong>Ctrl+V</strong> /{" "}
        <strong>Cmd+V</strong> to paste a copied image.
      </p>

      {status && (
        <div style={{ color: "#60a5fa", marginBottom: 15 }}>{status}</div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #334155" }}>
            <th style={{ padding: 8, textAlign: "left" }}>Listing</th>
            <th style={{ padding: 8, textAlign: "left" }}>Etsy Preview (Paste Here)</th>
            <th style={{ padding: 8, textAlign: "left" }}>Matched Image</th>
          </tr>
        </thead>
        <tbody>
          {etsyItems.map((item, i) => (
            <tr
              key={i}
              style={{
                borderBottom: "1px solid #1e293b",
                background: selectedIndex === i ? "#1e293b" : "transparent",
              }}
            >
              <td style={{ padding: 8 }}>
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#60a5fa", fontSize: 12 }}
                >
                  Etsy link ↗
                </a>
              </td>

              {/* PASTE TARGET */}
              <td style={{ padding: 8, textAlign: "center" }}>
                <div
                  ref={(el) => (previewRefs.current[i] = el)}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedIndex(i);
                    previewRefs.current[i]?.focus();
                  }}
                  onPaste={(e) => handlePaste(e, i)}
                  style={{
                    width: 120,
                    height: 120,
                    border:
                      selectedIndex === i
                        ? "2px solid #60a5fa"
                        : "1px solid #334155",
                    borderRadius: 8,
                    background: "#111",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      (Click & Paste)
                    </span>
                  )}
                </div>
              </td>

              {/* Local match dropdown */}
              <td style={{ padding: 8 }}>
                <select
                  value={item.matchedImage || ""}
                  onChange={(e) => updateMatch(i, e.target.value)}
                  style={{
                    background: "#1e293b",
                    color: "white",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    padding: 4,
                    width: 220,
                    marginBottom: 6,
                  }}
                >
                  <option value="">Select local image...</option>
                  {localImages.map((img, idx) => (
                    <option key={idx} value={img}>
                      {img.replace("/images/designer/", "")}
                    </option>
                  ))}
                </select>
                {item.matchedImage && (
                  <div>
                    <img
                      src={item.matchedImage}
                      alt="match"
                      style={{
                        width: 100,
                        height: 100,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid #334155",
                      }}
                    />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 30 }}>
        <button
          onClick={saveMatches}
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          💾 Save Matches
        </button>
      </div>
    </div>
  );
};

export default ImageMatcher;