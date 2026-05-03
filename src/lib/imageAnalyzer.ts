// src/lib/imageAnalyzer.ts
// Canvas-based image analysis for chainmail/scalemail pattern extraction.

export interface AnalysisRing {
  row: number;
  col: number;
  color: string;
}

export interface AnalysisScale {
  key: string;
  color: string;
}

export interface AnalysisResult {
  rings: AnalysisRing[];
  scaleColors: AnalysisScale[];
  gridRows: number;
  gridCols: number;
}

export interface AnalysisOptions {
  gridCols: number;              // target columns across image width
  bgLumThreshold: number;        // 0–1: pixels darker than this = background (catches dark backdrops)
  bgSatThreshold: number;        // 0–1: very desaturated + dark pixels = background
  includeScales: boolean;
  scaleMinSat: number;           // 0–1: min saturation to emit a scale
  ringColor: string;             // fixed ring base color (used when useImageColorForRings=false)
  useImageColorForRings: boolean;
  bgColor: [number, number, number] | null; // sampled background color to exclude
  bgColorTolerance: number;      // 0–255 euclidean RGB distance treated as background
  fillInterior: boolean;         // fill enclosed gaps inside the detected shape with rings
  interiorScaleDensity: number;  // 0–1: fraction of interior gap cells that also get a sparse scale
  darkTrimFraction: number;      // 0–0.5: trim this fraction of darkest pixels per cell (removes lead lines)
  paletteSize: number;           // 0 = off, 4–24: snap all colors to N clusters via k-means
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  gridCols: 30,
  bgLumThreshold: 0.12,
  bgSatThreshold: 0.08,
  includeScales: true,
  scaleMinSat: 0.22,
  ringColor: "#374151",
  useImageColorForRings: false,
  bgColor: null,
  bgColorTolerance: 55,
  fillInterior: false,
  interiorScaleDensity: 0.12,
  darkTrimFraction: 0,
  paletteSize: 0,
};

// ── Colour helpers ──────────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }
  return { h: h * 360, s, l };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ── Pixel sampling ──────────────────────────────────────────────────────────

function sampleCircle(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  cx: number,
  cy: number,
  radius: number,
  darkTrimFraction = 0,
): { r: number; g: number; b: number; valid: boolean } {
  type Px = [number, number, number, number]; // r, g, b, lum
  const pixels: Px[] = [];
  const r2 = radius * radius;
  const step = Math.max(1, Math.floor(radius / 4));
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      if (dx * dx + dy * dy > r2) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      const idx = (py * W + px) * 4;
      if (data[idx + 3] < 128) continue;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      pixels.push([r, g, b, 0.299 * r + 0.587 * g + 0.114 * b]);
    }
  }
  if (pixels.length === 0) return { r: 0, g: 0, b: 0, valid: false };

  let used = pixels;
  if (darkTrimFraction > 0 && pixels.length > 4) {
    pixels.sort((a, b) => a[3] - b[3]);
    const cut = Math.floor(pixels.length * darkTrimFraction);
    used = pixels.slice(cut);
  }

  let tr = 0, tg = 0, tb = 0;
  for (const [r, g, b] of used) { tr += r; tg += g; tb += b; }
  const n = used.length;
  return { r: tr / n, g: tg / n, b: tb / n, valid: true };
}

// ── K-means palette quantization ─────────────────────────────────────────────

function kmeansColors(
  colors: [number, number, number][],
  k: number,
  iterations = 14,
): [number, number, number][] {
  if (colors.length <= k) return colors.map((c) => [...c] as [number, number, number]);

  // Deterministic init: sort by hue then pick evenly spaced entries
  const sorted = [...colors].sort((a, b) => {
    const ha = rgbToHsl(a[0], a[1], a[2]).h;
    const hb = rgbToHsl(b[0], b[1], b[2]).h;
    return ha - hb;
  });
  const step = Math.max(1, Math.floor(sorted.length / k));
  const centroids: [number, number, number][] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.min(i * step, sorted.length - 1);
    centroids.push([...sorted[idx]] as [number, number, number]);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const sums: [number, number, number][] = centroids.map(() => [0, 0, 0]);
    const counts = new Array<number>(k).fill(0);
    for (const [r, g, b] of colors) {
      let minD = Infinity, closest = 0;
      for (let i = 0; i < k; i++) {
        const d = colorDist(r, g, b, centroids[i][0], centroids[i][1], centroids[i][2]);
        if (d < minD) { minD = d; closest = i; }
      }
      sums[closest][0] += r; sums[closest][1] += g; sums[closest][2] += b;
      counts[closest]++;
    }
    for (let i = 0; i < k; i++) {
      if (!counts[i]) continue;
      centroids[i] = [
        Math.round(sums[i][0] / counts[i]),
        Math.round(sums[i][1] / counts[i]),
        Math.round(sums[i][2] / counts[i]),
      ];
    }
  }
  return centroids;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function quantizeToKColors(rings: AnalysisRing[], scales: AnalysisScale[], k: number): void {
  if (k <= 0) return;

  // Collect all unique hex colors
  const uniqueHexes = new Set<string>();
  rings.forEach((r) => uniqueHexes.add(r.color));
  scales.forEach((s) => uniqueHexes.add(s.color));

  const hexList = Array.from(uniqueHexes);
  if (hexList.length <= k) return;

  const rgbList = hexList.map(hexToRgb);
  const centroids = kmeansColors(rgbList, k);

  // Build snap map: original hex → nearest centroid hex
  const snapMap = new Map<string, string>();
  for (let i = 0; i < hexList.length; i++) {
    const [r, g, b] = rgbList[i];
    let minD = Infinity;
    let best = centroids[0];
    for (const c of centroids) {
      const d = colorDist(r, g, b, c[0], c[1], c[2]);
      if (d < minD) { minD = d; best = c; }
    }
    snapMap.set(hexList[i], rgbToHex(best[0], best[1], best[2]));
  }

  for (const ring of rings) ring.color = snapMap.get(ring.color) ?? ring.color;
  for (const scale of scales) scale.color = snapMap.get(scale.color) ?? scale.color;
}

// ── Background auto-detection ───────────────────────────────────────────────
// Samples the four corners of the image and averages them — corners are almost
// always the background (studio white, dark drape, etc.).

export function autoDetectBackground(img: HTMLImageElement): [number, number, number] {
  const canvas = document.createElement("canvas");
  const W = (canvas.width = img.naturalWidth || img.width);
  const H = (canvas.height = img.naturalHeight || img.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const patchSize = Math.max(4, Math.round(Math.min(W, H) * 0.04));
  const corners: [number, number][] = [
    [0, 0], [W - patchSize, 0], [0, H - patchSize], [W - patchSize, H - patchSize],
  ];

  let tr = 0, tg = 0, tb = 0, count = 0;
  for (const [ox, oy] of corners) {
    const d = ctx.getImageData(ox, oy, patchSize, patchSize).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      tr += d[i]; tg += d[i + 1]; tb += d[i + 2]; count++;
    }
  }

  if (count === 0) return [255, 255, 255];
  return [Math.round(tr / count), Math.round(tg / count), Math.round(tb / count)];
}

// Sample a single pixel from an image at the given image-space coordinates.
export function sampleImagePixel(
  img: HTMLImageElement,
  imgX: number,
  imgY: number,
): [number, number, number] | null {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const px = Math.round(Math.max(0, Math.min(canvas.width - 1, imgX)));
  const py = Math.round(Math.max(0, Math.min(canvas.height - 1, imgY)));
  const d = ctx.getImageData(px, py, 1, 1).data;
  if (d[3] < 128) return null;
  return [d[0], d[1], d[2]];
}

// ── Main analysis ───────────────────────────────────────────────────────────

// Seed a simple deterministic PRNG so fill results are stable across re-runs
function seededRand(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

export function analyzeImage(img: HTMLImageElement, options: AnalysisOptions): AnalysisResult {
  const {
    gridCols,
    bgLumThreshold,
    bgSatThreshold,
    includeScales,
    scaleMinSat,
    ringColor,
    useImageColorForRings,
    bgColor,
    bgColorTolerance,
    fillInterior,
    interiorScaleDensity,
    darkTrimFraction,
    paletteSize,
  } = options;

  const canvas = document.createElement("canvas");
  const W = (canvas.width = img.naturalWidth || img.width);
  const H = (canvas.height = img.naturalHeight || img.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, W, H);

  const cellW = W / gridCols;
  const cellH = cellW;
  const gridRows = Math.ceil(H / cellH);
  const sampleR = cellW * 0.4;

  const rings: AnalysisRing[] = [];
  const scaleColors: AnalysisScale[] = [];

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;

      const { r, g, b, valid } = sampleCircle(data, W, H, cx, cy, sampleR, darkTrimFraction);
      if (!valid) continue;

      // Luminance-based background (catches dark backdrops)
      const { s, l } = rgbToHsl(r, g, b);
      if (l < bgLumThreshold) continue;
      if (s < bgSatThreshold && l < 0.55) continue;

      // Colour-distance background exclusion (catches white/coloured backdrops)
      if (bgColor) {
        const dist = colorDist(r, g, b, bgColor[0], bgColor[1], bgColor[2]);
        if (dist < bgColorTolerance) continue;
      }

      const pixelHex = rgbToHex(r, g, b);
      rings.push({ row, col, color: useImageColorForRings ? pixelHex : ringColor });

      if (includeScales && s >= scaleMinSat) {
        scaleColors.push({ key: `${row},${col}`, color: pixelHex });
      }
    }
  }

  // ── Fill interior ─────────────────────────────────────────────────────────
  // After the main pass, find the bounding shape row-by-row and fill enclosed
  // gaps with rings. Rows that had zero detections are interpolated from their
  // nearest neighbours so sparse or dark zones (e.g. open-weave chainmail) are
  // fully filled rather than left empty.
  if (fillInterior && rings.length > 0) {
    const rand = seededRand(gridCols * 1000 + gridRows);

    // Per-row detected column extents
    const rowMin = new Array<number>(gridRows).fill(Infinity);
    const rowMax = new Array<number>(gridRows).fill(-Infinity);
    for (const ring of rings) {
      if (ring.col < rowMin[ring.row]) rowMin[ring.row] = ring.col;
      if (ring.col > rowMax[ring.row]) rowMax[ring.row] = ring.col;
    }

    // Find first and last rows that actually have detections
    let firstRow = -1, lastRow = -1;
    for (let r = 0; r < gridRows; r++) {
      if (rowMin[r] !== Infinity) { if (firstRow === -1) firstRow = r; lastRow = r; }
    }

    // Interpolate bounds for empty rows between firstRow and lastRow
    const interpMin = rowMin.slice();
    const interpMax = rowMax.slice();

    for (let r = firstRow; r <= lastRow; r++) {
      if (interpMin[r] !== Infinity) continue;
      // Find nearest rows above and below that have bounds
      let above = r - 1;
      while (above >= firstRow && interpMin[above] === Infinity) above--;
      let below = r + 1;
      while (below <= lastRow && interpMin[below] === Infinity) below++;
      if (above < firstRow) { interpMin[r] = interpMin[below]; interpMax[r] = interpMax[below]; }
      else if (below > lastRow) { interpMin[r] = interpMin[above]; interpMax[r] = interpMax[above]; }
      else {
        // Linear interpolation
        const t = (r - above) / (below - above);
        interpMin[r] = Math.round(interpMin[above] * (1 - t) + interpMin[below] * t);
        interpMax[r] = Math.round(interpMax[above] * (1 - t) + interpMax[below] * t);
      }
    }

    // Build set of already-occupied cells
    const occupied = new Set(rings.map((rg) => `${rg.row},${rg.col}`));
    const scaleOccupied = new Set(scaleColors.map((s) => s.key));

    for (let row = firstRow; row <= lastRow; row++) {
      const lo = Math.round(interpMin[row]);
      const hi = Math.round(interpMax[row]);
      if (lo > hi) continue;

      for (let col = lo; col <= hi; col++) {
        const key = `${row},${col}`;
        if (occupied.has(key)) continue;

        // Sample the image at this position
        const cx = (col + 0.5) * cellW;
        const cy = (row + 0.5) * cellH;
        const { r: pr, g: pg, b: pb, valid } = sampleCircle(data, W, H, cx, cy, sampleR);

        // Determine ring color: use image color if it's not bg-like, else fallback to ringColor
        const isBgLike = !valid || (bgColor
          ? colorDist(pr, pg, pb, bgColor[0], bgColor[1], bgColor[2]) < bgColorTolerance
          : rgbToHsl(pr, pg, pb).l > 0.82);

        const fillRingHex = (!isBgLike && useImageColorForRings)
          ? rgbToHex(pr, pg, pb)
          : ringColor;

        rings.push({ row, col, color: fillRingHex });
        occupied.add(key);

        // Sparse scales for interior gap cells
        if (includeScales && interiorScaleDensity > 0 && rand() < interiorScaleDensity && !scaleOccupied.has(key)) {
          // Use image color if available and looks like a scale (bright/metallic), else ring color
          const { s: ps, l: pl } = valid ? rgbToHsl(pr, pg, pb) : { s: 0, l: 0 };
          const scaleHex = (!isBgLike && (ps >= scaleMinSat * 0.5 || pl > 0.5))
            ? rgbToHex(pr, pg, pb)
            : ringColor;
          scaleColors.push({ key, color: scaleHex });
          scaleOccupied.add(key);
        }
      }
    }
  }

  // Palette quantization — snap all colors to k clusters
  if (paletteSize > 0) quantizeToKColors(rings, scaleColors, paletteSize);

  return { rings, scaleColors, gridRows, gridCols };
}

// ── Preview overlay renderer ────────────────────────────────────────────────

export function renderAnalysisOverlay(
  destCanvas: HTMLCanvasElement,
  img: HTMLImageElement,
  result: AnalysisResult | null,
  bgPickMode = false,
) {
  const ctx = destCanvas.getContext("2d");
  if (!ctx) return;
  const W = destCanvas.width;
  const H = destCanvas.height;

  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  const scale = Math.min(W / imgW, H / imgH);
  const dw = imgW * scale;
  const dh = imgH * scale;
  const ox = (W - dw) / 2;
  const oy = (H - dh) / 2;

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, ox, oy, dw, dh);

  // Crosshair cursor hint when in pick mode
  if (bgPickMode) {
    ctx.save();
    ctx.strokeStyle = "rgba(239,68,68,0.8)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(ox, oy, dw, dh);
    ctx.restore();
  }

  if (!result || result.rings.length === 0) return;

  const cellW = dw / result.gridCols;
  const cellH = dh / result.gridRows;
  const dotR = Math.max(2, Math.min(cellW * 0.35, 9));

  const scaleKeys = new Set(result.scaleColors.map((s) => s.key));
  const scaleColorMap = new Map(result.scaleColors.map((s) => [s.key, s.color]));

  for (const ring of result.rings) {
    const cx = ox + (ring.col + 0.5) * cellW;
    const cy = oy + (ring.row + 0.5) * cellH;
    const key = `${ring.row},${ring.col}`;

    if (scaleKeys.has(key)) {
      const sc = scaleColorMap.get(key)!;
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = sc;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, dotR * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}
