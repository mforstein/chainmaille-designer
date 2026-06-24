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
import { HIDE_STORE_PURCHASE_UI } from "../lib/native";
import * as THREE from "three";
import SplineSandbox from "../splineSandbox/SplineSandbox";
import RingRenderer from "../components/RingRenderer";
import type { OverlayState } from "../components/ImageOverlayPanel";
import PanArrows from "../components/PanArrows";
import ValueStepper from "../components/ValueStepper";
import OverlayPreview from "../components/OverlayPreview";
import FinalizeAndExportPanel from "../components/FinalizeAndExportPanel";
import ProjectSaveLoadButtons from "../components/ProjectSaveLoadButtons";
import { ProjectLibraryPanel, type LoadMode } from "../components/ProjectLibraryPanel";
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
// V2 (branch v2-development): per-element shape/size brush. First wired slice is
// per-cell SCALE SHAPE — each painted scale remembers the shape it was painted
// with, so one design can mix shapes. Absent meta = global activeScaleSettings.
import {
  type ScaleMetaMap,
  type ScaleGeom,
  resolveScaleShape,
  resolveScaleGeom,
} from "../v2/elementBrush";

import { DraggablePill, DraggableCompassNav, resetAllPills } from "../App";
import type { ExportRing, PaletteAssignment } from "../types/project";
import { IconCircle, IconSquare, IconHamburger, IconSpline, IconEraser, IconUndo, IconRedo, IconMirror, IconScale } from "../components/icons/ToolIcons";
import { ToolBtn } from "../components/ui/ToolBtn";
import ShapePanel, { ShapeTool as ShapeToolId } from "../components/ShapePanel";
import { computeShapeCells } from "../utils/shapeFill";
import { useAuth, tierAtLeast } from "../auth/AuthContext";
import defaultFreeformDesign from "../data/defaultFreeformDesign";
import SupplierColorPalette from "../components/SupplierColorPalette";
import AutoCalibrateButton from "../components/AutoCalibrateButton";
// SupplierColorRefreshButton + FreeformCostPanel imports removed 2026-06-01
// (Refresh-Colors button and Cost Estimator panel both retired from Freeform UI).
import CustomShapeEditor from "../components/CustomShapeEditor";
import {
  type CustomScaleShape,
  type BuiltinOverrides,
  type BuiltinScaleShape,
  loadCustomShapes,
  saveCustomShapes,
  loadBuiltinOverrides,
  saveBuiltinOverrides,
  loadDefaultScaleShape,
  saveDefaultScaleShape,
  loadHiddenBuiltinShapeIds,
  saveHiddenBuiltinShapeIds,
  notifyCustomShapesChanged,
  CUSTOM_SHAPES_EVENT,
  polygonToPath2D,
} from "../lib/customScaleShapes";
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
// Note: legacy no-op stub exports (commitRings/handleUndo/handleRedo/
// lock2dView/toggleLock/updateHistory/applyHistory/pushHistory) were
// removed here on 2026-05-30. They blocked Vite's React Fast Refresh
// because non-component exports in a component file disable HMR.
// Verified no external imports referenced them (only locally-scoped
// symbols of the same names exist in App.tsx/ErinPattern2D.tsx).

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
const AUTOSAVE_KEY = "freeform.autosave.v1";

// Safe localStorage wrappers — Safari private mode and quota-exceeded both
// throw on setItem/removeItem; an unwrapped throw inside a React event handler
// or effect kills the app. These no-op on failure.
function safeLSSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — ignore */
  }
}
function safeLSRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

type SavedColorPalettes = Record<string, string[]>;

// Available scale shapes for the toolbar picker. The shape string MUST match
// what makeScaleShapeRR / drawScaleFromExport / ScaleRenderItem.shape expect.
// "teardrop" was retired as a selectable shape 2026-06-01 (per Erin) — it
// stays as a (string & {}) widening below so legacy saves still load, but
// the union no longer offers it. Emojis are picked to roughly suggest the
// silhouette.
type ScaleShapeName = "leaf" | "round" | "kite";
const SCALE_SHAPE_OPTIONS: Array<{
  shape: ScaleShapeName;
  emoji: string;
  label: string;
}> = [
  // Only the Standard scale (internally "leaf" — elongated, pointed both
  // ends, matching the physical Standard scale silhouette) is exposed to the
  // user. Other built-in shapes remain in the type system / renderer
  // fallbacks so older saves keep loading, but they are not selectable from
  // the UI.
  { shape: "leaf", emoji: "💧", label: "Standard" },
];
const SCALE_SHAPE_EMOJI: Record<ScaleShapeName, string> = {
  leaf: "💧",
  round: "💧",
  kite: "💧",
};

const SCALE_MENU_SELECTED_KEY = "freeform.scaleMenu.selectedId.v1";

function hex2(n: number) {
  return n.toString(16).padStart(2, "0");
}

// Normalize anything we accept into #rrggbb (RingRenderer/Three-safe)
function normalizeColor6(hex: string): string {
  const p = parseHexColor(hex);
  return p?.rgb ?? "#ffffff"; // always #rrggbb
}

// Returns a display-safe color: near-white (#fff, lum > 0.88) → light gray so it's
// visible on the white canvas background, matching the existing ring visibility rule.
function visibleColor(hex: string): string {
  const h = hex.toLowerCase();
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 0.88 ? "#d4d4d4" : hex;
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

function formatSavedAt(ts?: number): string {
  if (!ts) return "your last session";
  const diff = Date.now() - ts;
  if (diff < 90_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} minutes ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hours ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const clear = () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    // Capture the pointer so the matching pointerup/move are always delivered
    // here even if the finger drifts off the swatch — on a touch screen a tap
    // never lands pixel-perfect, and without capture the up-event missed the
    // swatch and the colour never selected.
    try {
      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    } catch {}
    longPressedRef.current = false;
    movedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    clear();
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onLongPress();
    }, 500);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = startRef.current;
    if (!s) return;
    // Tolerate small jitter; a real drag past the threshold cancels the
    // long-press (so a slip doesn't open the editor) but still counts as a tap.
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) {
      movedRef.current = true;
      clear();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    const wasLong = longPressedRef.current;
    clear();
    startRef.current = null;
    if (!wasLong) onClick();
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    e.stopPropagation();
    clear();
    startRef.current = null;
  };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        minWidth: 40,
        minHeight: 40,
        borderRadius: 8,
        border: active ? "3px solid #f9fafb" : "1px solid rgba(15,23,42,0.9)",
        boxShadow: active ? "0 0 0 2px rgba(59,130,246,0.6)" : "none",
        background: color,
        cursor: "pointer",
        padding: 0,
        touchAction: "none",
      }}
      title={active ? "Active color" : "Tap: select • Hold: edit"}
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
// User-applied slider overrides on top of the base Tuner snapshot. Persisted
// so that sliders the user moves stay applied across reloads/restarts even
// when no rings have been placed yet (the broader autosave only fires once a
// design exists).
const SCALE_SETTINGS_OVERRIDE_KEY = "freeform.scaleSettingsOverride.v1";
const DEG = Math.PI / 180;

// ── Mixed-size interference detection ───────────────────────────────────────
// Every ring only weaves inside its own spacing window (same bounds the Tuner
// uses): below TIGHT × OD it overlaps (too big for the gap), above LOOSE × ID it
// can't reach its neighbours (too small for the gap). In a mixed design all rings
// share ONE lattice spacing, so a ring whose size puts that shared spacing
// outside its window interferes — e.g. a small ring dropped into a lattice spaced
// for a larger ring (spacing > its LOOSE × ID). We only flag such a ring when it
// actually sits next to a DIFFERENT-size neighbour, so a uniform same-size design
// is never flagged here (single-size tightness is the Tuner's job).
const OVERLAP_TIGHT_FACTOR = 0.6;      // spacing < × OD → ring too big (overlap)
const OVERLAP_LOOSE_ID_FACTOR = 0.93;  // spacing > × ID → ring too small (no reach)
const SAME_SIZE_EPS_MM = 0.05;         // outer radii within this are "the same size"
const OVERLAP_TINT = "#ff3b30";

// Includes "custom:<uuid>" entries that resolve to user-defined polygons.
// The (string & {}) widening also covers legacy "teardrop" strings from
// pre-2026-06-01 saves — those are coerced to "leaf" at the rendering layer.
type ScaleShape = "leaf" | "round" | "kite" | (string & {});
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
  // Optional per-scale image patch (data URL). When present, RingRenderer
  // uses it as the scale material's texture map so the image is painted
  // onto the scale outline instead of just a flat colour.
  imagePatchUrl?: string | null;
};

function normalizeFreeformScaleSettings(src: Record<string, any>): FreeformScaleSettings {
  const next: FreeformScaleSettings = {
    enabled: true,
    behindRings: false,
    holeIdMm: 6.35,        // 1/4 inch — matches Tuner default scaleHoleId
    widthMm: 12.5,         // matches Tuner default scaleWidth
    heightMm: 23.5,        // matches Tuner default scaleHeight
    shape: "leaf",         // Standard symmetric almond/pointed-oval (scale.jpg)
    dropMm: 11.0,          // matches Tuner default scaleDrop
    colorHex: "#4dd0e1",
    onEveryCell: true,
    lockScaleHolesToRingCenters: true,
    centerSpacingMm: 19.6, // matches Tuner default scaleCenterSpacing
    gridOffsetXmm: 0,
    gridOffsetYmm: 0,
    holeOffsetYMm: -6.2,   // matches Tuner default scaleHoleOffsetY
    weaveMode: "interlocked",
    // Scale angles default LESS than ring angles (25° / -25°). Matches Tuner.
    angleInDeg: 9,
    angleOutDeg: -9,
    scalePlaneZ: 0,        // matches Tuner default scalePlaneZ
    scaleTipLiftDeg: 14,   // matches Tuner default scaleTipLiftDeg
    scaleRowClearanceZ: 1.2, // matches Tuner default scaleRowClearanceZ
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
  const { tier } = useAuth();
  const isStudioTier = tierAtLeast(tier, "studio");
  const isPreviewOnly = !isStudioTier;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null); // interaction + selection overlay
  const hitCanvasRef = useRef<HTMLCanvasElement | null>(null); // overlay circles
  const ringRendererRef = useRef<any>(null);

  // Finalize & Export (must be inside the component)
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Cost Estimator removed 2026-06-01 — both the toolbar button and the
  // panel render are gone. Old hidden-feature flag and state retired.

  // Canvas background color — persisted across sessions
  const [canvasBg, setCanvasBg] = useState<string>(() => {
    return localStorage.getItem("freeform.canvasBg") ?? "#020617";
  });
  const updateCanvasBg = (color: string) => {
    setCanvasBg(color);
    safeLSSet("freeform.canvasBg", color);
  };

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
  const [rings, setRings] = useState<RingMap>(() => {
    // Crafter preview: load default design when no studio access
    if (!tierAtLeast(tier, "studio")) {
      const map: RingMap = new Map();
      for (const r of defaultFreeformDesign.rings) {
        map.set(`${r.row}-${r.col}`, { row: r.row, col: r.col, cluster: r.cluster, color: r.color } as PlacedRing);
      }
      return map;
    }
    return new Map();
  });
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

  const [scaleColors, setScaleColors] = useState<Map<string, string>>(() => {
    if (!tierAtLeast(tier, "studio")) {
      return new Map(defaultFreeformDesign.scaleColors.map((s) => [s.key, s.color]));
    }
    return new Map();
  });
  const scaleColorsRef = useRef(scaleColors);
  useEffect(() => {
    scaleColorsRef.current = scaleColors;
  }, [scaleColors]);

  // V2: per-cell scale metadata (shape now; size later), keyed like scaleColors
  // ("row,col"). Kept in a ref that we update SYNCHRONOUSLY at every write so the
  // centralized history snapshot can read it without threading a new arg through
  // every paint/paste/fill call site. Absent key = use global scale shape.
  const [scaleMeta, setScaleMeta] = useState<ScaleMetaMap>(() => new Map());
  const scaleMetaRef = useRef(scaleMeta);
  // Sync setter: update ref first (so a following pushToHistory sees it), then state.
  const writeScaleMeta = useCallback((next: ScaleMetaMap) => {
    scaleMetaRef.current = next;
    setScaleMeta(next);
  }, []);

  // ====================================================
  // UNDO / REDO  (ring + scale history, max 50 entries)
  // ====================================================
  type HistoryEntry = {
    rings: RingMap;
    scaleColors: Map<string, string>;
    // V2: snapshot per-cell scale meta so undo/redo preserve mixed shapes.
    scaleMeta: ScaleMetaMap;
  };
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const lastPushTimeRef = useRef(0);

  const pushToHistory = useCallback((ringsSnap: RingMap, scalesSnap: Map<string, string>) => {
    const stack = historyRef.current.slice(0, historyIndexRef.current + 1);
    stack.push({
      rings: new Map(ringsSnap),
      scaleColors: new Map(scalesSnap),
      // Read the synchronously-maintained meta ref (see writeScaleMeta).
      scaleMeta: new Map(scaleMetaRef.current),
    });
    if (stack.length > 50) stack.shift();
    historyRef.current = stack;
    historyIndexRef.current = stack.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  // Debounced version for rapid click-painting (consolidates strokes < 600ms apart)
  const pushToHistoryDebounced = useCallback((ringsSnap: RingMap, scalesSnap: Map<string, string>) => {
    const now = Date.now();
    if (now - lastPushTimeRef.current < 600) return;
    lastPushTimeRef.current = now;
    pushToHistory(ringsSnap, scalesSnap);
  }, [pushToHistory]);

  // Initial-state snapshot on mount. The history convention from this point
  // forward is: each entry stores the POST-action state, and the current
  // visible state always equals stack[historyIndex]. Without an initial
  // entry, the first user action would push pre-state at index 0 and the
  // undo guard (index <= 0) would refuse to budge — and even when it did
  // budge, it would skip over actions because pre-state of action N+1
  // equals post-state of action N, conflating two steps into one.
  const didInitialHistoryPushRef = useRef(false);
  useEffect(() => {
    if (didInitialHistoryPushRef.current) return;
    didInitialHistoryPushRef.current = true;
    historyRef.current = [
      { rings: new Map(rings), scaleColors: new Map(scaleColors), scaleMeta: new Map() },
    ];
    historyIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUndoAction = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const snap = historyRef.current[historyIndexRef.current];
    setRings(new Map(snap.rings));
    setScaleColors(new Map(snap.scaleColors));
    writeScaleMeta(new Map(snap.scaleMeta ?? []));
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, [writeScaleMeta]);

  const handleRedoAction = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const snap = historyRef.current[historyIndexRef.current];
    setRings(new Map(snap.rings));
    setScaleColors(new Map(snap.scaleColors));
    writeScaleMeta(new Map(snap.scaleMeta ?? []));
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, [writeScaleMeta]);

  // Keyboard shortcut: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) handleRedoAction(); else handleUndoAction();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleRedoAction();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndoAction, handleRedoAction]);

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
  type ControlsTab = "spacing" | "circles" | "rings" | "view" | "diag";
  const [controlsTab, setControlsTab] = useState<ControlsTab>("spacing");

  // On-demand interference (mixed-size overlap) check. Off by default; the
  // gear-strip button turns it on to scan + flag, off to clear.
  const [interferenceCheckOn, setInterferenceCheckOn] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);

  // ✅ Floating submenu (Designer pattern) — show/hide compass nav
  const [showCompass, setShowCompass] = useState(false);

  // Autosave / resume dialog
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const autosaveMetaRef = useRef<{ savedAt: number; ringCount: number } | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ Secondary utility panel (toolbox/save-load/reset)
  const [showUtilityPanel, setShowUtilityPanel] = useState(false);
  const [showSplineTool, setShowSplineTool] = useState(false);
  const [showSupplierColors, setShowSupplierColors] = useState(false);
  const [splineResetKey, setSplineResetKey] = useState(0);
  // Scale shape picker (toolbar): when open, shows a small popup of emoji
  // options. Selecting one updates activeScaleSettings.shape via the override,
  // which is the single source of truth driving every rendered scale's shape.
  const [scaleShapePickerOpen, setScaleShapePickerOpen] = useState(false);
  // Whether the vertical element strip (rings on the R layer, scales on the S
  // layer) is visible. R/S only picks the type; pressing the ring/scale icon
  // toggles this. So the strip shows only when the icon is pressed.
  // Calibrated rings strip is disabled for the first release: its toggle was
  // removed (per Erin) because the strip is fed by the now-hidden Tuner. Kept
  // as a const so the strip's render block + state plumbing stay intact for an
  // easy re-enable when scales/Tuner return.
  const elementStripOpen = false;
  const [builtinShapeOverrides, setBuiltinShapeOverrides] =
    useState<BuiltinOverrides>(() => loadBuiltinOverrides());
  const [customShapeEntries, setCustomShapeEntries] = useState<CustomScaleShape[]>(
    () => loadCustomShapes(),
  );
  const [selectedShapeMenuId, setSelectedShapeMenuId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(SCALE_MENU_SELECTED_KEY);
      if (saved) return saved;
    } catch {}
    const def = loadDefaultScaleShape();
    if (def) {
      return def.startsWith("custom:") ? def : `builtin:${def}`;
    }
    // Default to "leaf" — symmetric pointed-both-ends ("football" / Standard
    // scale, per scale.jpg reference). Matches what real chainmaille scales
    // look like; teardrop (asymmetric round-top) is the legacy default.
    return "builtin:leaf";
  });
  const [hiddenBuiltinShapes, setHiddenBuiltinShapesState] = useState<
    BuiltinScaleShape[]
  >(() => loadHiddenBuiltinShapeIds());
  // Editor modal state. When non-null, the modal is open.
  const [shapeEditor, setShapeEditor] = useState<
    | { mode: "add" }
    | { mode: "edit"; initial: CustomScaleShape }
    | null
  >(null);
  // Inline rename popover for built-ins (cheap edit, no full modal).
  const [renamingBuiltin, setRenamingBuiltin] = useState<BuiltinScaleShape | null>(
    null,
  );
  const [builtinRenameDraft, setBuiltinRenameDraft] = useState<{
    emoji: string;
    label: string;
  }>({ emoji: "", label: "" });

  useEffect(() => {
    saveBuiltinOverrides(builtinShapeOverrides);
    notifyCustomShapesChanged();
  }, [builtinShapeOverrides]);
  useEffect(() => {
    saveCustomShapes(customShapeEntries);
    notifyCustomShapesChanged();
  }, [customShapeEntries]);
  useEffect(() => {
    try {
      localStorage.setItem(SCALE_MENU_SELECTED_KEY, selectedShapeMenuId);
    } catch {}
  }, [selectedShapeMenuId]);

  // Listen for cross-tab/page changes (e.g. Tuner edits the same list).
  useEffect(() => {
    const onChanged = () => {
      setBuiltinShapeOverrides(loadBuiltinOverrides());
      setCustomShapeEntries(loadCustomShapes());
      setHiddenBuiltinShapesState(loadHiddenBuiltinShapeIds());
    };
    window.addEventListener(CUSTOM_SHAPES_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener(CUSTOM_SHAPES_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  const hideBuiltinShape = useCallback((s: BuiltinScaleShape) => {
    setHiddenBuiltinShapesState((prev) => {
      const next = [...new Set([...prev, s])];
      saveHiddenBuiltinShapeIds(next);
      return next;
    });
  }, []);
  const restoreBuiltinShape = useCallback((s: BuiltinScaleShape) => {
    setHiddenBuiltinShapesState((prev) => {
      const next = prev.filter((x) => x !== s);
      saveHiddenBuiltinShapeIds(next);
      return next;
    });
  }, []);

  type MergedShapeMenuEntry = {
    id: string;
    baseShape: ScaleShapeName;
    emoji: string;
    label: string;
    builtin: boolean;
    custom?: CustomScaleShape;
  };
  const mergedShapeMenu = useMemo<MergedShapeMenuEntry[]>(() => {
    const builtins: MergedShapeMenuEntry[] = SCALE_SHAPE_OPTIONS
      .filter((opt) => !hiddenBuiltinShapes.includes(opt.shape))
      .map((opt) => {
      const ov = builtinShapeOverrides[opt.shape] ?? {};
      return {
        id: `builtin:${opt.shape}`,
        baseShape: opt.shape,
        emoji: ov.emoji?.trim() || opt.emoji,
        label: ov.label?.trim() || opt.label,
        builtin: true,
      };
    });
    const customs: MergedShapeMenuEntry[] = customShapeEntries.map((e) => ({
      // For base-source customs we route the scale renderer at the underlying
      // built-in geometry; for image/freehand we route at the custom id itself
      // (RingRenderer + drawScale will look up the polygon).
      id: e.id,
      baseShape:
        e.source === "base"
          ? (e.baseShape ?? "leaf") // Standard almond/lancet — never teardrop
          : ("leaf" as ScaleShapeName), // unused — see shapeForRenderer
      emoji: e.emoji,
      label: e.label,
      builtin: false,
      custom: e,
    }));
    return [...builtins, ...customs];
  }, [builtinShapeOverrides, customShapeEntries, hiddenBuiltinShapes]);

  // What value to push into scaleSettingsOverride.shape so the renderer picks
  // the right geometry. Built-ins / base-source customs return the canonical
  // ScaleShapeName; polygon-source customs return their full custom id so the
  // renderer can find their polygon.
  const shapeForRenderer = useCallback(
    (entry: MergedShapeMenuEntry): string => {
      if (entry.custom && entry.custom.source !== "base") return entry.custom.id;
      return entry.baseShape;
    },
    [],
  );

  // Resolve the toolbar emoji from the currently-selected menu entry.
  const activeShapeMenuEntry = useMemo<MergedShapeMenuEntry | null>(() => {
    const byId = mergedShapeMenu.find((e) => e.id === selectedShapeMenuId);
    if (byId) return byId;
    return null;
  }, [mergedShapeMenu, selectedShapeMenuId]);
  // ==============================
  // 📏 Studio Stats (dims + counts)
  // ==============================
  // Default OPEN on desktop (fine pointer); default CLOSED on touch devices
  // (iPhone / iPad) where the floating panel crowds a small screen.
  const [showFreeformStats, setShowFreeformStats] = useState(() => {
    try {
      return !window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return true;
    }
  });
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

  // Pure-select intent for the Marquee toolbar button. When true (and
  // selectionMode === "square"), the selection drag captures cells WITHOUT
  // auto-painting rings/scales — i.e. classical marquee semantics. When the
  // user picks a shape from the ShapePanel instead, this stays false so the
  // legacy "select-and-fill" behavior is preserved for that path.
  const [pureSelectMode, setPureSelectMode] = useState(false);
  const pureSelectModeRef = useRef(false);
  useEffect(() => {
    pureSelectModeRef.current = pureSelectMode;
  }, [pureSelectMode]);

  // Persistent screen-space rect of the last completed pure-select drag, so
  // the user sees what they captured after they release the mouse. Cleared
  // when the marquee is dismissed, the user pastes, or starts a new drag.
  const [persistedSelectionRect, setPersistedSelectionRect] = useState<{
    sx0: number;
    sy0: number;
    sx1: number;
    sy1: number;
  } | null>(null);

  // Screen-space mouse position, updated on mousemove. Used to anchor the
  // paste-preview ghost. A ref (not state) to avoid a re-render storm — the
  // overlay re-draw is triggered explicitly from the mousemove handler.
  const mouseHoverPosRef = useRef<{ sx: number; sy: number } | null>(null);

  // Whether the paste-preview ghost should follow the cursor. Set true on
  // Cmd/Ctrl+C copy; cleared on paste, Esc, or when the user toggles the
  // Marquee button off. Without this gate the ghost lingered indefinitely
  // any time the clipboard had items, with no way to dismiss it short of
  // moving the cursor outside the canvas.
  const [pastePreviewActive, setPastePreviewActive] = useState(false);
  const pastePreviewActiveRef = useRef(false);
  useEffect(() => {
    pastePreviewActiveRef.current = pastePreviewActive;
  }, [pastePreviewActive]);

  // Always drop pure-select intent + the persisted rect when the selection
  // tool is dismissed, so re-entering via the ShapePanel doesn't inherit
  // either.
  useEffect(() => {
    if (selectionMode === "none") {
      setPureSelectMode(false);
      setPersistedSelectionRect(null);
    }
  }, [selectionMode]);

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
  const overlayDragRef = useRef<{ x: number; y: number } | null>(null);
  // Drag state for repositioning the on-canvas overlay (separate from the
  // panel's preview drag).
  const overlayCanvasDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  // Wrap dimensions for sizing the SVG overlay. Tracked via ResizeObserver
  // below.
  const [wrapSize, setWrapSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const r = wrap.getBoundingClientRect();
      setWrapSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  type OverlayScope = "all" | "selection";
  const [overlayScope, setOverlayScope] = useState<OverlayScope>("all");
  type TransferTarget = "rings" | "scales" | "both";
  const [transferTarget, setTransferTarget] = useState<TransferTarget>("rings");
  const [isTransferring, setIsTransferring] = useState(false);

  // Copy/paste clipboard for selected rings + scales. Items are stored as
  // row/col offsets from the selection's top-left cell so paste can re-anchor
  // anywhere. Cleared explicitly via the Copy button (replacing contents) or
  // when the user clears the design. Survives selection clearing — copy is a
  // snapshot, not a live reference. Multiple pastes reuse the same clipboard.
  type ClipboardItem = {
    deltaRow: number;
    deltaCol: number;
    ring?: { color: string; cluster: number };
    scaleColor?: string;
    scaleImagePatch?: string;
  };
  // sourceMinRowParity captures the parity (0=even, 1=odd) of the top-most
  // row in the original selection. The brick lattice shifts odd rows by
  // +centerSpacing/2, so a paste preserves the cluster's shape only when
  // the target's anchor row has the same parity as the source's. Paste
  // and preview use this flag to snap targetRow to a matching-parity row.
  const [clipboard, setClipboard] = useState<{
    items: ClipboardItem[];
    w: number;
    h: number;
    sourceMinRowParity: 0 | 1;
  } | null>(null);
  // When true, the next canvas click pastes the clipboard at the clicked
  // cell. Stays on after each paste so the user can place multiple copies.
  // Exit via Esc, the Paste toolbar button toggle, or Cmd/Ctrl+V again.
  const [pasteMode, setPasteMode] = useState(false);
  // Captures the cells from the most recent shape selection AND a snapshot of
  // their ring/scale state at the moment of selection (before the selection
  // tool's auto-paint mutates rings/scales). Without this snapshot, Copy
  // would read the post-paint state and the clipboard would contain a slab
  // of the active paint color instead of the original (e.g. image-transferred)
  // ring colors.
  type CapturedCell = {
    row: number;
    col: number;
    ring?: { color: string; cluster: number };
    scaleColor?: string;
    scaleImagePatch?: string;
  };
  const lastSelectionCellsRef = useRef<Array<CapturedCell>>([]);
  // Mirror of clipboard item count so the Copy button can show whether
  // there's anything to copy without re-deriving from selectedKeys (which
  // clears immediately in the existing selection flow).
  const [lastSelectionCount2, setLastSelectionCount2] = useState(0);

  // Overlay preview mode: "sampled" shows each target cell filled with the
  // color it would receive on Transfer (matches Transfer math exactly).
  // "raw" shows the source image clipped to the cell silhouettes.
  type OverlayPreviewMode = "sampled" | "raw";
  const [overlayPreviewMode, setOverlayPreviewMode] = useState<OverlayPreviewMode>("sampled");
  // Map<"ring:row-col" | "scale:row,col", "#rrggbb"> — sampled colors for the
  // preview. Empty when overlayPreviewMode === "raw" or no image is loaded.
  const [previewSampledColors, setPreviewSampledColors] = useState<Map<string, string>>(new Map());

  // Mount guard for async transfer — prevents setState after unmount when the
  // image load Promise resolves on a torn-down component.
  const transferMountedRef = useRef(true);
  useEffect(() => {
    transferMountedRef.current = true;
    return () => {
      transferMountedRef.current = false;
    };
  }, []);

  // Per-scale image patches: data URLs keyed by "row,col". Populated by the
  // image transfer when overlay.imageFill is on. Drives the per-scale
  // CanvasTexture in RingRenderer so the image actually paints onto the
  // scale's surface (clipped to its outline) rather than floating in a
  // separate layer above the scales.
  const [scaleImagePatches, setScaleImagePatches] = useState<Map<string, string>>(
    () => new Map(),
  );
  // Mirror ref so callbacks can read the current patches synchronously
  // without having to add scaleImagePatches to their useCallback deps.
  const scaleImagePatchesRef = useRef(scaleImagePatches);
  useEffect(() => { scaleImagePatchesRef.current = scaleImagePatches; }, [scaleImagePatches]);

  // Keys used when user chooses "selection" scope for overlay transfer
  const [overlayMaskKeys, setOverlayMaskKeys] = useState<Set<string>>(
    () => new Set(),
  );

  // When true: next selection drag defines overlayMaskKeys instead of painting/erasing
  const overlayPickingRef = useRef(false);

  // Combined highlight set for the renderer: the persistent overlay-transfer
  // target (when scope=selection) UNION the transient drag selection. This
  // gives the user a clear "this is what's selected" outline on scales/rings.
  const highlightedKeys = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    if (overlayScope === "selection") overlayMaskKeys.forEach((k) => out.add(k));
    selectedKeys.forEach((k) => out.add(k));
    return out;
  }, [overlayScope, overlayMaskKeys, selectedKeys]);

  // ====================================================
  // GEOMETRY (synced with Tuner)
  // ====================================================
  // Default ring when no Tuner-calibrated set is active: 5/16" ID (7.94 mm) with
  // 1.6 mm wire (per Erin). The Tuner/Atlas are hidden until scales return, so
  // these defaults are what most users actually weave with.
  const [innerIDmm, setInnerIDmm] = useState(7.94);
  const [wireMm, setWireMm] = useState(1.6);
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
  // Fast lookup for per-cell ring geometry (V2 mixing): cell.sizeId -> RingSet.
  const ringSizeMap = useMemo(
    () => new Map(ringSets.map((rs) => [rs.id, rs])),
    [ringSets],
  );
  // Active ring acts as the BRUSH for new rings (like the scale-shape picker):
  // painting stamps this id per cell. A ref so the paint handler reads it
  // without re-subscribing.
  const activeRingSetIdRef = useRef(activeRingSetId);
  useEffect(() => {
    activeRingSetIdRef.current = activeRingSetId;
  }, [activeRingSetId]);
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
    useState<Partial<FreeformScaleSettings>>(() => {
      try {
        const raw = localStorage.getItem(SCALE_SETTINGS_OVERRIDE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        // The override is recorded against the Tuner snapshot it was applied
        // ON TOP of. If the Tuner has since been re-saved (different snapshot
        // key), discard the stale override so the new Tuner values propagate
        // into Freeform instead of being shadowed.
        const storedKey: string | null = parsed.__snapshotKey ?? null;
        const currentSnap = loadFreeformTunerSnapshot();
        const currentKey = currentSnap
          ? JSON.stringify(currentSnap.scaleSettings ?? null)
          : null;
        if (storedKey !== currentKey) return {};
        const { __snapshotKey, ...rest } = parsed;
        return rest as Partial<FreeformScaleSettings>;
      } catch {
        return {};
      }
    });

  // Persist slider overrides + the Tuner snapshot key they were applied
  // against. Lets a Tuner re-save invalidate the persisted override on next
  // load so Tuner adjustments propagate to Freeform across restarts.
  useEffect(() => {
    try {
      const snapshotKey = tunerSnapshot
        ? JSON.stringify(tunerSnapshot.scaleSettings ?? null)
        : null;
      localStorage.setItem(
        SCALE_SETTINGS_OVERRIDE_KEY,
        JSON.stringify({ ...scaleSettingsOverride, __snapshotKey: snapshotKey }),
      );
    } catch {
      // QuotaExceededError / Safari private mode — best effort.
    }
  }, [scaleSettingsOverride, tunerSnapshot]);

  // (axis selectors removed — Z rotation and depth handled in RingRenderer directly)

  // Only clear overrides when Tuner snapshot content actually changes —
  // not just the object reference. loadFreeformTunerSnapshot() always
  // JSON.parses a new object, so comparing stringified content stops
  // slider values from being wiped on every focus or unrelated state update.
  // Seeded with the initial snapshot key so the first effect run does NOT
  // wipe the persisted overrides we just hydrated above.
  const lastSnapshotKeyRef = useRef<string | null>(
    tunerSnapshot ? JSON.stringify(tunerSnapshot.scaleSettings ?? null) : null,
  );
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
  // Always-current ref for drag handlers (avoids stale closures in pointer events).
  const activeScaleSettingsRef = useRef(activeScaleSettings);
  activeScaleSettingsRef.current = activeScaleSettings;

  // Scale-plane drag mode: click+drag in the canvas to translate the entire
  // scale grid relative to the rings (writes to gridOffsetXmm/gridOffsetYmm
  // via scaleSettingsOverride). Throttled via RAF to keep drags smooth.
  const [scalePlaneDragMode, setScalePlaneDragMode] = useState(false);
  const scaleDragRef = useRef<{
    screenX: number;
    screenY: number;
    gridX: number;
    gridY: number;
  } | null>(null);
  const scaleDragRafRef = useRef<number | null>(null);
  const scaleDragPendingRef = useRef<{
    gridOffsetXmm: number;
    gridOffsetYmm: number;
  } | null>(null);

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
  // AUTOSAVE — check on mount, save on changes
  // ====================================================
  useEffect(() => {
    if (!isStudioTier) return;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.rings) || data.rings.length === 0) return;
      autosaveMetaRef.current = { savedAt: data.savedAt ?? 0, ringCount: data.rings.length };
      setShowResumeDialog(true);
    } catch {
      // corrupt autosave — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  useEffect(() => {
    if (!isStudioTier || rings.size === 0) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        const payload = {
          type: "freeform" as const,
          version: 2,
          rings: Array.from(rings.values()).map((r: PlacedRing) => ({
            row: r.row,
            col: r.col,
            cluster: r.cluster,
            color: (r as any).color ?? "#ffffff",
            // V2: persist per-cell ring size so mixed-size designs reload intact.
            ...((r as any).sizeId ? { sizeId: (r as any).sizeId } : {}),
          })),
          geometry: {
            innerDiameter: innerIDmm,
            wireDiameter: wireMm,
            centerSpacing,
            angleIn,
            angleOut,
          },
          // Save overlay position metadata but not the image data (too large for autosave)
          overlay: overlay ? {
            scale: overlay.scale,
            rotation: overlay.rotation,
            offsetX: overlay.offsetX,
            offsetY: overlay.offsetY,
            opacity: overlay.opacity,
          } : null,
          paletteAssignment: assignment,
          savedAt: Date.now(),
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
      } catch {
        // QuotaExceededError — skip silently
      }
    }, 3000);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rings, scaleColors, innerIDmm, wireMm, centerSpacing, angleIn, angleOut,
      activeScaleSettings, overlay, assignment, isStudioTier]);

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
  const [zoom, setZoom] = useState(isPreviewOnly ? 1.6 : 1.0);
  const [panWorldX, setPanWorldX] = useState(0);
  const [panWorldY, setPanWorldY] = useState(0);

  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  // ── Mirror-draw tool ─────────────────────────────────────────────────────
  // When on, the user first defines a reference on the canvas (tap = a point /
  // 180° reflection; drag = an axis line of any orientation). After that, every
  // ring/scale painted (or erased) is also applied to its reflection across the
  // reference — until the tool is toggled off. Reference coords are stored in
  // the same "adjusted logical" frame rcToLogical outputs.
  type MirrorRef =
    | { kind: "point"; x: number; y: number }
    | { kind: "line"; x0: number; y0: number; x1: number; y1: number };
  const [mirrorOn, setMirrorOn] = useState(false);
  const [mirrorRefGeom, setMirrorRefGeom] = useState<MirrorRef | null>(null);
  const mirrorOnRef = useRef(mirrorOn);
  const mirrorRefGeomRef = useRef<MirrorRef | null>(null);
  // Active reference-defining gesture (tap vs drag), screen + logical points.
  const mirrorSetRef = useRef<{
    x0: number; y0: number; x1: number; y1: number; sx0: number; sy0: number; moved: boolean;
  } | null>(null);
  useEffect(() => { mirrorOnRef.current = mirrorOn; }, [mirrorOn]);
  useEffect(() => { mirrorRefGeomRef.current = mirrorRefGeom; }, [mirrorRefGeom]);

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
    if (!overlay || isTransferring) return;
    if (!transferMountedRef.current) return; // already unmounted
    setIsTransferring(true);

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

    const doRings = transferTarget === "rings" || transferTarget === "both";
    const doScales = transferTarget === "scales" || transferTarget === "both";

    // Diagnostic — TEMP: log what the transfer actually ran with so we can
    // tell if `transferTarget` is being misread vs. UI/state mismatch.
    // eslint-disable-next-line no-console
    console.log("[Transfer]", {
      transferTarget,
      doRings,
      doScales,
      overlayScope,
      useImageFill: !!(overlay as any)?.imageFill,
      ringCount: rings.size,
      scaleCount: scaleColorsRef.current.size,
      patchCountBefore: scaleImagePatches.size,
    });

    // Current behavior: recolor only existing cells.
    if (doRings && rings.size === 0 && !doScales) return;
    if (doScales && scaleColorsRef.current.size === 0 && !doRings) return;

    const offsetX = Number((overlay as any)?.offsetX ?? 0);
    const offsetY = Number((overlay as any)?.offsetY ?? 0);
    const scale = Math.max(1e-6, Number((overlay as any)?.scale ?? 1));
    // Overlay opacity is intentionally NOT baked into the transfer. The floating
    // image preview uses opacity, but the transferred rings/scales always get the
    // full-strength image color — reducing opacity must not fade the result
    // toward white.

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

    let img: HTMLImageElement;
    try {
      img = await new Promise((resolve, reject) => {
        const im = new Image();
        // Only set crossOrigin for http/https — setting it on data: or blob: URLs
        // causes Android WebView to fail the load silently (the #1 cause of
        // "Transfer to Rings does nothing" on Android).
        if (/^https?:\/\//i.test(src)) im.crossOrigin = "anonymous";
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("Image failed to load"));
        im.src = src;
      });
    } catch {
      if (transferMountedRef.current) setIsTransferring(false);
      return;
    }

    // After the async image load, the component may have unmounted (route
    // change). Bail before doing any setState work.
    if (!transferMountedRef.current) return;

    const iW = img.naturalWidth || img.width;
    const iH = img.naturalHeight || img.height;
    if (!iW || !iH) { setIsTransferring(false); return; }

    // ---------------------------
    // Compute WORLD bounds of the target cells (rings or scales)
    // ---------------------------
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    if (doRings) {
      rings.forEach((r, key) => {
        if (targetKeys && !targetKeys.has(key)) return;

        const { x: lx, y: ly } = rcToLogical(r.row, r.col);
        const { wx, wy } = logicalToWorldLocal(lx, ly);

        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minY = Math.min(minY, wy);
        maxY = Math.max(maxY, wy);
      });
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return;

    // If the user has dragged the mask outline to a custom rectangle, use
    // that as the image's target area instead of the auto-computed cell
    // bounding box. Guarantees "what you outline is what gets painted".
    const maskOverride = overlayMaskOverrideRef.current;
    const worldW = maskOverride
      ? Math.max(1e-6, maskOverride.worldW)
      : Math.max(1e-6, maxX - minX);
    const worldH = maskOverride
      ? Math.max(1e-6, maskOverride.worldH)
      : Math.max(1e-6, maxY - minY);
    const worldCenterX = maskOverride
      ? maskOverride.worldCenterX
      : (minX + maxX) * 0.5;
    const worldCenterY = maskOverride
      ? maskOverride.worldCenterY
      : (minY + maxY) * 0.5;

    // Cell-inside-mask predicate. The mask defines BOTH the image-mapping
    // rectangle AND which cells get painted: anything outside the mask is
    // left untouched (no colour change, no patch). Without this, the mask
    // only moved the image position, never the paint area.
    const maskMinX = worldCenterX - worldW / 2;
    const maskMaxX = worldCenterX + worldW / 2;
    const maskMinY = worldCenterY - worldH / 2;
    const maskMaxY = worldCenterY + worldH / 2;
    const isInsideMask = (wx: number, wy: number) =>
      wx >= maskMinX && wx <= maskMaxX && wy >= maskMinY && wy <= maskMaxY;

    // Preview panel: 360px wide, 14px padding each side → 332px content.
    const PREVIEW_W = 332;
    // Map the target ring region onto the preview ISOTROPICALLY so the
    // transferred image keeps its aspect ratio. PREVIEW_H was previously a fixed
    // 180px, which assumed the ring region was always 332:180 (≈1.84:1) — any
    // other region aspect stretched/squished the image (X scaled by 332/worldW,
    // Y by 180/worldH). Deriving the height from worldH/worldW makes both axes
    // share one scale, matching the panel preview (height = width ÷ gridAspect).
    const PREVIEW_H = Math.max(1, Math.min(4000, (PREVIEW_W * worldH) / worldW));
    // Height the image occupies in the preview at scale=1 (fills PREVIEW_W, height auto)
    const imageDisplayH = (PREVIEW_W * iH) / iW;
    // Cap canvas height to keep drawImage fast on Android — large source images
    // can freeze the main thread for seconds when drawn at full height.
    // Sampling uses normalized coords so reducing resolution doesn't affect color accuracy.
    const MAX_CANVAS_H = 800;
    const imgCanvasH = Math.max(1, Math.min(MAX_CANVAS_H, Math.ceil(imageDisplayH)));

    const isTiled = (overlay as any)?.repeat === "tile";
    const patternScaleVal = Number((overlay as any)?.patternScale ?? 100);
    const rotationDeg = Number((overlay as any)?.rotation ?? 0);

    const offCanvas = document.createElement("canvas");
    const offCtx = offCanvas.getContext("2d", {
      willReadFrequently: true,
    } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
    if (!offCtx) { setIsTransferring(false); return; }

    let offData: Uint8ClampedArray;
    let offW: number;
    let offH: number;

    try {
    if (isTiled) {
      // Tile mode: full preview canvas, tiles always cover everything.
      offCanvas.width = PREVIEW_W;
      offCanvas.height = PREVIEW_H;
      offW = PREVIEW_W;
      offH = PREVIEW_H;
      const tilePx = Math.max(1, PREVIEW_W * (patternScaleVal / 100));
      const tilePy = Math.max(1, tilePx * iH / iW);
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = Math.ceil(tilePx);
      tileCanvas.height = Math.ceil(tilePy);
      const tileCtx = tileCanvas.getContext("2d") as CanvasRenderingContext2D | null;
      if (tileCtx) {
        tileCtx.drawImage(img, 0, 0, tileCanvas.width, tileCanvas.height);
      }
      const pattern = offCtx.createPattern(tileCanvas, "repeat");
      if (pattern) {
        pattern.setTransform(new DOMMatrix().translate(offsetX, offsetY));
        offCtx.fillStyle = pattern;
      }
      offCtx.save();
      offCtx.translate(PREVIEW_W / 2, PREVIEW_H / 2);
      offCtx.rotate(rotationDeg * (Math.PI / 180));
      offCtx.translate(-PREVIEW_W / 2, -PREVIEW_H / 2);
      offCtx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
      offCtx.restore();
      offData = offCtx.getImageData(0, 0, offW, offH).data;
    } else {
      // Non-tiled: draw image at display size (no zoom/pan/rotation).
      // Use inverse transform per-ring with clamping so every ring always
      // gets a valid image color — no grey gaps from transparent canvas edges.
      offCanvas.width = PREVIEW_W;
      offCanvas.height = imgCanvasH;
      offW = PREVIEW_W;
      offH = imgCanvasH;
      offCtx.drawImage(img, 0, 0, PREVIEW_W, imgCanvasH);
      offData = offCtx.getImageData(0, 0, offW, offH).data;
    }
    } catch {
      // Canvas security error (tainted canvas) or other draw failure
      setIsTransferring(false);
      return;
    }

    // Base blend against white
    const baseR = 255, baseG = 255, baseB = 255;

    const rotRad = rotationDeg * (Math.PI / 180);
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    const sampleAtWorld = (wx: number, wy: number): string | null => {
      const nxWorld = (wx - worldCenterX) / worldW;
      const nyWorld = (wy - worldCenterY) / worldH;

      let sx: number;
      let sy: number;

      if (isTiled) {
        sx = Math.floor(PREVIEW_W * (0.5 + nxWorld));
        sy = Math.floor(PREVIEW_H * (0.5 - nyWorld));
        sx = Math.max(0, Math.min(offW - 1, sx));
        sy = Math.max(0, Math.min(offH - 1, sy));
      } else {
        // Inverse transform: translate(ox,oy) scale(s) rotate(r) with origin at preview center.
        // Ring preview position relative to center: (PREVIEW_W*nxWorld, -PREVIEW_H*nyWorld)
        let dx = PREVIEW_W * nxWorld - offsetX;
        let dy = -PREVIEW_H * nyWorld - offsetY;
        dx /= scale;
        dy /= scale;
        // Inverse rotation (rotate by -r):
        const rdx = dx * cosR + dy * sinR;
        const rdy = -dx * sinR + dy * cosR;
        // Add image-display center and clamp — guarantees a color for every ring.
        sx = Math.max(0, Math.min(offW - 1, Math.round(rdx + PREVIEW_W / 2)));
        sy = Math.max(0, Math.min(offH - 1, Math.round(rdy + imageDisplayH / 2)));
      }

      const idx = (sy * offW + sx) * 4;
      const r = offData[idx];
      const g = offData[idx + 1];
      const b = offData[idx + 2];
      const a255 = offData[idx + 3];

      if (a255 <= 2) return null;

      const t = Math.max(0, Math.min(1, a255 / 255));
      const outR = Math.round(baseR * (1 - t) + r * t);
      const outG = Math.round(baseG * (1 - t) + g * t);
      const outB = Math.round(baseB * (1 - t) + b * t);

      return `#${hex2(outR)}${hex2(outG)}${hex2(outB)}`;
    };

    if (doRings) {
      // ---------------------------
      // Apply to rings
      // ---------------------------
      const next: RingMap = new Map(rings);

      next.forEach((r, key) => {
        if (targetKeys && !targetKeys.has(key)) return;

        const { x: lx, y: ly } = rcToLogical(r.row, r.col);
        const { wx, wy } = logicalToWorldLocal(lx, ly);

        // Mask defines the paint area: skip rings outside the rectangle.
        if (!isInsideMask(wx, wy)) return;

        const sampled = sampleAtWorld(wx, wy);
        if (!sampled) return;

        next.set(key, {
          ...(r as any),
          color: normalizeColor6(sampled),
        } as PlacedRing);
      });

      setRings(next);
    }

    // Defensive: when the target does NOT include scales, do nothing to
    // scaleColors / scaleImagePatches. The if-block below is already gated
    // on doScales, but this comment + a no-op early exit make the intent
    // explicit so any future code added to this function can't accidentally
    // wipe scale state during a rings-only transfer.
    if (!doScales) {
      setIsTransferring(false);
      return;
    }


    setIsTransferring(false);
  }, [
    overlay,
    overlayScope,
    overlayMaskKeys,
    transferTarget,
    rings,
    rcToLogical,
    logicalOrigin,
    isTransferring,
    activeScaleSettings,
    scaleImagePatches,
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

        // approximate "rings" using center spacing
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
  // COPY / PASTE: rings + scales
  // ====================================================
  // Snapshot the current selection into the clipboard. Captures each cell's
  // ring (color + cluster) AND scale (color + image patch) if present. The
  // selection's top-left cell becomes the (0,0) anchor — paste re-anchors at
  // the target click position.
  const copySelectionToClipboard = useCallback(() => {
    // Prefer the captured snapshot from the most recent selection — it has
    // the PRE-PAINT ring/scale state, which is what users actually want to
    // copy (the original image colors, not the slab of paint that the
    // selection tool dropped on top). Fall back to live selectedKeys when
    // there's no snapshot yet but a selection is still highlighted (some
    // alternative future flow). Either path produces the same Clipboard.
    let captured: CapturedCell[] = [];
    if (lastSelectionCellsRef.current.length > 0) {
      captured = lastSelectionCellsRef.current;
    } else if (selectedKeys.size > 0) {
      selectedKeys.forEach((key) => {
        const dash = key.indexOf("-");
        if (dash < 0) return;
        const row = Number(key.slice(0, dash));
        const col = Number(key.slice(dash + 1));
        if (!Number.isFinite(row) || !Number.isFinite(col)) return;
        const ring = rings.get(key);
        const scaleKey = `${row},${col}`;
        captured.push({
          row,
          col,
          ring: ring ? { color: ring.color, cluster: ring.cluster } : undefined,
          scaleColor: scaleColors.get(scaleKey),
          scaleImagePatch: scaleImagePatches.get(scaleKey),
        });
      });
    }
    if (captured.length === 0) return;

    let minRow = Infinity;
    let minCol = Infinity;
    let maxRow = -Infinity;
    let maxCol = -Infinity;
    for (const c of captured) {
      if (c.row < minRow) minRow = c.row;
      if (c.col < minCol) minCol = c.col;
      if (c.row > maxRow) maxRow = c.row;
      if (c.col > maxCol) maxCol = c.col;
    }
    if (!Number.isFinite(minRow)) return;
    const items: ClipboardItem[] = [];
    for (const c of captured) {
      if (!c.ring && c.scaleColor === undefined && c.scaleImagePatch === undefined) continue;
      items.push({
        deltaRow: c.row - minRow,
        deltaCol: c.col - minCol,
        ring: c.ring,
        scaleColor: c.scaleColor,
        scaleImagePatch: c.scaleImagePatch,
      });
    }
    if (items.length === 0) return;
    setClipboard({
      items,
      w: maxCol - minCol + 1,
      h: maxRow - minRow + 1,
      sourceMinRowParity: (minRow & 1) as 0 | 1,
    });
    // Arm the paste-preview ghost from inside the copy function so BOTH
    // the keyboard shortcut (Cmd/Ctrl+C) and the toolbar Copy 📋 button
    // surface the ghost. Without this the button path silently set the
    // clipboard with no visible feedback.
    setPastePreviewActive(true);
    // Seed the hover ref to canvas center so the ghost has somewhere to
    // render immediately (the next mousemove overwrites it). This is what
    // makes the ghost actually visible right after copy.
    if (!mouseHoverPosRef.current && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      mouseHoverPosRef.current = { sx: r.width / 2, sy: r.height / 2 };
    }
  }, [selectedKeys, rings, scaleColors, scaleImagePatches]);

  // Snap a paste target row to one with the same parity as the source's
  // top row, so the brick lattice's odd-row half-cs offset doesn't mirror
  // the cluster horizontally. Takes the cursor's *fractional* row (ly /
  // spacingY) and picks the nearest integer row whose parity matches —
  // sometimes that's the rounded row itself, sometimes the row above,
  // sometimes the row below, whichever is closer to the cursor.
  function snapTargetRowToParity(
    rawRow: number,
    sourceParity: 0 | 1,
  ): number {
    const r0 = Math.round(rawRow);
    if (((r0 % 2) + 2) % 2 === sourceParity) return r0;
    const dUp = Math.abs(r0 + 1 - rawRow);
    const dDown = Math.abs(r0 - 1 - rawRow);
    return dUp <= dDown ? r0 + 1 : r0 - 1;
  }

  // Reflect a point across the active mirror reference (point or line), in the
  // adjusted-logical frame rcToLogical uses.
  const reflectPoint = useCallback(
    (px: number, py: number, ref: MirrorRef): { x: number; y: number } => {
      if (ref.kind === "point") return { x: 2 * ref.x - px, y: 2 * ref.y - py };
      const dx = ref.x1 - ref.x0;
      const dy = ref.y1 - ref.y0;
      const len2 = dx * dx + dy * dy || 1;
      const t = ((px - ref.x0) * dx + (py - ref.y0) * dy) / len2;
      const projx = ref.x0 + t * dx;
      const projy = ref.y0 + t * dy;
      return { x: 2 * projx - px, y: 2 * projy - py };
    },
    [],
  );

  // Original cell plus its mirror cell (when the mirror tool is on and a
  // reference is set). The mirror cell is the reflection snapped to the
  // nearest lattice cell. De-duped when it lands on the same cell.
  const mirrorCellsFor = useCallback(
    (row: number, col: number): Array<{ row: number; col: number }> => {
      const cells = [{ row, col }];
      const ref = mirrorRefGeomRef.current;
      if (mirrorOnRef.current && ref) {
        const p = rcToLogical(row, col);
        const r = reflectPoint(p.x, p.y, ref);
        const m = logicalToRowColApprox(r.x, r.y);
        if (m.row !== row || m.col !== col) cells.push({ row: m.row, col: m.col });
      }
      return cells;
    },
    [rcToLogical, logicalToRowColApprox, reflectPoint],
  );

  // Expand a list of cells with their mirror reflections (deduped). Returns the
  // input unchanged when the Mirror tool is off, so the geometric fill helpers
  // (shape/marquee/spline) can call it unconditionally to mirror together.
  const withMirror = useCallback(
    (cells: Array<{ row: number; col: number }>): Array<{ row: number; col: number }> => {
      if (!mirrorOnRef.current || !mirrorRefGeomRef.current) return cells;
      const seen = new Set<string>();
      const out: Array<{ row: number; col: number }> = [];
      for (const c of cells) {
        for (const m of mirrorCellsFor(c.row, c.col)) {
          const k = `${m.row},${m.col}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push(m);
          }
        }
      }
      return out;
    },
    [mirrorCellsFor],
  );

  // Paste the clipboard onto the design with its (0,0) anchor at the given
  // target row/col. Overwrites existing rings/scales at the destination cells
  // (matches paint semantics — last write wins). Pushes one POST-paste
  // history entry so each paste can be undone in one Cmd+Z step.
  const pasteClipboardAt = useCallback(
    (targetRow: number, targetCol: number, rawTargetRow?: number, rotationRad = 0) => {
      if (!clipboard || clipboard.items.length === 0) return;
      // Brick-offset shape preservation: snap to matching parity so the
      // pasted cluster looks identical to the source rather than mirrored.
      // Passing rawTargetRow lets the snap pick the *nearest* matching
      // row instead of always nudging by +1.
      const anchorRow = snapTargetRowToParity(
        rawTargetRow ?? targetRow,
        clipboard.sourceMinRowParity,
      );

      // Resolve each clipboard item to a destination cell. At 0° we keep the
      // exact integer-delta placement (lossless — no snapping, no distortion).
      // For a rotated paste we rotate the item's geometric position around the
      // anchor (= the user's pivot) and snap to the nearest lattice cell; the
      // hex lattice can't hold arbitrary angles, so collisions/gaps are
      // possible and accepted (per design). Scales keep their downward glyph.
      const pivot = rotationRad ? rcToLogical(anchorRow, targetCol) : null;
      const cosA = Math.cos(rotationRad);
      const sinA = Math.sin(rotationRad);
      const cellFor = (it: ClipboardItem): { r: number; c: number } => {
        if (!rotationRad || !pivot) {
          return { r: anchorRow + it.deltaRow, c: targetCol + it.deltaCol };
        }
        const p = rcToLogical(anchorRow + it.deltaRow, targetCol + it.deltaCol);
        const dx = p.x - pivot.x;
        const dy = p.y - pivot.y;
        const rx = pivot.x + dx * cosA - dy * sinA;
        const ry = pivot.y + dx * sinA + dy * cosA;
        const { row, col } = logicalToRowColApprox(rx, ry);
        return { r: row, c: col };
      };

      // Compute the next state of all three stores synchronously so we can
      // both apply it and record it. This replaces the previous pattern of
      // pushing pre-paste state and letting setRings/setScaleColors run
      // afterward — which conflated pre and post states across multiple
      // actions and made undo skip two steps at a time.
      const nextRings: RingMap = new Map(rings);
      for (const it of clipboard.items) {
        if (!it.ring) continue;
        const { r, c } = cellFor(it);
        nextRings.set(`${r}-${c}`, {
          row: r,
          col: c,
          color: it.ring.color,
          cluster: it.ring.cluster,
        });
      }

      const nextScaleColors = new Map(scaleColorsRef.current);
      for (const it of clipboard.items) {
        if (it.scaleColor === undefined) continue;
        const { r, c } = cellFor(it);
        nextScaleColors.set(`${r},${c}`, it.scaleColor);
      }

      const nextScaleImagePatches = new Map(scaleImagePatchesRef.current);
      let patchesChanged = false;
      for (const it of clipboard.items) {
        const { r, c } = cellFor(it);
        const sk = `${r},${c}`;
        if (it.scaleImagePatch !== undefined) {
          nextScaleImagePatches.set(sk, it.scaleImagePatch);
          patchesChanged = true;
        } else if (it.scaleColor !== undefined && nextScaleImagePatches.has(sk)) {
          nextScaleImagePatches.delete(sk);
          patchesChanged = true;
        }
      }

      setRings(nextRings);
      setScaleColors(nextScaleColors);
      if (patchesChanged) setScaleImagePatches(nextScaleImagePatches);

      // Record POST-paste state. With the initial mount snapshot in place,
      // historyRef now stores [post-action-0, post-action-1, ...], so undo
      // decrements by exactly one user-perceptible step.
      pushToHistory(nextRings, nextScaleColors);
    },
    [clipboard, rings, scaleColorsRef, scaleImagePatchesRef, pushToHistory, rcToLogical, logicalToRowColApprox],
  );

  // Refs mirror state for the keydown handler so we don't re-bind on every
  // render and don't capture stale state in the closure.
  const selectedKeysRef = useRef(selectedKeys);
  const clipboardRef = useRef(clipboard);
  const pasteModeRef = useRef(pasteMode);
  useEffect(() => { selectedKeysRef.current = selectedKeys; }, [selectedKeys]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => { pasteModeRef.current = pasteMode; }, [pasteMode]);

  // Rotate-before-paste gesture. On press in paste mode the press cell becomes
  // both the paste anchor and the pivot; dragging rotates the ghost around it;
  // release commits via pasteClipboardAt(..., angle). A plain press-release
  // (no drag) commits at 0° — i.e. behaves like the old click-to-paste.
  const pasteRotRef = useRef<{
    pivotRow: number;        // parity-snapped anchor row
    pivotCol: number;
    rawPivotRow: number;     // fractional row for nearest-parity snap
    pivotLx: number;         // pivot in logical space (for angle math)
    pivotLy: number;
    startAngle: number | null; // reference direction captured on first drag
    angle: number;           // current rotation (radians)
  } | null>(null);

  // Cmd/Ctrl+C copies the current selection; Cmd/Ctrl+V toggles paste mode;
  // Escape exits paste mode. Skipped when the focused element is a text input
  // so typing in fields still does native copy/paste.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!(t && (t as HTMLElement).isContentEditable);
      if (isTyping) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "c") {
        if (selectedKeysRef.current && selectedKeysRef.current.size > 0) {
          e.preventDefault();
          // copySelectionToClipboard now arms the paste-preview ghost +
          // seeds the hover ref, so this path no longer needs to do that
          // explicitly. Same for the toolbar 📋 Copy button.
          copySelectionToClipboard();
          // For the Marquee/pure-select workflow: after copy, exit the
          // selection tool so the user is back in paint mode and can
          // immediately right-click anywhere to paste — no extra toggle.
          // The cascade effect on selectionMode === "none" clears
          // pureSelectMode and the persisted selection rect.
          if (pureSelectModeRef.current) {
            setSelectionMode("none");
          }
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        setPasteMode((v) => !v);
        return;
      }
      if (e.key === "Escape" && pasteModeRef.current) {
        e.preventDefault();
        setPasteMode(false);
      }
      // Esc also dismisses the right-click paste-preview ghost so the
      // user can always clear it without other gestures.
      if (e.key === "Escape" && pastePreviewActiveRef.current) {
        e.preventDefault();
        setPastePreviewActive(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySelectionToClipboard]);

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

  // Tracks the previous structural state so color-only ring changes don't
  // force a full rings3D rebuild. The stable rings3D reference also prevents
  // the 3D renderer's rebuild useEffect from firing (React dep comparison).
  const prevDerivedStructRef = useRef<{
    size: number;
    checksum: number;
    geomKey: string;
    rings3D: any[];
    overlapKeys: Set<string>;
  }>({ size: -1, checksum: 0, geomKey: "", rings3D: [], overlapKeys: new Set() });

const derived = useMemo(() => {
  const outerRadiusMm = (innerIDmm + 2 * wireMm) / 2;
  const wantExport = finalizeOpen;

  // Structural signature: ring count + fast XOR checksum of ring positions +
  // geometry/origin params. Changing any of these requires a full rings3D rebuild.
  const geomKey = `${innerIDmm.toFixed(3)}|${wireMm.toFixed(3)}|${centerSpacing.toFixed(3)}|${angleIn}|${angleOut}|${logicalOrigin.ox.toFixed(3)}|${logicalOrigin.oy.toFixed(3)}|ic${interferenceCheckOn ? 1 : 0}`;
  const newSize = rings.size;
  let checksum = 0;
  rings.forEach((r) => {
    // XOR-based hash: order-independent, detects position changes (add/erase/undo)
    checksum ^= ((r.row * 31337 + r.col) | 0);
    // V2: fold per-cell ring size in so repainting a cell with a different
    // calibrated ring triggers a geometry rebuild (not just a color reuse).
    const sid = (r as any).sizeId as string | undefined;
    if (sid) for (let i = 0; i < sid.length; i++) checksum = (checksum * 33 + sid.charCodeAt(i)) | 0;
  });

  const prev = prevDerivedStructRef.current;
  const isStructural =
    newSize !== prev.size ||
    checksum !== prev.checksum ||
    geomKey !== prev.geomKey ||
    wantExport; // export needs real x_mm/y_mm positions, always do full build

  const paintMap = new Map<string, string>();
  const colorCountsStored = new Map<string, number>();
  const exportRings: ExportRing[] = [];

  let rings3D: any[];

  if (isStructural) {
    rings3D = [];
    rings.forEach((r: PlacedRing) => {
      const { x: baseX, y: baseY } = rcToLogical(r.row, r.col);
      const shiftedX = baseX - logicalOrigin.ox;
      const shiftedY = baseY - logicalOrigin.oy;
      const tiltDeg = r.row % 2 === 0 ? angleIn : angleOut;
      const tiltRad = THREE.MathUtils.degToRad(tiltDeg);
      const storedColor = normalizeColor6((r as any).color ?? "#ffffff");
      const renderColor = applyCalibrationHex(storedColor);
      const key = `${r.row},${r.col}`;

      // V2: per-cell ring size. A cell painted with a calibrated ring carries
      // its sizeId; render it at that ring's ID/wire. The non-instanced
      // RingRenderer builds a torus per ring from these (cached by size), so
      // mixed sizes draw at their own radius on the shared lattice. Falls back
      // to the global ring when no per-cell size is set.
      const cal = (r as any).sizeId ? ringSizeMap.get((r as any).sizeId) : undefined;
      const rID = cal?.innerDiameter ?? innerIDmm;
      const rWD = cal?.wireDiameter ?? wireMm;
      const rOuter = (rID + 2 * rWD) / 2;

      rings3D.push({
        id: key,
        row: r.row,
        col: r.col,
        x: shiftedX,
        y: shiftedY,
        z: 0,
        innerDiameter: rID,
        wireDiameter: rWD,
        radius: rOuter,
        centerSpacing,
        tilt: tiltDeg,
        tiltRad,
        color: renderColor,
      });

      paintMap.set(key, renderColor);
      colorCountsStored.set(storedColor, (colorCountsStored.get(storedColor) ?? 0) + 1);
      if (wantExport) {
        exportRings.push({
          key,
          x_mm: baseX,
          y_mm: baseY,
          innerDiameter_mm: rID,
          wireDiameter_mm: rWD,
          colorHex: storedColor,
        });
      }
    });

    // ── Mixed-size interference detection ────────────────────────────────
    // Reactive: this whole branch reruns on any structural change (a ring
    // placed/erased, a cell's size changed, or the spacing/angles moved), so a
    // ring's flag updates "on the fly". A ring is flagged when the shared
    // lattice spacing falls OUTSIDE its own weave window (too big → overlap, or
    // too small → can't reach) AND it sits next to a present DIFFERENT-size
    // neighbour. Uniform same-size regions are never flagged here.
    const overlapKeys = new Set<string>();
    if (interferenceCheckOn && rings3D.length > 1) {
      const byKey = new Map<string, any>();
      for (const e of rings3D) byKey.set(e.id, e);
      const cand: ReadonlyArray<readonly [number, number]> = [
        [0, -1], [0, 1], [-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1],
      ];
      const maxNeighborDist = centerSpacing * 1.3;
      for (const a of rings3D) {
        const odA = a.radius * 2;          // outer diameter
        const idA = a.innerDiameter;       // inner diameter
        // Does the shared spacing fall outside THIS ring's weave window?
        const outOfWindow =
          centerSpacing < OVERLAP_TIGHT_FACTOR * odA ||
          centerSpacing > OVERLAP_LOOSE_ID_FACTOR * idA;
        if (!outOfWindow) continue;
        // Only an issue when it's actually mixed with a different-size neighbour.
        for (const [dr, dc] of cand) {
          const b = byKey.get(`${a.row + dr},${a.col + dc}`);
          if (!b) continue;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > maxNeighborDist) continue; // not an adjacent ring
          if (Math.abs(a.radius - b.radius) >= SAME_SIZE_EPS_MM) {
            overlapKeys.add(a.id);
            break;
          }
        }
      }
      // Tint flagged rings red. paintMap WINS over per-ring color in the
      // renderer (applyPaintToMeshes: paint ?? directColor ?? default), so the
      // tint must be written to BOTH the per-ring color and the paint map.
      for (const a of rings3D) {
        if (overlapKeys.has(a.id)) {
          a.color = OVERLAP_TINT;
          paintMap.set(a.id, OVERLAP_TINT);
        }
      }
    }

    prevDerivedStructRef.current = { size: newSize, checksum, geomKey, rings3D, overlapKeys };
  } else {
    // Color-only change: reuse the previous rings3D array reference unchanged.
    // This avoids allocating ~N new JS objects and keeps the same array identity,
    // so the 3D renderer's rebuild useEffect won't fire (React sees same dep).
    rings3D = prev.rings3D;
    rings.forEach((r: PlacedRing) => {
      const storedColor = normalizeColor6((r as any).color ?? "#ffffff");
      const renderColor = applyCalibrationHex(storedColor);
      const key = `${r.row},${r.col}`;
      paintMap.set(key, renderColor);
      colorCountsStored.set(storedColor, (colorCountsStored.get(storedColor) ?? 0) + 1);
      // wantExport is always false here (wantExport forces isStructural above)
    });
    // Geometry (and thus overlap) is unchanged on a color-only edit, so keep
    // the previously-flagged rings tinted red over the freshly-rebuilt paint.
    for (const key of prev.overlapKeys) paintMap.set(key, OVERLAP_TINT);
  }

  const byColor = Array.from(colorCountsStored.entries()).sort((a, b) => b[1] - a[1]);
  const ringStats = {
    total: rings.size,
    byColor,
    uniqueColors: byColor.length,
  };

  return { rings3D, paintMap, ringStats, exportRings, overlapCount: prevDerivedStructRef.current.overlapKeys.size };
  }, [
    rings,
    ringSizeMap,
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
    // Re-run (or clear) the overlap scan when the check is toggled.
    interferenceCheckOn,
  ]);

  const rings3D = derived.rings3D;
  const paintMap = derived.paintMap;
  const ringStats = derived.ringStats;
  const exportRings = derived.exportRings;
  const overlapCount = derived.overlapCount;

  const scaleStats = useMemo(() => {
    if (scaleColors.size === 0) return null;
    const byColor = new Map<string, number>();
    for (const [, hex] of scaleColors) byColor.set(hex, (byColor.get(hex) ?? 0) + 1);
    const sorted = [...byColor.entries()].sort((a, b) => b[1] - a[1]);
    return { total: scaleColors.size, uniqueColors: sorted.length, byColor: sorted };
  }, [scaleColors]);

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
    // Force a synchronous render so the WebGL back buffer is populated.
    // preserveDrawingBuffer is off, so without this drawImage on the WebGL
    // canvas yields a blank frame and the thumbnail comes out white.
    try {
      (ringRendererRef.current as any)?.renderNow?.();
    } catch {}

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

  const getExportGroups = useCallback(
    () => (ringRendererRef.current as any)?.getExportGroups?.() ?? null,
    [],
  );

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


  // ====================================================
  // IMAGE OVERLAY GEOMETRY (shared by preview + transfer)
  // ====================================================
  // User-adjustable mask. When set, this rectangle is the world-space target
  // for the image overlay (and what the Transfer paints into). When null, the
  // bounds are auto-computed from the current rings/scales matching the
  // transferTarget (and selection scope, if any).
  const [overlayMaskOverride, setOverlayMaskOverride] = useState<null | {
    worldW: number;
    worldH: number;
    worldCenterX: number;
    worldCenterY: number;
  }>(null);

  // Auto bounds: matches the Transfer's per-ring/per-scale loop. Returns null
  // if there's nothing to paint on (no rings/scales for the selected target).
  const overlayAutoBounds = useMemo(() => {
    const doRings = (transferTarget === "rings" || transferTarget === "both") && rings.size > 0;
    const doScales = false;
    if (!doRings && !doScales) return null;

    const useSelection = overlayScope === "selection" && overlayMaskKeys.size > 0;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let n = 0;

    if (doRings) {
      for (const [key, r] of rings) {
        if (useSelection && !overlayMaskKeys.has(key)) continue;
        const { x: lx, y: ly } = rcToLogical(r.row, r.col);
        const w = logicalToWorld(lx, ly);
        if (w.wx < minX) minX = w.wx;
        if (w.wx > maxX) maxX = w.wx;
        if (w.wy < minY) minY = w.wy;
        if (w.wy > maxY) maxY = w.wy;
        n++;
      }
    }
    if (n === 0) return null;
    return {
      worldW: Math.max(1e-6, maxX - minX),
      worldH: Math.max(1e-6, maxY - minY),
      worldCenterX: (minX + maxX) * 0.5,
      worldCenterY: (minY + maxY) * 0.5,
    };
  }, [transferTarget, overlayScope, overlayMaskKeys, rings, rcToLogical, logicalToWorld]);

  // Effective bounds: user mask if set, else auto. Falls back to a unit box
  // when nothing is paintable — the preview render condition gates this so it
  // shouldn't matter visually.
  const overlayWorldBounds = useMemo(() => {
    if (overlayMaskOverride) return overlayMaskOverride;
    if (overlayAutoBounds) return overlayAutoBounds;
    return { worldW: 1, worldH: 1, worldCenterX: 0, worldCenterY: 0 };
  }, [overlayMaskOverride, overlayAutoBounds]);

  // Reset the user mask whenever the underlying paintable target changes
  // (new image, transferTarget switch, selection change). The next render will
  // fall back to auto bounds. Keeps the outline meaningful instead of stuck
  // somewhere unrelated.
  useEffect(() => {
    setOverlayMaskOverride(null);
  }, [overlay?.dataUrl, transferTarget, overlayScope, overlayMaskKeys]);

  // Screen pixels per logical mm at the current camera. Derived from the
  // distance between two world points 1 unit apart. Camera state lives in
  // RingRenderer's THREE camera, which is driven by externalViewState in a
  // useEffect. A cameraTick is bumped after that effect runs so this memo
  // recomputes against the up-to-date camera.
  const [overlayCameraTick, setOverlayCameraTick] = useState(0);
  const overlayPxPerMm = useMemo(() => {
    const a = worldToScreen(0, 0);
    const b = worldToScreen(1, 0);
    return Math.max(1e-6, Math.abs(b.sx - a.sx));
    // overlayCameraTick is intentionally in deps; worldToScreen reads THREE
    // camera state that React doesn't track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldToScreen, overlayCameraTick]);

  // Bump after RingRenderer's effect applies the new camera. The parent's
  // useEffect runs *after* children's effects, so by this point the THREE
  // camera reflects the latest pan/zoom React state.
  useEffect(() => {
    setOverlayCameraTick((t) => (t + 1) & 0xFF);
  }, [zoom, panWorldX, panWorldY]);

  // Refs mirror the memo values so the (stable) drag handler closure and the
  // transfer callback can read current geometry without being recreated every
  // render.
  const overlayWorldBoundsRef = useRef(overlayWorldBounds);
  const overlayPxPerMmRef = useRef(overlayPxPerMm);
  const overlayMaskOverrideRef = useRef(overlayMaskOverride);

  // Cache of the rasterized overlay pixels for the sampled-color preview. For a
  // non-tiled image the offscreen buffer depends only on the image itself —
  // pan/scale/rotation are applied per-pixel in sampleAtWorld, NOT baked into
  // these pixels. Caching it lets a Pan X/Y nudge re-run only the cheap per-ring
  // arithmetic instead of decoding the image + getImageData every time (the old
  // behavior that froze large designs while panning).
  const overlaySampleCacheRef = useRef<{
    dataUrl: string;
    offData: Uint8ClampedArray;
    offW: number;
    offH: number;
    imageDisplayH: number;
  } | null>(null);
  useEffect(() => { overlayWorldBoundsRef.current = overlayWorldBounds; }, [overlayWorldBounds]);
  useEffect(() => { overlayPxPerMmRef.current = overlayPxPerMm; }, [overlayPxPerMm]);
  useEffect(() => { overlayMaskOverrideRef.current = overlayMaskOverride; }, [overlayMaskOverride]);

  // Natural pixel dimensions of the loaded overlay image. Used for the
  // imageDisplayH calculation in the canvas preview (mirrors the same value
  // the transfer code computes from `img.naturalWidth/Height`).
  const [overlayNatural, setOverlayNatural] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!overlay?.dataUrl) { setOverlayNatural(null); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setOverlayNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    };
    img.onerror = () => { if (!cancelled) setOverlayNatural(null); };
    img.src = overlay.dataUrl;
    return () => { cancelled = true; };
  }, [overlay?.dataUrl]);

  // ====================================================
  // IMAGE OVERLAY CLIP SHAPES (SVG)
  // ====================================================
  // Builds the SVG <clipPath> children that clip the on-canvas image overlay
  // to the union of selected ring circles and/or scale silhouettes.
  const overlayClipShapes = useMemo(() => {
    if (!overlay?.dataUrl) return [] as React.ReactNode[];
    // Visual preview clips to the same target(s) the Transfer button will
    // write to, so the user sees exactly where the image will land. Matches
    // the doRings/doScales logic in the transfer handler.
    const doRings = (transferTarget === "rings" || transferTarget === "both") && rings.size > 0;
    const doScales = false;
    const useSelection = overlayScope === "selection" && overlayMaskKeys.size > 0;
    const shapes: React.ReactNode[] = [];

    // Mask-area filter (same predicate the Transfer uses). The mask outline
    // decides which cells get painted, not just how the image is positioned.
    const mb = overlayWorldBounds;
    const mMinX = mb.worldCenterX - mb.worldW / 2;
    const mMaxX = mb.worldCenterX + mb.worldW / 2;
    const mMinY = mb.worldCenterY - mb.worldH / 2;
    const mMaxY = mb.worldCenterY + mb.worldH / 2;
    const insideMask = (wx: number, wy: number) =>
      wx >= mMinX && wx <= mMaxX && wy >= mMinY && wy <= mMaxY;

    if (doRings && rings.size > 0) {
      const outerR = (innerIDmm + 2 * wireMm) / 2;
      const innerR = innerIDmm / 2;
      const midR = (innerR + outerR) / 2;
      for (const [key, r] of rings) {
        if (useSelection && !overlayMaskKeys.has(key)) continue;
        const { x, y } = rcToLogical(r.row, r.col);
        const { wx, wy } = logicalToWorld(x, y);
        if (!insideMask(wx, wy)) continue;
        const sp = worldToScreen(wx, wy);
        const outerPx = projectRingRadiusPx(x, y, outerR);
        const fill = previewSampledColors.get(`ring:${key}`) ?? "transparent";
        if (overlayPreviewMode === "sampled") {
          // Sampled-color preview: draw the ring as an open band (matches the
          // real torus geometry) so adjacent rings don't merge into a solid
          // patch that visually reads as scale silhouettes.
          const midPx = projectRingRadiusPx(x, y, midR);
          const innerPx = projectRingRadiusPx(x, y, innerR);
          const wirePx = Math.max(1, outerPx - innerPx);
          shapes.push(
            <circle
              key={`ring:${key}`}
              cx={sp.sx}
              cy={sp.sy}
              r={Math.max(1, midPx)}
              fill="none"
              stroke={fill}
              strokeWidth={wirePx}
            />,
          );
        } else {
          // Raw mode: filled disc — used as <clipPath> geometry so the source
          // image is clipped to the full ring footprint.
          shapes.push(
            <circle
              key={`ring:${key}`}
              cx={sp.sx}
              cy={sp.sy}
              r={Math.max(2, outerPx)}
              fill={fill}
            />,
          );
        }
      }
    }

    return shapes;
  }, [
    overlay?.dataUrl,
    transferTarget,
    overlayScope,
    overlayMaskKeys,
    overlayWorldBounds,
    rings,
    rcToLogical,
    logicalToWorld,
    worldToScreen,
    projectRingRadiusPx,
    innerIDmm,
    wireMm,
    panWorldX,
    panWorldY,
    zoom,
    previewSampledColors,
    overlayPreviewMode,
  ]);

  // ====================================================
  // OVERLAY PREVIEW SAMPLER (sampled-color preview)
  // ====================================================
  // Mirrors transferOverlayToRings' image-sampling math so the on-canvas
  // preview shows each target cell as the color it would become on Transfer
  // — not the raw image clipped to cell silhouettes. Loads the overlay image
  // into an offscreen canvas with the same transform the transfer uses, then
  // samples once per ring/scale center. Keys match overlayClipShapes:
  //   rings:  `ring:${rowKey}`  (rowKey is the "row-col" id used in `rings`)
  //   scales: `scale:${row}-${col}`
  useEffect(() => {
    if (overlayPreviewMode !== "sampled" || !overlay?.dataUrl) {
      setPreviewSampledColors((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let cancelled = false;
    const dataUrl = overlay.dataUrl;

    const PREVIEW_W = 332;
    // Isotropic mapping so the sampled-color preview keeps the image's aspect
    // ratio (mirrors transferOverlayToRings — see note there). A fixed 180px
    // squished the preview whenever the ring region wasn't 332:180.
    const PREVIEW_H = Math.max(
      1,
      Math.min(
        4000,
        (PREVIEW_W * Math.max(1e-6, overlayWorldBounds.worldH)) /
          Math.max(1e-6, overlayWorldBounds.worldW),
      ),
    );
    const isTiled = (overlay as any)?.repeat === "tile";
    const patternScaleVal = Number((overlay as any)?.patternScale ?? 100);
    const rotationDeg = Number((overlay as any)?.rotation ?? 0);
    const offsetX = Number((overlay as any)?.offsetX ?? 0);
    const offsetY = Number((overlay as any)?.offsetY ?? 0);
    const scl = Math.max(1e-6, Number((overlay as any)?.scale ?? 1));
    // Sampled-Colors preview mirrors the transfer result, which ignores
    // opacity (always full-strength image — no fade toward white).

    // Run the per-ring sampling loop against an already-rasterized buffer.
    // This is the only part that depends on pan/scale/rotation (applied
    // per-pixel below), so it is cheap to repeat on every Pan X/Y nudge.
    const sampleAllRings = (
      offData: Uint8ClampedArray,
      offW: number,
      offH: number,
      imageDisplayH: number,
    ) => {
      const baseR = 255, baseG = 255, baseB = 255;
      const rotRad = rotationDeg * (Math.PI / 180);
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      const mb = overlayWorldBounds;
      const worldCenterX = mb.worldCenterX;
      const worldCenterY = mb.worldCenterY;
      const worldW = Math.max(1e-6, mb.worldW);
      const worldH = Math.max(1e-6, mb.worldH);
      const maskMinX = worldCenterX - worldW / 2;
      const maskMaxX = worldCenterX + worldW / 2;
      const maskMinY = worldCenterY - worldH / 2;
      const maskMaxY = worldCenterY + worldH / 2;
      const insideMask = (wx: number, wy: number) =>
        wx >= maskMinX && wx <= maskMaxX && wy >= maskMinY && wy <= maskMaxY;

      const sampleAtWorld = (wx: number, wy: number): string | null => {
        const nxWorld = (wx - worldCenterX) / worldW;
        const nyWorld = (wy - worldCenterY) / worldH;
        let sx: number;
        let sy: number;
        if (isTiled) {
          sx = Math.max(0, Math.min(offW - 1, Math.floor(PREVIEW_W * (0.5 + nxWorld))));
          sy = Math.max(0, Math.min(offH - 1, Math.floor(PREVIEW_H * (0.5 - nyWorld))));
        } else {
          let dx = PREVIEW_W * nxWorld - offsetX;
          let dy = -PREVIEW_H * nyWorld - offsetY;
          dx /= scl;
          dy /= scl;
          const rdx = dx * cosR + dy * sinR;
          const rdy = -dx * sinR + dy * cosR;
          sx = Math.max(0, Math.min(offW - 1, Math.round(rdx + PREVIEW_W / 2)));
          sy = Math.max(0, Math.min(offH - 1, Math.round(rdy + imageDisplayH / 2)));
        }
        const idx = (sy * offW + sx) * 4;
        const r = offData[idx];
        const g = offData[idx + 1];
        const b = offData[idx + 2];
        const a255 = offData[idx + 3];
        if (a255 <= 2) return null;
        const t = Math.max(0, Math.min(1, a255 / 255));
        const outR = Math.round(baseR * (1 - t) + r * t);
        const outG = Math.round(baseG * (1 - t) + g * t);
        const outB = Math.round(baseB * (1 - t) + b * t);
        return `#${hex2(outR)}${hex2(outG)}${hex2(outB)}`;
      };

      const doRings = (transferTarget === "rings" || transferTarget === "both") && rings.size > 0;
      const useSelection = overlayScope === "selection" && overlayMaskKeys.size > 0;

      const out = new Map<string, string>();
      if (doRings) {
        for (const [key, r] of rings) {
          if (useSelection && !overlayMaskKeys.has(key)) continue;
          const { x: lx, y: ly } = rcToLogical(r.row, r.col);
          const { wx, wy } = logicalToWorld(lx, ly);
          if (!insideMask(wx, wy)) continue;
          const hex = sampleAtWorld(wx, wy);
          if (hex) out.set(`ring:${key}`, hex);
        }
      }
      if (!cancelled) setPreviewSampledColors(out);
    };

    // Fast path: a non-tiled image whose pixels we've already rasterized.
    // Skips the decode + draw + getImageData entirely so panning stays smooth.
    const cache = overlaySampleCacheRef.current;
    if (!isTiled && cache && cache.dataUrl === dataUrl) {
      sampleAllRings(cache.offData, cache.offW, cache.offH, cache.imageDisplayH);
      return;
    }

    // Slow path: decode the image, rasterize the offscreen buffer, cache it
    // (non-tiled only — tiled bakes pan/rotation into the pixels), then sample.
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const iW = img.naturalWidth || 1;
      const iH = img.naturalHeight || 1;
      const imageDisplayH = (PREVIEW_W * iH) / iW;
      const MAX_CANVAS_H = 800;
      const imgCanvasH = Math.max(1, Math.min(MAX_CANVAS_H, Math.ceil(imageDisplayH)));

      const offCanvas = document.createElement("canvas");
      const offCtx = offCanvas.getContext("2d", {
        willReadFrequently: true,
      } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
      if (!offCtx) return;
      let offData: Uint8ClampedArray;
      let offW: number;
      let offH: number;
      try {
        if (isTiled) {
          offCanvas.width = PREVIEW_W;
          offCanvas.height = PREVIEW_H;
          offW = PREVIEW_W;
          offH = PREVIEW_H;
          const tilePx = Math.max(1, PREVIEW_W * (patternScaleVal / 100));
          const tilePy = Math.max(1, tilePx * iH / iW);
          const tileCanvas = document.createElement("canvas");
          tileCanvas.width = Math.ceil(tilePx);
          tileCanvas.height = Math.ceil(tilePy);
          const tileCtx = tileCanvas.getContext("2d") as CanvasRenderingContext2D | null;
          if (tileCtx) tileCtx.drawImage(img, 0, 0, tileCanvas.width, tileCanvas.height);
          const pattern = offCtx.createPattern(tileCanvas, "repeat");
          if (pattern) {
            pattern.setTransform(new DOMMatrix().translate(offsetX, offsetY));
            offCtx.fillStyle = pattern;
          }
          offCtx.save();
          offCtx.translate(PREVIEW_W / 2, PREVIEW_H / 2);
          offCtx.rotate(rotationDeg * (Math.PI / 180));
          offCtx.translate(-PREVIEW_W / 2, -PREVIEW_H / 2);
          offCtx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
          offCtx.restore();
        } else {
          offCanvas.width = PREVIEW_W;
          offCanvas.height = imgCanvasH;
          offW = PREVIEW_W;
          offH = imgCanvasH;
          offCtx.drawImage(img, 0, 0, PREVIEW_W, imgCanvasH);
        }
        offData = offCtx.getImageData(0, 0, offW, offH).data;
      } catch {
        return;
      }

      // Cache only the non-tiled buffer (tiled pixels embed pan/rotation).
      if (!isTiled) {
        overlaySampleCacheRef.current = { dataUrl, offData, offW, offH, imageDisplayH };
      }
      sampleAllRings(offData, offW, offH, imageDisplayH);
    };
    img.onerror = () => {
      if (!cancelled) setPreviewSampledColors(new Map());
    };
    img.src = dataUrl;
    return () => {
      cancelled = true;
    };
  }, [
    overlayPreviewMode,
    overlay?.dataUrl,
    (overlay as any)?.scale,
    (overlay as any)?.rotation,
    (overlay as any)?.offsetX,
    (overlay as any)?.offsetY,
    (overlay as any)?.opacity,
    (overlay as any)?.repeat,
    (overlay as any)?.patternScale,
    transferTarget,
    overlayScope,
    overlayMaskKeys,
    overlayWorldBounds,
    rings,
    rcToLogical,
    logicalToWorld,
    activeScaleSettings.heightMm,
    activeScaleSettings.dropMm,
    activeScaleSettings.holeIdMm,
  ]);

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

    const rect = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (hideCircles) return;

    ctx.strokeStyle = "rgba(20,184,166,0.8)";
    ctx.lineWidth = 1;

    const margin = 60;

    // Compute viewport bounds in logical space to limit iteration to visible rings.
    // This converts O(totalRings) transforms into O(visibleRings) — critical for
    // large grids (e.g. 200×200 = 40k rings where only ~2k may be visible).
    const tl = screenToWorld(-margin, -margin);
    const br = screenToWorld(rect.width + margin, rect.height + margin);

    const rcTL = logicalToRowColApprox(tl.lx - circleOffsetX, tl.ly - circleOffsetY);
    const rcBR = logicalToRowColApprox(br.lx - circleOffsetX, br.ly - circleOffsetY);

    const rowMin = Math.min(rcTL.row, rcBR.row) - 2;
    const rowMax = Math.max(rcTL.row, rcBR.row) + 2;
    const colMin = Math.min(rcTL.col, rcBR.col) - 3;
    const colMax = Math.max(rcTL.col, rcBR.col) + 3;

    // Direct key lookup — only processes rings in the visible row/col window.
    ctx.beginPath();
    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        const r = rings.get(`${row}-${col}`);
        if (!r) continue;

        const { x, y } = rcToLogical(row, col);
        const lx = x + circleOffsetX;
        const ly = y + circleOffsetY;

        const { wx, wy } = logicalToWorld(lx, ly);
        const { sx, sy } = worldToScreen(wx, wy);

        const effInner = getEffectiveInnerRadiusMm(row);
        const rPx = projectRingRadiusPx(lx, ly, effInner) * circleScale;

        ctx.moveTo(sx + rPx, sy);
        ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
      }
    }
    ctx.stroke();
  }, [
    rings,
    rcToLogical,
    logicalToWorld,
    worldToScreen,
    screenToWorld,
    logicalToRowColApprox,
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

    // ─── Always-on faint alignment grid ───────────────────────────────────
    // Dots at every ring-center position visible in the viewport. The brick
    // offset comes from rcToLogical (odd rows shifted half a centerSpacing).
    // Matches the RingRenderer's positioning chain exactly:
    //   rcToLogical(row, col) → logicalToWorld → worldToScreen
    // Earlier code added circleOffsetX/Y here, but the renderer ignores
    // circleOffsetX/Y when placing rings, so the grid sat ~one diameter
    // off from the actual rings whenever circleOffsetX/Y was non-zero.
    try {
      const tl = screenToWorld(0, 0);
      const br = screenToWorld(rect.width, rect.height);
      if (
        Number.isFinite(tl.lx) &&
        Number.isFinite(br.lx) &&
        centerSpacing > 0 &&
        spacingY > 0
      ) {
        const minLx = Math.min(tl.lx, br.lx);
        const maxLx = Math.max(tl.lx, br.lx);
        const minLy = Math.min(tl.ly, br.ly);
        const maxLy = Math.max(tl.ly, br.ly);
        const minRowG = Math.floor(minLy / spacingY) - 1;
        const maxRowG = Math.ceil(maxLy / spacingY) + 1;
        const minColG = Math.floor(minLx / centerSpacing) - 1;
        const maxColG = Math.ceil(maxLx / centerSpacing) + 1;

        // Stride the grid so it covers the WHOLE viewport at any zoom instead of
        // stopping after a fixed cell count (the old 200×200 cap left the screen
        // empty past 200 cells when zoomed out). When dots would be packed closer
        // than ~5px on screen we skip cells so the count stays bounded; at normal
        // zoom the stride is 1 (every dot, unchanged look).
        const gridDotScreen = (row: number, col: number) => {
          const { x, y } = rcToLogical(row, col);
          const { wx, wy } = logicalToWorld(x, y);
          return worldToScreen(wx, wy);
        };
        const probeA = gridDotScreen(minRowG, minColG);
        const probeCol = gridDotScreen(minRowG, minColG + 1);
        const probeRow = gridDotScreen(minRowG + 1, minColG);
        const colPx = Math.max(0.001, Math.hypot(probeCol.sx - probeA.sx, probeCol.sy - probeA.sy));
        const rowPx = Math.max(0.001, Math.hypot(probeRow.sx - probeA.sx, probeRow.sy - probeA.sy));
        const MIN_DOT_PX = 5; // closest two drawn dots get before we thin them
        let strideCol = Math.max(1, Math.ceil(MIN_DOT_PX / colPx));
        let strideRow = Math.max(1, Math.ceil(MIN_DOT_PX / rowPx));
        // Hard ceiling on total dots so an extreme zoom-out can't lock the UI;
        // bump both strides together (keeps full-screen coverage, just sparser).
        const MAX_DOTS = 14000;
        const estCols = (maxColG - minColG) / strideCol;
        const estRows = (maxRowG - minRowG) / strideRow;
        const est = estCols * estRows;
        if (est > MAX_DOTS) {
          const k = Math.sqrt(est / MAX_DOTS);
          strideCol = Math.ceil(strideCol * k);
          strideRow = Math.ceil(strideRow * k);
        }
        ctx.save();
        ctx.fillStyle = "rgba(148,163,184,0.32)";
        for (let row = minRowG; row <= maxRowG; row += strideRow) {
          for (let col = minColG; col <= maxColG; col += strideCol) {
            const { x: gx, y: gy } = rcToLogical(row, col);
            const { wx: gwx, wy: gwy } = logicalToWorld(gx, gy);
            const { sx: gsx, sy: gsy } = worldToScreen(gwx, gwy);
            if (gsx < -5 || gsy < -5 || gsx > rect.width + 5 || gsy > rect.height + 5) continue;
            ctx.beginPath();
            ctx.arc(gsx, gsy, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    } catch {
      // overlay grid is decoration only — never break the rest of the draw
    }

    // ─── Paste preview ghost (clipboard + hover, not actively dragging) ──
    // Translucent ring outlines anchored at the cursor showing where each
    // clipboard ring would land if the user right-clicked now. Gated by
    // pastePreviewActive so the user can dismiss it explicitly (Marquee
    // button toggle off, Esc, or after a paste).
    const rot = pasteRotRef.current;
    if (
      clipboardRef.current &&
      clipboardRef.current.items.length > 0 &&
      (rot ||
        (pastePreviewActiveRef.current && mouseHoverPosRef.current && !isSelecting))
    ) {
      try {
        // While the rotate gesture is active the anchor is the FIXED pivot;
        // otherwise the ghost follows the cursor (the pre-rotate behavior).
        let anchorRow: number;
        let anchorCol: number;
        if (rot) {
          anchorRow = rot.pivotRow;
          anchorCol = rot.pivotCol;
        } else {
          const { sx: hsx, sy: hsy } = mouseHoverPosRef.current!;
          const { lx: hlx, ly: hly } = screenToWorld(hsx, hsy);
          const adjHx = hlx - circleOffsetX;
          const adjHy = hly - circleOffsetY;
          anchorCol = logicalToRowColApprox(adjHx, adjHy).col;
          // Mirror the parity snap pasteClipboardAt applies, using the true
          // fractional row so the preview lands on the same nearest-matching
          // row the actual paste will choose.
          anchorRow = snapTargetRowToParity(
            adjHy / spacingY,
            clipboardRef.current.sourceMinRowParity,
          );
        }
        const angle = rot ? rot.angle : 0;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const pivotL = rcToLogical(anchorRow, anchorCol);
        // Approximate ring outer radius in screen pixels from the lattice
        // scale: distance between two adjacent column centers.
        const probeB = rcToLogical(anchorRow, anchorCol + 1);
        const wA = logicalToWorld(pivotL.x, pivotL.y);
        const wB = logicalToWorld(probeB.x, probeB.y);
        const sA = worldToScreen(wA.wx, wA.wy);
        const sB = worldToScreen(wB.wx, wB.wy);
        const scalePx = Math.hypot(sB.sx - sA.sx, sB.sy - sA.sy);
        const ringRadiusPx = Math.max(3, scalePx * 0.48);
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(96,165,250,0.85)";
        ctx.fillStyle = "rgba(96,165,250,0.10)";
        for (const it of clipboardRef.current.items) {
          if (!it.ring) continue; // empty cell — nothing to paste here
          // Rotate the item's geometric position around the pivot (matches
          // pasteClipboardAt) so the ghost previews the exact committed result.
          const p = rcToLogical(anchorRow + it.deltaRow, anchorCol + it.deltaCol);
          let rx = p.x;
          let ry = p.y;
          if (angle) {
            const dx = p.x - pivotL.x;
            const dy = p.y - pivotL.y;
            rx = pivotL.x + dx * cosA - dy * sinA;
            ry = pivotL.y + dx * sinA + dy * cosA;
          }
          const { wx: pwx, wy: pwy } = logicalToWorld(rx, ry);
          const { sx: psx, sy: psy } = worldToScreen(pwx, pwy);
          ctx.beginPath();
          ctx.arc(psx, psy, ringRadiusPx, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        // Pivot crosshair while rotating, so the user sees the rotation center.
        if (rot) {
          const { sx: pcx, sy: pcy } = worldToScreen(wA.wx, wA.wy);
          ctx.strokeStyle = "rgba(250,204,21,0.95)";
          ctx.beginPath();
          ctx.moveTo(pcx - 9, pcy);
          ctx.lineTo(pcx + 9, pcy);
          ctx.moveTo(pcx, pcy - 9);
          ctx.lineTo(pcx, pcy + 9);
          ctx.stroke();
        }
        ctx.restore();
      } catch {
        // preview is decoration only — never break the rest of the draw
      }
    }

    // ── Mirror tool guide: the active reference (point/line) and the
    // in-progress defining gesture. Coords are in the adjusted-logical frame;
    // logicalToWorld → worldToScreen maps them to the canvas.
    {
      const ms = mirrorSetRef.current;
      const ref = mirrorRefGeomRef.current;
      const toScreen = (ax: number, ay: number) => {
        const w = logicalToWorld(ax, ay);
        return worldToScreen(w.wx, w.wy);
      };
      try {
        ctx.save();
        ctx.strokeStyle = "rgba(56,189,248,0.95)";
        ctx.fillStyle = "rgba(56,189,248,0.18)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        const drawPoint = (ax: number, ay: number) => {
          const { sx, sy } = toScreen(ax, ay);
          ctx.beginPath();
          ctx.arc(sx, sy, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(sx - 10, sy); ctx.lineTo(sx + 10, sy);
          ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy + 10);
          ctx.stroke();
          ctx.setLineDash([6, 5]);
        };
        const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
          const a = toScreen(x0, y0);
          const b = toScreen(x1, y1);
          let dx = b.sx - a.sx, dy = b.sy - a.sy;
          const len = Math.hypot(dx, dy) || 1;
          dx /= len; dy /= len;
          const ext = 4000;
          ctx.beginPath();
          ctx.moveTo(a.sx - dx * ext, a.sy - dy * ext);
          ctx.lineTo(a.sx + dx * ext, a.sy + dy * ext);
          ctx.stroke();
        };
        if (ms) {
          if (ms.moved) drawLine(ms.x0, ms.y0, ms.x1, ms.y1);
          else drawPoint(ms.x0, ms.y0);
        } else if (ref) {
          if (ref.kind === "point") drawPoint(ref.x, ref.y);
          else drawLine(ref.x0, ref.y0, ref.x1, ref.y1);
        }
        ctx.restore();
      } catch {
        /* guide is decoration only */
      }
    }

    if (selectionMode === "none") return;

    // Released drag in pure-select mode: draw the persisted selection rect
    // as a dashed outline so the user can see what they captured. This
    // path runs only when there's no active drag (post-release).
    if (!isSelecting && pureSelectMode && persistedSelectionRect) {
      const { sx0, sy0, sx1, sy1 } = persistedSelectionRect;
      const rx = Math.min(sx0, sx1);
      const ry = Math.min(sy0, sy1);
      const rw = Math.abs(sx1 - sx0);
      const rh = Math.abs(sy1 - sy0);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(37,99,235,0.95)";
      ctx.fillStyle = "rgba(37,99,235,0.08)";
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

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
  }, [
    selectionMode,
    isSelecting,
    eraseMode,
    lastSelectionCount,
    pureSelectMode,
    persistedSelectionRect,
    // grid + paste-preview dependencies
    screenToWorld,
    worldToScreen,
    logicalToWorld,
    rcToLogical,
    logicalToRowColApprox,
    circleOffsetX,
    circleOffsetY,
    centerSpacing,
    spacingY,
    pastePreviewActive,
  ]);

  // Re-render the overlay whenever the persisted rect changes so the dashed
  // selection box shows up immediately after the marquee drag is released.
  // The other call sites of drawSelectionOverlay only fire during active
  // drags; without this, the rect wouldn't appear until the next mouseMove.
  useEffect(() => {
    if (persistedSelectionRect) drawSelectionOverlay();
  }, [persistedSelectionRect, drawSelectionOverlay]);

  // Same for paste-preview gate flips — re-render so the ghost appears
  // (on copy) or vanishes (on dismiss) immediately, not after the next move.
  useEffect(() => {
    drawSelectionOverlay();
  }, [pastePreviewActive, drawSelectionOverlay]);

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
    // Always re-run the overlay drawer instead of unconditionally clearing
    // when selectionMode is "none" or not actively selecting.
    // drawSelectionOverlay handles its own clear and then re-emits the
    // alignment grid + paste-preview ghost (if armed). The previous
    // shortcut to clearInteractionCanvas() wiped the freshly armed
    // paste-preview the instant Cmd+C auto-exited to selectionMode='none'.
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
  ]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Mirror tool: while on and no reference set yet, a press begins defining
      // it (release as a tap = point, drag = line). Takes priority.
      if (mirrorOnRef.current && !mirrorRefGeomRef.current) {
        const { sx, sy } = getCanvasPoint(e);
        const { lx, ly } = screenToWorld(sx, sy);
        const ax = lx - circleOffsetX;
        const ay = ly - circleOffsetY;
        mirrorSetRef.current = { x0: ax, y0: ay, x1: ax, y1: ay, sx0: sx, sy0: sy, moved: false };
        drawSelectionOverlay();
        return;
      }

      // Rotate-before-paste: a press in paste mode sets the anchor + pivot and
      // arms the rotate gesture. Drag rotates the ghost (handleMouseMove);
      // release commits (handleMouseUp). Press-release with no drag = 0° paste,
      // matching the old click-to-paste. Takes priority over all other modes.
      if (
        pasteModeRef.current &&
        clipboardRef.current &&
        clipboardRef.current.items.length > 0
      ) {
        const { sx, sy } = getCanvasPoint(e);
        const { lx, ly } = screenToWorld(sx, sy);
        const adjLx = lx - circleOffsetX;
        const adjLy = ly - circleOffsetY;
        const { col } = logicalToRowColApprox(adjLx, adjLy);
        const rawRow = adjLy / spacingY;
        const pivotRow = snapTargetRowToParity(
          rawRow,
          clipboardRef.current.sourceMinRowParity,
        );
        const piv = rcToLogical(pivotRow, col);
        pasteRotRef.current = {
          pivotRow,
          pivotCol: col,
          rawPivotRow: rawRow,
          pivotLx: piv.x,
          pivotLy: piv.y,
          startAngle: null,
          angle: 0,
        };
        drawSelectionOverlay();
        return;
      }

      // Selection has priority over scale-plane drag: if both flags happen to
      // be active (legacy stuck-state scenarios), the user can recover by just
      // picking a Shape — they don't have to remember to toggle the ✛ button
      // off first. The scale-plane drag tool's button still works on its own
      // when selection is "none".
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

      // Scale plane drag mode — start dragging the scale grid. Now lives
      // after the selection check so an accidentally-active scale-plane
      // drag mode doesn't hijack a user who's actively in selection mode.
      if (scalePlaneDragMode) {
        scaleDragRef.current = {
          screenX: e.clientX,
          screenY: e.clientY,
          gridX: activeScaleSettingsRef.current.gridOffsetXmm,
          gridY: activeScaleSettingsRef.current.gridOffsetYmm,
        };
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
      scalePlaneDragMode,
      selectionMode,
      panMode,
      getCanvasPoint,
      screenToWorld,
      panWorldX,
      panWorldY,
      drawSelectionOverlay,
      computeDimsFromSelection,
      logicalToRowColApprox,
      rcToLogical,
      circleOffsetX,
      circleOffsetY,
      spacingY,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Always track cursor for floating bubble (and to keep the state "used")
      setCursorPx({ x: e.clientX, y: e.clientY });

      // Canvas-relative hover position for the paste-preview ghost + the
      // grid stay-fresh draws. Cheap ref-write — no rerender.
      {
        const hp = getCanvasPoint(e);
        mouseHoverPosRef.current = { sx: hp.sx, sy: hp.sy };
        // Mirror tool: extend the reference line while defining it.
        const ms = mirrorSetRef.current;
        if (ms) {
          const w = screenToWorld(hp.sx, hp.sy);
          ms.x1 = w.lx - circleOffsetX;
          ms.y1 = w.ly - circleOffsetY;
          if (Math.hypot(hp.sx - ms.sx0, hp.sy - ms.sy0) > 6) ms.moved = true;
        }
        // Rotate-before-paste: update rotation from the drag direction around
        // the pivot. The first meaningful drag fixes the reference direction
        // (so the cluster doesn't jump on press); after that, turning the
        // pointer around the pivot turns the cluster by the same amount.
        const pr = pasteRotRef.current;
        if (pr) {
          const w = screenToWorld(hp.sx, hp.sy);
          const dx = w.lx - circleOffsetX - pr.pivotLx;
          const dy = w.ly - circleOffsetY - pr.pivotLy;
          if (Math.hypot(dx, dy) > spacingY * 0.25) {
            const cur = Math.atan2(dy, dx);
            if (pr.startAngle === null) pr.startAngle = cur;
            pr.angle = cur - pr.startAngle;
          }
        }
        // Redraw the overlay so the grid + (if clipboard exists) the paste
        // preview follow the cursor. This also keeps the grid responsive
        // during pans that the user performs by moving the mouse.
        drawSelectionOverlay();
      }

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

      // Scale plane drag — translate the grid by the world-space delta
      if (scalePlaneDragMode && scaleDragRef.current) {
        e.preventDefault();
        const rect = getViewRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const startSx = scaleDragRef.current.screenX - rect.left;
        const startSy = scaleDragRef.current.screenY - rect.top;
        const { lx: curLx, ly: curLy } = screenToWorld(sx, sy);
        const { lx: startLx, ly: startLy } = screenToWorld(startSx, startSy);
        const newX = scaleDragRef.current.gridX + (curLx - startLx);
        const newY = scaleDragRef.current.gridY + (curLy - startLy);
        scaleDragPendingRef.current = { gridOffsetXmm: newX, gridOffsetYmm: newY };
        if (scaleDragRafRef.current == null) {
          scaleDragRafRef.current = requestAnimationFrame(() => {
            scaleDragRafRef.current = null;
            const pending = scaleDragPendingRef.current;
            if (!pending) return;
            scaleDragPendingRef.current = null;
            setAutoFollowTuner(false);
            setScaleSettingsOverride((prev) => ({ ...prev, ...pending }));
          });
        }
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
      scalePlaneDragMode,
      isSelecting,
      selectionMode,
      panMode,
      isPanning,
      getCanvasPoint,
      getViewRect,
      screenToWorld,
      logicalToRowColApprox,
      rcToLogical,
      drawSelectionOverlay,
      computeDimsFromSelection,
      eventToScreen,
    ],
  );
  // ======================================================
  // SPLINE -> CLOSED POLYGON FILL (rings OR scales, per R/S layer toggle)
  // Uses the SAME cell-enumeration logic as circle/rect fill.
  // polygonScreen is in SCREEN px (from SplineSandbox).
  // When activeLayer === "scales", paints scaleColors at every cell inside
  // the polygon (using the active color, falling back to the active scale
  // settings color if the active color is empty). Previously this fill was
  // hard-coded to rings — user-reported regression 2026-06-01.
  // ======================================================
  const applyClosedSpline = useCallback(
    (polygonScreen: { x: number; y: number }[], colorHex: string) => {
      if (!polygonScreen || polygonScreen.length < 3) return;
      const paint = normalizeColor6(colorHex);

      // The spline polygon arrives in CLIENT/viewport coords (e.clientX/Y), but
      // screenToWorld expects CANVAS-RELATIVE coords and returns logical in the
      // non-circleOffset frame. Convert to canvas-relative, then into the same
      // adjusted-logical frame rcToLogical uses for the cells below — otherwise
      // the polygon and the cells are compared in mismatched frames and the
      // filled region comes out offset/shrunk vs the drawn boundary.
      const rect = getViewRect();
      const poly = polygonScreen.map((p) => {
        const w = screenToWorld(p.x - rect.left, p.y - rect.top);
        return { x: w.lx - circleOffsetX, y: w.ly - circleOffsetY };
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

      let cells: Array<{ row: number; col: number }> = [];

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const p = rcToLogical(r, c); // returns {x,y} in logical space
          if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
          if (!pointInPoly(p.x, p.y, poly)) continue;
          cells.push({ row: r, col: c });
        }
      }

      if (!cells.length) return;

      cells = withMirror(cells);

      // Deterministic order
      cells.sort((u, v) => u.row - v.row || u.col - v.col);

      // Layer dispatch — match the R/S toolbar toggle. The "scales" branch
      // mirrors the bulk-apply scales path (eraseModeRef + scaleImagePatches
      // invalidation) so spline fill on scales feels identical to the
      // marquee/shape-fill path. Erase mode removes scales (or rings)
      // inside the polygon instead of painting them.

      // Apply like circle/rect (rings branch — original behavior).
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
      activeScaleSettings,
      setScaleColors,
      setScaleImagePatches,
      circleOffsetX,
      circleOffsetY,
      spacingY,
      getViewRect,
      withMirror,
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
        // Also clear the copy snapshot — otherwise the previous selection's
        // cells survive and Copy would re-grab them, ignoring this new (empty)
        // selection. Same for the badge count.
        lastSelectionCellsRef.current = [];
        setLastSelectionCount2(0);
        return;
      }

      // Stable order (row-major) for deterministic placement & cluster behavior
      cells.sort((a, b) => a.row - b.row || a.col - b.col);

      // Capture each cell's PRE-PAINT state synchronously. The selection
      // auto-paints rings + scales below (and clears scale image patches),
      // so reading rings/scales from a later Copy click would only see the
      // active paint color. By snapshotting now (before any setState),
      // Copy can restore the original ring colors and scale image patches
      // — e.g. preserving an image previously transferred onto the heart.
      const curScaleColors = scaleColorsRef.current;
      const curScalePatches = scaleImagePatchesRef.current;
      lastSelectionCellsRef.current = cells.map((c) => {
        const ringKey = `${c.row}-${c.col}`;
        const scaleKey = `${c.row},${c.col}`;
        const ring = rings.get(ringKey);
        const scaleColor = curScaleColors.get(scaleKey);
        const scaleImagePatch = curScalePatches.get(scaleKey);
        return {
          row: c.row,
          col: c.col,
          ring: ring ? { color: ring.color, cluster: ring.cluster } : undefined,
          scaleColor,
          scaleImagePatch,
        };
      });
      setLastSelectionCount2(cells.length);

      // Highlight selected cells (for render feedback)
      setSelectedKeys(new Set(cells.map((c) => `${c.row}-${c.col}`)));

      // PURE SELECT (Marquee toolbar button): we've already captured the
      // pre-state snapshot above and set selectedKeys for highlight/Copy.
      // Stop here — do NOT paint rings/scales into the dragged area. This
      // is the classical marquee semantic the Shapes path lacks.
      if (pureSelectModeRef.current) {
        setLastSelectionCount(cells.length);
        // Persist the screen-space rect so the user can see what was
        // captured after they release the mouse. The drawSelectionOverlay
        // function picks this up and renders a dashed outline.
        setPersistedSelectionRect({
          sx0: sel.sx0,
          sy0: sel.sy0,
          sx1: sel.sx1,
          sy1: sel.sy1,
        });
        return;
      }

      // Mirror tool: paint each cell's reflection too. The selection snapshot,
      // highlight and counts above intentionally stay on the un-mirrored cells
      // (you selected/copy the drawn region, not its reflection).
      const paintCells = withMirror(cells);

      // Apply to scales (no cluster logic). Compute next state explicitly
      // so we can push the POST-action snapshot — undo will rewind by
      // exactly one Cmd+Z.

      // Apply to rings — same POST-state pattern.
      const mapCopy: RingMap = new Map(rings);
      let clusterId = nextClusterId;

      if (eraseMode) {
        // ✅ FIX: direct delete is O(1) per cell (massively faster than scanning the map)
        for (const cell of paintCells) {
          mapCopy.delete(`${cell.row}-${cell.col}`);
        }
      } else {
        // Add rings
        for (const cell of paintCells) {
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
      pushToHistory(mapCopy, scaleColorsRef.current);
    },
    [
      rings,
      nextClusterId,
      eraseMode,
      settings,
      logicalToRowColApprox,
      rcToLogical,
      pushToHistory,
      withMirror,
    ],
  );

  // Back-compat alias: legacy callers still reference applySelectionToRings.
  // Keep this so selection finalize / overlay picking code doesn't crash.
  const applySelectionToRings = applySelectionToActiveLayer;

  const handleMouseUp = useCallback(() => {
    // Mirror tool: release commits the reference — a tap makes a point, a drag
    // makes a line. After this the tool is active and painting mirrors.
    const ms = mirrorSetRef.current;
    if (ms) {
      mirrorSetRef.current = null;
      setMirrorRefGeom(
        ms.moved
          ? { kind: "line", x0: ms.x0, y0: ms.y0, x1: ms.x1, y1: ms.y1 }
          : { kind: "point", x: ms.x0, y: ms.y0 },
      );
      drawSelectionOverlay();
      return;
    }

    // Rotate-before-paste: release commits the paste at the pivot + current
    // angle, then clears the gesture. Paste mode stays on for repeated pastes.
    const pr = pasteRotRef.current;
    if (pr) {
      pasteRotRef.current = null;
      pasteClipboardAt(pr.pivotRow, pr.pivotCol, pr.rawPivotRow, pr.angle);
      drawSelectionOverlay();
      return;
    }

    // Finish scale-plane drag — without clearing scaleDragRef, the next
    // mouseMove would keep translating the scale layer as the pointer
    // wanders the canvas after release.
    scaleDragRef.current = null;

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
    pasteClipboardAt,
    drawSelectionOverlay,
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

      // Mirror tool (single finger): begin defining the reference.
      if (
        mirrorOnRef.current &&
        !mirrorRefGeomRef.current &&
        e.touches.length === 1
      ) {
        e.preventDefault();
        const t = e.touches[0];
        const rect = getViewRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        const { lx, ly } = screenToWorld(sx, sy);
        mirrorSetRef.current = {
          x0: lx - circleOffsetX, y0: ly - circleOffsetY,
          x1: lx - circleOffsetX, y1: ly - circleOffsetY,
          sx0: sx, sy0: sy, moved: false,
        };
        drawSelectionOverlay();
        return;
      }

      // Rotate-before-paste (single finger): set anchor + pivot and arm the
      // rotate gesture. preventDefault stops the emulated tap so it won't also
      // paint/paste; touchmove rotates, touchend commits.
      if (
        pasteModeRef.current &&
        clipboardRef.current &&
        clipboardRef.current.items.length > 0 &&
        e.touches.length === 1
      ) {
        e.preventDefault();
        const t = e.touches[0];
        const rect = getViewRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        const { lx, ly } = screenToWorld(sx, sy);
        const adjLx = lx - circleOffsetX;
        const adjLy = ly - circleOffsetY;
        const { col } = logicalToRowColApprox(adjLx, adjLy);
        const rawRow = adjLy / spacingY;
        const pivotRow = snapTargetRowToParity(
          rawRow,
          clipboardRef.current.sourceMinRowParity,
        );
        const piv = rcToLogical(pivotRow, col);
        pasteRotRef.current = {
          pivotRow,
          pivotCol: col,
          rawPivotRow: rawRow,
          pivotLx: piv.x,
          pivotLy: piv.y,
          startAngle: null,
          angle: 0,
        };
        drawSelectionOverlay();
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

      // Scale plane drag (single finger)
      if (scalePlaneDragMode && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        scaleDragRef.current = {
          screenX: t.clientX,
          screenY: t.clientY,
          gridX: activeScaleSettingsRef.current.gridOffsetXmm,
          gridY: activeScaleSettingsRef.current.gridOffsetYmm,
        };
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
      scalePlaneDragMode,
      selectionMode,
      panMode,
      getViewRect,
      screenToWorld,
      drawSelectionOverlay,
      panWorldX,
      panWorldY,
      computeDimsFromSelection,
      logicalToRowColApprox,
      rcToLogical,
      circleOffsetX,
      circleOffsetY,
      spacingY,
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

      // Mirror tool (single finger): extend the reference line while defining.
      if (mirrorSetRef.current && e.touches.length === 1) {
        e.preventDefault();
        const ms = mirrorSetRef.current;
        const t = e.touches[0];
        const rect = getViewRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        const { lx, ly } = screenToWorld(sx, sy);
        ms.x1 = lx - circleOffsetX;
        ms.y1 = ly - circleOffsetY;
        if (Math.hypot(sx - ms.sx0, sy - ms.sy0) > 6) ms.moved = true;
        drawSelectionOverlay();
        return;
      }

      // Rotate-before-paste (single finger): update rotation from drag dir.
      if (pasteRotRef.current && e.touches.length === 1) {
        e.preventDefault();
        const pr = pasteRotRef.current;
        const t = e.touches[0];
        const rect = getViewRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        const { lx, ly } = screenToWorld(sx, sy);
        const dx = lx - circleOffsetX - pr.pivotLx;
        const dy = ly - circleOffsetY - pr.pivotLy;
        if (Math.hypot(dx, dy) > spacingY * 0.25) {
          const cur = Math.atan2(dy, dx);
          if (pr.startAngle === null) pr.startAngle = cur;
          pr.angle = cur - pr.startAngle;
        }
        drawSelectionOverlay();
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

      // Scale plane drag (single finger)
      if (scalePlaneDragMode && scaleDragRef.current && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        const startSx = scaleDragRef.current.screenX - rect.left;
        const startSy = scaleDragRef.current.screenY - rect.top;
        const { lx: curLx, ly: curLy } = screenToWorld(sx, sy);
        const { lx: startLx, ly: startLy } = screenToWorld(startSx, startSy);
        const newX = scaleDragRef.current.gridX + (curLx - startLx);
        const newY = scaleDragRef.current.gridY + (curLy - startLy);
        scaleDragPendingRef.current = { gridOffsetXmm: newX, gridOffsetYmm: newY };
        if (scaleDragRafRef.current == null) {
          scaleDragRafRef.current = requestAnimationFrame(() => {
            scaleDragRafRef.current = null;
            const pending = scaleDragPendingRef.current;
            if (!pending) return;
            scaleDragPendingRef.current = null;
            setAutoFollowTuner(false);
            setScaleSettingsOverride((prev) => ({ ...prev, ...pending }));
          });
        }
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
      scalePlaneDragMode,
      panMode,
      isPanning,
      screenToWorld,
      zoomAroundPoint,
      isSelecting,
      selectionMode,
      getViewRect,
      drawSelectionOverlay,
      computeDimsFromSelection,
      circleOffsetX,
      circleOffsetY,
      spacingY,
    ],
  );

  const handleTouchEndNative = useCallback(() => {
    // Always end pinch state on touch end/cancel
    pinchStateRef.current = { active: false, lastDist: 0 };

    // Mirror tool: lift commits the reference (tap = point, drag = line).
    if (mirrorSetRef.current) {
      const ms = mirrorSetRef.current;
      mirrorSetRef.current = null;
      setMirrorRefGeom(
        ms.moved
          ? { kind: "line", x0: ms.x0, y0: ms.y0, x1: ms.x1, y1: ms.y1 }
          : { kind: "point", x: ms.x0, y: ms.y0 },
      );
      drawSelectionOverlay();
      return;
    }

    // Rotate-before-paste: lift commits the paste at the pivot + angle.
    if (pasteRotRef.current) {
      const pr = pasteRotRef.current;
      pasteRotRef.current = null;
      pasteClipboardAt(pr.pivotRow, pr.pivotCol, pr.rawPivotRow, pr.angle);
      drawSelectionOverlay();
      return;
    }

    // Finish scale-plane drag (same fix as mouseUp — without this, the
    // next touchmove keeps translating the scale layer).
    scaleDragRef.current = null;

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
    pasteClipboardAt,
    drawSelectionOverlay,
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
      // Only react to the primary (left) button. Some browsers fire onClick
      // for middle/right buttons too — right-click is for paste via
      // onContextMenu, and we never want it to also paint a ring/scale.
      if (e.button !== 0) return;
      if (panMode) return;
      if (scalePlaneDragMode) return; // drag mode owns the canvas
      if (selectionMode !== "none") return; // selection tool uses drag, not click

      const { sx, sy } = getCanvasPoint(e);
      const { lx, ly } = screenToWorld(sx, sy);

      // Paste mode is handled by the press→drag→release gesture in
      // handleMouseDown/Move/Up (so the user can rotate before placing). The
      // click that follows mouseup must not paint or double-paste, so no-op.
      if (pasteMode && clipboard) {
        return;
      }

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

      // Place at the hit cell plus (Mirror tool) its reflected cell. Erase
      // deletes directly; paint resolves cluster membership per cell, feeding
      // mapCopy forward so the mirror sees the freshly placed original.
      const mapCopy: RingMap = new Map(rings);
      let clusterId = nextClusterId;
      const paintHex = normalizeColor6(activeColorRef.current);
      for (const cell of mirrorCellsFor(bestRow, bestCol)) {
        if (eraseMode) {
          mapCopy.delete(`${cell.row}-${cell.col}`);
        } else {
          const { ring, newCluster } = resolvePlacement(
            cell.col,
            cell.row,
            mapCopy,
            clusterId,
            paintHex,
            settings,
          );
          ring.color = paintHex;
          // V2: stamp the active calibrated ring (brush) onto this cell so it
          // renders at that ring's size; mixing multiple sizes in one design.
          if (activeRingSetIdRef.current) ring.sizeId = activeRingSetIdRef.current;
          mapCopy.set(`${ring.row}-${ring.col}`, ring);
          clusterId = newCluster;
        }
      }

      setRings(mapCopy);
      setnextClusterId(clusterId);
      // Push POST-paint state so a single Cmd+Z rewinds exactly this click.
      pushToHistoryDebounced(mapCopy, scaleColorsRef.current);

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
      scalePlaneDragMode,
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
      pushToHistoryDebounced,
      pasteMode,
      clipboard,
      pasteClipboardAt,
      mirrorCellsFor,
    ],
  );

  // ===============================
  // RIGHT-CLICK PASTE
  // ===============================
  // Conventional copy/paste: after copying a selection (Cmd/Ctrl+C), right-click
  // anywhere on the canvas to paste the clipboard centered at that point.
  // Equivalent on iPad: long-press the canvas (Safari fires contextmenu on
  // long-press when touch-action is "none", which the interaction canvas sets).
  // Falls through silently if the clipboard is empty so the browser context
  // menu still doesn't appear (per the design canvas owning the gesture).
  const handleContextMenuPaste = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const cb = clipboardRef.current;
      if (!cb || cb.items.length === 0) return;
      const { sx, sy } = getCanvasPoint(e);
      const { lx, ly } = screenToWorld(sx, sy);
      const adjLx = lx - circleOffsetX;
      const adjLy = ly - circleOffsetY;
      // Compute the *fractional* row from the cursor's world Y so the
      // parity snap inside pasteClipboardAt can pick the nearest
      // matching-parity row (instead of always nudging +1).
      const rawRow = adjLy / spacingY;
      const { col } = logicalToRowColApprox(adjLx, adjLy);
      pasteClipboardAt(Math.round(rawRow), col, rawRow);
      // Drop out of marquee mode and clear the visible selection so the
      // user is back in paint mode for follow-up edits. The effect on
      // selectionMode also clears pureSelectMode and persistedSelectionRect.
      setSelectionMode("none");
      setSelectedKeys(new Set());
      // Paste committed — dismiss the ghost so it doesn't linger.
      setPastePreviewActive(false);
    },
    [
      getCanvasPoint,
      screenToWorld,
      circleOffsetX,
      circleOffsetY,
      spacingY,
      logicalToRowColApprox,
      pasteClipboardAt,
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
    // V2: clear per-cell scale meta too.
    writeScaleMeta(new Map());

    // ✅ Clear any image-overlay patches that were transferred onto scales.
    // Without this, a fresh design that re-uses the same row/col coordinates
    // would silently inherit the previous Image Fill texture.
    setScaleImagePatches(new Map());

    // ✅ Reset the user-adjusted image-overlay mask so the next overlay
    // starts from the new design's auto bounds.
    setOverlayMaskOverride(null);

    // ✅ Clear selection / overlay selection
    setSelectedKeys(new Set());
    setOverlayMaskKeys(new Set());

    // ✅ Clear any cached hit canvas pixels (prevents "stuck" scales)
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
    setScaleImagePatches,
    setOverlayMaskOverride,
    setSelectedKeys,
    setOverlayMaskKeys,
    clearInteractionCanvas,
    writeScaleMeta,
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

    // Snap every floating panel back to its default position + zoom. This is
    // the shared, reload-free reset used by Designer too: it clears the saved
    // pill positions AND tells the live panels to move, so a panel that got
    // dragged/stuck off-screen actually returns (the old per-id localStorage
    // clear here did nothing to already-mounted panels).
    resetAllPills();
  }, [clearInteractionCanvas, scheduleDrawHitCircles]);
  // ===============================
  // Ring Set loading (Tuner + JSON)
  // ===============================
  const reloadRingSets = useCallback(() => {
    // Tuner is hidden for the first release (per Erin). Stale Tuner ring sets in
    // localStorage must NOT drive the lattice — otherwise auto-follow applies an
    // old saved size over the intended default (16 ga / 5/16" / AR 5.0). Keeping
    // ringSets empty makes every auto-follow + tilt effect inert (they all early
    // -return on an empty list), so the default geometry stands. Flip this back
    // to re-enable the calibrated-rings palette when the Tuner returns.
    const TUNER_FEATURE_ENABLED = false;
    if (!TUNER_FEATURE_ENABLED) {
      setRingSets([]);
      return;
    }
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

  // Keep the Calibrated Rings palette current: refresh when the tab regains
  // focus (e.g. after saving a ring in the Tuner) or when another tab writes
  // the matrix.
  useEffect(() => {
    const refresh = () => reloadRingSets();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [reloadRingSets]);

  useEffect(() => {
    if (!ringSets.length) return;

    // Auto-follow keeps the GLOBAL base lattice in sync with the latest Tuner
    // save. Manual selection is a per-cell BRUSH only — it must NOT call
    // applyRingSet (that changes centerSpacing/ID/wire globally and would
    // reposition/resize every existing ring, i.e. the "jump" bug). The brush's
    // size is captured per cell at paint time instead.
    if (autoFollowTuner) {
      const latest = ringSets[ringSets.length - 1];
      applyRingSet(latest);
    }
  }, [ringSets, autoFollowTuner, applyRingSet]);

  // Ring TILT (Angle In/Out) must reflect the active/latest Tuner ring set even
  // when NOT auto-following — otherwise a manually-selected brush ring leaves the
  // rings flat on first load until the user toggles "Auto" (which runs
  // applyRingSet). Applying just the tilt here is safe: unlike applyRingSet it
  // never changes ID/wire/centerSpacing, so it can't reposition the lattice
  // ("jump" bug). The ref applies a given set's tilt once, so a manual override
  // via the Ring Angle sliders persists across ring-set reloads.
  const appliedAngleSetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ringSets.length) return;
    const active =
      (activeRingSetId && ringSets.find((r) => r.id === activeRingSetId)) ||
      ringSets[ringSets.length - 1];
    if (!active) return;
    if (appliedAngleSetRef.current === active.id) return;
    appliedAngleSetRef.current = active.id;
    setAngleIn(active.angleIn ?? 25);
    setAngleOut(active.angleOut ?? -25);
  }, [ringSets, activeRingSetId]);

  useEffect(() => {
    safeLSSet(AUTO_FOLLOW_KEY, autoFollowTuner ? "true" : "false");
  }, [autoFollowTuner]);

  useEffect(() => {
    if (activeRingSetId) safeLSSet(ACTIVE_SET_KEY, activeRingSetId);
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
        // V2: persist per-cell ring size so mixed-size designs reload intact.
        ...((r as any).sizeId ? { sizeId: (r as any).sizeId } : {}),
      })),
      geometry: {
        innerDiameter: innerIDmm,
        wireDiameter: wireMm,
        centerSpacing,
        angleIn,
        angleOut,
      },
      overlay: overlay
        ? {
            dataUrl: overlay.dataUrl,
            scale: overlay.scale,
            rotation: overlay.rotation,
            offsetX: overlay.offsetX,
            offsetY: overlay.offsetY,
            opacity: overlay.opacity,
            repeat: overlay.repeat,
            patternScale: overlay.patternScale,
          }
        : null,
      paletteAssignment: assignment,
      metadata: {
        page: "freeform",
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        thumbnail: thumb,
      },
    };

    // persist to workspace index + payload (best-effort; large overlays may exceed quota)
    try {
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
      localStorage.setItem(`chainmail.project:${id}`, JSON.stringify(payload));
    } catch {
      // QuotaExceededError — project still downloads as a file below
    }

    return payload; // ProjectSaveLoadButtons will still download this JSON
  }, [
    rings,
    innerIDmm,
    wireMm,
    centerSpacing,
    angleIn,
    angleOut,
    assignment,
    scaleColors,
    activeScaleSettings,
    overlay,
    getRendererCanvas,
  ]);

  const loadFreeformProject = useCallback(
    (data: any, resetView = true) => {
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
          // V2: restore per-cell ring size so mixed-size designs reload intact.
          ...(typeof r.sizeId === "string" ? { sizeId: r.sizeId } : {}),
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
        safeLSSet(
          "freeform.paletteAssignment",
          JSON.stringify(data.paletteAssignment),
        );
      }

      // Restore scale colors
      if (Array.isArray(data.scaleColors)) {
        const newScaleColors = new Map<string, string>();
        for (const entry of data.scaleColors) {
          if (entry && typeof entry.key === "string" && typeof entry.color === "string") {
            newScaleColors.set(entry.key, entry.color);
          }
        }
        setScaleColors(newScaleColors);
      }
      // V2: the save format doesn't persist per-cell scale meta yet, so reset it
      // on load — loaded scales fall back to the design's global shape (legacy
      // behavior) and never inherit a previous in-session design's overrides.
      // (Persisting/restoring meta is a tracked follow-up slice.)
      writeScaleMeta(new Map());

      // Restore scale settings via tuner snapshot
      if (data.scaleSettings && typeof data.scaleSettings === "object") {
        const newSnapshot: TunerSnapshot = { ...data, scaleSettings: data.scaleSettings };
        safeLSSet(FREEFORM_TUNER_SNAPSHOT_KEY, JSON.stringify(newSnapshot));
        setTunerSnapshot(newSnapshot);
      }

      // Restore image overlay
      if (data.overlay && data.overlay.dataUrl) {
        setOverlay(data.overlay as OverlayState);
      } else {
        setOverlay(null);
      }

      // Center viewport on the loaded rings so the template is fully visible
      // and new rings can be placed relative to it correctly.
      if (resetView && map.size > 0) {
        const newCS = (data.geometry?.centerSpacing as number | undefined) ?? centerSpacing;
        const newSY = newCS * 0.866;
        let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
        map.forEach((r) => {
          if (r.row < minR) minR = r.row;
          if (r.row > maxR) maxR = r.row;
          if (r.col < minC) minC = r.col;
          if (r.col > maxC) maxC = r.col;
        });
        const minLX = minC * newCS + ((minR & 1) ? newCS / 2 : 0);
        const minLY = minR * newSY;
        const maxLX = maxC * newCS + ((maxR & 1) ? newCS / 2 : 0);
        const maxLY = maxR * newSY;
        setPanWorldX((minLX + maxLX) / 2);
        setPanWorldY((minLY + maxLY) / 2);
        setZoom(1.0);
      } else if (resetView) {
        setPanWorldX(0);
        setPanWorldY(0);
        setZoom(1.0);
      }
    },
    [innerIDmm, wireMm, centerSpacing, angleIn, angleOut, setTunerSnapshot],
  );

  const handleLibraryLoad = useCallback(
    (data: any, mode: LoadMode) => {
      if (mode === "replace") {
        loadFreeformProject(data);
        return;
      }
      // Append: col-offset all rings and scaleColors to the right of existing canvas
      const currentCols = Array.from(rings.values()).map((r) => r.col);
      const maxExistingCol = currentCols.length > 0 ? Math.max(...currentCols) : -1;
      const incomingRings: any[] = Array.isArray(data.rings) ? data.rings : [];
      const incomingCols = incomingRings.map((r: any) => r.col ?? 0);
      const minIncomingCol = incomingCols.length > 0 ? Math.min(...incomingCols) : 0;
      const colOffset = maxExistingCol - minIncomingCol + 2;

      const shiftedRings = incomingRings.map((r: any) => ({ ...r, col: r.col + colOffset }));
      const shiftedScaleColors = Array.isArray(data.scaleColors)
        ? data.scaleColors.map((s: any) => {
            const [row, col] = (s.key ?? "0,0").split(",").map(Number);
            return { ...s, key: `${row},${col + colOffset}` };
          })
        : [];

      const merged = {
        ...data,
        type: "freeform",
        rings: shiftedRings,
        scaleColors: shiftedScaleColors,
        // Don't restore overlay or scaleSettings in append mode — keep current ones
        overlay: undefined,
        scaleSettings: undefined,
      };
      loadFreeformProject(merged, false); // keep current viewport in append mode
    },
    [rings, loadFreeformProject],
  );

  // ====================================================
  // Manual JSON load
  // ====================================================
  const handleFileJSONLoad = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) { e.target.value = ""; return; }

      const inputEl = e.target;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(String(ev.target?.result || "{}"));

          // Ring geometry: support both snapshot format (data.ringGeometry.*) and flat format
          const geo = (data.ringGeometry && typeof data.ringGeometry === "object") ? data.ringGeometry : data;
          if (typeof geo.innerDiameter === "number") setInnerIDmm(geo.innerDiameter);
          if (typeof geo.wireDiameter === "number") setWireMm(geo.wireDiameter);
          if (typeof geo.centerSpacing === "number") setCenterSpacing(geo.centerSpacing);
          if (typeof geo.angleIn === "number") setAngleIn(geo.angleIn);
          if (typeof geo.angleOut === "number") setAngleOut(geo.angleOut);

          // Scale settings: data.scaleSettings (Tuner snapshot format) or flat fields
          const scaleSrc = (data.scaleSettings && typeof data.scaleSettings === "object")
            ? data.scaleSettings
            : data;
          const hasScaleFields =
            typeof scaleSrc.scaleHoleDiameter === "number" ||
            typeof scaleSrc.scaleWidth === "number" ||
            typeof scaleSrc.scalePlaneZ === "number" ||
            typeof scaleSrc.holeIdMm === "number";

          if (hasScaleFields) {
            const newSnapshot: TunerSnapshot = { ...data, scaleSettings: scaleSrc };
            safeLSSet(FREEFORM_TUNER_SNAPSHOT_KEY, JSON.stringify(newSnapshot));
            setTunerSnapshot(newSnapshot);
          }

          const newId = data.id || `file:${file.name}`;
          setActiveRingSetId(newId);
          setAutoFollowTuner(false);
        } catch (err) {
          alert("Could not parse JSON file.");
          console.error(err);
        } finally {
          inputEl.value = "";
        }
      };
      reader.onerror = () => { inputEl.value = ""; };

      reader.readAsText(file);
    },
    [setTunerSnapshot],
  );

  const handleSaveJSON = useCallback(() => {
    const snap: Record<string, any> = {
      id: `freeform-${Date.now()}`,
      savedAt: new Date().toISOString(),
      ringGeometry: {
        innerDiameter: innerIDmm,
        wireDiameter: wireMm,
        centerSpacing,
        angleIn,
        angleOut,
      },
      // Flat ring fields for Tuner ring-set import compatibility
      innerDiameter: innerIDmm,
      wireDiameter: wireMm,
      centerSpacing,
      angleIn,
      angleOut,
    };
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freeform-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [innerIDmm, wireMm, centerSpacing, angleIn, angleOut, activeScaleSettings]);
  



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
      bgColor: canvasBg,
      centerSpacing,
    }),
    [innerIDmm, wireMm, centerSpacing, maxRowSpan, maxColSpan, canvasBg],
  );


  // ====================================================
  // RENDER
  // ====================================================
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: canvasBg,
        display: "flex",
        flexDirection: "row",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Calibrated Rings strip — Rings layer + the ring icon toggled open.
          Lists Tuner-saved ring sets; click to use one as the brush. */}
      {activeLayer === "rings" && elementStripOpen && (
      <DraggablePill id="calibrated-rings-pill" defaultPosition={{ x: 250, y: 20 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: 10,
            background: "rgba(11,18,32,0.92)",
            border: "1px solid #1e293b",
            borderRadius: 14,
            minWidth: 56,
            maxWidth: 64,
          }}
        >
          <div
            title="Calibrated Rings"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, lineHeight: 1.1 }}
          >
            <span style={{ fontSize: 14 }}>🔗</span>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>{ringSets.length}</span>
          </div>

          {ringSets.length === 0 ? (
            <div style={{ fontSize: 9.5, color: "#64748b", lineHeight: 1.3, textAlign: "center" }}>
              Save rings in the Tuner
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, maxHeight: 292 /* ~5 swatches (52px + 8 gap); more scroll */, overflowY: "auto" }}>
              {(() => {
                // Draw each ring to its TRUE relative proportions: a circle whose
                // stroke = wire diameter and centerline radius = (ID+WD)/2, scaled
                // so the largest ring's outer edge fills the cell. Hover shows the
                // numbers (ID / wire / AR) instead of cluttering the swatch.
                const CELL = 44;
                const PAD = 4;
                const avail = CELL / 2 - 2; // px available for the outer radius
                const maxOD = ringSets.reduce(
                  (m, r) => Math.max(m, r.innerDiameter + 2 * r.wireDiameter),
                  0.001,
                );
                const mmToPx = avail / (maxOD / 2);
                return ringSets.map((rs) => {
                  const active = rs.id === activeRingSetId;
                  const ringR = ((rs.innerDiameter + rs.wireDiameter) / 2) * mmToPx;
                  const wirePx = Math.max(1.2, rs.wireDiameter * mmToPx);
                  // Color by Atlas/Tuner solution status: green = valid,
                  // yellow = rings_only, red = no_solution (gray if unknown).
                  const statusColor =
                    rs.status === "valid"
                      ? "#19c37d"
                      : rs.status === "rings_only"
                        ? "#f59e0b"
                        : rs.status === "no_solution"
                          ? "#ef4444"
                          : "#c7ced8";
                  return (
                    <button
                      key={rs.id}
                      type="button"
                      onClick={() => {
                        // Selecting a ring sets the BRUSH for new rings (like the
                        // scale-shape picker). A manual pick stops auto-following
                        // the Tuner.
                        setAutoFollowTuner(false);
                        try {
                          localStorage.setItem(AUTO_FOLLOW_KEY, "false");
                          localStorage.setItem(ACTIVE_SET_KEY, rs.id);
                        } catch {}
                        if (rings.size === 0) {
                          // First ring chosen in an empty project: adopt this
                          // ring's spacing/geometry so the lattice AND the guide
                          // dots match the ring, not the default.
                          applyRingSet(rs);
                        } else {
                          // Rings already placed: only set the brush so we don't
                          // resize existing rings or shift a mixed-size lattice.
                          setActiveRingSetId(rs.id);
                        }
                      }}
                      title={`${rs.id} — ID ${rs.innerDiameter.toFixed(2)} · WD ${rs.wireDiameter.toFixed(2)} mm${rs.aspectRatio ? ` · AR ${rs.aspectRatio}` : ""}`}
                      style={{
                        width: CELL + PAD * 2,
                        height: CELL + PAD * 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        borderRadius: 10,
                        border: active ? "1px solid #3b82f6" : "1px solid #1e293b",
                        background: active ? "rgba(37,99,235,0.22)" : "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                      }}
                    >
                      <svg width={CELL} height={CELL} viewBox={`0 0 ${CELL} ${CELL}`} style={{ display: "block" }}>
                        <circle
                          cx={CELL / 2}
                          cy={CELL / 2}
                          r={Math.max(2, ringR)}
                          fill="none"
                          stroke={statusColor}
                          strokeWidth={wirePx}
                        />
                      </svg>
                    </button>
                  );
                });
              })()}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <label title="Auto-follow Tuner" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#94a3b8", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoFollowTuner}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAutoFollowTuner(v);
                  try {
                    localStorage.setItem(AUTO_FOLLOW_KEY, String(v));
                  } catch {}
                }}
              />
              Auto
            </label>
            <button
              type="button"
              onClick={() => reloadRingSets()}
              title="Refresh from Tuner"
              style={{
                background: "transparent",
                border: "1px solid #1e293b",
                borderRadius: 8,
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: 11,
                padding: "3px 9px",
              }}
            >
              ↻
            </button>
          </div>
        </div>
      </DraggablePill>
      )}

      {/* Scales strip — Scales layer + the scale icon toggled open. Lists the
          scale shapes; click one to set the active shape (mirrors rings strip). */}

      <DraggablePill id="freeform-toolbar" defaultPosition={{ x: 20, y: 20 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            // Gap + width + padding all reduced ~20% to match the smaller
            // ToolBtn (44 → 35) so the column fits on shorter viewports.
            gap: 8,
            alignItems: "center",
            width: 45,
            padding: "8px 5px",
            background: "#0f172a",
            border: "1px solid #0b1020",
            borderRadius: 16,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            userSelect: "none",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <ToolBtn
            active={showCompass}
            onClick={() => setShowCompass((v) => !v)}
            title="Navigation Menu"
          >
            <IconHamburger size={18} />
          </ToolBtn>

          <ToolBtn
            active={!toolbarCollapsed}
            onClick={() => setToolbarCollapsed((v) => !v)}
            title={toolbarCollapsed ? "Expand tools" : "Collapse tools"}
          >
            {toolbarCollapsed ? "▸" : "▾"}
          </ToolBtn>

          <ToolBtn
            onClick={() => setFinalizeOpen(true)}
            title="Finalize & Export (SKU mapping, numbered maps, true-size print)"
          >
            📦
          </ToolBtn>

          <ToolBtn
            active={showUtilityPanel}
            onClick={() => setShowUtilityPanel((v) => !v)}
            title={
              showUtilityPanel
                ? "Hide utility panel"
                : "Show utility panel (toolbox, save/load, reset)"
            }
          >
            ⚙️
          </ToolBtn>

          {/* Paint/Erase toggle + Pan hand live in the always-visible top half
              of the toolbar, so they stay reachable even when the tools below
              are collapsed. Unified Paint ⇄ Erase toggle (icon swaps). */}
          <ToolBtn
            active={selectionMode === "none"}
            onClick={() => {
              // Already in the draw tool: flip paint ⇄ erase. Coming from a
              // shape/select tool: just return to drawing (no flip).
              if (selectionMode === "none") setEraseMode((v) => !v);
              setSelectionMode("none");
              clearSelectionState();
              cancelOverlayPickingIfActive();
              if (isSelecting) {
                setIsSelecting(false);
                selectionRef.current = null;
                clearInteractionCanvas();
              }
            }}
            title={eraseMode ? "Erase (click to paint)" : "Paint (click to erase)"}
          >
            {eraseMode ? <IconEraser size={18} /> : "🎨"}
          </ToolBtn>

          <ToolBtn
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
          </ToolBtn>

          {!toolbarCollapsed && (
            <div style={isPreviewOnly ? { opacity: 0.3, pointerEvents: "none", display: "contents" } : { display: "contents" }}>
              <ToolBtn
                onClick={handleUndoAction}
                title="Undo (Ctrl+Z)"
                style={{ opacity: canUndo ? 1 : 0.35, cursor: canUndo ? "pointer" : "default" }}
              >
                <IconUndo size={18} />
              </ToolBtn>

              <ToolBtn
                onClick={handleRedoAction}
                title="Redo (Ctrl+Shift+Z)"
                style={{ opacity: canRedo ? 1 : 0.35, cursor: canRedo ? "pointer" : "default" }}
              >
                <IconRedo size={18} />
              </ToolBtn>

              <ToolBtn
                active={selectionMode !== "none" && !pureSelectMode}
                onClick={() => {
                  setShapePanelOpen((v) => !v);
                  setPanMode(false);
                  clearSelectionState();
                }}
                title="Shapes (select-and-fill: square/circle/hex/etc.)"
              >
                <IconSquare />
              </ToolBtn>

              {/* Calibrated rings strip toggle hidden for the first release
                  (per Erin) — the strip is fed by the Tuner, which is hidden
                  until scales return, so the picker has nothing to show. The
                  strip + state remain in the code, just no toggle to open it. */}

              {shapeEditor && (
                <CustomShapeEditor
                  initial={
                    shapeEditor.mode === "edit" ? shapeEditor.initial : null
                  }
                  onCancel={() => setShapeEditor(null)}
                  onSave={(saved, makeDefault) => {
                    // Persist to localStorage IMMEDIATELY in addition to
                    // setting React state. If we don't, the
                    // saveDefaultScaleShape() call below dispatches
                    // CUSTOM_SHAPES_EVENT and the listener at line 1140
                    // re-hydrates customShapeEntries from localStorage —
                    // which would wipe the freshly-saved shape (it wasn't
                    // there yet). Matches the Tuner's handler.
                    setCustomShapeEntries((prev) => {
                      const idx = prev.findIndex((e) => e.id === saved.id);
                      const next =
                        idx === -1
                          ? [...prev, saved]
                          : prev.map((e, i) => (i === idx ? saved : e));
                      saveCustomShapes(next);
                      return next;
                    });
                    // Auto-select the just-saved entry and apply geometry.
                    setSelectedShapeMenuId(saved.id);
                    const rendererShape =
                      saved.source === "base"
                        ? (saved.baseShape ?? "leaf") // Standard, never teardrop
                        : saved.id;
                    setScaleSettingsOverride((prev) => ({
                      ...prev,
                      shape: rendererShape,
                    }));
                    if (makeDefault) saveDefaultScaleShape(rendererShape);
                    setShapeEditor(null);
                  }}
                />
              )}

              <ShapePanel
                open={shapePanelOpen}
                onClose={() => setShapePanelOpen(false)}
                active={selectionMode === "none" ? "square" : selectionMode}
                onPick={(t) => {
                  setSelectionMode((m) => (m === t ? "none" : t));
                  // Picking via the ShapePanel always means select-and-fill;
                  // drop any prior pure-select intent from the Marquee button.
                  setPureSelectMode(false);
                  setPanMode(false);
                  // Mutually exclusive with the scale-plane drag tool: that
                  // mode hijacks mousedown before selection ever fires, so
                  // forgetting to clear it leaves selection drags inert
                  // (cursor still shows crosshair from the selection toolbar
                  // active state — confusing). Mirrors the inverse exclusion
                  // already enforced by the scale-plane-drag button.
                  setScalePlaneDragMode(false);
                  scaleDragRef.current = null;
                  clearSelectionState();

                  if (isSelecting) {
                    setIsSelecting(false);
                    selectionRef.current = null;
                    clearInteractionCanvas();
                  }

                  setShapePanelOpen(false);
                }}
              />

              {/* Pan hand moved to the always-visible top of the toolbar. */}

              {/* Mirror draw — set a reference on the canvas (tap = point /
                  180° reflection; drag = an axis line), then every ring/scale
                  painted or erased is also applied to its reflection until the
                  tool is toggled off. (The old scale-plane drag tool that lived
                  here is still available via the gear panel's X/Y scale grid
                  offset sliders.) */}
              <ToolBtn
                active={mirrorOn}
                onClick={() => {
                  setMirrorOn((v) => {
                    const next = !v;
                    if (!next) setMirrorRefGeom(null); // off clears the reference
                    return next;
                  });
                  mirrorSetRef.current = null;
                  // Mutually exclusive with pan / scale-plane / selection.
                  setPanMode(false);
                  setScalePlaneDragMode(false);
                  setSelectionMode("none");
                  clearSelectionState();
                  if (isSelecting) {
                    setIsSelecting(false);
                    selectionRef.current = null;
                    clearInteractionCanvas();
                  }
                  drawSelectionOverlay();
                }}
                title={
                  !mirrorOn
                    ? "Mirror draw — tap to set a point, or drag to set an axis; then painting mirrors across it"
                    : mirrorRefGeom
                      ? "Mirror ON — painting mirrors across your reference (toggle off to stop)"
                      : "Mirror: tap a point or drag an axis on the canvas to set the reference"
                }
              >
                <IconMirror size={18} />
              </ToolBtn>

              {/* Marquee select — direct entry to PURE rectangle selection.
                  Conventional copy/paste flow: click this → drag a rectangle
                  on the canvas → Cmd/Ctrl+C → right-click anywhere to paste.
                  Critically, unlike the legacy ShapePanel "square" tool,
                  this does NOT paint rings into the dragged area — it only
                  selects existing rings/scales there. The pureSelectMode
                  flag toggled here is read inside applySelectionToActiveLayer
                  to skip the auto-paint step. */}
              <ToolBtn
                active={selectionMode === "square" && pureSelectMode}
                onClick={() => {
                  const wasActive = selectionMode === "square" && pureSelectMode;
                  if (wasActive) {
                    setSelectionMode("none"); // effect clears pureSelectMode
                    // User explicitly toggled marquee off — also dismiss
                    // the paste-preview ghost so the canvas is fully clean.
                    setPastePreviewActive(false);
                  } else {
                    setSelectionMode("square");
                    setPureSelectMode(true);
                  }
                  setPanMode(false);
                  setScalePlaneDragMode(false);
                  setEraseMode(false);
                  scaleDragRef.current = null;
                }}
                title="Marquee select — drag a rectangle on the canvas to select existing rings/scales (no painting), then Cmd/Ctrl+C to copy and right-click to paste"
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 18,
                    height: 18,
                    border: "2px dashed currentColor",
                    borderRadius: 2,
                  }}
                />
              </ToolBtn>

              {/* Copy selection (rings + scales) — Cmd/Ctrl+C */}
              <ToolBtn
                onClick={copySelectionToClipboard}
                title={(() => {
                  // Source matches copySelectionToClipboard: prefer live
                  // selectedKeys, else fall back to last-applied selection.
                  const n = selectedKeys.size > 0 ? selectedKeys.size : lastSelectionCount2;
                  if (n === 0) return "Copy (Cmd/Ctrl+C) — pick a shape tool and drag on the canvas first";
                  return `Copy ${n} cell${n === 1 ? "" : "s"} (Cmd/Ctrl+C)`;
                })()}
                style={{
                  opacity:
                    selectedKeys.size === 0 && lastSelectionCount2 === 0 ? 0.45 : 1,
                  position: "relative",
                }}
              >
                📋
                {clipboard && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 1,
                      right: 2,
                      fontSize: 8,
                      lineHeight: 1,
                      color: "#22c55e",
                      fontWeight: 800,
                    }}
                    title={`${clipboard.items.length} on clipboard`}
                  >
                    {clipboard.items.length}
                  </span>
                )}
              </ToolBtn>

              {/* Paste mode toggle — Cmd/Ctrl+V then click on the canvas */}
              <ToolBtn
                active={pasteMode}
                onClick={() => {
                  if (!clipboard) return;
                  setPasteMode((v) => !v);
                }}
                title={
                  !clipboard
                    ? "Paste (Cmd/Ctrl+V) — copy something first"
                    : pasteMode
                      ? "Exit paste mode (Esc)"
                      : `Paste ${clipboard.items.length} cell${clipboard.items.length === 1 ? "" : "s"} — click on canvas to place (Cmd/Ctrl+V)`
                }
                style={{ opacity: !clipboard ? 0.45 : 1 }}
              >
                📌
              </ToolBtn>

              {/* Image Overlay — Studio only */}
              <ToolBtn
                active={showImageOverlay}
                onClick={() => {
                  if (isStudioTier) setShowImageOverlay((v) => !v);
                  else if (!HIDE_STORE_PURCHASE_UI) window.location.href = "/auth?mode=upgrade";
                }}
                title={isStudioTier ? "Image overlay (apply to rings)" : "Image Overlay (Studio)"}
                style={{ opacity: isStudioTier ? 1 : 0.45, position: "relative" }}
              >
                🖼️{!isStudioTier && <span style={{ position: "absolute", top: 2, right: 2, fontSize: 8, lineHeight: 1 }}>🔒</span>}
              </ToolBtn>

              {/* Clear */}
              <ToolBtn onClick={handleClear} title="Clear all">
                🧹
              </ToolBtn>
            </div>
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
              width: 56,
              padding: "10px 6px",
              background: "rgba(15,23,42,0.96)",
              border: "1px solid #0b1020",
              borderRadius: 20,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              userSelect: "none",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <ToolBtn
              active={showControls}
              onClick={() => setShowControls((v) => !v)}
              title="Geometry & JSON controls"
            >
              🧰
            </ToolBtn>

            <ProjectSaveLoadButtons
              onSave={saveFreeformProject}
              onLoad={(json) => {
                if (!window.confirm("Load project and replace current work?"))
                  return;
                loadFreeformProject(json);
              }}
            />

            <ToolBtn
              active={libraryOpen}
              onClick={() => setLibraryOpen((v) => !v)}
              title="Design Library — browse starter templates & saved projects"
            >
              📚
            </ToolBtn>

            {/* Cost Estimator removed 2026-06-01 — no longer a product
                feature. (Old toolbar 💰 button + FreeformCostPanel render
                + COST_ESTIMATOR_FEATURE_ENABLED flag all gone.) */}

            {/* Canvas background — dark/light toggle */}
            <button
              onClick={() => updateCanvasBg(canvasBg === "#020617" ? "#f8fafc" : "#020617")}
              title={canvasBg === "#020617" ? "Switch to light background" : "Switch to dark background"}
              style={{
                width: 44, height: 44, borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#1f2937", color: "#d1d5db",
                cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 20, flexShrink: 0,
              }}
            >
              {canvasBg === "#020617" ? "🌙" : "☀️"}
            </button>

            {/* Any-colour picker — rainbow button triggers hidden input */}
            <label
              title="Custom canvas background colour"
              style={{
                width: 44, height: 44, borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#1f2937",
                cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 20, flexShrink: 0, position: "relative",
              }}
            >
              🌈
              <input
                type="color"
                value={canvasBg}
                onChange={(e) => updateCanvasBg(e.target.value)}
                style={{
                  position: "absolute", inset: 0,
                  opacity: 0, width: "100%", height: "100%",
                  cursor: "pointer", padding: 0, border: "none",
                }}
              />
            </label>

            <ToolBtn
              onClick={() => {
                if (!window.confirm("Reset UI layout and view settings?"))
                  return;
                resetUI();
              }}
              title="Reset UI (layout + view + tool states)"
            >
              ♻️
            </ToolBtn>
            <button
              onClick={() => setShowFreeformStats((v) => !v)}
              title={
                showFreeformStats
                  ? "Hide Studio Stats"
                  : "Show Studio Stats"
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
      {!isPreviewOnly && <DraggablePill
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
            cursor: "grab",
          }}
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
            {/* Spline toggle */}
            <button
              type="button"
              title="Spline — draw bezier curves"
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
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
              }}
            >
              <IconSpline size={14} />
            </button>
            {/* Supplier colors toggle */}
            <button
              type="button"
              title="Browse supplier colors"
              onClick={() => setShowSupplierColors((v) => !v)}
              style={{
                width: 30,
                height: 26,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: showSupplierColors
                  ? "rgba(180,83,9,0.7)"
                  : "rgba(255,255,255,0.06)",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 13,
                userSelect: "none",
              }}
            >
              🏭
            </button>
            {/* Auto color-calibration — small "C" button. Runs a headless
                calibration in place (progress bar only), then auto-saves +
                applies. No page or dialog. */}
            <AutoCalibrateButton from="freeform" />
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
              onPointerDown={(e) => e.stopPropagation()}
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
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 8,
              width: "100%",
              minWidth: 264,
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

          {/* Supplier color browser — will be replaced in Wave 4 with a
              generic URL-based 'Check Available Colors' flow that doesn't
              name any specific supplier. For now the existing browser
              still mounts when toggled on; the auto-refresh button is gone. */}
          {showSupplierColors && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
              <SupplierColorPalette
                activeColor={activeColor}
                paletteColors={colorPalette}
                onSelectColor={(hex, _name) => {
                  const norm = normalizeColor6(hex);
                  setActiveColor(norm);
                  setEraseMode(false);
                  // Add to palette if not already present
                  setColorPalette((prev) => {
                    const lo = norm.toLowerCase();
                    if (prev.some((c) => c.toLowerCase() === lo)) return prev;
                    return [...prev, norm];
                  });
                }}
              />
            </div>
          )}
        </div>
      </DraggablePill>}

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

      {/* Always-on recovery control: snap every floating panel back to its
          default position + zoom if one gets dragged or stuck off-screen.
          Reload-free (no lost work). Anchored top-right so its (invisible) hit
          rect never sits over the bottom-left color palette / spline controls
          or the bottom-right stats + zoom controls. */}
      <button
        onClick={resetAllPills}
        title="Reset floating panels to their default positions"
        style={{
          position: "fixed",
          right: "calc(12px + env(safe-area-inset-right))",
          top: "calc(12px + env(safe-area-inset-top))",
          zIndex: 100000,
          padding: "6px 9px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(15,23,42,.82)",
          color: "#dbeafe",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        ⟲ Reset
      </button>

      {/* Interference-check result banner — only while the on-demand check is
          on. Red when overlaps are found (offending rings tinted on canvas),
          green confirmation when the design is clean. Non-blocking. */}
      {interferenceCheckOn && (
        <div
          style={{
            position: "fixed",
            top: isPreviewOnly ? 48 : 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9998,
            background: overlapCount > 0 ? "rgba(127,29,29,0.96)" : "rgba(6,78,59,0.96)",
            border: `1px solid ${overlapCount > 0 ? "#ef4444" : "#10b981"}`,
            color: overlapCount > 0 ? "#fee2e2" : "#d1fae5",
            padding: "8px 14px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            maxWidth: "90vw",
          }}
        >
          {overlapCount > 0 ? (
            <>
              <span>⚠️</span>
              <span>
                {overlapCount} ring{overlapCount === 1 ? "" : "s"} won’t weave at this spacing — size mismatch with neighbors (shown in red)
              </span>
            </>
          ) : (
            <>
              <span>✅</span>
              <span>Interference check: no mismatched-size overlaps found</span>
            </>
          )}
        </div>
      )}

      {showFreeformStats && (
        <DraggablePill
          id="freeform-stats"
          // Bottom-right corner: large x/y let DraggablePill's viewport clamp
          // snap the panel flush to the bottom-right once its size is measured.
          defaultPosition={{
            x: typeof window !== "undefined" ? window.innerWidth : 1200,
            y: typeof window !== "undefined" ? window.innerHeight : 900,
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
            onPointerDown={(e) => e.stopPropagation()}
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
                <strong style={{ fontSize: 14 }}>📏 Studio Stats</strong>
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

            {/* Overlap warning line */}
            {overlapCount > 0 && (
              <div
                style={{
                  marginBottom: 10,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgba(127,29,29,0.5)",
                  border: "1px solid #ef4444",
                  color: "#fecaca",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontWeight: 700,
                }}
                title="Rings where a different-size neighbor intrudes into their space, so they can't weave together. Same-size tightness is judged in the Tuner. Shown in red on the canvas."
              >
                <span>⚠️ Overlapping</span>
                <span>{overlapCount}</span>
              </div>
            )}

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

            {/* Ring color breakdown */}
            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Rings by color</div>

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

            {/* Scale stats */}
            {scaleStats && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, marginTop: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#9ca3af" }}>Scales</span>
                  <span style={{ fontWeight: 800 }}>{scaleStats.total}</span>
                </div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Scales by color</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {scaleStats.byColor.slice(0, 12).map(([hex, count]) => (
                    <div key={hex} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: hex, border: "1px solid rgba(0,0,0,.8)", flexShrink: 0 }} />
                        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{hex}</span>
                      </span>
                      <span style={{ fontWeight: 800 }}>{count}</span>
                    </div>
                  ))}
                  {scaleStats.byColor.length > 12 && (
                    <div style={{ color: "#9ca3af", fontSize: 12 }}>+ {scaleStats.byColor.length - 12} more…</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DraggablePill>
      )}
      {/* ============================= */}
      {/* ✅ IMAGE OVERLAY PANEL (Freeform) */}
      {/* ============================= */}
      {showImageOverlay && isStudioTier && (
        <DraggablePill
          id="freeform-image-overlay"
          defaultPosition={{ x: Math.max(8, Math.min(120, window.innerWidth - 370)), y: 120 }}
        >
          <div
            style={{
              width: "min(300px, calc(100vw - 32px))",
              // Cap the panel at the viewport height. The header stays fixed and
              // only the body scrolls, so the ✕ is always reachable even on
              // short windows.
              maxHeight: "calc(100vh - 140px)",
              overscrollBehavior: "contain",
              background: "rgba(17,24,39,0.97)",
              border: "1px solid #1f2937",
              borderRadius: 18,
              padding: 14,
              color: "#f3f4f6",
              fontSize: 12,
              boxShadow: "0 8px 25px rgba(0,0,0,.5)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              overflow: "hidden",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Fixed header — never scrolls, so the ✕ is always reachable. */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <strong style={{ fontSize: 14, fontWeight: 700, color: "#e5e7eb" }}>🖼️ Image Overlay</strong>
              <button
                onClick={() => setShowImageOverlay(false)}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, color: "#e5e7eb", cursor: "pointer", fontSize: 14, padding: "4px 9px", lineHeight: 1, flexShrink: 0 }}
                title="Close"
              >✕</button>
            </div>

            {/* Scrolling body — everything below the fixed header. */}
            <div style={{ display: "grid", gap: 10, flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", paddingRight: 2 }}>

            {/* Drop zone */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith("image/")) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUrl = String(ev.target?.result || "");
                    setOverlay((p) => ({
                      // Default to imageFill on so a fresh upload transfers the
                      // actual image pattern onto scales — not a flat sampled
                      // colour. User can uncheck "Image Fill on Scales" to get
                      // the legacy single-colour-per-scale behaviour.
                      ...((p ?? { rotation: 0, repeat: "none", patternScale: 100, imageFill: true } as OverlayState)),
                      dataUrl,
                      scale: p?.scale ?? 1,
                      opacity: p?.opacity ?? 0.8,
                      offsetX: 0,
                      offsetY: 0,
                      imageFill: p?.imageFill ?? true,
                    }));
                  };
                  reader.readAsDataURL(file);
                }
              }}
              onClick={() => {
                const inp = document.getElementById("freeform-overlay-file-input") as HTMLInputElement | null;
                if (inp) { inp.value = ""; inp.click(); }
              }}
              style={{ border: "2px dashed #374151", borderRadius: 10, padding: 12, textAlign: "center", cursor: "pointer", userSelect: "none" }}
              title="Click or drop an image"
            >
              <input
                id="freeform-overlay-file-input"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onClick={(e) => {
                  const inp = e.target as HTMLInputElement;
                  inp.value = "";
                  const onCancel = () => { inp.value = ""; document.documentElement.focus(); inp.removeEventListener("cancel", onCancel); };
                  inp.addEventListener("cancel", onCancel);
                }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) { e.target.value = ""; return; }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUrl = String(ev.target?.result || "");
                    setOverlay((p) => ({
                      // Default to imageFill on so a fresh upload transfers the
                      // actual image pattern onto scales — not a flat sampled
                      // colour. User can uncheck "Image Fill on Scales" to get
                      // the legacy single-colour-per-scale behaviour.
                      ...((p ?? { rotation: 0, repeat: "none", patternScale: 100, imageFill: true } as OverlayState)),
                      dataUrl,
                      scale: p?.scale ?? 1,
                      opacity: p?.opacity ?? 0.8,
                      offsetX: 0,
                      offsetY: 0,
                      imageFill: p?.imageFill ?? true,
                    }));
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                {overlay?.dataUrl ? "🔄 Click or drop to replace image" : "📂 Click or drop an image to overlay"}
              </div>
            </div>

            {/* Transfer button — placed just above the preview so it's reachable
                without scrolling once an image is loaded. */}
            <button type="button" onClick={transferOverlayToRings}
              disabled={isTransferring || !overlay?.dataUrl || (overlayScope === "selection" && overlayMaskKeys.size === 0)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)",
                background: "#22c55e", color: "#052e16", fontWeight: 900,
                cursor: isTransferring || !overlay?.dataUrl ? "not-allowed" : "pointer",
                opacity: isTransferring || !overlay?.dataUrl || (overlayScope === "selection" && overlayMaskKeys.size === 0) ? 0.6 : 1,
              }}
            >{isTransferring ? "Transferring…" : "Transfer to Rings"}</button>

            {/* Source preview — shared with the Designer via <OverlayPreview>:
                one-finger drag pans, two-finger pinch / wheel zooms. Feeds the
                same overlay transform the Pan X/Y arrows and Transfer use, so
                the on-canvas preview and painted result follow. */}
            {overlay?.dataUrl && (
              <OverlayPreview
                overlay={overlay}
                height={180}
                onChange={(patch) => setOverlay((p) => (p ? { ...p, ...patch } : p))}
              />
            )}

            {/* Controls — up/down arrow steppers (replaced the range sliders).
                Sliders fired a re-sample of every ring on each input event,
                which froze on large designs and had no touch thumb on iPad.
                Tap = one step, press-and-hold = auto-repeat. */}
            <ValueStepper
              label="Scale" value={overlay?.scale ?? 1}
              min={0.2} max={6} step={0.05} decimals={2}
              onChange={(n) => setOverlay((p) => p ? { ...p, scale: n } : p)}
            />
            <ValueStepper
              label="Opacity" value={overlay?.opacity ?? 0.8}
              min={0} max={1} step={0.05} decimals={2}
              onChange={(n) => setOverlay((p) => p ? { ...p, opacity: n } : p)}
            />
            <ValueStepper
              label="Rotation" value={overlay?.rotation ?? 0}
              min={0} max={360} step={5} decimals={0} suffix="°"
              onChange={(n) => setOverlay((p) => p ? { ...p, rotation: n } : p)}
            />

            {/* Pan X / Pan Y — arrow steppers (replaced the old range sliders).
                Sliders fired a re-sample of every ring on each input event,
                which froze on large designs and had no touch thumb on iPad.
                Tap = one nudge, press-and-hold = auto-repeat. */}
            <PanArrows
              offsetX={overlay?.offsetX ?? 0}
              offsetY={overlay?.offsetY ?? 0}
              step={5}
              onNudge={(dx, dy) =>
                setOverlay((p) =>
                  p ? { ...p, offsetX: (p.offsetX ?? 0) + dx, offsetY: (p.offsetY ?? 0) + dy } : p,
                )
              }
              onReset={() => setOverlay((p) => (p ? { ...p, offsetX: 0, offsetY: 0 } : p))}
            />

            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox"
                checked={overlay?.repeat === "tile"}
                onChange={(e) => setOverlay((p) => p ? { ...p, repeat: e.target.checked ? "tile" : "none" } : p)}
              />
              <span>Tile (repeat)</span>
            </label>

            {/* Pattern Scale — % of design bounding box per tile. Mirrors the
                Designer page's Image Overlay panel. Lower % = more, smaller
                tiles; 100% = one tile fills the design. */}
            {overlay?.repeat === "tile" && (
              <ValueStepper
                label="Pattern Scale"
                value={Math.round(Number((overlay as any)?.patternScale ?? 100))}
                min={5} max={200} step={5} decimals={0} suffix="%"
                onChange={(n) => setOverlay((p) => p ? ({ ...(p as any), patternScale: n }) : p)}
              />
            )}

            {/* Mask Outline controls — let the user snap the mask back to
                the auto-bounds of all current rings, in case they've
                dragged it to an unintended position. */}
            <div style={{ display: "flex", gap: 8, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(2,6,23,0.75)", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800 }}>Mask Outline</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>
                  {overlayMaskOverride ? "Custom (dragged)" : "Auto (matches rings)"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOverlayMaskOverride(null)}
                disabled={!overlayMaskOverride}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: overlayMaskOverride ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.10)",
                  color: overlayMaskOverride ? "#0b1220" : "#475569",
                  cursor: overlayMaskOverride ? "pointer" : "default",
                  fontWeight: 800,
                  fontSize: 12,
                }}
                title="Snap the mask outline back to auto-bounds of the current rings"
              >Reset</button>
            </div>

            {/* Transfer Scope */}
            <div style={{ display: "grid", gap: 8, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(2,6,23,0.75)" }}>
              <div style={{ fontWeight: 800 }}>Transfer Scope</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {(["all", "selection"] as const).map((scope) => (
                  <label key={scope} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                    <input type="radio" name="overlayScope" checked={overlayScope === scope} onChange={() => setOverlayScope(scope)} />
                    <span>{scope === "all" ? "All rings" : "Selection only"}</span>
                  </label>
                ))}
              </div>
              {overlayScope === "selection" && (
                <div style={{ display: "grid", gap: 6 }}>
                  <button type="button"
                    onClick={() => {
                      overlayPickingRef.current = true;
                      setOverlayMaskKeys(new Set());
                      setSelectedKeys(new Set());
                      setEraseMode(false);
                      setPanMode(false);
                      setSelectionMode((m) => (m === "none" ? "square" : m));
                    }}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.92)", color: "#0b1220", cursor: "pointer", fontWeight: 900 }}
                  >🎯 Pick selection area (then drag on canvas)</button>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>
                    Picked: <b>{overlayMaskKeys.size}</b>{overlayMaskKeys.size === 0 ? " (none yet)" : ""}{overlayPickingRef.current ? " • Picking…" : ""}
                  </div>
                </div>
              )}
            </div>

            {/* Preview Mode */}
            <div style={{ display: "grid", gap: 6, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(2,6,23,0.75)" }}>
              <div style={{ fontWeight: 800, fontSize: 11, color: "#94a3b8" }} title="Sampled: each target cell shows the color it will become on Transfer. Raw: shows the source image clipped to the cell silhouettes.">PREVIEW</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["sampled", "raw"] as const).map((m) => (
                  <label key={m} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", padding: "5px 4px", borderRadius: 8, border: `1px solid ${overlayPreviewMode === m ? "rgba(34,197,94,0.65)" : "rgba(255,255,255,0.10)"}`, background: overlayPreviewMode === m ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.04)" }}>
                    <input type="radio" name="overlayPreviewMode" style={{ display: "none" }} checked={overlayPreviewMode === m} onChange={() => setOverlayPreviewMode(m)} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: overlayPreviewMode === m ? "#86efac" : "#94a3b8", textTransform: "capitalize" }}>{m === "sampled" ? "Sampled Colors" : "Raw Image"}</span>
                  </label>
                ))}
              </div>
            </div>

            </div>{/* end scrolling body */}
          </div>
        </DraggablePill>
      )}

      {finalizeOpen && (
        <FinalizeAndExportPanel
          rings={exportRings}
          initialAssignment={assignment}
          onAssignmentChange={(p) => setAssignment(p)}
          getRendererCanvas={getRendererCanvas}
          getExportGroups={getExportGroups}
          onClose={() => setFinalizeOpen(false)}
          mapMode="freeform"
        />
      )}

      {libraryOpen && (
        <DraggablePill
          id="freeform-library"
          defaultPosition={{ x: Math.max(8, Math.round((window.innerWidth - Math.min(920, window.innerWidth * 0.96)) / 2)), y: 60 }}
          style={{
            width: "min(920px, 96vw)",
            background: "transparent",
            border: "none",
            boxShadow: "none",
            borderRadius: 0,
            padding: 0,
          }}
        >
          <ProjectLibraryPanel
            onLoad={(data, mode) => {
              setLibraryOpen(false);
              handleLibraryLoad(data, mode);
            }}
            onClose={() => setLibraryOpen(false)}
          />
        </DraggablePill>
      )}

      {/* Cost estimator panel removed 2026-06-01 (see comment near
          the toolbar 💰 button site above). */}

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

      {/* Preview banner for non-Studio users */}
      {isPreviewOnly && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "linear-gradient(90deg, #7c3aed, #2563eb)",
          color: "white", textAlign: "center",
          padding: "8px 16px", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          <span>👁 Preview mode — default design from Woven Rainbows by Erin</span>
          {!HIDE_STORE_PURCHASE_UI && (
            <a href="/auth?mode=upgrade" style={{
              background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 6, padding: "3px 10px", color: "white",
              textDecoration: "none", fontSize: 12, fontWeight: 700,
            }}>Upgrade to Studio →</a>
          )}
        </div>
      )}

      {/* MAIN WORK AREA */}
      <div
        ref={wrapRef}
        style={{
          flex: 1,
          position: "relative",
          background: canvasBg,
          marginTop: isPreviewOnly ? 36 : 0,
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
            // Selection feedback: highlight cells that are the active
            // overlay-transfer target (picked set) OR the in-progress selection
            // drag set. RingRenderer accepts "row-col" or "row,col".
            highlightedRingKeys={highlightedKeys}
          />
        </div>

        {/* ============================================================
            IMAGE OVERLAY (SVG, clipped to target geometry)
            ============================================================
            Renders the uploaded reference image clipped to ring circles and/or
            scale silhouettes — depending on transferTarget and overlayScope.
            Using SVG <clipPath> instead of canvas destination-in: it never
            paints opaque pixels outside the clip, so rings/scales underneath
            stay fully visible.

            Gated on `showImageOverlay` so the preview disappears when the
            Image Overlay panel is closed — otherwise the SVG layer keeps
            rendering and looks like the image was transferred to the design
            even though the user never clicked the Transfer button. */}
        {/* Image overlay + mask outline only render when something paintable
            exists (rings or scales matching the current transferTarget). No
            chainmail in scope -> no mask, no image overlay. */}
        {overlay?.dataUrl && wrapSize.w > 0 && wrapSize.h > 0 && overlayAutoBounds && showImageOverlay && (
          <OverlayClipped
            overlay={overlay}
            wrapW={wrapSize.w}
            wrapH={wrapSize.h}
            worldBounds={overlayWorldBounds}
            pxPerMm={overlayPxPerMm}
            worldToScreen={worldToScreen}
            naturalImg={overlayNatural}
            // While the user is making a selection (e.g. "Pick selection area"
            // for a partial-image overlay), OR while the Scale-Plane drag
            // tool is active (moves scales relative to rings via canvas
            // drag), release pointer events on the overlay SVG so the canvas
            // can capture the drag.
            interactive={showImageOverlay && selectionMode === "none" && !scalePlaneDragMode}
            clipShapes={overlayClipShapes}
            mode={overlayPreviewMode}
            onDragStart={(e) => {
              if (!showImageOverlay) return;
              overlayCanvasDragRef.current = {
                startClientX: e.clientX,
                startClientY: e.clientY,
                startOffsetX: overlay.offsetX ?? 0,
                startOffsetY: overlay.offsetY ?? 0,
              };
            }}
            onDragMove={(e) => {
              const s = overlayCanvasDragRef.current;
              if (!s) return;
              // Convert the screen-pixel drag delta into preview-pixel units
              // (the same units the Transfer code expects in overlay.offsetX /
              // offsetY). One preview-pixel == one PREVIEW_W-th of the design's
              // world-bounding-box width, projected to screen.
              const PREVIEW_W = 332;
              const bounds = overlayWorldBoundsRef.current;
              // Isotropic mapping (mirrors Transfer): height tracks the world-box
              // aspect so panning feels 1:1 in both axes.
              const PREVIEW_H = Math.max(
                1,
                Math.min(4000, (PREVIEW_W * Math.max(1e-6, bounds.worldH)) / Math.max(1e-6, bounds.worldW)),
              );
              const px = overlayPxPerMmRef.current;
              const denomX = px * bounds.worldW;
              const denomY = px * bounds.worldH;
              const dx_screen = e.clientX - s.startClientX;
              const dy_screen = e.clientY - s.startClientY;
              const dx = denomX > 0 ? dx_screen * (PREVIEW_W / denomX) : dx_screen;
              const dy = denomY > 0 ? dy_screen * (PREVIEW_H / denomY) : dy_screen;
              setOverlay((p) =>
                p ? { ...p, offsetX: s.startOffsetX + dx, offsetY: s.startOffsetY + dy } : p,
              );
            }}
            onDragEnd={() => {
              overlayCanvasDragRef.current = null;
            }}
            onScale={(nextScale) => {
              if (!showImageOverlay) return;
              const clamped = Math.max(0.1, Math.min(6, nextScale));
              setOverlay((p) => (p ? { ...p, scale: clamped } : p));
            }}
          />
        )}

        {/* Adjustable mask outline. Shown while the Image Overlay panel is open
            and the chainmail has cells in scope. Defines the world rectangle
            the image is painted into — same rectangle the preview uses. Hidden
            while the Scale-Plane drag tool owns the canvas. */}
        {overlay?.dataUrl && wrapSize.w > 0 && wrapSize.h > 0 && overlayAutoBounds && showImageOverlay && selectionMode === "none" && !scalePlaneDragMode && (
          <OverlayMaskOutline
            wrapW={wrapSize.w}
            wrapH={wrapSize.h}
            bounds={overlayWorldBounds}
            pxPerMm={overlayPxPerMm}
            worldToScreen={worldToScreen}
            onBoundsChange={(next) => setOverlayMaskOverride(next)}
          />
        )}

        {/* Preview mode — block all canvas interaction */}
        {isPreviewOnly && (
          <div
            style={{
              position: "absolute", inset: 0, zIndex: 10,
              cursor: "not-allowed",
              background: "transparent",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            title="Upgrade to Studio to edit"
          />
        )}

        {/* INTERACTION CANVAS (also draws selection overlay) */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            cursor:
              pasteMode && clipboard
                ? "copy"
                : selectionMode !== "none"
                ? "crosshair"
                : scalePlaneDragMode
                  ? "move"
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
          onContextMenu={handleContextMenuPaste}
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
            opacity: hideCircles ? 0 : 1,
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
          <SplineSandbox
            key={splineResetKey}
            embedded
            showPanel={true}
            mode="freeform"
            storageKey="spline-freeform"
            currentColorHex={normalizeColor6(activeColor)}
            onRequestClose={() => setShowSplineTool(false)}
            onApplyClosedSpline={({ polygon }) => {
              applyClosedSpline(
                polygon,
                normalizeColor6(activeColor),
              );
              setSplineResetKey((k) => k + 1);
            }}
          />
        )}

        {/* STUDIO GEOMETRY PANEL */}
        {showControls && (
          <DraggablePill
            id="freeform-controls"
            defaultPosition={{ x: Math.max(8, window.innerWidth - 316), y: 60 }}
            style={{
              width: "min(300px, calc(100vw - 16px))",
              background: "#0f172a",
              color: "#e5e7eb",
              borderRadius: 12,
              padding: 12,
              border: "1px solid rgba(148,163,184,0.35)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 12,
            }}
          >
            {/* Header: title + section icon tabs */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>Studio Geometry</h3>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {([
                  { id: "spacing", icon: "📏", title: "Ring Spacing" },
                  { id: "circles", icon: "⭕", title: "Circle Tuning" },
                  { id: "rings",   icon: "💍", title: "Ring Sets" },
                  { id: "view",    icon: "👁", title: "View Controls" },
                  ...(showDiagnostics ? [{ id: "diag", icon: "🔬", title: "Diagnostics" }] : []),
                ] as { id: ControlsTab; icon: string; title: string }[]).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    title={tab.title}
                    data-nondrag="1"
                    onClick={() => setControlsTab(tab.id)}
                    style={{
                      width: 28, height: 28, borderRadius: 7,
                      border: controlsTab === tab.id ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.12)",
                      background: controlsTab === tab.id ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)",
                      cursor: "pointer", fontSize: 13,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0, flexShrink: 0,
                    }}
                  >
                    {tab.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* ── SPACING ── */}
            {controlsTab === "spacing" && (
              <>
                <p style={{ margin: 0, opacity: 0.75, lineHeight: 1.3, fontSize: 11 }}>
                  Hex grid spacing shared with the Weave Tuner.
                  Vertical = <code>center × 0.866</code>, odd rows offset by <code>center / 2</code>.
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
                {/* Ring tilt — even rows use Angle In, odd rows Angle Out (matches the
                    Weave Tuner). Editing here is a manual override, so it stops
                    auto-following the Tuner. */}
                <SliderRow
                  label="Ring Angle In (°)"
                  value={angleIn}
                  setValue={(v) => { setAngleIn(v); setAutoFollowTuner(false); }}
                  min={-75}
                  max={75}
                  step={1}
                  unit="°"
                />
                <SliderRow
                  label="Ring Angle Out (°)"
                  value={angleOut}
                  setValue={(v) => { setAngleOut(v); setAutoFollowTuner(false); }}
                  min={-75}
                  max={75}
                  step={1}
                  unit="°"
                />
              </>
            )}

            {/* ── CIRCLES ── */}
            {controlsTab === "circles" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={hideCircles}
                    onChange={(e) => setHideCircles(e.target.checked)}
                  />
                  <span>Hide circles (still clickable)</span>
                </label>
                <div style={{ fontWeight: 700, fontSize: 12 }}>Circles (on placed rings only)</div>
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
                  <button type="button" style={smallBtn}
                    onClick={() => { setCircleOffsetX(0); setCircleOffsetY(0); setCircleScale(1); }}
                    title="Reset circle offset/scale"
                  >Reset circles</button>
                  <button type="button" style={smallBtnBlue}
                    onClick={() => setHideCircles((v) => !v)}
                    title="Toggle circle visibility"
                  >{hideCircles ? "Show circles" : "Hide circles"}</button>
                </div>
              </div>
            )}

            {/* ── RING SETS ── */}
            {controlsTab === "rings" && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>Ring Sets (from Tuner)</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={autoFollowTuner}
                    onChange={(e) => setAutoFollowTuner(e.target.checked)}
                  />
                  <span>Auto-follow latest tuner set</span>
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={smallBtn} onClick={reloadRingSets}
                    title="Reload ring sets from localStorage"
                  >Reload</button>
                  <label
                    style={{ ...smallBtn, display: "grid", placeItems: "center", cursor: "pointer", textAlign: "center" }}
                    title="Load ring + scale settings from a JSON file"
                  >
                    Load JSON…
                    <input
                      type="file"
                      accept="application/json,.json"
                      style={{ display: "none" }}
                      onClick={(e) => {
                        const inp = e.target as HTMLInputElement;
                        inp.value = "";
                        const onCancel = () => { inp.value = ""; document.documentElement.focus(); inp.removeEventListener("cancel", onCancel); };
                        inp.addEventListener("cancel", onCancel);
                      }}
                      onChange={handleFileJSONLoad}
                    />
                  </label>
                  <button type="button" style={smallBtn} onClick={handleSaveJSON}
                    title="Save current ring + scale settings to a JSON file"
                  >Save JSON</button>
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
                  style={{ padding: 8, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#f8fafc", fontSize: 12 }}
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
                  Current: <b>ID {formatNum(innerIDmm, 2)}mm • Wire {formatNum(wireMm, 2)}mm • Center {formatNum(centerSpacing, 2)}mm</b>
                  <br />Aspect ratio: <b>{formatNum(aspectRatio, 2)}</b>
                </div>
              </div>
            )}

            {/* ── VIEW ── */}
            {controlsTab === "view" && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 11, opacity: 0.9 }}>
                  Zoom: <b>{formatNum(zoom, 2)}</b> • Pan: <b>{formatNum(panWorldX, 1)}, {formatNum(panWorldY, 1)}</b>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={smallBtn}
                    onClick={() => { setZoom(1); setPanWorldX(0); setPanWorldY(0); }}
                    title="Reset view"
                  >Reset view</button>
                  <button type="button" style={smallBtnBlue}
                    onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))}
                    title="Zoom in"
                  >Zoom +</button>
                  <button type="button" style={smallBtnBlue}
                    onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.2))}
                    title="Zoom out"
                  >Zoom –</button>
                </div>
              </div>
            )}

            {/* ── SCALE TUNERS ── */}

            {/* ── DIAGNOSTICS ── */}
            {controlsTab === "diag" && showDiagnostics && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>Diagnostics</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>
                  Rings: <b>{rings.size}</b> • Selected: <b>{lastSelectionCount}</b>
                </div>
                <textarea
                  value={diagLog}
                  readOnly
                  placeholder="Click rings while diagnostics is on to append log lines…"
                  style={{
                    width: "100%", minHeight: 120, resize: "vertical", padding: 10,
                    borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)", color: "#f8fafc",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 11,
                  }}
                />
                <button type="button" style={smallBtn} onClick={() => setDiagLog("")}
                  title="Clear diagnostics log"
                >Clear log</button>
              </div>
            )}

            {/* ── INTERFERENCE CHECK (red box, all tabs) ───────────────── */}
            <div
              style={{
                marginTop: 4,
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${interferenceCheckOn ? "#ef4444" : "rgba(239,68,68,0.55)"}`,
                background: interferenceCheckOn ? "rgba(127,29,29,0.35)" : "rgba(127,29,29,0.14)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 12, color: "#fca5a5" }}>
                <span>🔍</span><span>Interference Check</span>
              </div>
              <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.35, color: "#fecaca" }}>
                Flags rings that can’t weave at the design’s shared spacing because their size differs from their neighbors (e.g. a small ring in a lattice spaced for a larger one). Offending rings turn red on the canvas.
              </div>
              <button
                type="button"
                onClick={() => setInterferenceCheckOn((v) => !v)}
                title="Run / clear the mixed-size interference check"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #ef4444",
                  background: interferenceCheckOn ? "#7f1d1d" : "#ef4444",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {interferenceCheckOn
                  ? (overlapCount > 0 ? `⚠️ ${overlapCount} interference${overlapCount === 1 ? "" : "s"} — tap to clear` : "✅ No interference — tap to clear")
                  : "Run interference check"}
              </button>
            </div>
          </DraggablePill>
        )}

        {/* ── RESUME DIALOG ── */}
        {showResumeDialog && (
          <div style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(8px)",
            zIndex: 100000,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              background: "#0f172a",
              border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: 20,
              padding: 32,
              maxWidth: 420,
              width: "calc(100vw - 40px)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.75)",
              display: "flex", flexDirection: "column", gap: 18,
              color: "#e5e7eb",
            }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Welcome back</div>
              <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.6 }}>
                You have unsaved work from <b>{formatSavedAt(autosaveMetaRef.current?.savedAt)}</b>
                {autosaveMetaRef.current?.ringCount
                  ? ` — ${autosaveMetaRef.current.ringCount.toLocaleString()} rings.`
                  : "."}
                <br />
                Would you like to continue where you left off?
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const raw = localStorage.getItem(AUTOSAVE_KEY);
                      if (raw) loadFreeformProject(JSON.parse(raw));
                    } catch {}
                    setShowResumeDialog(false);
                  }}
                  style={{
                    flex: 1, padding: "13px 0", borderRadius: 12,
                    background: "rgba(59,130,246,0.30)",
                    border: "1px solid rgba(59,130,246,0.60)",
                    color: "#e5e7eb", fontSize: 14, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    safeLSRemove(AUTOSAVE_KEY);
                    setShowResumeDialog(false);
                  }}
                  style={{
                    flex: 1, padding: "13px 0", borderRadius: 12,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#e5e7eb", fontSize: 14, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  New Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeformChainmail2D;

// ===================================================================
// Image-overlay mask outline (SVG)
// ===================================================================
// User-adjustable bounding rectangle over the chainmail. Same world-space
// rectangle the image is painted into, so dragging this outline directly
// changes where Transfer will paint. Move by dragging the body, resize by
// dragging a corner handle.
interface OverlayMaskOutlineProps {
  wrapW: number;
  wrapH: number;
  bounds: { worldW: number; worldH: number; worldCenterX: number; worldCenterY: number };
  pxPerMm: number;
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  onBoundsChange: (next: { worldW: number; worldH: number; worldCenterX: number; worldCenterY: number }) => void;
}
function OverlayMaskOutline({
  wrapW,
  wrapH,
  bounds,
  pxPerMm,
  worldToScreen,
  onBoundsChange,
}: OverlayMaskOutlineProps) {
  type DragMode = "move" | "tl" | "tr" | "bl" | "br";
  const dragRef = useRef<{
    mode: DragMode;
    clientX: number;
    clientY: number;
    startBounds: { worldW: number; worldH: number; worldCenterX: number; worldCenterY: number };
  } | null>(null);

  const { worldCenterX, worldCenterY, worldW, worldH } = bounds;
  // Project the four corners. Screen-y inverts world-y (worldToScreen handles
  // the flip), so "top" in world = "top" on screen.
  const cornerTL = worldToScreen(worldCenterX - worldW / 2, worldCenterY + worldH / 2);
  const cornerTR = worldToScreen(worldCenterX + worldW / 2, worldCenterY + worldH / 2);
  const cornerBL = worldToScreen(worldCenterX - worldW / 2, worldCenterY - worldH / 2);
  const cornerBR = worldToScreen(worldCenterX + worldW / 2, worldCenterY - worldH / 2);
  const minSX = Math.min(cornerTL.sx, cornerBR.sx);
  const maxSX = Math.max(cornerTL.sx, cornerBR.sx);
  const minSY = Math.min(cornerTL.sy, cornerBR.sy);
  const maxSY = Math.max(cornerTL.sy, cornerBR.sy);
  const rectX = minSX;
  const rectY = minSY;
  const rectW = Math.max(0, maxSX - minSX);
  const rectH = Math.max(0, maxSY - minSY);

  const beginDrag = (mode: DragMode, e: React.PointerEvent<SVGElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      mode,
      clientX: e.clientX,
      clientY: e.clientY,
      startBounds: { ...bounds },
    };
  };

  const handleMove = (e: React.PointerEvent<SVGElement>) => {
    const s = dragRef.current;
    if (!s) return;
    const dxScreen = e.clientX - s.clientX;
    const dyScreen = e.clientY - s.clientY;
    if (pxPerMm <= 0) return;
    const dxWorld = dxScreen / pxPerMm;
    // Screen +Y is down; world +Y is up. So a positive dy on screen means a
    // negative dy in world.
    const dyWorld = -dyScreen / pxPerMm;

    const sb = s.startBounds;
    if (s.mode === "move") {
      onBoundsChange({
        worldW: sb.worldW,
        worldH: sb.worldH,
        worldCenterX: sb.worldCenterX + dxWorld,
        worldCenterY: sb.worldCenterY + dyWorld,
      });
      return;
    }

    // Corner resize: keep the opposite corner fixed, move the dragged corner
    // by (dxWorld, dyWorld), then derive a new bounds from the two corners.
    const oldHalfW = sb.worldW / 2;
    const oldHalfH = sb.worldH / 2;
    let cornerX: number, cornerY: number, fixedX: number, fixedY: number;
    switch (s.mode) {
      case "tl":
        cornerX = sb.worldCenterX - oldHalfW;
        cornerY = sb.worldCenterY + oldHalfH;
        fixedX = sb.worldCenterX + oldHalfW;
        fixedY = sb.worldCenterY - oldHalfH;
        break;
      case "tr":
        cornerX = sb.worldCenterX + oldHalfW;
        cornerY = sb.worldCenterY + oldHalfH;
        fixedX = sb.worldCenterX - oldHalfW;
        fixedY = sb.worldCenterY - oldHalfH;
        break;
      case "bl":
        cornerX = sb.worldCenterX - oldHalfW;
        cornerY = sb.worldCenterY - oldHalfH;
        fixedX = sb.worldCenterX + oldHalfW;
        fixedY = sb.worldCenterY + oldHalfH;
        break;
      case "br":
      default:
        cornerX = sb.worldCenterX + oldHalfW;
        cornerY = sb.worldCenterY - oldHalfH;
        fixedX = sb.worldCenterX - oldHalfW;
        fixedY = sb.worldCenterY + oldHalfH;
        break;
    }
    const newCornerX = cornerX + dxWorld;
    const newCornerY = cornerY + dyWorld;
    const newW = Math.max(1e-3, Math.abs(newCornerX - fixedX));
    const newH = Math.max(1e-3, Math.abs(newCornerY - fixedY));
    onBoundsChange({
      worldW: newW,
      worldH: newH,
      worldCenterX: (newCornerX + fixedX) / 2,
      worldCenterY: (newCornerY + fixedY) / 2,
    });
  };

  const endDrag = (e: React.PointerEvent<SVGElement>) => {
    if (dragRef.current) {
      try { (e.currentTarget as SVGElement).releasePointerCapture?.(e.pointerId); } catch {}
    }
    dragRef.current = null;
  };

  const HANDLE_R = 7;
  const stroke = "rgba(59,130,246,0.95)";
  const strokeDimmer = "rgba(59,130,246,0.55)";
  const handleFill = "rgba(255,255,255,0.95)";

  return (
    <svg
      width={wrapW}
      height={wrapH}
      viewBox={`0 0 ${wrapW} ${wrapH}`}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        pointerEvents: "none",
        touchAction: "none",
      }}
    >
      {/* Outline rectangle — visual only. Pointer events pass through so the
          image overlay underneath can still be dragged to pan. Move/resize
          are handled by the center & corner handles. */}
      <rect
        x={rectX}
        y={rectY}
        width={rectW}
        height={rectH}
        fill="rgba(59,130,246,0.05)"
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray="6 4"
        style={{ pointerEvents: "none" }}
      />
      {/* Inner cross hair to telegraph the centre */}
      <line
        x1={rectX + rectW / 2}
        y1={rectY}
        x2={rectX + rectW / 2}
        y2={rectY + rectH}
        stroke={strokeDimmer}
        strokeWidth={0.75}
        strokeDasharray="2 4"
        style={{ pointerEvents: "none" }}
      />
      <line
        x1={rectX}
        y1={rectY + rectH / 2}
        x2={rectX + rectW}
        y2={rectY + rectH / 2}
        stroke={strokeDimmer}
        strokeWidth={0.75}
        strokeDasharray="2 4"
        style={{ pointerEvents: "none" }}
      />
      {/* Center handle: drag to move the whole mask */}
      <circle
        cx={rectX + rectW / 2}
        cy={rectY + rectH / 2}
        r={HANDLE_R + 2}
        fill="rgba(59,130,246,0.85)"
        stroke="#fff"
        strokeWidth={1.5}
        style={{ pointerEvents: "auto", cursor: "move" }}
        onPointerDown={(e) => beginDrag("move", e)}
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <line
        x1={rectX + rectW / 2 - 5}
        y1={rectY + rectH / 2}
        x2={rectX + rectW / 2 + 5}
        y2={rectY + rectH / 2}
        stroke="#fff"
        strokeWidth={2}
        style={{ pointerEvents: "none" }}
      />
      <line
        x1={rectX + rectW / 2}
        y1={rectY + rectH / 2 - 5}
        x2={rectX + rectW / 2}
        y2={rectY + rectH / 2 + 5}
        stroke="#fff"
        strokeWidth={2}
        style={{ pointerEvents: "none" }}
      />
      {/* Corner handles */}
      {([
        ["tl", cornerTL.sx, cornerTL.sy, "nwse-resize"],
        ["tr", cornerTR.sx, cornerTR.sy, "nesw-resize"],
        ["bl", cornerBL.sx, cornerBL.sy, "nesw-resize"],
        ["br", cornerBR.sx, cornerBR.sy, "nwse-resize"],
      ] as const).map(([mode, cx, cy, cursor]) => (
        <circle
          key={mode}
          cx={cx}
          cy={cy}
          r={HANDLE_R}
          fill={handleFill}
          stroke={stroke}
          strokeWidth={1.5}
          style={{ pointerEvents: "auto", cursor }}
          onPointerDown={(e) => beginDrag(mode as DragMode, e)}
          onPointerMove={handleMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ))}
    </svg>
  );
}

// ===================================================================
// Image-overlay clipped renderer (SVG)
// ===================================================================
// Drawn over the rings/scales but clipped to the supplied shapes so the
// image only appears WHERE rings/scales are. The host SVG is sized to the
// wrap, captures pointer events when interactive, and supports drag.
interface OverlayClippedProps {
  overlay: OverlayState;
  wrapW: number;
  wrapH: number;
  // World-space bounding box of the rings — image is mapped onto this region
  // exactly the way the Transfer code does, so what the user previews is what
  // gets painted.
  worldBounds: { worldW: number; worldH: number; worldCenterX: number; worldCenterY: number };
  // Screen pixels per logical mm at the current camera (tracks zoom/pan).
  pxPerMm: number;
  // Project a world point to screen pixel coordinates.
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  // Natural pixel dimensions of the loaded image — used for imageDisplayH.
  naturalImg: { w: number; h: number } | null;
  interactive: boolean;
  clipShapes: React.ReactNode[];
  // "sampled": draw clipShapes directly using their per-shape sampled fill.
  // "raw" (default): use clipShapes as a clipPath for the raw image.
  mode?: "sampled" | "raw";
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
  // Two-finger pinch (touch) / wheel (desktop) → absolute new overlay scale.
  // The parent clamps and writes it to overlay.scale so the canvas + transfer
  // both reflect the zoom.
  onScale: (nextScale: number) => void;
}
function OverlayClipped({
  overlay,
  wrapW,
  wrapH,
  worldBounds,
  pxPerMm,
  worldToScreen,
  naturalImg,
  interactive,
  clipShapes,
  mode = "raw",
  onDragStart,
  onDragMove,
  onDragEnd,
  onScale,
}: OverlayClippedProps) {
  // Stable id per mount so multiple overlays (HMR / strict mode) don't collide.
  const clipId = useMemo(
    () => `overlayClip-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  // ── Touch/mouse gestures on the on-canvas image ──────────────────────────
  // One finger pans (offsetX/offsetY via onDragMove); two fingers pinch-zoom
  // (overlay.scale via onScale). Mirrors the panel preview's gesture model so
  // editing the image on the iPhone/iPad canvas feels identical. A ref holds
  // live pointers + the pinch baseline so it survives re-renders.
  const gesture = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    pinchStartDist: number | null;
    pinchStartScale: number;
    panActive: boolean;
  }>({ pointers: new Map(), pinchStartDist: null, pinchStartScale: 1, panActive: false });

  const SCALE_MIN = 0.1;
  const SCALE_MAX = 6;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      e.preventDefault();
      (e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId);
      const s = gesture.current;
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.pointers.size === 1) {
        s.panActive = true;
        onDragStart(e);
      } else if (s.pointers.size === 2) {
        // Second finger down → switch from pan to pinch.
        s.panActive = false;
        const pts = [...s.pointers.values()];
        s.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || null;
        s.pinchStartScale = overlay.scale ?? 1;
      }
    },
    [interactive, onDragStart, overlay.scale],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = gesture.current;
      if (!s.pointers.has(e.pointerId)) return;
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.pointers.size >= 2 && s.pinchStartDist) {
        const pts = [...s.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const ratio = dist / s.pinchStartDist;
        onScale(Math.max(SCALE_MIN, Math.min(SCALE_MAX, s.pinchStartScale * ratio)));
      } else if (s.pointers.size === 1 && s.panActive) {
        onDragMove(e);
      }
    },
    [onDragMove, onScale],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = gesture.current;
      s.pointers.delete(e.pointerId);
      if (s.pointers.size < 2) s.pinchStartDist = null;
      if (s.pointers.size === 1) {
        // One finger left after a pinch → re-seed the pan baseline to it so the
        // image doesn't jump on the next move.
        s.panActive = true;
        const pt = [...s.pointers.values()][0];
        onDragStart({ clientX: pt.x, clientY: pt.y } as React.PointerEvent);
      }
      if (s.pointers.size === 0) {
        s.panActive = false;
        onDragEnd();
      }
    },
    [onDragStart, onDragEnd],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!interactive) return;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      onScale(Math.max(SCALE_MIN, Math.min(SCALE_MAX, (overlay.scale ?? 1) * factor)));
    },
    [interactive, onScale, overlay.scale],
  );

  const offsetX = overlay.offsetX ?? 0;
  const offsetY = overlay.offsetY ?? 0;
  const scl = overlay.scale ?? 1;
  const rot = overlay.rotation ?? 0;
  // While the Image Overlay panel is open (interactive), cap opacity so the
  // rings/scales beneath remain visible — the user needs to see them to
  // position the image. Cap is loose enough that the preview is still clearly
  // visible against a dark 3D canvas. When the panel is closed, render at the
  // user's full slider opacity.
  const rawOpacity = overlay.opacity ?? 0.8;
  const opacity = interactive ? Math.min(rawOpacity, 0.55) : rawOpacity;

  // Match the Transfer math exactly so preview = transfer result.
  //
  // Transfer maps world (wx, wy) -> image pixel (sx, sy) inside a conceptual
  // preview-canvas sized PREVIEW_W x imageDisplayH:
  //   nxWorld = (wx - worldCenterX) / worldW
  //   nyWorld = (wy - worldCenterY) / worldH
  //   sx = PREVIEW_W * nxWorld - offsetX  (then /scale, rotate, + PREVIEW_W/2)
  //   sy = -PREVIEW_H * nyWorld - offsetY (then /scale, rotate, + imageDisplayH/2)
  //
  // PREVIEW_H is derived from the world-box aspect (PREVIEW_W * worldH/worldW)
  // so the world->image mapping is ISOTROPIC and the image keeps its aspect
  // ratio. With that, the on-screen footprint reduces to worldW mm wide ×
  // (worldW * iH/iW) mm tall (i.e. the image's natural aspect), and offsetX /
  // offsetY share a single preview-pixel→screen ratio.
  const PREVIEW_W = 332;
  const { worldW, worldH, worldCenterX, worldCenterY } = worldBounds;
  const PREVIEW_H = Math.max(1, Math.min(4000, (PREVIEW_W * worldH) / worldW));
  const iW = naturalImg?.w ?? 1;
  const iH = naturalImg?.h ?? 1;
  const imageDisplayH = (PREVIEW_W * iH) / iW;

  // Image footprint in screen pixels.
  const imgW = pxPerMm * worldW;
  const imgH = pxPerMm * worldH * (imageDisplayH / PREVIEW_H);

  // Center of the design's world bounding box, projected to screen.
  const centerProj = worldToScreen(worldCenterX, worldCenterY);
  const cx = centerProj.sx;
  const cy = centerProj.sy;

  // Convert preview-pixel offsets to screen pixels. Per-axis because the
  // Y mapping uses PREVIEW_H, not imageDisplayH (mirrors Transfer math).
  const offX_screen = imgW > 0 ? offsetX * (imgW / PREVIEW_W) : 0;
  const offY_screen = (pxPerMm * worldH) > 0 ? offsetY * ((pxPerMm * worldH) / PREVIEW_H) : 0;

  // SVG transform applied around the image centre. Order matches the panel
  // preview: translate (pan), then scale, then rotate. Note: panel preview
  // applies scale/rotate AFTER translate, around image center.
  const transform = `translate(${cx + offX_screen} ${cy + offY_screen}) rotate(${rot}) scale(${scl}) translate(${-imgW / 2} ${-imgH / 2})`;

  return (
    <svg
      width={wrapW}
      height={wrapH}
      viewBox={`0 0 ${wrapW} ${wrapH}`}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "grab" : "default",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <defs>
        <clipPath id={clipId}>{clipShapes}</clipPath>
      </defs>
      {mode === "sampled" ? (
        // Sampled preview: each shape is rendered with its own fill (color
        // each cell would receive on Transfer). No raw image is drawn.
        <g opacity={opacity}>{clipShapes}</g>
      ) : overlay.repeat === "tile" ? (
        <g clipPath={`url(#${clipId})`} opacity={opacity}>
          <defs>
            <pattern
              id={`${clipId}-pat`}
              patternUnits="userSpaceOnUse"
              width={imgW * ((overlay.patternScale ?? 100) / 100)}
              height={imgH * ((overlay.patternScale ?? 100) / 100)}
              patternTransform={`translate(${cx + offX_screen} ${cy + offY_screen}) rotate(${rot} ${-imgW * ((overlay.patternScale ?? 100) / 100) / 2} ${-imgH * ((overlay.patternScale ?? 100) / 100) / 2})`}
            >
              <image
                href={overlay.dataUrl ?? undefined}
                x={0}
                y={0}
                width={imgW * ((overlay.patternScale ?? 100) / 100)}
                height={imgH * ((overlay.patternScale ?? 100) / 100)}
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          </defs>
          <rect x={0} y={0} width={wrapW} height={wrapH} fill={`url(#${clipId}-pat)`} />
        </g>
      ) : (
        // Wrap image in a <g> with clipPath so the clip is applied in
        // screen-space (after the image's transform), not in image-local space.
        <g clipPath={`url(#${clipId})`}>
          <image
            href={overlay.dataUrl ?? undefined}
            x={0}
            y={0}
            width={imgW}
            height={imgH}
            preserveAspectRatio="xMidYMid meet"
            opacity={opacity}
            transform={transform}
          />
        </g>
      )}
    </svg>
  );
}
