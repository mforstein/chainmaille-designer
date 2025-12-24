// ============================================================
// src/utils/ringMath.ts
// ============================================================

// Convert fractional inch string OR numeric string to mm
export function parseIDToMM(id: string): number {
  if (id.includes("/")) {
    const [num, den] = id.split("/").map(Number);
    if (!den || !Number.isFinite(num)) return NaN;
    return (25.4 * num) / den;
  }
  const v = parseFloat(id);
  return Number.isFinite(v) ? v : NaN;
}

// ============================================================
// Authoritative ring math (NO THREE, NO REACT)
// ============================================================
export function computeRingVarsIndependent(
  idValue: string,
  wireDiameterMM: number,
) {
  const ID_mm = parseIDToMM(idValue);
  const WD_mm = wireDiameterMM;

  const OD_mm =
    Number.isFinite(ID_mm) && Number.isFinite(WD_mm) ? ID_mm + 2 * WD_mm : NaN;

  return {
    ID_mm,
    WD_mm,
    OD_mm,
  };
}
