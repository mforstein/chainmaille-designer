// src/pages/ChainmailWeaveTuner.tsx
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { Link } from "react-router-dom";
import { DraggableCompassNav, DraggablePill } from "../App";
import { computeRingVarsIndependent } from "../utils/ringMath";

// ========================================
// CONSTANTS
// ========================================
const ID_OPTIONS = [
  "7/64", "1/8", "9/64", "5/32", "3/16", "1/4",
  "5/16", "3/8", "7/16", "1/2", "5/8",
] as const;
const WIRE_OPTIONS = [0.9, 1.2, 1.6, 2.0, 2.5, 3.0] as const;
const SCALE_SHAPES = ["teardrop", "leaf", "round", "kite"] as const;

type ScaleShape = (typeof SCALE_SHAPES)[number];
type ScaleWeaveMode = "independent" | "interlocked";

const DEFAULT_SCALE_COLOR = "#4dd0e1";
const FOV = 40;
const DEG = Math.PI / 180;
const SCALE_THICKNESS = 0.32;
const DEFAULT_SCALE_TIP_LIFT_DEG = 18;
const DEFAULT_SCALE_ROW_CLEARANCE_Z = 0.22;

const TUNER_STORAGE_KEY = "chainmailMatrix";
const TUNER_SCALE_PREFS_KEY = "chainmailTuner.scalePrefs.v4.same3dscene.holelock";
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

type OverlayScale = {
  key: string;
  row: number;
  col: number;
  holeX: number;
  holeY: number;
  bodyX: number;
  bodyY: number;
  holeDiameter: number;
  width: number;
  height: number;
  color: string;
  shape: ScaleShape;
  tiltRad: number;
};

type PersistedScalePrefs = {
  scaleEnabled?: boolean;
  scaleBehindRings?: boolean;
  scaleHoleDiameter?: number;
  scaleWidth?: number;
  scaleHeight?: number;
  scaleShape?: ScaleShape;
  scaleDrop?: number;
  scaleColor?: string;
  scaleOnEveryCell?: boolean;
  lockScaleHolesToRingCenters?: boolean;
  scaleCenterSpacing?: number;
  scaleGridOffsetX?: number;
  scaleGridOffsetY?: number;
  scaleHoleOffsetY?: number;
  scaleWeaveMode?: ScaleWeaveMode;
  scaleAngleIn?: number;
  scaleAngleOut?: number;
  scalePlaneZ?: number;
  scaleTipLiftDeg?: number;
  scaleRowClearanceZ?: number;
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

function sortScalesForDraw(scales?: OverlayScale[]) {
  if (!Array.isArray(scales)) return [];

  return [...scales].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;

    const center = 0;
    const da = Math.abs(a.col - center);
    const db = Math.abs(b.col - center);

    if (da !== db) return da - db;

    return a.col - b.col;
  });
}
function buildOverlayScales(args: {
  rings: LogicalRing[];
  scaleEnabled: boolean;
  scaleHoleId: number;
  scaleWidth: number;
  scaleHeight: number;
  scaleColor: string;
  scaleShape: ScaleShape;
  scaleDrop: number;
  scaleHoleOffsetY: number;
  scaleOnEveryCell: boolean;
  lockScaleHolesToRingCenters: boolean;
  scaleCenterSpacing: number;
  scaleGridOffsetX: number;
  scaleGridOffsetY: number;
  scaleWeaveMode: ScaleWeaveMode;
  scaleAngleIn: number;
  scaleAngleOut: number;
}): OverlayScale[] {
  const {
    rings,
    scaleEnabled,
    scaleHoleId,
    scaleWidth,
    scaleHeight,
    scaleColor,
    scaleShape,
    scaleDrop,
    scaleHoleOffsetY,
    scaleOnEveryCell,
    lockScaleHolesToRingCenters,
    scaleCenterSpacing,
    scaleGridOffsetX,
    scaleGridOffsetY,
    scaleWeaveMode,
    scaleAngleIn,
    scaleAngleOut,
  } = args;

  if (!scaleEnabled) return [];

  const chosen = scaleOnEveryCell
    ? rings
    : rings.filter((r) => r.row >= 1 && r.row <= 3 && r.col >= 1 && r.col <= 4);

  return chosen.map((ring) => {
    const useInterlocked = lockScaleHolesToRingCenters || scaleWeaveMode === "interlocked";
    let holeX = ring.x;
    let holeY = ring.y;

    if (!useInterlocked) {
      const p = rcToLogical(ring.row, ring.col, scaleCenterSpacing, scaleGridOffsetX, scaleGridOffsetY);
      holeX = p.x;
      holeY = p.y;
    }

    const holeShoulderInset = Math.max(scaleHoleId * 0.54, scaleHeight * 0.15);
    const bodyY = holeY - holeShoulderInset + scaleDrop + (useInterlocked ? 0 : scaleHoleOffsetY);
    const angleDeg = ring.row % 2 === 0 ? scaleAngleIn : scaleAngleOut;

    return {
      key: `${ring.row}-${ring.col}`,
      row: ring.row,
      col: ring.col,
      holeX,
      holeY,
      bodyX: holeX,
      bodyY,
      holeDiameter: scaleHoleId,
      width: scaleWidth,
      height: scaleHeight,
      color: scaleColor,
      shape: scaleShape,
      tiltRad: angleDeg * DEG,
    };
  });
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

function ensureHoleWinding(path: THREE.Path, radius: number) {
  // Reverse winding so the hole reliably subtracts from the outer contour.
  path.absellipse(0, 0, radius, radius, 0, Math.PI * 2, true, 0);
}

function makeScaleShape(
  shape: ScaleShape,
  width: number,
  height: number,
  holeDiameter: number,
  bodyOffsetY: number,
): THREE.Shape {
  const halfW = width / 2;
  const tipY = bodyOffsetY - height;
  const shoulderY = bodyOffsetY - height * 0.08;
  const bellyY = bodyOffsetY - height * 0.45;
  const lowerY = bodyOffsetY - height * 0.78;

  const s = new THREE.Shape();

  switch (shape) {
    case "leaf": {
      s.moveTo(0, shoulderY);
      s.bezierCurveTo(halfW * 0.95, bodyOffsetY - height * 0.16, halfW * 1.05, bellyY, halfW * 0.34, lowerY);
      s.bezierCurveTo(halfW * 0.18, bodyOffsetY - height * 0.9, halfW * 0.08, bodyOffsetY - height * 0.96, 0, tipY);
      s.bezierCurveTo(-halfW * 0.08, bodyOffsetY - height * 0.96, -halfW * 0.18, bodyOffsetY - height * 0.9, -halfW * 0.34, lowerY);
      s.bezierCurveTo(-halfW * 1.05, bellyY, -halfW * 0.95, bodyOffsetY - height * 0.16, 0, shoulderY);
      break;
    }
    case "round": {
      s.moveTo(0, shoulderY);
      s.bezierCurveTo(halfW * 0.95, shoulderY, halfW * 1.05, bodyOffsetY - height * 0.52, 0, tipY);
      s.bezierCurveTo(-halfW * 1.05, bodyOffsetY - height * 0.52, -halfW * 0.95, shoulderY, 0, shoulderY);
      break;
    }
    case "kite": {
      s.moveTo(0, shoulderY);
      s.lineTo(halfW * 0.96, bodyOffsetY - height * 0.3);
      s.lineTo(halfW * 0.56, lowerY);
      s.lineTo(0, tipY);
      s.lineTo(-halfW * 0.56, lowerY);
      s.lineTo(-halfW * 0.96, bodyOffsetY - height * 0.3);
      s.closePath();
      break;
    }
    default: {
      s.moveTo(0, shoulderY);
      s.bezierCurveTo(halfW * 1.08, bodyOffsetY - height * 0.14, halfW * 1.16, bellyY, halfW * 0.36, lowerY);
      s.bezierCurveTo(halfW * 0.18, bodyOffsetY - height * 0.88, halfW * 0.08, bodyOffsetY - height * 0.95, 0, tipY);
      s.bezierCurveTo(-halfW * 0.08, bodyOffsetY - height * 0.95, -halfW * 0.18, bodyOffsetY - height * 0.88, -halfW * 0.36, lowerY);
      s.bezierCurveTo(-halfW * 1.16, bellyY, -halfW * 1.08, bodyOffsetY - height * 0.14, 0, shoulderY);
      break;
    }
  }

  const holeRadius = holeDiameter / 2;
  const hole = new THREE.Path();
  ensureHoleWinding(hole, holeRadius);
  s.holes.push(hole);
  return s;
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

function makeHoleRim(radius: number, z: number, color = 0x20404d) {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(96).map((p) => new THREE.Vector3(p.x, p.y, z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
  return new THREE.LineLoop(geometry, material);
}

function makeScalePivot(
  scale: OverlayScale,
  planeZ: number,
  tipLiftDeg: number,
  rowClearanceZ: number,
  maxRow: number,
): THREE.Group {
  const bodyOffsetY = scale.bodyY - scale.holeY;
  const shape = makeScaleShape(scale.shape, scale.width, scale.height, scale.holeDiameter, bodyOffsetY);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: SCALE_THICKNESS,
    bevelEnabled: false,
    curveSegments: 72,
    steps: 1,
  });
  geometry.translate(0, 0, -SCALE_THICKNESS / 2);
  geometry.computeVertexNormals();

  const fillMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(scale.color),
    side: THREE.DoubleSide,
    transparent: false,
    metalness: 0.08,
    roughness: 0.8,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x234050,
    transparent: true,
    opacity: 0.98,
  });

  const pivot = new THREE.Group();
  const rowStackZ = (maxRow - scale.row) * rowClearanceZ;
  pivot.position.set(scale.holeX, -scale.holeY, planeZ + rowStackZ);
  pivot.rotation.order = "YXZ";
  pivot.rotation.y = scale.tiltRad;
  pivot.rotation.x = -tipLiftDeg * DEG;

  const mesh = new THREE.Mesh(geometry, fillMaterial);
  mesh.renderOrder = 20 + (maxRow - scale.row);
  pivot.add(mesh);

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
  edges.renderOrder = mesh.renderOrder + 1;
  pivot.add(edges);

  const holeRimFront = makeHoleRim(scale.holeDiameter / 2, SCALE_THICKNESS / 2 + 0.004, 0x1f4755);
  const holeRimBack = makeHoleRim(scale.holeDiameter / 2, -SCALE_THICKNESS / 2 - 0.004, 0x1f4755);
  holeRimFront.renderOrder = mesh.renderOrder + 2;
  holeRimBack.renderOrder = mesh.renderOrder + 2;
  pivot.add(holeRimFront);
  pivot.add(holeRimBack);

  return pivot;
}

// ========================================
// MAIN COMPONENT
// ========================================
export default function ChainmailWeaveTuner() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sceneHostRef = useRef<HTMLDivElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const ringGroupRef = useRef<THREE.Group | null>(null);
  const scaleGroupRef = useRef<THREE.Group | null>(null);

  // Ring params
  const [id, setId] = useState("5/16");
  const [wire, setWire] = useState(1.2);
  const [centerSpacing, setCenterSpacing] = useState(6.7);
  const [angleIn, setAngleIn] = useState(25);
  const [angleOut, setAngleOut] = useState(-25);

  // Scale params
  const [scaleEnabled, setScaleEnabled] = useState(true);
  const [scaleBehindRings, setScaleBehindRings] = useState(false);
  const [scaleHoleId, setScaleHoleId] = useState(convertToMM("5/16"));
  const [scaleWidth, setScaleWidth] = useState(9.1);
  const [scaleDrop, setScaleDrop] = useState(9.2);
  const [scaleHeight, setScaleHeight] = useState(22.2);
  const [scaleShape, setScaleShape] = useState<ScaleShape>("teardrop");
  const [scaleColor, setScaleColor] = useState(DEFAULT_SCALE_COLOR);
  const [scaleOnEveryCell, setScaleOnEveryCell] = useState(true);
  const [lockScaleHolesToRingCenters, setLockScaleHolesToRingCenters] = useState(true);
  const [scaleCenterSpacing, setScaleCenterSpacing] = useState(19.6);
  const [scaleGridOffsetX, setScaleGridOffsetX] = useState(0);
  const [scaleGridOffsetY, setScaleGridOffsetY] = useState(0);
  const [scaleHoleOffsetY, setScaleHoleOffsetY] = useState(-6.2);
  const [scaleWeaveMode, setScaleWeaveMode] = useState<ScaleWeaveMode>("interlocked");
  const [scaleAngleIn, setScaleAngleIn] = useState(25);
  const [scaleAngleOut, setScaleAngleOut] = useState(-25);
  const [scalePlaneZ, setScalePlaneZ] = useState(0);
  const [scaleTipLiftDeg, setScaleTipLiftDeg] = useState(14);
  const [scaleRowClearanceZ, setScaleRowClearanceZ] = useState(1.2);
  const [cameraZoom, setCameraZoom] = useState(1);

  const [status, setStatus] = useState<"valid" | "no_solution">("valid");
  const [showCompass, setShowCompass] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TUNER_SCALE_PREFS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as PersistedScalePrefs;
      if (typeof s.scaleEnabled === "boolean") setScaleEnabled(s.scaleEnabled);
      if (typeof s.scaleBehindRings === "boolean") setScaleBehindRings(s.scaleBehindRings);
      if (typeof s.scaleHoleDiameter === "number") setScaleHoleId(s.scaleHoleDiameter);
      if (typeof s.scaleWidth === "number") setScaleWidth(s.scaleWidth);
      if (typeof s.scaleHeight === "number") setScaleHeight(s.scaleHeight);
      if (s.scaleShape && SCALE_SHAPES.includes(s.scaleShape)) setScaleShape(s.scaleShape);
      if (typeof s.scaleDrop === "number") setScaleDrop(s.scaleDrop);
      if (typeof s.scaleColor === "string") setScaleColor(s.scaleColor);
      if (typeof s.scaleOnEveryCell === "boolean") setScaleOnEveryCell(s.scaleOnEveryCell);
      if (typeof s.lockScaleHolesToRingCenters === "boolean") setLockScaleHolesToRingCenters(s.lockScaleHolesToRingCenters);
      if (typeof s.scaleCenterSpacing === "number") setScaleCenterSpacing(s.scaleCenterSpacing);
      if (typeof s.scaleGridOffsetX === "number") setScaleGridOffsetX(s.scaleGridOffsetX);
      if (typeof s.scaleGridOffsetY === "number") setScaleGridOffsetY(s.scaleGridOffsetY);
      if (typeof s.scaleHoleOffsetY === "number") setScaleHoleOffsetY(s.scaleHoleOffsetY);
      if (s.scaleWeaveMode === "independent" || s.scaleWeaveMode === "interlocked") setScaleWeaveMode(s.scaleWeaveMode);
      if (typeof s.scaleAngleIn === "number") setScaleAngleIn(s.scaleAngleIn);
      if (typeof s.scaleAngleOut === "number") setScaleAngleOut(s.scaleAngleOut);
      if (typeof s.scalePlaneZ === "number") setScalePlaneZ(s.scalePlaneZ);
      if (typeof s.scaleTipLiftDeg === "number") setScaleTipLiftDeg(s.scaleTipLiftDeg);
      if (typeof s.scaleRowClearanceZ === "number") setScaleRowClearanceZ(s.scaleRowClearanceZ);
    } catch {}

    // Fallback: if the latest Freeform snapshot has newer scale settings,
    // reuse them so shape / angles / Z survive full page reloads.
    try {
      const rawSnapshot = localStorage.getItem(FREEFORM_TUNER_SNAPSHOT_KEY);
      if (!rawSnapshot) return;
      const snap = JSON.parse(rawSnapshot) as any;
      const s = snap?.scaleSettings;
      if (!s) return;
      if (typeof s.scaleEnabled === "boolean") setScaleEnabled(s.scaleEnabled);
      if (typeof s.scaleBehindRings === "boolean") setScaleBehindRings(s.scaleBehindRings);
      if (typeof s.scaleHoleDiameter === "number") setScaleHoleId(s.scaleHoleDiameter);
      if (typeof s.scaleWidth === "number") setScaleWidth(s.scaleWidth);
      if (typeof s.scaleHeight === "number") setScaleHeight(s.scaleHeight);
      if (s.scaleShape && SCALE_SHAPES.includes(s.scaleShape)) setScaleShape(s.scaleShape);
      if (typeof s.scaleDrop === "number") setScaleDrop(s.scaleDrop);
      if (typeof s.scaleColor === "string") setScaleColor(s.scaleColor);
      if (typeof s.scaleOnEveryCell === "boolean") setScaleOnEveryCell(s.scaleOnEveryCell);
      if (typeof s.lockScaleHolesToRingCenters === "boolean") setLockScaleHolesToRingCenters(s.lockScaleHolesToRingCenters);
      if (typeof s.scaleCenterSpacing === "number") setScaleCenterSpacing(s.scaleCenterSpacing);
      if (typeof s.scaleGridOffsetX === "number") setScaleGridOffsetX(s.scaleGridOffsetX);
      if (typeof s.scaleGridOffsetY === "number") setScaleGridOffsetY(s.scaleGridOffsetY);
      if (typeof s.scaleHoleOffsetY === "number") setScaleHoleOffsetY(s.scaleHoleOffsetY);
      if (s.scaleWeaveMode === "independent" || s.scaleWeaveMode === "interlocked") setScaleWeaveMode(s.scaleWeaveMode);
      if (typeof s.scaleAngleIn === "number") setScaleAngleIn(s.scaleAngleIn);
      if (typeof s.scaleAngleOut === "number") setScaleAngleOut(s.scaleAngleOut);
      if (typeof s.scalePlaneZ === "number") setScalePlaneZ(s.scalePlaneZ);
      if (typeof s.scaleTipLiftDeg === "number") setScaleTipLiftDeg(s.scaleTipLiftDeg);
      if (typeof s.scaleRowClearanceZ === "number") setScaleRowClearanceZ(s.scaleRowClearanceZ);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TUNER_SCALE_PREFS_KEY, JSON.stringify({
        scaleEnabled,
        scaleBehindRings,
        scaleHoleDiameter: +scaleHoleId.toFixed(4),
        scaleWidth: +scaleWidth.toFixed(3),
        scaleHeight: +scaleHeight.toFixed(3),
        scaleShape,
        scaleDrop: +scaleDrop.toFixed(3),
        scaleColor,
        scaleOnEveryCell,
        lockScaleHolesToRingCenters,
        scaleCenterSpacing: +scaleCenterSpacing.toFixed(3),
        scaleGridOffsetX: +scaleGridOffsetX.toFixed(3),
        scaleGridOffsetY: +scaleGridOffsetY.toFixed(3),
        scaleHoleOffsetY: +scaleHoleOffsetY.toFixed(3),
        scaleWeaveMode,
        scaleAngleIn: +scaleAngleIn.toFixed(1),
        scaleAngleOut: +scaleAngleOut.toFixed(1),
        scalePlaneZ: +scalePlaneZ.toFixed(3),
        scaleTipLiftDeg: +scaleTipLiftDeg.toFixed(1),
        scaleRowClearanceZ: +scaleRowClearanceZ.toFixed(3),
      } satisfies PersistedScalePrefs));
    } catch {}
  }, [
    scaleEnabled, scaleBehindRings, scaleHoleId, scaleWidth, scaleHeight, scaleShape,
    scaleDrop, scaleColor, scaleOnEveryCell, lockScaleHolesToRingCenters,
    scaleCenterSpacing, scaleGridOffsetX, scaleGridOffsetY, scaleHoleOffsetY,
    scaleWeaveMode, scaleAngleIn, scaleAngleOut, scalePlaneZ,
    scaleTipLiftDeg, scaleRowClearanceZ,
  ]);

  const ringVars = useMemo(() => computeRingVarsIndependent(id, wire), [id, wire]);
  const arDisplay = useMemo(
    () => (ringVars.WD_mm > 0 ? ringVars.ID_mm / ringVars.WD_mm : 0).toFixed(2),
    [ringVars],
  );

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

  const overlayScales = useMemo(() => buildOverlayScales({
    rings,
    scaleEnabled,
    scaleHoleId,
    scaleWidth,
    scaleHeight,
    scaleColor,
    scaleShape,
    scaleDrop,
    scaleHoleOffsetY,
    scaleOnEveryCell,
    lockScaleHolesToRingCenters,
    scaleCenterSpacing,
    scaleGridOffsetX,
    scaleGridOffsetY,
    scaleWeaveMode,
    scaleAngleIn,
    scaleAngleOut,
  }), [
    rings, scaleEnabled, scaleHoleId, scaleWidth, scaleHeight, scaleColor, scaleShape,
    scaleDrop, scaleHoleOffsetY, scaleOnEveryCell, lockScaleHolesToRingCenters,
    scaleCenterSpacing, scaleGridOffsetX, scaleGridOffsetY, scaleWeaveMode,
    scaleAngleIn, scaleAngleOut,
  ]);

const sortedScales = useMemo(() => sortScalesForDraw(overlayScales), [overlayScales]);


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
      scaleSettings: {
        scaleEnabled,
        scaleBehindRings,
        scaleHoleDiameter: +scaleHoleId.toFixed(4),
        scaleWidth: +scaleWidth.toFixed(3),
        scaleHeight: +scaleHeight.toFixed(3),
        scaleShape,
        scaleDrop: +scaleDrop.toFixed(3),
        scaleColor,
        scaleOnEveryCell,
        lockScaleHolesToRingCenters,
        scaleCenterSpacing: +scaleCenterSpacing.toFixed(3),
        scaleGridOffsetX: +scaleGridOffsetX.toFixed(3),
        scaleGridOffsetY: +scaleGridOffsetY.toFixed(3),
        scaleHoleOffsetY: +scaleHoleOffsetY.toFixed(3),
        scaleWeaveMode,
        scaleAngleIn,
        scaleAngleOut,
        scalePlaneZ: +scalePlaneZ.toFixed(3),
        scaleTipLiftDeg: +scaleTipLiftDeg.toFixed(1),
        scaleRowClearanceZ: +scaleRowClearanceZ.toFixed(3),
      },
      rings: rings.map((r) => ({
        row: r.row,
        col: r.col,
        color: "#ffffff",
      })),
      scales: sortedScales.map((s) => ({
        row: s.row,
        col: s.col,
        colorHex: s.color,
        holeX: s.holeX,
        holeY: s.holeY,
        bodyX: s.bodyX,
        bodyY: s.bodyY,
        holeDiameter: s.holeDiameter,
        width: s.width,
        height: s.height,
        shape: s.shape,
        tiltRad: s.tiltRad,
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
  scaleEnabled,
  scaleBehindRings,
  scaleHoleId,
  scaleWidth,
  scaleHeight,
  scaleShape,
  scaleDrop,
  scaleColor,
  scaleOnEveryCell,
  lockScaleHolesToRingCenters,
  scaleCenterSpacing,
  scaleGridOffsetX,
  scaleGridOffsetY,
  scaleHoleOffsetY,
  scaleWeaveMode,
  scaleAngleIn,
  scaleAngleOut,
  scalePlaneZ,
  scaleTipLiftDeg,
  scaleRowClearanceZ,
  rings,
  sortedScales,
]);


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
        scaleSettings: {
          scaleEnabled,
          scaleBehindRings,
          scaleHoleDiameter: scaleHoleId,
          scaleWidth,
          scaleHeight,
          scaleShape,
          scaleDrop,
          scaleColor,
          scaleOnEveryCell,
          lockScaleHolesToRingCenters,
          scaleCenterSpacing,
          scaleGridOffsetX,
          scaleGridOffsetY,
          scaleHoleOffsetY,
          scaleWeaveMode,
          scaleAngleIn,
          scaleAngleOut,
          scalePlaneZ,
          scaleTipLiftDeg,
          scaleRowClearanceZ,
        },
        rings: rings.map((r) => ({
          row: r.row,
          col: r.col,
          color: "#ffffff",
        })),
        scales: sortedScales.map((s) => ({
          row: s.row,
          col: s.col,
          colorHex: s.color,
          holeX: s.holeX,
          holeY: s.holeY,
          bodyX: s.bodyX,
          bodyY: s.bodyY,
          holeDiameter: s.holeDiameter,
          width: s.width,
          height: s.height,
          shape: s.shape,
          tiltRad: s.tiltRad,
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
          scaleSettings: {
            scaleEnabled,
            scaleBehindRings,
            scaleHoleDiameter: scaleHoleId,
            scaleWidth,
            scaleHeight,
            scaleShape,
            scaleDrop,
            scaleColor,
            scaleOnEveryCell,
            lockScaleHolesToRingCenters,
            scaleCenterSpacing,
            scaleGridOffsetX,
            scaleGridOffsetY,
            scaleHoleOffsetY,
            scaleWeaveMode,
            scaleAngleIn,
            scaleAngleOut,
            scalePlaneZ,
            scaleTipLiftDeg,
            scaleRowClearanceZ,
          },
          rings: rings.map((r) => ({ row: r.row, col: r.col, color: "#ffffff" })),
          scales: sortedScales.map((s) => ({
            row: s.row,
            col: s.col,
            colorHex: s.color,
            holeX: s.holeX,
            holeY: s.holeY,
            bodyX: s.bodyX,
            bodyY: s.bodyY,
            holeDiameter: s.holeDiameter,
            width: s.width,
            height: s.height,
            shape: s.shape,
            tiltRad: s.tiltRad,
          })),
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
  scaleEnabled,
  scaleBehindRings,
  scaleHoleId,
  scaleWidth,
  scaleHeight,
  scaleShape,
  scaleDrop,
  scaleColor,
  scaleOnEveryCell,
  lockScaleHolesToRingCenters,
  scaleCenterSpacing,
  scaleGridOffsetX,
  scaleGridOffsetY,
  scaleHoleOffsetY,
  scaleWeaveMode,
  scaleAngleIn,
  scaleAngleOut,
  scalePlaneZ,
  scaleTipLiftDeg,
  scaleRowClearanceZ,
  rings,
  sortedScales,
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
    const scaleGroup = new THREE.Group();
    root.add(ringGroup);
    root.add(scaleGroup);
    ringGroupRef.current = ringGroup;
    scaleGroupRef.current = scaleGroup;

    let raf = 0;
    const renderLoop = () => {
      raf = window.requestAnimationFrame(renderLoop);
      renderer.render(scene, camera);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(raf);
      clearGroup(ringGroup);
      clearGroup(scaleGroup);
      renderer.dispose();
      host.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rootGroupRef.current = null;
      ringGroupRef.current = null;
      scaleGroupRef.current = null;
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
    const scaleGroup = scaleGroupRef.current;
    const camera = cameraRef.current;
    if (!ringGroup || !scaleGroup || !camera) return;

    clearGroup(ringGroup);
    clearGroup(scaleGroup);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x353535,
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

// ===== DRAW SCALES (3D, CORRECT) =====
if (scaleEnabled) {
  const maxScaleRow = Math.max(...sortedScales.map(s => s.row));

  sortedScales.forEach((scale, index) => {
    const pivot = makeScalePivot(
      scale,
      scalePlaneZ,
      scaleTipLiftDeg,
      scaleRowClearanceZ,
      maxScaleRow,
    );

    // 👇 CRITICAL FIX: intra-row depth separation
    pivot.position.z += index * 0.01;

    scaleGroup.add(pivot);
  });
}

    const scaleMinX = sortedScales.length
      ? Math.min(...sortedScales.map((s) => s.holeX - s.width * 0.7))
      : Infinity;
    const scaleMaxX = sortedScales.length
      ? Math.max(...sortedScales.map((s) => s.holeX + s.width * 0.7))
      : -Infinity;
    const scaleMinY = sortedScales.length
      ? Math.min(...sortedScales.map((s) => -(s.holeY + 1)))
      : Infinity;
    const scaleMaxY = sortedScales.length
      ? Math.max(...sortedScales.map((s) => -(s.bodyY - s.height) + 2))
      : -Infinity;

    const minX = Math.min(...rings.map((r) => r.x - r.radius), scaleMinX);
    const maxX = Math.max(...rings.map((r) => r.x + r.radius), scaleMaxX);
    const minY = Math.min(...rings.map((r) => -r.y - r.radius), scaleMinY);
    const maxY = Math.max(...rings.map((r) => -r.y + r.radius), scaleMaxY);
    fitCameraToBounds(
      camera,
      maxX - minX,
      maxY - minY,
      new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0),
      cameraZoom,
    );
    resizeScene();
  }, [rings, sortedScales, scaleEnabled, scalePlaneZ, scaleTipLiftDeg, scaleRowClearanceZ, cameraZoom, resizeScene]);

  useEffect(() => {
    const root = rootGroupRef.current;
    if (!root) return;
    root.rotation.x = scaleBehindRings ? -0.08 : -0.22;
  }, [scaleBehindRings]);

  const handleSave = useCallback(() => {
    const entry = {
      id: `${id}_${wire}mm`,
      innerDiameter: ringVars.ID_mm,
      wireDiameter: ringVars.WD_mm,
      centerSpacing,
      angleIn,
      angleOut,
      status,
      aspectRatio: (ringVars.ID_mm / ringVars.WD_mm).toFixed(2),
      savedAt: new Date().toISOString(),
      scaleEnabled,
      scaleBehindRings,
      scaleHoleDiameter: +scaleHoleId.toFixed(4),
      scaleWidth: +scaleWidth.toFixed(3),
      scaleHeight: +scaleHeight.toFixed(3),
      scaleShape,
      scaleDrop: +scaleDrop.toFixed(3),
      scaleColor,
      scaleOnEveryCell,
      lockScaleHolesToRingCenters,
      scaleCenterSpacing: +scaleCenterSpacing.toFixed(3),
      scaleGridOffsetX: +scaleGridOffsetX.toFixed(3),
      scaleGridOffsetY: +scaleGridOffsetY.toFixed(3),
      scaleHoleOffsetY: +scaleHoleOffsetY.toFixed(3),
      scaleWeaveMode,
      scaleAngleIn,
      scaleAngleOut,
      scalePlaneZ: +scalePlaneZ.toFixed(3),
      scaleTipLiftDeg: +scaleTipLiftDeg.toFixed(1),
      scaleRowClearanceZ: +scaleRowClearanceZ.toFixed(3),
    };
    const existing = JSON.parse(localStorage.getItem(TUNER_STORAGE_KEY) || "[]");
    localStorage.setItem(
      TUNER_STORAGE_KEY,
      JSON.stringify([...existing.filter((i: any) => i.id !== entry.id), entry], null, 2),
    );

    // Keep Freeform in sync with the exact saved tuner state, including
    // per-scale geometry like shape and tilt.
    saveFreeformTunerSnapshot();

    alert(`✅ Saved ${entry.id} (${status})`);
  }, [
    id, wire, ringVars, centerSpacing, angleIn, angleOut, status, scaleEnabled,
    scaleBehindRings, scaleHoleId, scaleWidth, scaleHeight, scaleShape, scaleDrop,
    scaleColor, scaleOnEveryCell, lockScaleHolesToRingCenters, scaleCenterSpacing,
    scaleGridOffsetX, scaleGridOffsetY, scaleHoleOffsetY, scaleWeaveMode,
    scaleAngleIn, scaleAngleOut, scalePlaneZ,
    scaleTipLiftDeg, scaleRowClearanceZ,
    saveFreeformTunerSnapshot,
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

      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          background: "rgba(18,24,32,0.94)",
          border: "1px solid #0b1020",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 10,
          padding: "12px",
          zIndex: 10,
          fontSize: 13,
          color: "#e5e7eb",
          backdropFilter: "blur(6px)",
          width: 360,
          maxWidth: "calc(100vw - 28px)",
          maxHeight: "calc(100vh - 28px)",
          overflowY: "auto",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div
            style={{ fontSize: 13 }}
            title={`Ring ID ≈ ${convertToMM(id).toFixed(3)} mm • Scale hole ≈ ${scaleHoleId.toFixed(3)} mm`}
          >
            AR ≈ {arDisplay}
          </div>
          <Link
            to="/_calibration?from=tuner"
            style={{
              background: "#1f2937",
              color: "#a7f3d0",
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #334155",
              textDecoration: "none",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            🎛️ Calibrate
          </Link>
        </div>

        <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(15,23,42,0.8)", border: "1px solid #334155", color: "#94a3b8", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
          RING SETTINGS
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 90, color: "#cbd5e1", fontWeight: 700 }}>Wire</div>
          <select
            value={wire}
            onChange={(e) => setWire(parseFloat(e.target.value))}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}
          >
            {WIRE_OPTIONS.map((v) => (
              <option key={v} value={v}>{v} mm</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 90, color: "#cbd5e1", fontWeight: 700 }}>Ring ID</div>
          <select
            value={id}
            onChange={(e) => {
              const nextId = e.target.value;
              const prevMm = convertToMM(id);
              const nextMm = convertToMM(nextId);
              setId(nextId);
              setScaleHoleId((prev) => (Math.abs(prev - prevMm) < 0.01 ? nextMm : prev));
            }}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}
          >
            {ID_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}"</option>
            ))}
          </select>
        </div>

        {[
          { label: "Center", val: centerSpacing, set: setCenterSpacing, min: 2, max: 25, step: 0.1, unit: "mm" },
          { label: "Ring Angle In", val: angleIn, set: setAngleIn, min: -75, max: 75, step: 1, unit: "°" },
          { label: "Ring Angle Out", val: angleOut, set: setAngleOut, min: -75, max: 75, step: 1, unit: "°" },
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
          <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.35 }}>
            Zooms the entire ring and scale panel together. Mouse wheel over the scene also controls this.
          </div>
        </div>

        <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(15,23,42,0.8)", border: "1px solid #334155", color: "#94a3b8", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
          SCALE SETTINGS
        </div>

        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ color: "#cbd5e1", fontWeight: 700 }}>Enable scale overlay</span>
          <input type="checkbox" checked={scaleEnabled} onChange={(e) => setScaleEnabled(e.target.checked)} />
        </label>

        <button
          type="button"
          onClick={() => setScaleBehindRings((v) => !v)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #334155", background: scaleBehindRings ? "#1d4ed8" : "#0b1220", color: "#e5e7eb", cursor: "pointer", fontWeight: 700 }}
        >
          {scaleBehindRings ? "🔵 Alignment view" : "🟢 Weave view"}
        </button>

        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ color: "#cbd5e1", fontWeight: 700 }}>Overlay every cell</span>
          <input type="checkbox" checked={scaleOnEveryCell} onChange={(e) => setScaleOnEveryCell(e.target.checked)} />
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 90, color: "#cbd5e1", fontWeight: 700 }}>Weave mode</div>
          <select
            value={scaleWeaveMode}
            onChange={(e) => setScaleWeaveMode(e.target.value as ScaleWeaveMode)}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}
          >
            <option value="interlocked">interlocked</option>
            <option value="independent">independent</option>
          </select>
        </div>

        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ color: "#cbd5e1", fontWeight: 700 }}>Lock hole to ring center</span>
          <input type="checkbox" checked={lockScaleHolesToRingCenters} onChange={(e) => setLockScaleHolesToRingCenters(e.target.checked)} />
        </label>

        <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(30,58,138,0.25)", border: "1px solid #3b82f6", color: "#93c5fd", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
          SCALE TILT ANGLES
        </div>

        {[
          { label: "Scale Angle In", val: scaleAngleIn, set: setScaleAngleIn },
          { label: "Scale Angle Out", val: scaleAngleOut, set: setScaleAngleOut },
        ].map(({ label, val, set }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ color: "#93c5fd", fontWeight: 700 }}>{label}</div>
              <div style={{ color: "#93c5fd", fontWeight: 700 }}>{val.toFixed(0)}°</div>
            </div>
            <input type="range" min="-85" max="85" step="1" value={val} onChange={(e) => set(parseFloat(e.target.value))} style={{ width: "100%" }} />
          </div>
        ))}

        <button
          type="button"
          onClick={() => {
            setScaleAngleIn(angleIn);
            setScaleAngleOut(angleOut);
          }}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#7dd3fc", cursor: "pointer", fontSize: 12 }}
        >
          ↺ Sync scale angles to ring angles ({angleIn}° / {angleOut}°)
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ color: "#cbd5e1", fontWeight: 700 }}>Scale plane Z</div>
            <div style={{ color: "#93c5fd", fontWeight: 700 }}>{scalePlaneZ.toFixed(1)} mm</div>
          </div>
          <input type="range" min="-30" max="30" step="0.1" value={scalePlaneZ} onChange={(e) => setScalePlaneZ(parseFloat(e.target.value))} style={{ width: "100%" }} />
          <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.35 }}>
            True 3D depth in the same scene as the rings. Negative moves the scales behind the ring plane. Positive moves them in front.
          </div>
        </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ color: "#cbd5e1", fontWeight: 700 }}>Scale tip lift</div>
            <div style={{ color: "#93c5fd", fontWeight: 700 }}>{scaleTipLiftDeg.toFixed(0)}°</div>
          </div>
          <input type="range" min="-10" max="70" step="1" value={scaleTipLiftDeg} onChange={(e) => setScaleTipLiftDeg(parseFloat(e.target.value))} style={{ width: "100%" }} />
          <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.35 }}>
            Third angle that pitches the scale about the hole so the lower tip lifts above the rings and neighboring scales instead of cutting through them.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ color: "#cbd5e1", fontWeight: 700 }}>Row clearance Z</div>
            <div style={{ color: "#93c5fd", fontWeight: 700 }}>{scaleRowClearanceZ.toFixed(2)} mm</div>
          </div>
          <input type="range" min="0" max="3" step="0.01" value={scaleRowClearanceZ} onChange={(e) => setScaleRowClearanceZ(parseFloat(e.target.value))} style={{ width: "100%" }} />
          <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.35 }}>
            Adds front-to-back row stacking so upper scales sit slightly in front of lower rows instead of intersecting them.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 90, color: "#cbd5e1", fontWeight: 700 }}>Hole ID</div>
          <input
            type="number"
            min={1}
            max={20}
            step={0.1}
            value={scaleHoleId}
            onChange={(e) => setScaleHoleId(clamp(parseFloat(e.target.value) || 0, 1, 20))}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 90, color: "#cbd5e1", fontWeight: 700 }}>Shape</div>
          <select value={scaleShape} onChange={(e) => setScaleShape(e.target.value as ScaleShape)} style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}>
            {SCALE_SHAPES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 90, color: "#cbd5e1", fontWeight: 700 }}>Color</div>
          <input type="color" value={scaleColor} onChange={(e) => setScaleColor(e.target.value)} style={{ width: 56, height: 34, padding: 0, border: "1px solid #334155", borderRadius: 8, background: "#0b1220" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: lockScaleHolesToRingCenters ? 0.45 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ color: "#cbd5e1", fontWeight: 700 }}>Scale center</div>
            <div style={{ color: "#93c5fd", fontWeight: 700 }}>{scaleCenterSpacing.toFixed(1)} mm</div>
          </div>
          <input type="range" min="2" max="25" step="0.1" value={scaleCenterSpacing} disabled={lockScaleHolesToRingCenters} onChange={(e) => setScaleCenterSpacing(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>

        {(["X", "Y"] as const).map((axis) => (
          <div key={axis} style={{ display: "flex", flexDirection: "column", gap: 6, opacity: lockScaleHolesToRingCenters ? 0.45 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ color: "#cbd5e1", fontWeight: 700 }}>Scale grid {axis}</div>
              <div style={{ color: "#93c5fd", fontWeight: 700 }}>{(axis === "X" ? scaleGridOffsetX : scaleGridOffsetY).toFixed(2)} mm</div>
            </div>
            <input
              type="range"
              min="-30"
              max="30"
              step="0.05"
              value={axis === "X" ? scaleGridOffsetX : scaleGridOffsetY}
              disabled={lockScaleHolesToRingCenters}
              onChange={(e) => axis === "X" ? setScaleGridOffsetX(parseFloat(e.target.value)) : setScaleGridOffsetY(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        ))}

        {[
          { label: "Scale width", val: scaleWidth, set: setScaleWidth, min: 4, max: 30, step: 0.1 },
          { label: "Scale height", val: scaleHeight, set: setScaleHeight, min: 6, max: 45, step: 0.1 },
          { label: "Scale drop", val: scaleDrop, set: setScaleDrop, min: -10, max: 20, step: 0.05 },
          { label: "Hole position", val: scaleHoleOffsetY, set: setScaleHoleOffsetY, min: -12, max: 12, step: 0.05 },
        ].map(({ label, val, set, min, max, step }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ color: "#cbd5e1", fontWeight: 700 }}>{label}</div>
              <div style={{ color: "#93c5fd", fontWeight: 700 }}>{val.toFixed(step < 0.1 ? 2 : 1)} mm</div>
            </div>
            <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(parseFloat(e.target.value))} style={{ width: "100%" }} />
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 90, color: "#cbd5e1", fontWeight: 700 }}>Status</div>
          <select value={status} onChange={(e) => setStatus(e.target.value as "valid" | "no_solution")} style={{ flex: 1, padding: "6px 8px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb", outline: "none" }}>
            <option value="valid">✅ Valid</option>
            <option value="no_solution">❌ No Solution</option>
          </select>
        </div>

        <button onClick={handleSave} style={{ background: "#1e293b", color: "#93c5fd", padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", cursor: "pointer", fontWeight: 800, width: "100%" }}>
          Save
        </button>
      </div>

      <DraggablePill id="tuner-compass" defaultPosition={{ x: 20, y: 20 }}>
        <button
          onClick={() => setShowCompass((v) => !v)}
          style={{ fontSize: 22, width: 40, height: 40, borderRadius: 10, border: "1px solid #111", background: "#1f2937", color: "#d1d5db", cursor: "pointer" }}
        >
          🧭
        </button>
      </DraggablePill>

      {showCompass && <DraggableCompassNav onNavigate={() => setShowCompass(false)} />}
    </div>
  );
}
