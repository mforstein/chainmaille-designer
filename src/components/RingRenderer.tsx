// src/components/RingRenderer.tsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import FloatingPanel from "./FloatingPanel";

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
  paintMode: boolean;
  eraseMode: boolean;
  activeColor: string;
  rotationEnabled: boolean;
};

export default function RingRenderer({
  rings,
  params,
  paint,
  setPaint,
  paintMode,
  eraseMode,
  activeColor,
  rotationEnabled,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const meshesRef = useRef<THREE.Mesh[]>([]);

  // runtime flags – use state for UI, mirror to refs for animate loop
  const [localPaintMode, setLocalPaintMode] = useState(paintMode);
  const [localEraseMode, setLocalEraseMode] = useState(eraseMode);
  const [rotationLocked, setRotationLocked] = useState(true); // lock = 2D mode
  const paintModeRef = useRef(localPaintMode);
  const eraseModeRef = useRef(localEraseMode);
  const lockRef = useRef(rotationLocked);

  useEffect(() => { paintModeRef.current = localPaintMode; }, [localPaintMode]);
  useEffect(() => { eraseModeRef.current = localEraseMode; }, [localEraseMode]);
  useEffect(() => { lockRef.current = rotationLocked; }, [rotationLocked]);

  // zoom model
  const zoomRef = useRef(1);
  const BASE_Z = 80;
  const MIN_Z = 6;
  const MAX_Z = 1200;

  // paint map ref to avoid stale closure in animate
  const paintRef = useRef(paint);
  useEffect(() => { paintRef.current = paint; }, [paint]);

  // initial (for reset)
  const initialZRef = useRef<number>(200);
  const initialTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // one-time init
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(params.bgColor || "#0F1115");
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000
    );
    camera.position.set(0, 0, BASE_Z * 3);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    (renderer.domElement.style as any).touchAction = "none";
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 10);
    scene.add(dir);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    controls.enableRotate = false; // we’ll flip this at runtime if unlocked
    controlsRef.current = controls;

    // Geometry (perfect rings)
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
      (mesh as any).ringKey = keyAt(r.row, r.col);
      meshes.push(mesh);
      group.add(mesh);
    });
    meshesRef.current = meshes;

    const boundsX = params.cols * params.innerDiameter * 0.6;
    const boundsY = params.rows * params.innerDiameter * 0.55;
    group.position.set(-boundsX / 2, boundsY / 2, 0);
    scene.add(group);

    // Fit once, and freeze as "initial"
    const fitZ = Math.max(BASE_Z, Math.max(boundsX, boundsY));
    camera.position.set(0, 0, fitZ);
    controls.target.set(0, 0, 0);
    controls.update();
    zoomRef.current = BASE_Z / fitZ;
    initialZRef.current = fitZ;
    initialTargetRef.current = controls.target.clone();

    // Painting helpers
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
          n.set(key, eraseModeRef.current ? null : activeColor);
          return n;
        });
      }
    };

    const onDown = (e: PointerEvent) => {
      if (paintModeRef.current) {
        painting = true;
        paintAt(e.clientX, e.clientY);
      } else {
        panning = true;
        last = { x: e.clientX, y: e.clientY };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (painting && paintModeRef.current) {
        paintAt(e.clientX, e.clientY);
      } else if (panning && !paintModeRef.current) {
        // 2D PAN when locked; when unlocked use OrbitControls’ native rotate/pan
        if (lockRef.current && cameraRef.current && controlsRef.current && rendererRef.current) {
          const cam = cameraRef.current;
          const ctr = controlsRef.current;
          const dx = e.clientX - last.x;
          const dy = e.clientY - last.y;
          last = { x: e.clientX, y: e.clientY };

          // world units per pixel at current depth
          const fovRad = (cam.fov * Math.PI) / 180;
          const halfHWorld = Math.tan(fovRad / 2) * cam.position.z;
          const halfWWorld = halfHWorld * cam.aspect;
          const perPixelX = (halfWWorld * 2) / renderer.domElement.clientWidth;
          const perPixelY = (halfHWorld * 2) / renderer.domElement.clientHeight;

          // Drag left -> content follows (so camera/target move opposite)
          const moveX = -dx * perPixelX;
          const moveY = dy * perPixelY; // screen y grows down, world y grows up

          cam.position.x += moveX;
          cam.position.y += moveY;
          ctr.target.x += moveX;
          ctr.target.y += moveY;
          ctr.update();
        }
      }
    };

    const onUp = () => {
      painting = false;
      panning = false;
    };

    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);

    // Zoom (wheel)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomRef.current = THREE.MathUtils.clamp(zoomRef.current * factor, 0.05, 20);
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // Resize
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Animate
    const animate = () => {
      requestAnimationFrame(animate);

      // live recolor from paintRef
      for (const m of meshesRef.current) {
        const key = (m as any).ringKey as string;
        const color = paintRef.current.get(key) || params.ringColor;
        (m.material as THREE.MeshStandardMaterial).color.set(color);
      }

      // camera Z from zoom model
      const z = BASE_Z / zoomRef.current;
      camera.position.z = THREE.MathUtils.clamp(z, MIN_Z, MAX_Z);

      // runtime controls flags (no re-init = no snap)
      if (controlsRef.current) {
        const locked = lockRef.current;
        // When unlocked, allow native OrbitControls rotate/pan (3D look-around)
        controlsRef.current.enableRotate = !locked;
        controlsRef.current.enablePan = !paintModeRef.current && !locked; // native pan only when unlocked & not painting
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
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
    // IMPORTANT: init exactly once (no deps that cause rebuilds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Panel callbacks (update state + refs correctly)
  const handleTogglePaint = () => setLocalPaintMode((v) => !v);
  const handleToggleErase = () => setLocalEraseMode((v) => !v);
  const handleToggleLock = () => setRotationLocked((v) => !v);

  const handleZoomIn = () => {
    zoomRef.current = Math.min(zoomRef.current * 1.1, 20);
  };
  const handleZoomOut = () => {
    zoomRef.current = Math.max(zoomRef.current / 1.1, 0.05);
  };

  const handleReset = () => {
    const cam = cameraRef.current;
    const ctr = controlsRef.current;
    if (!cam || !ctr) return;
    cam.position.set(0, 0, initialZRef.current);
    ctr.target.copy(initialTargetRef.current);
    ctr.update();
    zoomRef.current = BASE_Z / initialZRef.current;
  };

  return (
    <div style={{ position: "relative", width: "70vw", height: "70vh" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <FloatingPanel
        paintMode={localPaintMode}
        eraseMode={localEraseMode}
        rotationLocked={rotationLocked}
        onTogglePaint={handleTogglePaint}
        onToggleErase={handleToggleErase}
        onToggleLock={handleToggleLock}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleReset}
        onClearPaint={() => setPaint(new Map())} 
      />
    </div>
  );
}

// ---------------- Geometry generator (unchanged “perfect rings”) ----------------
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