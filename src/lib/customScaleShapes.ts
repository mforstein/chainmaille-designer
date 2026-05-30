// Custom scale-shape library: types, persistent storage, polygon utilities,
// and a simple image-to-silhouette pipeline. Shared by Freeform and Tuner so
// the same user-defined shapes show up in both editors.
//
// Polygons are stored as an array of [x, y] points in a normalized
// coordinate system:
//   - centered at (0, 0)
//   - x ∈ [-0.5, +0.5]
//   - y ∈ [-0.5, +0.5] (positive Y points DOWN to match canvas / our scale layout)
// To render at a given width/height, multiply by (width, height) directly.

export type BuiltinScaleShape = "teardrop" | "leaf" | "round" | "kite";

export type CustomShapeSource = "base" | "image" | "freehand";

export interface CustomScaleShape {
  id: string;                       // "custom:<uuid>"
  emoji: string;
  label: string;
  source: CustomShapeSource;
  baseShape?: BuiltinScaleShape;    // when source === "base"
  polygon?: Array<[number, number]>; // when source === "image" | "freehand"
  /** Inner-hole polygons cut out of the outer polygon (image-source shapes only).
   *  Each hole is in the same normalized coordinate system as `polygon`. When
   *  present, renderers use these as the hole geometry INSTEAD of the default
   *  circular hole derived from `holeIdMm`. */
  holes?: Array<Array<[number, number]>>;
  /** @deprecated retained for older payloads; current shapes use `holes`. */
  holeOffset?: [number, number];
  createdAt: number;
  updatedAt: number;
}

export type BuiltinOverride = { emoji?: string; label?: string };
export type BuiltinOverrides = Partial<Record<BuiltinScaleShape, BuiltinOverride>>;

const KEY_CUSTOM = "chainmail.customScaleShapes.v1";
const KEY_BUILTIN_OVERRIDES = "chainmail.builtinScaleShapeOverrides.v1";
const KEY_DEFAULT_SHAPE = "chainmail.defaultScaleShape.v1";
const KEY_HIDDEN_PRESETS = "chainmail.hiddenScalePresets.v1";
const KEY_HIDDEN_BUILTIN_SHAPES = "chainmail.hiddenBuiltinScaleShapes.v1";
const KEY_FIRST_RUN_DONE = "chainmail.scaleShapeFirstRunSeeded.v1";

const VALID_BUILTINS: BuiltinScaleShape[] = ["teardrop", "leaf", "round", "kite"];

export function safeShapeId(): string {
  const cryptoLike = (globalThis as any).crypto;
  if (cryptoLike?.randomUUID) return `custom:${cryptoLike.randomUUID()}`;
  return `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// ----------------------------------------------------------------------------
// Persistence
// ----------------------------------------------------------------------------

export function loadCustomShapes(): CustomScaleShape[] {
  try {
    const raw = localStorage.getItem(KEY_CUSTOM);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCustomShape);
  } catch {
    return [];
  }
}

export function saveCustomShapes(shapes: CustomScaleShape[]): void {
  try {
    localStorage.setItem(KEY_CUSTOM, JSON.stringify(shapes));
    // Bust the cached shape lookup the renderer reads via getCustomShapeById.
    // Without this, a freshly-created custom shape isn't visible to the
    // renderer in the same tab — its mesh falls through to the built-in
    // default (teardrop) until something else triggers cache invalidation.
    notifyCustomShapesChanged();
  } catch {}
}

export function loadBuiltinOverrides(): BuiltinOverrides {
  try {
    const raw = localStorage.getItem(KEY_BUILTIN_OVERRIDES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBuiltinOverrides(overrides: BuiltinOverrides): void {
  try {
    localStorage.setItem(KEY_BUILTIN_OVERRIDES, JSON.stringify(overrides));
    // Same cache-invalidation reason as saveCustomShapes — overrides change
    // built-in shape labels/emojis that the menu reads from the cache.
    notifyCustomShapesChanged();
  } catch {}
}

/** Default scale shape ID that should be selected on app startup. Returns
 *  `null` when no default has been pinned (callers fall back to "teardrop"). */
export function loadDefaultScaleShape(): string | null {
  try {
    const v = localStorage.getItem(KEY_DEFAULT_SHAPE);
    return v && typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export function saveDefaultScaleShape(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(KEY_DEFAULT_SHAPE);
    else localStorage.setItem(KEY_DEFAULT_SHAPE, id);
    notifyCustomShapesChanged();
  } catch {}
}

/** IDs of scale-size presets the user has hidden from the Tuner UI. */
export function loadHiddenPresetIds(): string[] {
  try {
    const v = localStorage.getItem(KEY_HIDDEN_PRESETS);
    if (!v) return [];
    const parsed = JSON.parse(v);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveHiddenPresetIds(ids: string[]): void {
  try {
    localStorage.setItem(KEY_HIDDEN_PRESETS, JSON.stringify(ids));
    notifyCustomShapesChanged();
  } catch {}
}

/** IDs of built-in shape menu entries (teardrop/leaf/round/kite) the user has
 *  hidden from the shape picker. */
export function loadHiddenBuiltinShapeIds(): BuiltinScaleShape[] {
  try {
    const v = localStorage.getItem(KEY_HIDDEN_BUILTIN_SHAPES);
    if (!v) return [];
    const parsed = JSON.parse(v);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is BuiltinScaleShape =>
        s === "teardrop" || s === "leaf" || s === "round" || s === "kite",
    );
  } catch {
    return [];
  }
}

export function saveHiddenBuiltinShapeIds(ids: BuiltinScaleShape[]): void {
  try {
    localStorage.setItem(KEY_HIDDEN_BUILTIN_SHAPES, JSON.stringify(ids));
    notifyCustomShapesChanged();
  } catch {}
}

/** On first run, seed the hidden lists so the user starts with an empty menu
 *  (no dragon presets, no built-in shapes). Subsequent loads are no-ops. */
export function seedFirstRunDefaults(allDragonPresetIds: string[]): void {
  try {
    if (localStorage.getItem(KEY_FIRST_RUN_DONE)) return;
    if (localStorage.getItem(KEY_HIDDEN_PRESETS) === null) {
      localStorage.setItem(
        KEY_HIDDEN_PRESETS,
        JSON.stringify(allDragonPresetIds),
      );
    }
    if (localStorage.getItem(KEY_HIDDEN_BUILTIN_SHAPES) === null) {
      localStorage.setItem(
        KEY_HIDDEN_BUILTIN_SHAPES,
        JSON.stringify(["teardrop", "leaf", "round", "kite"]),
      );
    }
    localStorage.setItem(KEY_FIRST_RUN_DONE, "1");
  } catch {}
}

function isValidCustomShape(e: any): e is CustomScaleShape {
  if (!e || typeof e !== "object") return false;
  if (typeof e.id !== "string" || !e.id.startsWith("custom:")) return false;
  if (typeof e.emoji !== "string" || typeof e.label !== "string") return false;
  if (e.source !== "base" && e.source !== "image" && e.source !== "freehand") return false;
  if (e.source === "base") {
    return VALID_BUILTINS.includes(e.baseShape);
  }
  if (!Array.isArray(e.polygon) || e.polygon.length < 3) return false;
  for (const p of e.polygon) {
    if (!Array.isArray(p) || p.length !== 2) return false;
    if (typeof p[0] !== "number" || typeof p[1] !== "number") return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// Cross-tab/page sync — fire a window event so a different page's React state
// can re-read without a full reload.
// ----------------------------------------------------------------------------

export const CUSTOM_SHAPES_EVENT = "chainmail:customScaleShapesChanged";
export function notifyCustomShapesChanged() {
  cachedShapes = null;
  try {
    window.dispatchEvent(new Event(CUSTOM_SHAPES_EVENT));
  } catch {}
}

// Cached lookup used by hot paths (the renderer rebuilds geometry per scale).
let cachedShapes: CustomScaleShape[] | null = null;
function readCachedShapes(): CustomScaleShape[] {
  if (cachedShapes) return cachedShapes;
  cachedShapes = loadCustomShapes();
  return cachedShapes;
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    cachedShapes = null;
  });
}

/** Fast O(n) lookup by id, with a cache invalidated by notifyCustomShapesChanged. */
export function getCustomShapeById(id: string): CustomScaleShape | null {
  if (!id || !id.startsWith("custom:")) return null;
  return readCachedShapes().find((s) => s.id === id) ?? null;
}

// ----------------------------------------------------------------------------
// Polygon helpers
// ----------------------------------------------------------------------------

/** Center, scale to fit unit square (preserving aspect), and y-down. */
export function normalizePolygon(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 3) return points.slice();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const s = 1 / Math.max(w, h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map(([x, y]) => [(x - cx) * s, (y - cy) * s] as [number, number]);
}

/** Build a 2D canvas Path2D scaled to width × height. */
export function polygonToPath2D(
  polygon: Array<[number, number]>,
  width: number,
  height: number,
  yOffset = 0,
): Path2D {
  const path = new Path2D();
  if (!polygon.length) return path;
  const [x0, y0] = polygon[0];
  path.moveTo(x0 * width, y0 * height + yOffset);
  for (let i = 1; i < polygon.length; i++) {
    const [x, y] = polygon[i];
    path.lineTo(x * width, y * height + yOffset);
  }
  path.closePath();
  return path;
}

/** Douglas–Peucker line simplification (operates on normalized coords). */
export function simplifyPolygon(
  points: Array<[number, number]>,
  tolerance = 0.01,
): Array<[number, number]> {
  if (points.length <= 3) return points.slice();
  const sqTol = tolerance * tolerance;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    for (let i = a + 1; i < b; i++) {
      const d = perpSqDist(points[i], ax, ay, bx, by);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sqTol && idx !== -1) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpSqDist(
  [x, y]: [number, number],
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return (x - ax) ** 2 + (y - ay) ** 2;
  let t = ((x - ax) * dx + (y - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return (x - px) ** 2 + (y - py) ** 2;
}

// ----------------------------------------------------------------------------
// Image → silhouette
// ----------------------------------------------------------------------------

export interface ImageTraceOptions {
  /** 0..1; pixels with luminance below this OR alpha below 0.5 are background. */
  threshold?: number;
  /** Max width to downsample the image to before processing (perf). */
  maxSize?: number;
  /** Simplification tolerance (0.005 ≈ keep ~detail, 0.02 ≈ coarse). */
  simplifyTolerance?: number;
  /** Treat dark pixels as foreground instead of light pixels. When omitted,
   *  polarity is inferred from the image perimeter (background sampling). */
  invert?: boolean;
}

export interface ImageTraceResult {
  polygon: Array<[number, number]>;
  /** Inner-hole polygons (e.g. the scale's ring-hole), normalized to the same
   *  coordinate system as `polygon`. Present when the image contained any
   *  background regions fully enclosed by the foreground. */
  holes: Array<Array<[number, number]>>;
  /** The effective invert used (after auto-detection). */
  invertUsed: boolean;
  /** The effective threshold used (after auto-tuning when omitted). */
  thresholdUsed: number;
}

export async function traceImageToPolygon(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | File | Blob,
  opts: ImageTraceOptions = {},
): Promise<ImageTraceResult> {
  const {
    threshold: thresholdOpt,
    maxSize = 256,
    simplifyTolerance = 0.008,
    invert: invertOpt,
  } = opts;

  const img = await toBitmapLike(source);
  const srcW = (img as any).width as number;
  const srcH = (img as any).height as number;
  if (!srcW || !srcH) throw new Error("Image has zero size");

  // Downsample to keep contour tracing fast.
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const w = Math.max(2, Math.round(srcW * scale));
  const h = Math.max(2, Math.round(srcH * scale));

  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context unavailable");
  ctx.drawImage(img as any, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // Decide foreground vs background. If the image has meaningful alpha
  // (any pixel < 250 alpha), use alpha as the discriminator. Otherwise use
  // luminance against the threshold.
  let useAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      useAlpha = true;
      break;
    }
  }

  const lumAt = (i: number) => {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  // If the caller didn't pin a polarity and we're luminance-based, sample
  // the perimeter to infer which side of the threshold the background sits on.
  // A bright perimeter ⇒ the shape is dark ⇒ invert. Dark perimeter ⇒ shape is light.
  let invert = invertOpt ?? false;
  let perimeterAvg = 0.5;
  if (!useAlpha) {
    let sum = 0;
    let n = 0;
    const sampleBand = (xs: number, xe: number, ys: number, ye: number) => {
      for (let y = ys; y < ye; y++) {
        for (let x = xs; x < xe; x++) {
          sum += lumAt((y * w + x) * 4);
          n++;
        }
      }
    };
    const band = Math.max(1, Math.round(Math.min(w, h) * 0.04));
    sampleBand(0, w, 0, band);
    sampleBand(0, w, h - band, h);
    sampleBand(0, band, band, h - band);
    sampleBand(w - band, w, band, h - band);
    perimeterAvg = n > 0 ? sum / n : 0.5;
    if (invertOpt === undefined) {
      invert = perimeterAvg > 0.5;
    }
  }

  // When the caller doesn't supply a threshold, pick one halfway between the
  // estimated background luminance (perimeter average) and the opposite end —
  // this auto-tunes per-image. PNGs with alpha just use 0.5 (alpha mask only).
  let threshold: number;
  if (thresholdOpt !== undefined) {
    threshold = thresholdOpt;
  } else if (useAlpha) {
    threshold = 0.5;
  } else {
    // For dark background, threshold sits above perimeterAvg (closer to bright
    // foreground); for light background, below. Push 60% of the way toward
    // the opposite end so foreground pixels reliably exceed the threshold.
    threshold = invert
      ? perimeterAvg * 0.4 // light bg, dark shape → threshold below bg
      : perimeterAvg + (1 - perimeterAvg) * 0.4; // dark bg, light shape
  }

  const rawMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3] / 255;
      const lum = lumAt(i);
      const fgByAlpha = a > 0.5;
      const fgByLum = invert ? lum < threshold : lum > threshold;
      const fg = useAlpha ? fgByAlpha : fgByLum;
      rawMask[y * w + x] = fg ? 1 : 0;
    }
  }

  // Morphological closing (dilate then erode) to fuse speckle and seal small
  // gaps; then opening (erode then dilate) to drop isolated noise pixels.
  // 3x3 structuring element. Real-world photos (especially on textured
  // backgrounds like cork) need this cleanup or the contour tracer will get
  // stuck on noise islands.
  const mask = morphOpen(morphClose(rawMask, w, h), w, h);

  // Pick the largest connected component to ignore stray specks.
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const sizes: number[] = [0];
  const queue: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || labels[idx]) continue;
      const lbl = nextLabel++;
      sizes.push(0);
      queue.length = 0;
      queue.push(idx);
      labels[idx] = lbl;
      while (queue.length) {
        const p = queue.pop()!;
        sizes[lbl]++;
        const px = p % w;
        const py = (p - px) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (mask[ni] && !labels[ni]) {
              labels[ni] = lbl;
              queue.push(ni);
            }
          }
        }
      }
    }
  }
  if (nextLabel === 1) {
    throw new Error("No foreground detected. Try adjusting the threshold or use Invert.");
  }
  let bestLbl = 1;
  for (let i = 1; i < sizes.length; i++) {
    if (sizes[i] > sizes[bestLbl]) bestLbl = i;
  }

  // Build a binary mask for the chosen component only.
  const onlyBest = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === bestLbl) onlyBest[i] = 1;
  }

  // Moore-Neighbor contour trace starting from the topmost-leftmost pixel.
  const contour = traceContour(onlyBest, w, h);
  if (contour.length < 4) {
    throw new Error("Detected shape is too small to trace.");
  }

  // Detect inner holes: background regions fully enclosed by the foreground.
  const holeContours = findHoleContours(onlyBest, w, h);

  // Normalize outer + holes together using a single bbox so they share a
  // coordinate system.
  const { outer: normalized, holes: normalizedHoles } = normalizeWithHoles(
    contour,
    holeContours,
  );
  const tol = simplifyTolerance;
  return {
    polygon: simplifyPolygon(normalized, tol),
    holes: normalizedHoles.map((h) => simplifyPolygon(h, tol)),
    invertUsed: invert,
    thresholdUsed: threshold,
  };
}

/** Find inner holes inside a binary foreground mask. Returns each hole as a
 *  list of pixel coordinates tracing its boundary. */
function findHoleContours(
  fgMask: Uint8Array,
  w: number,
  h: number,
): Array<Array<[number, number]>> {
  // Label connected components of the background mask. The component touching
  // the image border is the "outside"; every other component is a hole.
  const labels = new Int32Array(w * h);
  let next = 1;
  const borderLabels = new Set<number>();
  const stack: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (fgMask[idx] || labels[idx]) continue;
      const lbl = next++;
      let onBorder = false;
      stack.length = 0;
      stack.push(idx);
      labels[idx] = lbl;
      while (stack.length) {
        const p = stack.pop()!;
        const px = p % w;
        const py = (p - px) / w;
        if (px === 0 || py === 0 || px === w - 1 || py === h - 1) onBorder = true;
        // 4-connectivity is enough for hole separation (matches how Moore-
        // Neighbor traces 8-connected foreground boundaries).
        const neigh = [
          [px - 1, py],
          [px + 1, py],
          [px, py - 1],
          [px, py + 1],
        ] as const;
        for (const [nx, ny] of neigh) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!fgMask[ni] && !labels[ni]) {
            labels[ni] = lbl;
            stack.push(ni);
          }
        }
      }
      if (onBorder) borderLabels.add(lbl);
    }
  }

  const out: Array<Array<[number, number]>> = [];
  for (let lbl = 1; lbl < next; lbl++) {
    if (borderLabels.has(lbl)) continue;
    // Build a binary mask for just this hole, then trace its boundary.
    const holeMask = new Uint8Array(w * h);
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === lbl) holeMask[i] = 1;
    }
    const contour = traceContour(holeMask, w, h);
    if (contour.length >= 4) out.push(contour);
  }
  return out;
}

/** Normalize the outer contour to fit a unit square centered at (0, 0), and
 *  apply the same transform to each hole so they line up. */
function normalizeWithHoles(
  outer: Array<[number, number]>,
  holes: Array<Array<[number, number]>>,
): { outer: Array<[number, number]>; holes: Array<Array<[number, number]>> } {
  if (outer.length < 3) return { outer: outer.slice(), holes };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const s = 1 / Math.max(w, h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const tx = (poly: Array<[number, number]>) =>
    poly.map(
      ([x, y]) => [(x - cx) * s, (y - cy) * s] as [number, number],
    );
  return { outer: tx(outer), holes: holes.map(tx) };
}

/** Return a debug PNG data URL of the binary foreground mask we use during
 *  tracing. Useful for the editor to visualize what's being detected. */
export async function traceImageDebugMask(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | File | Blob,
  opts: ImageTraceOptions = {},
): Promise<string | null> {
  const {
    threshold: thresholdOpt,
    maxSize = 256,
    invert: invertOpt,
  } = opts;
  const img = await toBitmapLike(source);
  const srcW = (img as any).width as number;
  const srcH = (img as any).height as number;
  if (!srcW || !srcH) return null;
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const w = Math.max(2, Math.round(srcW * scale));
  const h = Math.max(2, Math.round(srcH * scale));
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img as any, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let useAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      useAlpha = true;
      break;
    }
  }
  const lumAt = (i: number) =>
    0.2126 * (data[i] / 255) + 0.7152 * (data[i + 1] / 255) + 0.0722 * (data[i + 2] / 255);
  let invert = invertOpt ?? false;
  let perimeterAvg = 0.5;
  if (!useAlpha) {
    let sum = 0;
    let n = 0;
    const sampleBand = (xs: number, xe: number, ys: number, ye: number) => {
      for (let y = ys; y < ye; y++)
        for (let x = xs; x < xe; x++) {
          sum += lumAt((y * w + x) * 4);
          n++;
        }
    };
    const band = Math.max(1, Math.round(Math.min(w, h) * 0.04));
    sampleBand(0, w, 0, band);
    sampleBand(0, w, h - band, h);
    sampleBand(0, band, band, h - band);
    sampleBand(w - band, w, band, h - band);
    perimeterAvg = n > 0 ? sum / n : 0.5;
    if (invertOpt === undefined) invert = perimeterAvg > 0.5;
  }
  let threshold: number;
  if (thresholdOpt !== undefined) threshold = thresholdOpt;
  else if (useAlpha) threshold = 0.5;
  else
    threshold = invert
      ? perimeterAvg * 0.4
      : perimeterAvg + (1 - perimeterAvg) * 0.4;

  const out = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3] / 255;
      const lum = lumAt(i);
      const fg = useAlpha
        ? a > 0.5
        : invert
          ? lum < threshold
          : lum > threshold;
      const v = fg ? 255 : 0;
      out.data[i] = v;
      out.data[i + 1] = v;
      out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return cvs.toDataURL("image/png");
}

/** Rotate a polygon (around its origin/center) by `deg` degrees. */
export function rotatePolygon(
  polygon: Array<[number, number]>,
  deg: number,
): Array<[number, number]> {
  if (!deg) return polygon.slice();
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return polygon.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

async function toBitmapLike(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | File | Blob,
): Promise<HTMLImageElement | HTMLCanvasElement | ImageBitmap> {
  if (source instanceof HTMLCanvasElement) return source;
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) return source;
  if (source instanceof HTMLImageElement) {
    if (source.complete && source.naturalWidth > 0) return source;
    await new Promise<void>((resolve, reject) => {
      source.addEventListener("load", () => resolve(), { once: true });
      source.addEventListener("error", () => reject(new Error("Image failed to load")), {
        once: true,
      });
    });
    return source;
  }
  // File or Blob — narrowing: HTMLCanvasElement / ImageBitmap / HTMLImageElement
  // branches above all return, so by this line source can only be File | Blob.
  // TS can't follow the `typeof ImageBitmap !== "undefined"` guard for narrowing,
  // hence the explicit cast.
  const url = URL.createObjectURL(source as Blob);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => reject(new Error("Image failed to load")), {
        once: true,
      });
    });
    return img;
  } finally {
    // Release on next tick so the image is fully decoded.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Moore-Neighbor boundary tracing. Returns an ordered list of pixel coords.
 *  Walks the boundary clockwise starting from the topmost-leftmost foreground
 *  pixel (which is on the outer boundary by construction). */
function traceContour(
  mask: Uint8Array,
  w: number,
  h: number,
): Array<[number, number]> {
  // Find start pixel: scan top-to-bottom, left-to-right.
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < h && sy === -1; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];

  // 8-neighbor offsets in clockwise order starting from W.
  // Index: 0=W, 1=NW, 2=N, 3=NE, 4=E, 5=SE, 6=S, 7=SW.
  const dx = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dy = [0, -1, -1, -1, 0, 1, 1, 1];

  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

  const out: Array<[number, number]> = [[sx, sy]];
  let cx = sx;
  let cy = sy;
  // We arrived at the start pixel from the WEST (which is background by
  // construction). The next neighbour to test is one CW step from W (i.e. NW).
  let fromDir = 0;
  const maxSteps = w * h * 4;

  for (let steps = 0; steps < maxSteps; steps++) {
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const d = (fromDir + k) % 8;
      const nx = cx + dx[d];
      const ny = cy + dy[d];
      if (inside(nx, ny)) {
        cx = nx;
        cy = ny;
        // The cell we just moved to was approached from the opposite of `d`.
        fromDir = (d + 4) % 8;
        out.push([cx, cy]);
        found = true;
        break;
      }
    }
    if (!found) break;
    // Returned to start — close the loop.
    if (cx === sx && cy === sy) {
      out.pop();
      break;
    }
  }

  return out;
}

/** 3×3 dilation of a binary mask. */
function morphDilate(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (src[ny * w + nx]) {
            v = 1;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 3×3 erosion of a binary mask. */
function morphErode(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dy = -1; dy <= 1 && v; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) {
          v = 0;
          break;
        }
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) {
            v = 0;
            break;
          }
          if (!src[ny * w + nx]) {
            v = 0;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function morphClose(src: Uint8Array, w: number, h: number): Uint8Array {
  return morphErode(morphDilate(src, w, h), w, h);
}
function morphOpen(src: Uint8Array, w: number, h: number): Uint8Array {
  return morphDilate(morphErode(src, w, h), w, h);
}
