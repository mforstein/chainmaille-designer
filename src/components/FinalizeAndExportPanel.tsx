// ==============================================
// src/components/FinalizeAndExportPanel.tsx
// Finalize & Export (PDF / CSV / Map / Preview)
// ==============================================

import React, { useMemo, useState } from "react";
import type { ExportRing, PaletteAssignment } from "../types/project";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* ---------------------- palette (24 fixed) ---------------------- */
/** Keep this in the same order as the UI palette (left→right, top→bottom). */
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
  // relative luminance approximation (sufficient for label contrast)
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
/**
 * Euclidean RGB sometimes picks the “wrong” nearby color perceptually.
 * This uses CIE Lab (D65) + CIE76 distance, which is noticeably better
 * for quantization without adding dependencies.
 */

type Lab = { L: number; a: number; b: number };

function srgbToLinear(u: number) {
  const x = u / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function rgb255ToXyz(r: number, g: number, b: number) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  // sRGB D65
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;

  return { X, Y, Z };
}
function fLab(t: number) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}
function xyzToLab(X: number, Y: number, Z: number): Lab {
  // D65 reference white
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

const PALETTE24_LAB: Array<{ hex: string; lab: Lab }> = PALETTE24.map((hex) => ({
  hex,
  lab: hexToLab(hex),
}));

/** Nearest-palette quantization (CIE Lab distance). */
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

/* ---------- renderer snapshot & fallbacks (never black) ---------- */

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

/** Simple 2D ring preview on white (fallback when GL snapshot is black or absent). */
function buildPreviewFallback(
  rings: Array<{
    cx?: number;
    cy?: number;
    x_mm?: number;
    y_mm?: number;
    innerDiameter?: number;
    innerDiameter_mm?: number;
    wireDiameter?: number;
    wireDiameter_mm?: number;
    colorHex?: string;
  }>,
) {
  const P: Array<{
    x: number;
    y: number;
    wd: number;
    idm: number;
    col: string;
  }> = [];
  rings.forEach((r) => {
    const x = Number.isFinite(r.cx)
      ? Number(r.cx)
      : Number.isFinite(r.x_mm)
        ? Number(r.x_mm)
        : 0;
    const y = Number.isFinite(r.cy)
      ? Number(r.cy)
      : Number.isFinite(r.y_mm)
        ? Number(r.y_mm)
        : 0;
    const idm = Number.isFinite(r.innerDiameter)
      ? Number(r.innerDiameter)
      : Number.isFinite(r.innerDiameter_mm)
        ? Number(r.innerDiameter_mm)
        : 6;
    const wd = Number.isFinite(r.wireDiameter)
      ? Number(r.wireDiameter)
      : Number.isFinite(r.wireDiameter_mm)
        ? Number(r.wireDiameter_mm)
        : 1;
    P.push({ x, y, wd, idm, col: quantizeToPalette(r.colorHex || "#777") });
  });

  if (!P.length) P.push({ x: 0, y: 0, wd: 1, idm: 6, col: "#777" });

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  P.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  const wL = Math.max(1, maxX - minX),
    hL = Math.max(1, maxY - minY);

  const cvs = document.createElement("canvas");
  cvs.width = 1400;
  cvs.height = 900;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  const pad = 60;
  const scale = Math.min(
    (cvs.width - pad * 2) / wL,
    (cvs.height - pad * 2) / hL,
  );
  const ox = (cvs.width - wL * scale) / 2 - minX * scale;
  const oy = (cvs.height - hL * scale) / 2 - minY * scale;

  P.forEach((r) => {
    const x = r.x * scale + ox;
    const y = r.y * scale + oy;
    const outerR = (r.idm + 2 * r.wd) * 0.5 * scale;
    const innerR = r.idm * 0.5 * scale;

    // colored band
    ctx.beginPath();
    ctx.arc(x, y, (outerR + innerR) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = r.col || "#777";
    ctx.lineWidth = Math.max(1, outerR - innerR);
    ctx.stroke();

    // light inner hole edge
    ctx.beginPath();
    ctx.arc(x, y, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = "#0000001a";
    ctx.lineWidth = Math.max(1, innerR * 0.04);
    ctx.stroke();
  });
  return cvs;
}

/* ---------------------- normalized ring model ---------------------- */

type NormRing = {
  row?: number;
  col?: number;
  cx?: number; // mm
  cy?: number; // mm
  colorHex: string; // quantized to palette
  innerDiameter: number;
  wireDiameter: number;
};

/* ---------------------- spacing estimation ---------------------- */

function neighborKeysOddRowOffset(row: number, col: number) {
  // odd-row offset layout (odd rows shifted right by 0.5 cell)
  const out: Array<[number, number]> = [];
  out.push([row, col - 1]);
  out.push([row, col + 1]);

  if (row & 1) {
    // odd row
    out.push([row - 1, col]);
    out.push([row - 1, col + 1]);
    out.push([row + 1, col]);
    out.push([row + 1, col + 1]);
  } else {
    // even row
    out.push([row - 1, col - 1]);
    out.push([row - 1, col]);
    out.push([row + 1, col - 1]);
    out.push([row + 1, col]);
  }
  return out;
}

function estimateCenterSpacingMm(normalized: NormRing[]): number {
  // Best case: row/col exists; use neighbor distances horizontally.
  const idxByCell = new Map<string, number>();
  for (let i = 0; i < normalized.length; i++) {
    const r = normalized[i];
    if (!Number.isFinite(r.row) || !Number.isFinite(r.col)) continue;
    idxByCell.set(`${r.row},${r.col}`, i);
  }

  const dists: number[] = [];
  for (let i = 0; i < normalized.length && dists.length < 5000; i++) {
    const r = normalized[i];
    if (!Number.isFinite(r.row) || !Number.isFinite(r.col)) continue;

    const rr = r.row as number;
    const cc = r.col as number;

    const rightIdx = idxByCell.get(`${rr},${cc + 1}`);
    if (rightIdx != null) {
      const a = normalized[i];
      const b = normalized[rightIdx];
      if (Number.isFinite(a.cx) && Number.isFinite(b.cx)) {
        const dx = Math.abs((a.cx as number) - (b.cx as number));
        if (dx > 1e-6) dists.push(dx);
      }
    }
  }

  if (dists.length) {
    dists.sort((a, b) => a - b);
    return dists[Math.floor(dists.length / 2)];
  }

  // Fallback: nearest-neighbor median on sample (O(n^2) sample only).
  const sample = normalized
    .filter((r) => Number.isFinite(r.cx) && Number.isFinite(r.cy))
    .slice(0, 600);

  if (sample.length < 3) return 7; // safe-ish fallback

  const nn: number[] = [];
  for (let i = 0; i < sample.length; i++) {
    let best = Infinity;
    for (let j = 0; j < sample.length; j++) {
      if (i === j) continue;
      const dx = (sample[i].cx as number) - (sample[j].cx as number);
      const dy = (sample[i].cy as number) - (sample[j].cy as number);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-6 && d < best) best = d;
    }
    if (best < Infinity) nn.push(best);
  }
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)] || 7;
}

/* ---------------------- Freeform map rendering (overview + numbered tiles) ---------------------- */

type PreparedRing = NormRing & {
  x: number;
  y: number;
  paletteIndex: number; // 1..24
};

function getRingXY(r: NormRing) {
  // Prefer actual XY if present
  if (Number.isFinite(r.cx) && Number.isFinite(r.cy)) {
    return { x: r.cx as number, y: r.cy as number };
  }
  // Fallback: derive from row/col in an odd-row offset grid (approx units)
  const row = Number.isFinite(r.row) ? (r.row as number) : 0;
  const col = Number.isFinite(r.col) ? (r.col as number) : 0;
  const x = col + ((row & 1) ? 0.5 : 0);
  const y = row * 0.8660254;
  return { x, y };
}

function prepareRingsForMap(normalized: NormRing[]): PreparedRing[] {
  return normalized.map((r) => {
    const hex = (r.colorHex || "#C0C0C0").toUpperCase();
    const { x, y } = getRingXY(r);
    return {
      ...r,
      x,
      y,
      paletteIndex: PALETTE_INDEX_BY_HEX.get(hex) ?? 0,
    };
  });
}

function buildTilePlan(rings: PreparedRing[], tileW: number, tileH: number) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const r of rings) {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x);
    maxY = Math.max(maxY, r.y);
  }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }

  const wL = Math.max(1e-6, maxX - minX);
  const hL = Math.max(1e-6, maxY - minY);

  const tilesX = Math.max(1, Math.ceil(wL / tileW));
  const tilesY = Math.max(1, Math.ceil(hL / tileH));

  const tileRings = new Map<string, number[]>();

  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;

    let tx = Math.floor((r.x - minX) / tileW);
    let ty = Math.floor((r.y - minY) / tileH);

    tx = clamp(tx, 0, tilesX - 1);
    ty = clamp(ty, 0, tilesY - 1);

    const key = `${tx},${ty}`;
    if (!tileRings.has(key)) tileRings.set(key, []);
    tileRings.get(key)!.push(i);
  }

  return {
    bounds: { minX, minY, maxX, maxY },
    tilesX,
    tilesY,
    tileW,
    tileH,
    tileRings,
  };
}

function buildFreeformOverviewMapCanvas(
  prepared: PreparedRing[],
  plan: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; tilesX: number; tilesY: number; tileW: number; tileH: number },
) {
  const minX = plan.bounds.minX;
  const minY = plan.bounds.minY;
  const maxX = plan.bounds.maxX;
  const maxY = plan.bounds.maxY;

  const wL = Math.max(1, maxX - minX);
  const hL = Math.max(1, maxY - minY);

  const W = 2200,
    H = 1400;
  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const g = cvs.getContext("2d")!;

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  // Title / instructions
  g.fillStyle = "#0f172a";
  g.font = "900 92px ui-sans-serif, system-ui, -apple-system";
  g.fillText("Map Overview (Tiled)", 90, 150);

  g.font = "600 34px ui-sans-serif, system-ui, -apple-system";
  g.fillStyle = "rgba(15,23,42,0.78)";
  g.fillText(
    `This map is split into ${plan.tilesX} × ${plan.tilesY} tiles. Each ring is labeled with its 24-palette BOM index (1–24) on the tile pages.`,
    90,
    210,
  );

  // Map area
  const pad = 90;
  const mapTop = 270;
  const usableX = pad;
  const usableY = mapTop;
  const usableW = W - pad * 2;
  const usableH = H - usableY - pad;

  const scale = Math.min(usableW / wL, usableH / hL);
  const ox = usableX + (usableW - wL * scale) / 2 - minX * scale;
  const oy = usableY + (usableH - hL * scale) / 2 - minY * scale;

  // draw dots
  const dot = Math.max(1.2, Math.min(3.0, scale * 0.18));
  const byColor = new Map<string, number[]>();
  for (let i = 0; i < prepared.length; i++) {
    const r = prepared[i];
    const hex = (r.colorHex || "#C0C0C0").toUpperCase();
    if (!byColor.has(hex)) byColor.set(hex, []);
    byColor.get(hex)!.push(i);
  }

  for (const [hex, idxs] of byColor.entries()) {
    g.fillStyle = hex;
    for (const i of idxs) {
      const r = prepared[i];
      const px = r.x * scale + ox;
      const py = r.y * scale + oy;
      g.beginPath();
      g.arc(px, py, dot, 0, Math.PI * 2);
      g.fill();
    }
  }

  // tile grid overlay (helps navigation)
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

  // border
  g.strokeStyle = "rgba(15,23,42,0.12)";
  g.lineWidth = 3;
  g.strokeRect(usableX, usableY, usableW, usableH);

  return cvs;
}

function buildFreeformRingNumberTileCanvas(args: {
  rings: PreparedRing[];
  ringIdxs: number[]; // indices into rings[]
  tileBounds: { minX: number; minY: number; maxX: number; maxY: number };
  tileIndex: { x: number; y: number; cols: number; rows: number; pageNo: number };
  spacing: number; // center spacing in same units as x/y
}) {
  const { rings, ringIdxs, tileBounds, tileIndex, spacing } = args;

  const W = 2200,
    H = 1400;
  const pad = 90;
  const mapTop = 270;

  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const g = cvs.getContext("2d")!;

  // background
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  // header
  g.fillStyle = "#0f172a";
  g.font = "900 92px ui-sans-serif, system-ui, -apple-system";
  g.fillText("Map (Every Ring Numbered)", 90, 150);

  g.font = "700 42px ui-sans-serif, system-ui, -apple-system";
  g.fillStyle = "rgba(15,23,42,0.78)";
  g.fillText(
    `Tile ${tileIndex.x + 1},${tileIndex.y + 1}  (of ${tileIndex.cols}×${tileIndex.rows})   •   Page ${tileIndex.pageNo}`,
    90,
    220,
  );

  // map area
  const usableX = pad;
  const usableY = mapTop;
  const usableW = W - pad * 2;
  const usableH = H - usableY - pad;

  const wL = Math.max(1e-6, tileBounds.maxX - tileBounds.minX);
  const hL = Math.max(1e-6, tileBounds.maxY - tileBounds.minY);

  const scale = Math.min(usableW / wL, usableH / hL);
  const ox = usableX + (usableW - wL * scale) / 2 - tileBounds.minX * scale;
  const oy = usableY + (usableH - hL * scale) / 2 - tileBounds.minY * scale;

  // ring spacing on canvas (px) for sizing
  const spacingPx = Math.max(10, spacing * scale);
  const dotR = clamp(spacingPx * 0.42, 4, 16);
  const fontPx = clamp(spacingPx * 0.55, 10, 22);

  // subtle border around map region
  g.strokeStyle = "rgba(15,23,42,0.12)";
  g.lineWidth = 3;
  g.strokeRect(usableX, usableY, usableW, usableH);

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 ${fontPx}px ui-sans-serif, system-ui, -apple-system`;

  for (const i of ringIdxs) {
    const r = rings[i];
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    if (!r.paletteIndex) continue;

    const px = r.x * scale + ox;
    const py = r.y * scale + oy;

    const hex = (r.colorHex || "#C0C0C0").toUpperCase();

    // colored dot
    g.beginPath();
    g.arc(px, py, dotR, 0, Math.PI * 2);
    g.fillStyle = hex;
    g.fill();

    // outline for print clarity
    g.lineWidth = Math.max(1, dotR * 0.18);
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.stroke();

    // number (palette index)
    const label = String(r.paletteIndex);

    // contrast-aware text: white on dark, black on light
    const lum = hexLuminance(hex);
    const fill = lum < 0.55 ? "#ffffff" : "#0f172a";
    const stroke = lum < 0.55 ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.75)";

    g.lineWidth = Math.max(2, fontPx * 0.18);
    g.strokeStyle = stroke;
    g.strokeText(label, px, py);

    g.fillStyle = fill;
    g.fillText(label, px, py);
  }

  // footer bounds readout
  g.font = "700 28px ui-sans-serif, system-ui, -apple-system";
  g.fillStyle = "rgba(15,23,42,0.65)";
  g.fillText(
    `Bounds: X ${tileBounds.minX.toFixed(1)}..${tileBounds.maxX.toFixed(1)}   •   Y ${tileBounds.minY.toFixed(1)}..${tileBounds.maxY.toFixed(1)}`,
    W / 2,
    H - 55,
  );

  return cvs;
}

/* ---------------------- component ---------------------- */

type Props = {
  rings: ExportRing[];
  initialAssignment?: PaletteAssignment | null;
  onAssignmentChange?: (p: PaletteAssignment | null) => void;
  getRendererCanvas?: () => HTMLCanvasElement | null;
  onClose?: () => void;
  /** "auto": infer; "grid": force grid map; "freeform": force freeform map */
  mapMode?: "auto" | "grid" | "freeform";
};

const FinalizeAndExportPanel: React.FC<Props> = ({
  rings,
  initialAssignment,
  onAssignmentChange,
  getRendererCanvas,
  onClose,
  mapMode = "auto",
}) => {
  const [busy, setBusy] = useState(false);

  // ---------- normalize rings & quantize to palette ----------
  const normalized = useMemo<NormRing[]>(() => {
    return (rings as any[]).map((r) => {
      // key might be "row,col"
      let row: number | undefined;
      let col: number | undefined;
      if (typeof r.key === "string" && r.key.includes(",")) {
        const [a, b] = r.key.split(",");
        const ra = parseInt(a, 10);
        const cb = parseInt(b, 10);
        if (Number.isFinite(ra)) row = ra;
        if (Number.isFinite(cb)) col = cb;
      }

      // Freeform exports x_mm/y_mm; Grid may also export row/col-derived
      const cx = Number.isFinite(r.cx) ? Number(r.cx) : Number(r.x_mm);
      const cy = Number.isFinite(r.cy) ? Number(r.cy) : Number(r.y_mm);

      const qHex = quantizeToPalette(
        String(r.colorHex || "#C0C0C0").toUpperCase(),
      );

      return {
        row,
        col,
        cx: Number.isFinite(cx) ? (cx as number) : undefined,
        cy: Number.isFinite(cy) ? (cy as number) : undefined,
        colorHex: qHex,
        innerDiameter: Number(r.innerDiameter ?? r.innerDiameter_mm ?? 6),
        wireDiameter: Number(r.wireDiameter ?? r.wireDiameter_mm ?? 1),
      };
    });
  }, [rings]);

  // ---------- derived stats (grid/freeform, palette counts, etc.) ----------
  const derived = useMemo(() => {
    let maxRow = -1,
      maxCol = -1;
    let hasRowCol = false,
      hasXY = false;

    // counts for ALL palette colors (stable 24)
    const counts = new Map<string, number>();
    for (const hex of PALETTE24) counts.set(hex, 0);

    for (const r of normalized) {
      if (Number.isFinite(r.row) && Number.isFinite(r.col)) {
        hasRowCol = true;
        maxRow = Math.max(maxRow, r.row!);
        maxCol = Math.max(maxCol, r.col!);
      }
      if (Number.isFinite(r.cx) && Number.isFinite(r.cy)) hasXY = true;

      const key = (r.colorHex || "#C0C0C0").toUpperCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const forcedGrid = mapMode === "grid";
    const forcedFreeform = mapMode === "freeform";

    const rows = hasRowCol ? maxRow + 1 : 0;
    const cols = hasRowCol ? maxCol + 1 : 0;

    // ✅ Freeform vs Grid auto detection fix:
    // If export has row/col but is sparse (freeform inside bounding box), treat as Freeform.
    const totalCells = hasRowCol ? Math.max(1, rows * cols) : 0;
    const density = hasRowCol ? normalized.length / totalCells : 1;
    const autoGrid = hasRowCol && density > 0.92; // tweak 0.90–0.96

    const byColor = PALETTE24.map((hex) => ({
      hex,
      count: counts.get(hex) || 0,
    }));

    const usedColors = byColor.filter((x) => x.count > 0);
    const usedColorCount = usedColors.length;

    const isGrid = forcedGrid || (!forcedFreeform && autoGrid);
    const isFreeform =
      forcedFreeform || (!forcedGrid && !autoGrid && (hasXY || hasRowCol));

    return {
      rows,
      cols,
      byColor, // ALL 24
      total: normalized.length,
      usedColorCount,
      isGrid,
      isFreeform,
      density,
      indexByHex: PALETTE_INDEX_BY_HEX, // STABLE 1..24 always
      paletteAll: PALETTE24,
      paletteUsed: usedColors.map((x) => x.hex),
    };
  }, [normalized, mapMode]);

  const {
    rows,
    cols,
    byColor,
    total,
    usedColorCount,
    isGrid,
    isFreeform,
  } = derived;

  /* ---------------------- PDF builder ---------------------- */
  const buildPdf = async () => {
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      // page setup (landscape letter)
      const W = 842,
        H = 595;
      const margin = 36;

      // ---------- Pages 1..N: BOM (paginated) ----------
      {
        const rowH = 22;
        const headerY = H - margin - 8;
        const tableTop = headerY - 60;
        const footerH = 28;

        // ALL 24 colors; paginate anyway
        const rowsPerPage = Math.max(
          1,
          Math.floor((tableTop - margin - footerH) / rowH) - 1,
        );

        let pageIndex = 0;
        for (let start = 0; start < byColor.length; start += rowsPerPage) {
          const slice = byColor.slice(start, start + rowsPerPage);
          const page = pdf.addPage([W, H]);
          page.drawRectangle({
            x: 0,
            y: 0,
            width: W,
            height: H,
            color: rgb(1, 1, 1),
          });

          const heading =
            "Bill of Materials (24-color Palette)" +
            (byColor.length > rowsPerPage
              ? ` (Page ${pageIndex + 1} of ${Math.ceil(
                  byColor.length / rowsPerPage,
                )})`
              : "");

          page.drawText(heading, {
            x: margin,
            y: headerY,
            size: 24,
            font: fontBold,
            color: rgb(0.07, 0.09, 0.16),
          });

          const parts: string[] = [
            `Rings: ${formatInt(total)}`,
            `Colors used: ${usedColorCount}/24`,
          ];
          if (isGrid) parts.unshift(`Cols: ${cols}`);
          if (isGrid) parts.unshift(`Rows: ${rows}`);
          page.drawText(parts.join("   •   "), {
            x: margin,
            y: headerY - 26,
            size: 12,
            font: fontRegular,
            color: rgb(0.16, 0.22, 0.32),
          });

          const colsX = {
            item: margin,
            rings: margin + 360,
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
          th("Rings", colsX.rings);
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

            // Number (stable palette index) + Hex label
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

            // Counts
            page.drawText(formatInt(line.count), {
              x: colsX.rings,
              y,
              size: 12,
              font: fontRegular,
              color: rgb(0.07, 0.09, 0.16),
            });

            // packs: 0 stays 0; otherwise ceil(count/1500)
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

          // Totals footer
          const totalPacks = byColor.reduce(
            (s, l) => s + (l.count > 0 ? Math.ceil(l.count / 1500) : 0),
            0,
          );
          page.drawText(
            `Totals — Rings: ${formatInt(total)}   •   Packs (1500): ${formatInt(
              totalPacks,
            )}`,
            {
              x: margin,
              y: margin - 4 + 8,
              size: 10,
              font: fontRegular,
              color: rgb(0.16, 0.22, 0.32),
            },
          );

          pageIndex++;
        }
      }

      // ---------- Map pages ----------
      // Freeform: overview + tiled pages (EVERY RING NUMBERED)
      // Grid: existing “Numbered Cells” behavior (stable 1..24).
      if (isFreeform) {
        const prepared = prepareRingsForMap(normalized);
        const spacingMm = estimateCenterSpacingMm(normalized);

        // Canvas map area geometry (must match canvas builders)
        const TILE_CANVAS_W = 2200;
        const TILE_CANVAS_H = 1400;
        const pad = 90;
        const mapTop = 270;
        const usableW = TILE_CANVAS_W - pad * 2;
        const usableH = TILE_CANVAS_H - mapTop - pad;

        // ✅ For numbering, use a larger target spacing so labels are readable.
        const targetSpacingPx = 42; // try 36–52
        const scaleUnitsToPx = targetSpacingPx / Math.max(1e-6, spacingMm);

        const tileW = usableW / scaleUnitsToPx;
        const tileH = usableH / scaleUnitsToPx;

        const plan = buildTilePlan(prepared, tileW, tileH);

        // 1) Overview page (dots + tile grid)
        {
          const page = pdf.addPage([W, H]);
          page.drawRectangle({
            x: 0,
            y: 0,
            width: W,
            height: H,
            color: rgb(1, 1, 1),
          });

          const mapCanvas = buildFreeformOverviewMapCanvas(prepared, {
            bounds: plan.bounds,
            tilesX: plan.tilesX,
            tilesY: plan.tilesY,
            tileW: plan.tileW,
            tileH: plan.tileH,
          });
          const png = await canvasToPng(mapCanvas);
          const img = await pdf.embedPng(png);

          const padPdf = 24;
          const boxW = W - padPdf * 2,
            boxH = H - padPdf * 2;
          const s = Math.min(boxW / img.width, boxH / img.height);
          const drawW = img.width * s,
            drawH = img.height * s;

          page.drawImage(img, {
            x: (W - drawW) / 2,
            y: (H - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        }

        // 2) Tile pages (every ring numbered with palette index)
        {
          let pageNo = 1;
          for (let ty = 0; ty < plan.tilesY; ty++) {
            for (let tx = 0; tx < plan.tilesX; tx++) {
              const key = `${tx},${ty}`;
              const ringIdxs = plan.tileRings.get(key) || [];

              const tileBoundsBase = {
                minX: plan.bounds.minX + tx * plan.tileW,
                maxX: plan.bounds.minX + (tx + 1) * plan.tileW,
                minY: plan.bounds.minY + ty * plan.tileH,
                maxY: plan.bounds.minY + (ty + 1) * plan.tileH,
              };

              // expand a tiny margin so edge rings aren’t clipped
              const marginU = spacingMm * 2;
              const tileBounds = {
                minX: tileBoundsBase.minX - marginU,
                maxX: tileBoundsBase.maxX + marginU,
                minY: tileBoundsBase.minY - marginU,
                maxY: tileBoundsBase.maxY + marginU,
              };

              const tileCanvas = buildFreeformRingNumberTileCanvas({
                rings: prepared,
                ringIdxs,
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

              const png = await canvasToPng(tileCanvas);
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
              const boxW = W - padPdf * 2,
                boxH = H - padPdf * 2;
              const s = Math.min(boxW / img.width, boxH / img.height);
              const drawW = img.width * s,
                drawH = img.height * s;

              page.drawImage(img, {
                x: (W - drawW) / 2,
                y: (H - drawH) / 2,
                width: drawW,
                height: drawH,
              });

              pageNo++;
            }
          }
        }
      } else if (isGrid && rows > 0 && cols > 0) {
        // ---------- Grid map (existing behavior, stable indices) ----------
        const page = pdf.addPage([W, H]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: W,
          height: H,
          color: rgb(1, 1, 1),
        });

        const titleY = H - margin - 24;
        page.drawText("Map (Numbered Cells)", {
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

        // Build a quick lookup for (row,col) → colorHex (quantized)
        const colorByCell = new Map<string, string>();
        for (const r of normalized) {
          if (Number.isFinite(r.row) && Number.isFinite(r.col)) {
            colorByCell.set(`${r.row},${r.col}`, r.colorHex);
          }
        }

        // cells
        const outline = rgb(0.75, 0.8, 0.87);
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            const x = originX + cc * cellSize;
            const y = originY + (rows - 1 - rr) * cellSize; // flip Y

            const hex =
              colorByCell.get(`${rr},${cc}`) ?? "#C0C0C0".toUpperCase();
            const c = hexToRgbUnit(hex);

            // color fill
            page.drawRectangle({
              x: x + 0.5,
              y: y + 0.5,
              width: cellSize - 1,
              height: cellSize - 1,
              color: rgb(c.r, c.g, c.b),
              borderColor: outline,
              borderWidth: Math.max(1.2, Math.floor(cellSize / 11)),
            });

            // number overlay (stable palette index 1..24)
            const idx = PALETTE_INDEX_BY_HEX.get(hex.toUpperCase());
            if (idx) {
              const label = String(idx);
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

        // axes
        const axisColor = rgb(0.25, 0.32, 0.4);
        for (let c = 1; c <= cols; c++) {
          const cx = originX + (c - 0.5) * cellSize;
          page.drawText(String(c), {
            x: cx - 6,
            y: originY + gridH + 6,
            size: 8,
            font: fontRegular,
            color: axisColor,
          });
        }
        for (let r = 1; r <= rows; r++) {
          const ry = originY + (rows - r + 0.5) * cellSize - 4;
          page.drawText(String(r), {
            x: originX - 18,
            y: ry,
            size: 8,
            font: fontRegular,
            color: axisColor,
          });
        }

        page.drawText(`Rows: ${rows}   •   Cols: ${cols}`, {
          x: margin,
          y: margin - 4 + 8,
          size: 10,
          font: fontRegular,
          color: rgb(0.16, 0.22, 0.32),
        });
      } else {
        const page = pdf.addPage([W, H]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: W,
          height: H,
          color: rgb(1, 1, 1),
        });
        page.drawText("No map positions found (no row/col or cx/cy).", {
          x: margin,
          y: H / 2,
          size: 12,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
      }

      // ---------- Preview (always 2D on white) ----------
      {
        const page = pdf.addPage([W, H]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: W,
          height: H,
          color: rgb(1, 1, 1),
        });

        const previewCanvas = buildPreviewFallback(normalized as any);
        const png = await canvasToPng(previewCanvas);
        const img = await pdf.embedPng(png);

        const pad = 40;
        const maxW = W - pad * 2,
          maxH = H - pad * 2;
        const s = Math.min(maxW / img.width, maxH / img.height);
        const drawW = img.width * s,
          drawH = img.height * s;

        page.drawImage(img, {
          x: (W - drawW) / 2,
          y: (H - drawH) / 2,
          width: drawW,
          height: drawH,
        });

        page.drawText(isGrid ? `Preview — ${rows} × ${cols}` : "Preview", {
          x: pad,
          y: H - pad + 8,
          size: 12,
          font: fontRegular,
          color: rgb(0.07, 0.09, 0.16),
        });
      }

      // --- SAVE + DOWNLOAD ---
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

  /* ---------------------- CSV (quantized to palette) ---------------------- */
  const gridForCsv = useMemo(() => {
    let maxRow = -1,
      maxCol = -1;
    for (const r of normalized) {
      if (Number.isFinite(r.row)) maxRow = Math.max(maxRow, r.row!);
      if (Number.isFinite(r.col)) maxCol = Math.max(maxCol, r.col!);
    }
    return { rows: maxRow + 1, cols: maxCol + 1 };
  }, [normalized]);

  const exportCsv = () => {
    const header = [
      "id",
      "row",
      "col",
      "colorHex",
      "paletteIndex",
      "innerDiameter",
      "wireDiameter",
    ];
    const lines = [header.join(",")];
    for (const r of normalized as any[]) {
      const id = `${r.row ?? ""},${r.col ?? ""}`;
      const hex = (r.colorHex || "").toUpperCase();
      const idx = PALETTE_INDEX_BY_HEX.get(hex) ?? "";
      lines.push(
        [
          id,
          r.row ?? "",
          r.col ?? "",
          hex,
          idx,
          r.innerDiameter ?? "",
          r.wireDiameter ?? "",
        ].join(","),
      );
    }
    const preface =
      gridForCsv.rows && gridForCsv.cols
        ? `# Rows,${gridForCsv.rows}\n# Cols,${gridForCsv.cols}\n`
        : "";
    const blob = new Blob([preface + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    downloadBlob(
      `rings${
        gridForCsv.rows && gridForCsv.cols
          ? `-${gridForCsv.rows}x${gridForCsv.cols}`
          : ""
      }.csv`,
      blob,
    );
  };

  // ---------- UI ----------
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
          width: 560,
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
          Rings: <b>{formatInt(total)}</b> &nbsp;•&nbsp; Colors used:{" "}
          <b>{usedColorCount}</b>/24
          {isGrid && (
            <>
              &nbsp;•&nbsp; Rows: <b>{rows}</b> &nbsp;•&nbsp; Cols:{" "}
              <b>{cols}</b>
            </>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
          Freeform map pages are tiled for readability. Each ring is labeled with its stable{" "}
          <b>palette BOM index (1–24)</b>.
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button
            onClick={buildPdf}
            disabled={busy}
            style={btnPrimary}
            title="PDF with paginated BOM (all 24 colors) + tiled numbered maps (Freeform) + preview."
          >
            {busy ? "Building PDF…" : "Export PDF"}
          </button>
          <button onClick={exportCsv} style={btnGhost}>
            Export CSV
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: "#93a3b8" }}>
          Quantization is limited to the <b>24-color palette</b>. The BOM index is stable 1–24.
          Freeform maps are automatically split into multiple pages for readability.
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