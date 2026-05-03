// src/lib/export3dModel.ts
// 3D model export: GLB (binary GLTF) and per-color STL
// GLB:  multi-color named groups → VR engines + modern slicers (Bambu Studio, PrusaSlicer)
// STL:  one file per color   → legacy multi-head printer setups

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

export interface ExportGroups {
  rings: THREE.Group | null;
  scales: THREE.Group | null;
}

// ── Scale shape generator (mirrors RingRenderer makeScaleShapeRR) ──────────
function makeScaleShape3D(
  shape: string,
  w: number,
  h: number,
  holeDia: number,
  bodyOffY: number,
): THREE.Shape {
  const hw = w / 2;
  const tipY = bodyOffY - h;
  const shoulderY = bodyOffY - h * 0.08;
  const bellyY = bodyOffY - h * 0.45;
  const lowerY = bodyOffY - h * 0.78;
  const s = new THREE.Shape();

  if (shape === "leaf") {
    s.moveTo(0, shoulderY);
    s.bezierCurveTo(hw * 0.95, bodyOffY - h * 0.16, hw * 1.05, bellyY, hw * 0.34, lowerY);
    s.bezierCurveTo(hw * 0.18, bodyOffY - h * 0.9, hw * 0.08, bodyOffY - h * 0.96, 0, tipY);
    s.bezierCurveTo(-hw * 0.08, bodyOffY - h * 0.96, -hw * 0.18, bodyOffY - h * 0.9, -hw * 0.34, lowerY);
    s.bezierCurveTo(-hw * 1.05, bellyY, -hw * 0.95, bodyOffY - h * 0.16, 0, shoulderY);
  } else if (shape === "round") {
    s.moveTo(0, shoulderY);
    s.bezierCurveTo(hw * 0.95, shoulderY, hw * 1.05, bodyOffY - h * 0.52, 0, tipY);
    s.bezierCurveTo(-hw * 1.05, bodyOffY - h * 0.52, -hw * 0.95, shoulderY, 0, shoulderY);
  } else if (shape === "kite") {
    s.moveTo(0, shoulderY);
    s.lineTo(hw * 0.96, bodyOffY - h * 0.3);
    s.lineTo(hw * 0.56, lowerY);
    s.lineTo(0, tipY);
    s.lineTo(-hw * 0.56, lowerY);
    s.lineTo(-hw * 0.96, bodyOffY - h * 0.3);
    s.closePath();
  } else {
    // teardrop (default)
    s.moveTo(0, shoulderY);
    s.bezierCurveTo(hw * 1.08, bodyOffY - h * 0.14, hw * 1.16, bellyY, hw * 0.36, lowerY);
    s.bezierCurveTo(hw * 0.18, bodyOffY - h * 0.88, hw * 0.08, bodyOffY - h * 0.95, 0, tipY);
    s.bezierCurveTo(-hw * 0.08, bodyOffY - h * 0.95, -hw * 0.18, bodyOffY - h * 0.88, -hw * 0.36, lowerY);
    s.bezierCurveTo(-hw * 1.16, bellyY, -hw * 1.08, bodyOffY - h * 0.14, 0, shoulderY);
  }

  const hole = new THREE.Path();
  hole.absellipse(0, 0, holeDia / 2, holeDia / 2, 0, Math.PI * 2, true, 0);
  s.holes.push(hole);
  return s;
}

// ── Collect meshes from a group, grouped by hex color ─────────────────────
interface ColorBucket {
  colorHex: string;
  meshes: THREE.Mesh[];
}

function collectByColor(group: THREE.Group): Map<string, ColorBucket> {
  const map = new Map<string, ColorBucket>();

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!(obj.material instanceof THREE.MeshStandardMaterial)) return;

    const mat = obj.material as THREE.MeshStandardMaterial;
    const hex = "#" + mat.color.getHexString();
    if (!map.has(hex)) map.set(hex, { colorHex: hex, meshes: [] });
    map.get(hex)!.meshes.push(obj);
  });

  return map;
}

// ── Build an export-ready mesh for one entry ──────────────────────────────
// Rings use the existing TorusGeometry.
// Scales are flat in the renderer; we extrude them here for physical depth.
function buildExportMesh(src: THREE.Mesh, colorHex: string): THREE.Mesh {
  let geo: THREE.BufferGeometry;

  const sp = src.userData.scaleExportParams as
    | { shape: string; width: number; height: number; holeDia: number; bodyOffY: number }
    | undefined;

  if (sp) {
    const shape = makeScaleShape3D(sp.shape, sp.width, sp.height, sp.holeDia, sp.bodyOffY);
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.4,      // 0.4 mm thickness
      bevelEnabled: false,
      steps: 1,
      curveSegments: 16,
    });
  } else {
    // Rings: reuse existing geometry (TorusGeometry is already correct)
    geo = src.geometry.clone();
  }

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    metalness: 0.25,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);

  // Bake world transform into the mesh so the export scene has no hierarchy offsets
  src.updateWorldMatrix(true, false);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(src.matrixWorld);

  return mesh;
}

// ── Build a GLB-ready scene grouped by color ──────────────────────────────
function buildExportScene(groups: ExportGroups): THREE.Scene {
  const scene = new THREE.Scene();
  const colorMap = new Map<string, THREE.Group>();

  const process = (srcGroup: THREE.Group | null) => {
    if (!srcGroup) return;
    for (const [hex, bucket] of collectByColor(srcGroup)) {
      if (!colorMap.has(hex)) {
        const g = new THREE.Group();
        g.name = `color_${hex.replace("#", "")}`;
        colorMap.set(hex, g);
        scene.add(g);
      }
      const dest = colorMap.get(hex)!;
      for (const src of bucket.meshes) dest.add(buildExportMesh(src, hex));
    }
  };

  process(groups.rings);
  process(groups.scales);
  return scene;
}

// ── Download helpers ──────────────────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

// ── Public: GLB export ────────────────────────────────────────────────────
export async function exportAsGLB(groups: ExportGroups, name = "chainmail-design"): Promise<void> {
  const scene = buildExportScene(groups);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true }) as ArrayBuffer;
  triggerDownload(new Blob([result], { type: "model/gltf-binary" }), `${name}.glb`);
}

// ── Public: per-color STL export ─────────────────────────────────────────
// Produces one .stl file per unique color (for multi-head print setups).
export function exportAsColorSTLs(groups: ExportGroups, name = "chainmail-design"): void {
  const stlExporter = new STLExporter();
  const colorMap = new Map<string, ColorBucket>();

  const merge = (g: THREE.Group | null) => {
    if (!g) return;
    for (const [hex, bucket] of collectByColor(g)) {
      if (!colorMap.has(hex)) colorMap.set(hex, { colorHex: hex, meshes: [] });
      colorMap.get(hex)!.meshes.push(...bucket.meshes);
    }
  };
  merge(groups.rings);
  merge(groups.scales);

  for (const [hex, bucket] of colorMap) {
    const tmp = new THREE.Scene();
    for (const src of bucket.meshes) tmp.add(buildExportMesh(src, hex));
    const stlString = stlExporter.parse(tmp, { binary: false }) as string;
    const colorName = hex.replace("#", "");
    triggerDownload(new Blob([stlString], { type: "model/stl" }), `${name}-${colorName}.stl`);
  }
}

// ── Rough size estimate (helps show a warning before large exports) ────────
export function estimateGLBSizeMB(groups: ExportGroups): number {
  let vertexCount = 0;
  const count = (g: THREE.Group | null) => {
    if (!g) return;
    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        vertexCount += (obj.geometry?.attributes.position?.count ?? 0);
      }
    });
  };
  count(groups.rings);
  count(groups.scales);
  // Rough: ~40 bytes/vertex for GLB (position + normal + index overhead)
  return Math.round((vertexCount * 40) / (1024 * 1024) * 10) / 10;
}
