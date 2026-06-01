// ============================================================
// File: src/components/RingRenderer.tsx  (DROP-IN FULL FILE)
// ============================================================

import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useCallback,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import SpriteText from "three-spritetext";
import type { OverlayState } from "../components/ImageOverlayPanel";
import RingRendererInstanced from "./RingRendererInstanced";
import { getCustomShapeById } from "../lib/customScaleShapes";

// ============================================================
// Utility Constants & Conversions
// ============================================================
const INCH_TO_MM = 25.4;
// If rings are above this threshold, use instanced renderer.
// Tune this number if you want; 5k is a safe default for torus-per-mesh.
const LARGE_THRESHOLD = 5000;
const SCALE_THICKNESS_RR = 0.8;
const DEG_RR = Math.PI / 180;

export function parseInchFractionToInches(v: string | number): number {
  if (typeof v === "number") return v;
  const s = v.replace(/"/g, "").trim();
  if (s.includes("/")) {
    const [num, den] = s.split("/").map(Number);
    return den ? num / den : Number(s);
  }
  return Number(s);
}

export function inchesToMm(inches: number) {
  return inches * INCH_TO_MM;
}

export function convertToMM(idValue: string | number): number {
  if (typeof idValue === "number") return idValue;
  const cleaned = idValue.replace(/"/g, "").trim();
  if (cleaned.includes("/")) {
    const [num, den] = cleaned.split("/").map(Number);
    return den ? 25.4 * (num / den) : parseFloat(cleaned);
  }
  return parseFloat(cleaned);
}

export function computeRingVarsFixedID(
  idInput: string | number,
  wdMm: string | number,
) {
  const id_in =
    typeof idInput === "number" && idInput > 25
      ? idInput / INCH_TO_MM
      : parseInchFractionToInches(idInput);
  const ID_mm = inchesToMm(id_in);
  const WD_mm = typeof wdMm === "number" ? wdMm : Number(wdMm);
  const OD_mm = ID_mm + 2 * WD_mm;
  const AR = ID_mm / WD_mm;
  return { ID_mm, WD_mm, OD_mm, AR };
}

// ✅ This is what your Tuner imports and should keep using
export function computeRingVarsIndependent(
  ID_value: string | number,
  wire_value: number,
) {
  const ID_mm = convertToMM(ID_value);
  const WD_mm = parseFloat(String(wire_value));
  const OD_mm = ID_mm + 2 * WD_mm;
  return { ID_mm, WD_mm, OD_mm };
}

// ============================================================
// Types
// ============================================================
export type Ring = {
  row: number;
  col: number;
  x: number;
  y: number;
  z?: number;
  radius: number;
  innerDiameter?: number;
  wireDiameter?: number;
  centerSpacing?: number;

  // Tilt is expected to be computed upstream (Tuner / Generators)
  tilt?: number; // degrees (optional)
  tiltRad?: number; // radians (preferred)

  // Optional per-ring color (Freeform provides this; Tuner paint system uses paint map)
  color?: string;

  _chartLabel?: SpriteText;
};

export interface RenderParams {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
  ringColor: string;
  bgColor: string;
  centerSpacing?: number;
}

export type PaintMap = Map<string, string | null>;

export type ScaleRenderItem = {
  key: string;
  row: number;
  col: number;
  x: number;
  y: number;
  z: number;
  bodyX: number;
  bodyY: number;
  color: string;
  holeDiameter: number;
  width: number;
  height: number;
  shape: string;
  tiltRad: number;
  planeZMm: number;
  tipLiftDeg: number;
  rowClearanceZMm: number;
  dropMm: number;
  // Optional per-scale image patch (data URL). When set, the scale's
  // material uses this image as a CanvasTexture map so the picture is
  // painted directly onto the scale outline (clipped by the mesh).
  imagePatchUrl?: string | null;
};

// ✅ External authoritative 2D view state (optional)
export type ExternalViewState = {
  panX: number;
  panY: number;
  zoom: number;
};

type Props = {
  rings: Ring[];
  params: RenderParams;
  paint: PaintMap;
  setPaint: React.Dispatch<React.SetStateAction<PaintMap>>;
  activeColor: string;
  overlay?: OverlayState | null;
  externalViewState?: ExternalViewState;
  initialPaintMode?: boolean;
  initialEraseMode?: boolean;
  initialRotationLocked?: boolean;
  scales3D?: ScaleRenderItem[];
  showScales?: boolean;
  scalesBehindRings?: boolean;
  onGridAspectChange?: (aspect: number) => void;
  // Keys (formatted as "row-col" or "row,col" — both formats are accepted) of
  // scales/rings that should be visually highlighted as "selected". Selected
  // scales render with a bright outline + glow so the user can see which one
  // an action (transfer, paint) will affect.
  highlightedScaleKeys?: Set<string>;
  highlightedRingKeys?: Set<string>;
};

export type RingRendererHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  toggleLock: () => void;

  setPaintMode: (on: boolean) => void;
  setPanEnabled: (enabled: boolean) => void;
  setEraseMode: (enabled: boolean) => void;
  toggleErase: () => void;
  clearPaint: () => void;

  lock2DView: () => void;
  forceLockRotation: (locked: boolean) => void;

  applyOverlayToRings: (overlay: OverlayState) => Promise<void>;

  getState: () => {
    paintMode: boolean;
    eraseMode: boolean;
    rotationLocked: boolean;
  };

  getCameraZ?: () => number;
  getCamera?: () => THREE.PerspectiveCamera | null;
  getDomRect?: () => DOMRect | null;

  // ✅ For export / screenshot
  getCanvas?: () => HTMLCanvasElement | null;
  /** Force a synchronous re-render so the WebGL back buffer is populated
   *  for the next drawImage/readPixels (preserveDrawingBuffer is off). */
  renderNow?: () => void;

  // ✅ For 3D model export (GLB / STL)
  getExportGroups?: () => { rings: THREE.Group | null; scales: THREE.Group | null };
};

// ============================================================
// Camera Dolly Utility
// ============================================================
// ============================================================
// Scale rendering helpers (mirrors ChainmailWeaveTuner.tsx)
// ============================================================
function makeScaleShapeRR(
  shape: string,
  w: number,
  h: number,
  holeDia: number,
  bodyOffY: number,
): THREE.Shape {
  const hw = w / 2;
  const tipY = bodyOffY - h;
  const shoulderY = bodyOffY - h * 0.08;
  const bellyY = bodyOffY - h * 0.45;
  const lowerY = bodyOffY - h * 0.78;
  const s = new THREE.Shape();

  // Custom polygon shapes ("custom:<id>"): place the polygon in the same
  // vertical span as built-ins. Polygon is normalized to a unit square
  // centered at (0, 0) with y-down — three.js Shape uses y-up, so flip y.
  if (typeof shape === "string" && shape.startsWith("custom:")) {
    const custom = getCustomShapeById(shape);
    if (custom?.source === "base" && custom.baseShape) {
      shape = custom.baseShape; // fall through to built-in path below
    } else if (custom?.polygon && custom.polygon.length >= 3) {
      // Bbox of built-ins spans roughly [tipY .. shoulderY] vertically.
      // We want the polygon bbox to fit in that span and stay horizontally
      // centered at x=0.
      const yCenter = (shoulderY + tipY) / 2;
      const spanY = shoulderY - tipY; // positive
      // Note: polygon y is "down-positive" but three.js y is "up-positive",
      // so we negate. Bbox of normalized polygon is at most [-0.5, 0.5].
      const pts = custom.polygon;
      const [x0, y0] = pts[0];
      s.moveTo(x0 * w, yCenter - y0 * spanY);
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i];
        s.lineTo(px * w, yCenter - py * spanY);
      }
      s.closePath();
      // Use traced inner holes if present (e.g. the scale's ring hole was
      // detected in the image); otherwise fall back to the circular default.
      if (custom.holes && custom.holes.length) {
        for (const hole of custom.holes) {
          if (hole.length < 3) continue;
          const path = new THREE.Path();
          const [hx0, hy0] = hole[0];
          path.moveTo(hx0 * w, yCenter - hy0 * spanY);
          for (let i = 1; i < hole.length; i++) {
            const [px, py] = hole[i];
            path.lineTo(px * w, yCenter - py * spanY);
          }
          path.closePath();
          s.holes.push(path);
        }
      } else {
        const hole = new THREE.Path();
        hole.absellipse(0, 0, holeDia / 2, holeDia / 2, 0, Math.PI * 2, true, 0);
        s.holes.push(hole);
      }
      return s;
    }
  }

  if (shape === "round") {
    s.moveTo(0, shoulderY);
    s.bezierCurveTo(hw * 0.95, shoulderY, hw * 1.05, bodyOffY - h * 0.52, 0, tipY);
    s.bezierCurveTo(-hw * 1.05, bodyOffY - h * 0.52, -hw * 0.95, shoulderY, 0, shoulderY);
  } else if (shape === "kite") {
    s.moveTo(0, shoulderY);
    s.lineTo(hw * 0.96, bodyOffY - h * 0.3);
    s.lineTo(hw * 0.56, lowerY);
    s.lineTo(0, tipY);
    s.lineTo(-hw * 0.56, lowerY);
    s.lineTo(-hw * 0.96, bodyOffY - h * 0.3);
    s.closePath();
  } else {
    // "Standard" chainmaille scale — almond / vesica piscis silhouette
    // matching the physical scale photo (scale.jpg). Both top AND bottom
    // are gently rounded (no sharp tip); max width is at vertical midpoint.
    // Two cubic beziers, one per side, with horizontally-mirrored control
    // points so the top/bottom transitions are tangent-continuous.
    // This is also the fallback for legacy "teardrop" and any unknown
    // shape value — teardrop bezier removed 2026-06-01 per Erin.
    // Use bellyY (~0.45h) and lowerY (~0.78h) just for reference — actual
    // control points pulled from those vertical bands.
    void bellyY; void lowerY;
    s.moveTo(0, shoulderY);
    s.bezierCurveTo(
      hw * 1.10, bodyOffY - h * 0.20,
      hw * 1.10, bodyOffY - h * 0.82,
      0, tipY,
    );
    s.bezierCurveTo(
      -hw * 1.10, bodyOffY - h * 0.82,
      -hw * 1.10, bodyOffY - h * 0.20,
      0, shoulderY,
    );
  }
  const hole = new THREE.Path();
  hole.absellipse(0, 0, holeDia / 2, holeDia / 2, 0, Math.PI * 2, true, 0);
  s.holes.push(hole);
  return s;
}

function makeHoleRimRR(r: number, z: number, color: number): THREE.LineLoop {
  const pts = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0)
    .getPoints(64)
    .map((p) => new THREE.Vector3(p.x, p.y, z));
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
  );
}

function dollyCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls | undefined,
  factor: number,
) {
  if (!camera) return;
  const target = controls ? controls.target : new THREE.Vector3();
  const dir = new THREE.Vector3()
    .subVectors(camera.position, target)
    .multiplyScalar(factor);
  camera.position.copy(target).add(dir);
  camera.near = 0.01;
  camera.far = 100000;
  camera.updateProjectionMatrix();
}

// ============================================================
// Overlay helpers (robust / defensive)
// ============================================================
function overlayGetNumeric(o: any, keys: string[], fallback: number) {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return fallback;
}

function overlayGetString(
  o: any,
  keys: string[],
  fallback: string | null = null,
) {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
}
function overlayGetBool(o: any, keys: string[], fallback = false) {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
      if (s === "false" || s === "0" || s === "no" || s === "off") return false;
    }
  }
  return fallback;
}

function wrap01(t: number) {
  // wraps any real number into [0, 1)
  return ((t % 1) + 1) % 1;
}
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (x: number) => x.toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function normalizeColor6(hex: string): string {
  const h = (hex || "").trim().toLowerCase();
  const m6 = /^#([0-9a-f]{6})$/.exec(h);
  if (m6) return `#${m6[1]}`;
  const m8 = /^#([0-9a-f]{8})$/.exec(h);
  if (m8) return `#${m8[1].slice(0, 6)}`;
  const m3 = /^#([0-9a-f]{3})$/.exec(h);
  if (m3) {
    const r = m3[1][0];
    const g = m3[1][1];
    const b = m3[1][2];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#ffffff";
}

// ============================================================
// Fit camera to group (keeps panel from “disappearing” when scale changes)
// - Only runs when NOT using externalViewState
// - Updates both controls.target and the initial refs used by resetView()
// ============================================================
function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  padding = 1.15,
) {
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 1e-6) {
    controls.target.copy(center);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
    return;
  }

  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = (maxDim * padding) / (2 * Math.tan(fov / 2));

  controls.target.copy(center);

  camera.position.set(center.x, center.y, center.z + dist);
  camera.near = Math.max(0.01, dist / 5000);
  camera.far = Math.max(100000, dist * 20);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
}

// ============================================================
// Error boundary for safe instanced/non-instanced fallback
// (prevents “blank screen” when instanced renderer throws)
// ============================================================
class RingRendererErrorBoundary extends React.Component<
  {
    onError: (err: any) => void;
    fallback: React.ReactNode;
    children: React.ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: any) {
    try {
      this.props.onError(err);
    } catch {}
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ============================================================
// WRAPPER COMPONENT (safe large/small switch without breaking hooks)
// ============================================================
const RingRenderer = forwardRef<RingRendererHandle, Props>(function RingRenderer(
  props,
  ref,
) {
  const useInstanced = (props?.rings?.length ?? 0) >= LARGE_THRESHOLD;

  // If instanced ever fails, permanently fall back for this mount.
  const [instancedFailed, setInstancedFailed] = useState(false);

  const shouldUseInstanced = useInstanced && !instancedFailed;

  const child = shouldUseInstanced ? (
    <RingRendererErrorBoundary
      onError={(err) => {
        console.warn(
          "[RingRenderer] Instanced renderer failed; falling back to non-instanced.",
          err,
        );
        setInstancedFailed(true);
      }}
      fallback={<RingRendererNonInstanced {...props} ref={ref} />}
    >
      <RingRendererInstanced {...(props as any)} ref={ref as any} />
    </RingRendererErrorBoundary>
  ) : (
    <RingRendererNonInstanced {...props} ref={ref} />
  );

  return child;
});

export default RingRenderer;

// ============================================================
// NON-INSTANCED RENDERER (all features preserved)
// ============================================================
const RingRendererNonInstanced = forwardRef<RingRendererHandle, Props>(
  function RingRendererNonInstanced(
    {
      rings,
      params,
      paint,
      setPaint,
      activeColor,
      overlay,
      externalViewState,
      initialPaintMode = true,
      initialEraseMode = false,
      initialRotationLocked = true,
      scales3D,
      showScales,
      scalesBehindRings,
      onGridAspectChange,
      highlightedScaleKeys,
      highlightedRingKeys,
    },
    ref,
  ) {
    // ============================================================
    // iPad/WebGL recovery refs MUST be inside component (Rules of Hooks)
    // ============================================================
    const rafRef = useRef<number | null>(null);
    const contextLostRef = useRef(false);
    const [glEpoch, setGlEpoch] = useState(0); // bump to re-init WebGL

    // ----------------------------
    // Safe Params State
    // ----------------------------
    const [safeParams, setSafeParams] = useState(() => ({
      rows: params?.rows ?? 1,
      cols: params?.cols ?? 1,
      innerDiameter: params?.innerDiameter ?? 6,
      wireDiameter: params?.wireDiameter ?? 1,
      ringColor: params?.ringColor ?? "#CCCCCC",
      bgColor: params?.bgColor ?? "#0F1115",
      centerSpacing: params?.centerSpacing ?? 7.5,
    }));

    useEffect(() => {
      setSafeParams({
        rows: params?.rows ?? 1,
        cols: params?.cols ?? 1,
        innerDiameter: params?.innerDiameter ?? 6,
        wireDiameter: params?.wireDiameter ?? 1,
        ringColor: params?.ringColor ?? "#CCCCCC",
        bgColor: params?.bgColor ?? "#0F1115",
        centerSpacing: params?.centerSpacing ?? 7.5,
      });
    }, [
      params?.rows,
      params?.cols,
      params?.innerDiameter,
      params?.wireDiameter,
      params?.ringColor,
      params?.bgColor,
      params?.centerSpacing,
    ]);

    // ----------------------------
    // Refs
    // ----------------------------
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);

    const meshesRef = useRef<THREE.Mesh[]>([]);
    const groupRef = useRef<THREE.Group | null>(null);
    const scaleGroupRef = useRef<THREE.Group | null>(null);
    // Geometry cache: reuse identical ShapeGeometry across rebuilds (key = shape+dims)
    const scaleGeoCacheRef = useRef<Map<string, THREE.ShapeGeometry>>(new Map());
    const lastScaleShapeKeyRef = useRef<string>("");
    const showScalesRef = useRef(showScales ?? false);
    const scalesBehindRingsRef = useRef(scalesBehindRings ?? false);

    // For accurate picking & fast lookup
    const meshByKeyRef = useRef<Map<string, THREE.Mesh>>(new Map());
    const spatialIndexRef = useRef<Map<string, number[]>>(new Map());
    const spatialCellSizeRef = useRef<number>(safeParams.centerSpacing ?? 7.5);

    const [localPaintMode, setLocalPaintMode] = useState(initialPaintMode);
    const [localEraseMode, setLocalEraseMode] = useState(initialEraseMode);
    const [rotationLocked, setRotationLocked] = useState(initialRotationLocked);

    // ✅ allow pan while locked when paint is OFF (Designer toggles this)
    const [panEnabled, setPanEnabledState] = useState(!initialPaintMode);
    const panEnabledRef = useRef(panEnabled);

    const paintModeRef = useRef(localPaintMode);
    const eraseModeRef = useRef(localEraseMode);
    const lockRef = useRef(rotationLocked);
    const activeColorRef = useRef(activeColor);
    const paintRef = useRef(paint);
    const paramsRef = useRef(safeParams);

    useEffect(() => {
      paintModeRef.current = localPaintMode;
    }, [localPaintMode]);

    useEffect(() => {
      eraseModeRef.current = localEraseMode;
    }, [localEraseMode]);

    useEffect(() => {
      lockRef.current = rotationLocked;
    }, [rotationLocked]);

    useEffect(() => {
      activeColorRef.current = activeColor;
    }, [activeColor]);

    useEffect(() => {
      paintRef.current = paint;
    }, [paint]);

    useEffect(() => {
      paramsRef.current = safeParams;
      spatialCellSizeRef.current = safeParams.centerSpacing ?? 7.5;
    }, [safeParams]);

    useEffect(() => {
      panEnabledRef.current = panEnabled;
    }, [panEnabled]);

    useEffect(() => { showScalesRef.current = showScales ?? false; }, [showScales]);
    useEffect(() => { scalesBehindRingsRef.current = scalesBehindRings ?? false; }, [scalesBehindRings]);

    // Selection highlight refs — held alongside scale meshes so we can update
    // highlight visibility without rebuilding the entire scale group.
    const scaleHighlightByKeyRef = useRef<Map<string, THREE.Group>>(new Map());
    const ringHighlightByKeyRef = useRef<Map<string, THREE.Mesh>>(new Map());

    // Persistent cache: dataURL → loaded THREE.Texture. The scale group is
    // rebuilt on every scales3D change (color edit, scale plane Z change),
    // and without this cache the per-scale image textures would be disposed
    // and re-loaded on every rebuild — async loads can't keep up while the
    // user drags a slider, so the image would flicker or never appear.
    // The cache survives rebuilds and is pruned when entries are no longer
    // referenced by the current scales3D.
    const scaleTextureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
    const highlightedScaleKeysRef = useRef<Set<string>>(
      highlightedScaleKeys ?? new Set(),
    );
    const highlightedRingKeysRef = useRef<Set<string>>(
      highlightedRingKeys ?? new Set(),
    );

    // Normalize "row-col" / "row,col" / "row|col" to one canonical form
    // so callers can use whichever separator their code already uses.
    const normalizeKey = (k: string) => k.replace(/[,|]/g, "-");
    const buildNormalizedSet = (s?: Set<string>) => {
      const out = new Set<string>();
      if (!s) return out;
      s.forEach((k) => out.add(normalizeKey(k)));
      return out;
    };

    const applyScaleHighlight = useCallback(() => {
      const sel = highlightedScaleKeysRef.current;
      scaleHighlightByKeyRef.current.forEach((grp, key) => {
        grp.visible = sel.has(key);
      });
    }, []);

    const applyRingHighlight = useCallback(() => {
      const sel = highlightedRingKeysRef.current;
      ringHighlightByKeyRef.current.forEach((mesh, key) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat) return;
        if (sel.has(key)) {
          mat.emissive = new THREE.Color("#22d3ee");
          mat.emissiveIntensity = 0.8;
        } else {
          mat.emissive = new THREE.Color("#000000");
          mat.emissiveIntensity = 0;
        }
        mat.needsUpdate = true;
      });
    }, []);

    useEffect(() => {
      highlightedScaleKeysRef.current = buildNormalizedSet(highlightedScaleKeys);
      applyScaleHighlight();
    }, [highlightedScaleKeys, applyScaleHighlight]);

    useEffect(() => {
      highlightedRingKeysRef.current = buildNormalizedSet(highlightedRingKeys);
      applyRingHighlight();
    }, [highlightedRingKeys, applyRingHighlight]);

    const initialZRef = useRef(240);
    const initialTargetRef = useRef(new THREE.Vector3(0, 0, 0));

    // ============================================================
    // Paint batching (prevents huge setState storms during drag)
    // ============================================================
    const pendingPaintRef = useRef<Map<string, string | null>>(new Map());
    const pendingRAFRef = useRef<number | null>(null);

    const flushPendingPaint = () => {
      if (pendingRAFRef.current != null) {
        cancelAnimationFrame(pendingRAFRef.current);
        pendingRAFRef.current = null;
      }

      if (pendingPaintRef.current.size === 0) return;

      const patch = new Map(pendingPaintRef.current);
      pendingPaintRef.current.clear();

      setPaint((prev) => {
        const next = new Map(prev);
        for (const [k, v] of patch.entries()) {
          next.set(k, v);
        }
        return next;
      });
    };

    const queuePaintPatch = (key: string, value: string | null) => {
      pendingPaintRef.current.set(key, value);

      if (pendingRAFRef.current == null) {
        pendingRAFRef.current = requestAnimationFrame(() => {
          pendingRAFRef.current = null;
          flushPendingPaint();
        });
      }
    };

    // ============================================================
    // Helper — apply current paint map to ring meshes
    // (optimized: no material.needsUpdate required for color changes)
    // ============================================================
    const applyPaintToMeshes = () => {
      const meshes = meshesRef.current;
      if (!meshes || meshes.length === 0) return;

      const defaultHex = normalizeColor6(paramsRef.current.ringColor || "#CCCCCC");

      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat) continue;

        const row = mesh.userData.row as number;
        const col = mesh.userData.col as number;
        const key = `${row},${col}`;

        const colorHex = normalizeColor6(
          (paintRef.current.get(key) as any) ??
            (mesh.userData?.color as any) ??
            defaultHex,
        );

        mat.color.set(colorHex);
      }
    };

    // ============================================================
    // Helper — reset all mesh colors to default (used by clearPaint)
    // ============================================================
    const resetMeshColorsToDefault = () => {
      const meshes = meshesRef.current;
      if (!meshes || meshes.length === 0) return;

      const defaultHex = normalizeColor6(paramsRef.current.ringColor || "#CCCCCC");
      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat) continue;
        mat.color.set(defaultHex);
      }
    };

    // ============================================================
    // Spatial index build (for accurate & fast nearest-ring picking)
    // ============================================================
    const rebuildSpatialIndexFromMeshes = () => {
      const meshes = meshesRef.current;
      const cs = Math.max(1e-6, spatialCellSizeRef.current || 7.5);
      const idx = new Map<string, number[]>();

      // Use mesh positions (already in scene coordinates)
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        const cx = Math.floor(m.position.x / cs);
        const cy = Math.floor(m.position.y / cs);
        const k = `${cx},${cy}`;
        const arr = idx.get(k);
        if (arr) arr.push(i);
        else idx.set(k, [i]);
      }

      spatialIndexRef.current = idx;
    };

    const findNearestMeshByWorldPoint = (wx: number, wy: number) => {
      const meshes = meshesRef.current;
      if (!meshes || meshes.length === 0) return null;

      const cs = Math.max(1e-6, spatialCellSizeRef.current || 7.5);
      const cx = Math.floor(wx / cs);
      const cy = Math.floor(wy / cs);

      let best: THREE.Mesh | null = null;
      let bestD2 = Infinity;

      // Search nearby cells (constant-time neighborhood)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = `${cx + dx},${cy + dy}`;
          const bucket = spatialIndexRef.current.get(k);
          if (!bucket) continue;

          for (const i of bucket) {
            const m = meshes[i];
            const dx2 = m.position.x - wx;
            const dy2 = m.position.y - wy;
            const d2 = dx2 * dx2 + dy2 * dy2;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = m;
            }
          }
        }
      }

      // Optional: ignore if very far from any ring center (prevents accidental paints in void)
      // Use a threshold tied to ring outer radius and spacing.
      const ID = paramsRef.current.innerDiameter ?? safeParams.innerDiameter;
      const WD = paramsRef.current.wireDiameter ?? safeParams.wireDiameter;
      const ringOuter = ID / 2 + WD; // approx outer radius
      const threshold = Math.max(ringOuter * 1.35, cs * 0.55);
      if (best && bestD2 <= threshold * threshold) return best;

      return null;
    };

    // ============================================================
    // ✅ Painting (mouse + finger) — FIXED FOR iOS SAFARI
    // - keeps existing mouse paint working
    // - adds touchAction:none + touch fallback so finger-drag paints reliably
    // ============================================================
    const raycasterRef = useRef(new THREE.Raycaster());
    const ndcRef = useRef(new THREE.Vector2());
    const isPaintingGestureRef = useRef(false);
    const lastKeyRef = useRef<string | null>(null);

    const applyPaintToMesh = (mesh: THREE.Mesh | null) => {
      if (!mesh) return;

      const row = mesh.userData.row as number;
      const col = mesh.userData.col as number;
      if (row == null || col == null) return;

      const key = `${row},${col}`;

      // Avoid hammering the same ring repeatedly during continuous move
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;

      const erase = eraseModeRef.current;
      const nextColor = erase ? null : normalizeColor6(activeColorRef.current);

      // Queue map patch (batched) + update mesh immediately for responsiveness
      queuePaintPatch(key, nextColor);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat?.color) {
        const fallback = normalizeColor6(paramsRef.current.ringColor || "#CCCCCC");
        mat.color.set(nextColor ?? fallback);
      }
    };

    const paintAtClient = (clientX: number, clientY: number) => {
      const cam = cameraRef.current;
      const renderer = rendererRef.current;
      const meshes = meshesRef.current;

      if (!paintModeRef.current) return;
      if (!cam || !renderer || !meshes || meshes.length === 0) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const y = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

      ndcRef.current.set(x, y);

      // First try raycast intersection against torus meshes (accurate on desktop)
      try {
        raycasterRef.current.setFromCamera(ndcRef.current, cam);
        const hits = raycasterRef.current.intersectObjects(meshes, false);
        if (hits && hits.length > 0) {
          applyPaintToMesh(hits[0].object as THREE.Mesh);
          return;
        }
      } catch {
        // fall through
      }

      // Fallback: project ray to Z=0 plane and pick nearest ring center (works great on iOS)
      try {
        raycasterRef.current.setFromCamera(ndcRef.current, cam);
        const ray = raycasterRef.current.ray;

        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const hit = new THREE.Vector3();
        const ok = ray.intersectPlane(plane, hit);
        if (ok) {
          const nearest = findNearestMeshByWorldPoint(hit.x, hit.y);
          applyPaintToMesh(nearest);
        }
      } catch {
        // ignore
      }
    };

    // ============================================================
    // Scene Initialization + Renderer Setup (single loop, iPad-safe + recovery)
    // ============================================================
    useEffect(() => {
      if (!mountRef.current) return;
      const mount = mountRef.current;

      // iOS: mount can be 0x0 on first paint; retry next frame
      if ((mount.clientWidth || 0) < 2 || (mount.clientHeight || 0) < 2) {
        const id = requestAnimationFrame(() => setGlEpoch((v) => v + 1));
        return () => cancelAnimationFrame(id);
      }

      // ---- hard stop anything previous ----
      contextLostRef.current = false;

      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // If there was an old renderer, dispose it and clear mount
      if (rendererRef.current) {
        try {
          rendererRef.current.dispose();
        } catch {}
        try {
          mount.replaceChildren();
        } catch {}
        rendererRef.current = null;
      }

      // ---- Scene ----
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(safeParams.bgColor);
      sceneRef.current = scene;

      // ---- Camera ----
      const camera = new THREE.PerspectiveCamera(
        30,
        Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
        0.01,
        100000,
      );
      camera.position.set(0, 0, initialZRef.current);
      camera.near = 0.01;
      camera.far = 100000;
      cameraRef.current = camera;

      // ---- Renderer (iPad/Safari hardened) ----
      const canvas = document.createElement("canvas");

      // ✅ Three r163+ requires WebGL2. Do NOT request WebGL1.
      const contextAttrs: WebGLContextAttributes = {
        alpha: true,
        antialias: false,
        depth: true,
        stencil: false,
        premultipliedAlpha: true, // ✅ more typical + stable for compositing
        preserveDrawingBuffer: false,
        powerPreference: "low-power",
        failIfMajorPerformanceCaveat: false,
      };

      // Context lost / restored hooks
      const onContextLost = (e: Event) => {
        try {
          (e as any).preventDefault?.();
        } catch {}
        console.warn("[RingRenderer] WebGL context lost");
        contextLostRef.current = true;

        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        try {
          controlsRef.current?.dispose?.();
        } catch {}
        try {
          rendererRef.current?.dispose?.();
        } catch {}

        setTimeout(() => {
          setGlEpoch((v) => v + 1);
        }, 150);
      };

      const onContextRestored = () => {
        console.warn("[RingRenderer] WebGL context restored");
      };

      // Attach listeners to *this canvas* (Three will use it)
      canvas.addEventListener("webglcontextlost", onContextLost as any, {
        passive: false,
      });
      canvas.addEventListener("webglcontextrestored", onContextRestored as any, {
        passive: false,
      });

      let gl: WebGL2RenderingContext | null = null;

      try {
        // ✅ WebGL2 ONLY (Three r163+)
        gl = canvas.getContext("webgl2", contextAttrs) as WebGL2RenderingContext | null;

        if (!gl) {
          console.error(
            "[RingRenderer] WebGL2 unavailable. Three r163+ requires WebGL2.",
          );
          return;
        }

        // early guard
        try {
          (gl as any).getContextAttributes?.();
        } catch (e) {
          console.error(
            "[RingRenderer] WebGL2 context invalid right after creation",
            e,
          );
          return;
        }
      } catch (e) {
        console.error("[RingRenderer] getContext threw", e);
        return;
      }

      let renderer: THREE.WebGLRenderer | null = null;

      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          context: gl,
          alpha: true,
          antialias: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false,
          precision: "mediump",
          powerPreference: "low-power",
        });
      } catch (e) {
        console.error("[RingRenderer] WebGLRenderer init failed", e);
        return;
      }

      renderer.setSize(
        Math.max(1, mount.clientWidth),
        Math.max(1, mount.clientHeight),
        false,
      );
      renderer.setClearColor(safeParams.bgColor, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      // ✅ Correct color pipeline
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      mount.appendChild(renderer.domElement);

      // ✅ iOS/Safari: critical for finger-drag painting (prevents scroll/zoom stealing move events)
      renderer.domElement.style.touchAction = "none";
      (renderer.domElement.style as any).webkitUserSelect = "none";
      (renderer.domElement.style as any).webkitTouchCallout = "none";

      rendererRef.current = renderer;

      // ---- Lights ----
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));

      const dir = new THREE.DirectionalLight(0xffffff, 1.15);
      dir.position.set(4, 6, 10);
      scene.add(dir);

      const rim = new THREE.DirectionalLight(0xffffff, 0.55);
      rim.position.set(-4, -6, -8);
      scene.add(rim);

      // ---- Controls ----
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.copy(initialTargetRef.current);

      // ✅ Sync OrbitControls mappings ONLY when state actually changes
      let lastSig = "";
      const syncControlsButtons = () => {
        const locked = lockRef.current;
        const panAllowed = panEnabledRef.current;
        const painting = paintModeRef.current;

        const sig = `${locked ? 1 : 0}|${panAllowed ? 1 : 0}|${painting ? 1 : 0}`;
        if (sig === lastSig) {
          controls.update();
          return;
        }
        lastSig = sig;

        controls.enableZoom = true;

        if (locked) {
          controls.enableRotate = false;
          controls.enablePan = panAllowed && !painting;

          controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          };

          controls.touches = {
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_PAN,
          };
        } else {
          controls.enableRotate = true;
          controls.enablePan = true;

          controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          };

          controls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
          };
        }

        controls.update();
      };

      syncControlsButtons();
      controlsRef.current = controls;

      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();

      // ============================================================
      // ✅ Pointer + Touch painting handlers (finger painting fix)
      // ============================================================
      const el = renderer.domElement;

      const onPointerDown = (e: PointerEvent) => {
        if (!paintModeRef.current) return;

        // capture so move continues even if pointer leaves element
        try {
          (e.target as any)?.setPointerCapture?.(e.pointerId);
        } catch {}

        isPaintingGestureRef.current = true;
        lastKeyRef.current = null;

        // prevent iOS gesture interference
        try {
          e.preventDefault();
        } catch {}
        try {
          e.stopPropagation();
        } catch {}

        paintAtClient(e.clientX, e.clientY);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!paintModeRef.current) return;
        if (!isPaintingGestureRef.current) return;

        try {
          e.preventDefault();
        } catch {}
        try {
          e.stopPropagation();
        } catch {}

        paintAtClient(e.clientX, e.clientY);
      };

      const endGesture = (e?: any) => {
        if (!isPaintingGestureRef.current) return;
        isPaintingGestureRef.current = false;
        lastKeyRef.current = null;
        flushPendingPaint();

        try {
          if (e?.pointerId != null) {
            (e.target as any)?.releasePointerCapture?.(e.pointerId);
          }
        } catch {}
      };

      const onPointerUp = (e: PointerEvent) => endGesture(e);
      const onPointerCancel = (e: PointerEvent) => endGesture(e);

      // Touch fallback for iOS Safari cases where pointermove is flaky
      const onTouchStart = (e: TouchEvent) => {
        if (!paintModeRef.current) return;
        if (!e.touches || e.touches.length === 0) return;

        isPaintingGestureRef.current = true;
        lastKeyRef.current = null;

        const t = e.touches[0];
        e.preventDefault();
        e.stopPropagation();
        paintAtClient(t.clientX, t.clientY);
      };

      const onTouchMove = (e: TouchEvent) => {
        if (!paintModeRef.current) return;
        if (!isPaintingGestureRef.current) return;
        if (!e.touches || e.touches.length === 0) return;

        const t = e.touches[0];
        e.preventDefault();
        e.stopPropagation();
        paintAtClient(t.clientX, t.clientY);
      };

      const onTouchEnd = (e: TouchEvent) => {
        if (!isPaintingGestureRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        endGesture();
      };

      // Important: passive:false so preventDefault works (iOS)
      el.addEventListener("pointerdown", onPointerDown, { passive: false });
      el.addEventListener("pointermove", onPointerMove, { passive: false });
      el.addEventListener("pointerup", onPointerUp, { passive: false });
      el.addEventListener("pointercancel", onPointerCancel, { passive: false });

      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd, { passive: false });
      el.addEventListener("touchcancel", onTouchEnd, { passive: false });

      // ---- Resize handling ----
      const onResize = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        renderer?.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };

      const ro = new ResizeObserver(onResize);
      ro.observe(mount);
      onResize();

      // ---- Render loop ----
      let alive = true;

      const animate = () => {
        if (!alive) return;
        if (contextLostRef.current) return;
        if (!renderer || !scene || !camera) return;

        // ✅ don't render after teardown / remount
        if (!rendererRef.current || rendererRef.current !== renderer) return;
        if (renderer.domElement.isConnected === false) return;

        rafRef.current = requestAnimationFrame(animate);

        syncControlsButtons();
        renderer.render(scene, camera);
      };
      animate();

      // ---- Cleanup ----
      return () => {
        alive = false;

        try {
          el.removeEventListener("pointerdown", onPointerDown as any);
          el.removeEventListener("pointermove", onPointerMove as any);
          el.removeEventListener("pointerup", onPointerUp as any);
          el.removeEventListener("pointercancel", onPointerCancel as any);

          el.removeEventListener("touchstart", onTouchStart as any);
          el.removeEventListener("touchmove", onTouchMove as any);
          el.removeEventListener("touchend", onTouchEnd as any);
          el.removeEventListener("touchcancel", onTouchEnd as any);
        } catch {}

        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        try {
          ro.disconnect();
        } catch {}

        try {
          controls.dispose();
        } catch {}

        try {
          canvas.removeEventListener("webglcontextlost", onContextLost as any);
          canvas.removeEventListener("webglcontextrestored", onContextRestored as any);
        } catch {}

        try {
          scene.clear();
        } catch {}

        try {
          renderer?.dispose?.();
        } catch {}

        try {
          mount.replaceChildren();
        } catch {}

        rendererRef.current = null;
        controlsRef.current = null;
        cameraRef.current = null;
        sceneRef.current = null;
        scaleGroupRef.current = null;
        scaleGeoCacheRef.current.forEach((g) => g.dispose());
        scaleGeoCacheRef.current.clear();
      };
    }, [safeParams.bgColor, glEpoch]);

    // ============================================================
    // External view-state sync (optional)
    // ============================================================
    const applyExternalCamera = React.useCallback(
      (vs: ExternalViewState | undefined) => {
        if (!vs) return;
        const cam = cameraRef.current;
        const ctr = controlsRef.current;
        if (!cam || !ctr) return;
        const zoom = Math.max(1e-6, vs.zoom);
        const dist = initialZRef.current / zoom;
        if (showScalesRef.current) {
          const tilt = scalesBehindRingsRef.current ? 0.08 : 0.22;
          cam.position.set(vs.panX, vs.panY + dist * Math.sin(tilt), dist * Math.cos(tilt));
        } else {
          cam.position.set(vs.panX, vs.panY, dist);
        }
        ctr.target.set(vs.panX, vs.panY, 0);
        // Tight near/far keeps depth buffer precision adequate for sub-mm Z differences
        cam.near = Math.max(0.1, dist * 0.005);
        cam.far = Math.max(10000, dist * 200);
        cam.lookAt(ctr.target);
        cam.updateProjectionMatrix();
        ctr.update();
      },
      [],
    );

    useEffect(() => {
      applyExternalCamera(externalViewState);
    }, [externalViewState, applyExternalCamera]);

    // Re-apply camera when scale tilt changes (showScales / scalesBehindRings)
    const externalViewStateRef = useRef(externalViewState);
    useEffect(() => { externalViewStateRef.current = externalViewState; }, [externalViewState]);
    useEffect(() => {
      applyExternalCamera(externalViewStateRef.current);
    }, [showScales, scalesBehindRings, applyExternalCamera]);

    // ============================================================
    // Geometry Build (Rings) — CHECKED-IN STYLE (non-instanced)
    // IMPORTANT: tilt is computed upstream; renderer never uses angleIn/out
    // ============================================================
    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) return;

      // ---------- Cleanup old group ----------
      if (groupRef.current) {
        try {
          groupRef.current.traverse((o: any) => {
            o.geometry?.dispose?.();
            if (Array.isArray(o.material)) {
              o.material.forEach((m: any) => m?.dispose?.());
            } else {
              o.material?.dispose?.();
            }
          });
        } catch {}
        try {
          scene.remove(groupRef.current);
        } catch {}
        meshesRef.current = [];
        meshByKeyRef.current = new Map();
        spatialIndexRef.current = new Map();
      }

      const group = new THREE.Group();
      groupRef.current = group;

      if (!Array.isArray(rings) || rings.length === 0) {
        scene.add(group);
        meshesRef.current = [];
        meshByKeyRef.current = new Map();
        spatialIndexRef.current = new Map();
        return;
      }

      // Geometry cache by ID/WD pair (saves memory when many rings share the same dimensions)
      const geomCache = new Map<string, THREE.TorusGeometry>();

      const meshes: THREE.Mesh[] = [];
      const meshByKey = new Map<string, THREE.Mesh>();

      const defaultHex = normalizeColor6(safeParams.ringColor || "#CCCCCC");

      rings.forEach((r) => {
        const ID = r.innerDiameter ?? safeParams.innerDiameter;
        const WD = r.wireDiameter ?? safeParams.wireDiameter;

        const ringRadius = ID / 2 + WD / 2;
        const tubeRadius = WD / 2;

        const gKey = `${ringRadius.toFixed(6)}_${tubeRadius.toFixed(6)}`;
        let geom = geomCache.get(gKey);
        if (!geom) {
          geom = new THREE.TorusGeometry(ringRadius, tubeRadius, 32, 64);
          geomCache.set(gKey, geom);
        }

        // Each ring needs its own material for per-ring color in non-instanced mode
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.85,
          roughness: 0.25,
        });

        const mesh = new THREE.Mesh(geom, mat);

        const tiltRad =
          typeof r.tiltRad === "number"
            ? r.tiltRad
            : THREE.MathUtils.degToRad(r.tilt ?? 0);

        // Note: Y inverted to match your app’s 2D coordinate convention
        mesh.position.set(r.x, -r.y, r.z ?? 0);
        mesh.rotation.set(0, tiltRad, Math.PI / 2);

        mesh.userData.row = r.row;
        mesh.userData.col = r.col;

        // ✅ Store initial color for fast rebuild without a full paint pass
        const key = `${r.row},${r.col}`;
        const painted = paintRef.current.get(key);
        const direct = (r as any)?.color;
        const colorHex = normalizeColor6(
          (painted as any) ?? (direct as any) ?? defaultHex,
        );
        mesh.userData.color = colorHex;
        mat.color.set(colorHex);

        group.add(mesh);
        meshes.push(mesh);

        meshByKey.set(key, mesh);

        // Chart labels preserved
        if ((r as any)._chartLabel) {
          const label = (r as any)._chartLabel as SpriteText;
          label.position.set(r.x, -r.y - WD * 4, r.z ?? 0);
          label.center.set(0.5, 1.2);
          (label.material as any).depthTest = false;
          (label.material as any).depthWrite = false;
          group.add(label);
        }
      });

      scene.add(group);
      meshesRef.current = meshes;
      meshByKeyRef.current = meshByKey;

      // Notify parent of grid aspect ratio so the overlay preview can match it
      if (onGridAspectChange && meshes.length > 0) {
        let mx = -Infinity, mnx = Infinity, my = -Infinity, mny = Infinity;
        for (const m of meshes) {
          if (m.position.x > mx) mx = m.position.x;
          if (m.position.x < mnx) mnx = m.position.x;
          if (m.position.y > my) my = m.position.y;
          if (m.position.y < mny) mny = m.position.y;
        }
        const gw = Math.max(1e-6, mx - mnx);
        const gh = Math.max(1e-6, my - mny);
        onGridAspectChange(gw / gh);
      }

      // Build spatial index for picking
      rebuildSpatialIndexFromMeshes();

      // Apply paint after building (only needed if external paint map differs)
      // (kept for correctness; cheap for small counts, and rebuilds are rare in non-instanced mode)
      applyPaintToMeshes();

      // ✅ Keep panel from “disappearing” after geometry rebuilds (unless externalViewState drives camera)
      const cam = cameraRef.current;
      const ctr = controlsRef.current;
      if (cam && ctr && !externalViewState) {
        fitCameraToObject(cam, ctr, group, 1.2);

        // Update resetView anchors to match what is actually visible now
        initialTargetRef.current.copy(ctr.target);
        initialZRef.current = cam.position.z;
      }

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      rings,
      safeParams.innerDiameter,
      safeParams.wireDiameter,
      safeParams.ringColor,
      safeParams.centerSpacing,
      externalViewState,
    ]);

    // ============================================================
    // Scale geometry build
    // ============================================================
    // Helper: dispose the current scale group's per-instance materials and
    // line geometries (mesh geometries are CACHED in scaleGeoCacheRef so do
    // not get disposed here). Used both on re-run and on unmount.
    const disposeScaleGroup = () => {
      const scene = sceneRef.current;
      const grp = scaleGroupRef.current;
      if (!grp) return;
      try {
        // Track seen geometries so shared geometries (e.g. highlight glow +
        // stroke share one BufferGeometry) don't get a double-dispose warning.
        const seenGeo = new Set<unknown>();
        grp.traverse((o: any) => {
          // Materials are unique per object — always dispose, including any
          // attached image-patch texture (mat.dispose() does NOT dispose its
          // textures by default).
          if (o.material) {
            const mats: any[] = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m: any) => {
              if (!m) return;
              if (m.map) m.map.dispose?.();
              m.dispose?.();
              // Flag so any in-flight async texture loader sees it's dead
              // and bails before re-attaching to a freed material.
              (m as any).disposed = true;
            });
          }
          // Geometries are disposed only when they're not the cached mesh
          // geometry (those live in scaleGeoCacheRef and are reused across
          // rebuilds). Cached geometries are attached to o.isMesh; line
          // geometries (outline / highlight / hole rim) are per-instance.
          if (!o.isMesh && o.geometry && !seenGeo.has(o.geometry)) {
            seenGeo.add(o.geometry);
            o.geometry.dispose?.();
          }
        });
      } catch {}
      try { scene?.remove(grp); } catch {}
      scaleGroupRef.current = null;
      scaleHighlightByKeyRef.current.clear();
    };

    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) return;

      // Clean up previous scale group before rebuilding.
      disposeScaleGroup();

      if (!showScales || !Array.isArray(scales3D) || scales3D.length === 0) return;

      // Clear geo cache if scale shape params changed (slider adjustment, new snapshot)
      if (scales3D.length > 0) {
        const s0 = scales3D[0];
        const shapeKey = `${s0.shape}|${s0.width.toFixed(2)}|${s0.height.toFixed(2)}|${s0.holeDiameter.toFixed(2)}|${s0.dropMm.toFixed(2)}`;
        if (shapeKey !== lastScaleShapeKeyRef.current) {
          scaleGeoCacheRef.current.forEach((g) => g.dispose());
          scaleGeoCacheRef.current.clear();
          lastScaleShapeKeyRef.current = shapeKey;
        }
      }

      const sg = new THREE.Group();
      const maxRow = scales3D.reduce((m, s) => Math.max(m, s.row), 0);
      const showEdges = scales3D.length <= 120; // skip edges for large counts (perf)

      // The stackedZ formula in FreeformChainmail2D creates negative planeZMm for bottom rows
      // (e.g. an 80-row fill puts the bottom row at planeZMm = -48mm, far below the rings).
      // rowZ alone (0.5mm for the bottom row) cannot compensate.
      // Compute a globalLift so the lowest scale always clears the ring tube tops (WD/2 + buffer).
      const wireRadius = (safeParams.wireDiameter ?? 2) / 2;
      const zFloor = wireRadius + 0.3; // must sit above ring-tube tops
      const minPivotZ = scales3D.reduce((m, s) => {
        const rowZ = (maxRow - s.row + 1) * 0.5;
        return Math.min(m, s.planeZMm + rowZ);
      }, Infinity);
      // The "lift above zFloor" safety exists to keep multi-row fills from
      // burying scales beneath the rings on FIRST render. But it also blocks
      // the user from intentionally putting scales BEHIND the rings (negative
      // scalePlaneZ). Skip the lift when the user has either toggled
      // "behind rings" OR explicitly sunk the plane below zero.
      const userWantsBehind =
        scalesBehindRingsRef.current ||
        scales3D.some((s) => (s.planeZMm ?? 0) < 0);
      const globalLift = userWantsBehind ? 0 : Math.max(0, zFloor - minPivotZ);

      scales3D.forEach((s, i) => {
        const hsi = Math.max(s.holeDiameter * 0.54, s.height * 0.15);
        const bodyOffY = -hsi + s.dropMm;

        // Flat ShapeGeometry (no extrusion) eliminates inner hole-wall triangles
        // that would bleed scale color into the hole area from the tilted camera.
        const geoKey = `${s.shape}|${s.width.toFixed(2)}|${s.height.toFixed(2)}|${s.holeDiameter.toFixed(2)}|${bodyOffY.toFixed(2)}`;
        let geo = scaleGeoCacheRef.current.get(geoKey);
        const shape = makeScaleShapeRR(s.shape, s.width, s.height, s.holeDiameter, bodyOffY);
        if (!geo) {
          geo = new THREE.ShapeGeometry(shape, 20);
          geo.computeVertexNormals();
          scaleGeoCacheRef.current.set(geoKey, geo);
        }

        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(s.color),
          side: THREE.DoubleSide,
          metalness: 0.08,
          roughness: 0.8,
          depthWrite: true,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });

        const rowZ = (maxRow - s.row + 1) * 0.5;
        const pivot = new THREE.Group();
        pivot.position.set(s.x, -s.y, s.planeZMm + rowZ + globalLift + i * 0.001);
        pivot.rotation.order = "YXZ";
        pivot.rotation.y = s.tiltRad ?? 0;
        pivot.rotation.x = -((s.tipLiftDeg ?? 0) * DEG_RR);

        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 20 + (maxRow - s.row);
        // Store params for 3D export (ExtrudeGeometry generation in export3dModel.ts)
        mesh.userData.scaleExportParams = {
          shape: s.shape,
          width: s.width,
          height: s.height,
          holeDia: s.holeDiameter,
          bodyOffY,
        };

        // ── Per-scale image patch → CanvasTexture map ───────────────────
        // When transferOverlayToRings runs with Image Fill on, it builds a
        // small canvas per target scale containing the image region that
        // maps to that scale's body footprint (with boundary inset and
        // averaged-colour frame baked in). We attach it as the material's
        // diffuse map so the image is painted onto the scale outline itself
        // — no separate "image plane riding above the scales".
        //
        // ShapeGeometry sets UVs to raw vertex (x, y) coordinates rather
        // than normalised [0,1], so we use the texture.offset/repeat
        // transform to remap the shape's BBox into the canvas.
        //
        // Textures live in a persistent cache keyed by data URL; they
        // survive scale-group rebuilds (triggered every time scales3D
        // changes — including the user dragging the Scale Plane Z slider).
        // Without the cache, async img loads can't keep up with rapid
        // rebuilds and the texture never settles.
        if (s.imagePatchUrl) {
          const pts = shape.getPoints(20);
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          const bbW = Math.max(1e-6, maxX - minX);
          const bbH = Math.max(1e-6, maxY - minY);

          const applyTex = (tex: THREE.Texture) => {
            // Each material instance needs its own texture transform; we
            // can't share offset/repeat across materials. Clone the cached
            // texture so its matrix is independent.
            const t = tex.clone();
            t.needsUpdate = true;
            t.wrapS = THREE.ClampToEdgeWrapping;
            t.wrapT = THREE.ClampToEdgeWrapping;
            t.minFilter = THREE.LinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.offset.set(-minX / bbW, -minY / bbH);
            t.repeat.set(1 / bbW, 1 / bbH);
            if ((mat as any).disposed) {
              t.dispose();
              return;
            }
            mat.map = t;
            mat.color = new THREE.Color(0xffffff);
            mat.needsUpdate = true;
          };

          const cached = scaleTextureCacheRef.current.get(s.imagePatchUrl);
          if (cached) {
            // Already loaded — apply synchronously so the user sees it on
            // this very frame (no flicker during slider drag).
            applyTex(cached);
          } else {
            const img = new Image();
            img.onload = () => {
              const tex = new THREE.Texture(img);
              tex.needsUpdate = true;
              // Cache the *master* texture; per-material clones above
              // share the underlying image data.
              scaleTextureCacheRef.current.set(s.imagePatchUrl!, tex);
              applyTex(tex);
            };
            img.onerror = () => {
              // Bad data URL — leave flat colour.
            };
            img.src = s.imagePatchUrl;
          }
        }
        pivot.add(mesh);

        if (showEdges) {
          const edgeMat = new THREE.LineBasicMaterial({ color: 0x234050, transparent: true, opacity: 0.98 });
          // ShapeGeometry has no hard edges between coplanar faces, so draw the outer
          // perimeter explicitly as a LineLoop instead of using EdgesGeometry.
          const outlinePts = shape.getPoints(20).map((p) => new THREE.Vector3(p.x, p.y, 0.008));
          if (outlinePts.length > 1) outlinePts.push(outlinePts[0].clone());
          const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts);
          const outline = new THREE.Line(outlineGeo, edgeMat);
          outline.renderOrder = mesh.renderOrder + 1;
          pivot.add(outline);
        }

        const rimF = makeHoleRimRR(s.holeDiameter / 2, 0.008, 0x1f4755);
        rimF.renderOrder = mesh.renderOrder + 2;
        pivot.add(rimF);

        const rimB = makeHoleRimRR(s.holeDiameter / 2, -0.008, 0x1f4755);
        rimB.renderOrder = mesh.renderOrder + 2;
        pivot.add(rimB);

        // Selection highlight: a bright cyan outline a hair above the scale,
        // plus a glow stroke a hair below. Hidden until applyScaleHighlight()
        // toggles visibility based on highlightedScaleKeys.
        const highlightGroup = new THREE.Group();
        highlightGroup.visible = false;
        const hlPts = shape.getPoints(28).map(
          (p) => new THREE.Vector3(p.x, p.y, 0.012),
        );
        if (hlPts.length > 1) hlPts.push(hlPts[0].clone());
        const hlGeo = new THREE.BufferGeometry().setFromPoints(hlPts);

        // Outer glow (wider, semi-transparent)
        const glowMat = new THREE.LineBasicMaterial({
          color: 0xfde047, // amber-yellow
          transparent: true,
          opacity: 0.55,
          linewidth: 3,
        });
        const glow = new THREE.Line(hlGeo, glowMat);
        glow.renderOrder = mesh.renderOrder + 5;
        highlightGroup.add(glow);

        // Sharp inner stroke (bright cyan)
        const strokeMat = new THREE.LineBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.98,
          linewidth: 2,
        });
        const stroke = new THREE.Line(hlGeo, strokeMat);
        stroke.renderOrder = mesh.renderOrder + 6;
        highlightGroup.add(stroke);

        pivot.add(highlightGroup);
        // Register under both possible key formats so callers using either
        // "row-col" or "row,col" work without coordination.
        scaleHighlightByKeyRef.current.set(`${s.row}-${s.col}`, highlightGroup);

        sg.add(pivot);
      });

      scaleGroupRef.current = sg;
      scene.add(sg);

      // Re-apply selection highlight visibility now that the highlight groups
      // exist (the per-prop effect above runs before this build does).
      applyScaleHighlight();

      // Prune the persistent texture cache: drop entries whose data URLs
      // are no longer referenced by any current scale (e.g. the user turned
      // Image Fill off, deleted scales, or re-transferred a different image
      // for the same scales). Disposes GPU memory promptly without dropping
      // textures we still need.
      const referencedUrls = new Set<string>();
      for (const s of scales3D) if (s.imagePatchUrl) referencedUrls.add(s.imagePatchUrl);
      for (const [url, tex] of scaleTextureCacheRef.current.entries()) {
        if (!referencedUrls.has(url)) {
          tex.dispose();
          scaleTextureCacheRef.current.delete(url);
        }
      }

      // Re-apply camera tilt now that scales are present
      applyExternalCamera(externalViewStateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scales3D, showScales, scalesBehindRings, glEpoch]);

    // On unmount: dispose the final scale group (the build effect above only
    // disposes on re-runs, so without this the last build leaks GPU memory).
    useEffect(() => {
      return () => {
        disposeScaleGroup();
        // Also drop every cached scale texture — the cache survives across
        // rebuilds but must go when the component unmounts.
        for (const tex of scaleTextureCacheRef.current.values()) {
          tex.dispose();
        }
        scaleTextureCacheRef.current.clear();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ============================================================
    // Keep mesh colors updated if paint changes (without rebuild)
    // ============================================================
    useEffect(() => {
      applyPaintToMeshes();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paint, safeParams.ringColor]);

    // ============================================================
    // Overlay application: sample overlay image and paint rings
    // - Adds TRUE tiling (repeat) via wrap01()
    // - Adds optional crop/window selection support (normalized UV crop rect)
    //   Expected optional fields on OverlayState (robust):
    //     cropU0/cropV0/cropU1/cropV1  in [0..1]   (or crop: {u0,v0,u1,v1})
    //     tile / tiled / repeat / tilingEnabled OR tileMode:"repeat"
    //     tileX/tileY (optional)
    // ============================================================

    type OverlaySample = { hex: string; alpha: number };

    type OverlaySampler = {
      key: string;
      sampleWorld: (wx: number, wy: number) => OverlaySample | null;
      sampleLogical: (lx: number, ly: number) => OverlaySample | null;
    };

    // ✅ Must be INSIDE the component (hooks)
    const overlaySamplerRef = useRef<OverlaySampler | null>(null);

    const getOverlayCropUV = (ov: any) => {
      // Accept either flat fields or nested crop object. Defaults to full image.
      const u0 =
        overlayGetNumeric(ov, ["cropU0", "u0"], NaN) ??
        overlayGetNumeric(ov?.crop, ["u0"], NaN);
      const v0 =
        overlayGetNumeric(ov, ["cropV0", "v0"], NaN) ??
        overlayGetNumeric(ov?.crop, ["v0"], NaN);
      const u1 =
        overlayGetNumeric(ov, ["cropU1", "u1"], NaN) ??
        overlayGetNumeric(ov?.crop, ["u1"], NaN);
      const v1 =
        overlayGetNumeric(ov, ["cropV1", "v1"], NaN) ??
        overlayGetNumeric(ov?.crop, ["v1"], NaN);

      const U0 = Number.isFinite(u0) ? clamp01(u0) : 0;
      const V0 = Number.isFinite(v0) ? clamp01(v0) : 0;
      const U1 = Number.isFinite(u1) ? clamp01(u1) : 1;
      const V1 = Number.isFinite(v1) ? clamp01(v1) : 1;

      // ensure ordering + non-zero size
      const uu0 = Math.min(U0, U1);
      const uu1 = Math.max(U0, U1);
      const vv0 = Math.min(V0, V1);
      const vv1 = Math.max(V0, V1);

      const w = Math.max(1e-6, uu1 - uu0);
      const h = Math.max(1e-6, vv1 - vv0);

      return { u0: uu0, v0: vv0, uW: w, vH: h };
    };

    const buildOverlaySampler = async (
      ov: OverlayState,
    ): Promise<OverlaySampler | null> => {
      if (!ov) return null;
      const meshes = meshesRef.current;
      if (!meshes || meshes.length === 0) return null;

      const src =
        overlayGetString(ov as any, ["dataUrl", "src", "url", "imageUrl"]) ?? null;
      if (!src) return null;

      const offsetX = overlayGetNumeric(ov as any, ["offsetX", "x", "panX"], 0);
      const offsetY = overlayGetNumeric(ov as any, ["offsetY", "y", "panY"], 0);
      const scale = overlayGetNumeric(ov as any, ["scale"], 1);
      const opacity = clamp01(overlayGetNumeric(ov as any, ["opacity"], 1));
      const rotation = overlayGetNumeric(ov as any, ["rotation"], 0);
      const isTiled =
        (overlayGetString(ov as any, ["repeat"], "none") ?? "none") === "tile";
      const patternScale = overlayGetNumeric(ov as any, ["patternScale"], 100);

      // Compute ring bounds in world space
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      for (const m of meshes) {
        minX = Math.min(minX, m.position.x);
        maxX = Math.max(maxX, m.position.x);
        minY = Math.min(minY, m.position.y);
        maxY = Math.max(maxY, m.position.y);
      }

      const worldW = Math.max(1e-6, maxX - minX);
      const worldH = Math.max(1e-6, maxY - minY);
      const worldCenterX = (minX + maxX) * 0.5;
      const worldCenterY = (minY + maxY) * 0.5;

      // Preview panel pixel dimensions — width is fixed (440px panel, 14px padding each side).
      // Height is derived from the ring grid's aspect ratio so the preview and transfer match.
      const PREVIEW_W = 412;
      const gridAspect = worldW / worldH;
      const PREVIEW_H = Math.max(120, Math.min(320, Math.round(PREVIEW_W / gridAspect)));

      // Cache key includes everything that affects the rendered preview
      const baseHex = normalizeColor6(paramsRef.current.ringColor || "#FFFFFF");
      const key = JSON.stringify({
        src, offsetX, offsetY, scale, rotation, opacity,
        isTiled, patternScale,
        bounds: [minX, maxX, minY, maxY],
        baseHex,
      });

      if (overlaySamplerRef.current?.key === key) return overlaySamplerRef.current;

      const img = await loadImage(src);
      const iW = img.naturalWidth || img.width;
      const iH = img.naturalHeight || img.height;
      // Height the image occupies in the preview at scale=1 (fills PREVIEW_W, height auto)
      const imageDisplayH = (PREVIEW_W * iH) / iW;
      const imgCanvasH = Math.max(1, Math.ceil(imageDisplayH));

      // Draw image at its natural display size (no zoom/pan/rotation).
      // We apply the inverse transform per-ring to find the correct image pixel.
      // This avoids transparent-pixel gaps that occur when the zoomed image
      // doesn't fill every part of a fixed preview canvas.
      const offCanvas = document.createElement("canvas");
      const offCtx = offCanvas.getContext("2d", {
        willReadFrequently: true,
      } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
      if (!offCtx) return null;

      let offData: Uint8ClampedArray;
      let offW: number;
      let offH: number;

      if (isTiled) {
        // Tile mode: render a tiled canvas matching the preview dimensions.
        // Tiles always cover the full canvas so no edge gaps are possible.
        offCanvas.width = PREVIEW_W;
        offCanvas.height = PREVIEW_H;
        offW = PREVIEW_W;
        offH = PREVIEW_H;
        const tilePx = Math.max(1, PREVIEW_W * (patternScale / 100));
        const tilePy = Math.max(1, tilePx * iH / iW);
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = Math.ceil(tilePx);
        tileCanvas.height = Math.ceil(tilePy);
        const tileCtx = tileCanvas.getContext("2d") as CanvasRenderingContext2D | null;
        if (tileCtx) {
          tileCtx.drawImage(img, 0, 0, tileCanvas.width, tileCanvas.height);
        }
        const pattern = offCtx.createPattern(tileCanvas, "repeat");
        if (pattern) {
          pattern.setTransform(new DOMMatrix().translate(offsetX, offsetY));
          offCtx.fillStyle = pattern;
        }
        offCtx.save();
        offCtx.translate(PREVIEW_W / 2, PREVIEW_H / 2);
        offCtx.rotate(rotation * (Math.PI / 180));
        offCtx.translate(-PREVIEW_W / 2, -PREVIEW_H / 2);
        offCtx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
        offCtx.restore();
        offData = offCtx.getImageData(0, 0, offW, offH).data;
      } else {
        // Non-tiled: the incoming image is a pre-baked preview snapshot (from ImageOverlayPanel).
        // scale=1, offset=0 by the time we get here; just draw it centered and sample linearly.
        offCanvas.width = PREVIEW_W;
        offCanvas.height = PREVIEW_H;
        offW = PREVIEW_W;
        offH = PREVIEW_H;

        offCtx.fillStyle = baseHex;
        offCtx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

        offCtx.save();
        offCtx.translate(PREVIEW_W / 2 + offsetX, PREVIEW_H / 2 + offsetY);
        offCtx.scale(scale, scale);
        offCtx.rotate(rotation * (Math.PI / 180));
        offCtx.drawImage(img, -PREVIEW_W / 2, -imageDisplayH / 2, PREVIEW_W, imageDisplayH);
        offCtx.restore();

        offData = offCtx.getImageData(0, 0, offW, offH).data;
      }

      // Precompute base blend colour
      const base = new THREE.Color(baseHex);
      const baseR = Math.round(base.r * 255);
      const baseG = Math.round(base.g * 255);
      const baseB = Math.round(base.b * 255);

      const sampleWorld = (wx: number, wy: number): OverlaySample | null => {
        const nxWorld = (wx - worldCenterX) / worldW;
        const nyWorld = (wy - worldCenterY) / worldH;

        let sx: number;
        let sy: number;

        if (isTiled) {
          // Tiled: canvas is PREVIEW_W × PREVIEW_H with full coverage
          sx = Math.floor(PREVIEW_W * (0.5 + nxWorld));
          sy = Math.floor(PREVIEW_H * (0.5 - nyWorld));
          sx = Math.max(0, Math.min(offW - 1, sx));
          sy = Math.max(0, Math.min(offH - 1, sy));
        } else {
          // Non-tiled WYSIWYG: offscreen canvas is PREVIEW_W × PREVIEW_H with the
          // same transform as the visual preview. Direct linear ring → canvas mapping.
          sx = Math.max(0, Math.min(offW - 1, Math.round(PREVIEW_W * (0.5 + nxWorld))));
          sy = Math.max(0, Math.min(offH - 1, Math.round(PREVIEW_H * (0.5 - nyWorld))));
        }

        const idx = (sy * offW + sx) * 4;
        const r = offData[idx];
        const g = offData[idx + 1];
        const b = offData[idx + 2];
        const a255 = offData[idx + 3];

        if (a255 <= 2) return null;

        const t = clamp01((a255 / 255) * opacity);
        const outR = Math.round(baseR * (1 - t) + r * t);
        const outG = Math.round(baseG * (1 - t) + g * t);
        const outB = Math.round(baseB * (1 - t) + b * t);

        return { hex: rgbToHex(outR, outG, outB), alpha: a255 };
      };

      // App logical coords use Y inverted vs mesh world Y
      const sampleLogical = (lx: number, ly: number) => sampleWorld(lx, -ly);

      const sampler: OverlaySampler = { key, sampleWorld, sampleLogical };
      overlaySamplerRef.current = sampler;
      return sampler;
    };

    const applyOverlayToRings = async (ov: OverlayState) => {
      const meshes = meshesRef.current;
      if (!meshes || meshes.length === 0) return;

      // Always rebuild the sampler on an explicit transfer — never use a cached one.
      overlaySamplerRef.current = null;
      const sampler = await buildOverlaySampler(ov);
      if (!sampler) return;

      setPaint((prev) => {
        const next = new Map(prev);

        for (const mesh of meshes) {
          const row = mesh.userData.row as number;
          const col = mesh.userData.col as number;
          if (row == null || col == null) continue;

          const key = `${row},${col}`;
          const wx = mesh.position.x;
          const wy = mesh.position.y;

          const sampled = sampler.sampleWorld(wx, wy);
          if (!sampled) continue;

          const c = normalizeColor6(sampled.hex);
          next.set(key, c);

          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat?.color?.set(c);
        }

        return next;
      });
    };

    // ============================================================
    // Imperative Handle
    // ============================================================
    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        if (!cameraRef.current) return;
        dollyCamera(cameraRef.current, controlsRef.current ?? undefined, 0.9);
      },

      zoomOut: () => {
        if (!cameraRef.current) return;
        dollyCamera(cameraRef.current, controlsRef.current ?? undefined, 1.1);
      },

      resetView: () => {
        const cam = cameraRef.current;
        const ctr = controlsRef.current;
        if (!cam || !ctr) return;

        cam.position.set(
          initialTargetRef.current.x,
          initialTargetRef.current.y,
          initialZRef.current,
        );
        ctr.target.copy(initialTargetRef.current);

        cam.lookAt(ctr.target);
        cam.updateProjectionMatrix();
        ctr.update();
      },

      toggleLock: () => {
        const next = !lockRef.current;
        setRotationLocked(next);
        lockRef.current = next;

        const ctr = controlsRef.current;
        if (ctr) ctr.update();
      },

      setPaintMode: (on: boolean) => {
        setLocalPaintMode(on);
        paintModeRef.current = on;
      },

      // ✅ IMPORTANT: this must set the REF used by OrbitControls sync
      setPanEnabled: (enabled: boolean) => {
        setPanEnabledState(enabled);
        panEnabledRef.current = enabled;
      },

      setEraseMode: (enabled: boolean) => {
        setLocalEraseMode(enabled);
        eraseModeRef.current = enabled;
      },

      toggleErase: () => {
        setLocalEraseMode((v) => {
          const next = !v;
          eraseModeRef.current = next;
          return next;
        });
      },

      clearPaint: () => {
        // clear any pending paint patches first
        try {
          pendingPaintRef.current.clear();
          if (pendingRAFRef.current != null) {
            cancelAnimationFrame(pendingRAFRef.current);
            pendingRAFRef.current = null;
          }
        } catch {}

        resetMeshColorsToDefault();
        setPaint(new Map());
      },

      lock2DView: () => {
        const cam = cameraRef.current;
        const ctr = controlsRef.current;
        if (!cam || !ctr) return;

        cam.position.set(
          initialTargetRef.current.x,
          initialTargetRef.current.y,
          initialZRef.current,
        );
        ctr.target.copy(initialTargetRef.current);

        cam.lookAt(ctr.target);
        cam.updateProjectionMatrix();
        ctr.update();

        setRotationLocked(true);
        lockRef.current = true;
      },

      forceLockRotation: (locked: boolean) => {
        setRotationLocked(locked);
        lockRef.current = locked;

        const ctr = controlsRef.current;
        if (ctr) ctr.update();
      },

      getState: () => ({
        paintMode: paintModeRef.current,
        eraseMode: eraseModeRef.current,
        rotationLocked: lockRef.current,
      }),

      getDomRect: () => {
        const dom = rendererRef.current?.domElement;
        return dom ? dom.getBoundingClientRect() : null;
      },

      getCameraZ: () => cameraRef.current?.position.z ?? initialZRef.current,
      getCamera: () => cameraRef.current ?? null,

      // ✅ Used by Freeform export thumbnail capture
      getCanvas: () => rendererRef.current?.domElement ?? null,

      renderNow: () => {
        const r = rendererRef.current;
        const s = sceneRef.current;
        const c = cameraRef.current;
        if (!r || !s || !c) return;
        try {
          r.render(s, c);
        } catch {}
      },

      // ✅ Used by 3D model export (GLB / STL)
      getExportGroups: () => ({
        rings: groupRef.current,
        scales: scaleGroupRef.current,
      }),

      applyOverlayToRings,
    }));

    // ============================================================
    // Render
    // ============================================================
    return (
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          backgroundColor: safeParams.bgColor,
          // ✅ iOS: critical so finger-drag generates continuous events
          touchAction: "none",
        }}
      />
    );
  },
);