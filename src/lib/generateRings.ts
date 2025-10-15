// ================================================
// src/lib/generateRings.ts
// ================================================
export type Ring = { row: number; col: number; x: number; y: number; radius: number };

/**
 * Generate an E4-in-1 grid in world-units (mm).
 * Centers are placed on a hex grid; every other row is x-offset by half a pitch.
 * IMPORTANT: For a real jump ring, OD = ID + 2 * wireDiameter
 */
export function generateRings(p: {
  rows: number;
  cols: number;
  innerDiameter: number; // ID (mm)
  wireDiameter: number;  // wire thickness (mm)
}): Ring[] {
  const rings: Ring[] = [];

  // Correct outer diameter and radius
  const OD = p.innerDiameter + 2 * p.wireDiameter;
  const R  = OD / 2; // outer radius used by renderer

  // Hex-grid pitches tuned for a nice E4-in-1 interlock appearance
  const pitchX = OD * 0.58; // horizontal spacing between centers
  const pitchY = OD * 0.50; // vertical spacing between rows

  for (let r = 0; r < p.rows; r++) {
    const xOffset = (r % 2 === 0) ? 0 : pitchX / 2;
    for (let c = 0; c < p.cols; c++) {
      rings.push({
        row: r,
        col: c,
        x: c * pitchX + xOffset,
        y: r * pitchY,
        radius: R, // outer radius
      });
    }
  }
  return rings;
}