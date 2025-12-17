// ============================================================
// File: src/components/RingRenderer.tsx  (DROP-IN FULL FILE)
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
import type { OverlayState } from "../components/ImageOverlayPanel";

// ============================================================
// Utility Constants & Conversions
// ============================================================
const INCH_TO_MM = 25.4;

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

// ✅ This is what your Tuner imports and should keep using
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

  // Tilt is expected to be computed upstream (Tuner / Generators)
  tilt?: number; // degrees (optional)
  tiltRad?: number; // radians (preferred)

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
  fallback: string | null = null
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
// Fit camera to group (keeps panel from “disappearing” when scale changes)
// - Only runs when NOT using externalViewState
// - Updates both controls.target and the initial refs used by resetView()
// ============================================================
function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  padding = 1.15
) {
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // If everything is at a point, keep defaults
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

  // Camera stays on +Z axis for “2D-ish” feel; distance is computed to fit
  camera.position.set(center.x, center.y, center.z + dist);
  camera.near = Math.max(0.01, dist / 5000);
  camera.far = Math.max(100000, dist * 20);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
}

// ============================================================
// MAIN COMPONENT
// ============================================================
const RingRenderer = forwardRef<RingRendererHandle, Props>(function RingRenderer(
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

  // ✅ IMPORTANT: do NOT set OrbitControls pan/rotate here (syncControlsButtons owns that)
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

  useEffect(() => {
    panEnabledRef.current = panEnabled;
  }, [panEnabled]);

  const initialZRef = useRef(240);
  const initialTargetRef = useRef(new THREE.Vector3(0, 0, 0));

  // ============================================================
  // Helper — apply current paint map to ring meshes
  // ============================================================
  const applyPaintToMeshes = () => {
    const meshes = meshesRef.current;
    if (!meshes || meshes.length === 0) return;

    const defaultHex = paramsRef.current.ringColor || "#CCCCCC";

    for (const mesh of meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) continue;

      const row = mesh.userData.row as number;
      const col = mesh.userData.col as number;
      const key = `${row},${col}`;

      const colorHex = paintRef.current.get(key) ?? defaultHex;
      mat.color.set(colorHex);
      mat.needsUpdate = true;
    }
  };

  // ============================================================
  // Helper — reset all mesh colors to default (used by clearPaint)
  // ============================================================
  const resetMeshColorsToDefault = () => {
    const meshes = meshesRef.current;
    if (!meshes || meshes.length === 0) return;

    const defaultHex = paramsRef.current.ringColor || "#CCCCCC";
    for (const mesh of meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) continue;
      mat.color.set(defaultHex);
      mat.needsUpdate = true;
    }
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
      100000
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
      Math.max(1, mount.clientHeight)
    );
    renderer.setClearColor(safeParams.bgColor, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    // ✅ Fix “colors not showing / looks wrong”: correct color pipeline
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights (keep strong enough for MeshStandardMaterial colors to read)
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

    // ✅ SINGLE SOURCE OF TRUTH for OrbitControls mappings (runs every frame)
    const syncControlsButtons = () => {
      const locked = lockRef.current;
      const panAllowed = panEnabledRef.current;
      const painting = paintModeRef.current;

      // Always allow zoom
      controls.enableZoom = true;

      if (locked) {
        // 🔒 LOCKED VIEW (2D)
        controls.enableRotate = false;

        // ✅ Pan allowed when paint is OFF and panEnabled is true
        controls.enablePan = panAllowed && !painting;

        // Always valid enums — behavior controlled elsewhere
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
    // 1) ALWAYS emit a world coordinate event for diagnostics + placement
    // 2) Only paint/erase if you actually hit a ring mesh
    // ============================================================
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let isPainting = false;

    const emitWorldClick = (clientX: number, clientY: number) => {
      const cam = cameraRef.current;
      const rend = rendererRef.current;
      if (!cam || !rend) return;

      const rect = rend.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(ndc, cam);

      // Intersect against Z=0 plane to get stable world point anywhere
      const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const worldPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeZ, worldPoint);

      window.dispatchEvent(
        new CustomEvent("ring-click", {
          detail: {
            x: worldPoint.x,
            y: -worldPoint.y,
          },
        })
      );

      return worldPoint;
    };

    const tryPaintRingAt = (clientX: number, clientY: number) => {
      const cam = cameraRef.current;
      const rend = rendererRef.current;
      if (!cam || !rend) return;

      const rect = rend.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(ndc, cam);

      const hits = raycaster.intersectObjects(meshesRef.current, false);
      if (hits.length === 0) return;

      const mesh = hits[0].object as THREE.Mesh;
      const row = mesh.userData.row as number;
      const col = mesh.userData.col as number;
      if (row == null || col == null) return;

      const key = `${row},${col}`;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) return;

      setPaint((prev) => {
        const next = new Map(prev);

        if (eraseModeRef.current) {
          next.set(key, null);
          mat.color.set(paramsRef.current.ringColor || "#CCCCCC");
        } else {
          const c =
            activeColorRef.current || paramsRef.current.ringColor || "#CCCCCC";
          next.set(key, c);
          mat.color.set(c);
        }

        mat.needsUpdate = true;
        return next;
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      // Always emit click coords (even if no ring hit)
      emitWorldClick(e.clientX, e.clientY);

      // Only paint when locked + paint mode enabled
      if (!lockRef.current) return;
      if (!paintModeRef.current) return;

      e.preventDefault();
      isPainting = true;

      try {
        (renderer.domElement as any).setPointerCapture?.(e.pointerId);
      } catch {}

      tryPaintRingAt(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isPainting) return;
      if (!lockRef.current) return;
      if (!paintModeRef.current) return;

      e.preventDefault();
      tryPaintRingAt(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      isPainting = false;
      try {
        (renderer.domElement as any).releasePointerCapture?.(e.pointerId);
      } catch {}
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerUp);

    // Animate loop
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

      try {
        ro.disconnect();
      } catch {}

      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerUp);

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
    }

    const group = new THREE.Group();
    groupRef.current = group;

    if (!Array.isArray(rings) || rings.length === 0) {
      scene.add(group);
      meshesRef.current = [];
      return;
    }

    const meshes: THREE.Mesh[] = [];

    rings.forEach((r) => {
      const ID = r.innerDiameter ?? safeParams.innerDiameter;
      const WD = r.wireDiameter ?? safeParams.wireDiameter;

      const ringRadius = ID / 2 + WD / 2;
      const tubeRadius = WD / 2;

      const geom = new THREE.TorusGeometry(ringRadius, tubeRadius, 32, 64);

      // ✅ Make colors read strongly (and consistently) under toneMapping
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

      mesh.position.set(r.x, -r.y, r.z ?? 0);
      mesh.rotation.set(0, tiltRad, Math.PI / 2);

      mesh.userData.row = r.row;
      mesh.userData.col = r.col;

      group.add(mesh);
      meshes.push(mesh);

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

    // Apply paint after building
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
  // ============================================================
  const applyOverlayToRings = async (ov: OverlayState) => {
    if (!ov) return;
    if (!meshesRef.current || meshesRef.current.length === 0) return;

    const src =
      overlayGetString(ov as any, ["dataUrl", "src", "url", "imageUrl"]) ?? null;
    if (!src) return;

    const offsetX = overlayGetNumeric(ov as any, ["offsetX", "x", "panX"], 0);
    const offsetY = overlayGetNumeric(ov as any, ["offsetY", "y", "panY"], 0);
    const scale = overlayGetNumeric(ov as any, ["scale"], 1);
    const opacity = clamp01(overlayGetNumeric(ov as any, ["opacity"], 1));

    const explicitW = overlayGetNumeric(
      ov as any,
      ["worldWidth", "widthWorld"],
      NaN
    );
    const explicitH = overlayGetNumeric(
      ov as any,
      ["worldHeight", "heightWorld"],
      NaN
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

    // Compute ring bounds in world space
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    for (const m of meshesRef.current) {
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

      const baseHex = paramsRef.current.ringColor || "#FFFFFF";
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

      for (const mesh of meshesRef.current) {
        const row = mesh.userData.row as number;
        const col = mesh.userData.col as number;
        if (row == null || col == null) continue;

        const key = `${row},${col}`;
        const wx = mesh.position.x;
        const wy = mesh.position.y;

        const sampled = sampleAtWorld(wx, wy);
        if (sampled) {
          next.set(key, sampled);
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat?.color?.set(sampled);
          if (mat) mat.needsUpdate = true;
        }
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
        initialZRef.current
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

      // OrbitControls configuration is applied in syncControlsButtons() every frame
      const ctr = controlsRef.current;
      if (ctr) ctr.update();
    },

    setPaintMode: (on: boolean) => {
      setLocalPaintMode(on);
      paintModeRef.current = on;
    },

    // ✅ IMPORTANT: this must set the REF used by syncControlsButtons()
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
        initialZRef.current
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
});

export default RingRenderer;