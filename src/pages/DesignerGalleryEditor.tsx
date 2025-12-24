// ======================================================
// src/pages/DesignerGalleryEditor.tsx — Updated w/ Add Image Feature
// ======================================================

import React, { useState, useEffect } from "react";

interface DesignerImage {
  file: string;
  title: string;
  description: string;
  preview?: string;
}

const DesignerGalleryEditor: React.FC = () => {
  const [images, setImages] = useState<DesignerImage[]>([]);
  const [initialized, setInitialized] = useState(false);

  // === Load all images in /public/images/designer on mount ===
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    // Attempt to fetch pre-existing images in folder
    fetch("/images/designer/")
      .then(() => {
        // Static import context for Vite dev builds
        const importCtx = import.meta.glob("/public/images/designer/*", {
          as: "url",
        });
        const keys = Object.keys(importCtx);

        const initialImages = keys.map((path) => {
          const file = path.split("/").pop()!;
          return {
            file,
            title: file.replace(/\.\w+$/, ""),
            description: "",
            preview: `/images/designer/${file}`,
          };
        });
        setImages(initialImages);
      })
      .catch(() => {
        console.warn(
          "⚠️ Could not auto-load designer images; use Add Image to import manually.",
        );
      });
  }, [initialized]);

  // === Add new image manually ===
  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const newImg: DesignerImage = {
        file: file.name,
        title: file.name.replace(/\.\w+$/, ""),
        description: "",
        preview: ev.target?.result as string,
      };
      setImages((prev) => [...prev, newImg]);
    };
    reader.readAsDataURL(file);
  };

  // === Update title or description ===
  const updateField = (
    idx: number,
    key: "title" | "description",
    value: string,
  ) => {
    setImages((prev) =>
      prev.map((img, i) => (i === idx ? { ...img, [key]: value } : img)),
    );
  };

  // === Export JSON ===
  const handleExport = () => {
    const data = images.map(({ file, title, description }) => ({
      file,
      title,
      description,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "designer_features.json";
    a.click();
  };

  return (
    <div
      style={{
        background: "#0f1115",
        minHeight: "100vh",
        color: "#f1f5f9",
        fontFamily: "Inter, sans-serif",
        padding: "30px",
      }}
    >
      <h1 style={{ fontSize: "1.8rem", textAlign: "center", marginBottom: 20 }}>
        🪶 Designer Gallery Editor
      </h1>

      {/* === Toolbar === */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <label
          style={{
            background: "#1e293b",
            padding: "10px 16px",
            borderRadius: 8,
            cursor: "pointer",
            color: "#60a5fa",
          }}
        >
          ➕ Add Image
          <input
            type="file"
            accept="image/*"
            onChange={handleAddImage}
            style={{ display: "none" }}
          />
        </label>
        <button
          onClick={handleExport}
          style={{
            background: "#2563eb",
            color: "white",
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          💾 Export designer_features.json
        </button>
      </div>

      {/* === Image Grid === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 24,
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        {images.map((img, idx) => (
          <div
            key={idx}
            style={{
              background: "#1f2937",
              borderRadius: 10,
              padding: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            <img
              src={img.preview}
              alt={img.file}
              style={{
                width: "100%",
                height: 160,
                objectFit: "cover",
                borderRadius: 6,
                marginBottom: 10,
              }}
            />
            <input
              value={img.title}
              onChange={(e) => updateField(idx, "title", e.target.value)}
              placeholder="Enter title..."
              style={{
                width: "100%",
                marginBottom: 6,
                padding: 6,
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "white",
              }}
            />
            <textarea
              value={img.description}
              onChange={(e) => updateField(idx, "description", e.target.value)}
              placeholder="Enter description..."
              rows={3}
              style={{
                width: "100%",
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "white",
                resize: "vertical",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DesignerGalleryEditor;
