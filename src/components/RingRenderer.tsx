// File: src/components/RingRenderer.tsx

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

// ============================================================
// === Constants & Helpers ===================================
// ============================================================
const INCH_TO_MM = 25.4;

export function parseInchFractionToInches(v: string | number): number {
  if (typeof v === "number") return v;
  const s = v.replace(/"/g, "").trim();
  if (s.includes("/")) {
    const [num, den] = s.split("/").map(Number);
    if (!isFinite(num) || !isFinite(den) || den === 0)
      throw new Error(`Invalid inch fraction: ${v}`);
    return num / den;
  }
  const n = Number(s);
  if (!isFinite(n)) throw new Error(`Invalid inch numeric value: ${v}`);
  return n;
}

export function inchesToMm(inches: number) {
  return inches * INCH_TO_MM;
}

export function computeRingVarsFixedID(
  idInput: string | number,
  wdMm: string | number
) {
  let ID_mm: number;

  if (typeof idInput === "number" && idInput > 25) {
    ID_mm = idInput;
  } else {
    const id_in = parseInchFractionToInches(idInput);
    ID_mm = inchesToMm(id_in);
  }

  const WD_mm = typeof wdMm === "number" ? wdMm : Number(wdMm);
  if (!isFinite(WD_mm)) throw new Error(`Invalid WD: ${wdMm}`);

  const OD_mm = ID_mm + 2 * WD_mm;
  const AR = ID_mm / WD_mm;

  return {
    ID_mm,
    WD_mm,
    OD_mm,
    AR,
    ID_mm_disp: +ID_mm.toFixed(4),
    WD_mm_disp: +WD_mm.toFixed(3),
    OD_mm_disp: +OD_mm.toFixed(4),
    AR_disp: +AR.toFixed(3),
  };
}

// ============================================================
// === Types ==================================================
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
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
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
// === Utility: Camera Dolly =================================
// ============================================================
function dollyCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls | undefined,
  factor: number
) {
  if (controls && typeof (controls as any).dollyIn === "function") {
    if (factor > 1) (controls as any).dollyIn(factor);
    else (controls as any).dollyOut(1 / factor);
    controls.update();
    return;
  }
  const target = controls ? controls.target : new THREE.Vector3(0, 0, 0);
  const dir = new THREE.Vector3()
    .subVectors(camera.position, target)
    .multiplyScalar(factor);
  camera.position.copy(target).add(dir);
  camera.updateProjectionMatrix();
  }
// ============================================================
// === Main Component ========================================
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
  },
  ref
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const groupRef = useRef<THREE.Group>();

  // Local UI states
  const [localPaintMode, setLocalPaintMode] = useState(initialPaintMode);
  const [localEraseMode, setLocalEraseMode] = useState(initialEraseMode);
  const [rotationLocked, setRotationLocked] = useState(initialRotationLocked);

  // Refs to mirror real-time states
  const paintModeRef = useRef(localPaintMode);
  const eraseModeRef = useRef(localEraseMode);
  const lockRef = useRef(rotationLocked);
  const activeColorRef = useRef(activeColor);
  const paintRef = useRef(paint);
  const paramsRef = useRef(params);

  // Sync effects
  useEffect(() => { paintModeRef.current = localPaintMode; }, [localPaintMode]);
  useEffect(() => { eraseModeRef.current = localEraseMode; }, [localEraseMode]);
  useEffect(() => { lockRef.current = rotationLocked; }, [rotationLocked]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { paintRef.current = paint; }, [paint]);
  useEffect(() => { paramsRef.current = params; }, [params]);

  const initialZRef = useRef(240);
  const initialTargetRef = useRef(new THREE.Vector3(0, 0, 0));

  // ============================================================
  // Init Scene / Renderer
  // ============================================================
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // Cleanup old renderer if any
    if (rendererRef.current) {
      try {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
        mount.replaceChildren();
      } catch (err) {
        console.warn("Renderer cleanup failed:", err);
      }
    }

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
    camera.position.set(0, 0, initialZRef.current);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(4, 6, 10);
    scene.add(dir);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = !initialRotationLocked;
    controls.zoomSpeed = 1.1;
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } as any;
    controlsRef.current = controls;

    // Prevent two-finger zoom
    const preventTouchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    renderer.domElement.addEventListener("touchstart", preventTouchZoom, { passive: false });
    renderer.domElement.addEventListener("touchmove", preventTouchZoom, { passive: false });

    // Resize
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    onResize();

    // Painting system
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let painting = false;
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
          const colorToApply = eraseModeRef.current ? null : activeColorRef.current;
          n.set(key, colorToApply);
          return n;
        });
      }
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      activePointers.add(e.pointerId);
      if (activePointers.size > 1) return;
      if (paintModeRef.current && lockRef.current) {
        painting = true;
        paintAt(e.clientX, e.clientY);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (activePointers.size > 1) return;
      if (painting && paintModeRef.current && lockRef.current) {
        e.preventDefault();
        paintAt(e.clientX, e.clientY);
      }
    };
    const onUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) painting = false;
    };

    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);

      // live recolor
      const baseColor = paramsRef.current.ringColor;
      for (const m of meshesRef.current) {
        const key = (m as any).ringKey as string;
        const color = paintRef.current.get(key) ?? baseColor;
        (m.material as THREE.MeshStandardMaterial).color.set(color);
      }

      // Controls dynamic behavior
      if (controlsRef.current) {
        const c = controlsRef.current;
        const locked = lockRef.current;
        const paintingActive = paintModeRef.current;

        c.enableRotate = !locked;
        c.enablePan = !paintingActive;

        if (paintingActive) {
          c.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          };
        } else if (locked) {
          c.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.PAN,
          };
          c.enableRotate = false;
          c.enableZoom = true;
        } else {
          c.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          };
          c.enableRotate = true;
          c.enableZoom = true;
        }

        c.update();
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
      renderer.domElement.removeEventListener("touchstart", preventTouchZoom);
      renderer.domElement.removeEventListener("touchmove", preventTouchZoom);

      if (sceneRef.current) {
        sceneRef.current.traverse((obj: any) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material))
              obj.material.forEach((m: any) => m.dispose());
            else obj.material.dispose();
          }
        });
        sceneRef.current.clear();
      }

      try {
        mount.removeChild(renderer.domElement);
      } catch {}
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      (renderer as any).domElement = null;
      rendererRef.current = undefined;
      sceneRef.current = undefined;
    };
  }, [params.bgColor, setPaint]);
  // ============================================================
  // Geometry Build (safe) + Chart Labels support
  // ============================================================
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Cleanup previous geometry
    if (groupRef.current) {
      groupRef.current.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose?.();
      });
      scene.remove(groupRef.current);
      meshesRef.current = [];
    }

    const group = new THREE.Group();
    groupRef.current = group;
    const meshes: THREE.Mesh[] = [];

    if (!Array.isArray(rings) || rings.length === 0) {
      console.warn("⚠️ No rings passed to RingRenderer — skipping render");
      return;
    }

    rings.forEach((r, i) => {
      // Sanitize values
      if (!Number.isFinite(r.innerDiameter) || r.innerDiameter! <= 0)
        r.innerDiameter = 5;
      if (!Number.isFinite(r.wireDiameter) || r.wireDiameter! <= 0)
        r.wireDiameter = 1;

      // ✅ Normalize and validate centerSpacing safely
      const spacing = r.centerSpacing ?? 7.5;
      if (!Number.isFinite(spacing) || spacing <= 0 || spacing > 100) {
        r.centerSpacing = 7.5;
      }

      if (!Number.isFinite(r.x)) r.x = i * r.centerSpacing!;
      if (!Number.isFinite(r.y)) r.y = 0;
      if (!Number.isFinite(r.z)) r.z = 0;

      const ringRadius = r.innerDiameter! / 2 + r.wireDiameter! / 2;
      const tubeRadius = r.wireDiameter! / 2;

      let torus: THREE.TorusGeometry;
      try {
        torus = new THREE.TorusGeometry(ringRadius, tubeRadius, 32, 128);
      } catch {
        torus = new THREE.TorusGeometry(5, 1, 16, 64);
      }

      const mesh = new THREE.Mesh(
        torus,
        new THREE.MeshStandardMaterial({
          color: params.ringColor,
          metalness: 0.85,
          roughness: 0.25,
        })
      );

      mesh.position.set(r.x, -r.y, r.z ?? 0);
      if (typeof r.tiltRad === "number") mesh.rotation.set(0, r.tiltRad, 0);
      if (typeof r.rotationY === "number") mesh.rotation.y = r.rotationY;
      if (typeof r.rotationZ === "number") mesh.rotation.z = r.rotationZ;
      if (typeof r.rotationX === "number") mesh.rotation.x = r.rotationX;

      (mesh as any).ringKey = `${r.row ?? 0},${r.col ?? 0}`;
      meshes.push(mesh);
      group.add(mesh);

      // optional chart label
      if ((r as any)._chartLabel instanceof SpriteText) {
        const label = (r as any)._chartLabel;
        label.material.depthTest = false;
        label.material.depthWrite = false;
        label.renderOrder = 2000;
        group.add(label);
      }
    });

    // Center the group
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);
    scene.add(group);
    meshesRef.current = meshes;


  }, [rings, params.ringColor, params.innerDiameter, params.wireDiameter]);



  // ============================================================
  // Imperative Handle (for toolbar buttons in App)
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
    toggleLock: () => {
      setRotationLocked((prev) => !prev);
    },
    setPaintMode: (on: boolean) => {
      setLocalPaintMode(on);
    },
    toggleErase: () => {
      setLocalEraseMode((prev) => !prev);
    },
    clearPaint: () => {
      setPaint(new Map());
    },
    lock2DView: () => {
      const cam = cameraRef.current;
      if (cam) cam.position.set(0, 0, initialZRef.current);
      setRotationLocked(true);
    },
    forceLockRotation: (locked: boolean) => {
      setRotationLocked(locked);
    },
    getState: () => ({
      paintMode: paintModeRef.current,
      eraseMode: eraseModeRef.current,
      rotationLocked: lockRef.current,
    }),
  }));

  // ============================================================
  // Sync state for loop consistency
  // ============================================================
  useEffect(() => {
    paintModeRef.current = localPaintMode;
    eraseModeRef.current = localEraseMode;
    lockRef.current = rotationLocked;
  }, [localPaintMode, localEraseMode, rotationLocked]);

  // Render DOM
  return <div ref={mountRef} style={{ width: "100vw", height: "100vh" }} />;
});

export default RingRenderer;

// ============================================================
// === Generators (shared across pages) =======================
// ============================================================
export function toIN(valueInMM: number): number {
  return valueInMM / 25.4;
}

/** Shared low-level generator used by all modes */
function _generateRingsBase({
  rows,
  cols,
  ID_mm,
  WD_mm,
  OD_mm,
  centerSpacing,
  angleIn,
  angleOut,
  layout,
}: {
  rows: number;
  cols: number;
  ID_mm: number;
  WD_mm: number;
  OD_mm: number;
  centerSpacing?: number;
  angleIn?: number;
  angleOut?: number;
  layout?: any[];
}): Ring[] {
  if (!Number.isFinite(rows) || rows <= 0) rows = 1;
  if (!Number.isFinite(cols) || cols <= 0) cols = 1;

  const MAX_RINGS = 10000;
  if (rows * cols > MAX_RINGS) {
    console.warn(`⚠️ Requested ${rows * cols} rings — limiting to ${MAX_RINGS}.`);
    const capped = Math.floor(Math.sqrt(MAX_RINGS));
    rows = capped;
    cols = capped;
  }

  if (!Number.isFinite(ID_mm) || ID_mm <= 0) {
    console.warn(`⚠️ Invalid ID_mm (${ID_mm}) → defaulting to 5mm`);
    ID_mm = 5;
  }
  if (!Number.isFinite(WD_mm) || WD_mm <= 0) {
    console.warn(`⚠️ Invalid WD_mm (${WD_mm}) → defaulting to 1mm`);
    WD_mm = 1;
  }
  if (!Number.isFinite(OD_mm) || OD_mm <= 0) {
    OD_mm = ID_mm + 2 * WD_mm;
  }

  // ✅ Normalize center spacing safely
  let spacing = centerSpacing ?? 7.5;
  if (!Number.isFinite(spacing) || spacing <= 0 || spacing > 50) {
    console.warn(
      `⚠️ Invalid or missing centerSpacing (${centerSpacing}) → defaulting to 7.5mm`
    );
    spacing = 7.5;
  }
  centerSpacing = spacing;
  if (!Array.isArray(layout)) layout = [];

  const rings: Ring[] = [];

  for (let r = 0; r < rows; r++) {
    const tiltDeg = (r % 2 === 0 ? angleIn : angleOut) ?? 0;
    const tiltRad = THREE.MathUtils.degToRad(tiltDeg);

    for (let c = 0; c < cols; c++) {
      const jsonRing = layout.find((el) => el.row === r && el.col === c);

      let spacingVal =
        jsonRing?.centerSpacing ?? centerSpacing ?? (layout as any)?.centerSpacing ?? 0;

      if (!Number.isFinite(spacingVal) || spacingVal <= 0 || spacingVal > 50) {
        spacingVal = 7.5;
      }

      const x = Number.isFinite(jsonRing?.x) ? jsonRing!.x : c * spacingVal;
      const y = Number.isFinite(jsonRing?.y)
        ? jsonRing!.y
        : r * (spacingVal * Math.sqrt(3) / 2);
      const z = Number.isFinite(jsonRing?.z) ? jsonRing!.z : 0;

      const inner = Number.isFinite(jsonRing?.innerDiameter)
        ? jsonRing!.innerDiameter!
        : ID_mm;
      const wire = Number.isFinite(jsonRing?.wireDiameter)
        ? jsonRing!.wireDiameter!
        : WD_mm;

      rings.push({
        row: r,
        col: c,
        x,
        y,
        z,
        innerDiameter: inner,
        wireDiameter: wire,
        radius: (inner + wire) / 2,
        tiltRad,
        centerSpacing: spacingVal,
      });
    }
  }


  return rings;
}

// === Chart Mode =============================================
export function generateRingsChart({
  rows,
  cols,
  innerDiameter,
  wireDiameter,
  centerSpacing,
  angleIn = 25,
  angleOut = -25,
  layout,
}: {
  rows: number;
  cols: number;
  innerDiameter: string | number;
  wireDiameter: number;
  centerSpacing?: number;
  angleIn?: number;
  angleOut?: number;
  layout?: any[];
}) {
  const id_in = parseInchFractionToInches(innerDiameter);
  const ID_mm = inchesToMm(id_in);
  const WD_mm = wireDiameter;
  const OD_mm = ID_mm + 2 * WD_mm;

  const spacingFromLayoutMeta =
    (layout as any)?.centerSpacing ??
    (Array.isArray(layout) ? (layout[0] as any)?.centerSpacing : undefined);

  const spacingToUse = spacingFromLayoutMeta ?? centerSpacing ?? 0;

  const rings = _generateRingsBase({
    rows,
    cols,
    ID_mm,
    WD_mm,
    OD_mm,
    centerSpacing: spacingToUse,
    angleIn,
    angleOut,
    layout,
  });

  // Add chart labels
  rings.forEach((r) => {
    const wd = +(r.wireDiameter ?? WD_mm).toFixed(2);
    const id = +(r.innerDiameter ?? ID_mm).toFixed(2);
    const label = new SpriteText(`${wd}mm / ${id}mm`);
    label.color = "#CCCCCC";
    label.textHeight = 2.2;
    label.position.set(r.x, -r.y - (r.wireDiameter ?? WD_mm) * 4, r.z ?? 0);
    label.center.set(0.5, 1.2);
    (label.material as any).depthTest = false;
    (label.material as any).depthWrite = false;
    label.renderOrder = 999;
    (r as any)._chartLabel = label;
  });

  (window as any).__chartDebug = {
    ID_mm,
    WD_mm,
    OD_mm,
    spacing: spacingToUse,
    mode: "chart",
  };
  return rings;
}

// === Designer Mode ==========================================
export function generateRingsDesigner({
  rows,
  cols,
  innerDiameter,
  wireDiameter,
  centerSpacing,
  angleIn = 25,
  angleOut = -25,
  layout,
}: {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
  centerSpacing?: number;
  angleIn?: number;
  angleOut?: number;
  layout?: any[];
}) {
  const ID_mm = innerDiameter;
  const WD_mm = wireDiameter;
  const OD_mm = ID_mm + 2 * WD_mm;

  const rings = _generateRingsBase({
    rows,
    cols,
    ID_mm,
    WD_mm,
    OD_mm,
    centerSpacing,
    angleIn,
    angleOut,
    layout,
  });

  (window as any).__ringDebug = {
    fromGenerator: true,
    sourceInner: ID_mm,
    WD_mm,
    spacing: centerSpacing,
    mode: "designer",
  };

  return rings;
}

// === Tuner Mode =============================================
export function generateRingsTuner({
  rows,
  cols,
  innerDiameter,
  wireDiameter,
  centerSpacing,
  angleIn = 25,
  angleOut = -25,
  layout,
}: {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
  centerSpacing?: number;
  angleIn?: number;
  angleOut?: number;
  layout?: any[];
}) {
  const ID_mm = innerDiameter;
  const WD_mm = wireDiameter;
  const OD_mm = ID_mm + 2 * WD_mm;

  const rings = _generateRingsBase({
    rows,
    cols,
    ID_mm,
    WD_mm,
    OD_mm,
    centerSpacing,
    angleIn,
    angleOut,
    layout,
  });

  (window as any).__tunerDebug = {
    ID_mm,
    WD_mm,
    spacing: centerSpacing,
    mode: "tuner",
  };

  if (typeof window !== "undefined") {
    rings.forEach((r) => {
      const label = new SpriteText(`Row:${r.row},Col:${r.col}`);
      label.color = "#00FFFF";
      label.textHeight = 2;
      label.position.set(r.x, -r.y - 2, 0);
      (r as any)._debugLabel = label;
    });
  }

  return rings;
}

// Backward compatibility alias
export const generateRings = generateRingsDesigner;