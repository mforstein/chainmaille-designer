export const SupplierColors = [
  {
    "supplier": "The Ring Lord",
    "colors": [
      "Natural",
      "Anodized Blue"
    ]
  },
  {
    "supplier": "Chainmail Joe",
    "colors": [
      "Anodized Green",
      "Anodized Purple"
    ]
  }
];
// src/utils/color.ts
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
