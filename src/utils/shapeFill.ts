// ======================================================
// src/utils/shapeFill.ts
// ======================================================

export type ShapeTool = "square" | "circle" | "hex" | "oct" | "heart" | "tri";

export type SelectionDrag = {
  lx0: number;
  ly0: number;
  lx1: number;
  ly1: number;
};

export type RowCol = { row: number; col: number };

type Point = { x: number; y: number };

function pointInPoly(x: number, y: number, poly: Point[]) {
  // Ray casting (odd-even rule)
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function regularPolygon(cx: number, cy: number, r: number, sides: number, rotationRad = -Math.PI / 2) {
  const out: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotationRad + (i * 2 * Math.PI) / sides;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function heartBezierPolygon(cx: number, cy: number, s: number, stepsPerCurve = 48): Point[] {
  // Must match FreeformChainmail2D preview drawHeart() exactly.
  const start: Point = { x: cx, y: cy + s * 0.35 };
  const mid: Point = { x: cx, y: cy - s * 0.65 };

  const c1: Point = { x: cx - s * 0.9, y: cy - s * 0.25 };
  const c2: Point = { x: cx - s * 0.55, y: cy - s * 1.05 };

  const c3: Point = { x: cx + s * 0.55, y: cy - s * 1.05 };
  const c4: Point = { x: cx + s * 0.9, y: cy - s * 0.25 };

  const poly: Point[] = [];

  // Curve 1: start -> mid
  for (let i = 0; i <= stepsPerCurve; i++) {
    const t = i / stepsPerCurve;
    poly.push(cubicBezier(start, c1, c2, mid, t));
  }

  // Curve 2: mid -> start (avoid duplicating mid point)
  for (let i = 1; i <= stepsPerCurve; i++) {
    const t = i / stepsPerCurve;
    poly.push(cubicBezier(mid, c3, c4, start, t));
  }

  return poly;
}

export function computeShapeCells(args: {
  tool: ShapeTool;
  sel: SelectionDrag;
  logicalToRowColApprox: (x: number, y: number) => RowCol;
  rcToLogical: (row: number, col: number) => { x: number; y: number };
}): RowCol[] {
  const { tool, sel, logicalToRowColApprox, rcToLogical } = args;

  const cx = sel.lx0;
  const cy = sel.ly0;
  const dx = sel.lx1 - sel.lx0;
  const dy = sel.ly1 - sel.ly0;
  const r = Math.sqrt(dx * dx + dy * dy);

  // Bounding box in logical coords
  let minLX: number;
  let maxLX: number;
  let minLY: number;
  let maxLY: number;

  if (tool === "square") {
    minLX = Math.min(sel.lx0, sel.lx1);
    maxLX = Math.max(sel.lx0, sel.lx1);
    minLY = Math.min(sel.ly0, sel.ly1);
    maxLY = Math.max(sel.ly0, sel.ly1);
  } else {
    minLX = cx - r;
    maxLX = cx + r;
    minLY = cy - r;
    maxLY = cy + r;
  }

  const a = logicalToRowColApprox(minLX, minLY);
  const b = logicalToRowColApprox(maxLX, maxLY);

  const minRow = Math.min(a.row, b.row) - 2;
  const maxRow = Math.max(a.row, b.row) + 2;
  const minCol = Math.min(a.col, b.col) - 2;
  const maxCol = Math.max(a.col, b.col) + 2;

  const cells: RowCol[] = [];
  const r2 = r * r;

  let poly: Point[] | null = null;

  if (tool === "hex") poly = regularPolygon(cx, cy, r, 6, Math.PI / 6); // match preview
  if (tool === "oct") poly = regularPolygon(cx, cy, r, 8, Math.PI / 8); // match preview
  if (tool === "tri") poly = regularPolygon(cx, cy, r, 3, -Math.PI / 2); // match preview
  if (tool === "heart") poly = heartBezierPolygon(cx, cy, r);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const p = rcToLogical(row, col);

      let ok = false;

      if (tool === "square") {
        ok = p.x >= minLX && p.x <= maxLX && p.y >= minLY && p.y <= maxLY;
      } else if (tool === "circle") {
        const ddx = p.x - cx;
        const ddy = p.y - cy;
        ok = ddx * ddx + ddy * ddy <= r2;
      } else if (poly) {
        ok = pointInPoly(p.x, p.y, poly);
      }

      if (ok) cells.push({ row, col });
    }
  }

  return cells;
}
