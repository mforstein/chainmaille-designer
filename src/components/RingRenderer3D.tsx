// src/components/RingRenderer3D.tsx
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export type ColorMode = "solid" | "checker";

export interface Ring {
  row: number;
  col: number;
  x: number; // in mm
  y: number; // in mm
  radius: number; // innerDiameter / 2 (mm)
}

export interface RenderParams {
  rows: number;
  cols: number;
  innerDiameter: number; // mm
  wireDiameter: number;  // mm
  colorMode: ColorMode;
  ringColor: string;
  altColor: string;
  bgColor: string;
}

type PaintMap = Map<string, string | null>; // "r,c" -> hex
const keyAt = (r: number, c: number) => `${r},${c}`;

type Props = {
  rings: Ring[];
  params: RenderParams;

  paint: PaintMap;
  setPaint: React.Dispatch<React.SetStateAction<PaintMap>>;

  paintMode: boolean;
  eraseMode: boolean;
  activeColor: string;

  // optional hover support (kept to match your app shape)
  hoverRC?: { r: number; c: number } | null;
  setHoverRC?: (rc: { r: number; c: number } | null) => void;
};

export default function RingRenderer3D({
  rings,
  params,
  paint,
  setPaint,
  paintMode,
  eraseMode,
  activeColor,
  setHoverRC,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycaster = useRef(new THREE.Raycaster()).current;
  const pointer = useRef(new THREE.Vector2()).current;

  // one mesh per ring, keep handles to recolor quickly
  const meshByKey = useRef<Map<string, THREE.Mesh>>(new Map());

  const mmToScene = 1; // use mm as world units (easier math)

  // compute default color when not painted
  const defaultColorFor = (r: number, c: number) => {
    if (params.colorMode === "solid") return params.ringColor;
    return (r + c) % 2 === 0 ? params.ringColor : params.altColor;
  };

  // three.js scene (init once)
  useEffect(() => {
    const container = containerRef.current!;
    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(params.bgColor);
    sceneRef.current = scene;

    // camera: orthographic so “2D plan view” stays true to scale
    const makeCamera = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const halfW = w / 2;
      const halfH = h / 2;
      const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 5000);
      cam.position.set(0, 0, 1000); // straight on
      cam.zoom = 6;                  // initial zoom (tweak as you like)
      cam.updateProjectionMatrix();
      return cam;
    };
    const camera = makeCamera();
    cameraRef.current = camera;

    // lights (soft studio look)
    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(amb);
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dir1.position.set(300, 500, 900);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-400, -300, 700);
    scene.add(dir1, dir2);

    // controls: pan + zoom only (no rotation)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.enableRotate = true; // ✅ allow orbit
controls.minDistance = 50;
controls.maxDistance = 3000;
controls.zoomSpeed = 1.0;
controls.panSpeed = 0.8;
controlsRef.current = controls;

    // resize
    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      const w = container.clientWidth;
      const h = container.clientHeight;
      const cam = cameraRef.current!;
      cam.left   = -w / 2;
      cam.right  =  w / 2;
      cam.top    =  h / 2;
      cam.bottom = -h / 2;
      cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // render loop
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      meshByKey.current.clear();
      scene.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // background color update
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(params.bgColor);
  }, [params.bgColor]);

  // (re)build ring meshes whenever geometry count/size changes
  useEffect(() => {
    const scene = sceneRef.current!;
    if (!scene) return;

    // clear old
    for (const m of meshByKey.current.values()) scene.remove(m);
    meshByKey.current.clear();

    // torus dimensions
    const tubeR = (params.wireDiameter / 2) * mmToScene; // wire radius
    const majorRFromInner = (inner: number) => (inner / 2 + params.wireDiameter / 2) * mmToScene;

    // geometry shared (we can’t share majorR because it depends on ring size; here all same)
    const majorR = majorRFromInner(params.innerDiameter);
    const geo = new THREE.TorusGeometry(majorR, tubeR, 22, 60);

    // create mesh per ring
    for (const r of rings) {
      const key = keyAt(r.row, r.col);

      // material color
      const baseHex = paint.get(key) ?? defaultColorFor(r.row, r.col);
      const color = new THREE.Color(baseHex);

      const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.9,
        roughness: 0.25,
        envMapIntensity: 1.0,
      });

      const mesh = new THREE.Mesh(geo, mat);

      // place rings: Eu 4in1 look — subtle Z staggering and tilt
      // Rows alternate slight tilt; columns get tiny Z offsets so the "over/under" reads.

const rowShift = (r.row % 2) * (params.innerDiameter * 0.5);
const colShift = (r.col % 2) * (params.innerDiameter * 0.25);
mesh.position.set(
  r.x * mmToScene + rowShift,
  -r.y * mmToScene,
  colShift
);
// alternating tilts to create interlinking illusion
mesh.rotation.x = (r.row % 2 === 0 ? Math.PI / 8 : -Math.PI / 8);
mesh.rotation.z = (r.col % 2 === 0 ? Math.PI / 2 : 0);
      scene.add(mesh);
      meshByKey.current.set(key, mesh);
    }
  }, [rings, params.innerDiameter, params.wireDiameter, paint, params.colorMode, params.ringColor, params.altColor]);

  // recolor on paint or theme change (without rebuilding meshes)
  useEffect(() => {
    for (const [key, mesh] of meshByKey.current.entries()) {
      const [rs, cs] = key.split(",");
      const r = parseInt(rs, 10);
      const c = parseInt(cs, 10);
      const hex = paint.get(key) ?? defaultColorFor(r, c);
      (mesh.material as THREE.MeshStandardMaterial).color.set(hex);
    }
  }, [paint, params.colorMode, params.ringColor, params.altColor]);

  // ----- picking / painting -----
  useEffect(() => {
    const renderer = rendererRef.current!;
    const dom = renderer.domElement;
    const onMove = (ev: PointerEvent) => {
      pointer.x = (ev.offsetX / dom.clientWidth) * 2 - 1;
      pointer.y = -(ev.offsetY / dom.clientHeight) * 2 + 1;

      raycaster.setFromCamera(pointer, cameraRef.current!);
      const hits = raycaster.intersectObjects([...meshByKey.current.values()], false);
      if (hits.length && setHoverRC) {
        const mesh = hits[0].object as THREE.Mesh;
        const entry = [...meshByKey.current.entries()].find(([, m]) => m === mesh);
        if (entry) {
          const [key] = entry;
          const [r, c] = key.split(",").map(Number);
          setHoverRC({ r, c });
        }
      } else if (setHoverRC) {
        setHoverRC(null);
      }
    };

    let isPainting = false;
    const paintTarget = (mesh: THREE.Object3D | null) => {
      if (!mesh) return;
      const entry = [...meshByKey.current.entries()].find(([, m]) => m === mesh);
      if (!entry) return;
      const [key] = entry;
      setPaint((prev) => {
        const next = new Map(prev);
        next.set(key, eraseMode ? null : activeColor);
        return next;
      });
    };

    const onDown = (ev: PointerEvent) => {
      if (!paintMode) return; // let OrbitControls pan/zoom
      raycaster.setFromCamera(pointer, cameraRef.current!);
      const hits = raycaster.intersectObjects([...meshByKey.current.values()], false);
      if (hits.length) {
        isPainting = true;
        paintTarget(hits[0].object);
      }
    };
    const onDrag = (ev: PointerEvent) => {
      if (!isPainting) return;
      raycaster.setFromCamera(pointer, cameraRef.current!);
      const hits = raycaster.intersectObjects([...meshByKey.current.values()], false);
      if (hits.length) paintTarget(hits[0].object);
    };
    const onUp = () => (isPainting = false);

    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onDrag);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointerleave", onUp);
    return () => {
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onDrag);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointerleave", onUp);
    };
  }, [paintMode, eraseMode, activeColor, setPaint, setHoverRC]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}