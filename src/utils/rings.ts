// src/utils/rings.ts
export interface RingPosition {
  row: number;
  col: number;
  x: number;
  y: number;
}

/**
 * Generates a simple rectangular grid of rings using standard
 * 4-in-1 European spacing (hex pattern).
 */
export function generateRings(
  rows: number,
  cols: number,
  innerDiameter: number,
): RingPosition[] {
  const rings: RingPosition[] = [];
  const horizSpacing = innerDiameter;
  const vertSpacing = innerDiameter * 0.87; // standard 4-in-1 vertical offset

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * horizSpacing + (r % 2) * (horizSpacing / 2);
      const y = r * vertSpacing;
      rings.push({ row: r, col: c, x, y });
    }
  }
  return rings;
}
