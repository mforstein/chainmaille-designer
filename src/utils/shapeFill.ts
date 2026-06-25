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

function rotatePoint(p: Point, cx: number, cy: number, a: number): Point {
  if (!a) return p;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
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
  /** Rotation of the shape about its center, in radians (default 0). */
  angleRad?: number;
}): RowCol[] {
  const { tool, sel, logicalToRowColApprox, rcToLogical, angleRad = 0 } = args;

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

  // For a rotated square we test against a polygon (4 rotated corners). For the
  // axis-aligned case we keep the fast min/max bounds test.
  let squarePoly: Point[] | null = null;

  if (tool === "square") {
    const sx0 = Math.min(sel.lx0, sel.lx1);
    const sx1 = Math.max(sel.lx0, sel.lx1);
    const sy0 = Math.min(sel.ly0, sel.ly1);
    const sy1 = Math.max(sel.ly0, sel.ly1);
    if (angleRad) {
      const sccx = (sx0 + sx1) / 2;
      const sccy = (sy0 + sy1) / 2;
      squarePoly = [
        { x: sx0, y: sy0 },
        { x: sx1, y: sy0 },
        { x: sx1, y: sy1 },
        { x: sx0, y: sy1 },
      ].map((p) => rotatePoint(p, sccx, sccy, angleRad));
      minLX = Math.min(...squarePoly.map((p) => p.x));
      maxLX = Math.max(...squarePoly.map((p) => p.x));
      minLY = Math.min(...squarePoly.map((p) => p.y));
      maxLY = Math.max(...squarePoly.map((p) => p.y));
    } else {
      minLX = sx0; maxLX = sx1; minLY = sy0; maxLY = sy1;
    }
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
  if (poly && angleRad) poly = poly.map((p) => rotatePoint(p, cx, cy, angleRad));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const p = rcToLogical(row, col);

      let ok = false;

      if (tool === "square") {
        ok = squarePoly
          ? pointInPoly(p.x, p.y, squarePoly)
          : p.x >= minLX && p.x <= maxLX && p.y >= minLY && p.y <= maxLY;
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

/** The outline polygon of a shape for the given drag, in the same coordinate
 *  frame as `sel`. Used to draw the live "ghost" preview while dragging. */
export function shapeOutline(
  tool: ShapeTool,
  sel: SelectionDrag,
  angleRad = 0,
): { x: number; y: number }[] {
  const cx = sel.lx0;
  const cy = sel.ly0;
  const dx = sel.lx1 - sel.lx0;
  const dy = sel.ly1 - sel.ly0;
  const r = Math.sqrt(dx * dx + dy * dy);

  let pts: Point[] = [];
  let pivot: Point = { x: cx, y: cy };

  if (tool === "square") {
    const minX = Math.min(sel.lx0, sel.lx1);
    const maxX = Math.max(sel.lx0, sel.lx1);
    const minY = Math.min(sel.ly0, sel.ly1);
    const maxY = Math.max(sel.ly0, sel.ly1);
    pts = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
    pivot = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  } else if (tool === "circle") {
    pts = regularPolygon(cx, cy, r, 48);
  } else if (tool === "hex") {
    pts = regularPolygon(cx, cy, r, 6, Math.PI / 6);
  } else if (tool === "oct") {
    pts = regularPolygon(cx, cy, r, 8, Math.PI / 8);
  } else if (tool === "tri") {
    pts = regularPolygon(cx, cy, r, 3, -Math.PI / 2);
  } else if (tool === "heart") {
    pts = heartBezierPolygon(cx, cy, r);
  }

  if (angleRad) return pts.map((p) => rotatePoint(p, pivot.x, pivot.y, angleRad));
  return pts;
}
