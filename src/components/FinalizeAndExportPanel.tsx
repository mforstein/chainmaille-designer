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

/* ---------------------- small utils ---------------------- */

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

/** Nearest-palette quantization (euclidean in RGB). */
function quantizeToPalette(hex: string): string {
  const { r, g, b } = hexToRgb255((hex || "#C0C0C0").toUpperCase());
  let best = PALETTE24[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of PALETTE24) {
    const q = hexToRgb255(p);
    const dr = q.r - r,
      dg = q.g - g,
      db = q.b - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = p;
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

/** Rounded rect helper (no .roundRect dependency) */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  r = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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

/** Full-image numbered overlay for Freeform (no grid/axes). */
function buildFreeformNumberedMapCanvas(
  rings: Array<{
    cx?: number;
    cy?: number;
    x_mm?: number;
    y_mm?: number;
    colorHex?: string;
  }>,
  orderedIndexByHex: Map<string, number>,
) {
  // bounds
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of rings) {
    const x = Number.isFinite(r.cx) ? Number(r.cx) : Number(r.x_mm);
    const y = Number.isFinite(r.cy) ? Number(r.cy) : Number(r.y_mm);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x!);
      minY = Math.min(minY, y!);
      maxX = Math.max(maxX, x!);
      maxY = Math.max(maxY, y!);
    }
  }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  const wL = Math.max(1, maxX - minX),
    hL = Math.max(1, maxY - minY);

  const W = 2200,
    H = 1400;
  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const g = cvs.getContext("2d")!;

  // white
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  // title
  g.fillStyle = "#0f172a";
  g.font = "700 90px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  g.fillText("Numbered Map", 90, 160);

  // legend (built later by caller on PDF; here we just draw labels on image)

  // map area
  const pad = 80;
  const usableX = pad,
    usableY = 220 + 320 + 40; // after legend space
  const usableW = W - pad * 2,
    usableH = H - usableY - pad;
  const scale = Math.min(usableW / wL, usableH / hL);
  const ox = usableX + (usableW - wL * scale) / 2 - minX * scale;
  const oy = usableY + (usableH - hL * scale) / 2 - minY * scale;

  const fontPx = 28;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const r of rings) {
    const x0 = Number.isFinite(r.cx) ? Number(r.cx) : Number(r.x_mm);
    const y0 = Number.isFinite(r.cy) ? Number(r.cy) : Number(r.y_mm);
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
    const idx = orderedIndexByHex.get(
      quantizeToPalette(String(r.colorHex || "#ffffff").toUpperCase()),
    );
    if (!idx) continue;

    const px = x0! * scale + ox;
    const py = y0! * scale + oy;

    const label = String(idx);
    g.font = `700 ${fontPx}px ui-sans-serif, system-ui`;
    const m = g.measureText(label);
    const bw = Math.max(fontPx, m.width + fontPx * 0.6);
    const bh = fontPx + fontPx * 0.5;
    const rx = Math.min(10, bh * 0.35);

    g.save();
    g.translate(px, py);

    // rounded badge
    g.beginPath();
    g.moveTo(-bw / 2 + rx, -bh / 2);
    g.lineTo(bw / 2 - rx, -bh / 2);
    g.quadraticCurveTo(bw / 2, -bh / 2, bw / 2, -bh / 2 + rx);
    g.lineTo(bw / 2, bh / 2 - rx);
    g.quadraticCurveTo(bw / 2, bh / 2, bw / 2 - rx, bh / 2);
    g.lineTo(-bw / 2 + rx, bh / 2);
    g.quadraticCurveTo(-bw / 2, bh / 2, -bw / 2, bh / 2 - rx);
    g.lineTo(-bw / 2, -bh / 2 + rx);
    g.quadraticCurveTo(-bw / 2, -bh / 2, -bw / 2 + rx, -bh / 2);
    g.closePath();
    g.fillStyle = "#E5E7EB";
    g.strokeStyle = "#CBD5E1";
    g.lineWidth = Math.max(1, fontPx * 0.08);
    g.fill();
    g.stroke();

    g.fillStyle = "#111827";
    g.fillText(label, 0, 0);
    g.restore();
  }

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
  const normalized = useMemo(() => {
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

    const counts = new Map<string, number>(); // palette-quantized
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

    // order palette in fixed PALETTE24 order, but only those used
    const paletteUsed = PALETTE24.filter((hex) => (counts.get(hex) || 0) > 0);
    const byColor = paletteUsed.map((hex) => ({
      hex,
      count: counts.get(hex) || 0,
    }));

    return {
      rows: hasRowCol ? maxRow + 1 : 0,
      cols: hasRowCol ? maxCol + 1 : 0,
      byColor,
      total: normalized.length,
      isGrid: forcedGrid || (!forcedFreeform && hasRowCol),
      isFreeform: forcedFreeform || (!forcedGrid && hasXY && !hasRowCol),
      indexByHex: new Map(paletteUsed.map((h, i) => [h, i + 1])),
      paletteUsed,
    };
  }, [normalized, mapMode]);

  const {
    rows,
    cols,
    byColor,
    total,
    isGrid,
    isFreeform,
    indexByHex,
    paletteUsed,
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
        // how many rows fit on a page?
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
            "Bill of Materials" +
            (byColor.length > rowsPerPage
              ? ` (Page ${pageIndex + 1} of ${Math.ceil(
                  byColor.length / rowsPerPage,
                )})`
              : "");

          page.drawText(heading, {
            x: margin,
            y: headerY,
            size: 28,
            font: fontBold,
            color: rgb(0.07, 0.09, 0.16),
          });

          const parts: string[] = [
            `Rings: ${formatInt(total)}`,
            `Colors: ${paletteUsed.length}`,
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
          let idx = start + 1;
          for (const line of slice) {
            const u = hexToRgbUnit(line.hex);
            page.drawRectangle({
              x: colsX.item,
              y,
              width: 14,
              height: 14,
              color: rgb(u.r, u.g, u.b),
              borderColor: rgb(0, 0, 0),
              borderWidth: 0.6,
            });

            // Number (BOM index) + Hex label
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
            page.drawText(String(Math.max(1, Math.ceil(line.count / 1500))), {
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
            idx++;
          }

          // Totals footer
          const totalPacks = byColor.reduce(
            (s, l) => s + Math.max(1, Math.ceil(l.count / 1500)),
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

      // ---------- Map page (grid: numbered cells; freeform: numbered badges) ----------
      {
        const page = pdf.addPage([W, H]);
        page.drawRectangle({
          x: 0,
          y: 0,
          width: W,
          height: H,
          color: rgb(1, 1, 1),
        });

        if (isFreeform) {
          // Freeform — draw a full-image with numbered badges
          const mapCanvas = buildFreeformNumberedMapCanvas(
            normalized as any,
            indexByHex,
          );
          const png = await canvasToPng(mapCanvas);
          const img = await pdf.embedPng(png);
          const pad = 24;
          const boxW = W - pad * 2,
            boxH = H - pad * 2;
          const s = Math.min(boxW / img.width, boxH / img.height);
          const drawW = img.width * s,
            drawH = img.height * s;
          page.drawImage(img, {
            x: (W - drawW) / 2,
            y: (H - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        } else if (isGrid && rows > 0 && cols > 0) {
          // Grid — high-contrast map + per-cell number (palette index)
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

              // number overlay (palette index)
              const idx = indexByHex.get(hex.toUpperCase());
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
          page.drawText("No map positions found (no row/col or cx/cy).", {
            x: margin,
            y: H / 2,
            size: 12,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.2),
          });
        }
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
      "innerDiameter",
      "wireDiameter",
    ];
    const lines = [header.join(",")];
    for (const r of normalized as any[]) {
      const id = `${r.row ?? ""},${r.col ?? ""}`;
      lines.push(
        [
          id,
          r.row ?? "",
          r.col ?? "",
          (r.colorHex || "").toUpperCase(), // already quantized
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
          width: 520,
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
          Rings: <b>{formatInt(total)}</b> &nbsp;•&nbsp; Colors:{" "}
          <b>{paletteUsed.length}</b>
          {isGrid && (
            <>
              &nbsp;•&nbsp; Rows: <b>{rows}</b> &nbsp;•&nbsp; Cols:{" "}
              <b>{cols}</b>
            </>
          )}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button
            onClick={buildPdf}
            disabled={busy}
            style={btnPrimary}
            title="PDF with paginated BOM. Grid maps have per-cell numbers; Freeform is full-image numbered."
          >
            {busy ? "Building PDF…" : "Export PDF"}
          </button>
          <button onClick={exportCsv} style={btnGhost}>
            Export CSV
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: "#93a3b8" }}>
          BOM is limited to the <b>24-color palette</b> you paint with (only
          colors used are listed). Map numbers match the BOM indexes.
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
