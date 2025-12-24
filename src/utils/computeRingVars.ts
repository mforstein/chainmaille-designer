// ==========================================
// computeRingVars.ts
// MASTER SIZE CONVERSION USED BY:
// - Tuner
// - Designer 3D
// - Freeform 2D
// - Ring Size Chart
// ==========================================

/**
 * Converts fractional inch IDs + wire diameter (mm)
 * into usable ring geometry in millimeters.
 */
export function computeRingVars(ID_inch_fraction: string, wireMm: number) {
  const WD_mm = wireMm;

  // Convert fractional inch string → decimal inches → mm
  const ID_in_inches = fractionToDecimal(ID_inch_fraction);
  const ID_mm = ID_in_inches * 25.4;

  // OD = ID + 2 * Wire
  const OD_mm = ID_mm + 2 * WD_mm;

  return { ID_mm, WD_mm, OD_mm };
}

/**
 * Convert "5/16" or "7/64" → 0.3125
 */
export function fractionToDecimal(str: string): number {
  if (!str.includes("/")) return parseFloat(str) || 0;

  const [num, den] = str.split("/").map(Number);
  if (!num || !den) return 0;

  return num / den;
}
