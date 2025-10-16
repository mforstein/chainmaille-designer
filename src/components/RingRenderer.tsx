// ==============================
// src/components/RingRenderer.tsx
// ==============================
import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// ---------------- Types ----------------
export type Ring = { row: number; col: number; x: number; y: number; radius: number };

export interface RenderParams {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
  ringColor: string;
  bgColor: string;
}

export type PaintMap = Map<string, string | null>;
const keyAt = (r: number, c: number) => `${r},${c}`;

type Props = {
  rings: Ring[];
  params: RenderParams;
  paint: PaintMap;
  setPaint: React.Dispatch<React.SetStateAction<PaintMap>>;
  initialPaintMode?: boolean;        // keep: allows parent to set initial paint mode
  initialEraseMode?: boolean;        // keep: allows parent to set initial erase mode
  initialRotationLocked?: boolean;   // keep: start locked 2D or not
  activeColor: string;               // keep: current color to paint
};

// ============================================================
// Imperative API so toolbars can control the renderer
// ============================================================
export type RingRendererHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  toggleLock: () => void;
  setPaintMode: (on: boolean) => void;
  toggleErase: () => void;
  clearPaint: () => void;
  lock2DView: () => void;
  forceLockRotation: (locked: boolean) => void;
  getState: () => {
    paintMode: boolean;
    eraseMode: boolean;
    rotationLocked: boolean;
  };
};

// ============================================================
// Main Renderer Component
// ============================================================
const RingRenderer = forwardRef<RingRendererHandle, Props>(function RingRenderer(
  {
    rings,
    params,
    paint,
    setPaint,
    initialPaintMode = true,
    initialEraseMode = false,
    initialRotationLocked = true,
    activeColor,
  }: Props,
  ref
) {
  // -----------------------------------------------
  // Refs for scene, camera, controls, and meshes
  // -----------------------------------------------
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const meshesRef = useRef<THREE.Mesh[]>([]);

  // -----------------------------------------------
  // Local states + synchronized refs for modes
  // -----------------------------------------------
  const [localPaintMode, setLocalPaintMode] = useState<boolean>(initialPaintMode);
  const [localEraseMode, setLocalEraseMode] = useState<boolean>(initialEraseMode);
  const [rotationLocked, setRotationLocked] = useState<boolean>(initialRotationLocked);

  const paintModeRef = useRef(localPaintMode);
  const eraseModeRef = useRef(localEraseMode);
  const lockRef = useRef(rotationLocked);
  const activeColorRef = useRef(activeColor);
  const paintRef = useRef(paint);

  useEffect(() => { paintModeRef.current = localPaintMode; }, [localPaintMode]);
  useEffect(() => { eraseModeRef.current = localEraseMode; }, [localEraseMode]);
  useEffect(() => { lockRef.current = rotationLocked; }, [rotationLocked]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { paintRef.current = paint; }, [paint]);

  // -----------------------------------------------
  // Zoom model & camera state
  // -----------------------------------------------
  const zoomRef = useRef(1);
  const BASE_Z = 80;
  const MIN_Z = 6;
  const MAX_Z = 1200;

  const initialZRef = useRef<number>(200);
  const initialTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // -----------------------------------------------
  // Scene initialization
  // -----------------------------------------------
useEffect(() => {
  if (!mountRef.current) return;
  const mount = mountRef.current;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(params.bgColor || "#0F1115");
  sceneRef.current = scene;

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 2000);
  camera.position.set(0, 0, BASE_Z * 3);
  cameraRef.current = camera;

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ✅ Touch Gesture Fix for iPhone/iPad (before mounting)
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.userSelect = "none";
  (renderer.domElement.style as any).webkitUserSelect = "none";      // Safari iOS
  (renderer.domElement.style as any).webkitTouchCallout = "none";    // Disable long-press

  mount.appendChild(renderer.domElement);
  rendererRef.current = renderer;

  // --- Lighting ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(3, 5, 10);
  scene.add(dir);

  // --- OrbitControls ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.screenSpacePanning = true;
  controls.enableRotate = false; // keep flat 2D
  controls.enableZoom = true;
  controls.zoomSpeed = 1.2;
  controls.enablePan = true;

  // ✅ Enable two-finger pinch zoom & pan (TS-safe)
  (controls as any).touches = {
    ONE: THREE.TOUCH.PAN,        // one finger pans
    TWO: THREE.TOUCH.DOLLY_PAN,  // two fingers pinch zoom + pan
  };

  controlsRef.current = controls;

  // --- Ring Geometry ---
  const ringGeo = new THREE.TorusGeometry(params.innerDiameter / 2, params.wireDiameter / 4, 16, 100);
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];

  rings.forEach((r) => {
    const mesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshStandardMaterial({
        color: params.ringColor,
        metalness: 0.85,
        roughness: 0.25,
      })
    );
    mesh.position.set(r.x, -r.y, 0);
    mesh.rotation.y = r.row % 2 === 0 ? 0.25 : -0.25;
    (mesh as any).ringKey = `${r.row},${r.col}`;
    meshes.push(mesh);
    group.add(mesh);
  });

  meshesRef.current = meshes;
  scene.add(group);

  // --- Fit Camera ---
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  const fitZ = (maxDim / 2) / Math.tan(fov / 2) * 1.1;
  camera.position.set(0, 0, fitZ);
  controls.target.set(0, 0, 0);
  controls.update();

  zoomRef.current = BASE_Z / fitZ;
  initialZRef.current = fitZ;
  initialTargetRef.current = new THREE.Vector3(0, 0, 0);

  // --- Resize Handling ---
  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);
  onResize();

  // --- Painting + Panning Logic ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let painting = false;
  let panning = false;
  let last = { x: 0, y: 0 };

  const paintAt = (clientX: number, clientY: number) => {
    if (!rendererRef.current || !cameraRef.current) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    const hits = raycaster.intersectObjects(meshesRef.current, false);
    if (hits.length > 0) {
      const key = (hits[0].object as any).ringKey as string;
      setPaint((prev) => {
        const n = new Map(prev);
        const colorToApply = eraseModeRef.current ? params.ringColor : activeColorRef.current;
        n.set(key, colorToApply);
        return n;
      });
    }
  };

  const onDown = (e: PointerEvent) => {
    e.preventDefault(); // ⛔️ Prevent page scroll/zoom
    if (paintModeRef.current) {
      painting = true;
      paintAt(e.clientX, e.clientY);
    } else {
      panning = true;
      last = { x: e.clientX, y: e.clientY };
    }
  };

  const onMove = (e: PointerEvent) => {
    e.preventDefault(); // ⛔️ Prevent scroll during paint
    if (painting && paintModeRef.current) {
      paintAt(e.clientX, e.clientY);
    } else if (panning && !paintModeRef.current) {
      if (lockRef.current && cameraRef.current && controlsRef.current && rendererRef.current) {
        const cam = cameraRef.current;
        const ctr = controlsRef.current;
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };

        const fovRad = (cam.fov * Math.PI) / 180;
        const halfHWorld = Math.tan(fovRad / 2) * cam.position.z;
        const halfWWorld = halfHWorld * cam.aspect;
        const perPixelX = (halfWWorld * 2) / renderer.domElement.clientWidth;
        const perPixelY = (halfHWorld * 2) / renderer.domElement.clientHeight;

        const moveX = -dx * perPixelX;
        const moveY = dy * perPixelY;

        cam.position.x += moveX;
        cam.position.y += moveY;
        ctr.target.x += moveX;
        ctr.target.y += moveY;
        ctr.update();
      }
    }
  };

  const onUp = () => { painting = false; panning = false; };

  // --- Add Event Listeners ---
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerup", onUp);

  // --- Wheel Zoom (Desktop) ---
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomRef.current = THREE.MathUtils.clamp(zoomRef.current * factor, 0.05, 20);
  };
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  // --- Animation Loop ---
  const animate = () => {
    requestAnimationFrame(animate);
    for (const m of meshesRef.current) {
      const key = (m as any).ringKey as string;
      const color = paintRef.current.get(key) || params.ringColor;
      (m.material as THREE.MeshStandardMaterial).color.set(color);
    }

    const z = BASE_Z / zoomRef.current;
    camera.position.z = THREE.MathUtils.clamp(z, MIN_Z, MAX_Z);

    if (controlsRef.current) {
      const locked = lockRef.current;
      controlsRef.current.enableRotate = !locked;
      controlsRef.current.enablePan = !paintModeRef.current && !locked;
      controlsRef.current.update();
    }

    renderer.render(scene, camera);
  };
  animate();

  // --- Cleanup ---
  return () => {
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("pointerdown", onDown);
    renderer.domElement.removeEventListener("pointermove", onMove);
    renderer.domElement.removeEventListener("pointerup", onUp);
    renderer.domElement.removeEventListener("wheel", onWheel);
    mount.removeChild(renderer.domElement);
    controls.dispose();
    ringGeo.dispose();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
  // -----------------------------------------------
  // Imperative API exposed to parent
  // -----------------------------------------------
  useImperativeHandle(ref, (): RingRendererHandle => ({
    zoomIn: () => { zoomRef.current = Math.min(zoomRef.current * 1.1, 20); },
    zoomOut: () => { zoomRef.current = Math.max(zoomRef.current / 1.1, 0.05); },
    resetView: () => {
      const cam = cameraRef.current;
      const ctr = controlsRef.current;
      if (!cam || !ctr) return;
      cam.position.set(0, 0, initialZRef.current);
      ctr.target.copy(initialTargetRef.current);
      ctr.update();
      zoomRef.current = BASE_Z / initialZRef.current;
    },
    toggleLock: () => setRotationLocked((v) => !v),
    setPaintMode: (on: boolean) => setLocalPaintMode(on),
    toggleErase: () => setLocalEraseMode((v) => !v),
    clearPaint: () => setPaint(new Map()),
    lock2DView: () => {
      setRotationLocked(true);
      const cam = cameraRef.current;
      const ctr = controlsRef.current;
      if (cam && ctr) {
        cam.position.set(0, 0, initialZRef.current);
        ctr.target.copy(initialTargetRef.current);
        ctr.update();
      }
    },
    forceLockRotation: (locked: boolean) => setRotationLocked(locked),
    getState: () => ({
      paintMode: paintModeRef.current,
      eraseMode: eraseModeRef.current,
      rotationLocked: lockRef.current,
    }),
  }));

  // -----------------------------------------------
  // Render container
  // -----------------------------------------------
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
});

export default RingRenderer;

// ============================================================
// Geometry generator (used by App.tsx to build the grid)
// ============================================================
export function generateRings(p: {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
}): Ring[] {
  const rings: Ring[] = [];
  const id = p.innerDiameter;
  const wd = p.wireDiameter;
  const pitchX = id * 0.87;
  const pitchY = id * 0.75;

  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const off = r % 2 === 0 ? 0 : pitchX / 2;
      rings.push({
        row: r,
        col: c,
        x: c * pitchX + off,
        y: r * pitchY,
        radius: (id + wd) / 2,
      });
    }
  }
  return rings;
}

// ================== END RingRenderer.tsx ==================