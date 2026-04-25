// ======================================================
// src/pages/FreeformChainmail2D.tsx
// ======================================================

import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import SplineSandbox from "../splineSandbox/SplineSandbox";
import RingRenderer from "../components/RingRenderer";
import type { OverlayState } from "../components/ImageOverlayPanel";
import FinalizeAndExportPanel from "../components/FinalizeAndExportPanel";
import ProjectSaveLoadButtons from "../components/ProjectSaveLoadButtons";
import {
  applyCalibrationHex,
  calibrationUpdatedEventName,
} from "../utils/colorCalibration";
import {
  WEAVE_SETTINGS_DEFAULT,
  RingMap,
  PlacedRing,
  resolvePlacement,
} from "../utils/e4in1Placement";

import { DraggablePill, DraggableCompassNav } from "../App";
import type { ExportRing, PaletteAssignment } from "../types/project";
import { IconCircle, IconSquare } from "../components/icons/ToolIcons";
import ShapePanel, { ShapeTool as ShapeToolId } from "../components/ShapePanel";
import { computeShapeCells } from "../utils/shapeFill";
// ⬇️ SAFETY STUB (keeps App.tsx safe if it calls this early; BOM UI removed)
declare global {
  interface Window {
    getBOMRings?: () => any[];
  }
}

// Safe default so App.tsx won't crash if it calls early
if (typeof window !== "undefined" && !window.getBOMRings) {
  window.getBOMRings = () => [];
}

// ======================================================
// SAFETY STUBS (history integration preserved, no-ops here)
// NOTE: exported to avoid TS noUnusedLocals errors and to preserve API surface.
// ======================================================
export const commitRings = () => {};
export const handleUndo = () => {};
export const handleRedo = () => {};
export const lock2dView = () => {};
export const toggleLock = () => {};
export const updateHistory = () => {};
export const applyHistory = () => {};
export const pushHistory = () => {};

// ======================================================
// COLOR PALETTE
// ======================================================
const DEFAULT_PALETTE: string[] = [
  "#000000",
  "#1f2937",
  "#6b7280",
  "#9ca3af",
  "#ffffff",
  "#991b1b",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#2563eb",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f973c5",
  "#7c2d12",
];

// ======================================================
// COLOR PALETTE (user-editable + persisted)
// ======================================================
const COLOR_PALETTE_KEY = "freeform.colorPalette.v1";
const SAVED_COLOR_PALETTES_KEY = "freeform.savedColorPalettes.v1";

type SavedColorPalettes = Record<string, string[]>;

function hex2(n: number) {
  return n.toString(16).padStart(2, "0");
}

// Normalize anything we accept into #rrggbb (RingRenderer/Three-safe)
function normalizeColor6(hex: string): string {
  const p = parseHexColor(hex);
  return p?.rgb ?? "#ffffff"; // always #rrggbb
}

function parseHexColor(hex: string): { rgb: string; alpha255: number } | null {
  const h = hex.trim();
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(h);
  if (m6) return { rgb: `#${m6[1].toLowerCase()}`, alpha255: 255 };
  const m8 = /^#([0-9a-fA-F]{8})$/.exec(h);
  if (m8)
    return {
      rgb: `#${m8[1].slice(0, 6).toLowerCase()}`,
      alpha255: parseInt(m8[1].slice(6, 8), 16),
    };
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(h);
  if (m3) {
    const r = m3[1][0];
    const g = m3[1][1];
    const b = m3[1][2];
    return { rgb: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), alpha255: 255 };
  }
  return null;
}

function safeUUID(): string {
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;

  // RFC4122 v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function toHex8(rgb: string, alpha255: number): string {
  const p = parseHexColor(rgb);
  const base = p?.rgb ?? "#000000";
  const a = Math.max(0, Math.min(255, Math.round(alpha255)));
  return `${base}${hex2(a)}`;
}

function loadColorPalette(): string[] {
  try {
    const raw = localStorage.getItem(COLOR_PALETTE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
  } catch {
    // ignore
  }
  return [...DEFAULT_PALETTE];
}

function saveColorPalette(palette: string[]) {
  try {
    localStorage.setItem(COLOR_PALETTE_KEY, JSON.stringify(palette));
  } catch {
    // ignore
  }
}
type PolyPt = { x: number; y: number };
function pointInPoly(x: number, y: number, poly: PolyPt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function loadSavedColorPalettes(): SavedColorPalettes {
  try {
    const raw = localStorage.getItem(SAVED_COLOR_PALETTES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: SavedColorPalettes = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(v) && v.every((x) => typeof x === "string"))
          out[k] = v as string[];
      }
      return out;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveSavedColorPalettes(palettes: SavedColorPalettes) {
  try {
    localStorage.setItem(SAVED_COLOR_PALETTES_KEY, JSON.stringify(palettes));
  } catch {
    // ignore
  }
}

type PaletteColorPickerState = {
  index: number;
  rgb: string;
  alpha255: number;
};

function LongPressColorSwatch(props: {
  color: string;
  active: boolean;
  onClick: () => void;
  onLongPress: () => void;
}) {
  const { color, active, onClick, onLongPress } = props;
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const clear = () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    longPressedRef.current = false;
    clear();
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onLongPress();
    }, 420);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    const wasLong = longPressedRef.current;
    clear();
    if (!wasLong) onClick();
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    e.stopPropagation();
    clear();
  };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        border: active ? "2px solid #f9fafb" : "1px solid rgba(15,23,42,0.9)",
        background: color,
        cursor: "pointer",
        padding: 0,
      }}
      title={active ? "Active color" : "Click: select • Hold: edit"}
    />
  );
}

function PaletteColorPickerModal(props: {
  state: PaletteColorPickerState;
  onChange: (next: PaletteColorPickerState) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const { state, onChange, onCancel, onApply } = props;
  const hex8 = toHex8(state.rgb, state.alpha255);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
      }}
      onMouseDown={onCancel}
    >
      <div
        style={{
          width: 320,
          borderRadius: 16,
          background: "#0b1220",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 16px 45px rgba(0,0,0,0.6)",
          padding: 14,
          color: "#f8fafc",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
          Choose color
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="color"
              value={state.rgb}
              onChange={(e) => onChange({ ...state, rgb: e.target.value })}
              style={{
                width: 54,
                height: 36,
                border: "none",
                background: "transparent",
              }}
            />
            <div style={{ display: "grid", gap: 4, flex: 1 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Alpha</div>
              <input
                type="range"
                min={0}
                max={255}
                value={state.alpha255}
                onChange={(e) =>
                  onChange({ ...state, alpha255: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <label
            style={{
              display: "grid",
              gap: 6,
              fontSize: 12,
              opacity: 0.9,
            }}
          >
            Hex (#RRGGBBAA)
            <input
              value={hex8}
              onChange={(e) => {
                const p = parseHexColor(e.target.value);
                if (!p) return;
                onChange({ ...state, rgb: p.rgb, alpha255: p.alpha255 });
              }}
              style={{
                padding: 8,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#f8fafc",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "#f8fafc",
                color: "#0b1220",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
// ======================================================
// SELECTION TYPES
// ======================================================
type SelectionMode = "none" | ShapeToolId;

type SelectionDrag = {
  sx0: number;
  sy0: number;
  sx1: number;
  sy1: number;
  lx0: number;
  ly0: number;
  lx1: number;
  ly1: number;
};
// ======================================================
// UI HELPERS
// ======================================================
// ======================================================
// ToolButton (Copy/paste replacement)
// Keeps all existing behavior + makes SVG icons visible
// ======================================================

const ToolButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ active, children, ...rest }) => (
  <button
    {...rest}
    style={{
      width: 48,
      height: 48,
      borderRadius: 14,
      border: "none",
      fontSize: 24,
      cursor: "pointer",
      background: active ? "#2563eb" : "#0f172a",
      color: active ? "#f9fafb" : "#e5e7eb",
      boxShadow: active
        ? "0 10px 25px rgba(37,99,235,0.45)"
        : "0 4px 12px rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // ✅ helps iOS Safari + ensures SVG inherits currentColor cleanly
      lineHeight: 1,
    }}
  >
    {/* ✅ ensures SVG icons have a predictable visible size without changing your callsites */}
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        color: "inherit",
      }}
    >
      {children}
    </span>
  </button>
);

const smallBtn: React.CSSProperties = {
  flex: 1,
  border: "none",
  background: "#111827",
  color: "#fff",
  padding: "6px 8px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
};

const smallBtnBlue: React.CSSProperties = {
  ...smallBtn,
  background: "#2563eb",
};
const SliderRow: React.FC<{
  label: string;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
}> = ({ label, value, setValue, min, max, step, unit }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
      alignItems: "center",
    }}
  >
    <label style={{ fontSize: 12 }}>{label}</label>

    <input
      type="number"
      value={Number(value)}
      step={step}
      min={min}
      max={max}
      onChange={(e) => setValue(Number(e.target.value))}
      style={{
        width: 80,
        padding: "2px 6px",
        borderRadius: 6,
        border: "1px solid rgba(148,163,184,0.4)",
        background: "#020617",
        color: "#e5e7eb",
        textAlign: "right",
      }}
    />

    <div
      style={{
        gridColumn: "1 / span 2",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      {unit && (
        <span
          style={{
            fontSize: 11,
            opacity: 0.8,
            width: 40,
            textAlign: "right",
          }}
        >
          {value.toFixed(1)} {unit}
        </span>
      )}
    </div>
  </div>
);

// ======================================================
// ICONS (Selection tools) — MUST NOT BE INSIDE HOOKS
// ======================================================
const SquareIcon = ({ active }: { active?: boolean }) => (
  <div
    style={{
      width: 18,
      height: 18,
      borderRadius: 4,
      background: active ? "#2563eb" : "transparent",
      border: `2px solid ${active ? "#f9fafb" : "#94a3b8"}`,
      boxSizing: "border-box",
    }}
  />
);
const CircleIcon = ({ active }: { active?: boolean }) => (
  <div
    style={{
      width: 18,
      height: 18,
      borderRadius: "50%",
      background: active ? "#2563eb" : "transparent",
      border: `2px solid ${active ? "#f9fafb" : "#94a3b8"}`,
      boxSizing: "border-box",
    }}
  />
);

// ======================================================
// RING SET (matches Tuner JSON)
// ======================================================
interface RingSet {
  id: string;
  innerDiameter: number;
  wireDiameter: number;
  centerSpacing: number;
  angleIn?: number;
  angleOut?: number;
  savedAt?: string;
  status?: string;
  aspectRatio?: string;
}

// ======================================================
// localStorage
// ======================================================
const TUNER_LS_KEY = "chainmailMatrix";
const AUTO_FOLLOW_KEY = "freeformAutoFollowTuner";
const ACTIVE_SET_KEY = "freeformActiveRingSetId";
const FREEFORM_TUNER_SNAPSHOT_KEY = "freeform.tunerSnapshot.v1";
const DEG = Math.PI / 180;

type ScaleShape = "teardrop" | "leaf" | "round" | "kite";
type ScaleWeaveMode = "independent" | "interlocked";

type FreeformScaleSettings = {
  enabled: boolean;
  behindRings: boolean;
  holeIdMm: number;
  widthMm: number;
  heightMm: number;
  shape: ScaleShape;
  dropMm: number;
  colorHex: string;
  onEveryCell: boolean;
  lockScaleHolesToRingCenters: boolean;
  centerSpacingMm: number;
  gridOffsetXmm: number;
  gridOffsetYmm: number;
  holeOffsetYMm: number;
  weaveMode: ScaleWeaveMode;
  angleInDeg: number;
  angleOutDeg: number;
  scalePlaneZ: number;
  scaleTipLiftDeg: number;
  scaleRowClearanceZ: number;
};

type TunerSnapshotScale = {
  key?: string;
  row: number;
  col: number;
  holeX?: number;
  holeY?: number;
  bodyX?: number;
  bodyY?: number;
  holeDiameter?: number;
  width?: number;
  height?: number;
  colorHex?: string;
  shape?: ScaleShape;
  tiltRad?: number;
  dropMm?: number;
  holeOffsetYMm?: number;
};

type TunerSnapshot = {
  scaleSettings?: Partial<FreeformScaleSettings> & Record<string, any>;
  scales?: TunerSnapshotScale[];
  [k: string]: any;
};

type ExportScale = {
  key: string;
  row: number;
  col: number;
  x_mm: number;
  y_mm: number;
  bodyX_mm: number;
  bodyY_mm: number;
  colorHex: string;
  holeIdMm: number;
  widthMm: number;
  heightMm: number;
  shape: ScaleShape;
  dropMm: number;
  holeOffsetYMm: number;
  tiltRad: number;
  planeZMm: number;
  tipLiftDeg: number;
  rowClearanceZMm: number;
};

function normalizeFreeformScaleSettings(src: Record<string, any>): FreeformScaleSettings {
  const next: FreeformScaleSettings = {
    enabled: true,
    behindRings: false,
    holeIdMm: 9.1,
    widthMm: 19,
    heightMm: 22.3,
    shape: "teardrop",
    dropMm: -0.7,
    colorHex: "#4dd0e1",
    onEveryCell: true,
    lockScaleHolesToRingCenters: true,
    centerSpacingMm: 7,
    gridOffsetXmm: 0,
    gridOffsetYmm: 0,
    holeOffsetYMm: 0,
    weaveMode: "interlocked",
    angleInDeg: 25,
    angleOutDeg: -25,
    scalePlaneZ: 10,
    scaleTipLiftDeg: 18,
    scaleRowClearanceZ: 0.22,
  };

  if (!src || typeof src !== "object") return next;
  if (typeof src.scaleEnabled === "boolean") next.enabled = src.scaleEnabled;
  if (typeof src.enabled === "boolean") next.enabled = src.enabled;
  if (typeof src.scaleBehindRings === "boolean") next.behindRings = src.scaleBehindRings;
  if (typeof src.behindRings === "boolean") next.behindRings = src.behindRings;
  if (typeof src.scaleHoleDiameter === "number") next.holeIdMm = src.scaleHoleDiameter;
  if (typeof src.holeIdMm === "number") next.holeIdMm = src.holeIdMm;
  if (typeof src.scaleWidth === "number") next.widthMm = src.scaleWidth;
  if (typeof src.widthMm === "number") next.widthMm = src.widthMm;
  if (typeof src.scaleHeight === "number") next.heightMm = src.scaleHeight;
  if (typeof src.heightMm === "number") next.heightMm = src.heightMm;
  if (typeof src.scaleShape === "string") next.shape = src.scaleShape as ScaleShape;
  if (typeof src.shape === "string") next.shape = src.shape as ScaleShape;
  if (typeof src.scaleDrop === "number") next.dropMm = src.scaleDrop;
  if (typeof src.dropMm === "number") next.dropMm = src.dropMm;
  if (typeof src.scaleColor === "string") next.colorHex = src.scaleColor;
  if (typeof src.colorHex === "string") next.colorHex = src.colorHex;
  if (typeof src.scaleOnEveryCell === "boolean") next.onEveryCell = src.scaleOnEveryCell;
  if (typeof src.onEveryCell === "boolean") next.onEveryCell = src.onEveryCell;
  if (typeof src.lockScaleHolesToRingCenters === "boolean") next.lockScaleHolesToRingCenters = src.lockScaleHolesToRingCenters;
  if (typeof src.scaleCenterSpacing === "number") next.centerSpacingMm = src.scaleCenterSpacing;
  if (typeof src.centerSpacingMm === "number") next.centerSpacingMm = src.centerSpacingMm;
  if (typeof src.scaleGridOffsetX === "number") next.gridOffsetXmm = src.scaleGridOffsetX;
  if (typeof src.gridOffsetXmm === "number") next.gridOffsetXmm = src.gridOffsetXmm;
  if (typeof src.scaleGridOffsetY === "number") next.gridOffsetYmm = src.scaleGridOffsetY;
  if (typeof src.gridOffsetYmm === "number") next.gridOffsetYmm = src.gridOffsetYmm;
  if (typeof src.scaleHoleOffsetY === "number") next.holeOffsetYMm = src.scaleHoleOffsetY;
  if (typeof src.holeOffsetYMm === "number") next.holeOffsetYMm = src.holeOffsetYMm;
  if (src.scaleWeaveMode === "independent" || src.scaleWeaveMode === "interlocked") next.weaveMode = src.scaleWeaveMode;
  if (src.weaveMode === "independent" || src.weaveMode === "interlocked") next.weaveMode = src.weaveMode;
  if (typeof src.scaleAngleIn === "number") next.angleInDeg = src.scaleAngleIn;
  if (typeof src.angleInDeg === "number") next.angleInDeg = src.angleInDeg;
  if (typeof src.scaleAngleOut === "number") next.angleOutDeg = src.scaleAngleOut;
  if (typeof src.angleOutDeg === "number") next.angleOutDeg = src.angleOutDeg;
  if (typeof src.scalePlaneZ === "number") next.scalePlaneZ = src.scalePlaneZ;
  if (typeof src.scaleTipLiftDeg === "number") {
    next.scaleTipLiftDeg = src.scaleTipLiftDeg;
  }
  if (typeof src.scaleRowClearanceZ === "number") next.scaleRowClearanceZ = src.scaleRowClearanceZ;
  return next;
}

function loadFreeformTunerSnapshot(): TunerSnapshot | null {
  try {
    const raw = localStorage.getItem(FREEFORM_TUNER_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as TunerSnapshot) : null;
  } catch {
    return null;
  }
}


// ======================================================
// Dimension
// ======================================================
export type ShapeTool = "circle" | "square";
export type ShapeDrag = {
  tool: ShapeTool;
  start: { x: number; y: number };
  current: { x: number; y: number };
  active: boolean;
};

export type ShapeDims =
  | { tool: "circle"; radius: number; diameter: number }
  | { tool: "square"; width: number; height: number };

export function getRingHex(r: any): string {
  return r?.colorHex ?? r?.color ?? r?.hex ?? r?.fill ?? r?.stroke ?? "#000000";
}

// ======================================================
// CAMERA CONSTANTS (match RingRenderer projection)
// ======================================================
const FALLBACK_CAMERA_Z = 52;
const FOV = 45;
const MIN_ZOOM = 0.02; // allow wider zoom-out than before
const MAX_ZOOM = 6.0; // allow wider zoom-in than before

type FreeformDims =
  | {
      kind: "circle";
      radiusMm: number;
      diameterMm: number;
      radiusRings: number;
      diameterRings: number;
    }
  | {
      kind: "square";
      widthMm: number;
      heightMm: number;
      widthRings: number;
      heightRings: number;
    };

function formatNum(n: number, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

// ======================================================
// MAIN COMPONENT
// ======================================================
const FreeformChainmail2D: React.FC = () => {
  const navigate = useNavigate();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null); // interaction + selection overlay
  const hitCanvasRef = useRef<HTMLCanvasElement | null>(null); // overlay circles
  const ringRendererRef = useRef<any>(null);

  // Finalize & Export (must be inside the component)
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const [assignment, setAssignment] = useState<PaletteAssignment | null>(() => {
    try {
      const raw = localStorage.getItem("freeform.paletteAssignment");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // ✅ React re-render trigger when calibration is saved/applied elsewhere
  const [calibrationVersion, setCalibrationVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setCalibrationVersion((v) => v + 1);
    window.addEventListener(calibrationUpdatedEventName(), onUpdate);
    return () =>
      window.removeEventListener(calibrationUpdatedEventName(), onUpdate);
  }, []);

  // ====================================================
  // PLACED RINGS
  // ====================================================
  const [rings, setRings] = useState<RingMap>(() => new Map());
  const [nextClusterId, setnextClusterId] = useState(1);

  // ✅ DEFAULT COLOR OF RINGS SHOULD BE WHITE
  const [activeColor, setActiveColor] = useState("#ffffff");
  const activeColorRef = useRef(activeColor);

  type ActiveLayer = "rings" | "scales";
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("rings");
  const activeLayerRef = useRef<ActiveLayer>("rings");
  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

  const [scaleColors, setScaleColors] = useState<Map<string, string>>(
    () => new Map(),
  );
  const scaleColorsRef = useRef(scaleColors);
  useEffect(() => {
    scaleColorsRef.current = scaleColors;
  }, [scaleColors]);

  // ====================================================
  // COLOR PALETTE (editable + persisted)
  // ====================================================
  const [colorPalette, setColorPalette] = useState<string[]>(() =>
    loadColorPalette(),
  );
  const [savedColorPalettes, setSavedColorPalettes] =
    useState<SavedColorPalettes>(() => loadSavedColorPalettes());
  const [paletteManagerOpen, setPaletteManagerOpen] = useState(false);
  const [paletteName, setPaletteName] = useState<string>("");
  const [selectedSavedPalette, setSelectedSavedPalette] = useState<string>("");
  const [pickerState, setPickerState] =
    useState<PaletteColorPickerState | null>(null);

  useEffect(() => {
    saveColorPalette(colorPalette);
  }, [colorPalette]);

  useEffect(() => {
    saveSavedColorPalettes(savedColorPalettes);
  }, [savedColorPalettes]);

  const openPickerForIndex = useCallback(
    (index: number) => {
      const current = colorPalette[index] ?? "#ffffffff";
      const parsed = parseHexColor(current) ?? {
        rgb: "#ffffff",
        alpha255: 255,
      };
      setPickerState({ index, rgb: parsed.rgb, alpha255: parsed.alpha255 });
    },
    [colorPalette],
  );

  const applyPicker = useCallback(() => {
    if (!pickerState) return;

    const next = [...colorPalette];

    // ✅ store as #RRGGBB so RingRenderer/Three always understands it
    const normalized = normalizeColor6(
      toHex8(pickerState.rgb, pickerState.alpha255),
    );
    next[pickerState.index] = normalized;

    setColorPalette(next);
    setActiveColor(normalized);
    setPickerState(null);
  }, [pickerState, colorPalette]);

  useEffect(() => {
    activeColorRef.current = normalizeColor6(activeColor);
  }, [activeColor]);

  const [eraseMode, setEraseMode] = useState(false);
  const eraseModeRef = useRef(false);
  useEffect(() => {
    eraseModeRef.current = eraseMode;
  }, [eraseMode]);
  const [showControls, setShowControls] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);

  // ✅ Floating submenu (Designer pattern) — show/hide compass nav
  const [showCompass, setShowCompass] = useState(false);

  // ✅ Secondary utility panel (toolbox/save-load/reset)
  const [showUtilityPanel, setShowUtilityPanel] = useState(false);
  const [showSplineTool, setShowSplineTool] = useState(false);
  const [splineResetKey, setSplineResetKey] = useState(0);
  // ==============================
  // 📏 Freeform Stats (dims + counts)
  // ==============================
  const [showFreeformStats, setShowFreeformStats] = useState(true);
  const [cursorPx, setCursorPx] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [liveDims, setLiveDims] = useState<FreeformDims | null>(null);
  const [lastDims, setLastDims] = useState<FreeformDims | null>(null);

  // Prefer live drag dims; otherwise show the last committed dims
  const dimsNow = liveDims ?? lastDims;

  // ====================================================
  // DIAGNOSTICS
  // ====================================================
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagLog, setDiagLog] = useState<string>("");

  // ====================================================
  // SELECTION TOOL (rect + circle)
  // ====================================================
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("none");
  const [shapePanelOpen, setShapePanelOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionRef = useRef<SelectionDrag | null>(null);

  // authoritative selected ring keys: `${row}-${col}`
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );

  // Optional: show a lightweight selection stats line (kept inside diag log)
  const [lastSelectionCount, setLastSelectionCount] = useState<number>(0);

  // ====================================================
  // IMAGE OVERLAY (missing state that caused "overlay is not defined")
  // ====================================================
  const overlayImgRef = useRef<HTMLImageElement | null>(null);
  const [showImageOverlay, setShowImageOverlay] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  type OverlayScope = "all" | "selection";
  const [overlayScope, setOverlayScope] = useState<OverlayScope>("all");

  // Keys used when user chooses "selection" scope for overlay transfer
  const [overlayMaskKeys, setOverlayMaskKeys] = useState<Set<string>>(
    () => new Set(),
  );

  // When true: next selection drag defines overlayMaskKeys instead of painting/erasing
  const overlayPickingRef = useRef(false);

  // ====================================================
  // GEOMETRY (synced with Tuner)
  // ====================================================
  const [innerIDmm, setInnerIDmm] = useState(7.94);
  const [wireMm, setWireMm] = useState(1.2);
  const [centerSpacing, setCenterSpacing] = useState(7.0);
  const [angleIn, setAngleIn] = useState(25);
  const [angleOut, setAngleOut] = useState(-25);

  const aspectRatio = useMemo(
    () => (wireMm > 0 ? innerIDmm / wireMm : 0),
    [innerIDmm, wireMm],
  );

  // ====================================================
  // RING SETS (from Tuner JSON)
  // ====================================================
  const [ringSets, setRingSets] = useState<RingSet[]>([]);
  const [activeRingSetId, setActiveRingSetId] = useState<string | null>(null);
  const [autoFollowTuner, setAutoFollowTuner] = useState<boolean>(true);
  const [tunerSnapshot, setTunerSnapshot] = useState<TunerSnapshot | null>(() =>
    loadFreeformTunerSnapshot(),
  );

  const baseScaleSettings = useMemo(() => {
    if (tunerSnapshot?.scaleSettings) {
      return normalizeFreeformScaleSettings(tunerSnapshot.scaleSettings);
    }
    const activeSet = ringSets.find((r) => r.id === activeRingSetId);
    return normalizeFreeformScaleSettings(activeSet ?? {});
  }, [tunerSnapshot, ringSets, activeRingSetId]);

  const [scaleSettingsOverride, setScaleSettingsOverride] =
    useState<Partial<FreeformScaleSettings>>({});

  // (axis selectors removed — Z rotation and depth handled in RingRenderer directly)

  // Only clear overrides when Tuner snapshot content actually changes —
  // not just the object reference. loadFreeformTunerSnapshot() always
  // JSON.parses a new object, so comparing stringified content stops
  // slider values from being wiped on every focus or unrelated state update.
  const lastSnapshotKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = tunerSnapshot
      ? JSON.stringify(tunerSnapshot.scaleSettings ?? null)
      : null;
    if (key !== lastSnapshotKeyRef.current) {
      lastSnapshotKeyRef.current = key;
      setScaleSettingsOverride({});
    }
  }, [tunerSnapshot]);

  const activeScaleSettings = useMemo(
    () => ({ ...baseScaleSettings, ...scaleSettingsOverride }),
    [baseScaleSettings, scaleSettingsOverride],
  );

  useEffect(() => {
    const refreshTunerSnapshot = () => setTunerSnapshot(loadFreeformTunerSnapshot());
    refreshTunerSnapshot();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === FREEFORM_TUNER_SNAPSHOT_KEY) refreshTunerSnapshot();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("freeform:tunerSnapshotSaved", refreshTunerSnapshot as EventListener);
    // NOTE: "focus" listener intentionally removed — it fired on every window
    // focus and wiped all slider overrides by creating a new snapshot object.
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("freeform:tunerSnapshotSaved", refreshTunerSnapshot as EventListener);
    };
  }, []);

  // ====================================================
  // WEAVE GRID SETTINGS (for resolvePlacement)
  // ====================================================
  const settings = useMemo(
    () => ({
      ...WEAVE_SETTINGS_DEFAULT,
      spacingX: centerSpacing,
      spacingY: centerSpacing * 0.866,
      wireD: wireMm,
    }),
    [centerSpacing, wireMm],
  );

  // ====================================================
  // PAN / ZOOM (virtual camera → applied to both rings & circles)
  // ====================================================
  const [zoom, setZoom] = useState(1.0);
  const [panWorldX, setPanWorldX] = useState(0);
  const [panWorldY, setPanWorldY] = useState(0);

  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const panStart = useRef<{
    screenX: number;
    screenY: number;
    panX: number;
    panY: number;
    lx: number;
    ly: number;
  } | null>(null);

  const pinchStateRef = useRef<{
    active: boolean;
    lastDist: number;
    lx?: number;
    ly?: number;
  }>({
    active: false,
    lastDist: 0,
  });

  // ====================================================
  // CIRCLE OFFSETS / SCALE (hit circles only)
  // ====================================================
  const [circleOffsetX, setCircleOffsetX] = useState(0); // mm
  const [circleOffsetY, setCircleOffsetY] = useState(0); // mm
  const [circleScale, setCircleScale] = useState(1.0);
  const [hideCircles, setHideCircles] = useState(true); // ✅ default OFF

  // ====================================================
  // HEX GRID HELPERS (row/col ↔ logical mm)
  // ====================================================
  const spacingY = useMemo(() => centerSpacing * 0.866, [centerSpacing]);

  const rcToLogical = useCallback(
    (row: number, col: number) => {
      const rowOffset = row & 1 ? centerSpacing / 2 : 0;
      const x = col * centerSpacing + rowOffset;
      const y = row * spacingY;
      return { x, y };
    },
    [centerSpacing, spacingY],
  );

  // ✅ Debug markers stored in LOGICAL coords
  const [debugClicks, setDebugClicks] = useState<
    { id: number; lx: number; ly: number }[]
  >([]);

  const addDebugMarker = useCallback((lx: number, ly: number) => {
    setDebugClicks((prev) => [...prev, { id: prev.length + 1, lx, ly }]);
  }, []);

  // ====================================================
  // DYNAMIC GRID EXTENTS (unbounded freeform)
  // IMPORTANT: must be INSIDE component (needs rings)
  // ====================================================
  const { maxRowSpan, maxColSpan, minRow, minCol, maxRow, maxCol } =
    useMemo(() => {
      if (!rings.size) {
        return {
          maxRowSpan: 128,
          maxColSpan: 128,
          minRow: 0,
          minCol: 0,
          maxRow: 0,
          maxCol: 0,
        };
      }

      let _minRow = Infinity;
      let _maxRow = -Infinity;
      let _minCol = Infinity;
      let _maxCol = -Infinity;

      rings.forEach((r) => {
        _minRow = Math.min(_minRow, r.row);
        _maxRow = Math.max(_maxRow, r.row);
        _minCol = Math.min(_minCol, r.col);
        _maxCol = Math.max(_maxCol, r.col);
      });

      // Larger padding so camera never clips edge rings
      const PAD = 24;

      return {
        maxRowSpan: Math.max(128, _maxRow - _minRow + 1 + PAD),
        maxColSpan: Math.max(128, _maxCol - _minCol + 1 + PAD),
        minRow: _minRow,
        minCol: _minCol,
        maxRow: _maxRow,
        maxCol: _maxCol,
      };
    }, [rings]);

  // ====================================================
  // FLOATING ORIGIN (prevents huge world coords => seam/clipping/precision loss)
  // We compute a logical center from ring bounds and render relative to it.
  // ====================================================
  const logicalOrigin = useMemo(() => {
    if (!rings.size) return { ox: 0, oy: 0 };

    // Use bounds center in logical space
    const { x: minX, y: minY } = rcToLogical(minRow, minCol);
    const { x: maxX, y: maxY } = rcToLogical(maxRow, maxCol);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    return { ox: cx, oy: cy };
  }, [rings.size, minRow, minCol, maxRow, maxCol, rcToLogical]);

  // ====================================================
  // 🖼️ APPLY IMAGE OVERLAY → Freeform rings (ALL or SELECTION)
  // ✅ Renamed to avoid: "Identifier 'applyOverlayToFreeform' has already been declared"
  // ====================================================

  // ====================================================
  // 🖼️ Image transfer (Rings + Scales)
  //
  // Transfers the currently loaded overlay image onto:
  // - Rings (when activeLayer === "rings")
  // - Scales (when activeLayer === "scales")
  //
  // Current behavior preserved:
  // - Only recolors existing rings/scales (does not create new cells)
  // - Respects overlayScope:
  //    - "all": recolor all existing cells
  //    - "selection": recolor only overlayMaskKeys (keys are "row-col")
  // - Respects overlay transform (offset / scale / opacity / crop / tiling)
  // - Sampling is performed in WORLD space using logicalToWorld(), so it stays
  //   aligned under floating-origin recentering.
  // ====================================================
  const transferOverlayToRings = useCallback(async () => {
    if (!overlay) return;

    const targetKeys = overlayScope === "selection" ? overlayMaskKeys : null;
    if (targetKeys && targetKeys.size === 0) return;

    const src =
      (overlay as any)?.dataUrl ||
      (overlay as any)?.src ||
      (overlay as any)?.url ||
      (overlay as any)?.imageUrl ||
      null;

    if (!src) return;

    // Inline renderer world transform (floating origin + Y flip).
    // We avoid referencing logicalToWorld here because it may be declared later in this file.
    const logicalToWorldLocal = (lx: number, ly: number) => {
      const ox = logicalOrigin.ox;
      const oy = logicalOrigin.oy;
      return { wx: lx - ox, wy: -(ly - oy) };
    };

    const isScales = activeLayer === "scales";

    // Current behavior: recolor only existing cells.
    if (!isScales && rings.size === 0) return;
    if (isScales && scaleColorsRef.current.size === 0) return;

    const offsetX = Number((overlay as any)?.offsetX ?? 0);
    const offsetY = Number((overlay as any)?.offsetY ?? 0);
    const scale = Math.max(1e-6, Number((overlay as any)?.scale ?? 1));
    const opacity = Math.max(
      0,
      Math.min(1, Number((overlay as any)?.opacity ?? 1)),
    );

    const tileAny =
      !!(overlay as any)?.tile ||
      !!(overlay as any)?.tiled ||
      !!(overlay as any)?.repeat ||
      !!(overlay as any)?.tilingEnabled ||
      String((overlay as any)?.tileMode ?? (overlay as any)?.tiling ?? "")
        .toLowerCase()
        .includes("repeat");

    const tileX = Boolean(
      (overlay as any)?.tileX ?? (overlay as any)?.repeatX ?? tileAny,
    );
    const tileY = Boolean(
      (overlay as any)?.tileY ?? (overlay as any)?.repeatY ?? tileAny,
    );

    // Crop support (u/v are normalized [0..1])
    const u0 = Number.isFinite((overlay as any)?.cropU0)
      ? (overlay as any).cropU0
      : (overlay as any)?.crop?.u0;
    const v0 = Number.isFinite((overlay as any)?.cropV0)
      ? (overlay as any).cropV0
      : (overlay as any)?.crop?.v0;
    const u1 = Number.isFinite((overlay as any)?.cropU1)
      ? (overlay as any).cropU1
      : (overlay as any)?.crop?.u1;
    const v1 = Number.isFinite((overlay as any)?.cropV1)
      ? (overlay as any).cropV1
      : (overlay as any)?.crop?.v1;

    const U0 = Number.isFinite(u0) ? Math.max(0, Math.min(1, u0)) : 0;
    const V0 = Number.isFinite(v0) ? Math.max(0, Math.min(1, v0)) : 0;
    const U1 = Number.isFinite(u1) ? Math.max(0, Math.min(1, u1)) : 1;
    const V1 = Number.isFinite(v1) ? Math.max(0, Math.min(1, v1)) : 1;

    const cu0 = Math.min(U0, U1);
    const cu1 = Math.max(U0, U1);
    const cv0 = Math.min(V0, V1);
    const cv1 = Math.max(V0, V1);
    const cropW = Math.max(1e-6, cu1 - cu0);
    const cropH = Math.max(1e-6, cv1 - cv0);

    const wrap01 = (t: number) => ((t % 1) + 1) % 1;

    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });

    const cvs = document.createElement("canvas");
    cvs.width = img.naturalWidth || img.width;
    cvs.height = img.naturalHeight || img.height;

    const ictx = cvs.getContext("2d", {
      willReadFrequently: true,
    } as CanvasRenderingContext2DSettings);
    if (!ictx) return;

    ictx.clearRect(0, 0, cvs.width, cvs.height);
    ictx.drawImage(img, 0, 0);

    const imgData = ictx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imgData.data;

    const W = cvs.width;
    const H = cvs.height;

    // ---------------------------
    // Compute WORLD bounds of the target cells (rings or scales)
    // ---------------------------
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    if (!isScales) {
      rings.forEach((r, key) => {
        if (targetKeys && !targetKeys.has(key)) return;

        const { x: lx, y: ly } = rcToLogical(r.row, r.col);
        const { wx, wy } = logicalToWorldLocal(lx, ly);

        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minY = Math.min(minY, wy);
        maxY = Math.max(maxY, wy);
      });
    } else {
      for (const [k] of scaleColorsRef.current.entries()) {
        const [rowStr, colStr] = k.split(",");
        const row = Number(rowStr);
        const col = Number(colStr);
        if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

        const dashKey = `${row}-${col}`; // selection masking keys are dash-form
        if (targetKeys && !targetKeys.has(dashKey)) continue;

        const { x: lx, y: ly } = rcToLogical(row, col);
        const { wx, wy } = logicalToWorldLocal(lx, ly);

        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minY = Math.min(minY, wy);
        maxY = Math.max(maxY, wy);
      }
    }

    if (!Number.isFinite(minX)) return;

    const worldW = Math.max(1e-6, maxX - minX);
    const worldH = Math.max(1e-6, maxY - minY);

    // Center of bounds, then apply overlay offset
    const cx = (minX + maxX) * 0.5 + offsetX;
    const cy = (minY + maxY) * 0.5 + offsetY;

    const invScale = 1 / scale;

    // Base blend against white (matches previous behavior)
    const baseHex = "#ffffff";
    const baseR = parseInt(baseHex.slice(1, 3), 16);
    const baseG = parseInt(baseHex.slice(3, 5), 16);
    const baseB = parseInt(baseHex.slice(5, 7), 16);

    const sampleAtWorld = (wx: number, wy: number): string | null => {
      // Map world point into normalized [0..1] in overlay frame
      let nx = ((wx - cx) / worldW) * invScale + 0.5;
      let ny = ((wy - cy) / worldH) * invScale + 0.5;

      if (tileX) nx = wrap01(nx);
      if (tileY) ny = wrap01(ny);

      if (!tileX && (nx < 0 || nx > 1)) return null;
      if (!tileY && (ny < 0 || ny > 1)) return null;

      // Apply crop window
      let u = cu0 + nx * cropW;
      let v = cv0 + ny * cropH;

      if (tileX) u = cu0 + wrap01((u - cu0) / cropW) * cropW;
      if (tileY) v = cv0 + wrap01((v - cv0) / cropH) * cropH;

      let px = Math.floor(u * W);
      let py = Math.floor((1 - v) * H);

      if (px === W) px = W - 1;
      if (py === H) py = H - 1;
      if (px < 0 || px >= W || py < 0 || py >= H) return null;

      const idx = (py * W + px) * 4;
      const r = data[idx + 0];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a255 = data[idx + 3];

      if (a255 <= 2) return null;

      const t = Math.max(0, Math.min(1, (a255 / 255) * opacity));
      const outR = Math.round(baseR * (1 - t) + r * t);
      const outG = Math.round(baseG * (1 - t) + g * t);
      const outB = Math.round(baseB * (1 - t) + b * t);

      return `#${hex2(outR)}${hex2(outG)}${hex2(outB)}`;
    };

    if (!isScales) {
      // ---------------------------
      // Apply to rings
      // ---------------------------
      const next: RingMap = new Map(rings);

      next.forEach((r, key) => {
        if (targetKeys && !targetKeys.has(key)) return;

        const { x: lx, y: ly } = rcToLogical(r.row, r.col);
        const { wx, wy } = logicalToWorldLocal(lx, ly);

        const sampled = sampleAtWorld(wx, wy);
        if (!sampled) return;

        next.set(key, {
          ...(r as any),
          color: normalizeColor6(sampled),
        } as PlacedRing);
      });

      setRings(next);
      return;
    }

    // ---------------------------
    // Apply to scales (recolor existing only)
    // ---------------------------
    setScaleColors((prev) => {
      const next = new Map(prev);

      for (const [k] of prev.entries()) {
        const [rowStr, colStr] = k.split(",");
        const row = Number(rowStr);
        const col = Number(colStr);
        if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

        const dashKey = `${row}-${col}`;
        if (targetKeys && !targetKeys.has(dashKey)) continue;

        const { x: lx, y: ly } = rcToLogical(row, col);
        const { wx, wy } = logicalToWorldLocal(lx, ly);

        const sampled = sampleAtWorld(wx, wy);
        if (!sampled) continue;

        next.set(k, normalizeColor6(sampled));
      }

      return next;
    });
  }, [
    overlay,
    overlayScope,
    overlayMaskKeys,
    activeLayer,
    rings,
    rcToLogical,
    logicalOrigin,
  ]);

  useEffect(() => {
    overlayImgRef.current = null;

    const src =
      (overlay as any)?.dataUrl ??
      (overlay as any)?.src ??
      (overlay as any)?.url ??
      (overlay as any)?.imageUrl ??
      null;

    if (!src) return;

    let cancelled = false;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) overlayImgRef.current = img;
    };
    img.onerror = () => {
      if (!cancelled) overlayImgRef.current = null;
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [
    (overlay as any)?.dataUrl,
    (overlay as any)?.src,
    (overlay as any)?.url,
    (overlay as any)?.imageUrl,
  ]);

  // ====================================================
  // TRUE HEX-GRID SNAP (point → row/col)
  // Inverse of rcToLogical() — ODD-ROW OFFSET GRID
  // ====================================================
  const logicalToRowColApprox = useCallback(
    (lx: number, ly: number) => {
      // Row comes directly from Y
      const row = Math.round(ly / spacingY);

      // Undo odd-row horizontal offset
      const rowOffset = row & 1 ? centerSpacing / 2 : 0;

      // Column from X
      const col = Math.round((lx - rowOffset) / centerSpacing);

      return { row, col };
    },
    [centerSpacing, spacingY],
  );

  const computeDimsFromSelection = useCallback(
    (sel: SelectionDrag, mode: SelectionMode): FreeformDims | null => {
      if (mode === "none") return null;

      if (mode === "circle") {
        const dx = sel.lx1 - sel.lx0;
        const dy = sel.ly1 - sel.ly0;
        const rMm = Math.sqrt(dx * dx + dy * dy);
        const dMm = rMm * 2;

        // approximate “rings” using center spacing
        const rRings = centerSpacing > 0 ? rMm / centerSpacing : 0;
        const dRings = rRings * 2;

        return {
          kind: "circle",
          radiusMm: rMm,
          diameterMm: dMm,
          radiusRings: rRings,
          diameterRings: dRings,
        };
      }

      // rect -> label as Square (as requested)
      const minLX = Math.min(sel.lx0, sel.lx1);
      const maxLX = Math.max(sel.lx0, sel.lx1);
      const minLY = Math.min(sel.ly0, sel.ly1);
      const maxLY = Math.max(sel.ly0, sel.ly1);

      const a = logicalToRowColApprox(minLX, minLY);
      const b = logicalToRowColApprox(maxLX, maxLY);

      const wRings = Math.abs(b.col - a.col) + 1;
      const hRings = Math.abs(b.row - a.row) + 1;

      return {
        kind: "square",
        widthMm: maxLX - minLX,
        heightMm: maxLY - minLY,
        widthRings: wRings,
        heightRings: hRings,
      };
    },
    [centerSpacing, logicalToRowColApprox],
  );

  const computeSelectionKeys = useCallback(
    (sel: SelectionDrag, mode: SelectionMode) => {
      const next = new Set<string>();
      if (mode === "none") return next;

      const cells = computeShapeCells({
        tool: mode,
        sel,
        logicalToRowColApprox,
        rcToLogical,
      });

      for (const cell of cells) next.add(`${cell.row}-${cell.col}`);
      return next;
    },
    [logicalToRowColApprox, rcToLogical],
  );

  // ====================================================
  // FINALIZE SELECTION → compute selected ring keys
  // ====================================================
  const finalizeSelection = useCallback(() => {
    const sel = selectionRef.current;
    if (!sel) return;
    setSelectedKeys(computeSelectionKeys(sel, selectionMode));
  }, [selectionMode, computeSelectionKeys]);

  // ====================================================
  // ✅ Viewport rect
  // IMPORTANT: use the WRAP rect as authority to avoid half-width/seam issues
  // when RingRenderer internally changes its canvas/scissor.
  // ====================================================
  const getViewRect = useCallback(() => {
    const wrap = wrapRef.current;
    if (wrap) return wrap.getBoundingClientRect();

    const canvas = canvasRef.current;
    if (canvas) return canvas.getBoundingClientRect();

    return new DOMRect(0, 0, 1, 1);
  }, []);

  const getCameraZ = useCallback(() => {
    const z = ringRendererRef.current?.getCameraZ?.();
    return typeof z === "number" && z > 0 ? z : FALLBACK_CAMERA_Z;
  }, []);

  // ====================================================
  // ✅ Use RingRenderer camera for projection/unprojection
  // If renderer doesn't expose a camera, provide a fallback camera
  // that matches the expected projection parameters.
  // ====================================================
  const getRendererCamera = useCallback((): THREE.PerspectiveCamera | null => {
    const cam = ringRendererRef.current?.getCamera?.();
    if (cam && cam.isPerspectiveCamera) return cam as THREE.PerspectiveCamera;

    // Fallback camera (keeps tooling functional even if ref API changes)
    const rect = getViewRect();
    const aspect = (rect.width || 1) / (rect.height || 1);
    const z = getCameraZ();

    const fallback = new THREE.PerspectiveCamera(FOV, aspect || 1, 0.1, 10000);
    fallback.position.set(0, 0, z);
    fallback.lookAt(0, 0, 0);
    fallback.updateProjectionMatrix();
    fallback.updateMatrixWorld(true);
    return fallback;
  }, [getViewRect, getCameraZ]);

  type ClientPointEvent = { clientX: number; clientY: number };

  const getCanvasPoint = useCallback(
    (evt: ClientPointEvent) => {
      const rect = getViewRect();
      if (!rect) return { sx: 0, sy: 0, rect: null as DOMRect | null };

      return {
        sx: evt.clientX - rect.left,
        sy: evt.clientY - rect.top,
        rect,
      };
    },
    [getViewRect],
  );

  // ====================================================
  // World convention:
  // RingRenderer renders mesh at (x, -y)
  // We ALSO apply floating-origin recentering (subtract logicalOrigin).
  // ====================================================
  const logicalToWorld = useCallback(
    (lx: number, ly: number) => {
      const ox = logicalOrigin.ox;
      const oy = logicalOrigin.oy;
      return { wx: lx - ox, wy: -(ly - oy) };
    },
    [logicalOrigin],
  );

  const worldToLogical = useCallback(
    (wx: number, wy: number) => {
      const ox = logicalOrigin.ox;
      const oy = logicalOrigin.oy;
      return { lx: wx + ox, ly: -wy + oy };
    },
    [logicalOrigin],
  );

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      const cam = getRendererCamera();
      if (!cam) return { sx: 0, sy: 0 };

      const rect = getViewRect();
      const W = rect.width || 1;
      const H = rect.height || 1;

      const v = new THREE.Vector3(wx, wy, 0);
      v.project(cam);

      return {
        sx: (v.x + 1) * 0.5 * W,
        sy: (-v.y + 1) * 0.5 * H,
      };
    },
    [getRendererCamera, getViewRect],
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const cam = getRendererCamera();
      if (!cam) return { wx: 0, wy: 0, lx: 0, ly: 0 };

      const rect = getViewRect();
      const W = rect.width || 1;
      const H = rect.height || 1;

      const xNdc = (sx / W) * 2 - 1;
      const yNdc = -((sy / H) * 2 - 1);

      const origin = new THREE.Vector3();
      const dir = new THREE.Vector3(xNdc, yNdc, 0.5)
        .unproject(cam)
        .sub(cam.position)
        .normalize();
      origin.copy(cam.position);

      const t = (0 - origin.z) / (dir.z || 1e-9);
      const hit = origin.clone().add(dir.multiplyScalar(t));

      const wx = hit.x;
      const wy = hit.y;
      const { lx, ly } = worldToLogical(wx, wy);

      return { wx, wy, lx, ly };
    },
    [getRendererCamera, getViewRect, worldToLogical],
  );

  const projectRingRadiusPx = useCallback(
    (lx: number, ly: number, outerRmmBase: number) => {
      const { wx: cx, wy: cy } = logicalToWorld(lx, ly);
      const { wx: rx, wy: ry } = logicalToWorld(lx + outerRmmBase, ly);

      const { sx: sx1 } = worldToScreen(cx, cy);
      const { sx: sx2 } = worldToScreen(rx, ry);

      return Math.abs(sx2 - sx1);
    },
    [logicalToWorld, worldToScreen],
  );

  const eventToScreen = useCallback(
    (evt: MouseEvent | PointerEvent) => {
      const rect = getViewRect();
      if (!rect) return null;

      return {
        sx: evt.clientX - rect.left,
        sy: evt.clientY - rect.top,
      };
    },
    [getViewRect],
  );

  // ====================================================
  // ✅ ONE-PASS DERIVED DATA (Rings3D + Paint + Stats + Lazy Export)
  // ====================================================
// ====================================================
// ✅ ONE-PASS DERIVED DATA (Rings3D + Paint + Stats + Lazy Export)
// ====================================================
const derived = useMemo(() => {
  const rings3D: any[] = [];
  const paintMap = new Map<string, string>();

  // ✅ Stats should remain on STORED (true) colors, not calibrated render colors
  const colorCountsStored = new Map<string, number>();

  const outerRadiusMm = (innerIDmm + 2 * wireMm) / 2;

  // Lazy: only build export list when needed (Finalize panel)
  const wantExport = finalizeOpen;
  const exportRings: ExportRing[] = [];

  rings.forEach((r: PlacedRing) => {
    const { x: baseX, y: baseY } = rcToLogical(r.row, r.col);

    // Apply origin shift for stable rendering coordinates
    const shiftedX = baseX - logicalOrigin.ox;
    const shiftedY = baseY - logicalOrigin.oy;

    const tiltDeg = r.row % 2 === 0 ? angleIn : angleOut;
    const tiltRad = THREE.MathUtils.degToRad(tiltDeg);

    // ✅ STORED physical color (#rrggbb)
    const storedColor = normalizeColor6((r as any).color ?? "#ffffff");

    // ✅ RENDER color (calibrated) for display only
    const renderColor = applyCalibrationHex(storedColor);

    const key = `${r.row},${r.col}`;

    rings3D.push({
      id: key,
      row: r.row,
      col: r.col,
      x: shiftedX,
      y: shiftedY,
      z: 0,
      innerDiameter: innerIDmm,
      wireDiameter: wireMm,
      radius: outerRadiusMm,
      centerSpacing,
      tilt: tiltDeg,
      tiltRad,
      color: renderColor,
      });

      paintMap.set(key, renderColor);

      // ✅ Stats should reflect true chosen colors
      colorCountsStored.set(
        storedColor,
        (colorCountsStored.get(storedColor) ?? 0) + 1,
      );
      if (wantExport) {
        exportRings.push({
          key, // ✅ now matches every other key in the app
          x_mm: baseX,
          y_mm: baseY,
          innerDiameter_mm: innerIDmm,
          wireDiameter_mm: wireMm,
          colorHex: storedColor,
        });
      }
    });

    const byColor = Array.from(colorCountsStored.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const ringStats = {
      total: rings.size,
      byColor,
      uniqueColors: byColor.length,
    };

    return { rings3D, paintMap, ringStats, exportRings };
  }, [
    rings,
    rcToLogical,
    logicalOrigin.ox,
    logicalOrigin.oy,
    innerIDmm,
    wireMm,
    centerSpacing,
    angleIn,
    angleOut,
    finalizeOpen,
    // ✅ Recompute render colors when calibration changes
    calibrationVersion,
  ]);

  const rings3D = derived.rings3D;
  const paintMap = derived.paintMap;
  const ringStats = derived.ringStats;
  const exportRings = derived.exportRings;

  // ✅ keep window bridge valid (BOM UI removed)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.getBOMRings = () => [];
  }, []);

  // ✅ Pass calibrated activeColor to renderer (display only)
  const renderActiveColor = useMemo(() => {
    const stored = normalizeColor6(activeColor);
    return applyCalibrationHex(stored);
  }, [activeColor, calibrationVersion]);

  // Creates a composited 2D canvas (opaque) from the live renderer.
  // Works whether RingRenderer is WebGL or 2D; prevents black/transparent PNGs.
  const getRendererCanvas = useCallback((): HTMLCanvasElement | null => {
    // 1) Prefer the renderer canvas directly
    const fromRef =
      (ringRendererRef.current as any)?.getCanvas?.() ??
      (ringRendererRef.current as any)?.domElement ??
      null;

    // 2) Otherwise, discover the main rendering canvas in the DOM
    const src: HTMLCanvasElement | null =
      (fromRef as HTMLCanvasElement) ??
      (() => {
        const list = Array.from(
          document.querySelectorAll("canvas"),
        ) as HTMLCanvasElement[];

        // Prefer a WebGL canvas (Three.js)
        const gl = list.find((c) => {
          try {
            return !!(
              c.getContext("webgl2") ||
              c.getContext("webgl") ||
              c.getContext("experimental-webgl")
            );
          } catch {
            return false;
          }
        });
        if (gl) return gl;

        // Fallback: largest non-zero canvas
        return (
          list
            .filter((c) => c.width > 0 && c.height > 0)
            .sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null
        );
      })();

    if (!src) return null;

    // Use the backing-store size (already DPR-scaled for WebGL)
    const w = Math.max(1, src.width);
    const h = Math.max(1, src.height);

    // 3) Composite onto an opaque 2D canvas with the app bg color
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;

    const ctx = out.getContext("2d", { alpha: false });
    if (!ctx) return null;

    // Match your renderer background (keeps export colors true)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    // Draw the rendered image
    try {
      ctx.drawImage(src, 0, 0, w, h);
    } catch (e) {
      console.warn("drawImage from renderer failed:", e);
      return null;
    }

    return out;
  }, []);

  // ====================================================
  // Clear interaction canvas (selection overlay canvas)
  // ====================================================
  const clearInteractionCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    } as CanvasRenderingContext2DSettings);
    if (!ctx) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Ensure we clear in CSS-pixel space (matches resizeOverlayCanvases transform)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, []);

  // ====================================================
  // Resize canvases reliably (window + layout changes)
  // ====================================================
  const resizeOverlayCanvases = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const hitCanvas = hitCanvasRef.current;
    if (!wrap || !canvas || !hitCanvas) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // interaction canvas
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    } as CanvasRenderingContext2DSettings);
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // hit overlay canvas
    hitCanvas.width = rect.width * dpr;
    hitCanvas.height = rect.height * dpr;
    hitCanvas.style.width = `${rect.width}px`;
    hitCanvas.style.height = `${rect.height}px`;

    const hctx = hitCanvas.getContext("2d", {
      willReadFrequently: true,
    } as CanvasRenderingContext2DSettings);
    if (!hctx) return;

    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hctx.clearRect(0, 0, rect.width, rect.height);
  }, []);

  useEffect(() => {
    resizeOverlayCanvases();

    const wrap = wrapRef.current;
    if (!wrap) return;

    const ro = new ResizeObserver(() => {
      resizeOverlayCanvases();
    });
    ro.observe(wrap);

    window.addEventListener("resize", resizeOverlayCanvases);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeOverlayCanvases);
    };
  }, [resizeOverlayCanvases]);

  // Effective inner radius for hit-circles (mm).
  // We size clickable circles by the ring's inner opening.
  // This stays independent of tilt; projection handles screen scale.
  const getEffectiveInnerRadiusMm = useCallback(
    (_row: number) => {
      return Math.max(0.1, innerIDmm / 2); // inner diameter → radius
    },
    [innerIDmm],
  );
  // ====================================================
  // SCALES DRAWING: hole + position-based stacking
  // ====================================================

  /**
   * Draw a 2D scale using the same geometry fields as Tuner.
   */
  function drawScaleFromExport(
    ctx: CanvasRenderingContext2D,
    scale: ExportScale,
    project: (xMm: number, yMm: number) => { x: number; y: number },
    mmToPx: (mm: number) => number,
  ) {
    const hole = project(scale.x_mm, scale.y_mm);
    const body = project(scale.bodyX_mm, scale.bodyY_mm);
    const w = Math.max(2, mmToPx(scale.widthMm));
    const h = Math.max(2, mmToPx(scale.heightMm));
    const holeR = Math.max(1, mmToPx(scale.holeIdMm) / 2);
    const dx = body.x - hole.x;
    const dy = body.y - hole.y;
    const tilt = scale.tiltRad ?? 0;
    const tipLiftRad = (scale.tipLiftDeg ?? 0) * (Math.PI / 180);

    ctx.save();
    ctx.translate(hole.x, hole.y);
    ctx.scale(Math.cos(tilt), Math.cos(tipLiftRad));

    const topY = -h * 0.08 + dy;
    const midY = h * 0.38 + dy;
    const tipY = h * 0.98 + dy;
    const halfW = w / 2;

    const outer = new Path2D();
    switch (scale.shape) {
      case "leaf":
        outer.moveTo(0, topY);
        outer.bezierCurveTo(halfW * 0.95, h * 0.08 + dy, halfW * 1.05, midY, halfW * 0.34, h * 0.76 + dy);
        outer.bezierCurveTo(halfW * 0.18, h * 0.9 + dy, halfW * 0.08, h * 0.96 + dy, 0, tipY);
        outer.bezierCurveTo(-halfW * 0.08, h * 0.96 + dy, -halfW * 0.18, h * 0.9 + dy, -halfW * 0.34, h * 0.76 + dy);
        outer.bezierCurveTo(-halfW * 1.05, midY, -halfW * 0.95, h * 0.08 + dy, 0, topY);
        outer.closePath();
        break;
      case "round":
        outer.moveTo(0, topY);
        outer.bezierCurveTo(halfW * 0.95, topY, halfW * 1.05, h * 0.46 + dy, 0, tipY);
        outer.bezierCurveTo(-halfW * 1.05, h * 0.46 + dy, -halfW * 0.95, topY, 0, topY);
        outer.closePath();
        break;
      case "kite":
        outer.moveTo(0, topY);
        outer.lineTo(halfW * 0.96, h * 0.2 + dy);
        outer.lineTo(halfW * 0.56, h * 0.78 + dy);
        outer.lineTo(0, tipY);
        outer.lineTo(-halfW * 0.56, h * 0.78 + dy);
        outer.lineTo(-halfW * 0.96, h * 0.2 + dy);
        outer.closePath();
        break;
      case "teardrop":
      default:
        outer.moveTo(0, topY);
        outer.bezierCurveTo(halfW, h * 0.16 + dy, halfW, midY, 0, tipY);
        outer.bezierCurveTo(-halfW, midY, -halfW, h * 0.16 + dy, 0, topY);
        outer.closePath();
        break;
    }

    const holePath = new Path2D();
    holePath.arc(0, 0, holeR, 0, Math.PI * 2);
    const shape = new Path2D();
    shape.addPath(outer);
    shape.addPath(holePath);

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = scale.colorHex;
    ctx.fill(shape, "evenodd");

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#000";
    const shade = new Path2D();
    shade.moveTo(0, holeR * 0.5);
    shade.bezierCurveTo(halfW * 0.3, h * 0.34 + dy, halfW * 0.16, tipY, 0, tipY - h * 0.12);
    shade.bezierCurveTo(-halfW * 0.1, tipY - h * 0.14, -halfW * 0.06, h * 0.34 + dy, 0, holeR * 0.5);
    shade.closePath();
    ctx.fill(shade);

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#0b1220";
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.stroke(outer);

    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, holeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAllScales(args: {
    ctx: CanvasRenderingContext2D;
    scales: ExportScale[];
    project: (xMm: number, yMm: number) => { x: number; y: number };
    mmToPx: (mm: number) => number;
  }) {
    const { ctx, scales, project, mmToPx } = args;
    const ordered = [...scales].sort((a, b) => (a.row !== b.row ? b.row - a.row : a.col - b.col));
    for (const scale of ordered) drawScaleFromExport(ctx, scale, project, mmToPx);
  }
 const exportScales = useMemo<ExportScale[]>(() => {
  if (scaleColors.size === 0) return [];

  return Array.from(scaleColors.entries()).flatMap(([key, colorHex]) => {
    const m = /^(-?\d+),(-?\d+)$/.exec(key);
    if (!m) return [];

    const row = Number(m[1]);
    const col = Number(m[2]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return [];

    const useInterlocked =
      activeScaleSettings.lockScaleHolesToRingCenters ||
      activeScaleSettings.weaveMode === "interlocked";

    const ringP = rcToLogical(row, col);
    let holeX = ringP.x;
    let holeY = ringP.y;

    if (!useInterlocked) {
      const rowOffset = row & 1 ? activeScaleSettings.centerSpacingMm / 2 : 0;
      holeX =
        col * activeScaleSettings.centerSpacingMm +
        rowOffset +
        activeScaleSettings.gridOffsetXmm;

      holeY =
        row * activeScaleSettings.centerSpacingMm * 0.866 +
        activeScaleSettings.gridOffsetYmm;
    }

    const holeShoulderInset = Math.max(
      activeScaleSettings.holeIdMm * 0.54,
      activeScaleSettings.heightMm * 0.15
    );

    const bodyY =
      holeY -
      holeShoulderInset +
      activeScaleSettings.dropMm +
      (useInterlocked ? 0 : activeScaleSettings.holeOffsetYMm);

    const isIn = row % 2 === 0;
    const tiltDeg = isIn ? activeScaleSettings.angleInDeg : activeScaleSettings.angleOutDeg;
    const tipLiftDeg = activeScaleSettings.scaleTipLiftDeg;

    return [
      {
        key,
        row,
        col,
        x_mm: holeX,
        y_mm: holeY,
        bodyX_mm: holeX,
        bodyY_mm: bodyY,
        colorHex: normalizeColor6(
          colorHex || activeScaleSettings.colorHex
        ),
        holeIdMm: activeScaleSettings.holeIdMm,
        widthMm: activeScaleSettings.widthMm,
        heightMm: activeScaleSettings.heightMm,
        shape: activeScaleSettings.shape,
        dropMm: activeScaleSettings.dropMm,
        holeOffsetYMm: activeScaleSettings.holeOffsetYMm,
        tiltRad: tiltDeg * DEG,
        planeZMm: activeScaleSettings.scalePlaneZ,
        tipLiftDeg,
        rowClearanceZMm: activeScaleSettings.scaleRowClearanceZ,
      },
    ];
  });
}, [scaleColors, activeScaleSettings, rcToLogical]); 
  // ====================================================
  // HIT CIRCLE DRAWING (WORLD SPACE → SCREEN SPACE)
  // ✅ FIX: RAF-throttle + viewport cull (keeps huge counts responsive)
  // ====================================================
  const drawHitCircles = useCallback(() => {
    const canvas = hitCanvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    } as CanvasRenderingContext2DSettings);
    if (!ctx) return;

    // Clear in CSS pixel space (since you setTransform(dpr,...) in resize)
    const rect = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (hideCircles) {
      return;
    }

    ctx.strokeStyle = "rgba(20,184,166,0.8)";
    ctx.lineWidth = 1;

    const margin = 60;

    rings.forEach((r) => {
      const { x, y } = rcToLogical(r.row, r.col);

      const lx = x + circleOffsetX;
      const ly = y + circleOffsetY;

      const { wx, wy } = logicalToWorld(lx, ly);
      const { sx, sy } = worldToScreen(wx, wy);

      if (
        sx < -margin ||
        sx > rect.width + margin ||
        sy < -margin ||
        sy > rect.height + margin
      )
        return;

      const effInner = getEffectiveInnerRadiusMm(r.row);
      const rPx = projectRingRadiusPx(lx, ly, effInner) * circleScale;

      ctx.beginPath();
      ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
      ctx.stroke();
    });
  }, [
    rings,
    rcToLogical,
    logicalToWorld,
    worldToScreen,
    projectRingRadiusPx,
    getEffectiveInnerRadiusMm,
    circleScale,
    circleOffsetX,
    circleOffsetY,
    hideCircles,
  ]);

  const hitRafRef = useRef<number | null>(null);
  const scheduleDrawHitCircles = useCallback(() => {
    if (hitRafRef.current != null) return;
    hitRafRef.current = requestAnimationFrame(() => {
      hitRafRef.current = null;
      drawHitCircles();
    });
  }, [drawHitCircles]);

  useEffect(() => {
    scheduleDrawHitCircles();
  }, [
    scheduleDrawHitCircles,
    zoom,
    panWorldX,
    panWorldY,
    logicalOrigin.ox,
    logicalOrigin.oy,
    rings,
    hideCircles,
    circleScale,
    circleOffsetX,
    circleOffsetY,
    scaleColors,
  ]);

  useEffect(() => {
    return () => {
      if (hitRafRef.current != null) cancelAnimationFrame(hitRafRef.current);
      hitRafRef.current = null;
    };
  }, []);

  const drawSelectionOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    } as CanvasRenderingContext2DSettings);
    if (!ctx) return;

    const rect = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (selectionMode === "none") return;
    if (!isSelecting) return;

    const sel = selectionRef.current;
    if (!sel) return;

    const x0 = sel.sx0;
    const y0 = sel.sy0;
    const x1 = sel.sx1;
    const y1 = sel.sy1;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(37,99,235,0.95)";
    ctx.fillStyle = "rgba(37,99,235,0.18)";

    if (selectionMode === "square") {
      const rx = Math.min(x0, x1);
      const ry = Math.min(y0, y1);
      const rw = Math.abs(x1 - x0);
      const rh = Math.abs(y1 - y0);

      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.fill();
      ctx.stroke();

      // corner handles
      ctx.fillStyle = "rgba(248,250,252,0.85)";
      const s = 5;
      ctx.fillRect(rx - s / 2, ry - s / 2, s, s);
      ctx.fillRect(rx + rw - s / 2, ry - s / 2, s, s);
      ctx.fillRect(rx - s / 2, ry + rh - s / 2, s, s);
      ctx.fillRect(rx + rw - s / 2, ry + rh - s / 2, s, s);
    } else if (selectionMode === "circle") {
      const cx = x0;
      const cy = y0;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const r = Math.sqrt(dx * dx + dy * dy);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // center dot
      ctx.fillStyle = "rgba(248,250,252,0.9)";
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const cx = x0;
      const cy = y0;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const r = Math.sqrt(dx * dx + dy * dy);

      const drawRegularPolygon = (
        sides: number,
        rotationRad: number = -Math.PI / 2,
      ) => {
        if (sides < 3) return;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const a = rotationRad + (i * 2 * Math.PI) / sides;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      };

      const drawHeart = () => {
        // Simple bezier heart; r controls overall size.
        const s = r;
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.35);
        ctx.bezierCurveTo(
          cx - s * 0.9,
          cy - s * 0.25,
          cx - s * 0.55,
          cy - s * 1.05,
          cx,
          cy - s * 0.65,
        );
        ctx.bezierCurveTo(
          cx + s * 0.55,
          cy - s * 1.05,
          cx + s * 0.9,
          cy - s * 0.25,
          cx,
          cy + s * 0.35,
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      };

      switch (selectionMode) {
        case "tri":
          drawRegularPolygon(3, -Math.PI / 2);
          break;
        case "hex":
          // Flat-ish top.
          drawRegularPolygon(6, Math.PI / 6);
          break;
        case "oct":
          drawRegularPolygon(8, Math.PI / 8);
          break;
        case "heart":
          drawHeart();
          break;
        default:
          // Safety fallback.
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
      }
    }

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "rgba(248,250,252,0.9)";
    const hint = eraseMode ? "🧽" : overlayPickingRef.current ? "🖼️" : "🎨";
    ctx.fillText(`${hint} ${lastSelectionCount || ""}`, 10, rect.height - 12);
  }, [selectionMode, isSelecting, eraseMode, lastSelectionCount]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      overlayPickingRef.current = false;

      if (isSelecting) {
        setIsSelecting(false);
        selectionRef.current = null;
        setLiveDims(null);
        setLastSelectionCount(0);
        setSelectedKeys(new Set());
        clearInteractionCanvas();
        return;
      }

      // Or just exit selection tool mode
      if (selectionMode !== "none") {
        setSelectionMode("none");
        setSelectedKeys(new Set());
        clearInteractionCanvas();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSelecting, selectionMode, clearInteractionCanvas]);

  useEffect(() => {
    if (selectionMode === "none" || !isSelecting) {
      clearInteractionCanvas();
      return;
    }
    drawSelectionOverlay();
  }, [
    selectionMode,
    isSelecting,
    zoom,
    panWorldX,
    panWorldY,
    logicalOrigin.ox,
    logicalOrigin.oy,
    drawSelectionOverlay,
    clearInteractionCanvas,
  ]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (selectionMode !== "none" && !panMode) {
        const { sx, sy } = getCanvasPoint(e);
        const { lx, ly } = screenToWorld(sx, sy);

        setCursorPx({ x: e.clientX, y: e.clientY });

        setIsSelecting(true);
        const sel: SelectionDrag = {
          sx0: sx,
          sy0: sy,
          sx1: sx,
          sy1: sy,
          lx0: lx,
          ly0: ly,
          lx1: lx,
          ly1: ly,
        };
        selectionRef.current = sel;

        setLiveDims(computeDimsFromSelection(sel, selectionMode));

        setLastSelectionCount(0);
        setSelectedKeys(new Set()); // clear old highlight until we finalize
        drawSelectionOverlay();
        return;
      }

      // ✅ Keep your existing pan gating
      if (!panMode) return;

      const { sx, sy } = getCanvasPoint(e);
      const { lx, ly } = screenToWorld(sx, sy);

      setIsPanning(true);
      panStart.current = {
        screenX: e.clientX,
        screenY: e.clientY,
        panX: panWorldX,
        panY: panWorldY,
        lx,
        ly,
      };
    },
    [
      selectionMode,
      panMode,
      getCanvasPoint,
      screenToWorld,
      panWorldX,
      panWorldY,
      drawSelectionOverlay,
      computeDimsFromSelection,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Always track cursor for floating bubble (and to keep the state "used")
      setCursorPx({ x: e.clientX, y: e.clientY });

      // Touch/Pointer parity helper (keeps eventToScreen used and ready for diagnostics)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _maybeScreen = eventToScreen(
        e.nativeEvent as unknown as MouseEvent,
      );

      // Selection drag
      // ✅ Works even if eraseMode is ON (no gating needed)
      if (isSelecting && selectionMode !== "none" && selectionRef.current) {
        e.preventDefault();

        const { sx, sy } = getCanvasPoint(e);
        const { lx, ly } = screenToWorld(sx, sy);

        // 1) Update selection ref FIRST
        selectionRef.current.sx1 = sx;
        selectionRef.current.sy1 = sy;
        selectionRef.current.lx1 = lx;
        selectionRef.current.ly1 = ly;

        // 2) Then compute live dims from the updated selection
        setLiveDims(
          computeDimsFromSelection(selectionRef.current, selectionMode),
        );

        // update selection count estimate cheaply (bounds-based)
        const sel = selectionRef.current;
        const cells = new Set<string>();

        const minLX = Math.min(sel.lx0, sel.lx1);
        const maxLX = Math.max(sel.lx0, sel.lx1);
        const minLY = Math.min(sel.ly0, sel.ly1);
        const maxLY = Math.max(sel.ly0, sel.ly1);

        // Convert bounding box to row/col range
        const a = logicalToRowColApprox(minLX, minLY);
        const b = logicalToRowColApprox(maxLX, maxLY);
        const minRowC = Math.min(a.row, b.row) - 2;
        const maxRowC = Math.max(a.row, b.row) + 2;
        const minColC = Math.min(a.col, b.col) - 2;
        const maxColC = Math.max(a.col, b.col) + 2;

        if (selectionMode === "square") {
          for (let r = minRowC; r <= maxRowC; r++) {
            for (let c = minColC; c <= maxColC; c++) {
              const p = rcToLogical(r, c);
              if (
                p.x >= minLX &&
                p.x <= maxLX &&
                p.y >= minLY &&
                p.y <= maxLY
              ) {
                cells.add(`${r}-${c}`);
              }
            }
          }
        } else if (selectionMode === "circle") {
          const cx = sel.lx0;
          const cy = sel.ly0;
          const dx2 = sel.lx1 - sel.lx0;
          const dy2 = sel.ly1 - sel.ly0;
          const rr = Math.sqrt(dx2 * dx2 + dy2 * dy2);

          for (let r = minRowC; r <= maxRowC; r++) {
            for (let c = minColC; c <= maxColC; c++) {
              const p = rcToLogical(r, c);
              const ddx = p.x - cx;
              const ddy = p.y - cy;
              if (ddx * ddx + ddy * ddy <= rr * rr) {
                cells.add(`${r}-${c}`);
              }
            }
          }
        }

        setLastSelectionCount(cells.size);

        drawSelectionOverlay();
        return;
      }

      // Pan drag
      if (!panMode || !isPanning || !panStart.current) return;

      e.preventDefault();

      const { sx, sy } = getCanvasPoint(e);
      const { lx, ly } = screenToWorld(sx, sy);

      const dxLogical = panStart.current.lx - lx;
      const dyLogical = panStart.current.ly - ly;

      setPanWorldX(panStart.current.panX + dxLogical);
      setPanWorldY(panStart.current.panY + dyLogical);
    },
    [
      isSelecting,
      selectionMode,
      panMode,
      isPanning,
      getCanvasPoint,
      screenToWorld,
      logicalToRowColApprox,
      rcToLogical,
      drawSelectionOverlay,
      computeDimsFromSelection,
      eventToScreen,
    ],
  );
  // ======================================================
  // SPLINE -> RINGS (CLOSED POLYGON FILL)
  // Uses the SAME logic as circle/rect fill (cells + resolvePlacement)
  // polygonScreen is in SCREEN px (from SplineSandbox)
  // ======================================================
  const applyClosedSplineAsRings = useCallback(
    (polygonScreen: { x: number; y: number }[], colorHex: string) => {
      if (!polygonScreen || polygonScreen.length < 3) return;
      const paint = normalizeColor6(colorHex);

      // Convert polygon from screen -> logical (same space used by rcToLogical)
      const poly = polygonScreen.map((p) => {
        const w = screenToWorld(p.x, p.y);
        return { x: w.lx, y: w.ly };
      });

      // BBox in logical space
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      if (
        !isFinite(minX) ||
        !isFinite(minY) ||
        !isFinite(maxX) ||
        !isFinite(maxY)
      )
        return;

      // Tight row/col bounds (like circle/rect)
      const a = logicalToRowColApprox(minX, minY);
      const b = logicalToRowColApprox(maxX, maxY);

      const minRow = Math.min(a.row, b.row) - 2;
      const maxRow = Math.max(a.row, b.row) + 2;
      const minCol = Math.min(a.col, b.col) - 2;
      const maxCol = Math.max(a.col, b.col) + 2;

      const cells: Array<{ row: number; col: number }> = [];

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const p = rcToLogical(r, c); // returns {x,y} in logical space
          if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
          if (!pointInPoly(p.x, p.y, poly)) continue;
          cells.push({ row: r, col: c });
        }
      }

      if (!cells.length) return;

      // Deterministic order
      cells.sort((u, v) => u.row - v.row || u.col - v.col);

      // Apply like circle/rect
      const mapCopy: RingMap = new Map(rings);
      let clusterId = nextClusterId;

      for (const cell of cells) {
        const { ring, newCluster } = resolvePlacement(
          cell.col,
          cell.row,
          mapCopy,
          clusterId,
          paint,
          settings,
        );

        clusterId = newCluster;

        // FORCE stored ring color (important for instanced renderer paths)
        ring.color = paint;

        mapCopy.set(`${ring.row}-${ring.col}`, ring);
      }

      setRings(mapCopy);
      setnextClusterId(clusterId);
    },
    [
      rings,
      nextClusterId,
      settings,
      screenToWorld,
      logicalToRowColApprox,
      rcToLogical,
      setRings,
      setnextClusterId,
    ],
  );

  // ====================================================
  // Bulk apply selection
  // - Adds rings in selection (or erases if eraseMode)
  // - Uses resolvePlacement per cell to preserve cluster logic
  // ====================================================
  const applySelectionToActiveLayer = useCallback(
    (sel: SelectionDrag, mode: SelectionMode) => {
      if (mode === "none") return;

      // Compute candidate cells
      const cells = computeShapeCells({
        tool: mode,
        sel,
        logicalToRowColApprox,
        rcToLogical,
      });

      if (!cells.length) {
        setLastSelectionCount(0);
        setSelectedKeys(new Set());
        return;
      }

      // Stable order (row-major) for deterministic placement & cluster behavior
      cells.sort((a, b) => a.row - b.row || a.col - b.col);

      // Highlight selected cells (for render feedback)
      setSelectedKeys(new Set(cells.map((c) => `${c.row}-${c.col}`)));

      // Apply to scales (no cluster logic)
      if (activeLayerRef.current === "scales") {
        setScaleColors((prev) => {
          const next = new Map(prev);
          if (eraseModeRef.current) {
            for (const cell of cells) next.delete(`${cell.row},${cell.col}`);
          } else {
            const col = normalizeColor6(activeColorRef.current || activeScaleSettings.colorHex);
            for (const cell of cells) next.set(`${cell.row},${cell.col}`, col);
          }
          return next;
        });
        setLastSelectionCount(cells.length);
        setSelectedKeys(new Set());
        return;
      }

      // Apply to rings
      const mapCopy: RingMap = new Map(rings);
      let clusterId = nextClusterId;

      if (eraseMode) {
        // ✅ FIX: direct delete is O(1) per cell (massively faster than scanning the map)
        for (const cell of cells) {
          mapCopy.delete(`${cell.row}-${cell.col}`);
        }
      } else {
        // Add rings
        for (const cell of cells) {
          const { ring, newCluster } = resolvePlacement(
            cell.col,
            cell.row,
            mapCopy,
            clusterId,
            eraseMode ? "#000000" : normalizeColor6(activeColorRef.current),
            settings,
          );

          clusterId = newCluster;

          const key = `${ring.row}-${ring.col}`;
          mapCopy.set(key, ring);
        }
      }

      setRings(mapCopy);
      setnextClusterId(clusterId);
      setLastSelectionCount(cells.length);

      // Clear highlight after apply (overlay picking retains highlight by its own path)
      setSelectedKeys(new Set());
    },
    [
      rings,
      nextClusterId,
      eraseMode,
      settings,
      logicalToRowColApprox,
      rcToLogical,
    ],
  );

  // Back-compat alias: legacy callers still reference applySelectionToRings.
  // Keep this so selection finalize / overlay picking code doesn't crash.
  const applySelectionToRings = applySelectionToActiveLayer;

  const handleMouseUp = useCallback(() => {
    // Finish selection drag
    if (isSelecting && selectionMode !== "none") {
      const sel = selectionRef.current;
      setIsSelecting(false);

      if (sel) {
        const finalDims = computeDimsFromSelection(sel, selectionMode);
        if (finalDims) setLastDims(finalDims);
        setLiveDims(null);

        const keys = computeSelectionKeys(sel, selectionMode);

        if (overlayPickingRef.current) {
          setOverlayMaskKeys(keys);
          setOverlayScope("selection");
          setSelectedKeys(keys); // highlight the chosen overlay area
          overlayPickingRef.current = false;
        } else {
          setSelectedKeys(keys);
          applySelectionToActiveLayer(sel, selectionMode);
        }
      } else {
        setLiveDims(null);
      }

      selectionRef.current = null;
      clearInteractionCanvas();
      return;
    }

    // Finish pan drag
    setIsPanning(false);
    panStart.current = null;
  }, [
    isSelecting,
    selectionMode,
    applySelectionToRings,
    clearInteractionCanvas,
    computeDimsFromSelection,
    computeSelectionKeys,
  ]);

  const zoomAroundPoint = useCallback(
    (sx: number, sy: number, factor: number) => {
      if (factor === 1) return;

      const { lx: lxBefore, ly: lyBefore } = screenToWorld(sx, sy);

      let nextZoom = zoom * factor;
      if (nextZoom < MIN_ZOOM) nextZoom = MIN_ZOOM;
      if (nextZoom > MAX_ZOOM) nextZoom = MAX_ZOOM;

      setZoom(nextZoom);

      const { lx: lxAfter, ly: lyAfter } = screenToWorld(sx, sy);

      const dx = lxBefore - lxAfter;
      const dy = lyBefore - lyAfter;

      setPanWorldX((p) => p + dx);
      setPanWorldY((p) => p + dy);
    },
    [zoom, screenToWorld],
  );

  // ============================================================
  // DROP-IN SECTION 1/3: Tool state + tiny helpers
  // Put near your other useState() declarations (top of component)
  // ============================================================

  // selectionMode remains your "shape tool" ("none" | "square" | "circle") and stays mutually exclusive.
  // eraseMode becomes an independent toggle that can be ON while selectionMode is "square" or "circle".

  // ✅ No emoji/UI changes required — this is behavior-only.

  const clearSelectionState = useCallback(() => {
    setSelectedKeys(new Set());
  }, [setSelectedKeys]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode("none");
    setIsSelecting(false);
    selectionRef.current = null;
    clearInteractionCanvas();
  }, [setSelectionMode, setIsSelecting, clearInteractionCanvas]);

  const cancelOverlayPickingIfActive = useCallback(() => {
    if (overlayPickingRef.current) {
      overlayPickingRef.current = false;
      // do NOT destroy already-picked keys unless you want that.
      // setOverlayMaskKeys(new Set()); // <-- leave commented unless desired
    }
  }, []);
  // ====================================================
  // ✅ FIX: remove React onWheel/onTouch* preventDefault passive warnings
  // We attach native listeners with { passive:false } to the interaction canvas.
  // ====================================================
  const handleWheelNative = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const { sx, sy } = getCanvasPoint(e);
      zoomAroundPoint(sx, sy, factor);
    },
    [getCanvasPoint, zoomAroundPoint],
  );

  const handleTouchStartNative = useCallback(
    (e: TouchEvent) => {
      // Two-finger pinch always stays available
      if (e.touches.length === 2) {
        e.preventDefault();

        const [t1, t2] = Array.from(e.touches);
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        pinchStateRef.current = { active: true, lastDist: dist };
        return;
      }

      // Selection tool (single-finger drag)
      if (selectionMode !== "none" && !panMode && e.touches.length === 1) {
        e.preventDefault();

        const t = e.touches[0];
        const rect = getViewRect();

        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;

        const { lx, ly } = screenToWorld(sx, sy);

        setIsSelecting(true);
        selectionRef.current = {
          sx0: sx,
          sy0: sy,
          sx1: sx,
          sy1: sy,
          lx0: lx,
          ly0: ly,
          lx1: lx,
          ly1: ly,
        };
        setLastSelectionCount(0);
        setSelectedKeys(new Set());
        drawSelectionOverlay();
        setCursorPx({ x: t.clientX, y: t.clientY });
        if (selectionRef.current) {
          setLiveDims(
            computeDimsFromSelection(selectionRef.current, selectionMode),
          );
        }
        return;
      }

      // Pan mode (single finger)
      if (!panMode || e.touches.length !== 1) return;

      e.preventDefault();

      const t = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;

      const { lx, ly } = screenToWorld(sx, sy);

      setIsPanning(true);
      panStart.current = {
        screenX: t.clientX,
        screenY: t.clientY,
        panX: panWorldX,
        panY: panWorldY,
        lx,
        ly,
      };
    },
    [
      selectionMode,
      panMode,
      getViewRect,
      screenToWorld,
      drawSelectionOverlay,
      panWorldX,
      panWorldY,
      computeDimsFromSelection,
    ],
  );

  const handleTouchMoveNative = useCallback(
    (e: TouchEvent) => {
      // Pinch zoom
      if (e.touches.length === 2) {
        e.preventDefault();

        const [t1, t2] = Array.from(e.touches);
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

        if (!pinchStateRef.current.active) {
          pinchStateRef.current.active = true;
          pinchStateRef.current.lastDist = dist;

          const { lx, ly } = screenToWorld(midX, midY);
          pinchStateRef.current.lx = lx;
          pinchStateRef.current.ly = ly;
          return;
        }

        if (pinchStateRef.current.lastDist > 0) {
          const factor = dist / pinchStateRef.current.lastDist;
          pinchStateRef.current.lastDist = dist;
          zoomAroundPoint(midX, midY, factor);
        }
        return;
      }

      // Selection drag (single finger)
      if (
        isSelecting &&
        selectionMode !== "none" &&
        selectionRef.current &&
        e.touches.length === 1
      ) {
        e.preventDefault();

        const t = e.touches[0];
        setCursorPx({ x: t.clientX, y: t.clientY });

        const rect = getViewRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;

        const { lx, ly } = screenToWorld(sx, sy);

        selectionRef.current.sx1 = sx;
        selectionRef.current.sy1 = sy;
        selectionRef.current.lx1 = lx;
        selectionRef.current.ly1 = ly;

        setLiveDims(
          computeDimsFromSelection(selectionRef.current, selectionMode),
        );
        drawSelectionOverlay();
        return;
      }

      // Pan drag (single finger)
      if (!panMode || !isPanning || !panStart.current || e.touches.length !== 1)
        return;

      e.preventDefault();

      const t = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;

      const { lx, ly } = screenToWorld(sx, sy);

      const dxLogical = panStart.current.lx - lx;
      const dyLogical = panStart.current.ly - ly;

      setPanWorldX(panStart.current.panX + dxLogical);
      setPanWorldY(panStart.current.panY + dyLogical);
    },
    [
      panMode,
      isPanning,
      screenToWorld,
      zoomAroundPoint,
      isSelecting,
      selectionMode,
      getViewRect,
      drawSelectionOverlay,
      computeDimsFromSelection,
    ],
  );

  const handleTouchEndNative = useCallback(() => {
    // Always end pinch state on touch end/cancel
    pinchStateRef.current = { active: false, lastDist: 0 };

    // Finish selection drag
    if (isSelecting && selectionMode !== "none") {
      const sel = selectionRef.current;
      setIsSelecting(false);

      if (sel) {
        const finalDims = computeDimsFromSelection(sel, selectionMode);
        if (finalDims) setLastDims(finalDims);
        setLiveDims(null);

        if (overlayPickingRef.current) {
          const keys = computeSelectionKeys(sel, selectionMode);
          setOverlayMaskKeys(keys);
          setOverlayScope("selection");
          setSelectedKeys(keys);
          overlayPickingRef.current = false;
        } else {
          finalizeSelection();
          applySelectionToActiveLayer(sel, selectionMode);
        }
      } else {
        setLiveDims(null);
      }

      selectionRef.current = null;
      clearInteractionCanvas();
      return;
    }

    // Finish pan drag
    setIsPanning(false);
    panStart.current = null;
  }, [
    isSelecting,
    selectionMode,
    computeDimsFromSelection,
    finalizeSelection,
    applySelectionToRings,
    clearInteractionCanvas,
    computeSelectionKeys,
  ]);

  // ✅ Install native listeners (passive:false) to stop console spam.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Wheel (zoom)
    canvas.addEventListener("wheel", handleWheelNative, { passive: false });

    // Touch (pinch + drag)
    canvas.addEventListener("touchstart", handleTouchStartNative, {
      passive: false,
    });
    canvas.addEventListener("touchmove", handleTouchMoveNative, {
      passive: false,
    });
    canvas.addEventListener("touchend", handleTouchEndNative, {
      passive: true,
    });
    canvas.addEventListener("touchcancel", handleTouchEndNative, {
      passive: true,
    });

    return () => {
      canvas.removeEventListener("wheel", handleWheelNative as any);

      canvas.removeEventListener("touchstart", handleTouchStartNative as any);
      canvas.removeEventListener("touchmove", handleTouchMoveNative as any);
      canvas.removeEventListener("touchend", handleTouchEndNative as any);
      canvas.removeEventListener("touchcancel", handleTouchEndNative as any);
    };
  }, [
    handleWheelNative,
    handleTouchStartNative,
    handleTouchMoveNative,
    handleTouchEndNative,
  ]);

  // ===============================
  // CLICK → place / erase nearest ring
  // (kept intact; selection tool ignores click placement)
  // ===============================
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (panMode) return;
      if (selectionMode !== "none") return; // selection tool uses drag, not click

      const { sx, sy } = getCanvasPoint(e);
      const { lx, ly } = screenToWorld(sx, sy);

      // ✅ Debug markers ONLY when diagnostics is enabled
      if (showDiagnostics) {
        addDebugMarker(lx, ly);
      }

      const adjLx = lx - circleOffsetX;
      const adjLy = ly - circleOffsetY;

      const { row: approxRow, col: approxCol } = logicalToRowColApprox(
        adjLx,
        adjLy,
      );

      if (activeLayer === "scales") {
        const key = `${approxRow},${approxCol}`;
        setScaleColors((prev) => {
          const next = new Map(prev);
          if (eraseModeRef.current) next.delete(key);
          else next.set(key, normalizeColor6(activeColorRef.current || activeScaleSettings.colorHex));
          return next;
        });
        return;
      }

      const effectiveInnerRadiusMm = getEffectiveInnerRadiusMm(approxRow);
      const baseCircleRmm = effectiveInnerRadiusMm;

      const hitRadiusPx =
        projectRingRadiusPx(adjLx, adjLy, baseCircleRmm * circleScale) * 1.05;

      let bestRow = approxRow;
      let bestCol = approxCol;
      let bestDist2 = Number.POSITIVE_INFINITY;
      let found = false;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const row = approxRow + dr;
          const col = approxCol + dc;

          const { x: gx, y: gy } = rcToLogical(row, col);
          const { wx, wy } = logicalToWorld(gx, gy);
          const { sx: ringSx, sy: ringSy } = worldToScreen(wx, wy);

          const dx = sx - ringSx;
          const dy = sy - ringSy;
          const d2 = dx * dx + dy * dy;

          if (d2 <= hitRadiusPx * hitRadiusPx && d2 < bestDist2) {
            bestDist2 = d2;
            bestRow = row;
            bestCol = col;
            found = true;
          }
        }
      }

      if (!found) return;

      const { ring, newCluster } = resolvePlacement(
        bestCol,
        bestRow,
        rings,
        nextClusterId,
        eraseMode ? "#000000" : normalizeColor6(activeColorRef.current),
        settings,
      );
      const mapCopy: RingMap = new Map(rings);

      const key = `${ring.row}-${ring.col}`;

      if (eraseMode) {
        // ✅ FIX: direct delete (no scanning)
        mapCopy.delete(key);
      } else {
        mapCopy.set(key, ring);
      }

      setRings(mapCopy);
      setnextClusterId(newCluster);

      // ✅ Diagnostics log only when enabled
      if (showDiagnostics) {
        setDiagLog((prev) => {
          const line = `lx=${lx.toFixed(3)} ly=${ly.toFixed(
            3,
          )} row=${bestRow} col=${bestCol}\n`;
          return (prev || "") + line;
        });
      }
    },
    [
      panMode,
      selectionMode,
      getCanvasPoint,
      screenToWorld,
      showDiagnostics,
      addDebugMarker,
      circleOffsetX,
      circleOffsetY,
      logicalToRowColApprox,
      getEffectiveInnerRadiusMm,
      projectRingRadiusPx,
      circleScale,
      rcToLogical,
      logicalToWorld,
      worldToScreen,
      rings,
      nextClusterId,
      eraseMode,
      settings,
      activeLayer,
      activeScaleSettings,
    ],
  );

  // ===============================
  // CLEAR / GEOMETRY RESET
  // ===============================
  const handleClear = useCallback(() => {
    if (!window.confirm("Clear all rings and scales?")) return;

    // ✅ Clear rings
    setRings(new Map());
    setnextClusterId(1);

    // ✅ Clear scales (state + ref cache)
    setScaleColors(new Map());
    scaleColorsRef.current?.clear();

    // ✅ Clear selection / overlay selection
    setSelectedKeys(new Set());
    setOverlayMaskKeys(new Set());

    // ✅ Clear any cached hit canvas pixels (prevents “stuck” scales)
    if (hitCanvasRef.current) {
      const c = hitCanvasRef.current;
      const ctx = c.getContext("2d");
      ctx?.clearRect(0, 0, c.width, c.height);
    }

    // ✅ If you have any cached interaction canvases, wipe them
    clearInteractionCanvas?.();
  }, [
    setRings,
    setnextClusterId,
    setScaleColors,
    setSelectedKeys,
    setOverlayMaskKeys,
    clearInteractionCanvas,
  ]);
  // ===============================
  // UI RESET (tools/pan/zoom/panels/overlays/drag positions)
  // ===============================
  const resetUI = useCallback(() => {
    // Panels / toggles
    setShowControls(false);
    setShowDiagnostics(false);
    setShowImageOverlay(false);
    setShowCompass(false);

    // Stats panel (show it again)
    setShowFreeformStats(true);

    // Tool modes
    setEraseMode(false);
    setSelectionMode("none");
    setPanMode(false);
    setIsPanning(false);

    // Selection state
    setIsSelecting(false);
    selectionRef.current = null;
    overlayPickingRef.current = false;

    setSelectedKeys(new Set());
    setOverlayMaskKeys(new Set());
    setOverlayScope("all");
    setLastSelectionCount(0);
    setLiveDims(null);
    setLastDims(null);

    // Diagnostics
    setDiagLog("");
    setDebugClicks([]);

    // Overlay data itself
    setOverlay(null);
    overlayImgRef.current = null;

    // Palette UI popups
    setPaletteManagerOpen(false);
    setPickerState(null);

    // Cursor info
    setCursorPx(null);

    // Pan/Zoom defaults
    setZoom(1.0);
    setPanWorldX(0);
    setPanWorldY(0);

    // Hit-circle UI defaults
    setCircleOffsetX(0);
    setCircleOffsetY(0);
    setCircleScale(1.0);
    setHideCircles(true);

    // Clear any in-progress overlay drawings
    clearInteractionCanvas();

    // Redraw hit circles in the new state
    scheduleDrawHitCircles();

    // Attempt to reset DraggablePill positions by clearing any stored keys
    // that reference our pill ids (safe no-ops if nothing matches).
    try {
      const pillIds = [
        "freeform-toolbar",
        "freeform-palette",
        "freeform-stats",
        "freeform-image-overlay",
      ];

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (pillIds.some((id) => k.includes(id))) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
  }, [clearInteractionCanvas, scheduleDrawHitCircles]);
  // ===============================
  // Ring Set loading (Tuner + JSON)
  // ===============================
  const reloadRingSets = useCallback(() => {
    try {
      const txt = localStorage.getItem(TUNER_LS_KEY);
      if (!txt) {
        setRingSets([]);
        return;
      }

      const arr = JSON.parse(txt) as any[];
      const cleaned: RingSet[] = arr
        .filter((e) => e && typeof e.id === "string")
        .map((e) => ({
          id: e.id,
          innerDiameter: e.innerDiameter ?? innerIDmm,
          wireDiameter: e.wireDiameter ?? wireMm,
          centerSpacing: e.centerSpacing ?? centerSpacing,
          angleIn: typeof e.angleIn === "number" ? e.angleIn : 25,
          angleOut: typeof e.angleOut === "number" ? e.angleOut : -25,
          status: e.status,
          aspectRatio: e.aspectRatio,
          savedAt: e.savedAt,
        }));

      cleaned.sort((a, b) => {
        const ta = a.savedAt ? Date.parse(a.savedAt) : 0;
        const tb = b.savedAt ? Date.parse(b.savedAt) : 0;
        return ta - tb;
      });

      setRingSets(cleaned);
    } catch (err) {
      console.warn("Failed to parse tuner ring sets:", err);
      setRingSets([]);
    }
  }, [centerSpacing, innerIDmm, wireMm]);

  const applyRingSet = useCallback((rs: RingSet) => {
    setInnerIDmm(rs.innerDiameter);
    setWireMm(rs.wireDiameter);
    setCenterSpacing(rs.centerSpacing);
    setAngleIn(rs.angleIn ?? 25);
    setAngleOut(rs.angleOut ?? -25);
    setActiveRingSetId(rs.id);
  }, []);

  useEffect(() => {
    reloadRingSets();

    const storedAuto = localStorage.getItem(AUTO_FOLLOW_KEY);
    const auto =
      storedAuto === null ? true : storedAuto === "true" || storedAuto === "1";
    setAutoFollowTuner(auto);

    const storedActive = localStorage.getItem(ACTIVE_SET_KEY);
    if (storedActive) setActiveRingSetId(storedActive);
  }, [reloadRingSets]);

  useEffect(() => {
    if (!ringSets.length) return;

    if (autoFollowTuner) {
      const latest = ringSets[ringSets.length - 1];
      applyRingSet(latest);
      return;
    }

    if (activeRingSetId) {
      const found = ringSets.find((r) => r.id === activeRingSetId);
      if (found) applyRingSet(found);
    }
  }, [ringSets, autoFollowTuner, activeRingSetId, applyRingSet]);

  useEffect(() => {
    localStorage.setItem(AUTO_FOLLOW_KEY, autoFollowTuner ? "true" : "false");
  }, [autoFollowTuner]);

  useEffect(() => {
    if (activeRingSetId) localStorage.setItem(ACTIVE_SET_KEY, activeRingSetId);
  }, [activeRingSetId]);

  // Prevent panning inside RingRenderer; we own pan/zoom here
  useEffect(() => {
    if (ringRendererRef.current?.setPanEnabled) {
      ringRendererRef.current.setPanEnabled(false);
    }
  }, []);

  const saveFreeformProject = useCallback(() => {
    const id = safeUUID();
    const name = `Freeform ${new Date().toLocaleString()}`;

    // thumbnail from renderer canvas (≈480px wide)
    const cvs = getRendererCanvas();
    let thumb:
      | { pngDataUrl: string; width: number; height: number }
      | undefined;
    if (cvs) {
      const targetW = 480;
      const scale = targetW / cvs.width;
      const t = document.createElement("canvas");
      t.width = targetW;
      t.height = Math.max(1, Math.round(cvs.height * scale));
      const ctx = t.getContext("2d");
      if (ctx) {
        ctx.drawImage(cvs, 0, 0, t.width, t.height);
        thumb = {
          pngDataUrl: t.toDataURL("image/png"),
          width: t.width,
          height: t.height,
        };
      }
    }

    const payload = {
      id,
      type: "freeform" as const,
      version: 2,
      rings: Array.from(rings.values()).map((r: PlacedRing) => ({
        row: r.row,
        col: r.col,
        cluster: r.cluster,
        color: (r as any).color ?? "#ffffff",
      })),
      geometry: {
        innerDiameter: innerIDmm,
        wireDiameter: wireMm,
        centerSpacing,
        angleIn,
        angleOut,
      },
      paletteAssignment: assignment,
      metadata: {
        page: "freeform",
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        thumbnail: thumb,
      },
    };

    // persist to workspace index
    const idxRaw = localStorage.getItem("chainmail.projectIndex.v1");
    const idx = idxRaw ? JSON.parse(idxRaw) : [];
    idx.push({
      id,
      tool: "freeform",
      name,
      updatedAt: Date.now(),
      thumbnail: thumb,
    });
    localStorage.setItem("chainmail.projectIndex.v1", JSON.stringify(idx));

    // persist payload
    localStorage.setItem(`chainmail.project:${id}`, JSON.stringify(payload));

    return payload; // ProjectSaveLoadButtons will still download this JSON
  }, [
    rings,
    innerIDmm,
    wireMm,
    centerSpacing,
    angleIn,
    angleOut,
    assignment,
    getRendererCanvas,
  ]);

  const loadFreeformProject = useCallback(
    (data: any) => {
      if (!data || data.type !== "freeform") {
        alert("❌ Not a Freeform project file");
        return;
      }
      if (!Array.isArray(data.rings)) {
        alert("❌ Invalid Freeform project data");
        return;
      }

      const map: RingMap = new Map();
      for (const r of data.rings) {
        if (typeof r.row !== "number" || typeof r.col !== "number") continue;

        map.set(`${r.row}-${r.col}`, {
          row: r.row,
          col: r.col,
          cluster: r.cluster ?? 1,
          color: r.color ?? "#ffffff",
        } as PlacedRing);
      }

      setRings(map);
      setnextClusterId(
        Math.max(1, ...Array.from(map.values()).map((r) => r.cluster ?? 1)) + 1,
      );

      if (data.geometry) {
        setInnerIDmm(data.geometry.innerDiameter ?? innerIDmm);
        setWireMm(data.geometry.wireDiameter ?? wireMm);
        setCenterSpacing(data.geometry.centerSpacing ?? centerSpacing);
        setAngleIn(data.geometry.angleIn ?? angleIn);
        setAngleOut(data.geometry.angleOut ?? angleOut);
      }

      if (data.paletteAssignment) {
        setAssignment(data.paletteAssignment);
        localStorage.setItem(
          "freeform.paletteAssignment",
          JSON.stringify(data.paletteAssignment),
        );
      }
    },
    [innerIDmm, wireMm, centerSpacing, angleIn, angleOut],
  );
  // ====================================================
  // Manual JSON load
  // ====================================================
  const handleFileJSONLoad = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(String(ev.target?.result || "{}"));

          if (typeof data.innerDiameter === "number")
            setInnerIDmm(data.innerDiameter);
          if (typeof data.wireDiameter === "number")
            setWireMm(data.wireDiameter);
          if (typeof data.centerSpacing === "number")
            setCenterSpacing(data.centerSpacing);
          if (typeof data.angleIn === "number") setAngleIn(data.angleIn);
          if (typeof data.angleOut === "number") setAngleOut(data.angleOut);

          const newId = data.id || `file:${file.name}`;
          setActiveRingSetId(newId);
          setAutoFollowTuner(false);
        } catch (err) {
          alert("Could not parse JSON file.");
          console.error(err);
        }
      };

      reader.readAsText(file);
    },
    [],
  );
  



  // ====================================================
  // External view state passed to RingRenderer
  // IMPORTANT: must use SAME floating-origin pipeline as rings3D
  // ====================================================
  const externalViewState = useMemo(() => {
    const worldPanX = panWorldX - logicalOrigin.ox;
    const worldPanY = -(panWorldY - logicalOrigin.oy);
    return { panX: worldPanX, panY: worldPanY, zoom };
  }, [panWorldX, panWorldY, zoom, logicalOrigin.ox, logicalOrigin.oy]);

  const rendererParams = useMemo(
    () => ({
      rows: maxRowSpan,
      cols: maxColSpan,
      innerDiameter: innerIDmm,
      wireDiameter: wireMm,
      ringColor: "#ffffff",
      bgColor: "#020617",
      centerSpacing,
    }),
    [innerIDmm, wireMm, centerSpacing, maxRowSpan, maxColSpan],
  );

const scales3D = useMemo(() => {
  if (!exportScales.length) return [];

  const maxScaleRow = exportScales.reduce(
    (maxRow, s) => Math.max(maxRow, Number.isFinite(s.row) ? s.row : 0),
    0,
  );

  return exportScales.map((s, index) => {
    const row = Number.isFinite(s.row) ? s.row : 0;
    const col = Number.isFinite(s.col) ? s.col : 0;

    const rowClearance = s.rowClearanceZMm ?? 0;
    const planeZ = s.planeZMm ?? 0;
    const stackedZ = planeZ + (maxScaleRow - row) * rowClearance;

    // holeX/holeY = where pivot sits (ring center = scale hole center)
    const holeX = (s.x_mm ?? 0) - logicalOrigin.ox;
    const holeY = (s.y_mm ?? 0) - logicalOrigin.oy;

    // bodyY in world space (origin-shifted), used by RingRenderer for bodyOffsetY
    const bodyY = (s.bodyY_mm ?? s.y_mm ?? 0) - logicalOrigin.oy;

    return {
      key: s.key,
      row,
      col,
      x: holeX,
      y: holeY,
      z: stackedZ + index * 0.001,
      bodyX: holeX,   // bodyX == holeX (scales hang directly below hole)
      bodyY,
      color: normalizeColor6(s.colorHex ?? activeScaleSettings.colorHex ?? activeColorRef.current ?? "#ffffff"),
      holeDiameter: s.holeIdMm,
      width: s.widthMm,
      height: s.heightMm,
      shape: s.shape,
      tiltRad: s.tiltRad,
      planeZMm: stackedZ,
      tipLiftDeg: s.tipLiftDeg,
      rowClearanceZMm: 0,  // stacking already baked into stackedZ above
      dropMm: s.dropMm,
    };
  });
}, [
  exportScales,
  logicalOrigin.ox,
  logicalOrigin.oy,
  activeScaleSettings.colorHex,
  activeScaleSettings.scalePlaneZ,
  activeScaleSettings.scaleTipLiftDeg,
  activeScaleSettings.scaleRowClearanceZ,
  activeScaleSettings.angleInDeg,
  activeScaleSettings.angleOutDeg,
  calibrationVersion,
]);

  // ====================================================
  // RENDER
  // ====================================================
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#020617",
        display: "flex",
        flexDirection: "row",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <DraggablePill id="freeform-toolbar" defaultPosition={{ x: 20, y: 20 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
            width: 76,
            padding: 10,
            paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
            maxHeight: "calc(100vh - 24px - env(safe-area-inset-bottom))",
            overflowY: "auto",
            background: "#0f172a",
            border: "1px solid #0b1020",
            borderRadius: 20,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            userSelect: "none",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <ToolButton
            active={showCompass}
            onClick={() => setShowCompass((v) => !v)}
            title="Navigation Menu"
          >
            🧭
          </ToolButton>

          <ToolButton
            onClick={() => setFinalizeOpen(true)}
            title="Finalize & Export (SKU mapping, numbered maps, true-size print)"
          >
            📦
          </ToolButton>

          <ToolButton
            active={!toolbarCollapsed}
            onClick={() => setToolbarCollapsed((v) => !v)}
            title={toolbarCollapsed ? "Expand tools" : "Collapse tools"}
          >
            {toolbarCollapsed ? "▸" : "▾"}
          </ToolButton>

          <ToolButton
            active={showUtilityPanel}
            onClick={() => setShowUtilityPanel((v) => !v)}
            title={
              showUtilityPanel
                ? "Hide utility panel"
                : "Show utility panel (toolbox, save/load, reset)"
            }
          >
            ⚙️
          </ToolButton>

          {!toolbarCollapsed && (
            <>
              <ToolButton
                active={!eraseMode && selectionMode === "none"}
                onClick={() => {
                  setEraseMode(false);
                  setSelectionMode("none");
                  clearSelectionState();
                  cancelOverlayPickingIfActive();
                }}
                title="Paint rings"
              >
                🎨
              </ToolButton>

              <ToolButton
                active={eraseMode}
                onClick={() => {
                  setEraseMode((v) => !v);

                  clearSelectionState();

                  if (isSelecting) {
                    setIsSelecting(false);
                    selectionRef.current = null;
                    clearInteractionCanvas();
                  }
                }}
                title="Erase rings"
              >
                🧽
              </ToolButton>

              <ToolButton
                active={selectionMode !== "none"}
                onClick={() => {
                  setShapePanelOpen((v) => !v);
                  setPanMode(false);
                  clearSelectionState();
                }}
                title="Shapes"
              >
                <IconSquare />
              </ToolButton>

              <ToolButton
                active={activeLayer === "scales"}
                onClick={() => {
                  setActiveLayer((prev) => {
                    const next = prev === "rings" ? "scales" : "rings";
                    activeLayerRef.current = next;
                    console.log("[Freeform][toggle] activeLayer ->", next);
                    return next;
                  });
                  setPanMode(false);
                  clearSelectionState();
                }}
                title="Toggle Rings/Scales"
              >
                {activeLayer === "rings" ? "R" : "S"}
              </ToolButton>

              <ShapePanel
                open={shapePanelOpen}
                onClose={() => setShapePanelOpen(false)}
                active={selectionMode === "none" ? "square" : selectionMode}
                onPick={(t) => {
                  setSelectionMode((m) => (m === t ? "none" : t));
                  setPanMode(false);
                  clearSelectionState();

                  if (isSelecting) {
                    setIsSelecting(false);
                    selectionRef.current = null;
                    clearInteractionCanvas();
                  }

                  setShapePanelOpen(false);
                }}
              />

              <ToolButton
                active={panMode}
                onClick={() => {
                  setPanMode((v) => !v);
                  setSelectionMode("none");
                  clearSelectionState();

                  if (isSelecting) {
                    setIsSelecting(false);
                    selectionRef.current = null;
                    clearInteractionCanvas();
                  }
                }}
                title="Pan / Drag view"
              >
                ✋
              </ToolButton>
              {/* Image Overlay */}
              <ToolButton
                active={showImageOverlay}
                onClick={() => setShowImageOverlay((v) => !v)}
                title="Image overlay (apply to rings)"
              >
                🖼️
              </ToolButton>

              {/* Clear */}
              <ToolButton onClick={handleClear} title="Clear all">
                🧹
              </ToolButton>
            </>
          )}
        </div>
      </DraggablePill>

      {/* ============================= */}
      {/* ✅ SECONDARY UTILITY PANEL (toolbox + save/load + reset) */}
      {/* ============================= */}
      {showUtilityPanel && (
        <DraggablePill
          id="freeform-utility"
          defaultPosition={{ x: 110, y: 20 }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
              width: 76,
              padding: 10,
              paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
              maxHeight: "calc(100vh - 24px - env(safe-area-inset-bottom))",
              overflowY: "auto",
              background: "rgba(15,23,42,0.96)",
              border: "1px solid #0b1020",
              borderRadius: 20,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              userSelect: "none",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <ToolButton
              active={showControls}
              onClick={() => setShowControls((v) => !v)}
              title="Geometry & JSON controls"
            >
              🧰
            </ToolButton>

            <ProjectSaveLoadButtons
              onSave={saveFreeformProject}
              onLoad={(json) => {
                if (!window.confirm("Load project and replace current work?"))
                  return;
                loadFreeformProject(json);
              }}
            />

            <ToolButton
              onClick={() => {
                if (!window.confirm("Reset UI layout and view settings?"))
                  return;
                resetUI();
              }}
              title="Reset UI (layout + view + tool states)"
            >
              ♻️
            </ToolButton>
            <button
              onClick={() => setShowFreeformStats((v) => !v)}
              title={
                showFreeformStats
                  ? "Hide Freeform Stats"
                  : "Show Freeform Stats"
              }
              style={{
                width: 44, // match your toolbox button size if different
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: showFreeformStats
                  ? "rgba(59,130,246,0.25)"
                  : "rgba(255,255,255,0.06)",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              ✨
            </button>
          </div>
        </DraggablePill>
      )}

      {/* ============================= */}
      {/* ✅ FLOATING COLOR PALETTE (Designer style) */}
      {/* ============================= */}
      <DraggablePill
        id="freeform-palette"
        defaultPosition={{
          x: 20,
          y: (typeof window !== "undefined" ? window.innerHeight : 900) - 260,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "center",
            background: "rgba(17,24,39,0.96)",
            border: "1px solid rgba(0,0,0,0.6)",
            borderRadius: 14,
            padding: 8,
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
            userSelect: "none",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              width: "100%",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              onClick={() => setPaletteManagerOpen((v) => !v)}
              style={{
                width: 30,
                height: 26,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 13,
              }}
              title="Palette manager"
            >
              🎨
            </button>
            <button
              type="button"
              onClick={() => {
                setColorPalette([...DEFAULT_PALETTE]);
                setPaletteManagerOpen(false);
              }}
              style={{
                width: 30,
                height: 26,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 13,
              }}
              title="Reset palette"
            >
              ↺
            </button>
            {/* ✅ Spline toggle button (same row) */}
            <button
              type="button"
              title="Spline"
              onClick={() => setShowSplineTool((v) => !v)}
              style={{
                width: 30,
                height: 26,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: showSplineTool
                  ? "rgba(37,99,235,0.95)"
                  : "rgba(255,255,255,0.06)",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 900,
                userSelect: "none",
              }}
            >
              S
            </button>
          </div>

          {paletteManagerOpen && (
            <div
              style={{
                width: 196,
                marginTop: 6,
                padding: 10,
                borderRadius: 14,
                background: "rgba(2,6,23,0.92)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "grid",
                gap: 8,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc" }}>
                Saved palettes
              </div>
              <select
                value={selectedSavedPalette}
                onChange={(e) => setSelectedSavedPalette(e.target.value)}
                style={{
                  padding: 8,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#f8fafc",
                  fontSize: 12,
                }}
              >
                <option value="">(select)</option>
                {Object.keys(savedColorPalettes)
                  .sort((a, b) => a.localeCompare(b))
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  disabled={
                    !selectedSavedPalette ||
                    !savedColorPalettes[selectedSavedPalette]
                  }
                  onClick={() => {
                    const p = savedColorPalettes[selectedSavedPalette];
                    if (!p) return;
                    setColorPalette([...p]);
                    setPaletteManagerOpen(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.92)",
                    color: "#0b1220",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                    opacity: !selectedSavedPalette ? 0.6 : 1,
                  }}
                >
                  Load
                </button>
                <button
                  type="button"
                  disabled={!selectedSavedPalette}
                  onClick={() => {
                    if (!selectedSavedPalette) return;
                    const next = { ...savedColorPalettes };
                    delete next[selectedSavedPalette];
                    setSavedColorPalettes(next);
                    setSelectedSavedPalette("");
                  }}
                  style={{
                    width: 58,
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "transparent",
                    color: "#f8fafc",
                    cursor: "pointer",
                    fontSize: 12,
                    opacity: !selectedSavedPalette ? 0.6 : 1,
                  }}
                >
                  Del
                </button>
              </div>

              <div
                style={{ height: 1, background: "rgba(255,255,255,0.08)" }}
              />

              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontSize: 12,
                  color: "#f8fafc",
                }}
              >
                Save as
                <input
                  value={paletteName}
                  onChange={(e) => setPaletteName(e.target.value)}
                  placeholder="My palette"
                  style={{
                    padding: 8,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f8fafc",
                    fontSize: 12,
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!paletteName.trim()}
                onClick={() => {
                  const name = paletteName.trim();
                  if (!name) return;
                  setSavedColorPalettes({
                    ...savedColorPalettes,
                    [name]: [...colorPalette],
                  });
                  setSelectedSavedPalette(name);
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.92)",
                  color: "#0b1220",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                  opacity: !paletteName.trim() ? 0.6 : 1,
                }}
              >
                Save current
              </button>
              <div style={{ fontSize: 11, opacity: 0.8, color: "#f8fafc" }}>
                Tip: hold any swatch to edit it.
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              gap: 6,
            }}
          >
            {colorPalette.map((c, idx) => (
              <LongPressColorSwatch
                key={`${idx}-${c}`}
                color={c}
                active={normalizeColor6(activeColor) === normalizeColor6(c)}
                onClick={() => {
                  setActiveColor(normalizeColor6(c));
                  setEraseMode(false);
                }}
                onLongPress={() => openPickerForIndex(idx)}
              />
            ))}
          </div>
        </div>
      </DraggablePill>

      {pickerState && (
        <PaletteColorPickerModal
          state={pickerState}
          onChange={setPickerState}
          onCancel={() => setPickerState(null)}
          onApply={applyPicker}
        />
      )}
      {/* ==============================
    📏 Floating Stats Panel (Freeform)
   ============================== */}

      {!showFreeformStats && (
        <button
          onClick={() => setShowFreeformStats(true)}
          title="Show stats"
          style={{
            position: "absolute",
            right: 20,
            bottom: 20,
            width: 44,
            height: 44,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(17,24,39,0.92)",
            color: "#e5e7eb",
            cursor: "pointer",
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          }}
        >
          ✨
        </button>
      )}

      {showFreeformStats && (
        <DraggablePill
          id="freeform-stats"
          defaultPosition={{
            x: (typeof window !== "undefined" ? window.innerWidth : 1200) - 360,
            y: (typeof window !== "undefined" ? window.innerHeight : 900) - 320,
          }}
        >
          <div
            style={{
              minWidth: 260,
              maxWidth: 340,
              background: "rgba(17,24,39,0.97)",
              border: "1px solid rgba(0,0,0,.6)",
              borderRadius: 14,
              padding: 12,
              color: "#e5e7eb",
              fontSize: 13,
              boxShadow: "0 12px 40px rgba(0,0,0,.45)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: 14 }}>📏 Freeform Stats</strong>
              </div>
              <button
                onClick={() => setShowFreeformStats(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 16,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Cursor */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>Cursor (px)</span>
                <span
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {cursorPx
                    ? `${Math.round(cursorPx.x)}, ${Math.round(cursorPx.y)}`
                    : "—"}
                </span>
              </div>
            </div>

            {/* Ring + geometry summary */}
            <div style={{ marginBottom: 10, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>Rings</span>
                <span style={{ fontWeight: 800 }}>{ringStats?.total ?? 0}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>Colors used</span>
                <span style={{ fontWeight: 800 }}>
                  {ringStats?.uniqueColors ?? 0}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>Inner ID</span>
                <span
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {typeof innerIDmm === "number"
                    ? `${formatNum(innerIDmm, 2)} mm`
                    : "—"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>Wire</span>
                <span
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {typeof wireMm === "number"
                    ? `${formatNum(wireMm, 2)} mm`
                    : "—"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#9ca3af" }}>Center spacing</span>
                <span
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {typeof centerSpacing === "number"
                    ? `${formatNum(centerSpacing, 2)} mm`
                    : "—"}
                </span>
              </div>
            </div>

            {/* Dimensions */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                Design bounds
              </div>

              {!dimsNow ? (
                <div style={{ color: "#9ca3af" }}>—</div>
              ) : dimsNow.kind === "square" ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#9ca3af" }}>Width</span>
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {`${formatNum(dimsNow.widthMm, 1)} mm`}
                    </span>
                  </div>

                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#9ca3af" }}>Height</span>
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {`${formatNum(dimsNow.heightMm, 1)} mm`}
                    </span>
                  </div>

                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#9ca3af" }}>Width (rings)</span>
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {dimsNow.widthRings}
                    </span>
                  </div>

                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#9ca3af" }}>Height (rings)</span>
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {dimsNow.heightRings}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#9ca3af" }}>Radius</span>
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {`${formatNum(dimsNow.radiusMm, 1)} mm`}
                    </span>
                  </div>

                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#9ca3af" }}>Diameter</span>
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {`${formatNum(dimsNow.diameterMm, 1)} mm`}
                    </span>
                  </div>

                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#9ca3af" }}>Radius (rings)</span>
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {formatNum(dimsNow.radiusRings, 1)}
                    </span>
                  </div>

                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#9ca3af" }}>Diameter (rings)</span>
                    <span
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      {formatNum(dimsNow.diameterRings, 1)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Color breakdown */}
            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>By color</div>

              {!ringStats?.byColor?.length ? (
                <div style={{ color: "#9ca3af" }}>No rings placed.</div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {ringStats.byColor
                    .slice(0, 12)
                    .map(([hex, count]: [string, number]) => (
                      <div
                        key={hex}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              background: hex,
                              border: "1px solid rgba(0,0,0,.8)",
                            }}
                          />
                          <span
                            style={{
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            }}
                          >
                            {hex}
                          </span>
                        </span>
                        <span style={{ fontWeight: 800 }}>{count}</span>
                      </div>
                    ))}
                  {ringStats.byColor.length > 12 && (
                    <div style={{ color: "#9ca3af", fontSize: 12 }}>
                      + {ringStats.byColor.length - 12} more…
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DraggablePill>
      )}
      {/* ============================= */}
      {/* ✅ IMAGE OVERLAY PANEL (Freeform) */}
      {/* ============================= */}
      {showImageOverlay && (
        <DraggablePill
          id="freeform-image-overlay"
          defaultPosition={{ x: 120, y: 120 }}
        >
          <div
            style={{
              width: 320,
              background: "rgba(17,24,39,0.97)",
              border: "1px solid rgba(0,0,0,0.6)",
              borderRadius: 14,
              padding: 12,
              color: "#e5e7eb",
              fontSize: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,.45)",
              display: "grid",
              gap: 10,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong style={{ fontSize: 13 }}>🖼️ Image Overlay</strong>
              <button
                onClick={() => setShowImageOverlay(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 16,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* ✅ Scope selector + pick selection */}
            <div
              style={{
                display: "grid",
                gap: 8,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(2,6,23,0.75)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12 }}>
                Transfer Scope
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="overlayScope"
                    checked={overlayScope === "all"}
                    onChange={() => setOverlayScope("all")}
                  />
                  <span>All rings</span>
                </label>

                <label
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="overlayScope"
                    checked={overlayScope === "selection"}
                    onChange={() => setOverlayScope("selection")}
                  />
                  <span>Selection only</span>
                </label>
              </div>

              {overlayScope === "selection" && (
                <div style={{ display: "grid", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => {
                      overlayPickingRef.current = true;
                      setOverlayMaskKeys(new Set());
                      setSelectedKeys(new Set());
                      setEraseMode(false);
                      setPanMode(false);
                      // ensure a selection tool is active so user can drag right away
                      setSelectionMode((m) => (m === "none" ? "square" : m));
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.92)",
                      color: "#0b1220",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                    title="Click, then drag a rectangle/circle selection on the canvas to define the transfer area."
                  >
                    🎯 Pick selection area (then drag on canvas)
                  </button>

                  <div style={{ fontSize: 11, opacity: 0.85 }}>
                    Picked cells: <b>{overlayMaskKeys.size}</b>{" "}
                    {overlayMaskKeys.size === 0 ? "(none yet)" : ""}
                    {overlayPickingRef.current ? " • Picking…" : ""}
                  </div>
                  {overlayMaskKeys.size === 0 && (
                    <div style={{ fontSize: 11, color: "#fbbf24" }}>
                      Tip: click “Pick selection area”, then drag a selection.
                      Press <b>Esc</b> to cancel.
                    </div>
                  )}
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const dataUrl = String(ev.target?.result || "");
                  setOverlay((prev: any) => ({
                    ...(prev ?? {}),
                    dataUrl,
                    scale: prev?.scale ?? 1,
                    opacity: prev?.opacity ?? 0.8,
                    offsetX: prev?.offsetX ?? 0,
                    offsetY: prev?.offsetY ?? 0,
                    tile: prev?.tile ?? true,
                    // optional crop defaults to full image
                    cropU0: prev?.cropU0 ?? 0,
                    cropV0: prev?.cropV0 ?? 0,
                    cropU1: prev?.cropU1 ?? 1,
                    cropV1: prev?.cropV1 ?? 1,
                  }));
                };
                reader.readAsDataURL(file);
              }}
            />

            <label style={{ display: "grid", gap: 4 }}>
              Scale
              <input
                type="range"
                min={0.2}
                max={6}
                step={0.01}
                value={Number((overlay as any)?.scale ?? 1)}
                onChange={(e) =>
                  setOverlay((p: any) => ({
                    ...(p ?? {}),
                    scale: Number(e.target.value),
                  }))
                }
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              Opacity
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={Number((overlay as any)?.opacity ?? 0.8)}
                onChange={(e) =>
                  setOverlay((p: any) => ({
                    ...(p ?? {}),
                    opacity: Number(e.target.value),
                  }))
                }
              />
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <label style={{ display: "grid", gap: 4 }}>
                Offset X
                <input
                  type="number"
                  value={Number((overlay as any)?.offsetX ?? 0)}
                  onChange={(e) =>
                    setOverlay((p: any) => ({
                      ...(p ?? {}),
                      offsetX: Number(e.target.value),
                    }))
                  }
                  style={{
                    padding: 6,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f8fafc",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Offset Y
                <input
                  type="number"
                  value={Number((overlay as any)?.offsetY ?? 0)}
                  onChange={(e) =>
                    setOverlay((p: any) => ({
                      ...(p ?? {}),
                      offsetY: Number(e.target.value),
                    }))
                  }
                  style={{
                    padding: 6,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f8fafc",
                  }}
                />
              </label>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!(overlay as any)?.tile}
                onChange={(e) =>
                  setOverlay((p: any) => ({
                    ...(p ?? {}),
                    tile: e.target.checked,
                  }))
                }
              />
              <span>Tile (repeat)</span>
            </label>

            <div style={{ fontSize: 11, opacity: 0.85 }}>
              Crop (normalized 0..1). These values enable your “window
              selection” pipeline. You can wire a drag-rect UI later to set
              these.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <label style={{ display: "grid", gap: 4 }}>
                U0
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={Number((overlay as any)?.cropU0 ?? 0)}
                  onChange={(e) =>
                    setOverlay((p: any) => ({
                      ...(p ?? {}),
                      cropU0: Number(e.target.value),
                    }))
                  }
                  style={{
                    padding: 6,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f8fafc",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                V0
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={Number((overlay as any)?.cropV0 ?? 0)}
                  onChange={(e) =>
                    setOverlay((p: any) => ({
                      ...(p ?? {}),
                      cropV0: Number(e.target.value),
                    }))
                  }
                  style={{
                    padding: 6,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f8fafc",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                U1
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={Number((overlay as any)?.cropU1 ?? 1)}
                  onChange={(e) =>
                    setOverlay((p: any) => ({
                      ...(p ?? {}),
                      cropU1: Number(e.target.value),
                    }))
                  }
                  style={{
                    padding: 6,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f8fafc",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                V1
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={Number((overlay as any)?.cropV1 ?? 1)}
                  onChange={(e) =>
                    setOverlay((p: any) => ({
                      ...(p ?? {}),
                      cropV1: Number(e.target.value),
                    }))
                  }
                  style={{
                    padding: 6,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f8fafc",
                  }}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={transferOverlayToRings}
              disabled={
                !(
                  (overlay as any)?.dataUrl ??
                  (overlay as any)?.src ??
                  (overlay as any)?.url
                ) ||
                (overlayScope === "selection" && overlayMaskKeys.size === 0)
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "#22c55e",
                color: "#052e16",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 900,
                opacity:
                  !(
                    (overlay as any)?.dataUrl ??
                    (overlay as any)?.src ??
                    (overlay as any)?.url
                  ) ||
                  (overlayScope === "selection" && overlayMaskKeys.size === 0)
                    ? 0.6
                    : 1,
              }}
              title="Apply overlay colors to placed rings"
            >
              Transfer to Rings
            </button>
          </div>
        </DraggablePill>
      )}

      {finalizeOpen && (
        <FinalizeAndExportPanel
          rings={exportRings}
          scales={exportScales}
          scaleSettings={activeScaleSettings}
          initialAssignment={assignment}
          onAssignmentChange={(p) => setAssignment(p)}
          getRendererCanvas={getRendererCanvas}
          onClose={() => setFinalizeOpen(false)}
          mapMode="freeform"
        />
      )}

      {/* ============================= */}
      {/* ✅ SUBMENU / NAVIGATION (Designer style) */}
      {/* ============================= */}
      {showCompass && (
        <DraggableCompassNav
          onNavigate={() => {
            setShowCompass(false);
          }}
        />
      )}

      {/* MAIN WORK AREA */}
      <div
        ref={wrapRef}
        style={{
          flex: 1,
          position: "relative",
          background: "#020617",
        }}
      >
        {/* 3D VIEW */}
        <div style={{ position: "absolute", inset: 0 }}>
          <RingRenderer
            ref={ringRendererRef}
            rings={rings3D}
            params={rendererParams}
            paint={paintMap}
            setPaint={() => {}}
            activeColor={renderActiveColor}
            initialPaintMode={false}
            initialEraseMode={false}
            initialRotationLocked={true}
            externalViewState={externalViewState}
            scales3D={scales3D}
            showScales={scales3D.length > 0}
            scalesBehindRings={activeScaleSettings.behindRings}
          />
        </div>

        {/* INTERACTION CANVAS (also draws selection overlay) */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            cursor:
              selectionMode !== "none"
                ? "crosshair"
                : panMode
                  ? "grab"
                  : eraseMode
                    ? "not-allowed"
                    : "crosshair",
            touchAction: "none",
            background: "transparent",
            zIndex: 3,
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onMouseLeave={() => {
            // If pointer leaves while selecting, finalize safely
            if (isSelecting && selectionMode !== "none") {
              const sel = selectionRef.current;
              setIsSelecting(false);
              if (sel) {
                if (overlayPickingRef.current) {
                  const keys = computeSelectionKeys(sel, selectionMode);
                  setOverlayMaskKeys(keys);
                  setOverlayScope("selection");
                  setSelectedKeys(keys);
                  overlayPickingRef.current = false;
                } else {
                  finalizeSelection();
                  applySelectionToActiveLayer(sel, selectionMode);
                }
              }
              selectionRef.current = null;
              clearInteractionCanvas();
            }
          }}
        />

        {/* HIT CIRCLES CANVAS */}
        <canvas
          ref={hitCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "transparent",
            zIndex: 2,
          }}
        />

        {/* DEBUG CLICK MARKERS (ONLY WHEN DIAGNOSTICS ON, and circles visible) */}
        {showDiagnostics &&
          !hideCircles &&
          debugClicks.map((marker) => {
            const { wx, wy } = logicalToWorld(marker.lx, marker.ly);
            const { sx, sy } = worldToScreen(wx, wy);

            return (
              <div
                key={marker.id}
                style={{
                  position: "absolute",
                  left: sx - 10,
                  top: sy - 10,
                  width: 20,
                  height: 20,
                  backgroundColor: "rgba(0,255,0,0.85)",
                  color: "black",
                  fontSize: "14px",
                  fontWeight: "bold",
                  borderRadius: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  zIndex: 4,
                }}
              >
                {marker.id}
              </div>
            );
          })}
        {/* ==================================================== */}
        {/* SPLINE TOOL (MOVEABLE PANEL) */}
        {/* IMPORTANT: Only one SplineSandbox instance is rendered. */}
        {/* - This is draggable (panel is moveable). */}
        {/* - It is NOT duplicated in the right control panel. */}
        {/* ==================================================== */}
        {showSplineTool && (
          <DraggablePill
            id="freeform-spline"
            defaultPosition={{ x: 160, y: 120 }}
          >
            <div
              style={{
                display: "inline-block",
                width: "max-content",
                maxWidth: "calc(100vw - 24px)",
                background: "rgba(17,24,39,0.97)",
                border: "1px solid rgba(0,0,0,0.6)",
                borderRadius: 14,
                boxShadow: "0 12px 40px rgba(0,0,0,.45)",
                overflow: "hidden",
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <SplineSandbox
                key={splineResetKey}
                embedded
                showPanel={true}
                mode="freeform"
                currentColorHex={normalizeColor6(activeColor)}
                onRequestClose={() => setShowSplineTool(false)}
                onApplyClosedSpline={({ polygon }) => {
                  applyClosedSplineAsRings(
                    polygon,
                    normalizeColor6(activeColor),
                  );
                  setSplineResetKey((k) => k + 1);
                }}
              />
            </div>
          </DraggablePill>
        )}

        {/* HIT CIRCLES CANVAS */}
        <canvas
          ref={hitCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "transparent",
            zIndex: 2,
          }}
        />

        {/* DEBUG CLICK MARKERS (ONLY WHEN DIAGNOSTICS ON, and circles visible) */}
        {showDiagnostics &&
          !hideCircles &&
          debugClicks.map((marker) => {
            const { wx, wy } = logicalToWorld(marker.lx, marker.ly);
            const { sx, sy } = worldToScreen(wx, wy);

            return (
              <div
                key={marker.id}
                style={{
                  position: "absolute",
                  left: sx - 10,
                  top: sy - 10,
                  width: 20,
                  height: 20,
                  backgroundColor: "rgba(0,255,0,0.85)",
                  color: "black",
                  fontSize: "14px",
                  fontWeight: "bold",
                  borderRadius: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  zIndex: 4,
                }}
              >
                {marker.id}
              </div>
            );
          })}

        {/* RIGHT CONTROL PANEL */}
        {showControls && (
          <div
            style={{
              position: "fixed",
              right: 16,
              top: 16,
              width: 340,
              background: "#0f172a",
              color: "#e5e7eb",
              borderRadius: 12,
              padding: 12,
              border: "1px solid rgba(148,163,184,0.35)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              zIndex: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: "80vh",
              overflowY: "auto",
              fontSize: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14 }}>
              Freeform Geometry (Tuner-linked)
            </h3>

            <p style={{ margin: 0, opacity: 0.8, lineHeight: 1.3 }}>
              Uses the same <b>center spacing</b> and hex grid as the Weave
              Tuner. Vertical spacing is <code>center × 0.866</code> and odd
              rows are shifted by <code>center / 2</code>.
            </p>

            <SliderRow
              label="Center Spacing (mm)"
              value={centerSpacing}
              setValue={(v) => {
                setCenterSpacing(v);
                setAutoFollowTuner(false);
              }}
              min={2}
              max={25}
              step={0.1}
              unit="mm"
            />

            {/* CIRCLE TUNING PANEL */}
            <div
              style={{
                marginTop: 4,
                padding: 8,
                borderRadius: 12,
                background: "rgba(15,23,42,0.95)",
                border: "1px solid rgba(148,163,184,0.25)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 11,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={hideCircles}
                  onChange={(e) => setHideCircles(e.target.checked)}
                />
                <span>Hide circles (still clickable)</span>
              </label>

              <div style={{ fontWeight: 700, fontSize: 12, textAlign: "left" }}>
                Circles (on placed rings only)
              </div>

              <SliderRow
                label="Circle Offset X (mm)"
                value={circleOffsetX}
                setValue={(v) => setCircleOffsetX(v)}
                min={-50}
                max={50}
                step={0.1}
                unit="mm"
              />

              <SliderRow
                label="Circle Offset Y (mm)"
                value={circleOffsetY}
                setValue={(v) => setCircleOffsetY(v)}
                min={-50}
                max={50}
                step={0.1}
                unit="mm"
              />

              <SliderRow
                label="Circle Scale"
                value={circleScale}
                setValue={(v) => setCircleScale(v)}
                min={0.2}
                max={3}
                step={0.01}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={smallBtn}
                  onClick={() => {
                    setCircleOffsetX(0);
                    setCircleOffsetY(0);
                    setCircleScale(1);
                  }}
                  title="Reset circle offset/scale"
                >
                  Reset circles
                </button>
                <button
                  type="button"
                  style={smallBtnBlue}
                  onClick={() => {
                    setHideCircles((v) => !v);
                  }}
                  title="Toggle circle visibility"
                >
                  {hideCircles ? "Show circles" : "Hide circles"}
                </button>
              </div>
            </div>

            {/* RING SETS (Tuner-linked) */}
            <div
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 12,
                background: "rgba(15,23,42,0.95)",
                border: "1px solid rgba(148,163,184,0.25)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12 }}>
                Ring Sets (from Tuner)
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={autoFollowTuner}
                  onChange={(e) => setAutoFollowTuner(e.target.checked)}
                />
                <span>Auto-follow latest tuner set</span>
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={smallBtn}
                  onClick={reloadRingSets}
                  title="Reload ring sets from localStorage"
                >
                  Reload
                </button>

                <label
                  style={{
                    ...smallBtn,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                  title="Load a ring set JSON file from disk"
                >
                  Load JSON…
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleFileJSONLoad}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              <select
                value={activeRingSetId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  setActiveRingSetId(id);
                  setAutoFollowTuner(false);
                  const rs = ringSets.find((r) => r.id === id);
                  if (rs) applyRingSet(rs);
                }}
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#f8fafc",
                  fontSize: 12,
                }}
              >
                <option value="">(select ring set)</option>
                {ringSets.map((rs) => (
                  <option key={rs.id} value={rs.id}>
                    {rs.aspectRatio ? `${rs.aspectRatio} • ` : ""}
                    {rs.status ? `${rs.status} • ` : ""}
                    {rs.savedAt ? new Date(rs.savedAt).toLocaleString() : rs.id}
                  </option>
                ))}
              </select>

              <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.35 }}>
                Current:{" "}
                <b>
                  ID {formatNum(innerIDmm, 2)}mm • Wire {formatNum(wireMm, 2)}mm
                  • Center {formatNum(centerSpacing, 2)}mm
                </b>
                <br />
                Aspect ratio: <b>{formatNum(aspectRatio, 2)}</b>
              </div>
            </div>

            {/* VIEW CONTROLS */}
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 12 }}>View</div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, opacity: 0.9 }}>
                  Zoom: <b>{formatNum(zoom, 2)}</b> • Pan:{" "}
                  <b>
                    {formatNum(panWorldX, 1)}, {formatNum(panWorldY, 1)}
                  </b>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    style={smallBtn}
                    onClick={() => {
                      setZoom(1);
                      setPanWorldX(0);
                      setPanWorldY(0);
                    }}
                    title="Reset view"
                  >
                    Reset view
                  </button>

                  <button
                    type="button"
                    style={smallBtnBlue}
                    onClick={() => {
                      // gentle zoom-in to help visibility
                      setZoom((z) => Math.min(MAX_ZOOM, z * 1.2));
                    }}
                    title="Zoom in"
                  >
                    Zoom +
                  </button>

                  <button
                    type="button"
                    style={smallBtnBlue}
                    onClick={() => {
                      setZoom((z) => Math.max(MIN_ZOOM, z / 1.2));
                    }}
                    title="Zoom out"
                  >
                    Zoom –
                  </button>
                </div>
              </div>
            </div>
            {/* SCALE TUNERS (from Tuner) */}
            <div
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 12,
                background: "rgba(15,23,42,0.95)",
                border: "1px solid rgba(148,163,184,0.25)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12 }}>
                Scale Tuners (from Tuner)
              </div>

              <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.35 }}>
                These values drive Freeform scale geometry locally without
                changing Freeform placement locking.
              </div>

              <SliderRow
                label="Scale Hole ID (mm)"
                value={activeScaleSettings.holeIdMm}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    holeIdMm: Math.max(1, Math.min(20, v)),
                  }));
                }}
                min={1}
                max={20}
                step={0.1}
                unit="mm"
              />

              <SliderRow
                label="Scale Width (mm)"
                value={activeScaleSettings.widthMm}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    widthMm: v,
                  }));
                }}
                min={4}
                max={30}
                step={0.1}
                unit="mm"
              />

              <SliderRow
                label="Scale Height (mm)"
                value={activeScaleSettings.heightMm}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    heightMm: v,
                  }));
                }}
                min={6}
                max={45}
                step={0.1}
                unit="mm"
              />

              <SliderRow
                label="Scale Drop (mm)"
                value={activeScaleSettings.dropMm}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    dropMm: v,
                  }));
                }}
                min={-10}
                max={20}
                step={0.05}
                unit="mm"
              />

              <SliderRow
                label="Angle In (°)"
                value={activeScaleSettings.angleInDeg}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    angleInDeg: v,
                  }));
                }}
                min={-45}
                max={45}
                step={0.5}
                unit="°"
              />

              <SliderRow
                label="Angle Out (°)"
                value={activeScaleSettings.angleOutDeg}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    angleOutDeg: v,
                  }));
                }}
                min={-45}
                max={45}
                step={0.5}
                unit="°"
              />

              <SliderRow
                label="Scale Plane Z (mm)"
                value={activeScaleSettings.scalePlaneZ}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    scalePlaneZ: v,
                  }));
                }}
                min={-30}
                max={30}
                step={0.1}
                unit="mm"
              />

              <SliderRow
                label="Scale Tip Lift (°)"
                value={activeScaleSettings.scaleTipLiftDeg}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    scaleTipLiftDeg: v,
                  }));
                }}
                min={-10}
                max={70}
                step={1}
                unit="°"
              />

              <SliderRow
                label="Scale Row Clearance Z (mm)"
                value={activeScaleSettings.scaleRowClearanceZ}
                setValue={(v) => {
                  setAutoFollowTuner(false);
                  setScaleSettingsOverride((prev) => ({
                    ...prev,
                    scaleRowClearanceZ: v,
                  }));
                }}
                min={0}
                max={3}
                step={0.01}
                unit="mm"
              />
            </div>
            {/* DIAGNOSTICS */}
            {showDiagnostics && (
              <div
                style={{
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 12,
                  background: "rgba(2,6,23,0.85)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 12 }}>Diagnostics</div>

                <div style={{ fontSize: 11, opacity: 0.85 }}>
                  Rings: <b>{rings.size}</b> • Selected:{" "}
                  <b>{lastSelectionCount}</b>
                </div>

                <textarea
                  value={diagLog}
                  readOnly
                  placeholder="Click rings while diagnostics is on to append log lines…"
                  style={{
                    width: "100%",
                    minHeight: 120,
                    resize: "vertical",
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f8fafc",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 11,
                  }}
                />
                <button
                  type="button"
                  style={smallBtn}
                  onClick={() => setDiagLog("")}
                  title="Clear diagnostics log"
                >
                  Clear log
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeformChainmail2D;
