// ===============
// src/utils/colors.ts
// ===============

/** =========================
 *  Universal Color Palette
 *  ========================= */
/** =========================
 *  Universal Color Palette (Expanded)
 *  ========================= */
export const UNIVERSAL_COLORS: string[] = [
  // Reds / Oranges / Yellows
  "#FF0000",
  "#FF4500",
  "#FF7F00",
  "#FFA500",
  "#FFD700",
  "#FFFF00",
  // Greens
  "#00FF00",
  "#4CBB17",
  "#228B22",
  "#006400",
  // Blues / Cyans
  "#00FFFF",
  "#1E90FF",
  "#0A58FF",
  "#4169E1",
  "#0000CD",
  // Purples / Magentas
  "#8A2BE2",
  "#7B00B4",
  "#8F00FF",
  "#C71585",
  "#FF00FF",
  "#E75480",
  // Grays / Neutrals
  "#FFFFFF",
  "#D3D3D3",
  "#A9A9A9",
  "#808080",
  "#000000",
  // Earth tones / Metals
  "#A0522D",
  "#8B4513",
  "#CD853F",
  "#DEB887",
  "#D8B07A",
  "#B87333",
];
/** =========================
 *  Base Materials
 *  ========================= */
export interface Material {
  name: string;
  hex: string;
}

export const MATERIALS: Material[] = [
  { name: "Aluminum", hex: "#C0C0C0" }, // Standard aluminum
  { name: "Steel", hex: "#A8A8A8" }, // Slightly darker gray
  { name: "Titanium", hex: "#8D9CA8" }, // Bluish tint
  { name: "Copper", hex: "#B87333" }, // Warm orange-brown
  { name: "Gold", hex: "#FFD700" }, // Bright yellow
  { name: "Silver", hex: "#D8D8D8" }, // ✅ Lighter and distinct from aluminum
  { name: "None", hex: "transparent" }, // Transparent / no material
];
/** =========================
 *  Utility Color Functions
 *  ========================= */
export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

export function nearestPaletteHex(hex: string, palette: string[]): string {
  const toRGB = (h: string) => {
    const bigint = parseInt(h.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  };
  const [r1, g1, b1] = toRGB(hex);
  let best = palette[0];
  let bestDist = Infinity;
  for (const p of palette) {
    const [r2, g2, b2] = toRGB(p);
    const dist = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}
