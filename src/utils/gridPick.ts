import * as THREE from "three";

/**
 * Screen -> world intersection with z=0 plane
 * (works for PerspectiveCamera and any view, as long as rings live on z=0)
 */
export function screenToWorldZ0(
  cam: THREE.Camera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
) {
  const rect = canvas.getBoundingClientRect();
  const xNdc = (sx / rect.width) * 2 - 1;
  const yNdc = -((sy / rect.height) * 2 - 1);

  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(xNdc, yNdc), cam as any);

  // intersect z=0 plane: origin + t*dir, solve for z=0
  const o = ray.ray.origin;
  const d = ray.ray.direction;
  const t = -o.z / d.z;

  return {
    wx: o.x + d.x * t,
    wy: o.y + d.y * t,
  };
}

/**
 * Deterministic hex-ish grid snap used by your ring layout:
 * x = c*spacing + (oddRow ? spacing/2 : 0)
 * y = r*spacing*0.866
 *
 * NOTE: your renderer places rings at y = -r*spacing*0.866 (negative),
 * so we convert worldY -> logicalY by flipping sign.
 */
export function pickCellHexNearest(
  wx: number,
  wy: number,
  rows: number,
  cols: number,
  spacing: number,
) {
  const spacingY = spacing * 0.866;
  const logicalY = -wy;

  // initial snap
  let r0 = Math.round(logicalY / spacingY);
  r0 = Math.max(0, Math.min(rows - 1, r0));

  // candidate search around snapped row/col to guarantee nearest-center
  let best: { r: number; c: number; d2: number } | null = null;

  for (let dr = -1; dr <= 1; dr++) {
    const r = r0 + dr;
    if (r < 0 || r >= rows) continue;

    const rowOffset = r % 2 === 1 ? spacing / 2 : 0;
    const c0 = Math.round((wx - rowOffset) / spacing);

    for (let dc = -1; dc <= 1; dc++) {
      const c = c0 + dc;
      if (c < 0 || c >= cols) continue;

      const cx = c * spacing + rowOffset;
      const cy = r * spacingY; // logical y
      const wyCenter = -cy; // world y

      const dx = cx - wx;
      const dy = wyCenter - wy;
      const d2 = dx * dx + dy * dy;

      if (!best || d2 < best.d2) best = { r, c, d2 };
    }
  }

  if (!best) return null;
  return { row: best.r, col: best.c };
}