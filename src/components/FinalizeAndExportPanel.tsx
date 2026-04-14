// ==============================================
// src/components/FinalizeAndExportPanel.tsx
// Finalize & Export (PDF / CSV / Map / Preview)
// Rings + Scales
// ==============================================

import React, { useMemo, useState } from "react";
import type { ExportRing, PaletteAssignment } from "../types/project";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* ---------------------- palette (24 fixed) ---------------------- */
const PALETTE24 = [
  "#000000",
  "#1f2937",
  "#6b7280",
  "#9ca3af",
  "#ffffff",
  "#991b1b",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#2563eb",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f973c5",
  "#7c2d12",
].map((h) => h.toUpperCase());

const PALETTE_INDEX_BY_HEX = new Map<string, number>(
  PALETTE24.map((h, i) => [h, i + 1]),
);

/* ---------------------- small utils ---------------------- */
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hexToRgbUnit(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    (hex || "#C0C0C0").trim(),
  );
  if (!m) return { r: 0.75, g: 0.75, b: 0.75 };
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

function hexToRgb255(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    (hex || "#C0C0C0").trim(),
  );
  if (!m) return { r: 192, g: 192, b: 192 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function hexLuminance(hex: string) {
  const { r, g, b } = hexToRgb255(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function formatInt(n: number) {
  return new Intl.NumberFormat().format(n);
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------------- better palette matching (Lab) ---------------------- */
type Lab = { L: number; a: number; b: number };

function srgbToLinear(u: number) {
  const x = u / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function rgb255ToXyz(r: number, g: number, b: number) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;

  return { X, Y, Z };
}

function fLab(t: number) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function xyzToLab(X: number, Y: number, Z: number): Lab {
  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;

  const fx = fLab(X / Xn);
  const fy = fLab(Y / Yn);
  const fz = fLab(Z / Zn);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function hexToLab(hex: string): Lab {
  const { r, g, b } = hexToRgb255((hex || "#C0C0C0").toUpperCase());
  const { X, Y, Z } = rgb255ToXyz(r, g, b);
  return xyzToLab(X, Y, Z);
}

function deltaE76(a: Lab, b: Lab) {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

const PALETTE24_LAB: Array<{ hex: string; lab: Lab }> = PALETTE24.map(
  (hex) => ({
    hex,
    lab: hexToLab(hex),
  }),
);

function quantizeToPalette(hex: string): string {
  const h = (hex || "#C0C0C0").toUpperCase();
  const lab = hexToLab(h);

  let best = PALETTE24[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of PALETTE24_LAB) {
    const d = deltaE76(lab, p.lab);
    if (d < bestD) {
      bestD = d;
      best = p.hex;
    }
  }
  return best;
}

/* ---------- canvas helpers ---------- */
async function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  if (typeof c.toBlob === "function") {
    return await new Promise<Uint8Array>((resolve, reject) => {
      c.toBlob(async (blob) => {
        if (!blob) return reject(new Error("canvas.toBlob() returned null"));
        try {
          const ab = await blob.arrayBuffer();
          resolve(new Uint8Array(ab));
        } catch (e) {
          reject(e);
        }
      }, "image/png");
    });
  }

  const dataUrl = c.toDataURL("image/png");
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function drawScaleGlyph(args: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  holePx: number;
  colorHex: string;
  shape: "teardrop" | "leaf" | "round" | "kite";
  dropPx?: number;
  holeOffsetPx?: number;
  opacity?: number;
  drawLabel?: string;
}) {
  const {
    ctx,
    x,
    y,
    widthPx,
    heightPx,
    holePx,
    colorHex,
    shape,
    drawLabel,
    opacity = 0.96,
  } = args;

  const path = new Path2D();
  const w = widthPx;
  const h = heightPx;

  if (shape === "leaf") {
    path.moveTo(0, h * 0.02);
    path.bezierCurveTo(
      w * 0.48,
      h * 0.06,
      w * 0.56,
      h * 0.26,
      w * 0.54,
      h * 0.46,
    );
    path.bezierCurveTo(w * 0.52, h * 0.72, w * 0.32, h * 0.92, 0, h);
    path.bezierCurveTo(
      -w * 0.32,
      h * 0.92,
      -w * 0.52,
      h * 0.72,
      -w * 0.54,
      h * 0.46,
    );
    path.bezierCurveTo(-w * 0.56, h * 0.26, -w * 0.48, h * 0.06, 0, h * 0.02);
    path.closePath();
  } else if (shape === "round") {
    path.moveTo(0, 0);
    path.bezierCurveTo(w * 0.52, 0, w * 0.54, h * 0.52, 0, h);
    path.bezierCurveTo(-w * 0.54, h * 0.52, -w * 0.52, 0, 0, 0);
    path.closePath();
  } else if (shape === "kite") {
    path.moveTo(0, 0);
    path.lineTo(w * 0.48, h * 0.3);
    path.lineTo(w * 0.28, h * 0.76);
    path.lineTo(0, h);
    path.lineTo(-w * 0.28, h * 0.76);
    path.lineTo(-w * 0.48, h * 0.3);
    path.closePath();
  } else {
    path.moveTo(0, h * 0.02);
    path.bezierCurveTo(
      w * 0.56,
      h * 0.04,
      w * 0.62,
      h * 0.34,
      w * 0.32,
      h * 0.7,
    );
    path.bezierCurveTo(w * 0.18, h * 0.86, w * 0.08, h * 0.94, 0, h);
    path.bezierCurveTo(
      -w * 0.08,
      h * 0.94,
      -w * 0.18,
      h * 0.86,
      -w * 0.32,
      h * 0.7,
    );
    path.bezierCurveTo(-w * 0.62, h * 0.34, -w * 0.56, h * 0.04, 0, h * 0.02);
    path.closePath();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = colorHex;
  ctx.fill(path);

  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#000000";
  const shade = new Path2D();
  shade.moveTo(0, h * 0.12);
  shade.bezierCurveTo(w * 0.14, h * 0.24, w * 0.12, h * 0.64, 0, h * 0.92);
  shade.bezierCurveTo(-w * 0.03, h * 0.84, -w * 0.04, h * 0.4, 0, h * 0.12);
  shade.closePath();
  ctx.fill(shade);

  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "#0b1220";
  ctx.lineWidth = Math.max(1, w * 0.03);
  ctx.stroke(path);

  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, holePx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, holePx, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(11,18,32,0.55)";
  ctx.lineWidth = Math.max(1, holePx * 0.08);
  ctx.stroke();

  if (drawLabel) {
    const lum = hexLuminance(colorHex);
    ctx.fillStyle = lum < 0.55 ? "#ffffff" : "#0f172a";
    ctx.strokeStyle =
      lum < 0.55 ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)";
    const size = Math.max(10, holePx * 0.95);
    ctx.font = `900 ${size}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeText(drawLabel, x, y);
    ctx.fillText(drawLabel, x, y);
  }
  ctx.restore();
}

/* ---------------------- types ---------------------- */
type ExportScale = {
  key?: string;
  row?: number;
  col?: number;
  x_mm?: number;
  y_mm?: number;
  colorHex?: string;
  holeId_mm?: number;
  width_mm?: number;
  height_mm?: number;
  shape?: "teardrop" | "leaf" | "round" | "kite";
  drop_mm?: number;
  holeOffsetY_mm?: number;
};

type ScaleSettings = {
  enabled?: boolean;
  holeIdMm?: number;
  widthMm?: number;
  heightMm?: number;
  colorHex?: string;
  shape?: "teardrop" | "leaf" | "round" | "kite";
  dropMm?: number;
  holeOffsetYMm?: number;
};

/* ---------------------- normalized models ---------------------- */
type NormRing = {
  kind: "ring";
  row?: number;
  col?: number;
  x: number;
  y: number;
  colorHex: string;
  innerDiameter: number;
  wireDiameter: number;
};

type NormScale = {
  kind: "scale";
  row?: number;
  col?: number;
  x: number;
  y: number;
  colorHex: string;
  holeId: number;
  width: number;
  height: number;
  shape: "teardrop" | "leaf" | "round" | "kite";
  drop: number;
  holeOffsetY: number;
};

function normalizeRings(rings: ExportRing[]): NormRing[] {
  return (rings as any[]).map((r) => {
    let row: number | undefined;
    let col: number | undefined;
    if (typeof r.key === "string" && r.key.includes(",")) {
      const [a, b] = r.key.split(",");
      const ra = parseInt(a, 10);
      const cb = parseInt(b, 10);
      if (Number.isFinite(ra)) row = ra;
      if (Number.isFinite(cb)) col = cb;
    }

    const x = Number.isFinite(r.cx) ? Number(r.cx) : Number(r.x_mm);
    const y = Number.isFinite(r.cy) ? Number(r.cy) : Number(r.y_mm);

    return {
      kind: "ring",
      row,
      col,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      colorHex: quantizeToPalette(String(r.colorHex || "#C0C0C0")),
      innerDiameter: Number(r.innerDiameter ?? r.innerDiameter_mm ?? 6),
      wireDiameter: Number(r.wireDiameter ?? r.wireDiameter_mm ?? 1),
    };
  });
}

function normalizeScales(
  scales: ExportScale[],
  scaleSettings?: ScaleSettings | null,
): NormScale[] {
  return (scales as any[]).map((s) => {
    const x = Number.isFinite(s.x_mm) ? Number(s.x_mm) : 0;
    const y = Number.isFinite(s.y_mm) ? Number(s.y_mm) : 0;
    return {
      kind: "scale",
      row: Number.isFinite(s.row) ? Number(s.row) : undefined,
      col: Number.isFinite(s.col) ? Number(s.col) : undefined,
      x,
      y,
      colorHex: quantizeToPalette(
        String(s.colorHex || scaleSettings?.colorHex || "#67d4e8"),
      ),
      holeId: Number(s.holeId_mm ?? scaleSettings?.holeIdMm ?? 6.6),
      width: Number(s.width_mm ?? scaleSettings?.widthMm ?? 15.9),
      height: Number(s.height_mm ?? scaleSettings?.heightMm ?? 26.6),
      shape:
        s.shape === "leaf" ||
        s.shape === "round" ||
        s.shape === "kite" ||
        s.shape === "teardrop"
          ? s.shape
          : scaleSettings?.shape === "leaf" ||
              scaleSettings?.shape === "round" ||
              scaleSettings?.shape === "kite" ||
              scaleSettings?.shape === "teardrop"
            ? scaleSettings.shape
            : "teardrop",
      drop: Number(s.drop_mm ?? scaleSettings?.dropMm ?? 3),
      holeOffsetY: Number(
        s.holeOffsetY_mm ?? scaleSettings?.holeOffsetYMm ?? 0,
      ),
    };
  });
}

function estimateCenterSpacingMm(rings: NormRing[]): number {
  const withRows = rings.filter(
    (r) => Number.isFinite(r.row) && Number.isFinite(r.col),
  );
  const idxByCell = new Map<string, NormRing>();
  for (const ring of withRows) idxByCell.set(`${ring.row},${ring.col}`, ring);

  const dists: number[] = [];
  for (const ring of withRows) {
    const right = idxByCell.get(`${ring.row},${(ring.col as number) + 1}`);
    if (!right) continue;
    dists.push(Math.abs(right.x - ring.x));
  }

  if (dists.length) {
    dists.sort((a, b) => a - b);
    return dists[Math.floor(dists.length / 2)];
  }

  const sample = rings.slice(0, 600);
  const nn: number[] = [];
  for (let i = 0; i < sample.length; i++) {
    let best = Infinity;
    for (let j = 0; j < sample.length; j++) {
      if (i === j) continue;
      const dx = sample[i].x - sample[j].x;
      const dy = sample[i].y - sample[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-6 && d < best) best = d;
    }
    if (best < Infinity) nn.push(best);
  }
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)] || 7;
}

type PreparedRing = NormRing & { paletteIndex: number };
type PreparedScale = NormScale & { paletteIndex: number };

function prepareRingsForMap(rings: NormRing[]): PreparedRing[] {
  return rings.map((ring) => ({
    ...ring,
    paletteIndex: PALETTE_INDEX_BY_HEX.get(ring.colorHex.toUpperCase()) ?? 0,
  }));
}

function prepareScalesForMap(scales: NormScale[]): PreparedScale[] {
  return scales.map((scale) => ({
    ...scale,
    paletteIndex: PALETTE_INDEX_BY_HEX.get(scale.colorHex.toUpperCase()) ?? 0,
  }));
}

function boundsOfPrepared(rings: PreparedRing[], scales: PreparedScale[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const ring of rings) {
    const outer = ring.innerDiameter * 0.5 + ring.wireDiameter;
    minX = Math.min(minX, ring.x - outer);
    maxX = Math.max(maxX, ring.x + outer);
    minY = Math.min(minY, ring.y - outer);
    maxY = Math.max(maxY, ring.y + outer);
  }

  for (const scale of scales) {
    minX = Math.min(minX, scale.x - scale.width * 0.7);
    maxX = Math.max(maxX, scale.x + scale.width * 0.7);
    minY = Math.min(minY, scale.y - scale.holeId * 0.6);
    maxY = Math.max(maxY, scale.y + scale.height * 1.05);
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

function buildTilePlan(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  tileW: number,
  tileH: number,
) {
  const wL = Math.max(1e-6, bounds.maxX - bounds.minX);
  const hL = Math.max(1e-6, bounds.maxY - bounds.minY);

  const tilesX = Math.max(1, Math.ceil(wL / tileW));
  const tilesY = Math.max(1, Math.ceil(hL / tileH));

  return {
    bounds,
    tilesX,
    tilesY,
    tileW,
    tileH,
  };
}

function drawOverviewCanvas(args: {
  rings: PreparedRing[];
  scales: PreparedScale[];
  plan: {
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    tilesX: number;
    tilesY: number;
    tileW: number;
    tileH: number;
  };
}) {
  const { rings, scales, plan } = args;
  const minX = plan.bounds.minX;
  const minY = plan.bounds.minY;
  const maxX = plan.bounds.maxX;
  const maxY = plan.bounds.maxY;

  const wL = Math.max(1, maxX - minX);
  const hL = Math.max(1, maxY - minY);

  const W = 2200;
  const H = 1400;
  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const g = cvs.getContext("2d")!;

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  g.fillStyle = "#0f172a";
  g.font = "900 92px ui-sans-serif, system-ui, -apple-system";
  g.fillText("Map Overview", 90, 150);

  g.font = "600 34px ui-sans-serif, system-ui, -apple-system";
  g.fillStyle = "rgba(15,23,42,0.78)";
  const subtitle = scales.length
    ? `This map includes rings, scales, and a combined location reference. The design is split into ${plan.tilesX} × ${plan.tilesY} tiles.`
    : `This ring map is split into ${plan.tilesX} × ${plan.tilesY} tiles.`;
  g.fillText(subtitle, 90, 210);

  const pad = 90;
  const mapTop = 270;
  const usableX = pad;
  const usableY = mapTop;
  const usableW = W - pad * 2;
  const usableH = H - usableY - pad;

  const scale = Math.min(usableW / wL, usableH / hL);
  const ox = usableX + (usableW - wL * scale) / 2 - minX * scale;
  const oy = usableY + (usableH - hL * scale) / 2 - minY * scale;

  for (const s of scales) {
    drawScaleGlyph({
      ctx: g,
      x: s.x * scale + ox,
      y: s.y * scale + oy,
      widthPx: s.width * scale,
      heightPx: s.height * scale,
      holePx: Math.max(2, s.holeId * 0.5 * scale),
      colorHex: s.colorHex,
      shape: s.shape,
      opacity: 0.72,
    });
  }

  const dot = Math.max(1.6, Math.min(4.0, scale * 0.2));
  for (const ring of rings) {
    g.beginPath();
    g.arc(ring.x * scale + ox, ring.y * scale + oy, dot, 0, Math.PI * 2);
    g.fillStyle = ring.colorHex;
    g.fill();
  }

  g.strokeStyle = "rgba(15,23,42,0.18)";
  g.lineWidth = 2;

  for (let tx = 0; tx < plan.tilesX; tx++) {
    const x = (minX + tx * plan.tileW) * scale + ox;
    g.beginPath();
    g.moveTo(x, usableY);
    g.lineTo(x, usableY + usableH);
    g.stroke();
  }
  for (let ty = 0; ty < plan.tilesY; ty++) {
    const y = (minY + ty * plan.tileH) * scale + oy;
    g.beginPath();
    g.moveTo(usableX, y);
    g.lineTo(usableX + usableW, y);
    g.stroke();
  }

  g.strokeStyle = "rgba(15,23,42,0.12)";
  g.lineWidth = 3;
  g.strokeRect(usableX, usableY, usableW, usableH);

  return cvs;
}

function drawRingTileCanvas(args: {
  rings: PreparedRing[];
  tileBounds: { minX: number; minY: number; maxX: number; maxY: number };
  tileIndex: {
    x: number;
    y: number;
    cols: number;
    rows: number;
    pageNo: number;
  };
  spacing: number;
}) {
  const { rings, tileBounds, tileIndex, spacing } = args;
  const W = 2200;
  const H = 1400;
  const pad = 90;
  const mapTop = 270;

  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const g = cvs.getContext("2d")!;

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  g.fillStyle = "#0f172a";
  g.font = "900 92px ui-sans-serif, system-ui, -apple-system";
  g.fillText("Ring Map", 90, 150);

  g.font = "700 42px ui-sans-serif, system-ui, -apple-system";
  g.fillStyle = "rgba(15,23,42,0.78)";
  g.fillText(
    `Tile ${tileIndex.x + 1},${tileIndex.y + 1} (of ${tileIndex.cols}×${tileIndex.rows}) • Page ${tileIndex.pageNo}`,
    90,
    220,
  );

  const usableX = pad;
  const usableY = mapTop;
  const usableW = W - pad * 2;
  const usableH = H - usableY - pad;
  const wL = Math.max(1e-6, tileBounds.maxX - tileBounds.minX);
  const hL = Math.max(1e-6, tileBounds.maxY - tileBounds.minY);
  const scale = Math.min(usableW / wL, usableH / hL);
  const ox = usableX + (usableW - wL * scale) / 2 - tileBounds.minX * scale;
  const oy = usableY + (usableH - hL * scale) / 2 - tileBounds.minY * scale;

  const spacingPx = Math.max(10, spacing * scale);
  const dotR = clamp(spacingPx * 0.42, 4, 16);
  const fontPx = clamp(spacingPx * 0.55, 10, 22);

  g.strokeStyle = "rgba(15,23,42,0.12)";
  g.lineWidth = 3;
  g.strokeRect(usableX, usableY, usableW, usableH);

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 ${fontPx}px ui-sans-serif, system-ui, -apple-system`;

  for (const ring of rings) {
    if (
      ring.x < tileBounds.minX ||
      ring.x > tileBounds.maxX ||
      ring.y < tileBounds.minY ||
      ring.y > tileBounds.maxY
    )
      continue;
    const px = ring.x * scale + ox;
    const py = ring.y * scale + oy;
    const hex = ring.colorHex;

    g.beginPath();
    g.arc(px, py, dotR, 0, Math.PI * 2);
    g.fillStyle = hex;
    g.fill();
    g.lineWidth = Math.max(1, dotR * 0.18);
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.stroke();

    const label = String(ring.paletteIndex);
    const lum = hexLuminance(hex);
    const fill = lum < 0.55 ? "#ffffff" : "#0f172a";
    const stroke =
      lum < 0.55 ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)";
    g.lineWidth = Math.max(2, fontPx * 0.18);
    g.strokeStyle = stroke;
    g.strokeText(label, px, py);
    g.fillStyle = fill;
    g.fillText(label, px, py);
  }

  return cvs;
}

function drawScaleTileCanvas(args: {
  scales: PreparedScale[];
  tileBounds: { minX: number; minY: number; maxX: number; maxY: number };
  tileIndex: {
    x: number;
    y: number;
    cols: number;
    rows: number;
    pageNo: number;
  };
  spacing: number;
}) {
  const { scales, tileBounds, tileIndex, spacing } = args;
  const W = 2200;
  const H = 1400;
  const pad = 90;
  const mapTop = 270;

  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const g = cvs.getContext("2d")!;

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  g.fillStyle = "#0f172a";
  g.font = "900 92px ui-sans-serif, system-ui, -apple-system";
  g.fillText("Scale Map", 90, 150);

  g.font = "700 42px ui-sans-serif, system-ui, -apple-system";
  g.fillStyle = "rgba(15,23,42,0.78)";
  g.fillText(
    `Tile ${tileIndex.x + 1},${tileIndex.y + 1} (of ${tileIndex.cols}×${tileIndex.rows}) • Page ${tileIndex.pageNo}`,
    90,
    220,
  );

  const usableX = pad;
  const usableY = mapTop;
  const usableW = W - pad * 2;
  const usableH = H - usableY - pad;
  const wL = Math.max(1e-6, tileBounds.maxX - tileBounds.minX);
  const hL = Math.max(1e-6, tileBounds.maxY - tileBounds.minY);
  const scale = Math.min(usableW / wL, usableH / hL);
  const ox = usableX + (usableW - wL * scale) / 2 - tileBounds.minX * scale;
  const oy = usableY + (usableH - hL * scale) / 2 - tileBounds.minY * scale;

  g.strokeStyle = "rgba(15,23,42,0.12)";
  g.lineWidth = 3;
  g.strokeRect(usableX, usableY, usableW, usableH);

  for (const item of scales) {
    if (
      item.x < tileBounds.minX ||
      item.x > tileBounds.maxX ||
      item.y < tileBounds.minY ||
      item.y > tileBounds.maxY
    )
      continue;
    drawScaleGlyph({
      ctx: g,
      x: item.x * scale + ox,
      y: item.y * scale + oy,
      widthPx: item.width * scale,
      heightPx: item.height * scale,
      holePx: Math.max(2, item.holeId * 0.5 * scale),
      colorHex: item.colorHex,
      shape: item.shape,
      drawLabel: String(item.paletteIndex),
      opacity: 0.92,
    });
  }

  return cvs;
}

function drawCombinedTileCanvas(args: {
  rings: PreparedRing[];
  scales: PreparedScale[];
  tileBounds: { minX: number; minY: number; maxX: number; maxY: number };
  tileIndex: {
    x: number;
    y: number;
    cols: number;
    rows: number;
    pageNo: number;
  };
  spacing: number;
}) {
  const { rings, scales, tileBounds, tileIndex, spacing } = args;
  const W = 2200;
  const H = 1400;
  const pad = 90;
  const mapTop = 270;

  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const g = cvs.getContext("2d")!;

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  g.fillStyle = "#0f172a";
  g.font = "900 92px ui-sans-serif, system-ui, -apple-system";
  g.fillText("Combined Ring + Scale Map", 90, 150);

  g.font = "700 42px ui-sans-serif, system-ui, -apple-system";
  g.fillStyle = "rgba(15,23,42,0.78)";
  g.fillText(
    `Tile ${tileIndex.x + 1},${tileIndex.y + 1} (of ${tileIndex.cols}×${tileIndex.rows}) • Page ${tileIndex.pageNo}`,
    90,
    220,
  );

  const usableX = pad;
  const usableY = mapTop;
  const usableW = W - pad * 2;
  const usableH = H - usableY - pad;
  const wL = Math.max(1e-6, tileBounds.maxX - tileBounds.minX);
  const hL = Math.max(1e-6, tileBounds.maxY - tileBounds.minY);
  const scale = Math.min(usableW / wL, usableH / hL);
  const ox = usableX + (usableW - wL * scale) / 2 - tileBounds.minX * scale;
  const oy = usableY + (usableH - hL * scale) / 2 - tileBounds.minY * scale;

  g.strokeStyle = "rgba(15,23,42,0.12)";
  g.lineWidth = 3;
  g.strokeRect(usableX, usableY, usableW, usableH);

  for (const item of scales) {
    if (
      item.x < tileBounds.minX ||
      item.x > tileBounds.maxX ||
      item.y < tileBounds.minY ||
      item.y > tileBounds.maxY
    )
      continue;
    drawScaleGlyph({
      ctx: g,
      x: item.x * scale + ox,
      y: item.y * scale + oy,
      widthPx: item.width * scale,
      heightPx: item.height * scale,
      holePx: Math.max(2, item.holeId * 0.5 * scale),
      colorHex: item.colorHex,
      shape: item.shape,
      opacity: 0.72,
    });
  }

  const spacingPx = Math.max(10, spacing * scale);
  const dotR = clamp(spacingPx * 0.42, 4, 16);
  const fontPx = clamp(spacingPx * 0.55, 10, 22);

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 ${fontPx}px ui-sans-serif, system-ui, -apple-system`;

  for (const ring of rings) {
    if (
      ring.x < tileBounds.minX ||
      ring.x > tileBounds.maxX ||
      ring.y < tileBounds.minY ||
      ring.y > tileBounds.maxY
    )
      continue;
    const px = ring.x * scale + ox;
    const py = ring.y * scale + oy;
    const hex = ring.colorHex;

    g.beginPath();
    g.arc(px, py, dotR, 0, Math.PI * 2);
    g.fillStyle = hex;
    g.fill();
    g.lineWidth = Math.max(1, dotR * 0.18);
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.stroke();

    const label = String(ring.paletteIndex);
    const lum = hexLuminance(hex);
    const fill = lum < 0.55 ? "#ffffff" : "#0f172a";
    const stroke =
      lum < 0.55 ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)";
    g.lineWidth = Math.max(2, fontPx * 0.18);
    g.strokeStyle = stroke;
    g.strokeText(label, px, py);
    g.fillStyle = fill;
    g.fillText(label, px, py);
  }

  return cvs;
}

function buildPreviewFallback(rings: NormRing[], scales: NormScale[]) {
  const bounds = boundsOfPrepared(
    prepareRingsForMap(rings),
    prepareScalesForMap(scales),
  );

  const cvs = document.createElement("canvas");
  cvs.width = 1400;
  cvs.height = 900;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  const pad = 60;
  const wL = Math.max(1, bounds.maxX - bounds.minX);
  const hL = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (cvs.width - pad * 2) / wL,
    (cvs.height - pad * 2) / hL,
  );
  const ox = (cvs.width - wL * scale) / 2 - bounds.minX * scale;
  const oy = (cvs.height - hL * scale) / 2 - bounds.minY * scale;

  for (const item of scales) {
    drawScaleGlyph({
      ctx,
      x: item.x * scale + ox,
      y: item.y * scale + oy,
      widthPx: item.width * scale,
      heightPx: item.height * scale,
      holePx: Math.max(2, item.holeId * 0.5 * scale),
      colorHex: item.colorHex,
      shape: item.shape,
      opacity: 0.78,
    });
  }

  for (const ring of rings) {
    const x = ring.x * scale + ox;
    const y = ring.y * scale + oy;
    const outerR = (ring.innerDiameter + 2 * ring.wireDiameter) * 0.5 * scale;
    const innerR = ring.innerDiameter * 0.5 * scale;

    ctx.beginPath();
    ctx.arc(x, y, (outerR + innerR) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = ring.colorHex || "#777";
    ctx.lineWidth = Math.max(1, outerR - innerR);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = "#0000001a";
    ctx.lineWidth = Math.max(1, innerR * 0.04);
    ctx.stroke();
  }

  return cvs;
}

/* ---------------------- component ---------------------- */
type Props = {
  rings: ExportRing[];
  scales?: ExportScale[];
  scaleSettings?: ScaleSettings | null;
  initialAssignment?: PaletteAssignment | null;
  onAssignmentChange?: (p: PaletteAssignment | null) => void;
  getRendererCanvas?: () => HTMLCanvasElement | null;
  onClose?: () => void;
  mapMode?: "auto" | "grid" | "freeform";
};

const FinalizeAndExportPanel: React.FC<Props> = ({
  rings,
  scales = [],
  scaleSettings = null,
  initialAssignment,
  onAssignmentChange,
  getRendererCanvas,
  onClose,
  mapMode = "auto",
}) => {
  const [busy, setBusy] = useState(false);

  const normalizedRings = useMemo(() => normalizeRings(rings), [rings]);
  const normalizedScales = useMemo(
    () => normalizeScales(scales, scaleSettings),
    [scales, scaleSettings],
  );

  const derived = useMemo(() => {
    let maxRow = -1;
    let maxCol = -1;
    let hasRowCol = false;
    let hasXY = false;

    const ringCounts = new Map<string, number>();
    const scaleCounts = new Map<string, number>();
    for (const hex of PALETTE24) {
      ringCounts.set(hex, 0);
      scaleCounts.set(hex, 0);
    }

    for (const ring of normalizedRings) {
      if (Number.isFinite(ring.row) && Number.isFinite(ring.col)) {
        hasRowCol = true;
        maxRow = Math.max(maxRow, ring.row!);
        maxCol = Math.max(maxCol, ring.col!);
      }
      hasXY = true;
      ringCounts.set(ring.colorHex, (ringCounts.get(ring.colorHex) || 0) + 1);
    }

    for (const scale of normalizedScales) {
      if (Number.isFinite(scale.row) && Number.isFinite(scale.col)) {
        hasRowCol = true;
        maxRow = Math.max(maxRow, scale.row!);
        maxCol = Math.max(maxCol, scale.col!);
      }
      hasXY = true;
      scaleCounts.set(
        scale.colorHex,
        (scaleCounts.get(scale.colorHex) || 0) + 1,
      );
    }

    const rows = hasRowCol ? maxRow + 1 : 0;
    const cols = hasRowCol ? maxCol + 1 : 0;
    const totalCells = hasRowCol ? Math.max(1, rows * cols) : 0;
    const density = hasRowCol ? normalizedRings.length / totalCells : 1;
    const autoGrid = hasRowCol && density > 0.92;

    const forcedGrid = mapMode === "grid";
    const forcedFreeform = mapMode === "freeform";
    const isGrid = forcedGrid || (!forcedFreeform && autoGrid);
    const isFreeform = forcedFreeform || (!forcedGrid && !autoGrid && hasXY);

    const ringByColor = PALETTE24.map((hex) => ({
      hex,
      count: ringCounts.get(hex) || 0,
    }));
    const scaleByColor = PALETTE24.map((hex) => ({
      hex,
      count: scaleCounts.get(hex) || 0,
    }));

    return {
      rows,
      cols,
      isGrid,
      isFreeform,
      ringByColor,
      scaleByColor,
      ringTotal: normalizedRings.length,
      scaleTotal: normalizedScales.length,
      ringUsedColorCount: ringByColor.filter((x) => x.count > 0).length,
      scaleUsedColorCount: scaleByColor.filter((x) => x.count > 0).length,
    };
  }, [normalizedRings, normalizedScales, mapMode]);

  const {
    rows,
    cols,
    isGrid,
    isFreeform,
    ringByColor,
    scaleByColor,
    ringTotal,
    scaleTotal,
    ringUsedColorCount,
    scaleUsedColorCount,
  } = derived;

  const buildPdf = async () => {
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      const W = 842;
      const H = 595;
      const margin = 36;

      const addPaginatedBom = (
        title: string,
        items: Array<{ hex: string; count: number }>,
        subtitle: string,
      ) => {
        const rowH = 22;
        const headerY = H - margin - 8;
        const tableTop = headerY - 60;
        const footerH = 28;
        const rowsPerPage = Math.max(
          1,
          Math.floor((tableTop - margin - footerH) / rowH) - 1,
        );

        let pageIndex = 0;
        for (let start = 0; start < items.length; start += rowsPerPage) {
          const slice = items.slice(start, start + rowsPerPage);
          const page = pdf.addPage([W, H]);
          page.drawRectangle({
            x: 0,
            y: 0,
            width: W,
            height: H,
            color: rgb(1, 1, 1),
          });

          const heading =
            title +
            (items.length > rowsPerPage
              ? ` (Page ${pageIndex + 1} of ${Math.ceil(items.length / rowsPerPage)})`
              : "");

          page.drawText(heading, {
            x: margin,
            y: headerY,
            size: 24,
            font: fontBold,
            color: rgb(0.07, 0.09, 0.16),
          });

          page.drawText(subtitle, {
            x: margin,
            y: headerY - 26,
            size: 12,
            font: fontRegular,
            color: rgb(0.16, 0.22, 0.32),
          });

          const colsX = {
            item: margin,
            count: margin + 360,
            packs: margin + 460,
            hex: margin + 560,
          };

          page.drawLine({
            start: { x: margin, y: tableTop + 6 },
            end: { x: W - margin, y: tableTop + 6 },
            thickness: 1,
            color: rgb(0.8, 0.86, 0.93),
          });

          const th = (label: string, x: number) =>
            page.drawText(label, {
              x,
              y: tableTop,
              size: 12,
              font: fontBold,
              color: rgb(0.1, 0.12, 0.2),
            });

          th("Item", colsX.item);
          th("Count", colsX.count);
          th("Packs (1500)", colsX.packs);
          th("Hex", colsX.hex);

          let y = tableTop - 18;
          for (const line of slice) {
            const u = hexToRgbUnit(line.hex);
            const idx = PALETTE_INDEX_BY_HEX.get(line.hex.toUpperCase()) ?? 0;

            page.drawRectangle({
              x: colsX.item,
              y,
              width: 14,
              height: 14,
              color: rgb(u.r, u.g, u.b),
              borderColor: rgb(0, 0, 0),
              borderWidth: 0.6,
            });

            page.drawText(String(idx), {
              x: colsX.item + 20,
              y,
              size: 12,
              font: fontBold,
              color: rgb(0.07, 0.09, 0.16),
            });
            page.drawText(line.hex.toUpperCase(), {
              x: colsX.item + 40,
              y,
              size: 12,
              font: fontRegular,
              color: rgb(0.07, 0.09, 0.16),
            });

            page.drawText(formatInt(line.count), {
              x: colsX.count,
              y,
              size: 12,
              font: fontRegular,
              color: rgb(0.07, 0.09, 0.16),
            });

            const packs = line.count > 0 ? Math.ceil(line.count / 1500) : 0;
            page.drawText(String(packs), {
              x: colsX.packs,
              y,
              size: 12,
              font: fontRegular,
              color: rgb(0.07, 0.09, 0.16),
            });

            page.drawText(line.hex.toUpperCase(), {
              x: colsX.hex,
              y,
              size: 12,
              font: fontRegular,
              color: rgb(0.25, 0.32, 0.4),
            });

            y -= rowH;
          }

          pageIndex++;
        }
      };

      addPaginatedBom(
        "Ring Bill of Materials (24-color Palette)",
        ringByColor,
        `Rings: ${formatInt(ringTotal)}   •   Colors used: ${ringUsedColorCount}/24`,
      );

      if (scaleTotal > 0) {
        addPaginatedBom(
          "Scale Bill of Materials (24-color Palette)",
          scaleByColor,
          `Scales: ${formatInt(scaleTotal)}   •   Colors used: ${scaleUsedColorCount}/24`,
        );
      }

      if (isFreeform) {
        const preparedRings = prepareRingsForMap(normalizedRings);
        const preparedScales = prepareScalesForMap(normalizedScales);
        const spacingMm = estimateCenterSpacingMm(normalizedRings);
        const bounds = boundsOfPrepared(preparedRings, preparedScales);

        const TILE_CANVAS_W = 2200;
        const TILE_CANVAS_H = 1400;
        const pad = 90;
        const mapTop = 270;
        const usableW = TILE_CANVAS_W - pad * 2;
        const usableH = TILE_CANVAS_H - mapTop - pad;
        const targetSpacingPx = 42;
        const scaleUnitsToPx = targetSpacingPx / Math.max(1e-6, spacingMm);
        const tileW = usableW / scaleUnitsToPx;
        const tileH = usableH / scaleUnitsToPx;
        const plan = buildTilePlan(bounds, tileW, tileH);

        {
          const page = pdf.addPage([W, H]);
          page.drawRectangle({
            x: 0,
            y: 0,
            width: W,
            height: H,
            color: rgb(1, 1, 1),
          });

          const mapCanvas = drawOverviewCanvas({
            rings: preparedRings,
            scales: preparedScales,
            plan,
          });
          const png = await canvasToPng(mapCanvas);
          const img = await pdf.embedPng(png);
          const padPdf = 24;
          const boxW = W - padPdf * 2;
          const boxH = H - padPdf * 2;
          const s = Math.min(boxW / img.width, boxH / img.height);
          const drawW = img.width * s;
          const drawH = img.height * s;

          page.drawImage(img, {
            x: (W - drawW) / 2,
            y: (H - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        }

        let pageNo = 1;
        for (let ty = 0; ty < plan.tilesY; ty++) {
          for (let tx = 0; tx < plan.tilesX; tx++) {
            const tileBounds = {
              minX: plan.bounds.minX + tx * plan.tileW - spacingMm * 2,
              maxX: plan.bounds.minX + (tx + 1) * plan.tileW + spacingMm * 2,
              minY: plan.bounds.minY + ty * plan.tileH - spacingMm * 2,
              maxY: plan.bounds.minY + (ty + 1) * plan.tileH + spacingMm * 2,
            };

            const ringTile = drawRingTileCanvas({
              rings: preparedRings,
              tileBounds,
              tileIndex: {
                x: tx,
                y: ty,
                cols: plan.tilesX,
                rows: plan.tilesY,
                pageNo,
              },
              spacing: spacingMm,
            });
            {
              const png = await canvasToPng(ringTile);
              const img = await pdf.embedPng(png);
              const page = pdf.addPage([W, H]);
              page.drawRectangle({
                x: 0,
                y: 0,
                width: W,
                height: H,
                color: rgb(1, 1, 1),
              });
              const padPdf = 24;
              const boxW = W - padPdf * 2;
              const boxH = H - padPdf * 2;
              const s = Math.min(boxW / img.width, boxH / img.height);
              const drawW = img.width * s;
              const drawH = img.height * s;

              page.drawImage(img, {
                x: (W - drawW) / 2,
                y: (H - drawH) / 2,
                width: drawW,
                height: drawH,
              });
            }
            pageNo++;

            if (preparedScales.length > 0) {
              const scaleTile = drawScaleTileCanvas({
                scales: preparedScales,
                tileBounds,
                tileIndex: {
                  x: tx,
                  y: ty,
                  cols: plan.tilesX,
                  rows: plan.tilesY,
                  pageNo,
                },
                spacing: spacingMm,
              });
              {
                const png = await canvasToPng(scaleTile);
                const img = await pdf.embedPng(png);
                const page = pdf.addPage([W, H]);
                page.drawRectangle({
                  x: 0,
                  y: 0,
                  width: W,
                  height: H,
                  color: rgb(1, 1, 1),
                });
                const padPdf = 24;
                const boxW = W - padPdf * 2;
                const boxH = H - padPdf * 2;
                const s = Math.min(boxW / img.width, boxH / img.height);
                const drawW = img.width * s;
                const drawH = img.height * s;

                page.drawImage(img, {
                  x: (W - drawW) / 2,
                  y: (H - drawH) / 2,
                  width: drawW,
                  height: drawH,
                });
              }
              pageNo++;

              const combinedTile = drawCombinedTileCanvas({
                rings: preparedRings,
                scales: preparedScales,
                tileBounds,
                tileIndex: {
                  x: tx,
                  y: ty,
                  cols: plan.tilesX,
                  rows: plan.tilesY,
                  pageNo,
                },
                spacing: spacingMm,
              });
              {
                const png = await canvasToPng(combinedTile);
                const img = await pdf.embedPng(png);
                const page = pdf.addPage([W, H]);
                page.drawRectangle({
                  x: 0,
                  y: 0,
                  width: W,
                  height: H,
                  color: rgb(1, 1, 1),
                });
                const padPdf = 24;
                const boxW = W - padPdf * 2;
                const boxH = H - padPdf * 2;
                const s = Math.min(boxW / img.width, boxH / img.height);
                const drawW = img.width * s;
                const drawH = img.height * s;

                page.drawImage(img, {
                  x: (W - drawW) / 2,
                  y: (H - drawH) / 2,
                  width: drawW,
                  height: drawH,
                });
              }
              pageNo++;
            }
          }
        }
      } else if (isGrid && rows > 0 && cols > 0) {
        const page = pdf.addPage([W, H]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: W,
          height: H,
          color: rgb(1, 1, 1),
        });

        const titleY = H - margin - 24;
        page.drawText("Map (Grid)", {
          x: margin,
          y: titleY,
          size: 18,
          font: fontBold,
          color: rgb(0.07, 0.09, 0.16),
        });

        const pad = 24;
        const leftAxis = margin + 28;
        const topAxis = H - margin - 50;
        const usableW = W - leftAxis - margin - pad;
        const usableH = topAxis - margin - pad;
        const cellSize = Math.max(
          8,
          Math.min(Math.floor(usableW / cols), Math.floor(usableH / rows)),
        );
        const gridW = cellSize * cols;
        const gridH = cellSize * rows;
        const originX = leftAxis + Math.floor((usableW - gridW) / 2);
        const originY = margin + Math.floor((usableH - gridH) / 2);

        const ringByCell = new Map<string, PreparedRing>();
        for (const ring of prepareRingsForMap(normalizedRings)) {
          if (Number.isFinite(ring.row) && Number.isFinite(ring.col)) {
            ringByCell.set(`${ring.row},${ring.col}`, ring);
          }
        }

        const scaleByCell = new Map<string, PreparedScale>();
        for (const scale of prepareScalesForMap(normalizedScales)) {
          if (Number.isFinite(scale.row) && Number.isFinite(scale.col)) {
            scaleByCell.set(`${scale.row},${scale.col}`, scale);
          }
        }

        const outline = rgb(0.75, 0.8, 0.87);
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            const x = originX + cc * cellSize;
            const y = originY + (rows - 1 - rr) * cellSize;
            const ring = ringByCell.get(`${rr},${cc}`);
            const scale = scaleByCell.get(`${rr},${cc}`);

            page.drawRectangle({
              x: x + 0.5,
              y: y + 0.5,
              width: cellSize - 1,
              height: cellSize - 1,
              color: rgb(0.98, 0.99, 1),
              borderColor: outline,
              borderWidth: Math.max(1.2, Math.floor(cellSize / 11)),
            });

            if (scale) {
              const c = hexToRgbUnit(scale.colorHex);
              page.drawEllipse({
                x: x + cellSize * 0.5,
                y: y + cellSize * 0.44,
                xScale: cellSize * 0.25,
                yScale: cellSize * 0.32,
                color: rgb(c.r, c.g, c.b),
                borderColor: rgb(0.1, 0.12, 0.2),
                borderWidth: 0.5,
                opacity: 0.8,
              });
            }

            if (ring) {
              const c = hexToRgbUnit(ring.colorHex);
              page.drawCircle({
                x: x + cellSize * 0.5,
                y: y + cellSize * 0.5,
                size: cellSize * 0.24,
                color: rgb(c.r, c.g, c.b),
                borderColor: rgb(0.1, 0.12, 0.2),
                borderWidth: 0.6,
              });

              const label = String(ring.paletteIndex);
              const size = Math.max(8, Math.floor(cellSize * 0.42));
              page.drawText(label, {
                x: x + cellSize / 2 - size * 0.35,
                y: y + cellSize / 2 - size * 0.4,
                size,
                font: fontBold,
                color: rgb(0.08, 0.1, 0.14),
              });
            }
          }
        }
      }

      {
        const page = pdf.addPage([W, H]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: W,
          height: H,
          color: rgb(1, 1, 1),
        });

        const previewCanvas = buildPreviewFallback(
          normalizedRings,
          normalizedScales,
        );
        const png = await canvasToPng(previewCanvas);
        const img = await pdf.embedPng(png);
        const pad = 40;
        const maxW = W - pad * 2;
        const maxH = H - pad * 2;
        const s = Math.min(maxW / img.width, maxH / img.height);
        const drawW = img.width * s;
        const drawH = img.height * s;

        page.drawImage(img, {
          x: (W - drawW) / 2,
          y: (H - drawH) / 2,
          width: drawW,
          height: drawH,
        });

        page.drawText(
          isGrid ? `Preview — ${rows} × ${cols}` : "Preview — Rings and Scales",
          {
            x: pad,
            y: H - pad + 8,
            size: 12,
            font: fontRegular,
            color: rgb(0.07, 0.09, 0.16),
          },
        );
      }

      const bytes = await pdf.save();
      const ab: ArrayBuffer =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? (bytes.buffer as ArrayBuffer)
          : bytes.slice().buffer;

      downloadBlob(
        `BOM${isGrid ? `-${rows}x${cols}` : ""}.pdf`,
        new Blob([ab], { type: "application/pdf" }),
      );
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed. See console for details.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = [
      "entity",
      "id",
      "row",
      "col",
      "x_mm",
      "y_mm",
      "colorHex",
      "paletteIndex",
      "innerDiameter",
      "wireDiameter",
      "holeId_mm",
      "width_mm",
      "height_mm",
      "shape",
      "drop_mm",
      "holeOffsetY_mm",
    ];

    const lines = [header.join(",")];

    for (const ring of normalizedRings) {
      lines.push(
        [
          "ring",
          `${ring.row ?? ""},${ring.col ?? ""}`,
          ring.row ?? "",
          ring.col ?? "",
          ring.x,
          ring.y,
          ring.colorHex,
          PALETTE_INDEX_BY_HEX.get(ring.colorHex) ?? "",
          ring.innerDiameter,
          ring.wireDiameter,
          "",
          "",
          "",
          "",
          "",
          "",
        ].join(","),
      );
    }

    for (const scale of normalizedScales) {
      lines.push(
        [
          "scale",
          `${scale.row ?? ""},${scale.col ?? ""}`,
          scale.row ?? "",
          scale.col ?? "",
          scale.x,
          scale.y,
          scale.colorHex,
          PALETTE_INDEX_BY_HEX.get(scale.colorHex) ?? "",
          "",
          "",
          scale.holeId,
          scale.width,
          scale.height,
          scale.shape,
          scale.drop,
          scale.holeOffsetY,
        ].join(","),
      );
    }

    const preface = rows && cols ? `# Rows,${rows}\n# Cols,${cols}\n` : "";
    const blob = new Blob([preface + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });

    downloadBlob(`export${rows && cols ? `-${rows}x${cols}` : ""}.csv`, blob);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 100002,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620,
          maxWidth: "95vw",
          background: "rgba(17,24,39,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,.6)",
          padding: 16,
          color: "#e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>Finalize & Export</div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, color: "#9ca3af" }}>
          Rings: <b>{formatInt(ringTotal)}</b> &nbsp;•&nbsp; Ring colors used:{" "}
          <b>{ringUsedColorCount}</b>/24
          {scaleTotal > 0 && (
            <>
              &nbsp;•&nbsp; Scales: <b>{formatInt(scaleTotal)}</b> &nbsp;•&nbsp;
              Scale colors used: <b>{scaleUsedColorCount}</b>/24
            </>
          )}
          {isGrid && (
            <>
              &nbsp;•&nbsp; Rows: <b>{rows}</b> &nbsp;•&nbsp; Cols:{" "}
              <b>{cols}</b>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#94a3b8",
            lineHeight: 1.5,
          }}
        >
          The PDF includes:
          <br />• a paginated ring BOM
          {scaleTotal > 0 && (
            <>
              <br />• a paginated scale BOM
            </>
          )}
          <br />• a tiled ring map
          {scaleTotal > 0 && (
            <>
              <br />• a tiled scale map
              <br />• a combined ring + scale map
            </>
          )}
          <br />• a preview page
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button
            onClick={buildPdf}
            disabled={busy}
            style={btnPrimary}
            title="PDF with BOM pages, tiled maps, and preview."
          >
            {busy ? "Building PDF…" : "Export PDF"}
          </button>
          <button onClick={exportCsv} style={btnGhost}>
            Export CSV
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 12,
            color: "#93a3b8",
            lineHeight: 1.45,
          }}
        >
          Quantization is limited to the <b>24-color palette</b>. The BOM index
          is stable 1–24. Freeform exports include separate ring and scale pages
          plus a combined location map so scale positions remain readable
          relative to the rings.
        </div>
      </div>
    </div>
  );
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #1f2937",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
};

const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #334155",
  background: "transparent",
  color: "#e5e7eb",
  cursor: "pointer",
  fontWeight: 600,
};

export default FinalizeAndExportPanel;
