// src/lib/autoColorCalibration.ts
//
// Headless color calibration. Runs the SAME offscreen-render + gain/gamma
// search the dev calibration page (ColorCalibrationTest.tsx) does, but with no
// UI: it spins up two off-DOM WebGL rigs, measures how each palette color
// renders on a metal ring, finds the per-color gain/gamma that best matches,
// then saves + applies the calibration globally. Saving fires the
// `calibrationUpdated` event that RingRenderer already listens to, so painted
// colors refresh automatically.
//
// Used by the small "C" auto-calibrate button on the Designer + Freeform color
// palettes — runs in place behind a progress bar, no page or dialog.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { applyGainGammaToHex, saveAndApplyCalibration } from "../utils/colorCalibration";

type RGB = { r: number; g: number; b: number };

// Standard 34-color palette — matches the dev calibration page so the headless
// run produces the same table.
const DEFAULT_PALETTE: string[] = [
  "#ffffff", "#000000", "#c0c0c0", "#808080", "#ff0000", "#00ff00", "#0000ff",
  "#ffff00", "#00ffff", "#ff00ff", "#ff7f00", "#7fff00", "#00ff7f", "#007fff",
  "#7f00ff", "#ff007f", "#8b0000", "#b22222", "#dc143c", "#ffa07a", "#ffd700",
  "#daa520", "#8b4513", "#a0522d", "#deb887", "#2e8b57", "#3cb371", "#20b2aa",
  "#4682b4", "#4169e1", "#191970", "#4b0082", "#9400d3", "#ff69b4",
];

function normalizeColor6(hex: string): string {
  const h = (hex || "").trim().toLowerCase();
  const m6 = /^#([0-9a-f]{6})$/.exec(h);
  if (m6) return `#${m6[1]}`;
  const m8 = /^#([0-9a-f]{8})$/.exec(h);
  if (m8) return `#${m8[1].slice(0, 6)}`;
  const m3 = /^#([0-9a-f]{3})$/.exec(h);
  if (m3) return `#${m3[1][0]}${m3[1][0]}${m3[1][1]}${m3[1][1]}${m3[1][2]}${m3[1][2]}`;
  return "#ffffff";
}

function ensureWhiteVertexColors(geom: THREE.BufferGeometry) {
  const existing = geom.getAttribute("color") as THREE.BufferAttribute | undefined;
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return;
  if (existing && existing.count === pos.count && existing.itemSize === 3) return;
  const arr = new Float32Array(pos.count * 3);
  arr.fill(1);
  geom.setAttribute("color", new THREE.BufferAttribute(arr, 3));
}

function rgbMSE(a: RGB, b: RGB) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function readPixel(renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget, px: number, py: number): RGB {
  const buf = new Uint8Array(4);
  const x = Math.max(0, Math.min(rt.width - 1, Math.floor(px)));
  const y = Math.max(0, Math.min(rt.height - 1, Math.floor(py)));
  renderer.readRenderTargetPixels(rt, x, y, 1, 1, buf);
  return { r: buf[0] / 255, g: buf[1] / 255, b: buf[2] / 255 };
}

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  rt: THREE.WebGLRenderTarget;
  mesh: THREE.InstancedMesh;
  pmrem: THREE.PMREMGenerator | null;
  env: THREE.Texture | null;
  dispose: () => void;
}

function makeRig(): Rig {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

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
  renderer.setSize(256, 256, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1020");

  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
  cam.position.set(0, 0, 6);
  cam.lookAt(0, 0, 0);

  let pmrem: THREE.PMREMGenerator | null = null;
  let env: THREE.Texture | null = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
  } catch {/* environment optional */}

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 1.15);
  dir.position.set(4, 6, 10);
  scene.add(dir);
  const rim = new THREE.DirectionalLight(0xffffff, 0.55);
  rim.position.set(-4, -6, -8);
  scene.add(rim);

  const geom = new THREE.TorusGeometry(1.1, 0.35, 16, 32);
  ensureWhiteVertexColors(geom);
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.25, vertexColors: true });
  (mat as any).envMapIntensity = 1.0;

  const mesh = new THREE.InstancedMesh(geom, mat, 1);
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  dummy.rotation.set(0, 0, Math.PI / 2);
  dummy.updateMatrix();
  mesh.setMatrixAt(0, dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);

  const rt = new THREE.WebGLRenderTarget(256, 256, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
  });

  const dispose = () => {
    try { env?.dispose(); } catch {}
    try { pmrem?.dispose(); } catch {}
    try { geom.dispose(); } catch {}
    try { mat.dispose(); } catch {}
    try { rt.dispose(); } catch {}
    try { renderer.dispose(); } catch {}
    try { renderer.forceContextLoss(); } catch {}
  };

  return { renderer, scene, cam, rt, mesh, pmrem, env, dispose };
}

function setColor(rig: Rig, hex: string) {
  const c = new THREE.Color(normalizeColor6(hex));
  rig.mesh.setColorAt(0, c);
  if (rig.mesh.instanceColor) rig.mesh.instanceColor.needsUpdate = true;
}

// Sample the ring surface: the torus hole shows the background, so we pick the
// probe point most different from the center (= the lit metal surface).
function sampleRing(rig: Rig): RGB {
  rig.renderer.setRenderTarget(rig.rt);
  rig.renderer.render(rig.scene, rig.cam);

  const bg = readPixel(rig.renderer, rig.rt, rig.rt.width / 2, rig.rt.height / 2);
  const pts: Array<[number, number]> = [
    [0.72, 0.5], [0.28, 0.5], [0.5, 0.72], [0.5, 0.28],
    [0.66, 0.66], [0.34, 0.66], [0.66, 0.34], [0.34, 0.34],
    [0.78, 0.5], [0.22, 0.5], [0.5, 0.78], [0.5, 0.22],
  ];
  let best = bg;
  let bestScore = -Infinity;
  for (const [nx, ny] of pts) {
    const c = readPixel(rig.renderer, rig.rt, nx * (rig.rt.width - 1), ny * (rig.rt.height - 1));
    const score = rgbMSE(c, bg);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  rig.renderer.setRenderTarget(null);
  return best;
}

export interface AutoCalibrationProgress {
  done: number;
  total: number;
}

/**
 * Run the full headless calibration and save+apply it. Resolves with the number
 * of colors calibrated. `onProgress` fires once per color so a progress bar can
 * animate. Optional `palette` overrides the default 34-color set.
 */
export async function runAutoColorCalibration(
  onProgress?: (p: AutoCalibrationProgress) => void,
  palette: string[] = DEFAULT_PALETTE,
): Promise<number> {
  const target = makeRig();   // renders the raw color → measured "truth"
  const candidate = makeRig(); // renders the gain/gamma-corrected color

  const GAIN_MIN = 0.15, GAIN_MAX = 2.5, GAMMA_MIN = 0.4, GAMMA_MAX = 2.0;
  const coarseStep = 0.12, fineStep = 0.01;

  const results: Array<{ hex: string; gain: number; gamma: number }> = [];

  try {
    for (let ci = 0; ci < palette.length; ci++) {
      const baseHex = normalizeColor6(palette[ci]);

      setColor(target, baseHex);
      const goal = sampleRing(target);

      let bestGain = 0.66, bestGamma = 1.18, bestMSE = Infinity;

      const search = (gMin: number, gMax: number, gaMin: number, gaMax: number, step: number) => {
        for (let g = gMin; g <= gMax + 1e-9; g += step) {
          for (let ga = gaMin; ga <= gaMax + 1e-9; ga += step) {
            setColor(candidate, applyGainGammaToHex(baseHex, g, ga));
            const got = sampleRing(candidate);
            const mse = rgbMSE(got, goal);
            if (mse < bestMSE) { bestMSE = mse; bestGain = g; bestGamma = ga; }
          }
        }
      };

      search(GAIN_MIN, GAIN_MAX, GAMMA_MIN, GAMMA_MAX, coarseStep);
      search(
        Math.max(GAIN_MIN, bestGain - coarseStep * 1.1),
        Math.min(GAIN_MAX, bestGain + coarseStep * 1.1),
        Math.max(GAMMA_MIN, bestGamma - coarseStep * 1.1),
        Math.min(GAMMA_MAX, bestGamma + coarseStep * 1.1),
        fineStep,
      );

      results.push({
        hex: baseHex,
        gain: Number(bestGain.toFixed(3)),
        gamma: Number(bestGamma.toFixed(3)),
      });

      onProgress?.({ done: ci + 1, total: palette.length });
      // Yield so the progress bar can paint and the UI stays responsive.
      await new Promise((r) => setTimeout(r, 0));
    }

    // Persist + apply globally (fires calibrationUpdated → renderers refresh).
    saveAndApplyCalibration(results, true);
  } finally {
    target.dispose();
    candidate.dispose();
  }

  return results.length;
}
