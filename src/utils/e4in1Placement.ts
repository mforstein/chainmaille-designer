// ======================================================
// e4in1Placement.ts — CLEAN FINAL VERSION
// Deterministic hex-grid placement for FreeformChainmail2D
// ======================================================

export interface PlacedRing {
  row: number;
  col: number;
  color: string;
  cluster: number;
}

export type RingMap = Map<string, PlacedRing>;

// ======================================================
// Default weave settings used by Freeform + Tuner
// ======================================================

export const WEAVE_SETTINGS_DEFAULT = {
  spacingX: 8.0,          // horizontal spacing
  spacingY: 8.0 * 0.866,  // vertical spacing (hex)
  wireD: 1.6,
};

// ======================================================
// Convert raw gridX/gridY → integer row/col on hex grid
// ======================================================
//
// gridX, gridY come from FreeformChainmail2D:
//
//   worldX = (sx - panX) / zoom
//   worldY = (sy - panY) / zoom
//
//   gridX = worldX / spacingX
//   gridY = worldY / (spacingX * 0.866)
//
// The math here deterministically snaps to the nearest
// cell on the hexagonal European-4-in-1 grid.
//

export function snapToHexCell(
  gridX: number,
  gridY: number
): { row: number; col: number } {
  //
  // Nearest integer hex grid coords
  //
  const row = Math.round(gridY);

  // Odd rows are shifted horizontally by 0.5
  const colShift = row % 2 === 0 ? 0 : 0.5;

  const col = Math.round(gridX - colShift);

  return { row, col };
}

// ======================================================
// resolvePlacement
// ======================================================
//
// Main placement engine used by FreeformChainmail2D.tsx:
// - Snaps cursor to closest ring cell on E4in1 grid
// - Creates new ring or recolors existing ring
// - Returns a stable key ("row-col") for storage
// - Ensures cluster IDs propagate correctly
//

export function resolvePlacement(
  gridX: number,
  gridY: number,
  rings: RingMap,
  nextCluster: number,
  color: string,
  settings: { spacingX: number; spacingY: number; wireD: number }
): { ring: PlacedRing; newCluster: number } {
  // Snap to nearest hex cell
  const { row, col } = snapToHexCell(gridX, gridY);

  const key = `${row}-${col}`;

  // If the ring already exists → recolor, keep its cluster
  const existing = rings.get(key);
  if (existing) {
    return {
      ring: {
        row,
        col,
        color,
        cluster: existing.cluster,
      },
      newCluster: nextCluster, // cluster counter unchanged
    };
  }

  // New ring placement → consume nextCluster
  const ring: PlacedRing = {
    row,
    col,
    color,
    cluster: nextCluster,
  };

  return {
    ring,
    newCluster: nextCluster + 1,
  };
}