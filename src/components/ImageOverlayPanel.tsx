// =====================================
// File: src/components/ImageOverlayPanel.tsx
// =====================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { nearestPaletteHex, rgbToHex } from "../utils/colors";
import { clamp } from "../types";

type SampleMode = "nearest" | "average";

export interface OverlaySettings {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotate: number;
  sample: SampleMode;
  paletteScope: "current" | "cmj" | "trl" | "mdz" | "all";
  opacity: number;
}

export function ImageOverlayPanel({
  stageRef,
  rows,
  cols,
  palettes,
  currentPalette,
  onPreview,
  onApply,
  settings,
  setSettings,
}: {
  stageRef: React.RefObject<HTMLDivElement>;
  rows: number;
  cols: number;
  palettes: Record<string, string[]>;
  currentPalette: string[];
  onPreview: (ghost: HTMLCanvasElement | null) => void; // why: stage overlay ghost
  onApply: (colors: string[][]) => void; // mapped to grid
  settings: OverlaySettings;
  setSettings: (s: OverlaySettings) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const workCanvas = useRef<HTMLCanvasElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    workCanvas.current = document.createElement("canvas");
  }, []);

  const paletteForScope = useMemo(() => {
    switch (settings.paletteScope) {
      case "current":
        return currentPalette;
      case "cmj":
        return palettes["cmj"];
      case "trl":
        return palettes["trl"];
      case "mdz":
        return palettes["mdz"];
      case "all":
      default:
        return Array.from(new Set([...palettes["cmj"], ...palettes["trl"], ...palettes["mdz"]]));
    }
  }, [settings.paletteScope, currentPalette, palettes]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
      URL.revokeObjectURL(url);
      renderGhost();
    };
    img.src = url;
  }

  function renderGhost() {
    const img = imgRef.current;
    const wc = workCanvas.current;
    const stage = stageRef.current;
    if (!img || !wc || !stage) return;

    // Size the work canvas to stage for easier transform preview
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    wc.width = W;
    wc.height = H;

    const ctx = wc.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);

    // Transform draw
    ctx.save();
    ctx.globalAlpha = clamp(settings.opacity, 0, 1);
    ctx.translate(W / 2 + settings.offsetX, H / 2 + settings.offsetY);
    ctx.rotate((settings.rotate * Math.PI) / 180);
    const scale = Math.max(0.01, settings.scale);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    onPreview(wc);
  }

  function sampleToGrid(): string[][] {
    const img = imgRef.current;
    const wc = workCanvas.current;
    if (!img || !wc) return [];

    // Build a tiny canvas of cols x rows to sample
    const tiny = document.createElement("canvas");
    tiny.width = cols;
    tiny.height = rows;
    const tctx = tiny.getContext("2d")!;

    // Draw with same transform as ghost, but into tiny resolution
    tctx.save();
    tctx.clearRect(0, 0, cols, rows);
    tctx.translate(cols / 2 + settings.offsetX / (wc.width / cols), rows / 2 + settings.offsetY / (wc.height / rows));
    tctx.rotate((settings.rotate * Math.PI) / 180);
    const scale = Math.max(0.01, settings.scale);
    const drawW = (img.width * scale) / (wc.width / cols);
    const drawH = (img.height * scale) / (wc.height / rows);
    tctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    tctx.restore();

    // Read colors
    const id = tctx.getImageData(0, 0, cols, rows).data;
    const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill("#000000"));

    // Palette quantization
    const pal = paletteForScope;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const hex = rgbToHex(id[i], id[i + 1], id[i + 2]);
        grid[r][c] = nearestPaletteHex(hex, pal);
      }
    }
    return grid;
  }

  useEffect(() => {
    if (loaded) renderGhost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.scale, settings.offsetX, settings.offsetY, settings.rotate, settings.opacity, settings.paletteScope]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 12, opacity: 0.8 }}>Image Overlay</label>

      <label
        htmlFor="overlay-file"
        style={{
          display: "inline-block",
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid #333",
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        Choose Image
      </label>
      <input
        id="overlay-file"
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, alignItems: "center" }}>
        <div>Scale</div>
        <input type="range" min={0.01} max={5} step={0.01}
               value={settings.scale}
               onChange={(e) => setSettings({ ...settings, scale: parseFloat(e.target.value) })} />
        <div>Offset X</div>
        <input type="range" min={-500} max={500} step={1}
               value={settings.offsetX}
               onChange={(e) => setSettings({ ...settings, offsetX: parseInt(e.target.value) })} />
        <div>Offset Y</div>
        <input type="range" min={-500} max={500} step={1}
               value={settings.offsetY}
               onChange={(e) => setSettings({ ...settings, offsetY: parseInt(e.target.value) })} />
        <div>Rotate</div>
        <input type="range" min={-180} max={180} step={1}
               value={settings.rotate}
               onChange={(e) => setSettings({ ...settings, rotate: parseInt(e.target.value) })} />
        <div>Opacity</div>
        <input type="range" min={0} max={1} step={0.01}
               value={settings.opacity}
               onChange={(e) => setSettings({ ...settings, opacity: parseFloat(e.target.value) })} />
        <div>Palette</div>
        <select
          value={settings.paletteScope}
          onChange={(e) => setSettings({ ...settings, paletteScope: e.target.value as any })}
        >
          <option value="current">Current</option>
          <option value="cmj">CMJ</option>
          <option value="trl">TRL</option>
          <option value="mdz">MDZ</option>
          <option value="all">All</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={renderGhost}>Preview</button>
        <button onClick={() => onPreview(null)}>Hide</button>
        <button
          onClick={() => {
            const grid = sampleToGrid();
            if (grid.length) onApply(grid);
          }}
        >
          Apply (paywalled outside)
        </button>
      </div>
    </div>
  );
}
