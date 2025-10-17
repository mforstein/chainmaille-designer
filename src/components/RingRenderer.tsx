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

type Props = {
  rings: Ring[];
  params: RenderParams;
  paint: PaintMap;
  setPaint: React.Dispatch<React.SetStateAction<PaintMap>>;
  initialPaintMode?: boolean;
  initialEraseMode?: boolean;
  initialRotationLocked?: boolean;
  activeColor: string;
};

// ============================================================
// Imperative API
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
  // Local states + synchronized refs
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

  // Saved initial camera state for reset/lock2D
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
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000
    );
    camera.position.set(0, 0, 240);
    cameraRef.current = camera;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Important for touch gesture routing (OrbitControls + our guards)
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.userSelect = "none";
    (renderer.domElement.style as any).webkitUserSelect = "none";
    (renderer.domElement.style as any).webkitTouchCallout = "none";
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
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.enableZoom = true;         // ✅ all zoom goes through OrbitControls
    controls.enablePan = true;
    controls.enableRotate = !initialRotationLocked;
    controls.zoomSpeed = 1.1;

    // ✅ Proper native pinch zoom
    controls.touches = {
      ONE: THREE.TOUCH.PAN,        // one-finger pan
      TWO: THREE.TOUCH.DOLLY_PAN,  // two-finger pinch zoom (and pan)
    };

    // ✅ Prevent browser/page pinch-zoom (iOS/Android)
    const preventTouchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    renderer.domElement.addEventListener("touchstart", preventTouchZoom, { passive: false });
    renderer.domElement.addEventListener("touchmove", preventTouchZoom, { passive: false });

    controlsRef.current = controls;

    // --- Mesh creation ---
    const ringGeo = new THREE.TorusGeometry(
      params.innerDiameter / 2,
      params.wireDiameter / 4,
      16,
      100
    );
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

    // --- Center model and fit camera ---
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    group.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera.fov * Math.PI) / 180;
    const fitZ = (maxDim / 2) / Math.tan(fov / 2) * 1.1;
    camera.position.set(0, 0, fitZ);
    controls.target.set(0, 0, 0);
    controls.update();

    // Save initial for reset/lock2D
    initialZRef.current = fitZ;
    initialTargetRef.current.set(0, 0, 0);
    // Let OrbitControls remember the state for reset()
    // (saveState is called internally on construction, but call once after fit)
    // @ts-ignore - saveState exists
    if (typeof (controls as any).saveState === "function") {
      (controls as any).saveState();
    }

    // --- Resize ---
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    onResize();

    // --- Paint + Pan (custom painting; OrbitControls still handles pan/zoom) ---
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let painting = false;
    let panning = false;
    let last = { x: 0, y: 0 };
    const activePointers = new Set<number>();

    const paintAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(meshesRef.current, false);
      if (hits.length > 0) {
        const key = (hits[0].object as any).ringKey as string;
        setPaint((prev) => {
          const n = new Map(prev);
          const colorToApply = eraseModeRef.current
            ? params.ringColor
            : activeColorRef.current;
          n.set(key, colorToApply);
          return n;
        });
      }
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      activePointers.add(e.pointerId);

      // 👉 If two pointers (pinch), let OrbitControls handle zoom; don't paint/pan
      if (activePointers.size > 1) return;

      if (paintModeRef.current) {
        painting = true;
        paintAt(e.clientX, e.clientY);
      } else {
        panning = true;
        last = { x: e.clientX, y: e.clientY };
      }
    };

    const onMove = (e: PointerEvent) => {
      // 👉 If two fingers are down, we’re pinch-zooming — skip painting/panning
      if (activePointers.size > 1) return;
      e.preventDefault();

      if (painting && paintModeRef.current) {
        paintAt(e.clientX, e.clientY);
      } else if (panning && !paintModeRef.current) {
        // Manual in-plane pan when rotation is locked
        if (lockRef.current && cameraRef.current && controlsRef.current) {
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

    const onUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) {
        painting = false;
        panning = false;
      }
    };

    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);

    // --- Wheel zoom (via OrbitControls) ---
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!controlsRef.current) return;
      if (e.deltaY < 0) controlsRef.current.dollyIn(1.1);
      else controlsRef.current.dollyOut(1.1);
      controlsRef.current.update();
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // --- Animate loop ---
    const animate = () => {
      requestAnimationFrame(animate);

      // Apply paint colors
      for (const m of meshesRef.current) {
        const key = (m as any).ringKey as string;
        const color = paintRef.current.get(key) || params.ringColor;
        (m.material as THREE.MeshStandardMaterial).color.set(color);
      }

      // Keep controls in sync with lock/paint states
      if (controlsRef.current) {
        const locked = lockRef.current;
        controlsRef.current.enableRotate = !locked;
        // Disable pan while painting (to avoid competing with paint gesture)
        controlsRef.current.enablePan = !paintModeRef.current || !locked
          ? true
          : false;
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
      renderer.domElement.removeEventListener("touchstart", preventTouchZoom);
      renderer.domElement.removeEventListener("touchmove", preventTouchZoom);
      mount.removeChild(renderer.domElement);
      controls.dispose();
      ringGeo.dispose();
    };
  }, []);

  // ============================================================
  // Dynamic Gesture Mapping (if rotation lock changes)
  // ============================================================
  useEffect(() => {
    const ctr = controlsRef.current;
    if (!ctr) return;

    if (rotationLocked) {
      ctr.enableRotate = false;
      (ctr as any).touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    } else {
      ctr.enableRotate = true;
      (ctr as any).touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    }
  }, [rotationLocked]);

useImperativeHandle(ref, (): RingRendererHandle => ({
zoomIn: () => {
  const cam = cameraRef.current;
  const ctr = controlsRef.current;
  if (!cam || !ctr) return;

  // Move camera toward target
  const dir = new THREE.Vector3();
  dir.subVectors(ctr.target, cam.position).normalize();
  cam.position.addScaledVector(dir, 0.1 * cam.position.distanceTo(ctr.target));
  ctr.update();
},

zoomOut: () => {
  const cam = cameraRef.current;
  const ctr = controlsRef.current;
  if (!cam || !ctr) return;

  // Move camera away from target
  const dir = new THREE.Vector3();
  dir.subVectors(cam.position, ctr.target).normalize();
  cam.position.addScaledVector(dir, 0.1 * cam.position.distanceTo(ctr.target));
  ctr.update();
},
  resetView: () => {
    const ctr = controlsRef.current;
    const cam = cameraRef.current;
    if (!ctr || !cam) return;

    if (typeof (ctr as any).reset === "function") (ctr as any).reset();
    ctr.update();
    rendererRef.current?.render(sceneRef.current!, cam);
  },
  toggleLock: () => {
    setRotationLocked((v) => {
      const newVal = !v;
      lockRef.current = newVal;
      const ctr = controlsRef.current;
      if (ctr) {
        ctr.enableRotate = !newVal;
        (ctr as any).touches = newVal
          ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
          : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      }
      return newVal;
    });
  },
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
      ctr.enableRotate = false;
      (ctr as any).touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
      ctr.update();
      rendererRef.current?.render(sceneRef.current!, cam);
    }
  },
  forceLockRotation: (locked: boolean) => {
    setRotationLocked(locked);
    lockRef.current = locked;
    const ctr = controlsRef.current;
    if (ctr) {
      ctr.enableRotate = !locked;
      (ctr as any).touches = locked
        ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
        : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      ctr.update();
    }
  },
  getState: () => ({
    paintMode: paintModeRef.current,
    eraseMode: eraseModeRef.current,
    rotationLocked: lockRef.current,
  }),
}));

  // ============================================================
  // Render container
  // ============================================================
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
});

export default RingRenderer;

// ============================================================
// Geometry generator
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