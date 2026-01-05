import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useLocation, useNavigate } from "react-router-dom";
import {
  applyGainGammaToHex,
  clearCalibration,
  loadActiveCalibration,
  saveAndApplyCalibration,
} from "../utils/colorCalibration";

/**
 * Builds a per-color Gain/Gamma table by comparing:
 *  - LEFT  (SMALL):  inst.setColorAt(...)  (Three.js classic)
 *  - RIGHT (LARGE):  manual instanceColor writes
 *
 * After calibration:
 *  - Each color row is editable (manual gain/gamma)
 *  - Save & Apply stores the table globally so any page can use it.
 */

// --------------------
// Utilities
// --------------------
function normalizeColor6(hex: string): string {
  const h = (hex || "").trim().toLowerCase();
  const m6 = /^#([0-9a-f]{6})$/.exec(h);
  if (m6) return `#${m6[1]}`;
  const m8 = /^#([0-9a-f]{8})$/.exec(h);
  if (m8) return `#${m8[1].slice(0, 6)}`;
  const m3 = /^#([0-9a-f]{3})$/.exec(h);
  if (m3) {
    const r = m3[1][0];
    const g = m3[1][1];
    const b = m3[1][2];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#ffffff";
}

// Instancing color in Three often expects a usable vertex "color" attribute when vertexColors=true.
// Without it, some pipelines end up effectively black depending on defines/attributes.
// We fill it with white so instanceColor acts as a multiplier.
function ensureWhiteVertexColors(geom: THREE.BufferGeometry) {
  const existing = geom.getAttribute("color") as THREE.BufferAttribute | undefined;
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return;

  const neededCount = pos.count;
  if (existing && existing.count === neededCount && existing.itemSize === 3) return;

  const arr = new Float32Array(neededCount * 3);
  arr.fill(1);
  geom.setAttribute("color", new THREE.BufferAttribute(arr, 3));
}

type RGB = { r: number; g: number; b: number };
function rgbMSE(a: RGB, b: RGB) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

// --------------------
// ✅ Ring sampling fix (avoid sampling the torus hole)
// --------------------
function rgbDist2(a: RGB, b: RGB) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function readPixel(
  renderer: THREE.WebGLRenderer,
  rt: THREE.WebGLRenderTarget,
  px: number,
  py: number,
): RGB {
  const buf = new Uint8Array(4);
  const x = Math.max(0, Math.min(rt.width - 1, Math.floor(px)));
  const y = Math.max(0, Math.min(rt.height - 1, Math.floor(py)));
  renderer.readRenderTargetPixels(rt, x, y, 1, 1, buf);
  return { r: buf[0] / 255, g: buf[1] / 255, b: buf[2] / 255 };
}

function sampleBestOnRing(
  which: "left" | "right",
  leftRendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>,
  rightRendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>,
  leftSceneRef: React.MutableRefObject<THREE.Scene | null>,
  rightSceneRef: React.MutableRefObject<THREE.Scene | null>,
  leftCamRef: React.MutableRefObject<THREE.PerspectiveCamera | null>,
  rightCamRef: React.MutableRefObject<THREE.PerspectiveCamera | null>,
  leftRTRef: React.MutableRefObject<THREE.WebGLRenderTarget | null>,
  rightRTRef: React.MutableRefObject<THREE.WebGLRenderTarget | null>,
): RGB {
  const renderer = which === "left" ? leftRendererRef.current : rightRendererRef.current;
  const scene = which === "left" ? leftSceneRef.current : rightSceneRef.current;
  const cam = which === "left" ? leftCamRef.current : rightCamRef.current;
  const rt = which === "left" ? leftRTRef.current : rightRTRef.current;

  if (!renderer || !scene || !cam || !rt) return { r: 0, g: 0, b: 0 };

  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);

  // background sample
  const bg = readPixel(renderer, rt, rt.width / 2, rt.height / 2);

  const pts: Array<[number, number]> = [
    [0.72, 0.50],
    [0.28, 0.50],
    [0.50, 0.72],
    [0.50, 0.28],
    [0.66, 0.66],
    [0.34, 0.66],
    [0.66, 0.34],
    [0.34, 0.34],
    [0.78, 0.50],
    [0.22, 0.50],
    [0.50, 0.78],
    [0.50, 0.22],
  ];

  let best: RGB = bg;
  let bestScore = -Infinity;

  for (const [nx, ny] of pts) {
    const px = nx * (rt.width - 1);
    const py = ny * (rt.height - 1);
    const c = readPixel(renderer, rt, px, py);
    const score = rgbDist2(c, bg);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  renderer.setRenderTarget(null);
  renderer.render(scene, cam);

  return best;
}

// --------------------
// Palette
// --------------------
const DEFAULT_PALETTE: string[] = [
  "#ffffff",
  "#000000",
  "#c0c0c0",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#ff7f00",
  "#7fff00",
  "#00ff7f",
  "#007fff",
  "#7f00ff",
  "#ff007f",
  "#8b0000",
  "#b22222",
  "#dc143c",
  "#ffa07a",
  "#ffd700",
  "#daa520",
  "#8b4513",
  "#a0522d",
  "#deb887",
  "#2e8b57",
  "#3cb371",
  "#20b2aa",
  "#4682b4",
  "#4169e1",
  "#191970",
  "#4b0082",
  "#9400d3",
  "#ff69b4",
];

type ResultRow = {
  hex: string;
  gain: number;
  gamma: number;
  mse: number;
  target: RGB;
  got: RGB;
};

// --------------------
// Main Component
// --------------------
export default function ColorCalibrationTest() {
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const leftRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rightRendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const leftSceneRef = useRef<THREE.Scene | null>(null);
  const rightSceneRef = useRef<THREE.Scene | null>(null);

  const leftCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rightCamRef = useRef<THREE.PerspectiveCamera | null>(null);

  const leftRTRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const rightRTRef = useRef<THREE.WebGLRenderTarget | null>(null);

  const leftMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const rightMeshRef = useRef<THREE.InstancedMesh | null>(null);

  const pmremLeftRef = useRef<THREE.PMREMGenerator | null>(null);
  const pmremRightRef = useRef<THREE.PMREMGenerator | null>(null);
  const envLeftRef = useRef<THREE.Texture | null>(null);
  const envRightRef = useRef<THREE.Texture | null>(null);

  // Return-to-Tuner navigation
  const navigate = useNavigate();
  const location = useLocation();

  const returnTo = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const from = sp.get("from");
    return from === "tuner" ? "/tuner" : "/tuner";
  }, [location.search]);

  const palette = useMemo(() => DEFAULT_PALETTE.map(normalizeColor6), []);
  const [selectedColor, setSelectedColor] = useState(palette[4] ?? "#ff0000");

  // live preview sliders (not the per-row values)
  const [gain, setGain] = useState(0.66);
  const [gamma, setGamma] = useState(1.18);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [statusMsg, setStatusMsg] = useState<string>("");

  // --------------------
  // Renderer setup
  // --------------------
  useEffect(() => {
    const setupOne = (canvas: HTMLCanvasElement, which: "left" | "right") => {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
        precision: "mediump",
      });

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#0b1020");

      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
      camera.position.set(0, 0, 6);
      camera.lookAt(0, 0, 0);

      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = env;

        if (which === "left") {
          pmremLeftRef.current = pmrem;
          envLeftRef.current = env;
        } else {
          pmremRightRef.current = pmrem;
          envRightRef.current = env;
        }
      } catch {}

      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const dir = new THREE.DirectionalLight(0xffffff, 1.15);
      dir.position.set(4, 6, 10);
      scene.add(dir);

      const rim = new THREE.DirectionalLight(0xffffff, 0.55);
      rim.position.set(-4, -6, -8);
      scene.add(rim);

      const geom = new THREE.TorusGeometry(1.1, 0.35, 16, 32);
      ensureWhiteVertexColors(geom);

      const mat = new THREE.MeshStandardMaterial({
        metalness: 0.85,
        roughness: 0.25,
        vertexColors: true,
      });
      (mat as any).envMapIntensity = 1.0;

      const mesh = new THREE.InstancedMesh(geom, mat, 1);
      mesh.frustumCulled = false;

      const dummy = new THREE.Object3D();
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(0, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;

      scene.add(mesh);

      const rt = new THREE.WebGLRenderTarget(256, 256, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
      });

      if (which === "left") {
        leftRendererRef.current = renderer;
        leftSceneRef.current = scene;
        leftCamRef.current = camera;
        leftRTRef.current = rt;
        leftMeshRef.current = mesh;
      } else {
        rightRendererRef.current = renderer;
        rightSceneRef.current = scene;
        rightCamRef.current = camera;
        rightRTRef.current = rt;
        rightMeshRef.current = mesh;
      }

      const resize = () => {
        const parent = canvas.parentElement;
        const w = Math.max(1, parent?.clientWidth ?? 400);
        const h = Math.max(1, parent?.clientHeight ?? 400);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas.parentElement ?? canvas);

      return () => {
        ro.disconnect();
        try {
          mesh.removeFromParent();
          (mesh.geometry as any)?.dispose?.();
          (mesh.material as any)?.dispose?.();
        } catch {}
        try {
          rt.dispose();
        } catch {}
        try {
          renderer.dispose();
        } catch {}
      };
    };

    const lc = leftCanvasRef.current;
    const rc = rightCanvasRef.current;
    if (!lc || !rc) return;

    const cleanL = setupOne(lc, "left");
    const cleanR = setupOne(rc, "right");

    return () => {
      try {
        envLeftRef.current?.dispose();
      } catch {}
      try {
        envRightRef.current?.dispose();
      } catch {}
      envLeftRef.current = null;
      envRightRef.current = null;

      try {
        pmremLeftRef.current?.dispose();
      } catch {}
      try {
        pmremRightRef.current?.dispose();
      } catch {}
      pmremLeftRef.current = null;
      pmremRightRef.current = null;

      cleanL();
      cleanR();
    };
  }, []);

  // --------------------
  // Low-level: set colors and sample pixel
  // --------------------
  const setLeftColor = (hex: string) => {
    const mesh = leftMeshRef.current;
    if (!mesh) return;
    const c = new THREE.Color(normalizeColor6(hex));
    mesh.setColorAt(0, c);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  const ensureRightInstanceColor = () => {
    const mesh = rightMeshRef.current;
    if (!mesh) return null;
    if (!mesh.instanceColor || mesh.instanceColor.count !== mesh.count) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(mesh.count * 3),
        3,
      );
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    return mesh.instanceColor;
  };

  const setRightColorManual = (hex: string) => {
    const mesh = rightMeshRef.current;
    if (!mesh) return;
    const attr = ensureRightInstanceColor();
    if (!attr) return;

    const c = new THREE.Color(normalizeColor6(hex));
    attr.setXYZ(0, c.r, c.g, c.b);
    attr.needsUpdate = true;
  };

  const sampleCenter = (which: "left" | "right"): RGB => {
    return sampleBestOnRing(
      which,
      leftRendererRef,
      rightRendererRef,
      leftSceneRef,
      rightSceneRef,
      leftCamRef,
      rightCamRef,
      leftRTRef,
      rightRTRef,
    );
  };

  // Preview render whenever sliders / selected color change
  useEffect(() => {
    const input = normalizeColor6(selectedColor);

    setLeftColor(input);
    sampleCenter("left");

    const corrected = applyGainGammaToHex(input, gain, gamma);
    setRightColorManual(corrected);
    sampleCenter("right");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColor, gain, gamma]);

  // --------------------
  // Calibration routine
  // --------------------
  async function runCalibration() {
    if (running) return;
    setRunning(true);
    setStatusMsg("Running calibration…");
    setResults([]);

    const out: ResultRow[] = [];

    const GAIN_MIN = 0.45;
    const GAIN_MAX = 0.95;
    const GAMMA_MIN = 0.90;
    const GAMMA_MAX = 1.45;

    const coarseStep = 0.04;
    const fineStep = 0.01;

    for (let ci = 0; ci < palette.length; ci++) {
      const baseHex = normalizeColor6(palette[ci]);

      setLeftColor(baseHex);
      const target = sampleCenter("left");

      let bestGain = 0.66;
      let bestGamma = 1.18;
      let bestMSE = Infinity;
      let bestGot: RGB = { r: 0, g: 0, b: 0 };

      for (let g1 = GAIN_MIN; g1 <= GAIN_MAX + 1e-9; g1 += coarseStep) {
        for (let ga1 = GAMMA_MIN; ga1 <= GAMMA_MAX + 1e-9; ga1 += coarseStep) {
          const corrected = applyGainGammaToHex(baseHex, g1, ga1);
          setRightColorManual(corrected);
          const got = sampleCenter("right");
          const mse = rgbMSE(got, target);
          if (mse < bestMSE) {
            bestMSE = mse;
            bestGain = g1;
            bestGamma = ga1;
            bestGot = got;
          }
        }
      }

      const fineGainMin = Math.max(GAIN_MIN, bestGain - coarseStep);
      const fineGainMax = Math.min(GAIN_MAX, bestGain + coarseStep);
      const fineGammaMin = Math.max(GAMMA_MIN, bestGamma - coarseStep);
      const fineGammaMax = Math.min(GAMMA_MAX, bestGamma + coarseStep);

      for (let g2 = fineGainMin; g2 <= fineGainMax + 1e-9; g2 += fineStep) {
        for (let ga2 = fineGammaMin; ga2 <= fineGammaMax + 1e-9; ga2 += fineStep) {
          const corrected = applyGainGammaToHex(baseHex, g2, ga2);
          setRightColorManual(corrected);
          const got = sampleCenter("right");
          const mse = rgbMSE(got, target);
          if (mse < bestMSE) {
            bestMSE = mse;
            bestGain = g2;
            bestGamma = ga2;
            bestGot = got;
          }
        }
      }

      out.push({
        hex: baseHex,
        gain: Number(bestGain.toFixed(3)),
        gamma: Number(bestGamma.toFixed(3)),
        mse: Number(bestMSE.toFixed(6)),
        target,
        got: bestGot,
      });

      setResults([...out]);
      setStatusMsg(`Calibrated ${ci + 1}/${palette.length}…`);
      await new Promise((r) => setTimeout(r, 0));
    }

    setRunning(false);
    setStatusMsg("Calibration finished. You can now manually adjust each row, then Save & Apply.");
  }

  // --------------------
  // Manual-edit helpers
  // --------------------
  const updateRow = (hex: string, patch: Partial<Pick<ResultRow, "gain" | "gamma">>) => {
    setResults((prev) =>
      prev.map((r) => {
        if (r.hex !== hex) return r;
        const ng = patch.gain ?? r.gain;
        const nGa = patch.gamma ?? r.gamma;
        return {
          ...r,
          gain: Number.isFinite(ng) ? ng : r.gain,
          gamma: Number.isFinite(nGa) ? nGa : r.gamma,
        };
      }),
    );
  };

  const previewRow = (hex: string) => {
    const row = results.find((r) => r.hex === hex);
    if (!row) return;
    setSelectedColor(row.hex);
    setGain(row.gain);
    setGamma(row.gamma);
  };

  const exportCSV = () => {
    const header = ["hex", "gain", "gamma", "mse"].join(",");
    const lines = results.map((r) => [r.hex, r.gain, r.gamma, r.mse].join(","));
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gain-gamma-calibration.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveAndApply = () => {
    if (!results.length) {
      alert("Run calibration first (or Load Applied Calibration).");
      return;
    }
    saveAndApplyCalibration(
      results.map((r) => ({ hex: r.hex, gain: r.gain, gamma: r.gamma })),
      true,
    );
    alert("✅ Calibration saved & applied globally.");
  };

  const loadApplied = () => {
    const payload = loadActiveCalibration();
    if (!payload?.entries?.length) {
      alert("No applied calibration found.");
      return;
    }

    // Merge loaded entries into results table.
    // If results is empty, create rows with mse=0 and blank target/got.
    setResults((prev) => {
      if (!prev.length) {
        return payload.entries.map((e) => ({
          hex: normalizeColor6(e.hex),
          gain: Number(e.gain),
          gamma: Number(e.gamma),
          mse: 0,
          target: { r: 0, g: 0, b: 0 },
          got: { r: 0, g: 0, b: 0 },
        }));
      }

      const map = new Map(payload.entries.map((e) => [normalizeColor6(e.hex), e]));
      return prev.map((r) => {
        const entry = map.get(r.hex);
        if (!entry) return r;
        return { ...r, gain: Number(entry.gain), gamma: Number(entry.gamma) };
      });
    });

    setStatusMsg("Loaded applied calibration into the table. You can edit and Save & Apply again.");
  };

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#0b1020", color: "#e7eefc" }}>
      {/* ✅ Return to Tuner */}
      <div
        style={{
          position: "fixed",
          top: 14,
          left: 14,
          zIndex: 100000,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <button
          onClick={() => navigate(returnTo, { replace: true })}
          style={{
            background: "#0f172a",
            color: "#dbeafe",
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer",
            fontWeight: 800,
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          }}
          title="Back to Weave Tuner"
        >
          ← Back to Tuner
        </button>
      </div>

      {/* Top controls */}
      <div
        style={{
          padding: 16,
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div>Color:</div>
          <select
            value={selectedColor}
            onChange={(e) => setSelectedColor(e.target.value)}
            style={{ padding: 6 }}
          >
            {palette.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div
            style={{
              width: 20,
              height: 20,
              background: selectedColor,
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.3)",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 320 }}>
          <div style={{ width: 56 }}>Gain</div>
          <input
            type="range"
            min={0.4}
            max={1.0}
            step={0.01}
            value={gain}
            onChange={(e) => setGain(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <div style={{ width: 60, textAlign: "right" }}>{gain.toFixed(2)}</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 320 }}>
          <div style={{ width: 56 }}>Gamma</div>
          <input
            type="range"
            min={0.8}
            max={1.6}
            step={0.01}
            value={gamma}
            onChange={(e) => setGamma(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <div style={{ width: 60, textAlign: "right" }}>{gamma.toFixed(2)}</div>
        </div>

        <button
          onClick={runCalibration}
          disabled={running}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: running ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.18)",
            color: "#e7eefc",
            cursor: running ? "not-allowed" : "pointer",
          }}
        >
          {running ? "Running…" : "Run Calibration"}
        </button>

        <button
          onClick={exportCSV}
          disabled={!results.length}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: !results.length ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.18)",
            color: "#e7eefc",
            cursor: !results.length ? "not-allowed" : "pointer",
          }}
        >
          Export CSV
        </button>

        <button
          onClick={saveAndApply}
          disabled={!results.length}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: !results.length ? "rgba(255,255,255,0.08)" : "rgba(34,197,94,0.22)",
            color: "#e7eefc",
            cursor: !results.length ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
          title="Stores calibration globally (localStorage + window memory) so other pages can use it."
        >
          ✅ Save & Apply Calibration
        </button>

        <button
          onClick={loadApplied}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.14)",
            color: "#e7eefc",
            cursor: "pointer",
          }}
        >
          Load Applied Calibration
        </button>

        <button
          onClick={() => {
            clearCalibration();
            alert("Calibration cleared.");
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(239,68,68,0.18)",
            color: "#e7eefc",
            cursor: "pointer",
          }}
        >
          Clear Calibration
        </button>

        {statusMsg && (
          <div style={{ opacity: 0.85, fontSize: 12, marginLeft: 6 }}>{statusMsg}</div>
        )}
      </div>

      {/* Canvases */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: 10, fontSize: 13, opacity: 0.9 }}>
            LEFT (SMALL) — setColorAt(input)
          </div>
          <div style={{ height: "52vh" }}>
            <canvas ref={leftCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: 10, fontSize: 13, opacity: 0.9 }}>
            RIGHT (LARGE) — manual instanceColor(transform(input))
          </div>
          <div style={{ height: "52vh" }}>
            <canvas ref={rightCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
        </div>
      </div>

      {/* Results table with manual-edit fields */}
      <div style={{ padding: 12 }}>
        <div style={{ marginBottom: 8, opacity: 0.9 }}>Results (per-color, editable):</div>

        <div
          style={{
            maxHeight: "30vh",
            overflow: "auto",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "#0b1020" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                  Color
                </th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                  Hex
                </th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                  Gain (edit)
                </th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                  Gamma (edit)
                </th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                  MSE
                </th>
                <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                  Preview
                </th>
              </tr>
            </thead>

            <tbody>
              {results.map((r) => (
                <tr key={r.hex} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: 10 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        background: r.hex,
                        borderRadius: 4,
                        border: "1px solid rgba(255,255,255,0.25)",
                      }}
                    />
                  </td>

                  <td style={{ padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {r.hex}
                  </td>

                  <td style={{ padding: 10, textAlign: "right" }}>
                    <input
                      type="number"
                      step={0.001}
                      value={r.gain}
                      onChange={(e) => updateRow(r.hex, { gain: Number(e.target.value) })}
                      style={{
                        width: 90,
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.06)",
                        color: "#e7eefc",
                        textAlign: "right",
                      }}
                    />
                  </td>

                  <td style={{ padding: 10, textAlign: "right" }}>
                    <input
                      type="number"
                      step={0.001}
                      value={r.gamma}
                      onChange={(e) => updateRow(r.hex, { gamma: Number(e.target.value) })}
                      style={{
                        width: 90,
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.06)",
                        color: "#e7eefc",
                        textAlign: "right",
                      }}
                    />
                  </td>

                  <td style={{ padding: 10, textAlign: "right" }}>{r.mse.toFixed(6)}</td>

                  <td style={{ padding: 10, textAlign: "right" }}>
                    <button
                      onClick={() => previewRow(r.hex)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#e7eefc",
                        cursor: "pointer",
                      }}
                      title="Loads this row into the top Gain/Gamma sliders for preview."
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              ))}

              {!results.length && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>
                    (Run Calibration to populate table — then edit per row and Save & Apply.)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, lineHeight: 1.4 }}>
          Workflow: Run Calibration → (optionally) edit each row’s Gain/Gamma → Export CSV and/or Save & Apply Calibration.
        </div>
      </div>
    </div>
  );
}