// ======================================================
// src/pages/FreeformChainmail2D.tsx
// Freeform 3D painter using Erin-style hex grid + hit logic.
// Rings and hit-circles share ONE projection pipeline.
// RingRenderer itself is unchanged.
// ======================================================

import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import RingRenderer from "../components/RingRenderer";

import {
  WEAVE_SETTINGS_DEFAULT,
  RingMap,
  PlacedRing,
  resolvePlacement,
} from "../utils/e4in1Placement";

import * as THREE from "three";

// ======================================================
// SAFETY STUBS (history integration preserved, no-ops here)
// ======================================================
const commitRings = () => {};
const handleUndo = () => {};
const handleRedo = () => {};
const lock2dView = () => {};
const toggleLock = () => {};
const updateHistory = () => {};
const applyHistory = () => {};
const pushHistory = () => {};

// ======================================================
// COLOR PALETTE
// ======================================================
const PALETTE: string[] = [
  "#000000",
  "#1f2937",
  "#6b7280",
  "#9ca3af",
  "#ffffff",
  "#991b1b",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#2563eb",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f973c5",
  "#7c2d12",
];

// ======================================================
// UI HELPERS
// ======================================================
const ToolButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ active, children, ...rest }) => (
  <button
    {...rest}
    style={{
      width: 48,
      height: 48,
      borderRadius: 14,
      border: "none",
      fontSize: 24,
      cursor: "pointer",
      background: active ? "#2563eb" : "#0f172a",
      color: active ? "#f9fafb" : "#e5e7eb",
      boxShadow: active
        ? "0 10px 25px rgba(37,99,235,0.45)"
        : "0 4px 12px rgba(0,0,0,0.5)",
    }}
  >
    {children}
  </button>
);

const smallBtn: React.CSSProperties = {
  flex: 1,
  border: "none",
  background: "#111827",
  color: "#fff",
  padding: "6px 8px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
};

const smallBtnBlue: React.CSSProperties = {
  ...smallBtn,
  background: "#2563eb",
};

const SliderRow: React.FC<{
  label: string;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
}> = ({ label, value, setValue, min, max, step, unit }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
      alignItems: "center",
    }}
  >
    <label style={{ fontSize: 12 }}>{label}</label>

    <input
      type="number"
      value={Number(value)}
      step={step}
      min={min}
      max={max}
      onChange={(e) => setValue(Number(e.target.value))}
      style={{
        width: 80,
        padding: "2px 6px",
        borderRadius: 6,
        border: "1px solid rgba(148,163,184,0.4)",
        background: "#020617",
        color: "#e5e7eb",
        textAlign: "right",
      }}
    />

    <div
      style={{
        gridColumn: "1 / span 2",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      {unit && (
        <span
          style={{
            fontSize: 11,
            opacity: 0.8,
            width: 40,
            textAlign: "right",
          }}
        >
          {value.toFixed(1)} {unit}
        </span>
      )}
    </div>
  </div>
);

// ======================================================
// RING SET (matches Tuner JSON)
// ======================================================
interface RingSet {
  id: string;
  innerDiameter: number;
  wireDiameter: number;
  centerSpacing: number;
  angleIn?: number;
  angleOut?: number;
  savedAt?: string;
  status?: string;
  aspectRatio?: string;
}

// localStorage keys
const TUNER_LS_KEY = "chainmailMatrix";
const AUTO_FOLLOW_KEY = "freeformAutoFollowTuner";
const ACTIVE_SET_KEY = "freeformActiveRingSetId";

// ======================================================
// CAMERA CONSTANTS (match RingRenderer projection)
// ======================================================
const FALLBACK_CAMERA_Z = 52;
const FOV = 45;
const MIN_ZOOM = 0.20; // allow wider zoom-out than before
const MAX_ZOOM = 6.0;  // allow wider zoom-in than before

// ======================================================
// MAIN COMPONENT
// ======================================================
const FreeformChainmail2D: React.FC = () => {
  const navigate = useNavigate();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null); // interaction
  const hitCanvasRef = useRef<HTMLCanvasElement | null>(null); // overlay circles
  const ringRendererRef = useRef<any>(null);

  // ====================================================
  // PLACED RINGS
  // ====================================================
  const [rings, setRings] = useState<RingMap>(() => new Map());
  const [nextClusterId, setNextClusterId] = useState(1);

  // ✅ DEFAULT COLOR OF RINGS SHOULD BE WHITE
  const [activeColor, setActiveColor] = useState("#ffffff");

  const [eraseMode, setEraseMode] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Diagnostics toggle + log
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);
  const [diagLog, setDiagLog] = useState<string>("");

  // ====================================================
  // GEOMETRY (synced with Tuner)
  // ====================================================
  const [innerIDmm, setInnerIDmm] = useState(7.94);
  const [wireMm, setWireMm] = useState(1.2);
  const [centerSpacing, setCenterSpacing] = useState(7.0);
  const [angleIn, setAngleIn] = useState(25);
  const [angleOut, setAngleOut] = useState(-25);

  const aspectRatio = useMemo(
    () => (wireMm > 0 ? innerIDmm / wireMm : 0),
    [innerIDmm, wireMm]
  );

  // ====================================================
  // RING SETS (from Tuner JSON)
  // ====================================================
  const [ringSets, setRingSets] = useState<RingSet[]>([]);
  const [activeRingSetId, setActiveRingSetId] = useState<string | null>(null);
  const [autoFollowTuner, setAutoFollowTuner] = useState<boolean>(true);

  // ====================================================
  // WEAVE GRID SETTINGS (for resolvePlacement)
  // ====================================================
  const settings = useMemo(
    () => ({
      ...WEAVE_SETTINGS_DEFAULT,
      spacingX: centerSpacing,
      spacingY: centerSpacing * 0.866,
      wireD: wireMm,
    }),
    [centerSpacing, wireMm]
  );

  // ====================================================
  // PAN / ZOOM (virtual camera → applied to both rings & circles)
  // ====================================================
  const [zoom, setZoom] = useState(1.0);
  const [panWorldX, setPanWorldX] = useState(0);
  const [panWorldY, setPanWorldY] = useState(0);

  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const panStart = useRef<{
    screenX: number;
    screenY: number;
    panX: number;
    panY: number;
    lx: number;
    ly: number;
  } | null>(null);

  const pinchStateRef = useRef<{
    active: boolean;
    lastDist: number;
    lx?: number;
    ly?: number;
  }>({
    active: false,
    lastDist: 0,
  });

  // ====================================================
  // CIRCLE OFFSETS / SCALE (hit circles only)
  // ====================================================
  const [circleOffsetX, setCircleOffsetX] = useState(0); // mm
  const [circleOffsetY, setCircleOffsetY] = useState(0); // mm
  const [circleScale, setCircleScale] = useState(1.0);
  const [hideCircles, setHideCircles] = useState(false);

  // ====================================================
  // HEX GRID HELPERS (row/col ↔ logical mm)
  // ====================================================
  const spacingY = useMemo(() => centerSpacing * 0.866, [centerSpacing]);

  const rcToLogical = useCallback(
    (row: number, col: number) => {
      const rowOffset = row & 1 ? centerSpacing / 2 : 0;
      const x = col * centerSpacing + rowOffset;
      const y = row * spacingY;
      return { x, y };
    },
    [centerSpacing, spacingY]
  );

  // ✅ Debug markers stored in LOGICAL coords
  const [debugClicks, setDebugClicks] = useState<
    { id: number; lx: number; ly: number }[]
  >([]);

  const addDebugMarker = useCallback((lx: number, ly: number) => {
    setDebugClicks((prev) => [...prev, { id: prev.length + 1, lx, ly }]);
  }, []);

  // ====================================================
  // DYNAMIC GRID EXTENTS (unbounded freeform)
  // IMPORTANT: must be INSIDE component (needs rings)
  // ====================================================
  const { maxRowSpan, maxColSpan, minRow, minCol, maxRow, maxCol } = useMemo(() => {
    if (!rings.size) {
      return {
        maxRowSpan: 128,
        maxColSpan: 128,
        minRow: 0,
        minCol: 0,
        maxRow: 0,
        maxCol: 0,
      };
    }

    let _minRow = Infinity;
    let _maxRow = -Infinity;
    let _minCol = Infinity;
    let _maxCol = -Infinity;

    rings.forEach((r) => {
      _minRow = Math.min(_minRow, r.row);
      _maxRow = Math.max(_maxRow, r.row);
      _minCol = Math.min(_minCol, r.col);
      _maxCol = Math.max(_maxCol, r.col);
    });

    // Larger padding so camera never clips edge rings
    const PAD = 24;

    return {
      maxRowSpan: Math.max(128, _maxRow - _minRow + 1 + PAD),
      maxColSpan: Math.max(128, _maxCol - _minCol + 1 + PAD),
      minRow: _minRow,
      minCol: _minCol,
      maxRow: _maxRow,
      maxCol: _maxCol,
    };
  }, [rings]);

  // ====================================================
  // FLOATING ORIGIN (prevents huge world coords => seam/clipping/precision loss)
  // We compute a logical center from ring bounds and render relative to it.
  // ====================================================
  const logicalOrigin = useMemo(() => {
    if (!rings.size) return { ox: 0, oy: 0 };

    // Use bounds center in logical space
    const { x: minX, y: minY } = rcToLogical(minRow, minCol);
    const { x: maxX, y: maxY } = rcToLogical(maxRow, maxCol);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    return { ox: cx, oy: cy };
  }, [rings.size, minRow, minCol, maxRow, maxCol, rcToLogical]);

// ====================================================
// TRUE HEX-GRID SNAP (point → row/col)
// Inverse of rcToLogical() — ODD-ROW OFFSET GRID
// ====================================================
const logicalToRowColApprox = useCallback(
  (lx: number, ly: number) => {
    // Row comes directly from Y
    const row = Math.round(ly / spacingY);

    // Undo odd-row horizontal offset
    const rowOffset = row & 1 ? centerSpacing / 2 : 0;

    // Column from X
    const col = Math.round((lx - rowOffset) / centerSpacing);

    return { row, col };
  },
  [centerSpacing, spacingY]
);
  // ====================================================
  // ✅ Use RingRenderer camera for projection/unprojection
  // ====================================================
  const getRendererCamera = useCallback((): THREE.PerspectiveCamera | null => {
    const cam = ringRendererRef.current?.getCamera?.();
    return cam && cam.isPerspectiveCamera ? (cam as THREE.PerspectiveCamera) : null;
  }, []);

  // ====================================================
  // ✅ Viewport rect
  // IMPORTANT: use the WRAP rect as authority to avoid half-width/seam issues
  // when RingRenderer internally changes its canvas/scissor.
  // ====================================================
  const getViewRect = useCallback(() => {
    const wrap = wrapRef.current;
    if (wrap) return wrap.getBoundingClientRect();

    const canvas = canvasRef.current;
    if (canvas) return canvas.getBoundingClientRect();

    return new DOMRect(0, 0, 1, 1);
  }, []);

  const getCameraZ = useCallback(() => {
    const z = ringRendererRef.current?.getCameraZ?.();
    return typeof z === "number" && z > 0 ? z : FALLBACK_CAMERA_Z;
  }, []);

  // ====================================================
  // World convention:
  // RingRenderer renders mesh at (x, -y)
  // We ALSO apply floating-origin recentering (subtract logicalOrigin).
  // ====================================================
  const logicalToWorld = useCallback(
    (lx: number, ly: number) => {
      const ox = logicalOrigin.ox;
      const oy = logicalOrigin.oy;
      return { wx: lx - ox, wy: -(ly - oy) };
    },
    [logicalOrigin]
  );

  const worldToLogical = useCallback(
    (wx: number, wy: number) => {
      const ox = logicalOrigin.ox;
      const oy = logicalOrigin.oy;
      return { lx: wx + ox, ly: -wy + oy };
    },
    [logicalOrigin]
  );

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      const cam = getRendererCamera();
      if (!cam) return { sx: 0, sy: 0 };

      const rect = getViewRect();
      const W = rect.width || 1;
      const H = rect.height || 1;

      const v = new THREE.Vector3(wx, wy, 0);
      v.project(cam);

      return {
        sx: (v.x + 1) * 0.5 * W,
        sy: (-v.y + 1) * 0.5 * H,
      };
    },
    [getRendererCamera, getViewRect]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const cam = getRendererCamera();
      if (!cam) return { wx: 0, wy: 0, lx: 0, ly: 0 };

      const rect = getViewRect();
      const W = rect.width || 1;
      const H = rect.height || 1;

      const xNdc = (sx / W) * 2 - 1;
      const yNdc = -((sy / H) * 2 - 1);

      const origin = new THREE.Vector3();
      const dir = new THREE.Vector3(xNdc, yNdc, 0.5)
        .unproject(cam)
        .sub(cam.position)
        .normalize();
      origin.copy(cam.position);

      const t = (0 - origin.z) / (dir.z || 1e-9);
      const hit = origin.clone().add(dir.multiplyScalar(t));

      const wx = hit.x;
      const wy = hit.y;
      const { lx, ly } = worldToLogical(wx, wy);

      return { wx, wy, lx, ly };
    },
    [getRendererCamera, getViewRect, worldToLogical]
  );

  const projectRingRadiusPx = useCallback(
    (lx: number, ly: number, outerRmmBase: number) => {
      const { wx: cx, wy: cy } = logicalToWorld(lx, ly);
      const { wx: rx, wy: ry } = logicalToWorld(lx + outerRmmBase, ly);

      const { sx: sx1 } = worldToScreen(cx, cy);
      const { sx: sx2 } = worldToScreen(rx, ry);

      return Math.abs(sx2 - sx1);
    },
    [logicalToWorld, worldToScreen]
  );

  const getCanvasPoint = useCallback(
    (evt: { clientX: number; clientY: number }) => {
      const rect = getViewRect();
      return { sx: evt.clientX - rect.left, sy: evt.clientY - rect.top };
    },
    [getViewRect]
  );

  // ====================================================
  // RING DATA FOR RingRenderer (authoritative tilt, default white)
  // Note: we also apply floating-origin to x/y so renderer stays near 0.
  // ====================================================
  const { rings3D, paintMap } = useMemo(() => {
    const arr: any[] = [];
    const paint = new Map<string, string>();
    const outerRadiusMm = (innerIDmm + 2 * wireMm) / 2;

    rings.forEach((r: PlacedRing) => {
      const { x: baseX, y: baseY } = rcToLogical(r.row, r.col);

      // Apply origin shift for stable rendering coordinates
      const shiftedX = baseX - logicalOrigin.ox;
      const shiftedY = baseY - logicalOrigin.oy;

      const tiltDeg = r.row % 2 === 0 ? angleIn : angleOut;
      const tiltRad = THREE.MathUtils.degToRad(tiltDeg);

      const color = (r as any).color ?? "#ffffff";

      arr.push({
        id: `${r.row},${r.col}`,
        row: r.row,
        col: r.col,
        x: shiftedX,
        y: shiftedY,
        z: 0,
        innerDiameter: innerIDmm,
        wireDiameter: wireMm,
        radius: outerRadiusMm,
        centerSpacing: centerSpacing,
        tilt: tiltDeg,
        tiltRad: tiltRad,
        color,
      });

      paint.set(`${r.row},${r.col}`, color);
    });

    return { rings3D: arr, paintMap: paint };
  }, [
    rings,
    innerIDmm,
    wireMm,
    centerSpacing,
    angleIn,
    angleOut,
    rcToLogical,
    logicalOrigin,
  ]);

  // ====================================================
  // Renderer params (rows/cols only affect internal grid; keep large + padded)
  // ====================================================
  const rendererParams = useMemo(
    () => ({
      rows: maxRowSpan,
      cols: maxColSpan,
      innerDiameter: innerIDmm,
      wireDiameter: wireMm,
      ringColor: "#ffffff",
      bgColor: "#020617",
      centerSpacing,
    }),
    [innerIDmm, wireMm, centerSpacing, maxRowSpan, maxColSpan]
  );

  // ====================================================
  // Resize canvases reliably (window + layout changes)
  // ====================================================
  const resizeOverlayCanvases = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const hitCanvas = hitCanvasRef.current;
    if (!wrap || !canvas || !hitCanvas) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // interaction canvas
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
    }

    // hit overlay canvas
    hitCanvas.width = rect.width * dpr;
    hitCanvas.height = rect.height * dpr;
    hitCanvas.style.width = `${rect.width}px`;
    hitCanvas.style.height = `${rect.height}px`;
    const hctx = hitCanvas.getContext("2d");
    if (hctx) {
      hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hctx.clearRect(0, 0, rect.width, rect.height);
    }
  }, []);

  useEffect(() => {
    resizeOverlayCanvases();

    const wrap = wrapRef.current;
    if (!wrap) return;

    const ro = new ResizeObserver(() => {
      resizeOverlayCanvases();
    });
    ro.observe(wrap);

    window.addEventListener("resize", resizeOverlayCanvases);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeOverlayCanvases);
    };
  }, [resizeOverlayCanvases]);

  // ====================================================
  // Effective inner radius (accounts for row tilt)
  // ====================================================
  const getEffectiveInnerRadiusMm = useCallback(
    (row: number) => {
      const tiltDeg = row % 2 === 0 ? angleIn : angleOut;
      const tiltRad = THREE.MathUtils.degToRad(tiltDeg);
      return (innerIDmm / 2) * Math.abs(Math.cos(tiltRad));
    },
    [innerIDmm, angleIn, angleOut]
  );

  // ====================================================
  // HIT CIRCLE DRAWING (WORLD SPACE → SCREEN SPACE)
  // ====================================================
  const drawHitCircles = useCallback(() => {
    const canvas = hitCanvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (hideCircles) return;

    ctx.strokeStyle = "rgba(20,184,166,0.8)";
    ctx.lineWidth = 1;

    rings.forEach((r) => {
      const { x, y } = rcToLogical(r.row, r.col);

      const lx = x + circleOffsetX;
      const ly = y + circleOffsetY;

      const { wx, wy } = logicalToWorld(lx, ly);
      const { sx, sy } = worldToScreen(wx, wy);

      const effInner = getEffectiveInnerRadiusMm(r.row);
      const baseRmm = Math.max(effInner - wireMm * 0.5, effInner * 0.3);
      const rPx = projectRingRadiusPx(lx, ly, baseRmm) * circleScale;

      ctx.beginPath();
      ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
      ctx.stroke();
    });
  }, [
    rings,
    rcToLogical,
    logicalToWorld,
    worldToScreen,
    projectRingRadiusPx,
    getEffectiveInnerRadiusMm,
    wireMm,
    circleScale,
    circleOffsetX,
    circleOffsetY,
    hideCircles,
  ]);

  useEffect(() => {
    drawHitCircles();
  }, [drawHitCircles, zoom, panWorldX, panWorldY, logicalOrigin]);

  // ===============================
  // PAN / ZOOM (mouse + touch)
  // ===============================
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!panMode) return;

      const { sx, sy } = getCanvasPoint(e);
      const { lx, ly } = screenToWorld(sx, sy);

      setIsPanning(true);
      panStart.current = {
        screenX: e.clientX,
        screenY: e.clientY,
        panX: panWorldX,
        panY: panWorldY,
        lx,
        ly,
      };
    },
    [panMode, panWorldX, panWorldY, getCanvasPoint, screenToWorld]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!panMode || !isPanning || !panStart.current) return;

      e.preventDefault();

      const { sx, sy } = getCanvasPoint(e);
      const { lx, ly } = screenToWorld(sx, sy);

      const dxLogical = panStart.current.lx - lx;
      const dyLogical = panStart.current.ly - ly;

      setPanWorldX(panStart.current.panX + dxLogical);
      setPanWorldY(panStart.current.panY + dyLogical);
    },
    [panMode, isPanning, getCanvasPoint, screenToWorld]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStart.current = null;
  }, []);

  const zoomAroundPoint = useCallback(
    (sx: number, sy: number, factor: number) => {
      if (factor === 1) return;

      const { lx: lxBefore, ly: lyBefore } = screenToWorld(sx, sy);

      let nextZoom = zoom * factor;
      if (nextZoom < MIN_ZOOM) nextZoom = MIN_ZOOM;
      if (nextZoom > MAX_ZOOM) nextZoom = MAX_ZOOM;

      setZoom(nextZoom);

      const { lx: lxAfter, ly: lyAfter } = screenToWorld(sx, sy);

      const dx = lxBefore - lxAfter;
      const dy = lyBefore - lyAfter;

      setPanWorldX((p) => p + dx);
      setPanWorldY((p) => p + dy);
    },
    [zoom, screenToWorld]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const { sx, sy } = getCanvasPoint(e);

      zoomAroundPoint(sx, sy, factor);
    },
    [getCanvasPoint, zoomAroundPoint]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length === 2) {
        e.preventDefault();

        const [t1, t2] = Array.from(e.touches);
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        pinchStateRef.current = { active: true, lastDist: dist };
        return;
      }

      if (!panMode || e.touches.length !== 1) return;

      const t = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;

      const { lx, ly } = screenToWorld(sx, sy);

      setIsPanning(true);
      panStart.current = {
        screenX: t.clientX,
        screenY: t.clientY,
        panX: panWorldX,
        panY: panWorldY,
        lx,
        ly,
      };
    },
    [panMode, panWorldX, panWorldY, screenToWorld]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length === 2) {
        e.preventDefault();

        const [t1, t2] = Array.from(e.touches);
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

        if (!pinchStateRef.current.active) {
          pinchStateRef.current.active = true;
          pinchStateRef.current.lastDist = dist;

          const { lx, ly } = screenToWorld(midX, midY);
          pinchStateRef.current.lx = lx;
          pinchStateRef.current.ly = ly;
          return;
        }

        if (pinchStateRef.current.lastDist > 0) {
          const factor = dist / pinchStateRef.current.lastDist;
          pinchStateRef.current.lastDist = dist;
          zoomAroundPoint(midX, midY, factor);
        }
        return;
      }

      if (!panMode || !isPanning || !panStart.current) return;

      const t = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;

      const { lx, ly } = screenToWorld(sx, sy);

      const dxLogical = panStart.current.lx - lx;
      const dyLogical = panStart.current.ly - ly;

      setPanWorldX(panStart.current.panX + dxLogical);
      setPanWorldY(panStart.current.panY + dyLogical);
    },
    [panMode, isPanning, screenToWorld, zoomAroundPoint]
  );

  const handleTouchEnd = useCallback(() => {
    pinchStateRef.current = { active: false, lastDist: 0 };
    setIsPanning(false);
    panStart.current = null;
  }, []);

  // ===============================
  // CLICK → place / erase nearest ring
  // ===============================
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (panMode) return;

      const { sx, sy } = getCanvasPoint(e);
      const { lx, ly } = screenToWorld(sx, sy);

      addDebugMarker(lx, ly);

      const adjLx = lx - circleOffsetX;
      const adjLy = ly - circleOffsetY;

      const { row: approxRow, col: approxCol } = logicalToRowColApprox(adjLx, adjLy);

      const effectiveInnerRadiusMm = getEffectiveInnerRadiusMm(approxRow);

      const baseCircleRmm = Math.max(
        effectiveInnerRadiusMm - wireMm * 0.5,
        effectiveInnerRadiusMm * 0.3
      );

      const hitRadiusPx =
        projectRingRadiusPx(adjLx, adjLy, baseCircleRmm * circleScale) * 1.05;

      let bestRow = approxRow;
      let bestCol = approxCol;
      let bestDist2 = Number.POSITIVE_INFINITY;
      let found = false;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const row = approxRow + dr;
          const col = approxCol + dc;

          const { x: gx, y: gy } = rcToLogical(row, col);
          const { wx, wy } = logicalToWorld(gx, gy);
          const { sx: ringSx, sy: ringSy } = worldToScreen(wx, wy);

          const dx = sx - ringSx;
          const dy = sy - ringSy;
          const d2 = dx * dx + dy * dy;

          if (d2 <= hitRadiusPx * hitRadiusPx && d2 < bestDist2) {
            bestDist2 = d2;
            bestRow = row;
            bestCol = col;
            found = true;
          }
        }
      }

      if (!found) return;

      const { ring, newClusterId } = resolvePlacement(
        bestCol,
        bestRow,
        rings,
        nextClusterId,
        eraseMode ? "#000000" : activeColor,
        settings
      );

      const mapCopy: RingMap = new Map(rings);

      if (eraseMode) {
        const delKey = [...mapCopy.entries()].find(
          ([, v]) => v.row === ring.row && v.col === ring.col
        )?.[0];
        if (delKey) mapCopy.delete(delKey);
      } else {
        const key = `${ring.row}-${ring.col}`;
        mapCopy.set(key, ring);
      }

      setRings(mapCopy);
      setNextClusterId(newClusterId);
    },
    [
      panMode,
      getCanvasPoint,
      screenToWorld,
      addDebugMarker,
      circleOffsetX,
      circleOffsetY,
      logicalToRowColApprox,
      getEffectiveInnerRadiusMm,
      wireMm,
      circleScale,
      projectRingRadiusPx,
      rcToLogical,
      logicalToWorld,
      worldToScreen,
      rings,
      nextClusterId,
      eraseMode,
      activeColor,
      settings,
    ]
  );

  // ===============================
  // CLEAR / GEOMETRY RESET
  // ===============================
  const handleClear = useCallback(() => {
    if (!window.confirm("Clear all rings?")) return;
    setRings(new Map());
    setNextClusterId(1);
    applyHistory();
  }, []);

  const resetGeometryToDefaults = useCallback(() => {
    setCenterSpacing(WEAVE_SETTINGS_DEFAULT.spacingX);
    setAngleIn(25);
    setAngleOut(-25);
  }, []);

  // ===============================
  // Ring Set loading (Tuner + JSON)
  // ===============================
  const reloadRingSets = useCallback(() => {
    try {
      const txt = localStorage.getItem(TUNER_LS_KEY);
      if (!txt) {
        setRingSets([]);
        return;
      }

      const arr = JSON.parse(txt) as any[];
      const cleaned: RingSet[] = arr
        .filter((e) => e && typeof e.id === "string")
        .map((e) => ({
          id: e.id,
          innerDiameter: e.innerDiameter ?? innerIDmm,
          wireDiameter: e.wireDiameter ?? wireMm,
          centerSpacing: e.centerSpacing ?? centerSpacing,
          angleIn: typeof e.angleIn === "number" ? e.angleIn : 25,
          angleOut: typeof e.angleOut === "number" ? e.angleOut : -25,
          status: e.status,
          aspectRatio: e.aspectRatio,
          savedAt: e.savedAt,
        }));

      cleaned.sort((a, b) => {
        const ta = a.savedAt ? Date.parse(a.savedAt) : 0;
        const tb = b.savedAt ? Date.parse(b.savedAt) : 0;
        return ta - tb;
      });

      setRingSets(cleaned);
    } catch (err) {
      console.warn("Failed to parse tuner ring sets:", err);
      setRingSets([]);
    }
  }, [centerSpacing, innerIDmm, wireMm]);

  const applyRingSet = useCallback((rs: RingSet) => {
    setInnerIDmm(rs.innerDiameter);
    setWireMm(rs.wireDiameter);
    setCenterSpacing(rs.centerSpacing);
    setAngleIn(rs.angleIn ?? 25);
    setAngleOut(rs.angleOut ?? -25);
    setActiveRingSetId(rs.id);
  }, []);

  useEffect(() => {
    reloadRingSets();

    const storedAuto = localStorage.getItem(AUTO_FOLLOW_KEY);
    const auto = storedAuto === null ? true : storedAuto === "true" || storedAuto === "1";
    setAutoFollowTuner(auto);

    const storedActive = localStorage.getItem(ACTIVE_SET_KEY);
    if (storedActive) setActiveRingSetId(storedActive);
  }, [reloadRingSets]);

  useEffect(() => {
    if (!ringSets.length) return;

    if (autoFollowTuner) {
      const latest = ringSets[ringSets.length - 1];
      applyRingSet(latest);
      return;
    }

    if (activeRingSetId) {
      const found = ringSets.find((r) => r.id === activeRingSetId);
      if (found) applyRingSet(found);
    }
  }, [ringSets, autoFollowTuner, activeRingSetId, applyRingSet]);

  useEffect(() => {
    localStorage.setItem(AUTO_FOLLOW_KEY, autoFollowTuner ? "true" : "false");
  }, [autoFollowTuner]);

  useEffect(() => {
    if (activeRingSetId) localStorage.setItem(ACTIVE_SET_KEY, activeRingSetId);
  }, [activeRingSetId]);

  // Prevent panning inside RingRenderer; we own pan/zoom here
  useEffect(() => {
    if (ringRendererRef.current?.setPanEnabled) {
      ringRendererRef.current.setPanEnabled(false);
    }
  }, []);

  // ====================================================
  // Manual JSON load
  // ====================================================
  const handleFileJSONLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result || "{}"));

        if (typeof data.innerDiameter === "number") setInnerIDmm(data.innerDiameter);
        if (typeof data.wireDiameter === "number") setWireMm(data.wireDiameter);
        if (typeof data.centerSpacing === "number") setCenterSpacing(data.centerSpacing);
        if (typeof data.angleIn === "number") setAngleIn(data.angleIn);
        if (typeof data.angleOut === "number") setAngleOut(data.angleOut);

        const newId = data.id || `file:${file.name}`;
        setActiveRingSetId(newId);
        setAutoFollowTuner(false);
      } catch (err) {
        alert("Could not parse JSON file.");
        console.error(err);
      }
    };

    reader.readAsText(file);
  }, []);

// ====================================================
// External view state passed to RingRenderer
// IMPORTANT: must use SAME floating-origin pipeline as rings3D
// ====================================================
const externalViewState = useMemo(
  () => {
    // Convert logical pan center -> renderer world coords (shifted + y-inverted)
    const worldPanX = panWorldX - logicalOrigin.ox;
    const worldPanY = -(panWorldY - logicalOrigin.oy);

    return {
      panX: worldPanX,
      panY: worldPanY,
      zoom,
    };
  },
  [panWorldX, panWorldY, zoom, logicalOrigin.ox, logicalOrigin.oy]
);

  // ====================================================
  // RENDER
  // ====================================================
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#020617",
        display: "flex",
        flexDirection: "row",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* LEFT TOOLBAR */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 72,
          height: "100vh",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "#020617",
          borderRight: "1px solid rgba(148,163,184,0.2)",
          zIndex: 10,
        }}
      >
        <ToolButton
          active={!eraseMode}
          onClick={() => setEraseMode(false)}
          title="Place / recolor ring"
        >
          🎨
        </ToolButton>

        <ToolButton
          active={eraseMode}
          onClick={() => setEraseMode(true)}
          title="Erase ring"
        >
          🧽
        </ToolButton>

        <ToolButton
          active={panMode}
          onClick={() => setPanMode((v) => !v)}
          title="Pan / Drag view"
        >
          ✋
        </ToolButton>

        <ToolButton
          active={showControls}
          onClick={() => setShowControls((v) => !v)}
          title="Show geometry & JSON controls"
        >
          🧰
        </ToolButton>

        <ToolButton
          active={showDiagnostics}
          onClick={() => setShowDiagnostics((v) => !v)}
          title="Toggle diagnostics (coords)"
        >
          📊
        </ToolButton>

        <ToolButton onClick={handleClear} title="Clear all">
          🧹
        </ToolButton>

        <div
          style={{
            marginTop: "auto",
            fontSize: 10,
            opacity: 0.7,
            textAlign: "center",
          }}
        >
          Scroll / pinch = zoom
        </div>
      </div>

      {/* MAIN WORK AREA */}
      <div
        ref={wrapRef}
        style={{
          flex: 1,
          position: "relative",
          background: "#020617",
          marginLeft: 72,
        }}
      >
        {/* 3D VIEW */}
        <div style={{ position: "absolute", inset: 0 }}>
          <RingRenderer
            ref={ringRendererRef}
            rings={rings3D}
            params={rendererParams}
            paint={paintMap}
            setPaint={() => {}}
            activeColor={activeColor}
            initialPaintMode={false}
            initialEraseMode={false}
            initialRotationLocked={true}
            externalViewState={externalViewState}
          />
        </div>

        {/* INTERACTION CANVAS */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            cursor: panMode ? "grab" : eraseMode ? "not-allowed" : "crosshair",
            touchAction: "none",
            background: "transparent",
            zIndex: 3,
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* HIT CIRCLES CANVAS */}
        <canvas
          ref={hitCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "transparent",
            zIndex: 2,
          }}
        />

        {/* DEBUG CLICK MARKERS */}
        {!hideCircles &&
          debugClicks.map((marker) => {
            const { wx, wy } = logicalToWorld(marker.lx, marker.ly);
            const { sx, sy } = worldToScreen(wx, wy);

            return (
              <div
                key={marker.id}
                style={{
                  position: "absolute",
                  left: sx - 10,
                  top: sy - 10,
                  width: 20,
                  height: 20,
                  backgroundColor: "rgba(0,255,0,0.85)",
                  color: "black",
                  fontSize: "14px",
                  fontWeight: "bold",
                  borderRadius: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  zIndex: 4,
                }}
              >
                {marker.id}
              </div>
            );
          })}

        {/* COLOR PALETTE */}
        <div
          style={{
            position: "fixed",
            left: 88,
            bottom: 16,
            padding: 8,
            borderRadius: 12,
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(148,163,184,0.3)",
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gap: 6,
            zIndex: 11,
          }}
        >
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                setActiveColor(c);
                setEraseMode(false);
              }}
              title={c}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border:
                  activeColor === c
                    ? "2px solid #f9fafb"
                    : "1px solid rgba(15,23,42,0.9)",
                background: c,
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        {/* RIGHT CONTROL PANEL */}
        {showControls && (
          <div
            style={{
              position: "fixed",
              right: 16,
              top: 16,
              width: 340,
              background: "#0f172a",
              color: "#e5e7eb",
              borderRadius: 12,
              padding: 12,
              border: "1px solid rgba(148,163,184,0.35)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              zIndex: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: "80vh",
              overflowY: "auto",
              fontSize: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14 }}>
              Freeform Geometry (Tuner-linked)
            </h3>

            <p style={{ margin: 0, opacity: 0.8, lineHeight: 1.3 }}>
              Uses the same <b>center spacing</b> and hex grid as the Weave Tuner.
              Vertical spacing is <code>center × 0.866</code> and odd rows are shifted by{" "}
              <code>center / 2</code>.
            </p>

            <SliderRow
              label="Center Spacing (mm)"
              value={centerSpacing}
              setValue={(v) => {
                setCenterSpacing(v);
                setAutoFollowTuner(false);
              }}
              min={2}
              max={25}
              step={0.1}
              unit="mm"
            />

            <SliderRow
              label="Angle In (°)"
              value={angleIn}
              setValue={setAngleIn}
              min={-75}
              max={75}
              step={1}
              unit="°"
            />

            <SliderRow
              label="Angle Out (°)"
              value={angleOut}
              setValue={setAngleOut}
              min={-75}
              max={75}
              step={1}
              unit="°"
            />

            {/* CIRCLE TUNING PANEL */}
            <div
              style={{
                marginTop: 4,
                padding: 8,
                borderRadius: 12,
                background: "rgba(15,23,42,0.95)",
                border: "1px solid rgba(148,163,184,0.25)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 11,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={hideCircles}
                  onChange={(e) => setHideCircles(e.target.checked)}
                />
                <span>Hide circles (still clickable)</span>
              </label>

              <div style={{ fontWeight: 700, fontSize: 12, textAlign: "left" }}>
                Circles (on placed rings only)
              </div>

              <label>Offset X (mm)</label>
              <input
                type="range"
                min={-innerIDmm * 20}
                max={innerIDmm * 20}
                step={0.05}
                value={circleOffsetX}
                onChange={(e) => setCircleOffsetX(Number(e.target.value))}
              />

              <label>Offset Y (mm)</label>
              <input
                type="range"
                min={-innerIDmm * 20}
                max={innerIDmm * 20}
                step={0.05}
                value={circleOffsetY}
                onChange={(e) => setCircleOffsetY(Number(e.target.value))}
              />

              <label>Scale</label>
              <input
                type="range"
                min={0.2}
                max={2.5}
                step={0.01}
                value={circleScale}
                onChange={(e) => setCircleScale(Number(e.target.value))}
              />
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                lineHeight: 1.4,
                borderTop: "1px solid rgba(148,163,184,0.35)",
                paddingTop: 6,
              }}
            >
              <div>Inner ID: {innerIDmm.toFixed(2)} mm</div>
              <div>Wire: {wireMm.toFixed(2)} mm</div>
              <div>AR ≈ {aspectRatio.toFixed(2)}</div>
              <div>Zoom: {zoom.toFixed(2)}×</div>
            </div>

            {/* JSON / Ring Set controls */}
            <div
              style={{
                borderTop: "1px solid rgba(148,163,184,0.35)",
                paddingTop: 6,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 600 }}>Ring Set (from Tuner JSON)</div>

              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={autoFollowTuner}
                  onChange={(e) => setAutoFollowTuner(e.target.checked)}
                />
                <span>Follow latest Tuner save automatically</span>
              </label>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ flexShrink: 0 }}>Ring Set:</span>
                <select
                  value={activeRingSetId ?? ""}
                  disabled={autoFollowTuner}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    setActiveRingSetId(id);
                    setAutoFollowTuner(false);
                    if (id) {
                      const found = ringSets.find((r) => r.id === id);
                      if (found) applyRingSet(found);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "2px 6px",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.4)",
                    background: "#020617",
                    color: "#e5e7eb",
                  }}
                >
                  <option value="">(none)</option>
                  {ringSets.map((rs) => (
                    <option key={rs.id} value={rs.id}>
                      {rs.id}
                      {rs.status ? ` (${rs.status})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  style={smallBtnBlue}
                  onClick={() => {
                    reloadRingSets();
                    setAutoFollowTuner(true);
                  }}
                >
                  🔄 Refresh from Tuner
                </button>
                <button style={smallBtn} onClick={() => navigate("/tuner")}>
                  🧭 Edit in Tuner
                </button>
              </div>

              <div style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Load JSON File</div>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleFileJSONLoad}
                  style={{ fontSize: 11 }}
                />
                <div style={{ opacity: 0.7, marginTop: 2 }}>
                  JSON structure:{" "}
                  <code>innerDiameter, wireDiameter, centerSpacing, angleIn, angleOut</code>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={resetGeometryToDefaults} style={smallBtn}>
                Reset Geometry
              </button>
            </div>
          </div>
        )}

        {/* DIAGNOSTIC PANEL (copyable text) */}
        {showDiagnostics && (
          <div
            style={{
              position: "fixed",
              left: 88,
              top: 16,
              width: 420,
              maxHeight: "40vh",
              background: "rgba(15,23,42,0.96)",
              borderRadius: 12,
              padding: 8,
              border: "1px solid rgba(248,250,252,0.3)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 11,
              userSelect: "text",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600 }}>Diagnostics (copy text)</span>
              <button
                style={{ ...smallBtn, flex: "none", padding: "2px 6px", fontSize: 10 }}
                onClick={() => setDiagLog("")}
              >
                Clear
              </button>
            </div>

            <div
              style={{
                whiteSpace: "pre",
                overflowY: "auto",
                borderRadius: 8,
                background: "rgba(15,23,42,0.9)",
                padding: 6,
                border: "1px solid rgba(30,64,175,0.6)",
                userSelect: "text",
              }}
            >
              {diagLog || "Click on the canvas to log diagnostics..."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeformChainmail2D;