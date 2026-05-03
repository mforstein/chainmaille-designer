// src/components/ImageToDesignPanel.tsx
// Converts a photo of chainmail/scalemail into a freeform designer project.

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  analyzeImage,
  renderAnalysisOverlay,
  autoDetectBackground,
  sampleImagePixel,
  DEFAULT_ANALYSIS_OPTIONS,
  type AnalysisOptions,
  type AnalysisResult,
} from "../lib/imageAnalyzer";

interface Props {
  onLoad: (projectData: any) => void;
  onClose: () => void;
}

const PREVIEW_W = 520;
const PREVIEW_H = 400;

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  marginBottom: 3,
  display: "block",
};

const sliderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
};

const valBadge: React.CSSProperties = {
  fontSize: 11,
  color: "#e2e8f0",
  background: "rgba(255,255,255,0.08)",
  borderRadius: 6,
  padding: "2px 7px",
  minWidth: 34,
  textAlign: "right",
};

const btn = (color: string, disabled = false): React.CSSProperties => ({
  padding: "9px 18px",
  borderRadius: 10,
  border: "none",
  background: disabled ? "rgba(255,255,255,0.08)" : color,
  color: disabled ? "#6b7280" : "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 600,
  fontSize: 13,
  transition: "opacity 0.15s",
});

// ── Result-to-project converter ─────────────────────────────────────────────

function resultToProject(result: AnalysisResult, options: AnalysisOptions): any {
  return {
    type: "freeform",
    version: 1,
    rings: result.rings.map((r) => ({
      row: r.row,
      col: r.col,
      cluster: 1,
      color: r.color,
    })),
    scaleColors: result.scaleColors,
    geometry: {
      innerDiameter: 6,
      wireDiameter: 1.2,
      centerSpacing: 7.4,
      angleIn: 45,
      angleOut: 45,
    },
  };
}

// ── Colour swatch row for detected palette ───────────────────────────────────

function DetectedPalette({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  // Sample up to 12 representative colors
  const step = Math.max(1, Math.floor(colors.length / 12));
  const sample = colors.filter((_, i) => i % step === 0).slice(0, 12);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {sample.map((c, i) => (
        <div
          key={i}
          title={c}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: c,
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        />
      ))}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function ImageToDesignPanel({ onLoad, onClose }: Props) {
  const [options, setOptions] = useState<AnalysisOptions>(DEFAULT_ANALYSIS_OPTIONS);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageName, setImageName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [bgPickMode, setBgPickMode] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-render overlay whenever result, image, or pick mode changes
  useEffect(() => {
    if (!previewCanvasRef.current || !imgRef.current || !imageLoaded) return;
    renderAnalysisOverlay(previewCanvasRef.current, imgRef.current, result, bgPickMode);
  }, [result, imageLoaded, bgPickMode]);

  const runAnalysis = useCallback(() => {
    if (!imgRef.current || !imageLoaded) return;
    setBusy(true);
    // Defer so the UI updates before the potentially heavy analysis
    setTimeout(() => {
      try {
        const r = analyzeImage(imgRef.current!, options);
        setResult(r);
      } finally {
        setBusy(false);
      }
    }, 10);
  }, [options, imageLoaded]);

  // Auto-analyze when image loads
  useEffect(() => {
    if (imageLoaded) runAnalysis();
  }, [imageLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageName(file.name);
    setResult(null);
    setImageLoaded(false);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImageFile(f);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) loadImageFile(f);
  };

  // Click on preview canvas to sample background color
  const handlePreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!bgPickMode || !imgRef.current || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (PREVIEW_W / rect.width);
    const canvasY = (e.clientY - rect.top) * (PREVIEW_H / rect.height);

    // Map canvas coords → image coords
    const img = imgRef.current;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const scale = Math.min(PREVIEW_W / imgW, PREVIEW_H / imgH);
    const ox = (PREVIEW_W - imgW * scale) / 2;
    const oy = (PREVIEW_H - imgH * scale) / 2;
    const imgX = (canvasX - ox) / scale;
    const imgY = (canvasY - oy) / scale;

    const pixel = sampleImagePixel(img, imgX, imgY);
    if (pixel) {
      setOpt("bgColor", pixel);
      setBgPickMode(false);
    }
  };

  const handleAutoDetectBg = () => {
    if (!imgRef.current) return;
    const color = autoDetectBackground(imgRef.current);
    setOpt("bgColor", color);
  };

  // Clipboard paste — Cmd/Ctrl+V anywhere while the panel is open
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            loadImageFile(blob);
            e.preventDefault();
          }
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setOpt = <K extends keyof AnalysisOptions>(key: K, value: AnalysisOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const handleImport = () => {
    if (!result) return;
    const project = resultToProject(result, options);
    onLoad(project);
  };

  const uniqueScaleColors = [...new Set(result?.scaleColors.map((s) => s.color) ?? [])];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 11000,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#111827",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 18,
          boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
          width: "100%",
          maxWidth: 900,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <div>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>
              🖼️ Image → Design Converter
            </span>
            <span style={{ fontSize: 12, color: "#64748b", marginLeft: 10 }}>
              Load a photo of chainmail or scalemail to generate a freeform canvas design
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "none",
              borderRadius: 8,
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "4px 9px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            display: "flex",
            flex: 1,
            minHeight: 0,
            gap: 0,
          }}
        >
          {/* Left: image drop + preview */}
          <div
            style={{
              flex: "1 1 0",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              padding: 16,
              gap: 10,
              minWidth: 0,
            }}
          >
            {/* Drop zone (shown when no image) */}
            {!imageLoaded && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  border: `2px dashed ${dragging ? "#3b82f6" : "rgba(255,255,255,0.18)"}`,
                  borderRadius: 14,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  cursor: "pointer",
                  background: dragging ? "rgba(59,130,246,0.06)" : "rgba(255,255,255,0.02)",
                  transition: "all 0.15s",
                  minHeight: 280,
                }}
              >
                <div style={{ fontSize: 40 }}>🖼️</div>
                <div style={{ color: "#94a3b8", fontSize: 14, textAlign: "center" }}>
                  Drop a photo here<br />
                  <span style={{ color: "#64748b", fontSize: 12 }}>or click to browse · or paste from clipboard</span>
                </div>
                <div style={{ color: "#475569", fontSize: 11, textAlign: "center", maxWidth: 260 }}>
                  Find a photo on Pinterest or Etsy, right-click → Copy Image, then press <kbd style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>⌘V</kbd> here
                </div>
              </div>
            )}

            {/* Preview canvas (shown once image loaded) */}
            {imageLoaded && (
              <>
                <div style={{ color: "#64748b", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                  <span>{imageName}</span>
                  <button
                    onClick={() => { setImageLoaded(false); setResult(null); setImageName(""); imgRef.current = null; }}
                    style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11 }}
                  >
                    ✕ Remove
                  </button>
                </div>
                <canvas
                  ref={previewCanvasRef}
                  width={PREVIEW_W}
                  height={PREVIEW_H}
                  onClick={handlePreviewClick}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: `1px solid ${bgPickMode ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.08)"}`,
                    background: "#0a0a0a",
                    imageRendering: "auto",
                    cursor: bgPickMode ? "crosshair" : "default",
                  }}
                />
                <div style={{ color: "#475569", fontSize: 11, textAlign: "center" }}>
                  Coloured dots = detected rings/scales · Adjust controls then Re-analyze
                </div>
              </>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileInput} />

            {/* Load another image button when image is loaded */}
            {imageLoaded && (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ ...btn("rgba(255,255,255,0.08)"), fontSize: 12, padding: "7px 14px", alignSelf: "flex-start" }}
              >
                🖼️ Load different image
              </button>
            )}
          </div>

          {/* Right: controls + stats */}
          <div
            style={{
              width: 300,
              flexShrink: 0,
              overflowY: "auto",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
              Detection Settings
            </div>

            {/* Grid columns */}
            <label style={labelStyle}>Grid Columns — {options.gridCols}</label>
            <div style={sliderRow}>
              <input
                type="range" min={10} max={60} step={1}
                value={options.gridCols}
                onChange={(e) => setOpt("gridCols", Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={valBadge}>{options.gridCols}</span>
            </div>

            {/* Background threshold (dark backdrops) */}
            <label style={labelStyle}>Dark Background Threshold — {options.bgLumThreshold.toFixed(2)}</label>
            <div style={{ ...sliderRow, marginBottom: 4 }}>
              <input
                type="range" min={0.03} max={0.45} step={0.01}
                value={options.bgLumThreshold}
                onChange={(e) => setOpt("bgLumThreshold", Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={valBadge}>{options.bgLumThreshold.toFixed(2)}</span>
            </div>
            <div style={{ color: "#475569", fontSize: 11, marginBottom: 14 }}>
              For dark backdrops. Raise to cut more dark pixels.
            </div>

            {/* Background color exclusion */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 14,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>
                Ignore Background Color
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <button
                  onClick={handleAutoDetectBg}
                  disabled={!imageLoaded}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "none",
                    background: imageLoaded ? "#0f766e" : "rgba(255,255,255,0.06)",
                    color: imageLoaded ? "#fff" : "#6b7280",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: imageLoaded ? "pointer" : "not-allowed",
                  }}
                >
                  🎯 Auto-detect
                </button>
                <button
                  onClick={() => setBgPickMode((v) => !v)}
                  disabled={!imageLoaded}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "none",
                    background: bgPickMode ? "#dc2626" : (imageLoaded ? "#1e40af" : "rgba(255,255,255,0.06)"),
                    color: imageLoaded ? "#fff" : "#6b7280",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: imageLoaded ? "pointer" : "not-allowed",
                  }}
                >
                  {bgPickMode ? "✕ Cancel" : "🖱️ Click to pick"}
                </button>
              </div>

              {bgPickMode && (
                <div style={{ color: "#fbbf24", fontSize: 11, marginBottom: 8 }}>
                  Click anywhere on the image preview to sample the background color
                </div>
              )}

              {options.bgColor && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: `rgb(${options.bgColor[0]},${options.bgColor[1]},${options.bgColor[2]})`,
                      border: "1px solid rgba(255,255,255,0.2)",
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                      rgb({options.bgColor[0]}, {options.bgColor[1]}, {options.bgColor[2]})
                    </span>
                    <button
                      onClick={() => setOpt("bgColor", null)}
                      style={{ marginLeft: "auto", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}
                    >
                      ✕
                    </button>
                  </div>
                  <label style={{ ...labelStyle, marginBottom: 3 }}>
                    Tolerance — {options.bgColorTolerance}
                  </label>
                  <div style={sliderRow}>
                    <input
                      type="range" min={10} max={150} step={1}
                      value={options.bgColorTolerance}
                      onChange={(e) => setOpt("bgColorTolerance", Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <span style={valBadge}>{options.bgColorTolerance}</span>
                  </div>
                  <div style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>
                    Raise to remove more background variation (shadows, blur edges)
                  </div>
                </>
              )}

              {!options.bgColor && !bgPickMode && (
                <div style={{ color: "#475569", fontSize: 11 }}>
                  Use for white studio backgrounds, coloured drapes, or any non-dark backdrop that the threshold above can't catch.
                </div>
              )}
            </div>

            {/* Include scales */}
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={options.includeScales}
                onChange={(e) => setOpt("includeScales", e.target.checked)}
              />
              <span style={{ color: "#e2e8f0", fontSize: 13 }}>Include scale layer</span>
            </label>

            {options.includeScales && (
              <>
                <label style={labelStyle}>Scale Min Saturation — {options.scaleMinSat.toFixed(2)}</label>
                <div style={{ ...sliderRow, marginBottom: 4 }}>
                  <input
                    type="range" min={0.05} max={0.70} step={0.01}
                    value={options.scaleMinSat}
                    onChange={(e) => setOpt("scaleMinSat", Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={valBadge}>{options.scaleMinSat.toFixed(2)}</span>
                </div>
                <div style={{ color: "#475569", fontSize: 11, marginBottom: 12 }}>
                  Lower = more scales placed. Raise to skip near-grey areas.
                </div>
              </>
            )}

            {/* Ring colour options */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginBottom: 12 }}>
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={options.useImageColorForRings}
                  onChange={(e) => setOpt("useImageColorForRings", e.target.checked)}
                />
                <span style={{ color: "#e2e8f0", fontSize: 13 }}>Use image colours for rings</span>
              </label>
              {!options.useImageColorForRings && (
                <>
                  <label style={labelStyle}>Base ring colour</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {["#374151", "#1f2937", "#6b7280", "#c0c0c0", "#4a1942", "#1a3a5c"].map((c) => (
                      <div
                        key={c}
                        onClick={() => setOpt("ringColor", c)}
                        title={c}
                        style={{
                          width: 22, height: 22, borderRadius: 5,
                          background: c,
                          border: options.ringColor === c ? "2px solid #3b82f6" : "1px solid rgba(255,255,255,0.15)",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={options.ringColor}
                      onChange={(e) => setOpt("ringColor", e.target.value)}
                      title="Custom ring colour"
                      style={{ width: 22, height: 22, borderRadius: 5, border: "none", cursor: "pointer", padding: 0 }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Fill interior */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 14,
            }}>
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={options.fillInterior}
                  onChange={(e) => setOpt("fillInterior", e.target.checked)}
                />
                <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>Fill interior with chainmail</span>
              </label>
              <div style={{ color: "#475569", fontSize: 11, marginBottom: options.fillInterior ? 10 : 0 }}>
                Fills enclosed gaps (open-weave areas, sparse zones) with rings. Use for pieces like this where the lower area has chainmail rings showing through.
              </div>
              {options.fillInterior && (
                <>
                  <label style={labelStyle}>Interior scale density — {Math.round(options.interiorScaleDensity * 100)}%</label>
                  <div style={sliderRow}>
                    <input
                      type="range" min={0} max={0.5} step={0.01}
                      value={options.interiorScaleDensity}
                      onChange={(e) => setOpt("interiorScaleDensity", Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <span style={valBadge}>{Math.round(options.interiorScaleDensity * 100)}%</span>
                  </div>
                  <div style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>
                    Fraction of filled-in cells that also receive a sparse scale — matches scattered scales in chainmail zones
                  </div>
                </>
              )}
            </div>

            {/* Dark border exclusion */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 14,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>
                Exclude Dark Borders
              </div>
              <label style={labelStyle}>
                Trim darkest pixels — {Math.round(options.darkTrimFraction * 100)}%
              </label>
              <div style={sliderRow}>
                <input
                  type="range" min={0} max={0.5} step={0.01}
                  value={options.darkTrimFraction}
                  onChange={(e) => setOpt("darkTrimFraction", Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={valBadge}>{Math.round(options.darkTrimFraction * 100)}%</span>
              </div>
              <div style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>
                Removes dark lead lines / outlines from each cell sample before averaging.
                Try 20–35% for stained glass, 0% for photography.
              </div>
            </div>

            {/* Palette quantization */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 14,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>
                Color Palette Reduction
              </div>
              <label style={labelStyle}>
                {options.paletteSize === 0 ? "Off — use all sampled colors" : `Snap to ${options.paletteSize} colors`}
              </label>
              <div style={sliderRow}>
                <input
                  type="range" min={0} max={24} step={1}
                  value={options.paletteSize}
                  onChange={(e) => setOpt("paletteSize", Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={valBadge}>{options.paletteSize || "off"}</span>
              </div>
              <div style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>
                Groups nearby colors into N distinct hues using k-means. Turns gradients into clean
                solid regions — great for stained glass, illustrations, and bold designs.
                Try 8–16 colors.
              </div>
              {options.paletteSize > 0 && result && (
                <DetectedPalette colors={[...new Set(result.scaleColors.map((s) => s.color))]} />
              )}
            </div>

            {/* Analyze button */}
            <button
              onClick={runAnalysis}
              disabled={!imageLoaded || busy}
              style={{ ...btn("#2563eb", !imageLoaded || busy), width: "100%", marginBottom: 14 }}
            >
              {busy ? "Analyzing…" : "🔍 Re-analyze"}
            </button>

            {/* Stats */}
            {result && (
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Detected
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px" }}>
                  {[
                    ["Rings", result.rings.length],
                    ["Scales", result.scaleColors.length],
                    ["Rows", result.gridRows],
                    ["Columns", result.gridCols],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ fontSize: 13 }}>
                      <span style={{ color: "#64748b" }}>{label}: </span>
                      <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{val}</span>
                    </div>
                  ))}
                </div>
                {uniqueScaleColors.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 8, marginBottom: 4 }}>Scale palette sample:</div>
                    <DetectedPalette colors={uniqueScaleColors} />
                  </>
                )}
              </div>
            )}

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={!result || result.rings.length === 0}
              style={{
                ...btn("#059669", !result || result.rings.length === 0),
                width: "100%",
                fontSize: 14,
                padding: "11px 18px",
              }}
            >
              ✅ Load to Canvas
            </button>
            <div style={{ color: "#475569", fontSize: 11, textAlign: "center", marginTop: 6 }}>
              Replaces current canvas. Undo by loading a saved project.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
