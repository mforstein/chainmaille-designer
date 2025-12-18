import { BOMRing, SupplierId } from "../App";

// density g/mm³ (very rough, adjustable later)
const MATERIAL_DENSITY: Record<string, number> = {
  Aluminum: 0.0027,
  Steel: 0.00785,
  Stainless: 0.008,
  Unknown: 0.003,
};

export function calculateBOM(rings: BOMRing[]) {
  if (!Array.isArray(rings) || rings.length === 0) {
    return {
      summary: {
        totalRings: 0,
        uniqueColors: 0,
        totalWeight: 0,
        suppliers: [],
      },
      lines: [],
    };
  }

  const lineMap = new Map<string, any>();
  let totalWeight = 0;

  for (const ring of rings) {
    const key = `${ring.supplier}|${ring.colorHex}|${ring.innerDiameter}|${ring.wireDiameter}`;

    if (!lineMap.has(key)) {
      lineMap.set(key, {
        supplier: ring.supplier,
        colorHex: ring.colorHex,
        ringCount: 0,
        weight: 0,
      });
    }

    const line = lineMap.get(key);
    line.ringCount++;

    const radius = ring.innerDiameter / 2;
    const circumference = 2 * Math.PI * radius;
    const wireRadius = ring.wireDiameter / 2;
    const wireArea = Math.PI * wireRadius * wireRadius;
    const volume = circumference * wireArea;

    const density =
      MATERIAL_DENSITY[ring.material ?? "Unknown"] ??
      MATERIAL_DENSITY.Unknown;

    const ringWeight = volume * density;

    line.weight += ringWeight;
    totalWeight += ringWeight;
  }

  const lines = Array.from(lineMap.values());

  return {
    summary: {
      totalRings: rings.length,
      uniqueColors: new Set(rings.map(r => r.colorHex)).size,
      totalWeight,
      suppliers: Array.from(new Set(rings.map(r => r.supplier))),
    },
    lines,
  };
}