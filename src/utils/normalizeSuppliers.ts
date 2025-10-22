// ===============
// src/utils/normalizeSuppliers.ts
// ===============

// Data structure representing a normalized ring entry
export type NormalizedRing = {
  supplier?: string;
  material?: string;
  color?: string;
  available?: boolean;
  wireGauge?: string;
  wireDiameterMM?: number;
  idMM?: number;
  idDisplay?: string;
  gaugeLabel?: string;
  ar?: number;
};

// Conversion helper: AWG → mm (approx)
export function awgToMM(awg?: string): number | undefined {
  if (!awg) return undefined;
  const num = parseFloat(awg.replace(/[^\d.]/g, ""));
  if (isNaN(num)) return undefined;
  return +(0.127 * Math.pow(92, (36 - num) / 39)).toFixed(3);
}

// Normalize mixed supplier data
export function normalizeRings(
  rings: {
    wireGauge?: string;
    ringID?: string;
    aspectRatio?: string;
    available?: boolean;
  }[],
  color?: string
): NormalizedRing[] {
  return rings.map((r) => {
    const wireGauge = r.wireGauge?.trim();
    const idStr = r.ringID?.trim();

    const wireDiameterMM = awgToMM(wireGauge);
    const idMM = idStr ? parseFloat(idStr.replace(/[^\d.]/g, "")) : undefined;

    const aspectRatioNum =
      r.aspectRatio && !isNaN(parseFloat(r.aspectRatio))
        ? parseFloat(r.aspectRatio)
        : idMM && wireDiameterMM
        ? +(idMM / wireDiameterMM).toFixed(2)
        : undefined;

    const gaugeLabel =
      wireGauge && !isNaN(parseFloat(wireGauge))
        ? parseFloat(wireGauge).toString()
        : wireGauge;

    const idDisplay =
      idMM && idMM > 0
        ? `${idMM}${idStr?.includes("mm") ? " mm" : ""}`
        : idStr || "";

    return {
      color,
      available: r.available ?? false,
      wireGauge,
      wireDiameterMM,
      idMM,
      idDisplay,
      gaugeLabel,
      ar: aspectRatioNum,
    };
  });
}