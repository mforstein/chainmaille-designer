// ==============================================
// src/components/FinalizeAndExportPanel.tsx
// Finalize & Export (PDF / CSV / Map / Preview)
// Rings + Scales
// ==============================================

import React, { useMemo, useState } from "react";
import type { ExportRing, PaletteAssignment } from "../types/project";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { exportAsGLB, exportAsColorSTLs, estimateGLBSizeMB } from "../lib/export3dModel";
import type { ExportGroups } from "../lib/export3dModel";
import { track } from "../lib/analytics";

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
  shape: "leaf" | "round" | "kite";
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
    // Standard chainmaille scale (almond/lancet). Kept in sync with the 3D
    // mesh in RingRenderer.makeScaleShapeRR(case "leaf") so the export PDF
    // / preview tiles render the same silhouette as the 3D canvas.
    path.moveTo(0, h * 0.02);
    path.bezierCurveTo(
      w * 0.375,
      h * 0.10,
      w * 0.50,
      h * 0.30,
      w * 0.50,
      h * 0.50,
    );
    path.bezierCurveTo(w * 0.50, h * 0.72, w * 0.25, h * 0.92, 0, h);
    path.bezierCurveTo(
      -w * 0.25,
      h * 0.92,
      -w * 0.50,
      h * 0.72,
      -w * 0.50,
      h * 0.50,
    );
    path.bezierCurveTo(-w * 0.50, h * 0.30, -w * 0.375, h * 0.10, 0, h * 0.02);
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

  // White fill for hole — never use destination-out; it punches through scales drawn below
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, holePx, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
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
  // Accepts the four built-in shapes plus custom shape IDs ("custom:..." etc.)
  // via the (string & {}) tail — keeps autocomplete for the literals but allows
  // any string. Mirrors the ScaleShape type in FreeformChainmail2D.
  shape?: "leaf" | "round" | "kite" | (string & {});
  drop_mm?: number;
  holeOffsetY_mm?: number;
};

type ScaleSettings = {
  enabled?: boolean;
  holeIdMm?: number;
  widthMm?: number;
  heightMm?: number;
  colorHex?: string;
  // Accepts the four built-in shapes plus custom shape IDs ("custom:..." etc.)
  // via the (string & {}) tail — keeps autocomplete for the literals but allows
  // any string. Mirrors the ScaleShape type in FreeformChainmail2D.
  shape?: "leaf" | "round" | "kite" | (string & {});
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
  shape: "leaf" | "round" | "kite";
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
      // Legacy "teardrop" saves coerce to "leaf" here so downstream
      // renderers never see teardrop. Teardrop bezier removed 2026-06-01.
      shape:
        s.shape === "leaf" ||
        s.shape === "round" ||
        s.shape === "kite"
          ? s.shape
          : (s.shape === "teardrop")
            ? "leaf"
            : (scaleSettings?.shape === "leaf" ||
                scaleSettings?.shape === "round" ||
                scaleSettings?.shape === "kite")
              ? (scaleSettings.shape as "leaf" | "round" | "kite")
              : "leaf",
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

  const dot = Math.max(1.6, Math.min(4.0, scale * 0.2));

  // Draw scales as colored dots on the overview (same style as rings)
  for (const s of scales) {
    const lum = hexLuminance(s.colorHex);
    g.beginPath();
    g.arc(s.x * scale + ox, s.y * scale + oy, dot, 0, Math.PI * 2);
    g.fillStyle = lum > 0.88 ? "#d4d4d4" : s.colorHex;
    g.fill();
    g.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.2)";
    g.lineWidth = Math.max(0.5, dot * 0.3);
    g.stroke();
  }
  for (const ring of rings) {
    const lum = hexLuminance(ring.colorHex);
    g.beginPath();
    g.arc(ring.x * scale + ox, ring.y * scale + oy, dot, 0, Math.PI * 2);
    g.fillStyle = lum > 0.88 ? "#d4d4d4" : ring.colorHex;
    g.fill();
    g.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.2)";
    g.lineWidth = Math.max(0.5, dot * 0.3);
    g.stroke();
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

  const spacingPx = spacing * scale;
  const dotR = clamp(spacingPx * 0.42, 4, 16);
  const fontPx = clamp(spacingPx * 0.55, 10, 22);
  const showLabel = dotR >= 8;

  g.strokeStyle = "rgba(15,23,42,0.12)";
  g.lineWidth = 3;
  g.strokeRect(usableX, usableY, usableW, usableH);

  if (showLabel) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${fontPx}px ui-sans-serif, system-ui, -apple-system`;
  }

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
    const lum = hexLuminance(hex);
    const displayHex = lum > 0.88 ? "#d4d4d4" : hex;

    g.beginPath();
    g.arc(px, py, dotR, 0, Math.PI * 2);
    g.fillStyle = displayHex;
    g.fill();
    g.lineWidth = Math.max(1.5, dotR * 0.22);
    g.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.18)";
    g.stroke();

    if (showLabel) {
      const label = String(ring.paletteIndex);
      const labelFill = lum < 0.55 ? "#ffffff" : "#0f172a";
      const labelStroke =
        lum < 0.55 ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)";
      g.lineWidth = Math.max(2, fontPx * 0.18);
      g.strokeStyle = labelStroke;
      g.strokeText(label, px, py);
      g.fillStyle = labelFill;
      g.fillText(label, px, py);
    }
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

  const spacingPx = spacing * scale;
  const dotR = clamp(spacingPx * 0.42, 4, 16);
  const fontPx = clamp(spacingPx * 0.55, 10, 22);
  const showLabel = dotR >= 8;

  if (showLabel) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${fontPx}px ui-sans-serif, system-ui, -apple-system`;
  }

  for (const item of scales) {
    if (
      item.x < tileBounds.minX ||
      item.x > tileBounds.maxX ||
      item.y < tileBounds.minY ||
      item.y > tileBounds.maxY
    )
      continue;
    const px = item.x * scale + ox;
    const py = item.y * scale + oy;
    const hex = item.colorHex;
    const lum = hexLuminance(hex);
    const displayHex = lum > 0.88 ? "#d4d4d4" : hex;

    g.beginPath();
    g.arc(px, py, dotR, 0, Math.PI * 2);
    g.fillStyle = displayHex;
    g.fill();
    g.lineWidth = Math.max(1.5, dotR * 0.22);
    g.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.18)";
    g.stroke();

    if (showLabel) {
      const label = String(item.paletteIndex);
      const labelFill = lum < 0.55 ? "#ffffff" : "#0f172a";
      const labelStroke = lum < 0.55 ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)";
      g.lineWidth = Math.max(2, fontPx * 0.18);
      g.strokeStyle = labelStroke;
      g.strokeText(label, px, py);
      g.fillStyle = labelFill;
      g.fillText(label, px, py);
    }
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

  const spacingPx = spacing * scale;
  const dotR = clamp(spacingPx * 0.42, 4, 16);
  const fontPx = clamp(spacingPx * 0.55, 10, 22);
  const showLabel = dotR >= 8;

  if (showLabel) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${fontPx}px ui-sans-serif, system-ui, -apple-system`;
  }

  // Draw scales as circles with palette numbers (same style as rings)
  for (const item of scales) {
    if (
      item.x < tileBounds.minX ||
      item.x > tileBounds.maxX ||
      item.y < tileBounds.minY ||
      item.y > tileBounds.maxY
    )
      continue;
    const px = item.x * scale + ox;
    const py = item.y * scale + oy;
    const hex = item.colorHex;
    const lum = hexLuminance(hex);
    const displayHex = lum > 0.88 ? "#d4d4d4" : hex;

    g.beginPath();
    g.arc(px, py, dotR, 0, Math.PI * 2);
    g.fillStyle = displayHex;
    g.fill();
    g.lineWidth = Math.max(1.5, dotR * 0.22);
    g.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.18)";
    g.stroke();

    if (showLabel) {
      const label = String(item.paletteIndex);
      const labelFill = lum < 0.55 ? "#ffffff" : "#0f172a";
      const labelStroke = lum < 0.55 ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)";
      g.lineWidth = Math.max(2, fontPx * 0.18);
      g.strokeStyle = labelStroke;
      g.strokeText(label, px, py);
      g.fillStyle = labelFill;
      g.fillText(label, px, py);
    }
  }

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
    const lum = hexLuminance(hex);
    const displayHex = lum > 0.88 ? "#d4d4d4" : hex;

    g.beginPath();
    g.arc(px, py, dotR, 0, Math.PI * 2);
    g.fillStyle = displayHex;
    g.fill();
    g.lineWidth = Math.max(1.5, dotR * 0.22);
    g.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.18)";
    g.stroke();

    if (showLabel) {
      const label = String(ring.paletteIndex);
      const labelFill = lum < 0.55 ? "#ffffff" : "#0f172a";
      const labelStroke =
        lum < 0.55 ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)";
      g.lineWidth = Math.max(2, fontPx * 0.18);
      g.strokeStyle = labelStroke;
      g.strokeText(label, px, py);
      g.fillStyle = labelFill;
      g.fillText(label, px, py);
    }
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

  // Preview shows scales as colored dots — same dot size as ring wire cross-section
  const scaleDot = Math.max(1.6, Math.min(5.0, scale * 0.25));
  for (const item of scales) {
    const x = item.x * scale + ox;
    const y = item.y * scale + oy;
    const lum = hexLuminance(item.colorHex);
    ctx.beginPath();
    ctx.arc(x, y, scaleDot, 0, Math.PI * 2);
    ctx.fillStyle = lum > 0.88 ? "#d4d4d4" : item.colorHex;
    ctx.fill();
    ctx.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.2)";
    ctx.lineWidth = Math.max(0.5, scaleDot * 0.3);
    ctx.stroke();
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
  getExportGroups?: () => ExportGroups | null;
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
  getExportGroups,
  onClose,
  mapMode = "auto",
}) => {
  const [busy, setBusy] = useState(false);
  const [busy3D, setBusy3D] = useState(false);

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
    track("export", { format: "pdf_bom" });
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
        const pad = 24;
        const leftAxis = margin + 28;
        const topAxis = H - margin - 50;
        const usableW = W - leftAxis - margin - pad;
        const usableH = topAxis - margin - pad;

        // Minimum cell size that lets a 2-digit palette number sit inside the dot
        // without overflowing into the adjacent cell.
        const MIN_CELL = 20;
        const maxColsPerPage = Math.max(1, Math.floor(usableW / MIN_CELL));
        const maxRowsPerPage = Math.max(1, Math.floor(usableH / MIN_CELL));
        const tilesX = Math.max(1, Math.ceil(cols / maxColsPerPage));
        const tilesY = Math.max(1, Math.ceil(rows / maxRowsPerPage));
        const totalTilePages = tilesX * tilesY;

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

        let gridPageNo = 1;
        for (let ty = 0; ty < tilesY; ty++) {
          for (let tx = 0; tx < tilesX; tx++) {
            const startCol = tx * maxColsPerPage;
            const endCol = Math.min(startCol + maxColsPerPage, cols);
            const startRow = ty * maxRowsPerPage;
            const endRow = Math.min(startRow + maxRowsPerPage, rows);
            const tileCols = endCol - startCol;
            const tileRows = endRow - startRow;

            // Scale up to fill the page, but don't go beyond double the minimum
            const cellSize = Math.min(
              MIN_CELL * 2,
              Math.max(MIN_CELL, Math.min(Math.floor(usableW / tileCols), Math.floor(usableH / tileRows))),
            );

            const gridW = cellSize * tileCols;
            const gridH = cellSize * tileRows;
            const originX = leftAxis + Math.floor((usableW - gridW) / 2);
            const originY = margin + Math.floor((usableH - gridH) / 2);

            const page = pdf.addPage([W, H]);
            page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });

            const titleY = H - margin - 24;
            const tileLabel = totalTilePages > 1
              ? ` • Tile ${tx + 1},${ty + 1} of ${tilesX}×${tilesY} (Page ${gridPageNo}/${totalTilePages})`
              : "";
            page.drawText(`Map (Grid)${tileLabel}`, {
              x: margin, y: titleY, size: 14, font: fontBold,
              color: rgb(0.07, 0.09, 0.16),
            });

            if (totalTilePages > 1) {
              page.drawText(`Cols ${startCol + 1}–${endCol}  ·  Rows ${startRow + 1}–${endRow}`, {
                x: margin, y: titleY - 18, size: 9, font: fontRegular,
                color: rgb(0.35, 0.42, 0.5),
              });
            }

            const outline = rgb(0.75, 0.8, 0.87);
            for (let rr = startRow; rr < endRow; rr++) {
              for (let cc = startCol; cc < endCol; cc++) {
                const x = originX + (cc - startCol) * cellSize;
                const y = originY + (tileRows - 1 - (rr - startRow)) * cellSize;
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
                  const size = Math.max(7, Math.floor(cellSize * 0.42));
                  const lum = hexLuminance(ring.colorHex);
                  page.drawText(label, {
                    x: x + cellSize / 2 - size * 0.35,
                    y: y + cellSize / 2 - size * 0.4,
                    size,
                    font: fontBold,
                    color: lum < 0.45 ? rgb(1, 1, 1) : rgb(0.08, 0.1, 0.14),
                  });
                }
              }
            }
            gridPageNo++;
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

  // ============================================================
  // PRINT PATTERN (1:1) — physical-size per-color PDF
  // ============================================================
  const buildPatternPdf = async () => {
    track("export", { format: "pdf_pattern" });
    setBusy(true);
    try {
      const MM_TO_PT = 72 / 25.4;
      const PX_PER_MM = 10; // canvas resolution

      // A4 Portrait
      const PAGE_W_MM = 210;
      const PAGE_H_MM = 297;
      const PAGE_W_PT = PAGE_W_MM * MM_TO_PT;
      const PAGE_H_PT = PAGE_H_MM * MM_TO_PT;

      const MARGIN_MM = 8;
      const HEADER_MM = 14; // space at top of each page for label
      const USABLE_W_MM = PAGE_W_MM - 2 * MARGIN_MM;   // 194 mm
      const USABLE_H_MM = PAGE_H_MM - 2 * MARGIN_MM - HEADER_MM; // 267 mm
      const OVERLAP_MM = 6; // tile overlap for alignment
      const STEP_W_MM = USABLE_W_MM - OVERLAP_MM;
      const STEP_H_MM = USABLE_H_MM - OVERLAP_MM;

      const pdf = await PDFDocument.create();
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const fontReg  = await pdf.embedFont(StandardFonts.Helvetica);

      const preparedRings  = prepareRingsForMap(normalizedRings);
      const preparedScales = prepareScalesForMap(normalizedScales);
      const bounds = boundsOfPrepared(preparedRings, preparedScales);

      const designW = Math.max(1, bounds.maxX - bounds.minX);
      const designH = Math.max(1, bounds.maxY - bounds.minY);

      const tilesX = Math.max(1, Math.ceil(designW / STEP_W_MM));
      const tilesY = Math.max(1, Math.ceil(designH / STEP_H_MM));

      // Collect used colors sorted by count (most used first)
      const colorCount = new Map<string, number>();
      for (const r of preparedRings)  colorCount.set(r.colorHex, (colorCount.get(r.colorHex) ?? 0) + 1);
      for (const s of preparedScales) colorCount.set(s.colorHex, (colorCount.get(s.colorHex) ?? 0) + 1);
      const sortedColors = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);

      // ── Helper: draw one physical tile canvas ──────────────────────────
      const drawPatternTile = (
        tileMinX: number, tileMinY: number,
        targetColor: string | null, // null = all colors (combined)
      ): HTMLCanvasElement => {
        const tileMaxX = tileMinX + USABLE_W_MM;
        const tileMaxY = tileMinY + USABLE_H_MM;
        const CW = Math.round(USABLE_W_MM * PX_PER_MM);
        const CH = Math.round(USABLE_H_MM * PX_PER_MM);

        const cvs = document.createElement("canvas");
        cvs.width = CW;
        cvs.height = CH;
        const ctx = cvs.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CW, CH);

        // World → canvas: Y increases downward in both spaces
        const toX = (wx: number) => (wx - tileMinX) * PX_PER_MM;
        const toY = (wy: number) => (wy - tileMinY) * PX_PER_MM;

        // Draw scales (ghost first, then target on top)
        for (const s of preparedScales) {
          if (s.x < tileMinX - s.width || s.x > tileMaxX + s.width) continue;
          if (s.y < tileMinY - s.height || s.y > tileMaxY + s.height) continue;
          const isTarget = targetColor === null || s.colorHex === targetColor;
          drawScaleGlyph({
            ctx,
            x: toX(s.x), y: toY(s.y),
            widthPx: s.width * PX_PER_MM,
            heightPx: s.height * PX_PER_MM,
            holePx: s.holeId * 0.5 * PX_PER_MM,
            colorHex: isTarget ? s.colorHex : "#cccccc",
            shape: s.shape,
            opacity: isTarget ? 0.92 : 0.22,
            drawLabel: isTarget ? String(s.paletteIndex) : undefined,
          });
        }

        // Draw rings
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const ring of preparedRings) {
          if (ring.x < tileMinX - ring.innerDiameter || ring.x > tileMaxX + ring.innerDiameter) continue;
          if (ring.y < tileMinY - ring.innerDiameter || ring.y > tileMaxY + ring.innerDiameter) continue;
          const isTarget = targetColor === null || ring.colorHex === targetColor;
          const px = toX(ring.x);
          const py = toY(ring.y);
          const outerR = (ring.innerDiameter * 0.5 + ring.wireDiameter) * PX_PER_MM;
          const innerR = ring.innerDiameter * 0.5 * PX_PER_MM;

          if (isTarget) {
            const lum = hexLuminance(ring.colorHex);
            // For near-white rings use light gray so they're visible on white paper
            const fillColor = lum > 0.88 ? "#d8d8d8" : ring.colorHex;
            ctx.save();
            // Outer ring fill
            ctx.beginPath();
            ctx.arc(px, py, outerR, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.globalAlpha = 0.92;
            ctx.fill();
            ctx.globalAlpha = 1;
            // Inner hole — white fill (not destination-out) to preserve any scale art beneath
            ctx.beginPath();
            ctx.arc(px, py, innerR, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            // Outer stroke
            ctx.beginPath();
            ctx.arc(px, py, outerR, 0, Math.PI * 2);
            ctx.strokeStyle = lum > 0.75 ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.45)";
            ctx.lineWidth = Math.max(0.8, outerR * 0.07);
            ctx.stroke();
            // Inner hole stroke (edge of opening)
            ctx.beginPath();
            ctx.arc(px, py, innerR, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = Math.max(0.5, outerR * 0.04);
            ctx.stroke();
            // Palette number
            const fs = Math.max(5, outerR * 0.85);
            ctx.font = `900 ${fs}px sans-serif`;
            ctx.fillStyle = lum < 0.5 ? "#ffffff" : "#0f172a";
            ctx.fillText(String(ring.paletteIndex), px, py);
            ctx.restore();
          } else {
            // Ghost outline only
            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, outerR, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(0,0,0,0.18)";
            ctx.lineWidth = Math.max(0.5, outerR * 0.05);
            ctx.stroke();
            ctx.restore();
          }
        }

        // Crop/alignment dashed guide lines for overlap zones
        ctx.save();
        ctx.strokeStyle = "rgba(80,80,200,0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4 * PX_PER_MM / 10, 2 * PX_PER_MM / 10]);
        // Left overlap guide (for tiles that are not the leftmost)
        const overlapPx = (OVERLAP_MM / 2) * PX_PER_MM;
        ctx.beginPath(); ctx.moveTo(overlapPx, 0); ctx.lineTo(overlapPx, CH); ctx.stroke();
        // Top overlap guide
        ctx.beginPath(); ctx.moveTo(0, overlapPx); ctx.lineTo(CW, overlapPx); ctx.stroke();
        // Right overlap guide
        ctx.beginPath(); ctx.moveTo(CW - overlapPx, 0); ctx.lineTo(CW - overlapPx, CH); ctx.stroke();
        // Bottom overlap guide
        ctx.beginPath(); ctx.moveTo(0, CH - overlapPx); ctx.lineTo(CW, CH - overlapPx); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Corner crop marks (L-shapes at each corner for trimming/alignment)
        const markPx = 5 * PX_PER_MM;
        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1.2;
        [[0, 0, 1, 1], [CW, 0, -1, 1], [0, CH, 1, -1], [CW, CH, -1, -1]].forEach(([cx, cy, dx, dy]) => {
          ctx.beginPath(); ctx.moveTo(cx + dx * markPx, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * markPx); ctx.stroke();
        });
        ctx.restore();

        return cvs;
      };

      // ── Helper: embed tile canvas as a PDF page ─────────────────────────
      const addTilePage = async (
        tileCvs: HTMLCanvasElement,
        label: string,
        colorSwatchHex: string | null,
      ) => {
        const png = await canvasToPng(tileCvs);
        const img = await pdf.embedPng(png);

        const page = pdf.addPage([PAGE_W_PT, PAGE_H_PT]);
        page.drawRectangle({ x: 0, y: 0, width: PAGE_W_PT, height: PAGE_H_PT, color: rgb(1, 1, 1) });

        // Header bar
        const headerPt = HEADER_MM * MM_TO_PT;
        const marginPt  = MARGIN_MM * MM_TO_PT;
        const contentTop = PAGE_H_PT - marginPt - headerPt;

        if (colorSwatchHex) {
          const { r, g, b } = hexToRgbUnit(colorSwatchHex);
          page.drawCircle({
            x: marginPt + 5 * MM_TO_PT,
            y: contentTop + 6 * MM_TO_PT,
            size: 4 * MM_TO_PT,
            color: rgb(r, g, b),
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5,
          });
        }

        page.drawText(label, {
          x: marginPt + (colorSwatchHex ? 12 * MM_TO_PT : 0),
          y: contentTop + 4.5 * MM_TO_PT,
          size: 9,
          font: fontBold,
          color: rgb(0.07, 0.09, 0.16),
        });
        page.drawText("Print at 100% scale — do not scale to fit page",  {
          x: marginPt + (colorSwatchHex ? 12 * MM_TO_PT : 0),
          y: contentTop + 1 * MM_TO_PT,
          size: 7,
          font: fontReg,
          color: rgb(0.45, 0.5, 0.6),
        });

        // Tile image
        const imgX  = marginPt;
        const imgY  = marginPt;
        const imgW  = USABLE_W_MM * MM_TO_PT;
        const imgH  = USABLE_H_MM * MM_TO_PT;
        page.drawImage(img, { x: imgX, y: imgY, width: imgW, height: imgH });

        // Ruler tick marks along bottom edge (every 10 mm)
        const rulerY = imgY - 1 * MM_TO_PT;
        for (let mm = 0; mm <= USABLE_W_MM; mm += 10) {
          const rx = imgX + mm * MM_TO_PT;
          const tickH = (mm % 50 === 0 ? 3 : 1.5) * MM_TO_PT;
          page.drawLine({ start: { x: rx, y: rulerY }, end: { x: rx, y: rulerY - tickH }, thickness: 0.5, color: rgb(0.4, 0.45, 0.55) });
          if (mm % 50 === 0) {
            page.drawText(`${mm}`, { x: rx - 4, y: rulerY - tickH - 7, size: 5.5, font: fontReg, color: rgb(0.5, 0.55, 0.65) });
          }
        }
      };

      // ── Overview page (existing scaled-to-fit map) ──────────────────────
      {
        const plan = buildTilePlan(bounds, STEP_W_MM, STEP_H_MM);
        const ovCvs = drawOverviewCanvas({ rings: preparedRings, scales: preparedScales, plan });
        const ovPng = await canvasToPng(ovCvs);
        const ovImg = await pdf.embedPng(ovPng);
        const page = pdf.addPage([PAGE_W_PT, PAGE_H_PT]);
        page.drawRectangle({ x: 0, y: 0, width: PAGE_W_PT, height: PAGE_H_PT, color: rgb(1, 1, 1) });
        const pad = 24;
        const s = Math.min((PAGE_W_PT - pad * 2) / ovImg.width, (PAGE_H_PT - pad * 2) / ovImg.height);
        const dw = ovImg.width * s, dh = ovImg.height * s;
        page.drawImage(ovImg, { x: (PAGE_W_PT - dw) / 2, y: (PAGE_H_PT - dh) / 2 + 20, width: dw, height: dh });

        page.drawText("Print Pattern — Overview", {
          x: pad, y: PAGE_H_PT - pad, size: 14, font: fontBold, color: rgb(0.07, 0.09, 0.16),
        });
        page.drawText(`${tilesX}×${tilesY} tiles • ${sortedColors.length} color(s) • Align dashed overlap guides when assembling tiles`, {
          x: pad, y: PAGE_H_PT - pad - 16, size: 8, font: fontReg, color: rgb(0.4, 0.5, 0.6),
        });

        // Color legend
        let legX = pad;
        let legY = pad + 4;
        for (const hex of sortedColors) {
          const { r, g, b } = hexToRgbUnit(hex);
          const idx = PALETTE_INDEX_BY_HEX.get(hex.toUpperCase()) ?? 0;
          const cnt = colorCount.get(hex) ?? 0;
          page.drawCircle({ x: legX + 5, y: legY + 4, size: 5, color: rgb(r, g, b), borderColor: rgb(0, 0, 0), borderWidth: 0.4 });
          page.drawText(`#${idx} ${hex.toUpperCase()} (${cnt})`, { x: legX + 13, y: legY, size: 7, font: fontReg, color: rgb(0.2, 0.25, 0.35) });
          legX += 90;
          if (legX > PAGE_W_PT - 100) { legX = pad; legY += 12; }
        }
      }

      // ── Per-color tile pages ────────────────────────────────────────────
      for (const targetColor of sortedColors) {
        const colorIdx = PALETTE_INDEX_BY_HEX.get(targetColor.toUpperCase()) ?? 0;
        const cnt = colorCount.get(targetColor) ?? 0;

        for (let ty = 0; ty < tilesY; ty++) {
          for (let tx = 0; tx < tilesX; tx++) {
            const tileMinX = bounds.minX + tx * STEP_W_MM;
            const tileMinY = bounds.minY + ty * STEP_H_MM;
            const tileCvs = drawPatternTile(tileMinX, tileMinY, targetColor);
            const label = `Color #${colorIdx} ${targetColor.toUpperCase()} (${cnt} items) — Tile ${tx + 1},${ty + 1} of ${tilesX}×${tilesY}`;
            await addTilePage(tileCvs, label, targetColor);
          }
        }
      }

      // ── Combined (all colors) tile pages ───────────────────────────────
      if (sortedColors.length > 1) {
        for (let ty = 0; ty < tilesY; ty++) {
          for (let tx = 0; tx < tilesX; tx++) {
            const tileMinX = bounds.minX + tx * STEP_W_MM;
            const tileMinY = bounds.minY + ty * STEP_H_MM;
            const tileCvs = drawPatternTile(tileMinX, tileMinY, null);
            const label = `Full Pattern — Tile ${tx + 1},${ty + 1} of ${tilesX}×${tilesY}`;
            await addTilePage(tileCvs, label, null);
          }
        }
      }

      const bytes = await pdf.save();
      const ab: ArrayBuffer =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? (bytes.buffer as ArrayBuffer)
          : bytes.slice().buffer;
      downloadBlob("chainmail-pattern-1to1.pdf", new Blob([ab], { type: "application/pdf" }));
    } catch (err) {
      console.error("Pattern PDF failed:", err);
      alert("Pattern PDF export failed. See console for details.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    track("export", { format: "csv" });
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

    // Sort by colorHex so all same-color items group together
    const sortedRings = [...normalizedRings].sort((a, b) => a.colorHex.localeCompare(b.colorHex));
    const sortedScales = [...normalizedScales].sort((a, b) => a.colorHex.localeCompare(b.colorHex));

    for (const ring of sortedRings) {
      lines.push(
        [
          "ring",
          `${ring.row ?? ""},${ring.col ?? ""}`,
          ring.row ?? "",
          ring.col ?? "",
          ring.x.toFixed(4),
          ring.y.toFixed(4),
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

    for (const scale of sortedScales) {
      lines.push(
        [
          "scale",
          `${scale.row ?? ""},${scale.col ?? ""}`,
          scale.row ?? "",
          scale.col ?? "",
          scale.x.toFixed(4),
          scale.y.toFixed(4),
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

        {/* Export PDF row */}
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <button
              onClick={buildPdf}
              disabled={busy}
              style={btnPrimary}
              title="PDF with BOM pages, tiled overview maps, and preview."
            >
              {busy ? "Building…" : "Export PDF (BOM + Map)"}
            </button>
            <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", maxWidth: 200 }}>
              BOM · tiled map · preview
            </div>
          </div>

          <div>
            <button
              onClick={buildPatternPdf}
              disabled={busy}
              style={btnPattern}
              title="1:1 physical pattern PDF — print at 100% and use as a placement template."
            >
              {busy ? "Building…" : "Print Pattern (1:1)"}
            </button>
            <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", maxWidth: 220 }}>
              A4 pages · actual ring/scale size · per-color layers · crop marks
            </div>
          </div>

          <div>
            <button onClick={exportCsv} style={btnGhost}>
              Export CSV
            </button>
            <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", maxWidth: 160 }}>
              Sorted by color · x/y in mm
            </div>
          </div>
        </div>

        {/* 3D Model Export */}
        {getExportGroups && (
          <div
            style={{
              marginTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              3D Model Export
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <button
                  disabled={busy3D}
                  style={{ ...btnPrimary, background: "#7c3aed" }}
                  title="GLB (binary GLTF) — each color is a named mesh group. Compatible with VR engines (Unity, Meta Quest, WebXR) and modern slicers (Bambu Studio, PrusaSlicer)."
                  onClick={async () => {
                    const groups = getExportGroups();
                    if (!groups?.rings && !groups?.scales) {
                      alert("Nothing to export — render the design first.");
                      return;
                    }
                    const sizeMB = estimateGLBSizeMB(groups);
                    if (sizeMB > 80 && !confirm(`Estimated file size ~${sizeMB} MB. Continue?`)) return;
                    track("export", { format: "glb" });
                    setBusy3D(true);
                    try {
                      await exportAsGLB(groups, "chainmail-design");
                    } catch (err) {
                      console.error("GLB export failed:", err);
                      alert("3D export failed — see console for details.");
                    } finally {
                      setBusy3D(false);
                    }
                  }}
                >
                  {busy3D ? "Building…" : "Export GLB (VR / Universal)"}
                </button>
                <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", maxWidth: 220 }}>
                  Multi-color groups · VR · Bambu Studio · PrusaSlicer
                </div>
              </div>

              <div>
                <button
                  disabled={busy3D}
                  style={btnGhost}
                  title="One STL file per unique color — assign each STL to a different extruder in your slicer."
                  onClick={() => {
                    const groups = getExportGroups();
                    if (!groups?.rings && !groups?.scales) {
                      alert("Nothing to export — render the design first.");
                      return;
                    }
                    track("export", { format: "stl_per_color" });
                    exportAsColorSTLs(groups, "chainmail-design");
                  }}
                >
                  Per-Color STLs
                </button>
                <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", maxWidth: 180 }}>
                  One .stl per color · multi-head printers
                </div>
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#475569", lineHeight: 1.5 }}>
              Rings are full tori · scales are 0.4 mm extruded plates · color groups map to extruder/material slots
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "#64748b",
            lineHeight: 1.55,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: 10,
          }}
        >
          <b style={{ color: "#94a3b8" }}>Print Pattern</b> — rings and scales drawn at true physical size on A4
          pages. One set of pages per color: your color's items are filled, all others shown as outlines so you
          can see context. Includes a combined full-pattern set. Print at <b>100% / no scaling</b> and tape
          adjacent tiles using the dashed overlap guides. Ruler ticks along the bottom edge every 10 mm.
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

const btnPattern: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #064e3b",
  background: "#059669",
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
