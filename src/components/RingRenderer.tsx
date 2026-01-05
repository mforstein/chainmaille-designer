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
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import SpriteText from "three-spritetext";
import type { OverlayState } from "../components/ImageOverlayPanel";
import RingRendererInstanced from "./RingRendererInstanced";

// ============================================================
// Utility Constants & Conversions
// ============================================================
const INCH_TO_MM = 25.4;

// If rings are above this threshold, use instanced renderer.
// Tune this number if you want; 5k is a safe default for torus-per-mesh.
const LARGE_THRESHOLD = 5000;

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
};

// ============================================================
// Camera Dolly Utility
// ============================================================
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

  // IMPORTANT: do NOT put hooks behind conditionals. We delegate to two different components.
  if (shouldUseInstanced) {
    return (
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
        <RingRendererInstanced
          {...(props as any)}
          ref={ref as any}
          // Instanced renderer should manage internally using the same props.
        />
      </RingRendererErrorBoundary>
    );
  }

  return <RingRendererNonInstanced {...props} ref={ref} />;
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
    },
    ref,
  ) {
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
    // Scene Initialization + Renderer Setup (single loop, safe scope)
    // ============================================================
    useEffect(() => {
      if (!mountRef.current) return;
      const mount = mountRef.current;

      // If there was an old renderer, dispose it and clear mount
      if (rendererRef.current) {
        try {
          rendererRef.current.dispose();
        } catch {}
        try {
          mount.replaceChildren();
        } catch {}
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(safeParams.bgColor);
      sceneRef.current = scene;

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

      // Create renderer (webgl2 if available)
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", {
        antialias: true,
        alpha: false,
        depth: true,
        powerPreference: "high-performance",
      }) as WebGL2RenderingContext | null;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl ?? undefined,
        antialias: true,
        precision: "mediump",
        powerPreference: "high-performance",
      });

      renderer.setSize(
        Math.max(1, mount.clientWidth),
        Math.max(1, mount.clientHeight),
      );
      renderer.setClearColor(safeParams.bgColor, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      // ✅ Correct color pipeline
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      mount.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));

      const dir = new THREE.DirectionalLight(0xffffff, 1.15);
      dir.position.set(4, 6, 10);
      scene.add(dir);

      const rim = new THREE.DirectionalLight(0xffffff, 0.55);
      rim.position.set(-4, -6, -8);
      scene.add(rim);

      // Controls
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

        const sig = `${locked ? 1 : 0}|${panAllowed ? 1 : 0}|${
          painting ? 1 : 0
        }`;
        if (sig === lastSig) {
          // Still need damping updates
          controls.update();
          return;
        }
        lastSig = sig;

        // Always allow zoom
        controls.enableZoom = true;

        if (locked) {
          // 🔒 LOCKED VIEW (2D)
          controls.enableRotate = false;

          // ✅ Pan allowed when paint is OFF and panEnabled is true
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
          // 🔓 UNLOCKED (3D)
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

      // Resize handling (container-aware)
      const onResize = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };

      const ro = new ResizeObserver(onResize);
      ro.observe(mount);
      onResize();

      // ============================================================
      // Pointer interaction
      // ============================================================
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let isPainting = false;

      // For skipping redundant paint on drag
      const lastPaintKeyRef = { current: "" };

      const computeWorldPointOnZ0 = (clientX: number, clientY: number) => {
        const cam = cameraRef.current;
        const rend = rendererRef.current;
        if (!cam || !rend) return null;

        const rect = rend.domElement.getBoundingClientRect();
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(ndc, cam);

        const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const worldPoint = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(planeZ, worldPoint);
        if (!hit) return null;

        return worldPoint;
      };

      const emitWorldClick = (clientX: number, clientY: number) => {
        const worldPoint = computeWorldPointOnZ0(clientX, clientY);
        if (!worldPoint) return null;

        // Note: we invert Y for your upstream coordinate convention
        window.dispatchEvent(
          new CustomEvent("ring-click", {
            detail: {
              x: worldPoint.x,
              y: -worldPoint.y,
            },
          }),
        );

        return worldPoint;
      };

      const pickMeshAt = (clientX: number, clientY: number) => {
        const cam = cameraRef.current;
        const rend = rendererRef.current;
        if (!cam || !rend) return null;

        const rect = rend.domElement.getBoundingClientRect();
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, cam);

        // First try a true geometry hit
        const hits = raycaster.intersectObjects(meshesRef.current, false);
        if (hits.length > 0) return hits[0].object as THREE.Mesh;

        // If we missed (common when clicking the torus hole), pick nearest center on Z=0 plane
        const wp = computeWorldPointOnZ0(clientX, clientY);
        if (!wp) return null;

        return findNearestMeshByWorldPoint(wp.x, wp.y);
      };

      const applyPaintToMesh = (mesh: THREE.Mesh) => {
        const row = mesh.userData.row as number;
        const col = mesh.userData.col as number;
        if (row == null || col == null) return;

        const key = `${row},${col}`;
        if (lastPaintKeyRef.current === key) return;
        lastPaintKeyRef.current = key;

        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat) return;

        if (eraseModeRef.current) {
          // "null" means revert to default in your paint system
          const def = normalizeColor6(paramsRef.current.ringColor || "#CCCCCC");
          mat.color.set(def);
          queuePaintPatch(key, null);
        } else {
          const c = normalizeColor6(
            activeColorRef.current || paramsRef.current.ringColor || "#CCCCCC",
          );
          mat.color.set(c);
          queuePaintPatch(key, c);
        }
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;

        // Always emit click coords (even if no ring hit)
        emitWorldClick(e.clientX, e.clientY);

        // Only paint when locked + paint mode enabled
        if (!lockRef.current) return;
        if (!paintModeRef.current) return;

        // Prevent OrbitControls from interpreting the drag as a pan
        e.preventDefault();

        isPainting = true;
        lastPaintKeyRef.current = "";

        try {
          (renderer.domElement as any).setPointerCapture?.(e.pointerId);
        } catch {}

        const mesh = pickMeshAt(e.clientX, e.clientY);
        if (mesh) applyPaintToMesh(mesh);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isPainting) return;
        if (!lockRef.current) return;
        if (!paintModeRef.current) return;

        e.preventDefault();

        const mesh = pickMeshAt(e.clientX, e.clientY);
        if (mesh) applyPaintToMesh(mesh);
      };

      const onPointerUp = (e: PointerEvent) => {
        isPainting = false;
        lastPaintKeyRef.current = "";
        try {
          (renderer.domElement as any).releasePointerCapture?.(e.pointerId);
        } catch {}

        // Flush batched paint immediately at end of stroke
        flushPendingPaint();
      };

      // IMPORTANT: passive:false stops Chrome's "Unable to preventDefault inside passive..." spam
      renderer.domElement.addEventListener("pointerdown", onPointerDown, {
        passive: false,
      });
      renderer.domElement.addEventListener("pointermove", onPointerMove, {
        passive: false,
      });
      renderer.domElement.addEventListener("pointerup", onPointerUp, {
        passive: false,
      });
      renderer.domElement.addEventListener("pointerleave", onPointerUp, {
        passive: false,
      });

      // Animate loop (continuous; very light when static)
      let alive = true;
      const animate = () => {
        if (!alive) return;
        requestAnimationFrame(animate);

        // Keep OrbitControls mapping in sync with lock/paint/pan states
        syncControlsButtons();

        renderer.render(scene, camera);
      };
      animate();

      // Cleanup
      return () => {
        alive = false;

        // Flush pending paint to avoid losing last stroke on unmount
        try {
          flushPendingPaint();
        } catch {}

        try {
          ro.disconnect();
        } catch {}

        try {
          renderer.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer.domElement.removeEventListener("pointermove", onPointerMove);
          renderer.domElement.removeEventListener("pointerup", onPointerUp);
          renderer.domElement.removeEventListener(
            "pointerleave",
            onPointerUp,
          );
        } catch {}

        try {
          controls.dispose();
        } catch {}

        try {
          // Dispose meshes/materials
          if (groupRef.current) {
            groupRef.current.traverse((o: any) => {
              o.geometry?.dispose?.();
              if (Array.isArray(o.material)) {
                o.material.forEach((m: any) => m?.dispose?.());
              } else {
                o.material?.dispose?.();
              }
            });
          }
        } catch {}

        try {
          scene.clear();
        } catch {}

        try {
          renderer.dispose();
        } catch {}

        try {
          mount.replaceChildren();
        } catch {}
      };
    }, [safeParams.bgColor]);

    // ============================================================
    // External view-state sync (optional)
    // ============================================================
    useEffect(() => {
      if (!externalViewState) return;
      const cam = cameraRef.current;
      const ctr = controlsRef.current;
      if (!cam || !ctr) return;

      const zoom = Math.max(1e-6, externalViewState.zoom);
      const z = initialZRef.current / zoom;

      cam.position.set(externalViewState.panX, externalViewState.panY, z);
      ctr.target.set(externalViewState.panX, externalViewState.panY, 0);

      cam.near = 0.01;
      cam.far = 100000;
      cam.lookAt(ctr.target);
      cam.updateProjectionMatrix();
      ctr.update();
    }, [externalViewState]);

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

  // --- tiling flags (robust) ---
  const tileAny =
    overlayGetBool(
      ov as any,
      ["tile", "tiled", "repeat", "tilingEnabled"],
      false,
    ) ||
    (overlayGetString(ov as any, ["tileMode", "tiling"], "") || "")
      .toLowerCase()
      .includes("repeat");

  const tileX = overlayGetBool(ov as any, ["tileX", "repeatX"], tileAny);
  const tileY = overlayGetBool(ov as any, ["tileY", "repeatY"], tileAny);

  // --- optional explicit world size ---
  const explicitW = overlayGetNumeric(
    ov as any,
    ["worldWidth", "widthWorld"],
    NaN,
  );
  const explicitH = overlayGetNumeric(
    ov as any,
    ["worldHeight", "heightWorld"],
    NaN,
  );

  // --- crop rect in normalized UV ---
  const crop = getOverlayCropUV(ov as any);

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

  const worldW =
    Number.isFinite(explicitW) && explicitW > 0
      ? explicitW
      : Math.max(1e-6, maxX - minX);
  const worldH =
    Number.isFinite(explicitH) && explicitH > 0
      ? explicitH
      : Math.max(1e-6, maxY - minY);

  const cx = (minX + maxX) * 0.5 + offsetX;
  const cy = (minY + maxY) * 0.5 + offsetY;

  const invScale = 1 / Math.max(1e-6, scale);

  // Cache key includes everything that affects mapping
  const baseHex = normalizeColor6(paramsRef.current.ringColor || "#FFFFFF");
  const key = JSON.stringify({
    src,
    offsetX,
    offsetY,
    scale,
    opacity,
    explicitW: Number.isFinite(explicitW) ? explicitW : null,
    explicitH: Number.isFinite(explicitH) ? explicitH : null,
    tileX,
    tileY,
    crop,
    bounds: [minX, maxX, minY, maxY],
    baseHex,
  });

  if (overlaySamplerRef.current?.key === key) return overlaySamplerRef.current;

  // Decode image once
  const img = await loadImage(src);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext(
  "2d",
  { willReadFrequently: true } as CanvasRenderingContext2DSettings,
) as CanvasRenderingContext2D | null;
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Precompute base blend color
  const base = new THREE.Color(baseHex);
  const baseR = Math.round(base.r * 255);
  const baseG = Math.round(base.g * 255);
  const baseB = Math.round(base.b * 255);

  const sampleWorld = (wx: number, wy: number): OverlaySample | null => {
    // world -> normalized in [0..1] (before crop)
    let nx = ((wx - cx) / worldW) * invScale + 0.5;
    let ny = ((wy - cy) / worldH) * invScale + 0.5;

    // ✅ tiling: wrap first (if enabled), otherwise reject
    if (tileX) nx = wrap01(nx);
    if (tileY) ny = wrap01(ny);

    if (!tileX && (nx < 0 || nx > 1)) return null;
    if (!tileY && (ny < 0 || ny > 1)) return null;

    // map into crop window (repeat happens within the crop window)
    // u = crop.u0 + nx * crop.uW
    // v = crop.v0 + ny * crop.vH
    let u = crop.u0 + nx * crop.uW;
    let v = crop.v0 + ny * crop.vH;

    // If tiled, allow wrapping inside crop via wrap01 around crop span:
    // (u - u0)/uW is periodic when tiled
    if (tileX) u = crop.u0 + wrap01((u - crop.u0) / crop.uW) * crop.uW;
    if (tileY) v = crop.v0 + wrap01((v - crop.v0) / crop.vH) * crop.vH;

    // Non-tiled: clamp to crop window bounds
    if (!tileX) u = crop.u0 + clamp01((u - crop.u0) / crop.uW) * crop.uW;
    if (!tileY) v = crop.v0 + clamp01((v - crop.v0) / crop.vH) * crop.vH;

    // UV -> pixel
    let px = Math.floor(u * w);
    let py = Math.floor((1 - v) * h);

    // clamp edge case (u==1 or v==1)
    if (px === w) px = w - 1;
    if (py === h) py = h - 1;
    if (px < 0 || px >= w || py < 0 || py >= h) return null;

    const idx = (py * w + px) * 4;
    const r = data[idx + 0];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a255 = data[idx + 3];

    if (a255 <= 2) return null; // transparent

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
        }}
      />
    );
  },
);