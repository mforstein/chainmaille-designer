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

import RingRenderer from "../components/RingRenderer";
import type { OverlayState } from "../components/ImageOverlayPanel";
import FinalizeAndExportPanel from "../components/FinalizeAndExportPanel";
import ProjectSaveLoadButtons from "../components/ProjectSaveLoadButtons";
import {
  applyCalibrationHex,
  calibrationUpdatedEventName,
} from "../utils/colorCalibration";
import { calculateBOM } from "../BOM/bomCalculator";
import {
  WEAVE_SETTINGS_DEFAULT,
  RingMap,
  PlacedRing,
  resolvePlacement,
} from "../utils/e4in1Placement";

import { DraggablePill, DraggableCompassNav } from "../App";
import type { BOMRing, SupplierId } from "../App";
import BOMButtons from "../components/BOMButtons";
import type { ExportRing, PaletteAssignment } from "../types/project";

// ⬇️ ADD THIS BLOCK HERE (after imports, before SAFETY STUBS)
declare global {
  interface Window {
    getBOMRings?: () => BOMRing[];
  }
}

// Safe default so App.tsx won't crash if it calls early
if (typeof window !== "undefined" && !window.getBOMRings) {
  window.getBOMRings = () => [];
}

// ======================================================
// SAFETY STUBS (history integration preserved, no-ops here)
// ======================================================
const commitRings = () => {};
const handleUndo = () => {};
const handleRedo = () => {};
const lock2dView = () => {};
const toggleLock = () => {};
const updateHistory = () => {};
const applyHistory = () => {};
const pushHistory = () => {};

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
  else for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;

  // RFC4122 v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
    .slice(8, 10)
    .join("")}-${hex.slice(10).join("")}`;
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

function loadSavedColorPalettes(): SavedColorPalettes {
  try {
    const raw = localStorage.getItem(SAVED_COLOR_PALETTES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: SavedColorPalettes = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v as string[];
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
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Choose color</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="color"
              value={state.rgb}
              onChange={(e) => onChange({ ...state, rgb: e.target.value })}
              style={{ width: 54, height: 36, border: "none", background: "transparent" }}
            />
            <div style={{ display: "grid", gap: 4, flex: 1 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Alpha</div>
              <input
                type="range"
                min={0}
                max={255}
                value={state.alpha255}
                onChange={(e) => onChange({ ...state, alpha255: Number(e.target.value) })}
              />
            </div>
          </div>

          <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.9 }}>
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
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
type SelectionMode = "none" | "rect" | "circle";

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
    }}
  >
    {children}
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

const freeformBOMMeta = {
  title: "Freeform — Color BOM",
  supplier: "TRL",
  ringSizeLabel: `5/16"`,
  material: "Anodized Aluminum",
  packSize: 1500,
  background: "#0b1220",
  textColor: "#e5e7eb",
};

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

// ======================================================
// Dimension
// ======================================================
type ShapeTool = "circle" | "square";
type ShapeDrag = {
  tool: ShapeTool;
  start: { x: number; y: number };
  current: { x: number; y: number };
  active: boolean;
};

type ShapeDims =
  | { tool: "circle"; radius: number; diameter: number }
  | { tool: "square"; width: number; height: number };

function getRingHex(r: any): string {
  return (
    r?.colorHex ??
    r?.color ??
    r?.hex ??
    r?.fill ??
    r?.stroke ??
    "#000000"
  );
}

// ======================================================
// CAMERA CONSTANTS (match RingRenderer projection)
// ======================================================
const FALLBACK_CAMERA_Z = 52;
const FOV = 45;
const MIN_ZOOM = 0.2; // allow wider zoom-out than before
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
    return () => window.removeEventListener(calibrationUpdatedEventName(), onUpdate);
  }, []);

  // ====================================================
  // PLACED RINGS
  // ====================================================
  const [rings, setRings] = useState<RingMap>(() => new Map());
  const [nextClusterId, setnextClusterId] = useState(1);

  // ✅ DEFAULT COLOR OF RINGS SHOULD BE WHITE
  const [activeColor, setActiveColor] = useState("#ffffff");
  const activeColorRef = useRef(activeColor);

  // ====================================================
  // COLOR PALETTE (editable + persisted)
  // ====================================================
  const [colorPalette, setColorPalette] = useState<string[]>(() => loadColorPalette());
  const [savedColorPalettes, setSavedColorPalettes] = useState<SavedColorPalettes>(() => loadSavedColorPalettes());
  const [paletteManagerOpen, setPaletteManagerOpen] = useState(false);
  const [paletteName, setPaletteName] = useState<string>("");
  const [selectedSavedPalette, setSelectedSavedPalette] = useState<string>("");
  const [pickerState, setPickerState] = useState<PaletteColorPickerState | null>(null);

  useEffect(() => {
    saveColorPalette(colorPalette);
  }, [colorPalette]);

  useEffect(() => {
    saveSavedColorPalettes(savedColorPalettes);
  }, [savedColorPalettes]);

  const openPickerForIndex = useCallback(
    (index: number) => {
      const current = colorPalette[index] ?? "#ffffffff";
      const parsed = parseHexColor(current) ?? { rgb: "#ffffff", alpha255: 255 };
      setPickerState({ index, rgb: parsed.rgb, alpha255: parsed.alpha255 });
    },
    [colorPalette],
  );

  const applyPicker = useCallback(() => {
    if (!pickerState) return;

    const next = [...colorPalette];

    // ✅ store as #RRGGBB so RingRenderer/Three always understands it
    const normalized = normalizeColor6(toHex8(pickerState.rgb, pickerState.alpha255));
    next[pickerState.index] = normalized;

    setColorPalette(next);
    setActiveColor(normalized);
    setPickerState(null);
  }, [pickerState, colorPalette]);

  useEffect(() => {
    activeColorRef.current = normalizeColor6(activeColor);
  }, [activeColor]);

  const [eraseMode, setEraseMode] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // ✅ Floating submenu (Designer pattern) — show/hide compass nav
  const [showCompass, setShowCompass] = useState(false);

  // ==============================
  // 📏 Freeform Stats (dims + counts)
  // ==============================
  const [showFreeformStats, setShowFreeformStats] = useState(true);
  const [cursorPx, setCursorPx] = useState<{ x: number; y: number } | null>(null);
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
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionRef = useRef<SelectionDrag | null>(null);

  // authoritative selected ring keys: `${row}-${col}`
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

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
  const [overlayMaskKeys, setOverlayMaskKeys] = useState<Set<string>>(() => new Set());

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
  const [debugClicks, setDebugClicks] = useState<{ id: number; lx: number; ly: number }[]>([]);

  const addDebugMarker = useCallback((lx: number, ly: number) => {
    setDebugClicks((prev) => [...prev, { id: prev.length + 1, lx, ly }]);
  }, []);

  // ====================================================
  // DYNAMIC GRID EXTENTS (unbounded freeform)
  // IMPORTANT: must be INSIDE component (needs rings)
  // ====================================================
  const { maxRowSpan, maxColSpan, minRow, minCol, maxRow, maxCol } = useMemo(() => {
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

  const applyOverlayToFreeform = useCallback(async () => {
    const targetKeys = overlayScope === "selection" ? overlayMaskKeys : null;

    if (!overlay) return;
    if (!rings.size) return;

    // If user chose "selection" but didn't pick anything yet
    if (targetKeys && targetKeys.size === 0) return;

    const src =
      (overlay as any)?.dataUrl ??
      (overlay as any)?.src ??
      (overlay as any)?.url ??
      (overlay as any)?.imageUrl ??
      null;
    if (!src) return;

    const offsetX = Number((overlay as any)?.offsetX ?? 0);
    const offsetY = Number((overlay as any)?.offsetY ?? 0);
    const scale = Math.max(1e-6, Number((overlay as any)?.scale ?? 1));
    const opacity = Math.max(0, Math.min(1, Number((overlay as any)?.opacity ?? 1)));

    const tileAny =
      !!(overlay as any)?.tile ||
      !!(overlay as any)?.tiled ||
      !!(overlay as any)?.repeat ||
      !!(overlay as any)?.tilingEnabled ||
      String((overlay as any)?.tileMode ?? (overlay as any)?.tiling ?? "")
        .toLowerCase()
        .includes("repeat");

    const tileX = (overlay as any)?.tileX ?? (overlay as any)?.repeatX ?? tileAny;
    const tileY = (overlay as any)?.tileY ?? (overlay as any)?.repeatY ?? tileAny;

    // Crop (optional) in normalized UV
    const u0 = Number.isFinite((overlay as any)?.cropU0) ? (overlay as any).cropU0 : (overlay as any)?.crop?.u0;
    const v0 = Number.isFinite((overlay as any)?.cropV0) ? (overlay as any).cropV0 : (overlay as any)?.crop?.v0;
    const u1 = Number.isFinite((overlay as any)?.cropU1) ? (overlay as any).cropU1 : (overlay as any)?.crop?.u1;
    const v1 = Number.isFinite((overlay as any)?.cropV1) ? (overlay as any).cropV1 : (overlay as any)?.crop?.v1;

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

    // Load image
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

const ctx = cvs.getContext(
  "2d",
  { willReadFrequently: true } as CanvasRenderingContext2DSettings
);
if (!ctx) return;

ctx.clearRect(0, 0, cvs.width, cvs.height);
ctx.drawImage(img, 0, 0);
const { data } = ctx.getImageData(0, 0, cvs.width, cvs.height);    const W = cvs.width;
    const H = cvs.height;

    // Compute world bounds, but ONLY for target keys if in selection mode
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    rings.forEach((r, key) => {
      if (targetKeys && !targetKeys.has(key)) return;

      const { x: lx, y: ly } = rcToLogical(r.row, r.col);
      const shiftedX = lx - logicalOrigin.ox;
      const shiftedY = ly - logicalOrigin.oy;
      const wx = shiftedX;
      const wy = -shiftedY;

      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy);
      maxY = Math.max(maxY, wy);
    });

    if (!Number.isFinite(minX)) return;

    const worldW = Math.max(1e-6, maxX - minX);
    const worldH = Math.max(1e-6, maxY - minY);

    const cx = (minX + maxX) * 0.5 + offsetX;
    const cy = (minY + maxY) * 0.5 + offsetY;

    const invScale = 1 / scale;

    // Base blend color = white
    const baseHex = "#ffffff";
    const baseR = parseInt(baseHex.slice(1, 3), 16);
    const baseG = parseInt(baseHex.slice(3, 5), 16);
    const baseB = parseInt(baseHex.slice(5, 7), 16);

    const sampleAtWorld = (wx: number, wy: number): string | null => {
      let nx = ((wx - cx) / worldW) * invScale + 0.5;
      let ny = ((wy - cy) / worldH) * invScale + 0.5;

      if (tileX) nx = wrap01(nx);
      if (tileY) ny = wrap01(ny);

      if (!tileX && (nx < 0 || nx > 1)) return null;
      if (!tileY && (ny < 0 || ny > 1)) return null;

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

    const next: RingMap = new Map(rings);

    // ✅ avoid in-place mutation for React state sanity
    next.forEach((r, key) => {
      if (targetKeys && !targetKeys.has(key)) return;

      const { x: lx, y: ly } = rcToLogical(r.row, r.col);
      const shiftedX = lx - logicalOrigin.ox;
      const shiftedY = ly - logicalOrigin.oy;
      const wx = shiftedX;
      const wy = -shiftedY;

      const sampled = sampleAtWorld(wx, wy);
      if (!sampled) return;

      const updated = {
        ...(r as any),
        color: normalizeColor6(sampled),
      } as PlacedRing;

      next.set(key, updated);
    });

    setRings(next);
  }, [
    overlay,
    rings,
    rcToLogical,
    logicalOrigin.ox,
    logicalOrigin.oy,
    overlayScope,
    overlayMaskKeys,
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

      const minLX = Math.min(sel.lx0, sel.lx1);
      const maxLX = Math.max(sel.lx0, sel.lx1);
      const minLY = Math.min(sel.ly0, sel.ly1);
      const maxLY = Math.max(sel.ly0, sel.ly1);

      const a = logicalToRowColApprox(minLX, minLY);
      const b = logicalToRowColApprox(maxLX, maxLY);

      const minRowS = Math.min(a.row, b.row) - 2;
      const maxRowS = Math.max(a.row, b.row) + 2;
      const minColS = Math.min(a.col, b.col) - 2;
      const maxColS = Math.max(a.col, b.col) + 2;

      if (mode === "rect") {
        for (let r = minRowS; r <= maxRowS; r++) {
          for (let c = minColS; c <= maxColS; c++) {
            const p = rcToLogical(r, c);
            if (p.x >= minLX && p.x <= maxLX && p.y >= minLY && p.y <= maxLY) next.add(`${r}-${c}`);
          }
        }
      } else if (mode === "circle") {
        const cx = sel.lx0;
        const cy = sel.ly0;
        const dx = sel.lx1 - sel.lx0;
        const dy = sel.ly1 - sel.ly0;
        const rr = Math.sqrt(dx * dx + dy * dy);

        for (let r = minRowS; r <= maxRowS; r++) {
          for (let c = minColS; c <= maxColS; c++) {
            const p = rcToLogical(r, c);
            const ddx = p.x - cx;
            const ddy = p.y - cy;
            if (ddx * ddx + ddy * ddy <= rr * rr) next.add(`${r}-${c}`);
          }
        }
      }

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
  // ✅ Use RingRenderer camera for projection/unprojection
  // ====================================================
  const getRendererCamera = useCallback((): THREE.PerspectiveCamera | null => {
    const cam = ringRendererRef.current?.getCamera?.();
    return cam && cam.isPerspectiveCamera ? (cam as THREE.PerspectiveCamera) : null;
  }, []);

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
);  // ============================================================
  // 🧾 BOM ADAPTER — Freeform → BOMRing[]
  // (declare BEFORE anything that references it)
  // ============================================================
  const getBOMRings = useCallback((): BOMRing[] => {
    const supplier: SupplierId = "cmj";

    const out: BOMRing[] = [];
    rings.forEach((r: PlacedRing) => {
      const id = `${r.row}-${r.col}`;
      const colorHex = normalizeColor6((r as any).color ?? "#ffffff");
      out.push({
        id,
        supplier,
        colorHex,
        innerDiameter: innerIDmm,
        wireDiameter: wireMm,
        material: "Unknown",
      });
    });

    return out;
  }, [rings, innerIDmm, wireMm]);

  // Optional: legacy global (remove once App.tsx stops calling it)
  useEffect(() => {
    (window as any).getBOMRings = getBOMRings;
    return () => {
      if ((window as any).getBOMRings === getBOMRings) {
        delete (window as any).getBOMRings;
      }
    };
  }, [getBOMRings]);

  // ==============================
  // BOM Panel State + Calculation
  // (✅ FIX: compute ONLY when panel is open)
  // ==============================
  const [showBOM, setShowBOM] = useState(false);

  const bom = useMemo(() => {
    if (!showBOM) return null;
    return calculateBOM(getBOMRings());
  }, [showBOM, getBOMRings]);

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
  const derived = useMemo(() => {
    const rings3D: any[] = [];
    const paintMap = new Map<string, string>();

    // ✅ Stats/BOM should remain on STORED (true) colors, not calibrated render colors
    const colorCountsStored = new Map<string, number>();

    const outerRadiusMm = (innerIDmm + 2 * wireMm) / 2;

    // Lazy: only build export list when needed
    const wantExport = finalizeOpen || showBOM;
    const exportRings: ExportRing[] = wantExport ? [] : [];

    rings.forEach((r: PlacedRing) => {
      const key = `${r.row},${r.col}`;

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

      rings3D.push({
        id: `${r.row},${r.col}`,
        row: r.row,
        col: r.col,
        x: shiftedX,
        y: shiftedY,
        z: 0,
        innerDiameter: innerIDmm,
        wireDiameter: wireMm,
        radius: outerRadiusMm,
        centerSpacing: centerSpacing,
        tilt: tiltDeg,
        tiltRad: tiltRad,
        color: renderColor,
      });

      // RingRenderer uses paint map for coloring; keep it consistent with render color
      paintMap.set(key, renderColor);

      // Stats should reflect true chosen colors
      colorCountsStored.set(storedColor, (colorCountsStored.get(storedColor) ?? 0) + 1);

      if (wantExport) {
        exportRings.push({
          key,
          x_mm: baseX,
          y_mm: baseY,
          innerDiameter_mm: innerIDmm,
          wireDiameter_mm: wireMm,
          // ✅ Export uses stored physical color
          colorHex: storedColor,
        });
      }
    });

    const byColor = Array.from(colorCountsStored.entries()).sort((a, b) => b[1] - a[1]);
    const ringStats = { total: rings.size, byColor, uniqueColors: byColor.length };

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
    showBOM,
    // ✅ Recompute render colors when calibration changes
    calibrationVersion,
  ]);

  const rings3D = derived.rings3D;
  const paintMap = derived.paintMap;
  const ringStats = derived.ringStats;
  const exportRings = derived.exportRings;

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
        const list = Array.from(document.querySelectorAll("canvas")) as HTMLCanvasElement[];

        // Prefer a WebGL canvas (Three.js)
        const gl = list.find((c) => {
          try {
            return !!(c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"));
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

  const ctx = canvas.getContext(
    "2d",
    { willReadFrequently: true } as CanvasRenderingContext2DSettings
  );
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

  const ctx = canvas.getContext(
    "2d",
    { willReadFrequently: true } as CanvasRenderingContext2DSettings
  );
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  // hit overlay canvas
  hitCanvas.width = rect.width * dpr;
  hitCanvas.height = rect.height * dpr;
  hitCanvas.style.width = `${rect.width}px`;
  hitCanvas.style.height = `${rect.height}px`;

  const hctx = hitCanvas.getContext(
    "2d",
    { willReadFrequently: true } as CanvasRenderingContext2DSettings
  );
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
  // HIT CIRCLE DRAWING (WORLD SPACE → SCREEN SPACE)
  // ✅ FIX: RAF-throttle + viewport cull (keeps huge counts responsive)
  // ====================================================
const drawHitCircles = useCallback(() => {
  const canvas = hitCanvasRef.current;
  const wrap = wrapRef.current;
  if (!canvas || !wrap) return;

  const ctx = canvas.getContext(
    "2d",
    { willReadFrequently: true } as CanvasRenderingContext2DSettings
  );
  if (!ctx) return;

  // Clear in CSS pixel space (since you setTransform(dpr,...) in resize)
  const rect = wrap.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (hideCircles) return;

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
    ) return;

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
  ]);

  useEffect(() => {
    return () => {
      if (hitRafRef.current != null) cancelAnimationFrame(hitRafRef.current);
      hitRafRef.current = null;
    };
  }, []);

// ====================================================
// SELECTION OVERLAY DRAWING (on interaction canvas)
// - Draws only when selection tool is active and dragging.
// - Does NOT interfere with hit circles (separate canvas).
// ====================================================

const drawSelectionOverlay = useCallback(() => {
  const canvas = canvasRef.current;
  const wrap = wrapRef.current;
  if (!canvas || !wrap) return;

  const ctx = canvas.getContext(
    "2d",
    { willReadFrequently: true } as CanvasRenderingContext2DSettings
  );
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

  // general style (kept consistent with existing UI)
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(37,99,235,0.95)";
  ctx.fillStyle = "rgba(37,99,235,0.18)";

  if (selectionMode === "rect") {
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
  }

  // hint text
  ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(248,250,252,0.9)";
  const hint = eraseMode ? "🧽" : overlayPickingRef.current ? "🖼️" : "🎨";
  ctx.fillText(`${hint} ${lastSelectionCount || ""}`, 10, rect.height - 12);
}, [selectionMode, isSelecting, eraseMode, lastSelectionCount]);

  // ✅ ESC to cancel selection / overlay-pick mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      // If we were picking overlay selection, cancel that too
      overlayPickingRef.current = false;

      // Cancel drag in-progress
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
    // keep selection overlay in sync with view
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

  // ===============================
  // PAN / ZOOM (mouse + touch)
  // ===============================
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Selection tool takes precedence (unless panning is explicitly active)
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
      // Always track cursor for floating bubble
      setCursorPx({ x: e.clientX, y: e.clientY });

      // Selection drag
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
        setLiveDims(computeDimsFromSelection(selectionRef.current, selectionMode));

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

        if (selectionMode === "rect") {
          for (let r = minRowC; r <= maxRowC; r++) {
            for (let c = minColC; c <= maxColC; c++) {
              const p = rcToLogical(r, c);
              if (p.x >= minLX && p.x <= maxLX && p.y >= minLY && p.y <= maxLY) {
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
    ],
  );

  // ====================================================
  // Bulk apply selection
  // - Adds rings in selection (or erases if eraseMode)
  // - Uses resolvePlacement per cell to preserve cluster logic
  // ====================================================
  const applySelectionToRings = useCallback(
    (sel: SelectionDrag, mode: SelectionMode) => {
      if (mode === "none") return;

      // Compute candidate cells
      const cells: Array<{ row: number; col: number }> = [];

      if (mode === "rect") {
        const minLX = Math.min(sel.lx0, sel.lx1);
        const maxLX = Math.max(sel.lx0, sel.lx1);
        const minLY = Math.min(sel.ly0, sel.ly1);
        const maxLY = Math.max(sel.ly0, sel.ly1);

        const a = logicalToRowColApprox(minLX, minLY);
        const b = logicalToRowColApprox(maxLX, maxLY);
        const minRowC = Math.min(a.row, b.row) - 2;
        const maxRowC = Math.max(a.row, b.row) + 2;
        const minColC = Math.min(a.col, b.col) - 2;
        const maxColC = Math.max(a.col, b.col) + 2;

        for (let r = minRowC; r <= maxRowC; r++) {
          for (let c = minColC; c <= maxColC; c++) {
            const p = rcToLogical(r, c);
            if (p.x >= minLX && p.x <= maxLX && p.y >= minLY && p.y <= maxLY) {
              cells.push({ row: r, col: c });
            }
          }
        }
      } else if (mode === "circle") {
        const cx = sel.lx0;
        const cy = sel.ly0;
        const dx = sel.lx1 - sel.lx0;
        const dy = sel.ly1 - sel.ly0;
        const rr = Math.sqrt(dx * dx + dy * dy);

        const minLX = cx - rr;
        const maxLX = cx + rr;
        const minLY = cy - rr;
        const maxLY = cy + rr;

        const a = logicalToRowColApprox(minLX, minLY);
        const b = logicalToRowColApprox(maxLX, maxLY);
        const minRowC = Math.min(a.row, b.row) - 2;
        const maxRowC = Math.max(a.row, b.row) + 2;
        const minColC = Math.min(a.col, b.col) - 2;
        const maxColC = Math.max(a.col, b.col) + 2;

        const rr2 = rr * rr;

        for (let r = minRowC; r <= maxRowC; r++) {
          for (let c = minColC; c <= maxColC; c++) {
            const p = rcToLogical(r, c);
            const ddx = p.x - cx;
            const ddy = p.y - cy;
            if (ddx * ddx + ddy * ddy <= rr2) {
              cells.push({ row: r, col: c });
            }
          }
        }
      }

      if (!cells.length) {
        setLastSelectionCount(0);
        setSelectedKeys(new Set());
        return;
      }

      // Stable order (row-major) for deterministic placement & cluster behavior
      cells.sort((a, b) => a.row - b.row || a.col - b.col);

      // Highlight selected cells (for render feedback)
      setSelectedKeys(new Set(cells.map((c) => `${c.row}-${c.col}`)));

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
      setSelectedKeys(new Set());
    },
    [rings, nextClusterId, eraseMode, settings, logicalToRowColApprox, rcToLogical],
  );

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
          applySelectionToRings(sel, selectionMode);
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
    finalizeSelection,
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
          setLiveDims(computeDimsFromSelection(selectionRef.current, selectionMode));
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

        setLiveDims(computeDimsFromSelection(selectionRef.current, selectionMode));
        drawSelectionOverlay();
        return;
      }

      // Pan drag (single finger)
      if (!panMode || !isPanning || !panStart.current || e.touches.length !== 1) return;

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
          applySelectionToRings(sel, selectionMode);
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
    canvas.addEventListener("touchstart", handleTouchStartNative, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMoveNative, { passive: false });
    canvas.addEventListener("touchend", handleTouchEndNative, { passive: true });
    canvas.addEventListener("touchcancel", handleTouchEndNative, { passive: true });

    return () => {
      canvas.removeEventListener("wheel", handleWheelNative as any);

      canvas.removeEventListener("touchstart", handleTouchStartNative as any);
      canvas.removeEventListener("touchmove", handleTouchMoveNative as any);
      canvas.removeEventListener("touchend", handleTouchEndNative as any);
      canvas.removeEventListener("touchcancel", handleTouchEndNative as any);
    };
  }, [handleWheelNative, handleTouchStartNative, handleTouchMoveNative, handleTouchEndNative]);

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

      const { row: approxRow, col: approxCol } = logicalToRowColApprox(adjLx, adjLy);

      const effectiveInnerRadiusMm = getEffectiveInnerRadiusMm(approxRow);
      const baseCircleRmm = effectiveInnerRadiusMm;

      const hitRadiusPx = projectRingRadiusPx(adjLx, adjLy, baseCircleRmm * circleScale) * 1.05;

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
          const line = `lx=${lx.toFixed(3)} ly=${ly.toFixed(3)} row=${bestRow} col=${bestCol}\n`;
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
    ],
  );

  // ===============================
  // CLEAR / GEOMETRY RESET
  // ===============================
  const handleClear = useCallback(() => {
    if (!window.confirm("Clear all rings?")) return;
    setRings(new Map());
    setnextClusterId(1);
    setSelectedKeys(new Set());
    applyHistory();
  }, []);

  const resetGeometryToDefaults = useCallback(() => {
    setCenterSpacing(WEAVE_SETTINGS_DEFAULT.spacingX);
    setAngleIn(25);
    setAngleOut(-25);
  }, []);

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
    const auto = storedAuto === null ? true : storedAuto === "true" || storedAuto === "1";
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
    let thumb: { pngDataUrl: string; width: number; height: number } | undefined;
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
  }, [rings, innerIDmm, wireMm, centerSpacing, angleIn, angleOut, assignment, getRendererCanvas]);

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
      setnextClusterId(Math.max(1, ...Array.from(map.values()).map((r) => r.cluster ?? 1)) + 1);

      if (data.geometry) {
        setInnerIDmm(data.geometry.innerDiameter ?? innerIDmm);
        setWireMm(data.geometry.wireDiameter ?? wireMm);
        setCenterSpacing(data.geometry.centerSpacing ?? centerSpacing);
        setAngleIn(data.geometry.angleIn ?? angleIn);
        setAngleOut(data.geometry.angleOut ?? angleOut);
      }

      if (data.paletteAssignment) {
        setAssignment(data.paletteAssignment);
        localStorage.setItem("freeform.paletteAssignment", JSON.stringify(data.paletteAssignment));
      }
    },
    [innerIDmm, wireMm, centerSpacing, angleIn, angleOut],
  );

  // ====================================================
  // Manual JSON load
  // ====================================================
  const handleFileJSONLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result || "{}"));

        if (typeof data.innerDiameter === "number") setInnerIDmm(data.innerDiameter);
        if (typeof data.wireDiameter === "number") setWireMm(data.wireDiameter);
        if (typeof data.centerSpacing === "number") setCenterSpacing(data.centerSpacing);
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
  }, []);

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
      {/* ============================= */}
      {/* ✅ FLOATING TOOLBAR (Designer style) */}
      {/* ============================= */}
      <DraggablePill id="freeform-toolbar" defaultPosition={{ x: 20, y: 20 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
            width: 76,
            padding: 10,
            background: "#0f172a",
            border: "1px solid #0b1020",
            borderRadius: 20,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            userSelect: "none",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* ✨ Identity */}
          <ToolButton active title="Freeform">
            ✨
          </ToolButton>

          {/* Paint */}
          <ToolButton
            active={!eraseMode && selectionMode === "none"}
            onClick={() => {
              setEraseMode(false);
              setSelectionMode("none");
              setSelectedKeys(new Set());
            }}
            title="Paint rings"
          >
            🎨
          </ToolButton>

          {/* Erase */}
          <ToolButton
            active={eraseMode}
            onClick={() => {
              setEraseMode(true);
              setSelectionMode("none");
              setSelectedKeys(new Set());
            }}
            title="Erase rings"
          >
            🧽
          </ToolButton>

          {/* Rectangle Selection */}
          <ToolButton
            active={selectionMode === "rect"}
            onClick={() => {
              setSelectionMode((m) => (m === "rect" ? "none" : "rect"));
              setEraseMode(false);
              setPanMode(false);
              setSelectedKeys(new Set());
            }}
            title="Rectangle selection"
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>▢</span>
          </ToolButton>

          {/* Circle Selection */}
          <ToolButton
            active={selectionMode === "circle"}
            onClick={() => {
              setSelectionMode((m) => (m === "circle" ? "none" : "circle"));
              setEraseMode(false);
              setPanMode(false);
              setSelectedKeys(new Set());
            }}
            title="Circle selection"
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>◯</span>
          </ToolButton>

          {/* Pan */}
          <ToolButton
            active={panMode}
            onClick={() => {
              setPanMode((v) => !v);
              setSelectionMode("none");
              setSelectedKeys(new Set());
            }}
            title="Pan / Drag view"
          >
            ✋
          </ToolButton>

          {/* Diagnostics */}
          <ToolButton
            active={showDiagnostics}
            onClick={() => setShowDiagnostics((v) => !v)}
            title="Diagnostics"
          >
            🧪
          </ToolButton>

          {/* Controls */}
          <ToolButton
            active={showControls}
            onClick={() => setShowControls((v) => !v)}
            title="Geometry & JSON controls"
          >
            🧰
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

          {/* BOM */}
          <ToolButton
            active={showBOM}
            onClick={() => setShowBOM((v) => !v)}
            title="Bill of Materials"
          >
            🧾
          </ToolButton>

          <ProjectSaveLoadButtons
            onSave={saveFreeformProject}
            onLoad={(json) => {
              if (!window.confirm("Load project and replace current work?")) return;
              loadFreeformProject(json);
            }}
          />

          {/* Navigation */}
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
        </div>
      </DraggablePill>

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
          <div style={{ display: "flex", gap: 6, width: "100%", justifyContent: "space-between" }}>
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
              <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc" }}>Saved palettes</div>
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
                  disabled={!selectedSavedPalette || !savedColorPalettes[selectedSavedPalette]}
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

              <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#f8fafc" }}>
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
                  setSavedColorPalettes({ ...savedColorPalettes, [name]: [...colorPalette] });
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

      {/* ============================= */}
      {/* ✅ IMAGE OVERLAY PANEL (Freeform) */}
      {/* ============================= */}
      {showImageOverlay && (
        <DraggablePill id="freeform-image-overlay" defaultPosition={{ x: 120, y: 120 }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>🖼️ Image Overlay</strong>
              <button
                onClick={() => setShowImageOverlay(false)}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16 }}
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
              <div style={{ fontWeight: 800, fontSize: 12 }}>Transfer Scope</div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="overlayScope"
                    checked={overlayScope === "all"}
                    onChange={() => setOverlayScope("all")}
                  />
                  <span>All rings</span>
                </label>

                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
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
                      setSelectionMode((m) => (m === "none" ? "rect" : m));
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
                      Tip: click “Pick selection area”, then drag a selection. Press <b>Esc</b> to cancel.
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
                onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), scale: Number(e.target.value) }))}
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
                onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), opacity: Number(e.target.value) }))}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 4 }}>
                Offset X
                <input
                  type="number"
                  value={Number((overlay as any)?.offsetX ?? 0)}
                  onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), offsetX: Number(e.target.value) }))}
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
                  onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), offsetY: Number(e.target.value) }))}
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
                onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), tile: e.target.checked }))}
              />
              <span>Tile (repeat)</span>
            </label>

            <div style={{ fontSize: 11, opacity: 0.85 }}>
              Crop (normalized 0..1). These values enable your “window selection” pipeline.
              You can wire a drag-rect UI later to set these.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 4 }}>
                U0
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={Number((overlay as any)?.cropU0 ?? 0)}
                  onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), cropU0: Number(e.target.value) }))}
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
                  onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), cropV0: Number(e.target.value) }))}
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
                  onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), cropU1: Number(e.target.value) }))}
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
                  onChange={(e) => setOverlay((p: any) => ({ ...(p ?? {}), cropV1: Number(e.target.value) }))}
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
              onClick={applyOverlayToFreeform}
              disabled={
                !((overlay as any)?.dataUrl ?? (overlay as any)?.src ?? (overlay as any)?.url) ||
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
                  !((overlay as any)?.dataUrl ?? (overlay as any)?.src ?? (overlay as any)?.url) ||
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
          initialAssignment={assignment}
          onAssignmentChange={(p) => setAssignment(p)}
          getRendererCanvas={getRendererCanvas}
          onClose={() => setFinalizeOpen(false)}
          mapMode="freeform" // ✅ Freeform wants the numbered full-image map
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
                  applySelectionToRings(sel, selectionMode);
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

        {/* ==============================
            🧾 Floating BOM Panel (Freeform)
           ============================== */}
        {showBOM && (
          <DraggablePill id="freeform-bom-panel" defaultPosition={{ x: 420, y: 120 }}>
            <div
              style={{
                minWidth: 280,
                maxWidth: 360,
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
                <strong style={{ fontSize: 14 }}>🧾 Bill of Materials</strong>
                <button
                  onClick={() => setShowBOM(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <BOMButtons rings={exportRings} meta={freeformBOMMeta} compact />
              </div>
              {/* Summary */}
              <div style={{ marginBottom: 10 }}>
                <div>
                  Rings: <strong>{bom?.summary?.totalRings ?? 0}</strong>
                </div>
                <div>
                  Colors: <strong>{bom?.summary?.uniqueColors ?? 0}</strong>
                </div>
                <div>
                  Total Weight: <strong>{(bom?.summary?.totalWeight ?? 0).toFixed(2)} g</strong>
                </div>
              </div>

              {/* Color Breakdown */}
              <div style={{ marginBottom: 10 }}>
                <strong>By Color</strong>
                {(bom?.lines ?? []).map((line) => (
                  <div
                    key={`${line.supplier}-${line.colorHex}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          background: line.colorHex,
                          borderRadius: 3,
                          border: "1px solid #000",
                        }}
                      />
                      {line.colorHex}
                    </span>
                    <span>{line.ringCount}</span>
                  </div>
                ))}
              </div>

              {/* Supplier Breakdown */}
              <div style={{ marginBottom: 10 }}>
                <strong>By Supplier</strong>
                {(bom?.summary?.suppliers ?? []).map((s) => (
                  <div key={s} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{s.toUpperCase()}</span>
                    <span>
                      {(bom?.lines ?? [])
                        .filter((l) => l.supplier === s)
                        .reduce((sum, l) => sum + (l.ringCount ?? 0), 0)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Print */}
              <button
                onClick={() => window.print()}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                🖨 Print BOM
              </button>
            </div>
          </DraggablePill>
        )}

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
            <h3 style={{ margin: 0, fontSize: 14 }}>Freeform Geometry (Tuner-linked)</h3>

            <p style={{ margin: 0, opacity: 0.8, lineHeight: 1.3 }}>
              Uses the same <b>center spacing</b> and hex grid as the Weave Tuner. Vertical spacing is{" "}
              <code>center × 0.866</code> and odd rows are shifted by <code>center / 2</code>.
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

            <SliderRow label="Angle In (°)" value={angleIn} setValue={setAngleIn} min={-75} max={75} step={1} unit="°" />

            <SliderRow
              label="Angle Out (°)"
              value={angleOut}
              setValue={setAngleOut}
              min={-75}
              max={75}
              step={1}
              unit="°"
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
                <input type="checkbox" checked={hideCircles} onChange={(e) => setHideCircles(e.target.checked)} />
                <span>Hide circles (still clickable)</span>
              </label>

              <div style={{ fontWeight: 700, fontSize: 12, textAlign: "left" }}>Circles (on placed rings only)</div>

              <label>Offset X (mm)</label>
              <input
                type="range"
                min={-innerIDmm * 20}
                max={innerIDmm * 20}
                step={0.05}
                value={circleOffsetX}
                onChange={(e) => setCircleOffsetX(Number(e.target.value))}
              />

              <label>Offset Y (mm)</label>
              <input
                type="range"
                min={-innerIDmm * 20}
                max={innerIDmm * 20}
                step={0.05}
                value={circleOffsetY}
                onChange={(e) => setCircleOffsetY(Number(e.target.value))}
              />

              <label>Scale</label>
              <input
                type="range"
                min={0.2}
                max={2.5}
                step={0.01}
                value={circleScale}
                onChange={(e) => setCircleScale(Number(e.target.value))}
              />
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                lineHeight: 1.4,
                borderTop: "1px solid rgba(148,163,184,0.35)",
                paddingTop: 6,
              }}
            >
              <div>Inner ID: {innerIDmm.toFixed(2)} mm</div>
              <div>Wire: {wireMm.toFixed(2)} mm</div>
              <div>AR ≈ {aspectRatio.toFixed(2)}</div>
              <div>Zoom: {zoom.toFixed(2)}×</div>
              <div>
                Select:{" "}
                {selectionMode === "none" ? "—" : selectionMode === "rect" ? "Rectangle" : "Circle"}{" "}
                {selectionMode !== "none" ? "(Esc to cancel)" : ""}
              </div>
              <div>Last Select Count: {lastSelectionCount}</div>
            </div>

            {/* JSON / Ring Set controls */}
            <div
              style={{
                borderTop: "1px solid rgba(148,163,184,0.35)",
                paddingTop: 6,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 600 }}>Ring Set (from Tuner JSON)</div>

              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={autoFollowTuner} onChange={(e) => setAutoFollowTuner(e.target.checked)} />
                <span>Follow latest Tuner save automatically</span>
              </label>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ flexShrink: 0 }}>Ring Set:</span>
                <select
                  value={activeRingSetId ?? ""}
                  disabled={autoFollowTuner}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    setActiveRingSetId(id);
                    setAutoFollowTuner(false);
                    if (id) {
                      const found = ringSets.find((r) => r.id === id);
                      if (found) applyRingSet(found);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "2px 6px",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.4)",
                    background: "#020617",
                    color: "#e5e7eb",
                  }}
                >
                  <option value="">(none)</option>
                  {ringSets.map((rs) => (
                    <option key={rs.id} value={rs.id}>
                      {rs.id}
                      {rs.status ? ` (${rs.status})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  style={smallBtnBlue}
                  onClick={() => {
                    reloadRingSets();
                    setAutoFollowTuner(true);
                  }}
                >
                  🔄 Refresh from Tuner
                </button>
                <button style={smallBtn} onClick={() => navigate("/tuner")}>
                  🧭 Edit in Tuner
                </button>
              </div>

              <div style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Load JSON File</div>
                <input type="file" accept="application/json" onChange={handleFileJSONLoad} style={{ fontSize: 11 }} />
                <div style={{ opacity: 0.7, marginTop: 2 }}>
                  JSON structure: <code>innerDiameter, wireDiameter, centerSpacing, angleIn, angleOut</code>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={resetGeometryToDefaults} style={smallBtn}>
                Reset Geometry
              </button>
            </div>
          </div>
        )}

        {/* ==============================
            ✅ FREEFORM STATS PANEL (BOTTOM-RIGHT)
           ============================== */}
        {showFreeformStats && (
          <div
            style={{
              position: "fixed",
              right: 18,
              bottom: 18,
              zIndex: 99999,
              width: 260,
              maxHeight: 320,
              overflow: "auto",
              background: "rgba(17,24,39,0.96)",
              border: "1px solid rgba(0,0,0,0.6)",
              borderRadius: 14,
              padding: 12,
              color: "#e5e7eb",
              boxShadow: "0 12px 40px rgba(0,0,0,.45)",
              fontSize: 13,
              userSelect: "none",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <strong style={{ fontSize: 14 }}>📏 Freeform Stats</strong>
              <button
                onClick={() => setShowFreeformStats(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Dimensions */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Dimensions</div>

              {!dimsNow ? (
                <div style={{ color: "#9ca3af" }}>—</div>
              ) : dimsNow.kind === "circle" ? (
                <div style={{ display: "grid", gap: 2, color: "#cbd5e1" }}>
                  <div>Circle</div>
                  <div>
                    Radius: {formatNum(dimsNow.radiusMm, 1)} mm ({formatNum(dimsNow.radiusRings, 1)} rings)
                  </div>
                  <div>
                    Diameter: {formatNum(dimsNow.diameterMm, 1)} mm ({formatNum(dimsNow.diameterRings, 1)} rings)
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 2, color: "#cbd5e1" }}>
                  <div>Square</div>
                  <div>
                    {formatNum(dimsNow.widthMm, 1)} × {formatNum(dimsNow.heightMm, 1)} mm
                  </div>
                  <div>
                    {formatNum(dimsNow.widthRings, 0)} × {formatNum(dimsNow.heightRings, 0)} rings
                  </div>
                </div>
              )}
            </div>

            {/* Total */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800 }}>Total</span>
                <span style={{ fontWeight: 800 }}>{ringStats.total}</span>
              </div>
              <div style={{ color: "#9ca3af", fontSize: 12 }}>Colors used: {ringStats.uniqueColors}</div>
            </div>

            {/* By Color */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>By Color</div>

              {ringStats.byColor.length === 0 ? (
                <div style={{ color: "#9ca3af" }}>No rings yet</div>
              ) : (
                ringStats.byColor.map(([hex, count]) => (
                  <div
                    key={hex}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: hex,
                          border: "1px solid rgba(0,0,0,0.75)",
                        }}
                      />
                      <span style={{ color: "#cbd5e1" }}>{hex}</span>
                    </div>
                    <span style={{ fontWeight: 700 }}>{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* DIAGNOSTIC PANEL (copyable text) */}
        {showDiagnostics && (
          <div
            style={{
              position: "fixed",
              left: 88,
              top: 16,
              width: 420,
              maxHeight: "40vh",
              background: "rgba(15,23,42,0.96)",
              borderRadius: 12,
              padding: 8,
              border: "1px solid rgba(248,250,252,0.3)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 11,
              userSelect: "text",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>Diagnostics (copy text)</span>
              <button
                style={{
                  ...smallBtn,
                  flex: "none",
                  padding: "2px 6px",
                  fontSize: 10,
                }}
                onClick={() => setDiagLog("")}
              >
                Clear
              </button>
            </div>

            <div
              style={{
                whiteSpace: "pre",
                overflowY: "auto",
                borderRadius: 8,
                background: "rgba(15,23,42,0.9)",
                padding: 6,
                border: "1px solid rgba(30,64,175,0.6)",
                userSelect: "text",
              }}
            >
              {diagLog || "Click on the canvas to log diagnostics..."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeformChainmail2D;