// src/pages/ChainmailWeaveTuner.tsx
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { Link, useSearchParams } from "react-router-dom";
import { DraggableCompassNav, DraggablePill } from "../App";
import { computeRingVarsIndependent } from "../utils/ringMath";
import { IconHamburger } from "../components/icons/ToolIcons";

// ========================================
// CONSTANTS
// ========================================
const ID_OPTIONS = [
  "7/64", "1/8", "9/64", "5/32", "3/16", "1/4",
  "5/16", "3/8", "7/16", "1/2", "5/8",
] as const;
const WIRE_OPTIONS = [0.9, 1.2, 1.6, 2.0, 2.5, 3.0] as const;
type TunerMode = "calibrate_rings" | "tune_rings";

const TUNER_MODES: { id: TunerMode; icon: string; label: string }[] = [
  { id: "calibrate_rings",  icon: "📐", label: "Calibrate Rings" },
  { id: "tune_rings",       icon: "🔧", label: "Tune Rings" },
];

const FOV = 40;
const DEG = Math.PI / 180;

// A ring size only weaves inside a window of center-to-center spacing, measured
// as a fraction of its outer diameter. Below TIGHT it overlaps (rings pile up);
// above LOOSE it gaps (rings no longer reach to interlink). Calibrated against a
// good weave (OD 10.34 mm @ 6.7 mm → 0.65) vs. an observed overlap (OD 7.96 mm @
// 4.5 mm → 0.57). Both factors are tunable.
const TIGHT_WEAVE_FACTOR = 0.6; // below this → too tight (overlap)
const LOOSE_WEAVE_FACTOR = 0.9; // above this → too loose (gaps, no link)
const TIGHT_RING_COLOR = 0xff3b30; // red — overlapping
const LOOSE_RING_COLOR = 0xf59e0b; // amber — gapping
const NORMAL_RING_COLOR = 0x353535;

const TUNER_STORAGE_KEY = "chainmailMatrix";
const FREEFORM_TUNER_SNAPSHOT_KEY = "freeform.tunerSnapshot.v1";

// ========================================
// TYPES
// ========================================
type LogicalRing = {
  row: number;
  col: number;
  x: number;
  y: number;
  innerDiameter: number;
  wireDiameter: number;
  radius: number;
  tiltRad: number;
};

// ========================================
// HELPERS
// ========================================
function convertToMM(v: string): number {
  const [n, d] = v.split("/").map(Number);
  return d ? 25.4 * (n / d) : parseFloat(v);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function rcToLogical(row: number, col: number, spacing: number, offsetX = 0, offsetY = 0) {
  return {
    x: offsetX + col * spacing + (row % 2 === 1 ? spacing / 2 : 0),
    y: offsetY + row * spacing * 0.8660254,
  };
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as any).geometry) (mesh as any).geometry.dispose();
    const material = (mesh as any).material;
    if (Array.isArray(material)) material.forEach((m) => m?.dispose?.());
    else material?.dispose?.();
  });
}

function clearGroup(group: THREE.Group) {
  while (group.children.length) {
    const child = group.children.pop()!;
    disposeObject3D(child);
    group.remove(child);
  }
}

function fitCameraToBounds(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  target: THREE.Vector3,
  zoom = 1,
) {
  const aspect = camera.aspect || 1;
  const fovY = THREE.MathUtils.degToRad(camera.fov);
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
  const distY = (height / 2) / Math.tan(fovY / 2);
  const distX = (width / 2) / Math.tan(fovX / 2);
  const dist = (Math.max(distX, distY) * 1.3) / Math.max(0.25, zoom);
  camera.position.set(target.x, target.y + height * 0.02, target.z + dist);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

// MAIN COMPONENT
// ========================================
export default function ChainmailWeaveTuner() {
  const [searchParams] = useSearchParams();

  // Guided mode: launched from Atlas on an unchecked combination
  const guidedId    = searchParams.get("id") ?? "";
  const guidedWire  = parseFloat(searchParams.get("wire") ?? "");
  const isGuided    = searchParams.get("guided") === "1"
    && (ID_OPTIONS as readonly string[]).includes(guidedId)
    && (WIRE_OPTIONS as readonly number[]).includes(guidedWire as typeof WIRE_OPTIONS[number]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sceneHostRef = useRef<HTMLDivElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const ringGroupRef = useRef<THREE.Group | null>(null);

  // Ring params — seed from URL when guided, fall back to defaults
  const [id, setId] = useState(isGuided ? guidedId : "5/16");
  const [wire, setWire] = useState(isGuided ? guidedWire : 1.2);
  const [centerSpacing, setCenterSpacing] = useState(6.7);
  const [angleIn, setAngleIn] = useState(25);
  const [angleOut, setAngleOut] = useState(-25);

  // Guided workflow step: null = normal, 0 = ring step, 1 = scale step
  const [guidanceStep, setGuidanceStep] = useState<0 | 1 | null>(isGuided ? 0 : null);

  const [cameraZoom, setCameraZoom] = useState(1);

  // Lock scale: when on, the camera holds a constant on-screen mm-per-pixel so
  // changing Center spacing repositions the rings without the auto-fit camera
  // making them appear to grow or shrink. The span is captured the moment the
  // lock turns on, then held across spacing changes.
  const [lockScale, setLockScale] = useState(false);
  const lockedSpanRef = useRef<{ w: number; h: number } | null>(null);

  // 3-state weave status, surfaced in the Atlas with green / orange / red.
  // "valid"       — both ring and ring+scale weave work for this ID/wire pair
  // "rings_only"  — rings weave but scale weave fails (still usable as rings)
  // "no_solution" — neither ring nor scale weave works at this pair
  const [status, setStatus] = useState<"valid" | "rings_only" | "no_solution">("valid");
  const [showCompass, setShowCompass] = useState(false);
  const [tunerMode, setTunerMode] = useState<TunerMode>("tune_rings");
  const [panelOpen, setPanelOpen] = useState(true);

  const pendingSnapshotSaveRef = useRef(false);

  const handleReloadLastSave = useCallback(() => {
    try {
      const raw = localStorage.getItem(TUNER_STORAGE_KEY);
      if (!raw) { alert("No saved ring sets found."); return; }
      const list = JSON.parse(raw) as any[];
      if (!list.length) { alert("No saved ring sets found."); return; }
      const last = [...list].sort((a, b) =>
        (b.savedAt ?? "").localeCompare(a.savedAt ?? ""),
      )[0];
      // Ring geometry — id field is encoded as "5/16_1.2mm"
      const idParts = (last.id as string ?? "").split("_");
      const ringId = idParts.slice(0, -1).join("_");
      const wireVal = parseFloat(idParts[idParts.length - 1] ?? "");
      if ((ID_OPTIONS as readonly string[]).includes(ringId)) setId(ringId as typeof ID_OPTIONS[number]);
      if (!isNaN(wireVal) && (WIRE_OPTIONS as readonly number[]).includes(wireVal)) setWire(wireVal as typeof WIRE_OPTIONS[number]);
      if (typeof last.centerSpacing === "number") setCenterSpacing(last.centerSpacing);
      if (typeof last.angleIn === "number") setAngleIn(last.angleIn);
      if (typeof last.angleOut === "number") setAngleOut(last.angleOut);
      if (last.status === "valid" || last.status === "rings_only" || last.status === "no_solution") setStatus(last.status);
      pendingSnapshotSaveRef.current = true;
    } catch (err) {
      alert("Failed to reload: " + String(err));
    }
  }, []);

  const ringVars = useMemo(() => computeRingVarsIndependent(id, wire), [id, wire]);
  const arDisplay = useMemo(
    () => (ringVars.WD_mm > 0 ? ringVars.ID_mm / ringVars.WD_mm : 0).toFixed(2),
    [ringVars],
  );

  // Live weave-fit check: the rings only interlink inside a spacing window.
  // "tight" = overlapping (too close), "loose" = gapping (too far), "ok" = weaves.
  // Used to tint the rings and to confirm-on-save. The slider is NOT blocked.
  const weaveFit = useMemo<"tight" | "loose" | "ok">(() => {
    if (!Number.isFinite(ringVars.OD_mm) || ringVars.OD_mm <= 0) return "ok";
    if (centerSpacing < TIGHT_WEAVE_FACTOR * ringVars.OD_mm) return "tight";
    if (centerSpacing > LOOSE_WEAVE_FACTOR * ringVars.OD_mm) return "loose";
    return "ok";
  }, [centerSpacing, ringVars.OD_mm]);
  const weaveProblem = weaveFit !== "ok";

  const rings = useMemo<LogicalRing[]>(() => {
    const items: LogicalRing[] = [];
    for (let row = 0; row < 6; row++) {
      const rowTilt = row % 2 === 0 ? angleIn : angleOut;
      for (let col = 0; col < 6; col++) {
        const { x, y } = rcToLogical(row, col, centerSpacing);
        items.push({
          row,
          col,
          x,
          y,
          innerDiameter: ringVars.ID_mm,
          wireDiameter: ringVars.WD_mm,
          radius: ringVars.OD_mm / 2,
          tiltRad: rowTilt * DEG,
        });
      }
    }
    return items;
  }, [angleIn, angleOut, centerSpacing, ringVars]);

const saveFreeformTunerSnapshot = useCallback(() => {
  try {
    const snapshot = {
      geometry: {
        innerDiameter: ringVars.ID_mm,
        wireDiameter: ringVars.WD_mm,
        centerSpacing,
        angleIn,
        angleOut,
      },
      rings: rings.map((r) => ({
        row: r.row,
        col: r.col,
        color: "#ffffff",
      })),
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(
      FREEFORM_TUNER_SNAPSHOT_KEY,
      JSON.stringify(snapshot),
    );

    window.dispatchEvent(
      new CustomEvent("freeform:tunerSnapshotSaved", {
        detail: snapshot,
      }),
    );
  } catch (err) {
    console.warn("Failed to save tuner snapshot for Freeform:", err);
  }
}, [
  ringVars.ID_mm,
  ringVars.WD_mm,
  centerSpacing,
  angleIn,
  angleOut,
  rings,
]);

useEffect(() => {
  if (!pendingSnapshotSaveRef.current) return;
  pendingSnapshotSaveRef.current = false;
  saveFreeformTunerSnapshot();
}, [saveFreeformTunerSnapshot]);

useEffect(() => {
  try {
    localStorage.setItem(
      FREEFORM_TUNER_SNAPSHOT_KEY,
      JSON.stringify({
        geometry: {
          innerDiameter: ringVars.ID_mm,
          wireDiameter: ringVars.WD_mm,
          centerSpacing,
          angleIn,
          angleOut,
        },
        rings: rings.map((r) => ({
          row: r.row,
          col: r.col,
          color: "#ffffff",
        })),
        savedAt: new Date().toISOString(),
      }),
    );

    window.dispatchEvent(
      new CustomEvent("freeform:tunerSnapshotSaved", {
        detail: {
          geometry: {
            innerDiameter: ringVars.ID_mm,
            wireDiameter: ringVars.WD_mm,
            centerSpacing,
            angleIn,
            angleOut,
          },
          rings: rings.map((r) => ({ row: r.row, col: r.col, color: "#ffffff" })),
          savedAt: new Date().toISOString(),
        },
      }),
    );
  } catch {}
}, [
  ringVars.ID_mm,
  ringVars.WD_mm,
  centerSpacing,
  angleIn,
  angleOut,
  rings,
]);
  useLayoutEffect(() => {
    const host = sceneHostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 5000);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(90, 120, 150);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xb7dfff, 0.65);
    fill.position.set(-120, 40, 90);
    scene.add(fill);

    const root = new THREE.Group();
    root.rotation.x = -0.22;
    scene.add(root);
    rootGroupRef.current = root;

    const ringGroup = new THREE.Group();
    root.add(ringGroup);
    ringGroupRef.current = ringGroup;

    let raf = 0;
    const renderLoop = () => {
      raf = window.requestAnimationFrame(renderLoop);
      renderer.render(scene, camera);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(raf);
      clearGroup(ringGroup);
      renderer.dispose();
      host.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rootGroupRef.current = null;
      ringGroupRef.current = null;
    };
  }, []);

  const resizeScene = useCallback(() => {
    const wrap = wrapRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!wrap || !renderer || !camera) return;
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }, []);

  useLayoutEffect(() => {
    resizeScene();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(resizeScene);
    ro.observe(wrap);
    window.addEventListener("resize", resizeScene);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeScene);
    };
  }, [resizeScene]);

  useEffect(() => {
    const host = sceneHostRef.current;
    if (!host) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0012);
      setCameraZoom((prev) => clamp(prev * factor, 0.45, 3.2));
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel as EventListener);
  }, []);

  useEffect(() => {
    const ringGroup = ringGroupRef.current;
    const camera = cameraRef.current;
    if (!ringGroup || !camera) return;

    clearGroup(ringGroup);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color:
        weaveFit === "tight" ? TIGHT_RING_COLOR
        : weaveFit === "loose" ? LOOSE_RING_COLOR
        : NORMAL_RING_COLOR,
      metalness: 0.45,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });

    const ringHighlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x8f8f8f,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });

    for (const ring of rings) {
      const torusRadius = ring.innerDiameter / 2 + ring.wireDiameter / 2;
      const geo = new THREE.TorusGeometry(torusRadius, ring.wireDiameter / 2, 20, 80);
      const mesh = new THREE.Mesh(geo, ringMaterial.clone());
      mesh.position.set(ring.x, -ring.y, 0);
      mesh.rotation.y = ring.tiltRad;
      ringGroup.add(mesh);

      const hiGeo = new THREE.TorusGeometry(torusRadius, ring.wireDiameter * 0.08, 8, 64);
      const hi = new THREE.Mesh(hiGeo, ringHighlightMaterial.clone());
      hi.position.copy(mesh.position);
      hi.rotation.copy(mesh.rotation);
      hi.position.z += ring.wireDiameter * 0.06;
      ringGroup.add(hi);
    }

    const minX = Math.min(...rings.map((r) => r.x - r.radius));
    const maxX = Math.max(...rings.map((r) => r.x + r.radius));
    const minY = Math.min(...rings.map((r) => -r.y - r.radius));
    const maxY = Math.max(...rings.map((r) => -r.y + r.radius));

    const spanW = maxX - minX;
    const spanH = maxY - minY;

    // In lock-scale mode hold the framing span constant so the on-screen ring
    // size never changes when Center spacing moves the rings closer/apart.
    let fitW = spanW;
    let fitH = spanH;
    if (lockScale) {
      if (!lockedSpanRef.current) lockedSpanRef.current = { w: spanW, h: spanH };
      fitW = lockedSpanRef.current.w;
      fitH = lockedSpanRef.current.h;
    } else {
      lockedSpanRef.current = null;
    }

    fitCameraToBounds(
      camera,
      fitW,
      fitH,
      new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0),
      cameraZoom,
    );
    resizeScene();
  }, [rings, cameraZoom, resizeScene, lockScale, weaveFit]);

  const handleSave = useCallback(() => {
    // Out-of-range spacing: don't block, but confirm. If they save anyway,
    // record it as "No Solution" so the Atlas reflects it doesn't weave.
    let effectiveStatus = status;
    if (weaveProblem) {
      const why =
        weaveFit === "tight"
          ? "too tight to weave — the rings overlap instead of interlinking"
          : "too far apart to weave — the rings gap instead of interlinking";
      const ok = window.confirm(
        `⚠️ This center-to-center spacing is ${why}.\n\nSave anyway? It will be recorded as “No Solution”.`,
      );
      if (!ok) return;
      effectiveStatus = "no_solution";
      if (status !== "no_solution") setStatus("no_solution");
    }

    const entry = {
      id: `${id}_${wire}mm`,
      innerDiameter: ringVars.ID_mm,
      wireDiameter: ringVars.WD_mm,
      centerSpacing,
      angleIn,
      angleOut,
      status: effectiveStatus,
      aspectRatio: (ringVars.ID_mm / ringVars.WD_mm).toFixed(2),
      savedAt: new Date().toISOString(),
    };
    const existing = JSON.parse(localStorage.getItem(TUNER_STORAGE_KEY) || "[]");
    localStorage.setItem(
      TUNER_STORAGE_KEY,
      JSON.stringify([...existing.filter((i: any) => i.id !== entry.id), entry], null, 2),
    );

    // Keep Freeform in sync with the exact saved tuner state, including
    // per-scale geometry like shape and tilt.
    saveFreeformTunerSnapshot();

    alert(`✅ Saved ${entry.id} (${effectiveStatus})`);
  }, [
    id, wire, ringVars, centerSpacing, angleIn, angleOut, status,
    weaveProblem, weaveFit, saveFreeformTunerSnapshot,
  ]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100vw",
        height: "100vh",
        background: "#f3f4f6",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div ref={sceneHostRef} style={{ position: "absolute", inset: 0, zIndex: 1 }} />

      {/* ── Mode selector strip (vertical) ── */}
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 52, zIndex: 20, background: "rgba(13,18,28,0.97)", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "60px 6px 10px" }}>
        {TUNER_MODES.map((m) => {
          const isActive = tunerMode === m.id && panelOpen;
          return (
            <button
              key={m.id}
              onClick={() => {
                if (tunerMode === m.id) {
                  setPanelOpen((v) => !v);
                } else {
                  setTunerMode(m.id);
                  setPanelOpen(true);
                }
              }}
              title={isActive ? `Close ${m.label}` : m.label}
              style={{ width: 40, height: 40, borderRadius: 9, border: isActive ? "1px solid #3b82f6" : "1px solid #1e293b", background: isActive ? "#1e40af" : "#0f172a", color: isActive ? "#fff" : "#94a3b8", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              {m.icon}
            </button>
          );
        })}
      </div>

      {/* ── Controls panel (floating) ── */}
      {panelOpen && <DraggablePill
        id="tuner-controls"
        defaultPosition={{ x: 60, y: typeof window !== "undefined" ? Math.max(60, window.innerHeight - 480) : 100 }}
        style={{
          width: "min(280px, calc(100vw - 80px))",
          background: "#0f172a",
          color: "#e5e7eb",
          borderRadius: 12,
          padding: "10px 14px 14px",
          border: "1px solid rgba(148,163,184,0.25)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.65)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 12,
          maxHeight: "min(480px, 80vh)",
          overflowY: "auto",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Drag handle / header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2, cursor: "grab" }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: "#94a3b8", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {TUNER_MODES.find((m) => m.id === tunerMode)?.icon ?? "⚙️"}{" "}
            {TUNER_MODES.find((m) => m.id === tunerMode)?.label ?? "Tuner"}
          </span>
          <button
            onClick={() => setPanelOpen(false)}
            style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#94a3b8", cursor: "pointer", fontSize: 11, display: "grid", placeItems: "center" }}
            title="Close"
          >✕</button>
        </div>

        {/* ── Guided-mode coaching banner ── */}
        {guidanceStep !== null && (
          <div style={{ background: "#071c30", border: "1px solid #1d4ed8", borderRadius: 10, padding: "10px 12px", marginBottom: 4 }}>
            <div style={{ color: "#7dd3fc", fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
              Tune Ring Geometry
            </div>
            <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
              Adjust center spacing and angles until the ring arrangement looks right for your weave, then save.
            </div>
            <button
              onClick={() => setGuidanceStep(null)}
              style={{ padding: "5px 12px", borderRadius: 8, background: "#14532d", color: "#a7f3d0", border: "1px solid #166534", cursor: "pointer", fontWeight: 700, fontSize: 11 }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Calibrate Rings ── */}
        {tunerMode === "calibrate_rings" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 13 }} title={`Ring ID ≈ ${convertToMM(id).toFixed(3)} mm`}>
                AR ≈ {arDisplay}
              </div>
              <Link to="/_calibration?from=tuner" style={{ background: "#1f2937", color: "#a7f3d0", padding: "6px 10px", borderRadius: 10, border: "1px solid #334155", textDecoration: "none", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                🎛️ Calibrate
              </Link>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
              <div style={{ minWidth: 70, color: "#cbd5e1", fontWeight: 700 }}>Wire</div>
              <select value={wire} onChange={(e) => setWire(parseFloat(e.target.value))} style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}>
                {WIRE_OPTIONS.map((v) => (<option key={v} value={v}>{v} mm</option>))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
              <div style={{ minWidth: 70, color: "#cbd5e1", fontWeight: 700 }}>Ring ID</div>
              <select value={id} onChange={(e) => setId(e.target.value)} style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}>
                {ID_OPTIONS.map((v) => (<option key={v} value={v}>{v}"</option>))}
              </select>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.5 }}>
              Set wire gauge and inner diameter to match your physical rings. AR = ID ÷ Wire. Use Calibrate to verify screen accuracy.
            </div>
          </>
        )}

        {/* ── Tune Rings ── */}
        {tunerMode === "tune_rings" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
              <div style={{ minWidth: 70, color: "#cbd5e1", fontWeight: 700 }}>Wire</div>
              <select value={wire} onChange={(e) => setWire(parseFloat(e.target.value))} style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}>
                {WIRE_OPTIONS.map((v) => (<option key={v} value={v}>{v} mm</option>))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
              <div style={{ minWidth: 70, color: "#cbd5e1", fontWeight: 700 }}>Ring ID</div>
              <select value={id} onChange={(e) => setId(e.target.value)} style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}>
                {ID_OPTIONS.map((v) => (<option key={v} value={v}>{v}"</option>))}
              </select>
            </div>
            <button
              onClick={() => setLockScale((v) => !v)}
              title="Hold the on-screen ring size constant so changing Center spacing doesn't make the rings appear to resize. Ring ID and wire are always constant — only the view zoom changes."
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "7px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 12,
                border: lockScale ? "1px solid #2563eb" : "1px solid #334155",
                background: lockScale ? "#1e3a8a" : "#0f172a",
                color: lockScale ? "#bfdbfe" : "#94a3b8",
              }}
            >
              {lockScale ? "🔒 Scale locked" : "🔓 Lock ring scale"}
            </button>
            {weaveProblem && (
              <div
                style={{
                  padding: "7px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: `1px solid ${weaveFit === "tight" ? "#ef4444" : "#f59e0b"}`,
                  background: weaveFit === "tight" ? "rgba(127,29,29,0.45)" : "rgba(120,53,15,0.45)",
                  color: weaveFit === "tight" ? "#fecaca" : "#fde68a",
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <span>⚠️</span>
                <span>
                  {weaveFit === "tight"
                    ? "Too tight to weave — rings overlap. Widen Center, or save as “No Solution”."
                    : "Too far apart to weave — rings gap. Tighten Center, or save as “No Solution”."}
                </span>
              </div>
            )}
            {[
              { label: "Center", val: centerSpacing, set: setCenterSpacing, min: 2, max: 25, step: 0.1, unit: "mm" },
              { label: "Angle In", val: angleIn, set: setAngleIn, min: -75, max: 75, step: 1, unit: "°" },
              { label: "Angle Out", val: angleOut, set: setAngleOut, min: -75, max: 75, step: 1, unit: "°" },
            ].map(({ label, val, set, min, max, step, unit }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ color: "#cbd5e1", fontWeight: 700 }}>{label}</div>
                  <div style={{ color: "#93c5fd", fontWeight: 700 }}>{val.toFixed(step < 1 ? 1 : 0)}{unit}</div>
                </div>
                <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(parseFloat(e.target.value))} style={{ width: "100%" }} />
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ color: "#cbd5e1", fontWeight: 700 }}>Zoom</div>
                <div style={{ color: "#93c5fd", fontWeight: 700 }}>{cameraZoom.toFixed(2)}×</div>
              </div>
              <input type="range" min="0.45" max="3.2" step="0.01" value={cameraZoom} onChange={(e) => setCameraZoom(parseFloat(e.target.value))} style={{ width: "100%" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
              <div style={{ minWidth: 70, color: "#cbd5e1", fontWeight: 700 }}>Status</div>
              <select value={status} onChange={(e) => setStatus(e.target.value as "valid" | "rings_only" | "no_solution")} style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}>
                <option value="valid">✅ Rings weave</option>
                <option value="no_solution">❌ No Solution</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleReloadLastSave} style={{ flex: 1, background: "#0f172a", color: "#94a3b8", padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", cursor: "pointer", fontWeight: 700 }} title="Restore sliders from the most recently saved ring set">
                Reload
              </button>
              <button onClick={handleSave} style={{ flex: 1, background: "#1e293b", color: "#93c5fd", padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", cursor: "pointer", fontWeight: 800 }}>
                Save
              </button>
            </div>
          </>
        )}

      </DraggablePill>}

      <DraggablePill id="tuner-compass" defaultPosition={{ x: 20, y: 70 }}>
        <button
          onClick={() => setShowCompass((v) => !v)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, border: "1px solid #111", background: "#1f2937", color: "#d1d5db", cursor: "pointer" }}
        >
          <IconHamburger size={18} />
        </button>
      </DraggablePill>

      {showCompass && <DraggableCompassNav onNavigate={() => setShowCompass(false)} />}

    </div>
  );
}
