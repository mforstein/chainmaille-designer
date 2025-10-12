// src/components/RingRenderer.tsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export type Ring = {
  row: number;
  col: number;
  x: number;
  y: number;
  radius: number;
};

export interface RenderParams {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
  ringColor: string;
  bgColor: string;
  [key: string]: any;
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
  rotationEnabled?: boolean;
  scale?: number;
  setScale?: React.Dispatch<React.SetStateAction<number>>;
  offset?: { x: number; y: number };
  setOffset?: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  hoverRC?: { r: number; c: number } | null;
  setHoverRC?: React.Dispatch<
    React.SetStateAction<{ r: number; c: number } | null>
  >;
};

export default function RingRenderer({
  rings,
  params,
  paint,
  setPaint,
  paintMode,
  eraseMode,
  activeColor,
  rotationEnabled = true,
  scale = 1.0,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [panningEnabled, setPanningEnabled] = useState(false);

  // --- Zoom handling ---
  const zoomRef = useRef(1);
  const MIN_Z = 6;
  const MAX_Z = 1200;
  const BASE_Z = 80;

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // ---------------- Scene ----------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(params.bgColor || "#0F1115");

    // ---------------- Camera ----------------
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000
    );
    camera.position.set(0, 0, BASE_Z);
    cameraRef.current = camera;

    // ---------------- Renderer ----------------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    (renderer.domElement.style as any).touchAction = "none";
    mount.appendChild(renderer.domElement);

    // ---------------- Lights ----------------
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const directional = new THREE.DirectionalLight(0xffffff, 1.0);
    directional.position.set(1, 1, 2);
    scene.add(ambient, directional);

    // ---------------- Controls ----------------
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enabled = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = true;

    const applyControlToggles = () => {
      controls.enableRotate = !!rotationEnabled;
      controls.enablePan = !!panningEnabled;
      controls.mouseButtons = {
        LEFT: panningEnabled ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    };
    applyControlToggles();

    // ---------------- Geometry ----------------
    const ringGroup = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(
      params.innerDiameter / 2,
      params.wireDiameter / 4,
      16,
      100
    );

    const meshes: THREE.Mesh[] = [];
    rings.forEach((ring) => {
      const color = paint.get(keyAt(ring.row, ring.col)) || params.ringColor;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        metalness: 0.85,
        roughness: 0.25,
      });

      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.set(ring.x, -ring.y, 0);
      mesh.rotation.y = ring.row % 2 === 0 ? 0.25 : -0.25;
      (mesh as any).ringKey = keyAt(ring.row, ring.col);
      ringGroup.add(mesh);
      meshes.push(mesh);
    });

    const boundsX = params.cols * params.innerDiameter * 0.6;
    const boundsY = params.rows * params.innerDiameter * 0.55;
    ringGroup.position.set(-boundsX / 2, boundsY / 2, 0);
    scene.add(ringGroup);

    // ---------------- Raycast Paint ----------------
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (event: MouseEvent) => {
      if (!paintMode && !eraseMode) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(meshes)[0];
      if (!hit) return;
      const mesh = hit.object as THREE.Mesh & { ringKey: string };
      const ringKey = (mesh as any).ringKey as string;
      setPaint((prev) => {
        const next = new Map(prev);
        next.set(ringKey, eraseMode ? null : activeColor);
        return next;
      });
    };
    renderer.domElement.addEventListener("click", handleClick);

    // ---------------- Wheel Zoom ----------------
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      zoomRef.current = Math.max(0.05, Math.min(20, zoomRef.current * factor));
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // ---------------- Touch Gestures (Pinch Zoom) ----------------
    let lastDist = 0;
    const getDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getDist(e.touches[0], e.touches[1]);
        if (lastDist > 0) {
          const scaleFactor = dist / lastDist;
          zoomRef.current = Math.max(
            0.05,
            Math.min(20, zoomRef.current / scaleFactor)
          );
        }
        lastDist = dist;
      }
    };
    renderer.domElement.addEventListener("touchmove", onTouchMove, {
      passive: false,
    });

    // ---------------- Render Loop ----------------
    const animate = () => {
      requestAnimationFrame(animate);
      applyControlToggles();

      // Combine scale prop and internal zoomRef
      const zoom = (scale ?? 1) * zoomRef.current;
      const targetZ = BASE_Z / Math.max(0.05, Math.min(20, zoom));
      camera.position.z = THREE.MathUtils.clamp(targetZ, MIN_Z, MAX_Z);

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ---------------- Cleanup ----------------
    return () => {
      mount.removeChild(renderer.domElement);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", () => {});
      controls.dispose();
      ringGeo.dispose();
    };
  }, [
    rings,
    params,
    paint,
    paintMode,
    eraseMode,
    activeColor,
    rotationEnabled,
    panningEnabled,
    scale,
    setPaint,
  ]);

  // ---------------- UI ----------------
  return (
    <div style={{ position: "relative", width: "70vw", height: "70vh" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Pan toggle */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 8,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setPanningEnabled((p) => !p)}
          title="Toggle panning (drag to move the scene)"
          style={{
            background: panningEnabled ? "#555" : "#222",
            color: "#fff",
            border: "1px solid #444",
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
          }}
        >
          {panningEnabled ? "Lock Pan" : "Pan"}
        </button>
      </div>

      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          right: 16,
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => {
            zoomRef.current = Math.max(0.05, Math.min(20, zoomRef.current * 0.9)); // zoom in
          }}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
            cursor: "pointer",
            fontSize: 18,
            boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
        >
          +
        </button>

        <button
          onClick={() => {
            zoomRef.current = Math.max(0.05, Math.min(20, zoomRef.current * 1.1)); // zoom out
          }}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
            cursor: "pointer",
            fontSize: 18,
            boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
        >
          –
        </button>
      </div>
    </div>
  );
}

/** Geometry generator — unchanged */
export function generateRings(params: {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
}): Ring[] {
  const rings: Ring[] = [];
  const id = params.innerDiameter;
  const wd = params.wireDiameter;

  const pitchX = id * 0.87;
  const pitchY = id * 0.75;
  const radius = (id + wd) / 2;

  for (let r = 0; r < params.rows; r++) {
    for (let c = 0; c < params.cols; c++) {
      const offsetX = r % 2 === 0 ? 0 : pitchX / 2;
      const x = c * pitchX + offsetX;
      const y = r * pitchY;
      rings.push({ row: r, col: c, x, y, radius });
    }
  }
  return rings;
}