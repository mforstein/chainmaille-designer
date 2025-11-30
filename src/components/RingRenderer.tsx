// ============================================================
// File: src/components/RingRenderer.tsx
// FINAL with `mode` + fixed paint/overlay mapping
// ============================================================

import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import SpriteText from "three-spritetext";
import { OverlayState } from "../components/ImageOverlayPanel";

// ============================================================
// Utility Constants & Conversions
// ============================================================
const INCH_TO_MM = 25.4;

export function parseInchFractionToInches(v: string | number): number {
  if (typeof v === "number") return v;
  const s = v.replace(/"/g, "").trim();
  if (s.includes("/")) {
    const [num, den] = s.split("/").map(Number);
    return num / den;
  }
  return Number(s);
}

export function inchesToMm(inches: number) {
  return inches * INCH_TO_MM;
}

export function convertToMM(idValue: string | number): number {
  if (typeof idValue === "number") return idValue;
  const [num, den] = idValue.split("/").map(Number);
  return den ? 25.4 * (num / den) : parseFloat(idValue);
}

export function computeRingVarsFixedID(
  idInput: string | number,
  wdMm: string | number
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

export function computeRingVarsIndependent(
  ID_value: string | number,
  wire_value: number
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
  tilt?: number; // JSON tilt in degrees
  tiltRad?: number;
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

type ViewMode = "designer" | "tuner" | "chart" | "freeform";

type Props = {
  rings: Ring[];
  params: RenderParams;
  paint: PaintMap;
  setPaint: React.Dispatch<React.SetStateAction<PaintMap>>;
  activeColor: string;
  overlay?: OverlayState | null;
  initialPaintMode?: boolean;
  initialEraseMode?: boolean;
  initialRotationLocked?: boolean;
  mode?: ViewMode;
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
};

// ============================================================
// Camera Dolly Utility
// ============================================================
function dollyCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls | undefined,
  factor: number
) {
  if (!camera) return;
  const target = controls ? controls.target : new THREE.Vector3();
  const dir = new THREE.Vector3()
    .subVectors(camera.position, target)
    .multiplyScalar(factor);
  camera.position.copy(target).add(dir);
  camera.updateProjectionMatrix();
}

// ============================================================
// MAIN COMPONENT
// ============================================================
const RingRenderer = forwardRef<RingRendererHandle, Props>(
  function RingRenderer(
    {
      rings,
      params,
      paint,
      setPaint,
      activeColor,
      overlay,
      initialPaintMode,
      initialEraseMode,
      initialRotationLocked,
      mode = "designer",
    },
    ref
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
      params.rows,
      params.cols,
      params.innerDiameter,
      params.wireDiameter,
      params.ringColor,
      params.bgColor,
      params.centerSpacing,
    ]);

    // ----------------------------
    // Refs
    // ----------------------------
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene>();
    const cameraRef = useRef<THREE.PerspectiveCamera>();
    const rendererRef = useRef<THREE.WebGLRenderer>();
    const controlsRef = useRef<OrbitControls>();
    const meshesRef = useRef<THREE.InstancedMesh[]>([]);
    const groupRef = useRef<THREE.Group>();

    const [localPaintMode, setLocalPaintMode] = useState(
      initialPaintMode ?? (mode === "designer" || mode === "freeform")
    );
    const [localEraseMode, setLocalEraseMode] = useState(
      initialEraseMode ?? false
    );
    const [rotationLocked, setRotationLocked] = useState(
      initialRotationLocked ?? (mode === "designer" || mode === "chart")
    );

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
    }, [safeParams]);

    const initialZRef = useRef(240);
    const initialTargetRef = useRef(new THREE.Vector3(0, 0, 0));

    // ============================================================
    // Helper — apply current paint map to an InstancedMesh
    // ============================================================
    const applyPaintMapToInst = (inst: THREE.InstancedMesh) => {
      const c = new THREE.Color();
      const fallbackCols = paramsRef.current.cols || safeParams.cols || 1;
      const indexToCoord =
        ((inst as any).userData &&
          (inst as any).userData.indexToCoord) as
          | { row: number; col: number }[]
          | undefined;

      for (let i = 0; i < inst.count; i++) {
        let row: number;
        let col: number;

        if (indexToCoord && indexToCoord[i]) {
          row = indexToCoord[i].row;
          col = indexToCoord[i].col;
        } else {
          row = Math.floor(i / fallbackCols);
          col = i % fallbackCols;
        }

        const key = `${row},${col}`;
        const hex = paintRef.current.get(key) ?? paramsRef.current.ringColor;
        c.set(hex);
        inst.setColorAt(i, c);
      }

      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    };
    
    // ============================================================
// Scene Initialization + Renderer Setup
// ============================================================
useEffect(() => {
  if (!mountRef.current) return;
  const mount = mountRef.current;

  // Clean previous renderer
  if (rendererRef.current) {
    try {
      rendererRef.current.dispose();
      mount.replaceChildren();
    } catch {}
  }

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(safeParams.bgColor);
  sceneRef.current = scene;

  // Camera
  const camera = new THREE.PerspectiveCamera(
    45,
    mount.clientWidth / mount.clientHeight,
    0.1,
    2000
  );
  camera.position.set(0, 0, initialZRef.current);
  cameraRef.current = camera;

  // Renderer
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    depth: true,
    powerPreference: "low-power",
  }) as WebGL2RenderingContext;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl!,
    antialias: true,
    precision: "mediump",
    powerPreference: "low-power",
  });
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setClearColor(safeParams.bgColor, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  mount.appendChild(renderer.domElement);
  rendererRef.current = renderer;

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(4, 6, 10);
  scene.add(dir);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controlsRef.current = controls;
  camera.lookAt(controls.target);

  const onResize = () => {
    const { clientWidth: w, clientHeight: h } = mount;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);
  onResize();

  // ============================================================
  // Painting Handlers (raycast → instance → paint map)
  // ============================================================
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let isPainting = false;
  let lastIndex = -1;

  const paintAt = (clientX: number, clientY: number) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(meshesRef.current, false);
    if (hits.length === 0) return;

    const index = (hits[0] as any).instanceId ?? 0;
    if (index === lastIndex) return;
    lastIndex = index;

    // Pull correct row/col mapping
    const inst = hits[0].object as THREE.InstancedMesh;
    const lookup = inst.userData.indexToCoord?.[index];
    if (!lookup) return;

    const key = `${lookup.row},${lookup.col}`;

    setPaint((prev) => {
      const next = new Map(prev);
      next.set(key, eraseModeRef.current ? null : activeColorRef.current);
      return next;
    });
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!lockRef.current) return;
    if (!paintModeRef.current) return;
    if (e.button !== 0) return;
    e.preventDefault();
    isPainting = true;
    lastIndex = -1;
    paintAt(e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!lockRef.current || !paintModeRef.current || !isPainting) return;
    e.preventDefault();
    paintAt(e.clientX, e.clientY);
  };

  const onPointerUp = () => {
    isPainting = false;
    lastIndex = -1;
  };

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  return () => {
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    try {
      scene.clear();
    } catch {}
    try {
      renderer.dispose();
    } catch {}
  };
}, [safeParams.bgColor]);

// ============================================================
// OrbitControls interactivity sync
// ============================================================
useEffect(() => {
  const ctr = controlsRef.current;
  const ren = rendererRef.current;
  if (!ctr || !ren) return;

  if (!rotationLocked) {
    ctr.enableRotate = true;
    ctr.enablePan = true;
    ctr.enableZoom = true;
    ctr.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    ren.domElement.style.cursor = "grab";
  } else {
    ctr.enableRotate = false;
    ctr.enablePan = !localPaintMode;
    ctr.enableZoom = true;
    ctr.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    ren.domElement.style.cursor = localPaintMode ? "crosshair" : "grab";
  }

  ctr.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  (ctr as any).listenToKeyEvents?.(window);
  ctr.update();
}, [localPaintMode, rotationLocked]);

// ============================================================
// Re-apply paint map to instanced colors
// ============================================================
useEffect(() => {
  const inst = meshesRef.current[0];
  if (!inst) return;
  applyPaintMapToInst(inst);
}, [paint, safeParams.ringColor, safeParams.cols]);

// ============================================================
// Geometry Build — supports JSON tilt + correct mapping
// ============================================================
useEffect(() => {
  const scene = sceneRef.current;
  if (!scene) return;

  // Cleanup old group
  if (groupRef.current) {
    groupRef.current.traverse((o: any) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m: any) => m?.dispose?.());
      else o.material?.dispose?.();
    });
    scene.remove(groupRef.current);
    meshesRef.current = [];
  }

  const group = new THREE.Group();
  groupRef.current = group;

  if (!Array.isArray(rings) || rings.length === 0) {
    scene.add(group);
    meshesRef.current = [];
    return;
  }

  // --- Group rings by (ID, WD) pair ---
  const bucketMap = new Map<string, Ring[]>();
  for (const r of rings) {
    const ID = +(r.innerDiameter ?? safeParams.innerDiameter).toFixed(3);
    const WD = +(r.wireDiameter ?? safeParams.wireDiameter).toFixed(3);
    const key = `${ID}_${WD}`;
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key)!.push(r);
  }

  const dummy = new THREE.Object3D();
  const newMeshes: THREE.InstancedMesh[] = [];

  bucketMap.forEach((subset, key) => {
    const [ID_s, WD_s] = key.split("_").map(Number);
    const ringRadius = ID_s / 2 + WD_s / 2;
    const tubeRadius = WD_s / 2;

    const baseGeometry = new THREE.TorusGeometry(
      ringRadius,
      tubeRadius,
      32,
      64
    );

    // Allow vertex colors
    baseGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        new Array(baseGeometry.attributes.position.count * 3).fill(1),
        3
      )
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.85,
      roughness: 0.25,
      vertexColors: true,
    });

    const inst = new THREE.InstancedMesh(
      baseGeometry,
      material,
      subset.length
    );

    inst.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(subset.length * 3),
      3
    );

    // 🔥 Store mapping for paint + overlay
    const indexToCoord = subset.map((r) => ({
      row: r.row,
      col: r.col,
    }));
    inst.userData.indexToCoord = indexToCoord;

    // ============================================================
    // 🎯 Correct 3D placement with JSON tilt
    // ============================================================
    subset.forEach((r, i) => {
      const tiltRad =
        typeof r.tiltRad === "number"
          ? r.tiltRad
          : THREE.MathUtils.degToRad(r.tilt ?? 0);

      dummy.position.set(r.x, -r.y, r.z ?? 0);

      // PERFECT orientation (designer/tuner/chart/freeform)
      dummy.rotation.set(0, tiltRad, Math.PI / 2);

      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });

    inst.instanceMatrix.needsUpdate = true;

    group.add(inst);
    newMeshes.push(inst);

    // ============================================================
    // Labels (Chart Mode)
    // ============================================================
    subset.forEach((r) => {
      if ((r as any)._chartLabel) {
        const label = (r as any)._chartLabel;
        const WD = r.wireDiameter ?? WD_s;
        label.textHeight = Math.max(2, WD * 2);
        label.position.set(r.x, -r.y - WD * 4, r.z ?? 0);
        label.center.set(0.5, 1.2);
        label.material.depthTest = false;
        label.material.depthWrite = false;
        group.add(label);
      }
    });
  });

  scene.add(group);

  meshesRef.current = newMeshes;
  if (newMeshes[0]) {
    applyPaintMapToInst(newMeshes[0]);
  }
}, [rings, safeParams]);

// ============================================================
// Imperative Handle
// ============================================================
useImperativeHandle(ref, () => ({
  zoomIn: () => {
    if (!cameraRef.current) return;
    dollyCamera(cameraRef.current, controlsRef.current, 0.9);
  },
  zoomOut: () => {
    if (!cameraRef.current) return;
    dollyCamera(cameraRef.current, controlsRef.current, 1.1);
  },
  resetView: () => {
    const cam = cameraRef.current;
    const ctr = controlsRef.current;
    if (!cam || !ctr) return;
    cam.position.set(0, 0, initialZRef.current);
    ctr.target.copy(initialTargetRef.current);
    ctr.update();
  },

  toggleLock: () => setRotationLocked((v) => !v),

  setPaintMode: (on: boolean) => {
    setLocalPaintMode(on);
    const ren = rendererRef.current;
    if (ren && lockRef.current) {
      ren.domElement.style.cursor = on ? "crosshair" : "default";
    }
  },

  setPanEnabled: (enabled: boolean) => {
    if (controlsRef.current) controlsRef.current.enablePan = enabled;
  },

  setEraseMode: (enabled: boolean) => setLocalEraseMode(enabled),
  toggleErase: () => setLocalEraseMode((v) => !v),

  clearPaint: () => setPaint(new Map()),

  lock2DView: () => {
    const cam = cameraRef.current;
    if (cam) cam.position.set(0, 0, initialZRef.current);
    setRotationLocked(true);
  },

  forceLockRotation: (locked: boolean) => {
    setRotationLocked(locked);
    lockRef.current = locked;

    const ctr = controlsRef.current;
    const ren = rendererRef.current;
    if (!ctr || !ren) return;

    if (!locked) {
      ren.domElement.style.cursor = "grab";
      ctr.enableRotate = true;
      ctr.enablePan = true;
      ctr.enableZoom = true;
      ctr.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    } else {
      const painting = paintModeRef.current;
      ren.domElement.style.cursor = painting ? "crosshair" : "grab";
      ctr.enableRotate = false;
      ctr.enablePan = false;
      ctr.enableZoom = true;
      ctr.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    }
    ctr.update();
  },

  getState: () => ({
    paintMode: paintModeRef.current,
    eraseMode: eraseModeRef.current,
    rotationLocked: lockRef.current,
  }),

  // ============================================================
  // APPLY OVERLAY (Image → Ring Colors)
  // ============================================================
  applyOverlayToRings: async (ov: OverlayState) => {
    try {
      const inst = meshesRef.current[0];
      const group = groupRef.current;
      if (!ov?.dataUrl || !inst || !group) return;

      // Load image
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = ov.dataUrl!;
      });

      // Canvas sampling surface
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const { data, width: W, height: H } = ctx.getImageData(
        0,
        0,
        img.width,
        img.height
      );

      // Compute ring centers in world space
      const mInst = new THREE.Matrix4();
      const mCombined = new THREE.Matrix4();
      const mWorld = group.matrixWorld;
      const p = new THREE.Vector3();
      const worldXs = new Float32Array(inst.count);
      const worldYs = new Float32Array(inst.count);

      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, mInst);
        mCombined.copy(mWorld).multiply(mInst);
        p.set(0, 0, 0).applyMatrix4(mCombined);
        worldXs[i] = p.x;
        worldYs[i] = p.y;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const widthWorld = Math.max(1e-6, maxX - minX);
      const heightWorld = Math.max(1e-6, maxY - minY);
      const span = Math.max(widthWorld, heightWorld); // isotropic

      const scale = ov.scale ?? 1;
      const rotRad = THREE.MathUtils.degToRad(ov.rotation ?? 0);
      const repeatMode = (ov as any).repeat ?? "none";
      const patternScale = ((ov as any).patternScale ?? 100) / 100;
      const offU = (ov.offsetX ?? 0) / 100;
      const offV = (ov.offsetY ?? 0) / 100;

      const rotate2D = (x: number, y: number, r: number) => {
        const c = Math.cos(r),
          s = Math.sin(r);
        return { x: x * c - y * s, y: x * s + y * c };
      };

      const cols = paramsRef.current.cols || 1;
      const col = new THREE.Color();
      const nextPaint = new Map<string, string | null>();

      for (let i = 0; i < inst.count; i++) {
        let nx = (worldXs[i] - cx) / span;
        let ny = (worldYs[i] - cy) / span;
        const r = rotate2D(nx, ny, rotRad);
        nx = r.x / scale + offU;
        ny = r.y / scale + offV;

        let u = nx + 0.5;
        let v = 0.5 - ny;

        if (repeatMode === "tile") {
          u = ((u / patternScale) % 1 + 1) % 1;
          v = ((v / patternScale) % 1 + 1) % 1;
        } else {
          u = Math.min(1, Math.max(0, u));
          v = Math.min(1, Math.max(0, v));
        }

        const px = Math.min(W - 1, Math.max(0, Math.round(u * (W - 1))));
        const py = Math.min(H - 1, Math.max(0, Math.round(v * (H - 1))));
        const idx = (py * W + px) * 4;
        const r8 = data[idx + 0],
          g8 = data[idx + 1],
          b8 = data[idx + 2];

        col.setRGB(r8 / 255, g8 / 255, b8 / 255);
        inst.setColorAt(i, col);

        // Reverse-map to row/col
        const row = Math.floor(i / cols);
        const cix = i % cols;
        const hex = `#${r8
          .toString(16)
          .padStart(2, "0")}${g8
          .toString(16)
          .padStart(2, "0")}${b8.toString(16).padStart(2, "0")}`;
        nextPaint.set(`${row},${cix}`, hex);
      }

      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      setPaint(nextPaint);
    } catch (err) {
      console.error("❌ applyOverlayToRings failed:", err);
    }
  },
}));

// ============================================================
// Render Component
// ============================================================
return (
  <div
    ref={mountRef}
    style={{
      width: "100vw",
      height: "100vh",
      overflow: "hidden",
      backgroundColor: safeParams.bgColor,
    }}
  />
);
}
);

export default RingRenderer;

// ============================================================
// SHARED RING GENERATORS — Designer / Chart / Tuner
// ============================================================

export function _generateRingsBase({
  rows,
  cols,
  ID_mm,
  WD_mm,
  OD_mm,
  centerSpacing,
  layout = [],
}: {
  rows: number;
  cols: number;
  ID_mm: number;
  WD_mm: number;
  OD_mm: number;
  centerSpacing?: number;
  layout?: any[];
}) {
  const spacing = centerSpacing ?? 7.5;
  const rings: any[] = [];

  for (let r = 0; r < rows; r++) {
    const rowOffset = r % 2 === 1 ? spacing / 2 : 0;
    const tilt = layout[r]?.tilt ?? 0;
    const tiltRad = THREE.MathUtils.degToRad(tilt);

    for (let c = 0; c < cols; c++) {
      const x = c * spacing + rowOffset;
      const y = r * spacing * 0.8660;

      rings.push({
        row: r,
        col: c,
        x,
        y,
        z: 0,
        innerDiameter: ID_mm,
        wireDiameter: WD_mm,
        radius: OD_mm / 2,
        centerSpacing: spacing,
        tilt,
        tiltRad,
      });
    }
  }

  return rings;
}

// DESIGNER — row parity tilt (alternating)
export function generateRingsDesigner({
  rows,
  cols,
  innerDiameter,
  wireDiameter,
  centerSpacing,
  angleIn = 25,
  angleOut = -25,
  layout = [],
}) {
  const ID_mm = innerDiameter;
  const WD_mm = wireDiameter;
  const OD_mm = ID_mm + 2 * WD_mm;

  const finalLayout = [];
  for (let r = 0; r < rows; r++) {
    finalLayout[r] = {
      ...(layout[r] || {}),
      tilt: r % 2 === 0 ? angleIn : angleOut,
    };
  }

  return _generateRingsBase({
    rows,
    cols,
    ID_mm,
    WD_mm,
    OD_mm,
    centerSpacing,
    layout: finalLayout,
  });
}

// CHART MODE
export function generateRingsChart(opts: any) {
  const rings = generateRingsDesigner(opts);

  rings.forEach((r) => {
    const label = new SpriteText(`${r.wireDiameter}mm / ${r.innerDiameter}mm`);
    label.color = "#CCCCCC";
    label.textHeight = 2.2;
    label.position.set(r.x, -r.y - r.wireDiameter * 4, r.z);
    label.center.set(0.5, 1.2);
    (label.material as any).depthTest = false;
    (label.material as any).depthWrite = false;
    r._chartLabel = label;
  });

  return rings;
}

// TUNER MODE
export function generateRingsTuner(opts: any) {
  const rings = generateRingsDesigner(opts);

  rings.forEach((r) => {
    const label = new SpriteText(`R${r.row} C${r.col}`);
    label.color = "#00FFFF";
    label.textHeight = 2;
    label.position.set(r.x, -r.y - 2, 0);
    r._debugLabel = label;
  });

  return rings;
}

// DEFAULT EXPORT
export const generateRings = generateRingsDesigner;