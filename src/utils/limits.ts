import { safeStorage } from "./safeStorage";

export const IS_IOS =
  typeof navigator !== "undefined" &&
  (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as Mac with touch
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1)
  );

export type Limits = { MAX_ROWS: number; MAX_COLS: number; MAX_AREA: number };
export const SAFE_DEFAULT = { rows: 20, cols: 20 };

export function getDeviceLimits(): Limits {
  // You can relax desktop limits later if you like
  if (IS_IOS) return { MAX_ROWS: 160, MAX_COLS: 160, MAX_AREA: 160 * 160 };
  return { MAX_ROWS: 400, MAX_COLS: 400, MAX_AREA: 400 * 400 };
}

function toInt(n: any, fallback: number) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * Read persisted rows/cols, validate against device limits, and *fix* storage
 * to a safe default if invalid/too large.
 *
 * Use a unique keyPrefix per page (e.g. "erin", "designer").
 */
export function clampPersistedDims(
  keyPrefix: string,
  fallback = SAFE_DEFAULT
) {
  const lim = getDeviceLimits();

  const rawRows = safeStorage.get(`${keyPrefix}.rows`);
  const rawCols = safeStorage.get(`${keyPrefix}.cols`);

  const rows0 = toInt(rawRows, fallback.rows);
  const cols0 = toInt(rawCols, fallback.cols);

  const tooBig =
    rows0 > lim.MAX_ROWS || cols0 > lim.MAX_COLS || rows0 * cols0 > lim.MAX_AREA;

  const rows = tooBig ? fallback.rows : rows0;
  const cols = tooBig ? fallback.cols : cols0;

  // Write back a safe value so refreshes stay safe
  safeStorage.set(`${keyPrefix}.rows`, String(rows));
  safeStorage.set(`${keyPrefix}.cols`, String(cols));

  return { rows, cols, lim };
}

/**
 * Run-time clamp for when the user changes inputs.
 * Returns `{ rows, cols, clamped }` and writes back to storage.
 */
export function clampAndPersist(
  keyPrefix: string,
  rows: number,
  cols: number
) {
  const lim = getDeviceLimits();
  let r = toInt(rows, SAFE_DEFAULT.rows);
  let c = toInt(cols, SAFE_DEFAULT.cols);

  let clamped = false;
  if (r > lim.MAX_ROWS) { r = lim.MAX_ROWS; clamped = true; }
  if (c > lim.MAX_COLS) { c = lim.MAX_COLS; clamped = true; }
  if (r * c > lim.MAX_AREA) {
    // Keep aspect, reduce the larger dimension first
    const scale = Math.sqrt(lim.MAX_AREA / (r * c));
    r = Math.max(1, Math.floor(r * scale));
    c = Math.max(1, Math.floor(c * scale));
    clamped = true;
  }

  safeStorage.set(`${keyPrefix}.rows`, String(r));
  safeStorage.set(`${keyPrefix}.cols`, String(c));

  return { rows: r, cols: c, clamped, lim };
}