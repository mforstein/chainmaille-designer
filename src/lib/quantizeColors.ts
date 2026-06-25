// ======================================================
// src/lib/quantizeColors.ts
// K-means quantization of a set of hex colors. Returns a "snap map" that maps
// each input hex to the nearest of K representative colors — used to limit the
// number of distinct ring colors in a design (e.g. after an image overlay
// transfer produces hundreds of near-duplicate colors).
// ======================================================

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function dist(a: RGB, b: RGB): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function kmeans(colors: RGB[], k: number, iterations = 14): RGB[] {
  if (colors.length <= k) return colors.map((c) => [...c] as RGB);

  // Deterministic init: sort by luminance, pick evenly spaced seeds.
  const sorted = [...colors].sort(
    (a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]),
  );
  const step = Math.max(1, Math.floor(sorted.length / k));
  const centroids: RGB[] = [];
  for (let i = 0; i < k; i++) {
    centroids.push([...sorted[Math.min(i * step, sorted.length - 1)]] as RGB);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const sums: RGB[] = centroids.map(() => [0, 0, 0]);
    const counts = new Array<number>(k).fill(0);
    for (const c of colors) {
      let min = Infinity, idx = 0;
      for (let i = 0; i < k; i++) {
        const d = dist(c, centroids[i]);
        if (d < min) { min = d; idx = i; }
      }
      sums[idx][0] += c[0]; sums[idx][1] += c[1]; sums[idx][2] += c[2];
      counts[idx]++;
    }
    for (let i = 0; i < k; i++) {
      if (!counts[i]) continue;
      centroids[i] = [sums[i][0] / counts[i], sums[i][1] / counts[i], sums[i][2] / counts[i]];
    }
  }
  return centroids;
}

/**
 * Build a map of original-hex → nearest-of-K-colors hex.
 * If there are already <= k distinct colors, returns an identity map (no change).
 */
export function buildColorSnapMap(hexes: string[], k: number): Map<string, string> {
  const unique = Array.from(new Set(hexes.filter((h) => /^#[0-9a-fA-F]{6}$/.test(h))));
  const snap = new Map<string, string>();
  if (unique.length <= k) {
    unique.forEach((h) => snap.set(h, h));
    return snap;
  }
  const rgbs = unique.map(hexToRgb);
  const centroids = kmeans(rgbs, k);
  unique.forEach((hex, i) => {
    const c = rgbs[i];
    let min = Infinity, best = centroids[0];
    for (const cen of centroids) {
      const d = dist(c, cen);
      if (d < min) { min = d; best = cen; }
    }
    snap.set(hex, rgbToHex(best[0], best[1], best[2]));
  });
  return snap;
}
