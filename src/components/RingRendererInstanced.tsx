// ============================================================
// File: src/components/RingRendererInstanced.tsx  (DROP-IN FULL FILE)
// ============================================================

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { OverlayState } from "../components/ImageOverlayPanel";
import type {
  RingRendererHandle,
  PaintMap,
  ExternalViewState,
  Ring as RingBase,
  RenderParams,
} from "./RingRenderer";

import {
  calibrationUpdatedEventName,
  loadProfiles,
  getActiveProfile,
  getCorrectedHexForLargeCount,
} from "../utils/colorCalibration";
import type { ColorCalibrationProfile } from "../utils/colorCalibration";
// ============================================================
// Constants
// ============================================================
const LARGE_COUNT_THRESHOLD = 5000;

// Fallback defaults (only used if no saved calibration profile exists)
const FALLBACK_LARGE_GAIN = 0.66;
const FALLBACK_LARGE_GAMMA = 1.18;

// ============================================================
// Color helpers
// ============================================================
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
type OverlaySample = { hex: string; alpha: number };
type OverlaySampler = {
  key: string;
  sampleWorld: (wx: number, wy: number) => OverlaySample | null;
  sampleLogical: (lx: number, ly: number) => OverlaySample | null;
};


// ============================================================
// Camera dolly utility
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
// Fit camera to bounds of ring centers
// ============================================================
function fitCameraToBounds(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  padding = 1.15,
) {
  const { minX, maxX, minY, maxY } = bounds;

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

  const sizeX = Math.max(1e-6, maxX - minX);
  const sizeY = Math.max(1e-6, maxY - minY);
  const maxDim = Math.max(sizeX, sizeY);

  const center = new THREE.Vector3(
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    0,
  );

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
// Types
// ============================================================
export type InstancedRing = RingBase & {
  row: number;
  col: number;
  x: number;
  y: number;
  z?: number;
  tilt?: number;
  tiltRad?: number;
  innerDiameter?: number;
  wireDiameter?: number;
};

type Props = {
  rings: InstancedRing[];
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

// ============================================================
// FIX: Instancing color in Three requires USE_COLOR + a valid `color` attribute.
// If material.vertexColors=true but geometry has no `color`, the shader reads 0,0,0 => BLACK.
// We attach a per-vertex `color` attribute filled with 1,1,1 so instanceColor works.
// ============================================================
function ensureWhiteVertexColors(geom: THREE.BufferGeometry) {
  const existing = geom.getAttribute("color") as THREE.BufferAttribute | undefined;
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return;

  const neededCount = pos.count;
  if (existing && existing.count === neededCount && existing.itemSize === 3) return;

  const arr = new Float32Array(neededCount * 3);
  arr.fill(1);
  geom.setAttribute("color", new THREE.BufferAttribute(arr, 3));
}

// ============================================================
// Large-count fallback match (ONLY affects rendering, not stored paint)
// ============================================================
function applyLargeCountColorMatch(inputHex: string, count: number) {
  const h = normalizeColor6(inputHex);
  if (count <= LARGE_COUNT_THRESHOLD) return h;

  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;

  const corr = (v: number) => {
    const x = Math.max(0, Math.min(1, v * FALLBACK_LARGE_GAIN));
    return Math.max(0, Math.min(1, Math.pow(x, FALLBACK_LARGE_GAMMA)));
  };

  const rr = Math.round(corr(r) * 255).toString(16).padStart(2, "0");
  const gg = Math.round(corr(g) * 255).toString(16).padStart(2, "0");
  const bb = Math.round(corr(b) * 255).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

// ============================================================
// Renderer
// ============================================================
const RingRendererInstanced = forwardRef<RingRendererHandle, Props>(
  function RingRendererInstanced(
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
    // Safe params snapshot (defensive)
    // ----------------------------
    const safeParams = useMemo(
      () => ({
        rows: params?.rows ?? 1,
        cols: params?.cols ?? 1,
        innerDiameter: params?.innerDiameter ?? 6,
        wireDiameter: params?.wireDiameter ?? 1,
        ringColor: params?.ringColor ?? "#CCCCCC",
        bgColor: params?.bgColor ?? "#0F1115",
        centerSpacing: params?.centerSpacing ?? 7.5,
      }),
      [
        params?.rows,
        params?.cols,
        params?.innerDiameter,
        params?.wireDiameter,
        params?.ringColor,
        params?.bgColor,
        params?.centerSpacing,
      ],
    );

    const safeParamsRef = useRef(safeParams);
    useEffect(() => {
      safeParamsRef.current = safeParams;
    }, [safeParams]);

    // Total ring count (used for the >5000 color-match behavior)
    const totalCountRef = useRef<number>(Array.isArray(rings) ? rings.length : 0);
    useEffect(() => {
      totalCountRef.current = Array.isArray(rings) ? rings.length : 0;
    }, [rings]);

// ----------------------------
// Calibration profile: hot ref + tick to force reapply
// ----------------------------
const calibrationProfileRef = useRef<ColorCalibrationProfile | null>(null);
const [calibrationTick, setCalibrationTick] = useState(0);

useEffect(() => {
  const refresh = () => {
    try {
      calibrationProfileRef.current = getActiveProfile(loadProfiles());
    } catch {
      calibrationProfileRef.current = null;
    }
    // Force a reapply of render colors immediately
    setCalibrationTick((v) => v + 1);
  };

  refresh();

  window.addEventListener(calibrationUpdatedEventName(), refresh);
  window.addEventListener("storage", refresh);

  return () => {
    window.removeEventListener(calibrationUpdatedEventName(), refresh);
    window.removeEventListener("storage", refresh);
  };
}, []);

    function ensureInstanceColor(
      inst: THREE.InstancedMesh,
      count: number,
    ): asserts inst is THREE.InstancedMesh & {
      instanceColor: THREE.InstancedBufferAttribute;
    } {
      if (!inst.instanceColor || inst.instanceColor.count !== count) {
        inst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(count * 3),
          3,
        );
        inst.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
    }

    // ----------------------------
    // Refs
    // ----------------------------
    const mountRef = useRef<HTMLDivElement | null>(null);

    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);

    // ✅ env map refs (fixes build errors + ensures cleanup)
    const pmremRef = useRef<THREE.PMREMGenerator | null>(null);
    const envTexRef = useRef<THREE.Texture | null>(null);

    // Instanced groups
    type GroupMesh = {
      key: string;
      mesh: THREE.InstancedMesh;
      geom: THREE.TorusGeometry;
      mat: THREE.MeshStandardMaterial;
      count: number;
      ringKeys: string[];
    };

    const groupsRef = useRef<GroupMesh[]>([]);
    const instanceLookupRef = useRef<Map<string, { g: number; i: number }>>(
      new Map(),
    );
    const ringCenterRef = useRef<Map<string, { x: number; y: number }>>(
      new Map(),
    );

    // Spatial hash
    const spatialIndexRef = useRef<Map<string, string[]>>(new Map());
    const spatialCellSizeRef = useRef<number>(safeParams.centerSpacing);

    // Modes
    const [localPaintMode, setLocalPaintMode] = useState(initialPaintMode);
    const [localEraseMode, setLocalEraseMode] = useState(initialEraseMode);
    const [rotationLocked, setRotationLocked] = useState(initialRotationLocked);

    const [panEnabled, setPanEnabledState] = useState(!initialPaintMode);
    const panEnabledRef = useRef(panEnabled);

    const paintModeRef = useRef(localPaintMode);
    const eraseModeRef = useRef(localEraseMode);
    const lockRef = useRef(rotationLocked);
    const activeColorRef = useRef(activeColor);
    const paintRef = useRef(paint);

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
      panEnabledRef.current = panEnabled;
    }, [panEnabled]);

    useEffect(() => {
      spatialCellSizeRef.current = safeParams.centerSpacing ?? 7.5;
    }, [safeParams.centerSpacing]);

    const initialZRef = useRef(240);
    const initialTargetRef = useRef(new THREE.Vector3(0, 0, 0));

    // ------------------------------------------------------------
    // Paint batching
    // ------------------------------------------------------------
    const pendingPaintRef = useRef<Map<string, string | null>>(new Map());
    const pendingRAFRef = useRef<number | null>(null);

    const flushPendingPaint = useCallback(() => {
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
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      });
    }, [setPaint]);

    const queuePaintPatch = useCallback(
      (key: string, value: string | null) => {
        pendingPaintRef.current.set(key, value);
        if (pendingRAFRef.current == null) {
          pendingRAFRef.current = requestAnimationFrame(() => {
            pendingRAFRef.current = null;
            flushPendingPaint();
          });
        }
      },
      [flushPendingPaint],
    );

    // ------------------------------------------------------------
    // Color cache + incremental paint application (FAST + correct)
    // ------------------------------------------------------------
    const colorCacheRef = useRef<Map<string, THREE.Color>>(new Map());

    // Cache expects a normalized 6-hex string.
    const getColor = (hex: string) => {
      const norm = normalizeColor6(hex).toLowerCase();
      const hit = colorCacheRef.current.get(norm);
      if (hit) return hit;
      const c = new THREE.Color(norm);
      colorCacheRef.current.set(norm, c);
      return c;
    };

    const prevPaintRef = useRef<PaintMap>(new Map());

    /**
     * IMPORTANT:
     * - We apply the >5000 correction ONLY to the RENDERED color.
     * - We DO NOT change what gets stored in paint map.
     */
    const setInstanceColorByKey = useCallback(
      (ringKey: string, hexOrNull: string | null) => {
        const lookup = instanceLookupRef.current.get(ringKey);
        if (!lookup) return;

        const g = groupsRef.current[lookup.g];
        if (!g) return;

        const inst = g.mesh;
        const idx = lookup.i;

        ensureInstanceColor(inst, g.count);
        const attr = inst.instanceColor;

        const baseHexRaw = safeParamsRef.current.ringColor || "#CCCCCC";
        const rawHex = hexOrNull ?? baseHexRaw;

        // Prefer profile correction; fallback to simple gain/gamma
        const profile = calibrationProfileRef.current;
        const renderHex = profile
          ? getCorrectedHexForLargeCount(
              rawHex,
              totalCountRef.current,
              LARGE_COUNT_THRESHOLD,
              profile,
            )
          : applyLargeCountColorMatch(rawHex, totalCountRef.current);

        const c = getColor(renderHex);

        attr.setXYZ(idx, c.r, c.g, c.b);
        attr.needsUpdate = true;
      },
      [],
    );

    const applyPaintDiff = useCallback(() => {
      const nextPaint = paintRef.current;
      const prevPaint = prevPaintRef.current;

      const changed = new Set<string>();

      for (const k of prevPaint.keys()) {
        if (!nextPaint.has(k)) changed.add(k);
      }
      for (const [k, v] of nextPaint.entries()) {
        const pv = prevPaint.get(k);
        if (pv !== v) changed.add(k);
      }

      if (changed.size === 0) return;

      for (const k of changed) {
        const v = nextPaint.get(k) ?? null;
        setInstanceColorByKey(k, v);
      }

      prevPaintRef.current = new Map(nextPaint);
    }, [setInstanceColorByKey]);

    // ------------------------------------------------------------
    // Re-apply all colors when calibration changes
    // ------------------------------------------------------------
    useEffect(() => {
      if (!groupsRef.current.length) return;

      // Reapply paint (and base color for unpainted)
      for (const g of groupsRef.current) {
        for (const key of g.ringKeys) {
          const v = paintRef.current.get(key) ?? null;
          setInstanceColorByKey(key, v);
        }
      }
    }, [calibrationTick, setInstanceColorByKey]);

    // ------------------------------------------------------------
    // Build spatial index
    // ------------------------------------------------------------
    const rebuildSpatialIndex = useCallback(() => {
      const cs = Math.max(1e-6, spatialCellSizeRef.current || 7.5);
      const idx = new Map<string, string[]>();

      for (const [k, p] of ringCenterRef.current.entries()) {
        const cx = Math.floor(p.x / cs);
        const cy = Math.floor(p.y / cs);
        const cellKey = `${cx},${cy}`;
        const arr = idx.get(cellKey);
        if (arr) arr.push(k);
        else idx.set(cellKey, [k]);
      }

      spatialIndexRef.current = idx;
    }, []);

    const findNearestRingKeyByWorldPoint = useCallback((wx: number, wy: number) => {
      const cs = Math.max(1e-6, spatialCellSizeRef.current || 7.5);
      const cx = Math.floor(wx / cs);
      const cy = Math.floor(wy / cs);

      let bestKey: string | null = null;
      let bestD2 = Infinity;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cellKey = `${cx + dx},${cy + dy}`;
          const bucket = spatialIndexRef.current.get(cellKey);
          if (!bucket) continue;

          for (const rk of bucket) {
            const p = ringCenterRef.current.get(rk);
            if (!p) continue;
            const dx2 = p.x - wx;
            const dy2 = p.y - wy;
            const d2 = dx2 * dx2 + dy2 * dy2;
            if (d2 < bestD2) {
              bestD2 = d2;
              bestKey = rk;
            }
          }
        }
      }

      const ID = safeParamsRef.current.innerDiameter;
      const WD = safeParamsRef.current.wireDiameter;
      const ringOuter = ID / 2 + WD;
      const threshold = Math.max(ringOuter * 1.35, cs * 0.55);

      if (bestKey && bestD2 <= threshold * threshold) return bestKey;
      return null;
    }, []);

    // ------------------------------------------------------------
    // Scene init (ONCE) + renderer lifecycle
    // ------------------------------------------------------------
    const rafIdRef = useRef<number | null>(null);

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      if (rendererRef.current) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(safeParamsRef.current.bgColor);
      sceneRef.current = scene;

      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);

      const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 100000);
      camera.position.set(0, 0, initialZRef.current);
      camera.near = 0.01;
      camera.far = 100000;
      cameraRef.current = camera;

      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
        depth: true,
        powerPreference: "high-performance",
      }) as WebGL2RenderingContext | null;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl ?? undefined,
        antialias: false,
        precision: "mediump",
        powerPreference: "high-performance",
        alpha: false,
      });

      renderer.setSize(w, h);
      renderer.setClearColor(safeParamsRef.current.bgColor, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      // ✅ correct color pipeline
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      try {
        mount.replaceChildren(renderer.domElement);
      } catch {
        mount.appendChild(renderer.domElement);
      }

      rendererRef.current = renderer;

      // ✅ Environment lighting (RoomEnvironment) + PMREM
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        pmremRef.current = pmrem;

        const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        envTexRef.current = envTex;

        scene.environment = envTex;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("PMREM/RoomEnvironment failed (continuing without env):", err);
      }

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));

      const dir = new THREE.DirectionalLight(0xffffff, 1.15);
      dir.position.set(4, 6, 10);
      scene.add(dir);

      const rim = new THREE.DirectionalLight(0xffffff, 0.55);
      rim.position.set(-4, -6, -8);
      scene.add(rim);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.copy(initialTargetRef.current);
      controlsRef.current = controls;

      const syncControlsButtons = () => {
        const locked = lockRef.current;
        const panAllowed = panEnabledRef.current;
        const painting = paintModeRef.current;

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

      const onResize = () => {
        const W = Math.max(1, mount.clientWidth);
        const H = Math.max(1, mount.clientHeight);
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
      };

      const ro = new ResizeObserver(onResize);
      ro.observe(mount);
      onResize();

      // Picking
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let isPainting = false;
      const lastPaintKeyRef = { current: "" };

      const computeWorldPointOnZ0 = (clientX: number, clientY: number) => {
        const cam = cameraRef.current;
        const rend = rendererRef.current;
        if (!cam || !rend) return null;

        const rect = rend.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

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
        const wp = computeWorldPointOnZ0(clientX, clientY);
        if (!wp) return null;

        window.dispatchEvent(
          new CustomEvent("ring-click", {
            detail: { x: wp.x, y: -wp.y },
          }),
        );
        return wp;
      };

      const applyPaintToRingKey = (ringKey: string) => {
        if (!ringKey) return;
        if (lastPaintKeyRef.current === ringKey) return;
        lastPaintKeyRef.current = ringKey;

        const base = safeParamsRef.current.ringColor || "#CCCCCC";

        if (eraseModeRef.current) {
          setInstanceColorByKey(ringKey, null);
          queuePaintPatch(ringKey, null);
        } else {
          const c = activeColorRef.current || base;
          setInstanceColorByKey(ringKey, c);
          queuePaintPatch(ringKey, c);
        }
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;

        emitWorldClick(e.clientX, e.clientY);

        if (!lockRef.current) return;
        if (!paintModeRef.current) return;

        e.preventDefault();

        isPainting = true;
        lastPaintKeyRef.current = "";

        try {
          (renderer.domElement as any).setPointerCapture?.(e.pointerId);
        } catch {}

        const wp = computeWorldPointOnZ0(e.clientX, e.clientY);
        if (!wp) return;

        const rk = findNearestRingKeyByWorldPoint(wp.x, wp.y);
        if (rk) applyPaintToRingKey(rk);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isPainting) return;
        if (!lockRef.current) return;
        if (!paintModeRef.current) return;

        e.preventDefault();

        const wp = computeWorldPointOnZ0(e.clientX, e.clientY);
        if (!wp) return;

        const rk = findNearestRingKeyByWorldPoint(wp.x, wp.y);
        if (rk) applyPaintToRingKey(rk);
      };

      const onPointerUp = (e: PointerEvent) => {
        isPainting = false;
        lastPaintKeyRef.current = "";
        try {
          (renderer.domElement as any).releasePointerCapture?.(e.pointerId);
        } catch {}
        flushPendingPaint();
      };

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

      const onContextLost = (ev: Event) => {
        try {
          (ev as any).preventDefault?.();
        } catch {}
        // eslint-disable-next-line no-console
        console.warn("WebGL context lost in RingRendererInstanced.");
      };
      renderer.domElement.addEventListener(
        "webglcontextlost",
        onContextLost as any,
        false,
      );

      const tick = () => {
        syncControlsButtons();
        controls.update();
        renderer.render(scene, camera);
        rafIdRef.current = requestAnimationFrame(tick);
      };
      rafIdRef.current = requestAnimationFrame(tick);

      return () => {
        if (rafIdRef.current != null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

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
          renderer.domElement.removeEventListener("pointerleave", onPointerUp);
          renderer.domElement.removeEventListener(
            "webglcontextlost",
            onContextLost as any,
          );
        } catch {}

        try {
          controls.dispose();
        } catch {}

        try {
          for (const g of groupsRef.current) {
            try {
              g.mesh.removeFromParent();
            } catch {}
            try {
              g.geom.dispose();
            } catch {}
            try {
              g.mat.dispose();
            } catch {}
          }
          groupsRef.current = [];
          instanceLookupRef.current = new Map();
          ringCenterRef.current = new Map();
          spatialIndexRef.current = new Map();
        } catch {}

        try {
          scene.clear();
        } catch {}

        // ✅ dispose environment + pmrem
        try {
          envTexRef.current?.dispose();
        } catch {}
        envTexRef.current = null;

        try {
          pmremRef.current?.dispose();
        } catch {}
        pmremRef.current = null;

        try {
          (renderer as any).renderLists?.dispose?.();
        } catch {}

        try {
          renderer.dispose();
        } catch {}

        try {
          (renderer as any).forceContextLoss?.();
        } catch {}

        try {
          const glAny: any = (renderer as any).getContext?.();
          const ext = glAny?.getExtension?.("WEBGL_lose_context");
          ext?.loseContext?.();
        } catch {}

        try {
          mount.replaceChildren();
        } catch {}

        rendererRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
        controlsRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ------------------------------------------------------------
    // External view-state sync (optional)
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // Build / rebuild instanced geometry groups when rings change
    // ------------------------------------------------------------
    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) return;

      if (groupsRef.current.length) {
        for (const g of groupsRef.current) {
          try {
            scene.remove(g.mesh);
          } catch {}
          try {
            g.mesh.removeFromParent();
          } catch {}
          try {
            g.geom.dispose();
          } catch {}
          try {
            g.mat.dispose();
          } catch {}
        }
      }

      groupsRef.current = [];
      instanceLookupRef.current = new Map();
      ringCenterRef.current = new Map();
      spatialIndexRef.current = new Map();
      prevPaintRef.current = new Map();

      if (!Array.isArray(rings) || rings.length === 0) return;

      // keep ref synced immediately for build-time base color matching
      totalCountRef.current = rings.length;

      type Bucket = { gKey: string; items: InstancedRing[] };
      const buckets = new Map<string, Bucket>();

      const metalness = 0.85;
      const roughness = 0.25;

      const bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      };

      for (const r of rings) {
        const ID = r.innerDiameter ?? safeParamsRef.current.innerDiameter;
        const WD = r.wireDiameter ?? safeParamsRef.current.wireDiameter;

        const ringRadius = ID / 2 + WD / 2;
        const tubeRadius = WD / 2;

        const gKey = `${ringRadius.toFixed(6)}_${tubeRadius.toFixed(6)}`;

        let b = buckets.get(gKey);
        if (!b) {
          b = { gKey, items: [] };
          buckets.set(gKey, b);
        }
        b.items.push(r);

        const sx = r.x;
        const sy = -(r.y ?? 0);

        bounds.minX = Math.min(bounds.minX, sx);
        bounds.maxX = Math.max(bounds.maxX, sx);
        bounds.minY = Math.min(bounds.minY, sy);
        bounds.maxY = Math.max(bounds.maxY, sy);
      }

      const groups: GroupMesh[] = [];
      const lookup = new Map<string, { g: number; i: number }>();

      // Base color (render-time corrected if >5000)
      const baseHexRaw = safeParamsRef.current.ringColor || "#CCCCCC";
      const profile = calibrationProfileRef.current;
      const baseHexRender = profile
        ? getCorrectedHexForLargeCount(
            baseHexRaw,
            rings.length,
            LARGE_COUNT_THRESHOLD,
            profile,
          )
        : applyLargeCountColorMatch(baseHexRaw, rings.length);

      const baseColor = getColor(baseHexRender);

      const tmp = new THREE.Object3D();
      const bucketList = Array.from(buckets.values());

      for (let gi = 0; gi < bucketList.length; gi++) {
        const b = bucketList[gi];
        const items = b.items;

        const [Rstr, rstr] = b.gKey.split("_");
        const R = Number(Rstr);
        const rr = Number(rstr);

        const geom = new THREE.TorusGeometry(R, rr, 16, 32);

        // ✅ CRITICAL FIX
        ensureWhiteVertexColors(geom);

        const mat = new THREE.MeshStandardMaterial({
          metalness,
          roughness,
          vertexColors: true,
        });

        const inst = new THREE.InstancedMesh(geom, mat, items.length);
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        // ✅ Ensure instancing color path is active + sized correctly
        ensureInstanceColor(inst, items.length);

        // Guarantee shader recompiles with instancing color defines on first draw
        mat.needsUpdate = true;

        const ic = inst.instanceColor;
        ic.setUsage(THREE.DynamicDrawUsage);

        const ringKeys: string[] = [];

        for (let i = 0; i < items.length; i++) {
          const r = items[i];

          const tiltRad =
            typeof r.tiltRad === "number"
              ? r.tiltRad
              : THREE.MathUtils.degToRad(r.tilt ?? 0);

          const px = r.x;
          const py = -(r.y ?? 0);
          const pz = r.z ?? 0;

          tmp.position.set(px, py, pz);
          tmp.rotation.set(0, tiltRad, Math.PI / 2);
          tmp.updateMatrix();
          inst.setMatrixAt(i, tmp.matrix);

          ic.setXYZ(i, baseColor.r, baseColor.g, baseColor.b);

          const key = `${r.row},${r.col}`;
          ringKeys.push(key);
          lookup.set(key, { g: gi, i });

          ringCenterRef.current.set(key, { x: px, y: py });
        }

        inst.instanceMatrix.needsUpdate = true;
        ic.needsUpdate = true;

        inst.frustumCulled = false;
        scene.add(inst);

        groups.push({
          key: b.gKey,
          mesh: inst,
          geom,
          mat,
          count: items.length,
          ringKeys,
        });
      }

      groupsRef.current = groups;
      instanceLookupRef.current = lookup;

      rebuildSpatialIndex();

      // Apply existing paint to new instances (render corrected internally)
      for (const [k, v] of paintRef.current.entries()) {
        setInstanceColorByKey(k, v ?? null);
      }
      prevPaintRef.current = new Map(paintRef.current);

      const cam = cameraRef.current;
      const ctr = controlsRef.current;
      if (cam && ctr && !externalViewState) {
        fitCameraToBounds(cam, ctr, bounds, 1.2);
        initialTargetRef.current.copy(ctr.target);
        initialZRef.current = cam.position.z;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rings, externalViewState, rebuildSpatialIndex, setInstanceColorByKey]);

    // ------------------------------------------------------------
    // Paint changes: apply diff only
    // ------------------------------------------------------------
    useEffect(() => {
      paintRef.current = paint;
      applyPaintDiff();
    }, [paint, applyPaintDiff]);

 // ------------------------------------------------------------
// Overlay application (imperative)
// ------------------------------------------------------------
const overlaySamplerRef = useRef<OverlaySampler | null>(null);

const overlayGetBool = (o: any, keys: string[], fallback = false) => {
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
};

const wrap01 = (t: number) => ((t % 1) + 1) % 1;

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

  const uu0 = Math.min(U0, U1);
  const uu1 = Math.max(U0, U1);
  const vv0 = Math.min(V0, V1);
  const vv1 = Math.max(V0, V1);

  const w = Math.max(1e-6, uu1 - uu0);
  const h = Math.max(1e-6, vv1 - vv0);

  return { u0: uu0, v0: vv0, uW: w, vH: h };
};

const buildOverlaySampler = useCallback(
  async (ov: OverlayState): Promise<OverlaySampler | null> => {
    if (!ov) return null;
    if (ringCenterRef.current.size === 0) return null;

    const src =
      overlayGetString(ov as any, ["dataUrl", "src", "url", "imageUrl"]) ?? null;
    if (!src) return null;

// ✅ Position
const offsetX = overlayGetNumeric(ov as any, ["offsetX", "x", "panX"], 0);
const offsetY = overlayGetNumeric(ov as any, ["offsetY", "y", "panY"], 0);

// ✅ Opacity (0..1)
const opacity = clamp01(overlayGetNumeric(ov as any, ["opacity"], 1));

// ✅ Scale
// Your UI uses "Pattern Scale (%)" → often stored as patternScale/patternScalePct (50 means 50%)
// Old code only read "scale" (1 means 100%) so the UI did nothing.
const scalePct = overlayGetNumeric(
  ov as any,
  ["patternScale", "patternScalePct", "patternScalePercent", "patternScalePercent"],
  NaN,
);
const rotationDeg = overlayGetNumeric(ov as any, ["rotation", "rotationDeg"], 0);
const rot = THREE.MathUtils.degToRad(rotationDeg);
const cosR = Math.cos(rot);
const sinR = Math.sin(rot);

let scale = overlayGetNumeric(ov as any, ["scale"], 1);
if (Number.isFinite(scalePct)) {
  scale = Math.max(1e-6, scalePct / 100);
}

// ✅ Repeat / Tile mode
// Your UI often sends repeatMode: "Tile" (string), not tileMode:"repeat"
const repeatModeStr =
  (overlayGetString(ov as any, ["repeatMode", "tileMode", "tiling", "repeat"], "") ?? "")
    .toLowerCase()
    .trim();

const tileAny =
  overlayGetBool(ov as any, ["tile", "tiled", "tilingEnabled", "repeat"], false) ||
  repeatModeStr === "tile" ||
  repeatModeStr === "repeat";

const tileX = overlayGetBool(ov as any, ["tileX", "repeatX"], tileAny);
const tileY = overlayGetBool(ov as any, ["tileY", "repeatY"], tileAny);
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

    // --- crop rect (normalized UV) ---
    const crop = getOverlayCropUV(ov as any);

    // Compute bounds from ring centers
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    for (const p of ringCenterRef.current.values()) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
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

    const baseHex = normalizeColor6(
      safeParamsRef.current.ringColor || "#FFFFFF",
    );

    const cacheKey = JSON.stringify({
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

    if (overlaySamplerRef.current?.key === cacheKey) {
      return overlaySamplerRef.current;
    }

    const img = await loadImage(src);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext(
  "2d",
  { willReadFrequently: true } as CanvasRenderingContext2DSettings,
) as CanvasRenderingContext2D | null;

if (!ctx) return null; // or handle null
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const w = canvas.width;
    const h = canvas.height;

    const base = new THREE.Color(baseHex);
    const baseR = Math.round(base.r * 255);
    const baseG = Math.round(base.g * 255);
    const baseB = Math.round(base.b * 255);

    const sampleWorld = (wx: number, wy: number): OverlaySample | null => {
      // world -> normalized [0..1] before crop
      let nx = ((wx - cx) / worldW) * invScale + 0.5;
      let ny = ((wy - cy) / worldH) * invScale + 0.5;

      // ✅ tiling: wrap first
      if (tileX) nx = wrap01(nx);
      if (tileY) ny = wrap01(ny);
// ✅ Apply rotation about the image center (0.5, 0.5)
{
  const u = nx - 0.5;
  const v = ny - 0.5;
  const ur = u * cosR - v * sinR;
  const vr = u * sinR + v * cosR;
  nx = ur + 0.5;
  ny = vr + 0.5;
}
      if (!tileX && (nx < 0 || nx > 1)) return null;
      if (!tileY && (ny < 0 || ny > 1)) return null;

      // Map into crop window
      let u = crop.u0 + nx * crop.uW;
      let v = crop.v0 + ny * crop.vH;

      // If tiled, repeat inside crop
      if (tileX) u = crop.u0 + wrap01((u - crop.u0) / crop.uW) * crop.uW;
      if (tileY) v = crop.v0 + wrap01((v - crop.v0) / crop.vH) * crop.vH;

      // Non-tiled: clamp to crop
      if (!tileX) u = crop.u0 + clamp01((u - crop.u0) / crop.uW) * crop.uW;
      if (!tileY) v = crop.v0 + clamp01((v - crop.v0) / crop.vH) * crop.vH;

      // UV -> pixel (v is up, image y is down)
      let px = Math.floor(u * w);
      let py = Math.floor((1 - v) * h);

      if (px === w) px = w - 1;
      if (py === h) py = h - 1;
      if (px < 0 || px >= w || py < 0 || py >= h) return null;

      const idx = (py * w + px) * 4;
      const r = data[idx + 0];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a255 = data[idx + 3];

      if (a255 <= 2) return null;

      const t = clamp01((a255 / 255) * opacity);

      const outR = Math.round(baseR * (1 - t) + r * t);
      const outG = Math.round(baseG * (1 - t) + g * t);
      const outB = Math.round(baseB * (1 - t) + b * t);

      return { hex: rgbToHex(outR, outG, outB), alpha: a255 };
    };

    // Logical coords are +Y up; ring centers are already in world (+Y up) here
    const sampleLogical = (lx: number, ly: number) => sampleWorld(lx, ly);

    const sampler: OverlaySampler = {
      key: cacheKey,
      sampleWorld,
      sampleLogical,
    };

    overlaySamplerRef.current = sampler;
    return sampler;
  },
  [],
);

const applyOverlayToRings = useCallback(
  async (ov: OverlayState) => {
    if (!ov) return;
    if (!rings || rings.length === 0) return;
    if (ringCenterRef.current.size === 0) return;

    const sampler = await buildOverlaySampler(ov);
    if (!sampler) return;

    setPaint((prev) => {
      const next = new Map(prev);

      for (const [key, p] of ringCenterRef.current.entries()) {
        const sampled = sampler.sampleWorld(p.x, p.y);
        if (!sampled) continue;

        const c = normalizeColor6(sampled.hex);
        next.set(key, c);
        setInstanceColorByKey(key, c);
      }

      prevPaintRef.current = new Map(next);
      return next;
    });
  },
  [rings, setPaint, setInstanceColorByKey, buildOverlaySampler],
);

// ------------------------------------------------------------
// Imperative API
// ------------------------------------------------------------
    // ------------------------------------------------------------
    // Imperative API
    // ------------------------------------------------------------
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
        try {
          pendingPaintRef.current.clear();
          if (pendingRAFRef.current != null) {
            cancelAnimationFrame(pendingRAFRef.current);
            pendingRAFRef.current = null;
          }
        } catch {}

        const baseHexRaw = safeParamsRef.current.ringColor || "#CCCCCC";

        const profile = calibrationProfileRef.current;
        const baseHexRender = profile
          ? getCorrectedHexForLargeCount(
              baseHexRaw,
              totalCountRef.current,
              LARGE_COUNT_THRESHOLD,
              profile,
            )
          : applyLargeCountColorMatch(baseHexRaw, totalCountRef.current);

        const base = getColor(baseHexRender);

        // Fast fill of all instanceColor buffers
        for (const g of groupsRef.current) {
          const inst = g.mesh;
          ensureInstanceColor(inst, g.count);

          const attr = inst.instanceColor;
          const arr = attr.array as Float32Array;

          for (let i = 0; i < g.count; i++) {
            const o = i * 3;
            arr[o + 0] = base.r;
            arr[o + 1] = base.g;
            arr[o + 2] = base.b;
          }
          attr.needsUpdate = true;
        }

        setPaint(new Map());
        prevPaintRef.current = new Map();
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

      applyOverlayToRings: async (ov: OverlayState) => {
        await applyOverlayToRings(ov);
      },

      getState: () => ({
        paintMode: paintModeRef.current,
        eraseMode: eraseModeRef.current,
        rotationLocked: lockRef.current,
      }),

      getCameraZ: () => cameraRef.current?.position.z ?? initialZRef.current,
      getCamera: () => cameraRef.current ?? null,

      getDomRect: () => {
        const dom = rendererRef.current?.domElement;
        return dom ? dom.getBoundingClientRect() : null;
      },

      getCanvas: () => rendererRef.current?.domElement ?? null,
    }));

    // ------------------------------------------------------------
    // Keep background consistent if bgColor changes
    // ------------------------------------------------------------
    useEffect(() => {
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
      if (scene) scene.background = new THREE.Color(safeParams.bgColor);
      if (renderer) renderer.setClearColor(safeParams.bgColor, 1);
    }, [safeParams.bgColor]);

    // ------------------------------------------------------------
    // Render
    // ------------------------------------------------------------
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

export default RingRendererInstanced;