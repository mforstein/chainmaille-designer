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

  const center = new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, 0);

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
    // Color cache + incremental paint application
    // ------------------------------------------------------------
    const colorCacheRef = useRef<Map<string, THREE.Color>>(new Map());
    const getColor = (hex: string) => {
      const key = (hex || "").toLowerCase();
      const hit = colorCacheRef.current.get(key);
      if (hit) return hit;
      const c = new THREE.Color(key || "#ffffff");
      colorCacheRef.current.set(key, c);
      return c;
    };

    const prevPaintRef = useRef<PaintMap>(new Map());

    const setInstanceColorByKey = useCallback(
      (ringKey: string, hexOrNull: string | null) => {
        const lookup = instanceLookupRef.current.get(ringKey);
        if (!lookup) return;

        const groups = groupsRef.current;
        const g = groups[lookup.g];
        if (!g) return;

        const inst = g.mesh;
        const idx = lookup.i;

        const baseHex = safeParamsRef.current.ringColor || "#CCCCCC";
        const hex = hexOrNull ?? baseHex;

        inst.setColorAt(idx, getColor(hex));
        if (inst.instanceColor) {
          inst.instanceColor.needsUpdate = true;
        }
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
        // keep scene.background as your bgColor; do NOT set background to env unless desired
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
      const baseColor = getColor(safeParamsRef.current.ringColor || "#CCCCCC");

      const tmp = new THREE.Object3D();
      const bucketList = Array.from(buckets.values());

      for (let gi = 0; gi < bucketList.length; gi++) {
        const b = bucketList[gi];
        const items = b.items;

        const [Rstr, rstr] = b.gKey.split("_");
        const R = Number(Rstr);
        const rr = Number(rstr);

        const geom = new THREE.TorusGeometry(R, rr, 16, 32);
        const mat = new THREE.MeshStandardMaterial({
          metalness,
          roughness,
          vertexColors: true,
        });

        const inst = new THREE.InstancedMesh(geom, mat, items.length);
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        // ✅ create instanceColor only if missing (no @ts-expect-error needed)
        if (!inst.instanceColor) {
          inst.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(items.length * 3),
            3,
          );
        }

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

          inst.setColorAt(i, baseColor);

          const key = `${r.row},${r.col}`;
          ringKeys.push(key);
          lookup.set(key, { g: gi, i });

          ringCenterRef.current.set(key, { x: px, y: py });
        }

        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

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
    const applyOverlayToRings = useCallback(
      async (ov: OverlayState) => {
        if (!ov) return;
        if (!rings || rings.length === 0) return;
        if (ringCenterRef.current.size === 0) return;

        const src =
          overlayGetString(ov as any, ["dataUrl", "src", "url", "imageUrl"]) ??
          null;
        if (!src) return;

        const offsetX = overlayGetNumeric(ov as any, ["offsetX", "x", "panX"], 0);
        const offsetY = overlayGetNumeric(ov as any, ["offsetY", "y", "panY"], 0);
        const scale = overlayGetNumeric(ov as any, ["scale"], 1);
        const opacity = clamp01(overlayGetNumeric(ov as any, ["opacity"], 1));

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

        const img = await loadImage(src);

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

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

        const sampleAtWorld = (wx: number, wy: number) => {
          const nx = ((wx - cx) / worldW) * invScale + 0.5;
          const ny = ((wy - cy) / worldH) * invScale + 0.5;

          if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;

          const px = Math.floor(nx * (canvas.width - 1));
          const py = Math.floor((1 - ny) * (canvas.height - 1));

          const idx = (py * canvas.width + px) * 4;
          const r = data[idx + 0];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3] / 255;

          if (a <= 0.01) return null;

          const baseHex = safeParamsRef.current.ringColor || "#FFFFFF";
          const base = new THREE.Color(baseHex);
          const baseR = Math.round(base.r * 255);
          const baseG = Math.round(base.g * 255);
          const baseB = Math.round(base.b * 255);

          const t = clamp01(a * opacity);

          const outR = Math.round(baseR * (1 - t) + r * t);
          const outG = Math.round(baseG * (1 - t) + g * t);
          const outB = Math.round(baseB * (1 - t) + b * t);

          return rgbToHex(outR, outG, outB);
        };

        setPaint((prev) => {
          const next = new Map(prev);

          for (const [key, p] of ringCenterRef.current.entries()) {
            const sampled = sampleAtWorld(p.x, p.y);
            if (!sampled) continue;

            next.set(key, sampled);
            setInstanceColorByKey(key, sampled);
          }

          prevPaintRef.current = new Map(next);
          return next;
        });
      },
      [rings, setPaint, setInstanceColorByKey],
    );

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

        const baseHex = safeParamsRef.current.ringColor || "#CCCCCC";
        const base = getColor(baseHex);

        for (const g of groupsRef.current) {
          for (let i = 0; i < g.count; i++) {
            g.mesh.setColorAt(i, base);
          }
          if (g.mesh.instanceColor) {
            g.mesh.instanceColor.needsUpdate = true;
          }
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