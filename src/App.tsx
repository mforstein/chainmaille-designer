// ==============================
// src/App.tsx
// Chainmail Studio – BOM-Ready Root
// ==============================
//
// PURPOSE
// -------
// This file is the application root and routing hub for:
//
// • Designer (3D chainmail builder)
// • FreeformChainmail2D (paint-first workflow)
// • ErinPattern2D (pattern-centric workflow)
// • Ring Size Chart
// • Weave Tuner
//
// BOM (Bill of Materials) SUPPORT
// -------------------------------
// This file defines the *canonical shared types* required for BOM calculation
// across ALL pages. Each page (Designer, Freeform, Erin2D) will expose a
// `getBOMRings()` adapter that converts its internal ring representation into
// a normalized BOM ring list.
//
// A shared `bomCalculator.ts` will consume that normalized data and output:
//
// • Ring count totals
// • Supplier breakdown
// • Color/material breakdown
// • Estimated weight
// • Pack counts
// • Printable purchase order
//
// IMPORTANT CONSTRAINTS
// ---------------------
// • Rendering logic MUST NOT be modified by BOM logic
// • BOM logic MUST be read-only
// • BOM must work regardless of page or renderer type
// • No feature removal
//
// NORMALIZED BOM RING SHAPE
// -------------------------
// Every page must be able to produce:
//
// interface BOMRing {
//   id: string;                 // stable per-ring id
//   supplier: SupplierId;       // cmj | trl | mdz
//   colorHex: string;           // resolved final color
//   innerDiameter: number;      // mm
//   wireDiameter: number;       // mm
//   material?: string;          // optional (aluminum, steel, etc.)
// }
//
// These are aggregated by bomCalculator.ts
//
// ==============================

import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, Link } from "react-router-dom";
import { calculateBOM } from "./BOM/bomCalculator";
import "./index.css";
import "./ui/ui-grid.css";
import HomeWovenRainbows from "./pages/HomeWovenRainbows";
import {
  getDeviceLimits,
  clampAndPersist,
  clampPersistedDims,
  SAFE_DEFAULT,
} from "./utils/limits";
import ColorCalibrationTest from "./pages/ColorCalibrationTest";

import SplineSandbox from "./splineSandbox/SplineSandbox";

// ==============================
// Renderer
// ==============================
import RingRenderer, { RingRendererHandle } from "./components/RingRenderer";
// ==============================
// Geometry Generators
// ==============================
import {
  generateRings,
  generateRingsDesigner,
} from "./components/ringGenerators";

// ==============================
// Shared UI + Data
// ==============================
import { MATERIALS, UNIVERSAL_COLORS } from "./utils/colors";
import SupplierMenu from "./components/SupplierMenu";
import AtlasPalette from "./components/AtlasPalette";
import {
  ImageOverlayPanel,
  OverlayState,
} from "./components/ImageOverlayPanel";
import ProjectSaveLoadButtons from "./components/ProjectSaveLoadButtons";
import FinalizeAndExportPanel from "./components/FinalizeAndExportPanel";
import type { ExportRing, PaletteAssignment } from "./types/project";

// ==============================
// Pages
// ==============================
import RingSizeChart from "./pages/RingSizeChart";
import ChainmailWeaveTuner from "./pages/ChainmailWeaveTuner";
import ChainmailWeaveAtlas from "./pages/ChainmailWeaveAtlas";
import PasswordGate from "./pages/PasswordGate";
import AuthPage from "./pages/AuthPage";
import PricingPage from "./pages/PricingPage";
import EulaPage from "./pages/EulaPage";
import CommercialLicensePage from "./pages/CommercialLicensePage";
import FreeformChainmail2D from "./pages/FreeformChainmail2D";
import ErinPattern2D from "./pages/ErinPattern2D";
import UserManual from "./pages/UserManual";
import ReleaseNotes from "./pages/ReleaseNotes";
import BOMButtons from "./components/BOMButtons";
import { IconHamburger, IconSpline, IconEraser, IconUndo, IconRedo } from "./components/icons/ToolIcons";
import { ToolBtn } from "./components/ui/ToolBtn";
import RequiresTier from "./auth/RequiresTier";
import { useAuth, tierAtLeast } from "./auth/AuthContext";
import SupplierColorPalette from "./components/SupplierColorPalette";

// ==============================
// BOM-RELATED SHARED TYPES
// ==============================

export type SupplierId = "cmj" | "trl" | "mdz" | "spg";
export type ColorMode = "solid" | "checker";
export type Unit = "mm" | "in";

// Canonical parameter block used by Designer + adapters
export interface Params {
  rows: number;
  cols: number;
  innerDiameter: number;
  wireDiameter: number;
  overlapX: number;
  overlapY: number;
  colorMode: ColorMode;
  ringColor: string;
  altColor: string;
  bgColor: string;
  supplier: SupplierId;
  ringSpec: string;
  unit: Unit;
  centerSpacing?: number;

  // ✅ weave tuner / atlas support
  angleIn?: number;
  angleOut?: number;
}

export type ColorId = string; // stable identity: `${supplier}:${sku}`

export interface BOMRing {
  id: string; // per-ring stable id (row,col)
  supplier: SupplierId; // cmj | trl | mdz

  // 🔑 NEW — identity for BOM & ordering
  colorId?: ColorId; // supplier+sku identity (optional here)
  sku?: string; // supplier SKU / order code (optional)

  // 🎨 Display
  colorHex: string;

  // 📐 Geometry
  innerDiameter: number; // mm
  wireDiameter: number; // mm
  material?: string;
}

// Paint map used by 3D Designer
export type PaintMap = Map<string, string | null>;

// ==============================
// Utilities
// ==============================

export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));

function PasswordGateWrapper({ onUnlock }: { onUnlock: () => void }) {
  return (
    <PasswordGate
      onSuccess={() => {
        // 🔓 unlock everything once
        localStorage.setItem("designerAuth", "true");
        localStorage.setItem("freeformAuth", "true");
        localStorage.setItem("erin2DAuth", "true");

        onUnlock();
      }}
    />
  );
}
const UI_MARGIN = 12;


function clampToViewport(
  pos: { x: number; y: number },
  size: { w: number; h: number },
) {
  const maxX = Math.max(UI_MARGIN, window.innerWidth - size.w - UI_MARGIN);
  const maxY = Math.max(UI_MARGIN, window.innerHeight - size.h - UI_MARGIN);

  return {
    x: clamp(pos.x, UI_MARGIN, maxX), // ✅ uses your existing clamp()
    y: clamp(pos.y, UI_MARGIN, maxY), // ✅ uses your existing clamp()
  };
}

// ==============================
// Draggable Floating Pill (Shared UI)
// iPad-safe: Pointer Events + Text-node target handling
// ==============================

function DraggablePill({
  id,
  defaultPosition = { x: 20, y: 20 },
  children,
}: {
  id: string;
  defaultPosition?: { x: number; y: number };
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    // load saved position if any
    let initial = defaultPosition;
    const saved = localStorage.getItem(`pill-pos-${id}`);
    if (saved) {
      try {
        initial = JSON.parse(saved);
      } catch {
        initial = defaultPosition;
      }
    }

    // initial clamp using a conservative size guess (refine after mount)
    const guessedSize = { w: 220, h: 220 };
    return clampToViewport(initial, guessedSize);
  });

  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  // Persist position
  useEffect(() => {
    try {
      localStorage.setItem(`pill-pos-${id}`, JSON.stringify(pos));
    } catch {}
  }, [id, pos]);

  // ✅ After first paint (and on resize/orientation change), measure and clamp.
  useEffect(() => {
    const clampNow = () => {
      const el = rootRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const size = {
        w: Math.max(1, Math.round(rect.width)),
        h: Math.max(1, Math.round(rect.height)),
      };

      setPos((p) => {
        const clamped = clampToViewport(p, size);
        // avoid extra renders if already ok
        if (clamped.x === p.x && clamped.y === p.y) return p;
        return clamped;
      });
    };

    // clamp after mount
    requestAnimationFrame(() => clampNow());

    // clamp on resize + orientation changes
    window.addEventListener("resize", clampNow);
    window.addEventListener("orientationchange", clampNow);

    return () => {
      window.removeEventListener("resize", clampNow);
      window.removeEventListener("orientationchange", clampNow);
    };
  }, []);

  // iOS Safari sometimes gives Text nodes (emoji) as event targets.
  const getTargetElement = (t: EventTarget | null): Element | null => {
    if (!t) return null;
    const anyT = t as any;
    if (anyT?.nodeType === 3) return anyT.parentElement ?? null;
    if (t instanceof Element) return t;
    return null;
  };

  const isInteractive = (t: EventTarget | null) => {
    const el = getTargetElement(t);
    if (!el) return false;
    return !!el.closest(
      "button, input, select, textarea, label, a, [role='button'], [role='slider'], [data-nondrag]",
    );
  };
  

  const start = (clientX: number, clientY: number) => {
    draggingRef.current = true;
    setDragging(true);
    offsetRef.current = { x: clientX - pos.x, y: clientY - pos.y };
  };

  const move = (clientX: number, clientY: number) => {
    if (!draggingRef.current) return;

    // During drag, keep it clamped using current element size.
    const el = rootRef.current;
    const rect = el?.getBoundingClientRect();
    const size = rect
      ? { w: Math.max(1, rect.width), h: Math.max(1, rect.height) }
      : { w: 220, h: 220 };

    const next = clampToViewport(
      { x: clientX - offsetRef.current.x, y: clientY - offsetRef.current.y },
      size,
    );

    setPos(next);
  };

  const stop = () => {
    draggingRef.current = false;
    setDragging(false);
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        background: "rgba(17,24,39,.92)",
        border: "1px solid rgba(0,0,0,.6)",
        boxShadow: "0 12px 40px rgba(0,0,0,.45)",
        borderRadius: 24,
        padding: 12,
        userSelect: "none",
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
        // Optional: ensure it never visually “bleeds” offscreen
        maxWidth: "min(92vw, 520px)",
      }}
      onPointerDown={(e) => {
        if (isInteractive(e.target)) return;
        if (!e.isPrimary) return;
        try {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        } catch {}
        start(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        stop();
        try {
          (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        } catch {}
      }}
      onPointerCancel={() => stop()}
    >
      {children}
    </div>
  );
}
function resetAllPills() {
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("pill-pos-")) localStorage.removeItem(k);
    });
  } catch {}
  // force reload so each pill re-initializes to defaults
  window.location.reload();
}
// ==============================================
// === CHAINMAIL DESIGNER COMPONENT STARTS HERE ===
// ==============================================
function ChainmailDesigner() {
  const { tier } = useAuth();
  const canUseOverlay = tierAtLeast(tier, "crafter");
  // 🧩 All your useState hooks go here — top level
  const [showOverlayPanel, setShowOverlayPanel] = useState(false);
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugMessage, setDebugMessage] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [assignment, setAssignment] = useState<PaletteAssignment | null>(null);

  // Interactive tool state
  const [paintMode, setPaintMode] = useState(true);
  const [eraseMode, setEraseMode] = useState(false);
  const [rotationLocked, setRotationLocked] = useState(true);
  const [activeColor, setActiveColor] = useState("#8F00FF");
  const [activeMenu, setActiveMenu] = useState<"camera" | "controls" | null>(
    null,
  );
  const [showGearMenu, setShowGearMenu] = useState(false);

  const [showMagnet, setShowMagnet] = useState(false);
  const [showMaterialPalette, setShowMaterialPalette] = useState(false);
  const [showDesignerSupplierColors, setShowDesignerSupplierColors] = useState(false);
  const [showCompass, setShowCompass] = useState(false);
  const [overlayState, setOverlayState] = useState<OverlayState | null>(null);
  const [gridAspect, setGridAspect] = useState<number>(1.6);

  // ============================================================
  // ↩ UNDO / REDO (paint map history)
  // ============================================================
  const paintHistoryRef = useRef<PaintMap[]>([new Map()]);
  const paintHistoryIdxRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushPaintHistory = useCallback((snapshot: PaintMap) => {
    const history = paintHistoryRef.current;
    const idx = paintHistoryIdxRef.current;
    const newHistory = history.slice(0, idx + 1);
    newHistory.push(new Map(snapshot));
    paintHistoryRef.current = newHistory;
    paintHistoryIdxRef.current = newHistory.length - 1;
    setCanUndo(newHistory.length > 1);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    const idx = paintHistoryIdxRef.current;
    if (idx <= 0) return;
    const prevIdx = idx - 1;
    paintHistoryIdxRef.current = prevIdx;
    setPaint(new Map(paintHistoryRef.current[prevIdx]));
    setCanUndo(prevIdx > 0);
    setCanRedo(true);
  }, []);

  const handleRedo = useCallback(() => {
    const idx = paintHistoryIdxRef.current;
    const history = paintHistoryRef.current;
    if (idx >= history.length - 1) return;
    const nextIdx = idx + 1;
    paintHistoryIdxRef.current = nextIdx;
    setPaint(new Map(history[nextIdx]));
    setCanUndo(true);
    setCanRedo(nextIdx < history.length - 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo]);

  // ============================================================
  // ✅ SPLINE TOOL (Designer overlay)
  // ============================================================
  const [showSplineTool, setShowSplineTool] = useState(false);
  const DESIGNER_SPLINE_KEY = "cmd.spline.designer";

  // renderer handle
  const rendererRef = useRef<RingRendererHandle | null>(null);

  const [lastWeave, setLastWeave] = useState<any | null>(null);

  // --- load saved weave on mount ---
  useEffect(() => {
    const loadWeave = () => {
      try {
        const selected = JSON.parse(
          localStorage.getItem("chainmailSelected") || "null",
        );
        if (selected) return setLastWeave(selected);
        const all = JSON.parse(localStorage.getItem("chainmailMatrix") || "[]");
        if (Array.isArray(all) && all.length) setLastWeave(all[all.length - 1]);
        else setLastWeave(null);
      } catch {
        setLastWeave(null);
      }
    };
    loadWeave();
    window.addEventListener("storage", loadWeave);
    window.addEventListener("weave-updated", loadWeave);
    return () => {
      window.removeEventListener("storage", loadWeave);
      window.removeEventListener("weave-updated", loadWeave);
    };
  }, []);

  const [params, setParams] = useState<Params>(() => {
    const def: Params = {
      rows: 20,
      cols: 20,
      innerDiameter: 7.94,
      wireDiameter: 1.6,
      overlapX: 0.3,
      overlapY: 0.3,
      colorMode: "solid",
      ringColor: MATERIALS.find((m) => m.name === "Aluminum")?.hex || "#C0C0C0",
      altColor: "#B2B2B2",
      bgColor: "#0F1115",
      supplier: "cmj",
      ringSpec: "ID 7.94 mm / WD 1.6 mm (AR≈4.96)",
      unit: "mm",
      centerSpacing: 7.5,

      // ✅ default weave angles
      angleIn: 25,
      angleOut: -25,
    };

    // Read previously saved params, if any
    let p = def;
    const saved = localStorage.getItem("cmd.params");
    if (saved) {
      try {
        p = { ...def, ...JSON.parse(saved) };
      } catch {
        p = def;
      }
    }

    // ✅ Pre-mount clamp (prevents OOM loops on iPad)
    const { rows: r, cols: c } = clampAndPersist("designer", p.rows, p.cols);
    p = { ...p, rows: r, cols: c };

    // Keep "cmd.params" in sync so refresh is safe
    try {
      localStorage.setItem("cmd.params", JSON.stringify(p));
    } catch {}

    return p;
  });

  const [paint, setPaint] = useState<PaintMap>(() => new Map());

  // persist params & paint updates
  useEffect(() => {
    try {
      localStorage.setItem("cmd.params", JSON.stringify(params));
    } catch {}
  }, [params]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "cmd.paint",
        JSON.stringify(Array.from(paint.entries())),
      );
    } catch {}
  }, [paint]);
type ScreenPt = { x: number; y: number };

function pointInPoly(x: number, y: number, poly: ScreenPt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}


  // ============================================================
  // ✅ RINGS — Uses tuned weave geometry when present
  // ============================================================
  const rings = useMemo(() => {
    const fallbackAngleIn = params.angleIn ?? 25;
    const fallbackAngleOut = params.angleOut ?? -25;

    if (!lastWeave) {
      // 🧱 fallback: use params only
      return generateRings({
        rows: params.rows,
        cols: params.cols,
        innerDiameter: params.innerDiameter,
        wireDiameter: params.wireDiameter,
        centerSpacing: params.centerSpacing ?? 7.5,
        angleIn: fallbackAngleIn,
        angleOut: fallbackAngleOut,
      });
    }

    // ✅ Use tuned weave's actual geometry (with params fallback)
    const ID_mm =
      Number.isFinite(lastWeave.innerDiameter) && lastWeave.innerDiameter > 0
        ? lastWeave.innerDiameter
        : params.innerDiameter;

    const WD_mm =
      Number.isFinite(lastWeave.wireDiameter) && lastWeave.wireDiameter > 0
        ? lastWeave.wireDiameter
        : params.wireDiameter;

    const spacing =
      lastWeave.centerSpacing ??
      (Array.isArray(lastWeave.layout)
        ? lastWeave.layout[0]?.centerSpacing
        : undefined) ??
      params.centerSpacing ??
      7.5;

    const angleIn = Number.isFinite(lastWeave.angleIn)
      ? lastWeave.angleIn
      : fallbackAngleIn;

    const angleOut = Number.isFinite(lastWeave.angleOut)
      ? lastWeave.angleOut
      : fallbackAngleOut;

    return generateRings({
      rows: params.rows,
      cols: params.cols,
      innerDiameter: ID_mm,
      wireDiameter: WD_mm,
      centerSpacing: spacing,
      angleIn,
      angleOut,
      layout: lastWeave.layout ?? [],
    });
  }, [
    params.rows,
    params.cols,
    params.innerDiameter,
    params.wireDiameter,
    params.centerSpacing,
    params.angleIn,
    params.angleOut,
    lastWeave,
  ]);

  // --- derive safeParams ---
  const safeParams = {
    rows: params?.rows ?? 1,
    cols: params?.cols ?? 1,
    innerDiameter: params?.innerDiameter ?? 6,
    wireDiameter: params?.wireDiameter ?? 1,
    ringColor: params?.ringColor ?? "#CCCCCC",
    bgColor: params?.bgColor ?? "#0F1115",
    centerSpacing:
      (Array.isArray(lastWeave?.layout)
        ? lastWeave?.layout?.[0]?.centerSpacing
        : undefined) ??
      lastWeave?.centerSpacing ??
      params?.centerSpacing ??
      7.5,
  };

  // --- ensure param object updates identity on each value change ---
  const liveParams = useMemo(
    () => ({
      rows: safeParams.rows,
      cols: safeParams.cols,
      innerDiameter: safeParams.innerDiameter,
      wireDiameter: safeParams.wireDiameter,
      ringColor: safeParams.ringColor,
      bgColor: safeParams.bgColor,
      centerSpacing: safeParams.centerSpacing,
    }),
    [
      safeParams.rows,
      safeParams.cols,
      safeParams.innerDiameter,
      safeParams.wireDiameter,
      safeParams.ringColor,
      safeParams.bgColor,
      safeParams.centerSpacing,
    ],
  );

  // --- derive color mode ---
  const effectiveColor = eraseMode ? params.ringColor : activeColor;

  // --- helper functions ---
  const toggleExclusive = (menu: "camera" | "controls") =>
    setActiveMenu((prev) => (prev === menu ? null : menu));

  const [rendererKey, setRendererKey] = useState(0);

  // ============================================================
  // 🧾 BOM ADAPTER — Designer → BOMRing[]
  // ============================================================
  const getBOMRings = useCallback((): BOMRing[] => {
    if (!Array.isArray(rings)) return [];

    const supplier: SupplierId = params.supplier;
    const baseMaterial =
      MATERIALS.find((m) => m.hex === params.ringColor)?.name ?? "Unknown";

    return rings.map((ring: any) => {
      const key = `${ring.row},${ring.col}`;
      const paintedColor = paint.get(key);

      return {
        id: key,
        supplier,
        colorHex: paintedColor ?? params.ringColor,
        innerDiameter: params.innerDiameter,
        wireDiameter: params.wireDiameter,
        material: baseMaterial,
      };
    });
  }, [
    rings,
    paint,
    params.supplier,
    params.ringColor,
    params.innerDiameter,
    params.wireDiameter,
  ]);

  const exportRings = useMemo<ExportRing[]>(() => {
    if (!Array.isArray(rings)) return [];

    const cs = safeParams.centerSpacing ?? 7.5; // mm grid spacing
    const ID = safeParams.innerDiameter;
    const WD = safeParams.wireDiameter;

    return (rings as any[]).map((ring) => {
      const row = ring.row ?? 0;
      const col = ring.col ?? 0;
      const key = `${row},${col}`;
      const colorHex = paint.get(key) ?? params.ringColor;

      return {
        key, // "row,col"
        x_mm: col * cs, // mm coords
        y_mm: row * cs, // mm coords
        innerDiameter_mm: ID, // mm
        wireDiameter_mm: WD, // mm
        colorHex,
      };
    });
  }, [
    rings,
    paint,
    params.ringColor,
    safeParams.centerSpacing,
    safeParams.innerDiameter,
    safeParams.wireDiameter,
  ]);
 useEffect(() => {
  if (!showSplineTool) return;

  // keep the view stable while drawing/applying the spline
  setLock(true);                      // forces 2D / locked rotation
  rendererRef.current?.setPanEnabled?.(false);
  rendererRef.current?.setPaintMode?.(false);
  rendererRef.current?.setEraseMode?.(false);

  return () => {
    // restore normal behavior when spline tool closes
    rendererRef.current?.setPanEnabled?.(!paintMode);
    rendererRef.current?.setPaintMode?.(paintMode);
    rendererRef.current?.setEraseMode?.(eraseMode);
  };
}, [showSplineTool]); // intentionally NOT depending on paintMode/eraseMode 

const applyDesignerFillFromScreenPolygon = useCallback(
  (polygonScreen: ScreenPt[], colorHex: string) => {
    if (!polygonScreen || polygonScreen.length < 3) return;
    pushPaintHistory(paint);

    // Find the best canvas (prefer RingRenderer handle if available)
    const fromHandle =
      (rendererRef.current as any)?.getCanvas?.() ??
      (rendererRef.current as any)?.domElement ??
      null;

    const canvases = Array.from(document.querySelectorAll("canvas")) as HTMLCanvasElement[];
    const fallback =
      canvases
        .filter((c) => c.width > 0 && c.height > 0)
        .sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;

    const canvas = (fromHandle as HTMLCanvasElement | null) ?? fallback;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width <= 2 || rect.height <= 2) return;

    // --- Assumption (matches your Designer 2D locked view):
    // The ring grid is centered on screen and laid out uniformly.
    // We project mm grid -> screen using a fitted scale.
    const cs = safeParams.centerSpacing ?? 7.5; // mm spacing between centers

    const cols = Math.max(1, safeParams.cols ?? params.cols ?? 1);
    const rows = Math.max(1, safeParams.rows ?? params.rows ?? 1);

    const gridW_mm = (cols - 1) * cs;
    const gridH_mm = (rows - 1) * cs;

// Use a small, symmetric margin (half a cell) instead of a big pad + 0.92 fudge.
// This reduces the consistent “inward shift”.
const pad_mm = cs * 0.9;
const scale = Math.min(
  rect.width / (gridW_mm + pad_mm),
  rect.height / (gridH_mm + pad_mm),
);
    const screenCx = rect.left + rect.width / 2;
    const screenCy = rect.top + rect.height / 2;

    const mmCx = gridW_mm / 2;
    const mmCy = gridH_mm / 2;

    setPaint((prev) => {
      const next = new Map(prev);

      for (const r of exportRings) {
        // exportRings uses mm coords
        const x_mm = (r as any).x_mm;
        const y_mm = (r as any).y_mm;

        if (!Number.isFinite(x_mm) || !Number.isFinite(y_mm)) continue;

        // mm -> screen projection (y flips)
        const sx = screenCx + (x_mm - mmCx) * scale;
        const sy = screenCy + (y_mm - mmCy) * scale;

        if (pointInPoly(sx, sy, polygonScreen)) {
          next.set((r as any).key, colorHex); // key is "row,col"
        }
      }

      return next;
    });
  },
  [
    exportRings,
    safeParams.centerSpacing,
    safeParams.rows,
    safeParams.cols,
    params.rows,
    params.cols,
    setPaint,
    paint,
    pushPaintHistory,
  ],
);
// ============================================================
// ✅ Fill (paint) rings inside a polygon (Designer)
// polygon is in SCREEN coords; we convert ring mm->screen using RingRenderer helper if available,
// otherwise fallback to a simple scale = 1 (only works if your SplineSandbox uses same coord space).
// ============================================================
const paintRingsInsidePolygon = useCallback(
  (polygonScreen: { x: number; y: number }[], colorHex: string) => {
    pushPaintHistory(paint);
    // We need screen coords for each ring center.
    // If RingRenderer exposes a conversion, use it. Otherwise we approximate.
    const rr: any = rendererRef.current;

    // prefer real conversion if you have it
    const mmToScreen =
      rr?.designToScreen ??
      ((x_mm: number, y_mm: number) => ({ x: x_mm, y: y_mm }));

    setPaint((prev) => {
      const next = new Map(prev);

      for (const r of exportRings) {
        // exportRings uses mm coords:
        const pt = mmToScreen((r as any).x_mm, (r as any).y_mm);

        // point in polygon test (use our tools helper if you want, or inline)
        let inside = false;
        for (let i = 0, j = polygonScreen.length - 1; i < polygonScreen.length; j = i++) {
          const xi = polygonScreen[i].x, yi = polygonScreen[i].y;
          const xj = polygonScreen[j].x, yj = polygonScreen[j].y;
          const intersect =
            yi > pt.y !== yj > pt.y &&
            pt.x < ((xj - xi) * (pt.y - yi)) / ((yj - yi) || 1e-9) + xi;
          if (intersect) inside = !inside;
        }

        if (inside) {
          // r.key is "row,col" already
          next.set((r as any).key, colorHex);
        }
      }

      return next;
    });
  },
  [exportRings, setPaint, paint, pushPaintHistory],
);
  // ==============================
  // BOM Calculation (Read-Only)
  // ==============================
  const bom = useMemo(() => {
    return calculateBOM(getBOMRings());
  }, [getBOMRings]);

  // kept for future use (export widgets, etc.)
  void useMemo(() => getBOMRings().map((r) => ({ colorHex: r.colorHex })), [
    getBOMRings,
  ]);

  void useMemo(
    () => ({
      title: "Designer — Color BOM",
      supplier: (params.supplier ?? "trl").toUpperCase(),
      ringSizeLabel:
        params.ringSpec ||
        `${params.innerDiameter}mm / ${params.wireDiameter}mm`,
      material:
        MATERIALS.find((m) => m.hex === params.ringColor)?.name ??
        "Anodized Aluminum",
      packSize: 1500,
      background: "#0b1220",
      textColor: "#e5e7eb",
    }),
    [
      params.supplier,
      params.ringSpec,
      params.innerDiameter,
      params.wireDiameter,
      params.ringColor,
    ],
  );

  // Composited 2D capture to avoid black WebGL exports
  const getDesignerCanvas = useCallback((): HTMLCanvasElement | null => {
    const glCanvas =
      (rendererRef.current as any)?.getCanvas?.() ??
      (rendererRef.current as any)?.domElement ??
      null;

    const src: HTMLCanvasElement | null =
      glCanvas ??
      (() => {
        const list = Array.from(
          document.querySelectorAll("canvas"),
        ) as HTMLCanvasElement[];
        const webgl = list.find((c) => {
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
        return (
          webgl ??
          list
            .filter((c) => c.width > 0 && c.height > 0)
            .sort((a, b) => b.width * b.height - a.width * a.height)[0] ??
          null
        );
      })();

    if (!src) return null;

    const out = document.createElement("canvas");
    out.width = Math.max(1, src.width);
    out.height = Math.max(1, src.height);

    const ctx = out.getContext("2d", { alpha: false });
    if (!ctx) return null;

    // match Designer bg
    ctx.fillStyle = "#0F1115";
    ctx.fillRect(0, 0, out.width, out.height);

    try {
      ctx.drawImage(src, 0, 0, out.width, out.height);
    } catch {
      return null;
    }
    return out;
  }, []);

  // ============================================================
  // ✅ Lock/Unlock Rotation — independent from painting
  // ============================================================
  const setLock = (locked: boolean) => {
    setRotationLocked(locked);
    rendererRef.current?.forceLockRotation?.(locked);

    if (locked) {
      rendererRef.current?.lock2DView?.();
    }
    console.log(
      `🔒 3D Rotation ${locked ? "locked (2D)" : "unlocked (free rotation)"}`,
    );
  };

const doReset = () => rendererRef.current?.resetView();

const doClearPaint = () => {
  pushPaintHistory(paint);
  // 1) Clear React state (source of truth)
  setPaint(() => new Map());

  // 2) Clear renderer internal caches (if any)
  try {
    rendererRef.current?.clearPaint?.();
  } catch {}

  // 3) iOS Safari: extra frame(s) to ensure repaint
  const rr: any = rendererRef.current;

  requestAnimationFrame(() => {
    try {
      rr?.clearPaint?.();
      rr?.requestRender?.();
      rr?.invalidate?.();
      rr?.renderOnce?.();
    } catch {}
  });

  requestAnimationFrame(() => {
    try {
      rr?.requestRender?.();
      rr?.invalidate?.();
      rr?.renderOnce?.();
    } catch {}
  });
};
  // ==============================
  // BOM Panel State
  // ==============================
  const [showBOM, setShowBOM] = useState(false);

  // ============================================================
  // 💾 SAVE / LOAD — DESIGNER PAGE (NO NEW FILES)
  // ============================================================
  const saveDesignerProject = useCallback(() => {
    return {
      type: "designer",
      version: 1,
      params,
      paint: Array.from(paint.entries()),
      metadata: {
        page: "designer",
        createdAt: Date.now(),
      },
    };
  }, [params, paint]);

  const loadDesignerProject = useCallback((data: any) => {
    if (!data || data.type !== "designer") {
      alert("❌ Not a Designer project file");
      return;
    }

    setRendererKey((k) => k + 1);

    if (data.params) {
      setParams((prev) => ({ ...prev, ...data.params }));
    }

    if (Array.isArray(data.paint)) {
      setPaint(new Map<string, string | null>(data.paint));
    }

    console.log("✅ Designer project loaded");
  }, []);

  // ============================================================
  // ✅ Apply Atlas — preserve paint & overlay
  // ============================================================
  const applyAtlas = (e: any) => {
    const AR = e.innerDiameter / e.wireDiameter;

    setParams((prev) => ({
      ...prev,
      innerDiameter: e.innerDiameter,
      wireDiameter: e.wireDiameter,
      centerSpacing: e.centerSpacing,
      angleIn: Number.isFinite(e.angleIn) ? e.angleIn : (prev.angleIn ?? 25),
      angleOut: Number.isFinite(e.angleOut) ? e.angleOut : (prev.angleOut ?? -25),
      ringSpec: `ID ${e.innerDiameter.toFixed(2)} mm / WD ${e.wireDiameter.toFixed(
        2,
      )} mm (AR≈${AR.toFixed(2)})`,
    }));

    // ✅ Preserve current paint + overlay
    localStorage.setItem("chainmailSelected", JSON.stringify(e));
    window.dispatchEvent(new Event("weave-updated"));
    setShowMagnet(false);

    console.log("🧲 Material/Weave updated — paint and overlay preserved.");
  };
  // --- render ---
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0E0F12" }}>
      {/* Fullscreen 3D Canvas */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "auto",
        }}
      >
        <RingRenderer
          key={rendererKey}
          ref={rendererRef}
          rings={rings}
          params={liveParams}
          paint={paint}
          setPaint={setPaint}
          initialPaintMode={paintMode}
          initialEraseMode={eraseMode}
          initialRotationLocked={rotationLocked}
          activeColor={effectiveColor}
          overlay={overlayState}
          onGridAspectChange={setGridAspect}
        />
      </div>

      {/* === Left Toolbar (emoji pill) === */}
      <DraggablePill id="camera-pill" defaultPosition={{ x: 20, y: 20 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
            width: 64,
            padding: "10px 8px",
            background: "#0f172a",
            border: "1px solid #0b1020",
            borderRadius: 20,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <ToolBtn
            title="Camera Tools"
            active={activeMenu === "camera"}
            onClick={(e) => { e.stopPropagation(); toggleExclusive("camera"); }}
          >
            📷
          </ToolBtn>

          <ToolBtn
            title="Finalize & Export"
            onClick={() => setFinalizeOpen(true)}
          >
            📦
          </ToolBtn>

          <ToolBtn
            title="Navigation Menu"
            active={showCompass}
            onClick={() => setShowCompass((v) => !v)}
          >
            <IconHamburger size={18} />
          </ToolBtn>

          <ToolBtn
            title="Controls Menu"
            active={activeMenu === "controls"}
            onClick={(e) => { e.stopPropagation(); toggleExclusive("controls"); }}
          >
            ▶
          </ToolBtn>

          <ToolBtn
            title={showSplineTool ? "Close spline tool" : "Open spline tool"}
            active={showSplineTool}
            onClick={() => setShowSplineTool((v) => !v)}
          >
            <IconSpline size={16} />
          </ToolBtn>
        </div>

        {/* --- Controls (▶) Menu — rows/cols dialog --- */}
        {activeMenu === "controls" && (
          <div
            style={{
              marginTop: 12,
              maxHeight: "calc(100vh - 180px - env(safe-area-inset-bottom))",
              overflowY: "auto",
              paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: 160,
              background: "#0b1324",
              border: "1px solid #0b1020",
              borderRadius: 16,
              padding: 12,
              color: "#ddd",
              fontSize: 13,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Grid Size</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span>Columns:</span>
                <input
                  type="number"
                  min={1}
                  max={400}
                  value={params.cols}
onChange={(e) => {
  const raw = parseInt(e.target.value, 10);
  const nextCols = Number.isFinite(raw) ? raw : params.cols;

  const { rows: safeRows, cols: safeCols } = clampAndPersist(
    "designer",
    params.rows,
    nextCols
  );

  setParams((p) => ({ ...p, rows: safeRows, cols: safeCols }));
}}
                  style={{
                    width: 80,
                    textAlign: "right",
                    background: "#111827",
                    color: "#fff",
                    border: "1px solid #222",
                    borderRadius: 6,
                  }}
                />
              </label>

              <label
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span>Rows:</span>
                <input
                  type="number"
                  min={1}
                  max={400}
                  value={params.rows}
onChange={(e) => {
  const raw = parseInt(e.target.value, 10);
  const nextRows = Number.isFinite(raw) ? raw : params.rows;

  const { rows: safeRows, cols: safeCols } = clampAndPersist(
    "designer",
    nextRows,
    params.cols
  );

  setParams((p) => ({ ...p, rows: safeRows, cols: safeCols }));
}}

                  style={{
                    width: 80,
                    textAlign: "right",
                    background: "#111827",
                    color: "#fff",
                    border: "1px solid #222",
                    borderRadius: 6,
                  }}
                />
              </label>
            </div>
          </div>
        )}

{/* --- Camera Tools Menu (Image overlay, paint, zoom, etc.) --- */}
{activeMenu === "camera" && (
  <div
    style={{
      marginTop: 12,
      display: "flex",
      flexDirection: "column",
      gap: 16,
      alignItems: "center",
      width: 64,
      padding: 14,
      background: "#0b1324",
      border: "1px solid #0b1020",
      borderRadius: 20,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
    }}
    onPointerDown={(e) => e.stopPropagation()}
    onMouseDown={(e) => e.stopPropagation()}
    onTouchStart={(e) => e.stopPropagation()}
  >
    <div
      style={{
        width: "100%",
        height: 1,
        background: "rgba(255,255,255,0.08)",
        margin: "6px 0",
      }}
    />

    <ToolBtn
      title={canUseOverlay ? "Image Overlay" : "Image Overlay (Crafter+)"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (canUseOverlay) setShowOverlayPanel((v) => !v);
        else window.location.href = "/auth?mode=upgrade";
      }}
      style={{ opacity: canUseOverlay ? 1 : 0.45, position: "relative" }}
    >
      🖼️{!canUseOverlay && <span style={{ position: "absolute", top: 2, right: 2, fontSize: 8, lineHeight: 1 }}>🔒</span>}
    </ToolBtn>

    <ToolBtn
      title="Paint Mode"
      active={paintMode}
      onClick={(e) => {
        e.stopPropagation();
        const next = !paintMode;
        setPaintMode(next);

        setTimeout(() => {
          rendererRef.current?.setPaintMode?.(next);
          rendererRef.current?.setEraseMode?.(false);
          rendererRef.current?.setPanEnabled?.(!next);
        }, 0);
      }}
    >
      🎨
    </ToolBtn>

    {paintMode && (
      <ToolBtn
        title="Erase Mode"
        active={eraseMode}
        onClick={(e) => {
          e.stopPropagation();
          const next = !eraseMode;
          setEraseMode(next);
          rendererRef.current?.setEraseMode?.(next);
        }}
      >
        <IconEraser size={18} />
      </ToolBtn>
    )}

    <ToolBtn
      title="Reset View"
      onClick={(e) => {
        e.stopPropagation();
        doReset();
      }}
    >
      ↺
    </ToolBtn>

    <div style={{ opacity: canUndo ? 1 : 0.35, pointerEvents: canUndo ? "auto" : "none" }}>
      <ToolBtn title="Undo (Ctrl+Z)" onClick={(e) => { e.stopPropagation(); handleUndo(); }}>
        <IconUndo size={18} />
      </ToolBtn>
    </div>

    <div style={{ opacity: canRedo ? 1 : 0.35, pointerEvents: canRedo ? "auto" : "none" }}>
      <ToolBtn title="Redo (Ctrl+Shift+Z)" onClick={(e) => { e.stopPropagation(); handleRedo(); }}>
        <IconRedo size={18} />
      </ToolBtn>
    </div>

    <ToolBtn
      title="Clear Paint"
      onClick={(e) => {
        e.stopPropagation();
        doClearPaint();
      }}
    >
      🧹
    </ToolBtn>

    {/* ✅ Gear opens the thin draggable tools subpanel */}
    <ToolBtn
      title="Tools Menu"
      active={showGearMenu}
      onClick={(e) => {
        e.stopPropagation();
        setShowGearMenu((v) => !v);
      }}
    >
      ⚙️
    </ToolBtn>
  </div>
)}

{/* ✅ Designer Gear Subpanel (thin, draggable) */}
{showGearMenu && (
  <DraggablePill id="designer-gear-menu" defaultPosition={{ x: 110, y: 520 }}>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: "center",
        width: 64,
        padding: 12,
        background: "#0b1324",
        border: "1px solid #0b1020",
        borderRadius: 20,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 🧰 toolbox toggles the existing magnet dialog (leave magnet dialog unchanged) */}
      <ToolBtn
        title="Supplier & Atlas"
        active={showMagnet}
        onClick={(e) => {
          e.stopPropagation();
          setShowMagnet((v) => !v);
        }}
      >
        🧰
      </ToolBtn>

      {/* Save / Open */}
      <ProjectSaveLoadButtons
        onSave={saveDesignerProject}
        onLoad={loadDesignerProject}
        defaultFileName="chainmail-designer"
      />

      {/* BOM */}
      <ToolBtn
        title="Bill of Materials"
        active={showBOM}
        onClick={(e) => {
          e.stopPropagation();
          setShowBOM((v) => !v);
        }}
      >
        🧾
      </ToolBtn>
    </div>
  </DraggablePill>
)}

{showSplineTool && (
  <SplineSandbox
    embedded
    mode="designer"
    currentColorHex={activeColor}
    onRequestClose={() => setShowSplineTool(false)}
    onApplyClosedSpline={({ polygon, colorHex }) => {
      applyDesignerFillFromScreenPolygon(polygon, colorHex);
      setShowSplineTool(false);
    }}
  />
)}
{/* ✅ Base Material Label */}
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    setShowMaterialPalette((v) => !v);
  }}
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: 2,
    padding: "4px 2px",
    fontSize: 11,
    color: "#f1f5f9",
    marginTop: 6,
    maxWidth: 80,
    lineHeight: 1.25,
    userSelect: "none",
    cursor: "pointer",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    margin: "8px auto 0",
    background: "transparent",
    border: "none",
  }}
  title="Click to choose base material"
>
  <div style={{ fontWeight: 600, fontSize: 12 }}>
    {MATERIALS.find((m) => m.hex === params.ringColor)?.name || "Base Material"}
  </div>

  <div
    style={{ fontSize: 10, color: "#9ca3af" }}
    dangerouslySetInnerHTML={{
      __html: params.ringSpec
        ? params.ringSpec
            .replace(/\s*\/\s*/g, "<br/>")
            .replace(/\s*mm/g, " mm")
            .replace(/\s*\(AR/g, "<br/>(AR")
        : "ID — mm<br/>WD — mm<br/>(AR≈—)",
    }}
  />
</button>
      </DraggablePill>

      {/* === Draggable Universal Color Palette === */}
      {paintMode && (
        <DraggablePill
          id="color-palette"
          defaultPosition={{ x: 20, y: window.innerHeight - 260 }}
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
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(8, 1fr)",
                gap: 5,
              }}
            >
              {UNIVERSAL_COLORS.map((hex) => (
                <div
                  key={hex}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveColor(hex);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  style={{
                    background: hex,
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    border:
                      activeColor === hex
                        ? "2px solid white"
                        : "1px solid #333",
                    cursor: "pointer",
                    transform:
                      activeColor === hex ? "scale(1.15)" : "scale(1.0)",
                    transition: "transform 0.1s ease, border 0.2s ease",
                  }}
                  title={hex}
                />
              ))}
            </div>
          </div>
        </DraggablePill>
      )}
      {/* === Quick Base Material Palette === */}
      {showMaterialPalette && (
        <DraggablePill
          id="material-selector"
          defaultPosition={{ x: 120, y: 80 }}
        >
          <div
            style={{
              background: "rgba(17,24,39,0.96)",
              border: "1px solid rgba(0,0,0,0.6)",
              borderRadius: 14,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              boxShadow: "0 8px 22px rgba(0,0,0,.45)",
              userSelect: "none",
              minWidth: 120,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "#ddd" }}>
              Base Material
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 6,
              }}
            >
              {MATERIALS.map((mat) => (
                <div
                  key={mat.name}
                  onClick={() => {
                    setParams((prev) => ({ ...prev, ringColor: mat.hex }));
                    setShowMaterialPalette(false);
                  }}
                  title={mat.name}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: mat.hex === "transparent" ? "none" : mat.hex,
                    border:
                      params.ringColor === mat.hex
                        ? "2px solid white"
                        : "1px solid #444",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 11,
                    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                  }}
                >
                  {mat.hex === "transparent" ? "×" : ""}
                </div>
              ))}
            </div>

            {/* Supplier color browser toggle */}
            <button
              type="button"
              onClick={() => setShowDesignerSupplierColors((v) => !v)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: showDesignerSupplierColors ? "rgba(180,83,9,0.5)" : "rgba(255,255,255,0.06)",
                color: "#ddd",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              🏭 Supplier Colors
            </button>

            {showDesignerSupplierColors && (
              <SupplierColorPalette
                activeColor={params.ringColor}
                onSelectColor={(hex) => {
                  setParams((prev) => ({ ...prev, ringColor: hex }));
                  setShowMaterialPalette(false);
                }}
              />
            )}
          </div>
        </DraggablePill>
      )}

      {/* === Floating Magnet Dialog (Supplier + Atlas) === */}
      {showMagnet && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: 90,
            right: 8,
            top: 60,
            bottom: 8,
            zIndex: 70,
            background: "rgba(10,15,20,.98)",
            border: "1px solid rgba(0,0,0,.6)",
            borderRadius: 14,
            padding: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,.45)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
            maxWidth: 780,
          }}
        >
          {/* header row with close button */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>SUPPLIER & ATLAS</span>
            <button
              onClick={() => setShowMagnet(false)}
              style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
            >×</button>
          </div>

          {/* Supplier section */}
          <div
            style={{
              background: "rgba(17,24,39,.96)",
              borderRadius: 10,
              padding: 10,
              border: "1px solid #1f2937",
              flexShrink: 0,
            }}
          >
              <SupplierMenu
                onApplyPalette={(sel: any) => {
                  const isDefault =
                    sel?.name === "Default" ||
                    sel?.id === "default" ||
                    sel?.color === "Default Colors" ||
                    sel?.material === "Default";

                  if (isDefault) {
                    const defaultWeave = {
                      id: "default",
                      name: "Default",
                      innerDiameter: 7.94,
                      wireDiameter: 1.6,
                      centerSpacing: 7.5,
                      angleIn: 25,
                      angleOut: -25,
                      layout: [],
                      status: "valid",
                    };

                    localStorage.setItem(
                      "chainmailSelected",
                      JSON.stringify(defaultWeave),
                    );

                    localStorage.setItem(
                      "cmd.params",
                      JSON.stringify({
                        rows: 20,
                        cols: 20,
                        innerDiameter: defaultWeave.innerDiameter,
                        wireDiameter: defaultWeave.wireDiameter,
                        centerSpacing: defaultWeave.centerSpacing,
                        angleIn: defaultWeave.angleIn,
                        angleOut: defaultWeave.angleOut,
                      }),
                    );

                    setLastWeave(defaultWeave);
                    setParams((prev) => ({
                      ...prev,
                      innerDiameter: defaultWeave.innerDiameter,
                      wireDiameter: defaultWeave.wireDiameter,
                      centerSpacing: defaultWeave.centerSpacing,
                      angleIn: defaultWeave.angleIn,
                      angleOut: defaultWeave.angleOut,
                      ringSpec: `ID ${defaultWeave.innerDiameter.toFixed(
                        2,
                      )} mm / WD ${defaultWeave.wireDiameter.toFixed(2)} mm`,
                    }));

                    window.dispatchEvent(new Event("weave-updated"));
                    console.log("✅ Default weave applied and geometry rebuilt");
                    return;
                  }

                  const parseNumber = (v: any) => {
                    if (v == null) return NaN;
                    if (typeof v === "number") return v;
                    if (typeof v === "string") {
                      const m = v.match(/-?\d+(\.\d+)?/);
                      return m ? parseFloat(m[0]) : NaN;
                    }
                    return NaN;
                  };

                  const ID = parseNumber(sel?.innerDiameter ?? sel?.ringID);
                  const WD = parseNumber(sel?.wireDiameter ?? sel?.wireGauge);
                  const spacing =
                    parseNumber(sel?.centerSpacing) || params.centerSpacing || 7.5;

                  const weave = {
                    id: sel?.name ?? sel?.id ?? "unnamed",
                    name: sel?.name ?? sel?.material ?? "Unnamed",
                    innerDiameter: ID,
                    wireDiameter: WD,
                    centerSpacing: spacing,
                    angleIn: sel?.angleIn ?? 25,
                    angleOut: sel?.angleOut ?? -25,
                    layout: sel?.layout ?? [],
                    status: sel?.status ?? "valid",
                  };

                  localStorage.setItem("chainmailSelected", JSON.stringify(weave));
                  setLastWeave(weave);

                  setParams((prev) => ({
                    ...prev,
                    innerDiameter: ID,
                    wireDiameter: WD,
                    centerSpacing: spacing,
                    angleIn: weave.angleIn,
                    angleOut: weave.angleOut,
                    ringSpec:
                      Number.isFinite(ID) && Number.isFinite(WD) && WD > 0
                        ? `ID ${ID.toFixed(2)} mm / WD ${WD.toFixed(
                            2,
                          )} mm (AR≈${(ID / WD).toFixed(2)})`
                        : prev.ringSpec,
                  }));

                  window.dispatchEvent(new Event("weave-updated"));
                }}
              />
            </div>

          {/* Atlas Palette section */}
          <div
            style={{
              background: "rgba(17,24,39,.96)",
              borderRadius: 10,
              padding: 10,
              border: "1px solid #1f2937",
              flexShrink: 0,
            }}
          >
            <AtlasPalette onApply={(e) => applyAtlas(e)} />
          </div>
        </div>
      )}

      {/* === Image Overlay Panel === */}
      {showOverlayPanel && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(17,24,39,0.98)",
            borderRadius: 16,
            padding: 20,
            border: "1px solid #1f2937",
            zIndex: 100001,
            boxShadow: "0 20px 60px rgba(0,0,0,.7)",
          }}
        >
          <ImageOverlayPanel
            gridAspect={gridAspect}
            onApply={async (overlay) => {
              setOverlayState(overlay);
              try {
                await rendererRef.current?.applyOverlayToRings?.(overlay);
                setDebugMessage("✅ Overlay image successfully applied to rings!");
                setDebugVisible(true);
              } catch (err) {
                console.error("❌ applyOverlayToRings failed:", err);
                setDebugMessage(
                  "⚠️ Failed to apply overlay to rings. Check console.",
                );
                setDebugVisible(true);
              }
              setShowOverlayPanel(false);
            }}
          />
        </div>
      )}

      {/* ==============================
          🧾 Floating BOM Panel
         ============================== */}
      {showBOM && (
        <DraggablePill id="bom-panel" defaultPosition={{ x: 420, y: 120 }}>
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

            {/* Summary */}
            <div style={{ marginBottom: 10 }}>
              <div>
                Rings: <strong>{bom?.summary?.totalRings ?? 0}</strong>
              </div>
              <div>
                Colors: <strong>{bom?.summary?.uniqueColors ?? 0}</strong>
              </div>
              <div>
                Total Weight:{" "}
                <strong>{(bom?.summary?.totalWeight ?? 0).toFixed(2)} g</strong>
              </div>
            </div>

            {/* Color Breakdown */}
            <div style={{ marginBottom: 10 }}>
              <strong>By Color</strong>
              {(bom?.lines ?? []).map((line: any) => (
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
              {(bom?.summary?.suppliers ?? []).map((s: any) => (
                <div
                  key={s}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>{String(s).toUpperCase()}</span>
                  <span>
                    {(bom?.lines ?? [])
                      .filter((l: any) => l.supplier === s)
                      .reduce(
                        (sum: number, l: any) => sum + (l.ringCount ?? 0),
                        0,
                      )}
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

      {/* === Compass Navigation Panel === */}
      {showCompass && (
        <DraggableCompassNav
          onNavigate={() => {
            setShowCompass(false);
          }}
        />
      )}

{finalizeOpen && (
  <FinalizeAndExportPanel
    rings={exportRings}
    initialAssignment={assignment}
    onAssignmentChange={setAssignment}
    getRendererCanvas={getDesignerCanvas}
    onClose={() => setFinalizeOpen(false)}
    mapMode="grid"
  />
)}
      {/* ✅ Global Reset Floating Panels Button */}
      <button
        onClick={resetAllPills}
        title="Reset floating panels"
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 100000,
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(15,23,42,.92)",
          color: "#dbeafe",
          cursor: "pointer",
        }}
      >
        Reset UI
      </button>
    </div>
  );
} // ✅ ChainmailDesigner ends here
// ==============================================
// 🧭 Draggable Navigation Panel
// ==============================================
function DraggableCompassNav({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();

  const go = (path: string) => {
    navigate(path, { replace: true });
    if (onNavigate) onNavigate();
  };

  return (
    <DraggablePill id="compass-nav" defaultPosition={{ x: 140, y: 140 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          background: "rgba(17,24,39,0.96)",
          border: "1px solid rgba(0,0,0,0.6)",
          borderRadius: 12,
          padding: 10,
          boxShadow: "0 8px 22px rgba(0,0,0,0.45)",
          userSelect: "none",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => go("/workspace")}
          title="Workspace"
          style={btnStyle}
        >
          🗂️
        </button>

        <button
          onClick={() => go("/wovenrainbowsbyerin")}
          title="Erin’s Home"
          style={btnStyle}
        >
          🏠
        </button>

        <button onClick={() => go("/designer")} title="Designer" style={btnStyle}>
          🧩
        </button>

        <button onClick={() => go("/freeform")} title="Freeform" style={btnStyle}>
          ✨
        </button>

        <button onClick={() => go("/erin2d")} title="Basic" style={btnStyle}>
          🪡
        </button>

        <button onClick={() => go("/chart")} title="Ring Chart" style={btnStyle}>
          📊
        </button>

        <button onClick={() => go("/tuner")} title="Weave Tuner" style={btnStyle}>
          ⚙️
        </button>

        <button onClick={() => go("/atlas")} title="Weave Atlas" style={btnStyle}>
          🌐
        </button>

      </div>
    </DraggablePill>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 22,
  textDecoration: "none",
  background: "transparent",
  border: "none",
  color: "#dbeafe",
  cursor: "pointer",
};

function WorkspaceGate() {
  const { user, tier, loading } = useAuth();
  if (loading) return null;
  // Allow if Supabase user exists, or legacy localStorage auth is present
  const legacyOk =
    localStorage.getItem("designerAuth") === "true" &&
    localStorage.getItem("freeformAuth") === "true" &&
    localStorage.getItem("erin2DAuth") === "true";
  if (!user && !legacyOk) return <Navigate to="/auth" replace />;
  return <WorkspaceHome />;
}

const TIER_BADGE_COLOR: Record<string, string> = {
  free: "#6b7280",
  maker: "#0369a1",
  crafter: "#059669",
  studio: "#7c3aed",
};

// ==============================================
// 🏠 Simple Home / Landing (keeps routing hub in App.tsx)
// ==============================================
function WorkspaceHome() {
  const { user, tier, signOut } = useAuth();
  const navigate = useNavigate();

  // Free tier is open to all — no account required to reach the workspace

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0E0F12",
        color: "#e5e7eb",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "env(safe-area-inset-top, 24px) 24px 24px",
        paddingTop: "max(24px, env(safe-area-inset-top))",
      }}
    >
      <div
        style={{
          width: "min(900px, 100%)",
          background: "rgba(17,24,39,0.6)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 12px 40px rgba(0,0,0,.45)",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            Workspace Navigator
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              to="/pricing"
              style={{ fontSize: 12, color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}
            >
              Pricing
            </Link>
            <span style={{
              background: TIER_BADGE_COLOR[tier] ?? "#6b7280",
              color: "white",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "capitalize",
            }}>
              {tier}
            </span>
            {user ? (
              <button
                onClick={async () => { await signOut(); navigate("/wovenrainbowsbyerin", { replace: true }); }}
                style={{ background: "none", border: "1px solid #374151", borderRadius: 6, color: "#9ca3af", padding: "3px 10px", cursor: "pointer", fontSize: 12 }}
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/auth"
                style={{ background: "none", border: "1px solid #374151", borderRadius: 6, color: "#9ca3af", padding: "3px 10px", fontSize: 12, textDecoration: "none" }}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        {user && (
          <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 14 }}>
            {user.email}
          </div>
        )}

        <div style={{ color: "#9ca3af", marginBottom: 16 }}>
          Choose a workspace:
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <Link to="/erin2d" style={homeLinkStyle}>
            🪡 Basic
          </Link>
          <Link to="/designer" style={homeLinkStyle}>
            🧩 Designer (3D)
          </Link>
          <Link to="/freeform" style={homeLinkStyle}>
            ✨ Studio
          </Link>
        </div>

        <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 8px" }}>
          Utilities
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <Link to="/chart" style={homeLinkStyle}>
            📊 Ring Size Chart
          </Link>
          <Link to="/tuner" style={homeLinkStyle}>
            ⚙️ Weave Tuner
          </Link>
          <Link to="/atlas" style={homeLinkStyle}>
            🌐 Weave Atlas
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 12,
          }}
        >
          <a href="https://www.etsy.com/shop/WovenRainbowsByErin" target="_blank" rel="noopener noreferrer" style={homeLinkStyle}>
            🌈 Woven Rainbows by Erin Etsy Site
          </a>
          <Link to="/wovenrainbowsbyerin" style={homeLinkStyle}>
            🏠 Homepage
          </Link>
        </div>

        <div style={{ marginTop: 14, color: "#9ca3af", fontSize: 12 }}>
          Tip: Use the menu button (☰) inside Studio to jump between pages.
        </div>
      </div>
    </div>
  );
}

const homeLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 14px",
  borderRadius: 12,
  textDecoration: "none",
  color: "#dbeafe",
  background: "rgba(15, 23, 42, 0.85)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 20px rgba(0,0,0,.35)",
};

// Legacy wrappers replaced by RequiresTier — kept as thin aliases so any
// remaining references in JSX don't break during the transition period.
function RequireDesignerAuth({ children }: { children: JSX.Element }) {
  return <RequiresTier minTier="maker" featureName="3D Designer">{children}</RequiresTier>;
}
function RequireFreeformAuth({ children }: { children: JSX.Element }) {
  return <RequiresTier minTier="studio" featureName="Freeform Designer">{children}</RequiresTier>;
}
function RequireErin2DAuth({ children }: { children: JSX.Element }) {
  return <RequiresTier minTier="free" featureName="Basic">{children}</RequiresTier>;
}

// ==============================================
// ✅ APP ROOT — Routing Hub (NO FEATURE REMOVAL)
// ==============================================
const IDLE_MS = 5 * 60 * 1000; // 5 minutes
const HOME = "/wovenrainbowsbyerin";

function useIdleRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!window.location.pathname.startsWith(HOME)) {
          navigate(HOME, { replace: true });
        }
      }, IDLE_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [navigate]);
}

function App() {
  useIdleRedirect();

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const root = document.getElementById("root");
      if (!root || root.children.length === 0) {
        console.warn("App failed to mount — forcing reload");
        window.location.href = "/wovenrainbowsbyerin";
      }
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <Routes>
      {/* Public landing */}
      <Route path="/wovenrainbowsbyerin" element={<HomeWovenRainbows />} />

      {/* Password page */}
      <Route path="/wovenrainbowsbyerin/login" element={<PasswordGate />} />

      {/* Workspace chooser (post-auth) */}
      <Route path="/workspace" element={<WorkspaceHome />} />

      {/* Designer tools (still protected individually) */}
      <Route
        path="/designer/*"
        element={
          <RequireDesignerAuth>
            <ChainmailDesigner />
          </RequireDesignerAuth>
        }
      />

      <Route
        path="/freeform"
        element={
          <RequireFreeformAuth>
            <FreeformChainmail2D />
          </RequireFreeformAuth>
        }
      />

      <Route
        path="/erin2d"
        element={
          <RequireErin2DAuth>
            <ErinPattern2D />
          </RequireErin2DAuth>
        }
      />
<Route path="/spline" element={<SplineSandbox />} />
      {/* ✅ AUTH PAGE */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/eula" element={<EulaPage />} />
      <Route path="/commercial-license" element={<CommercialLicensePage />} />

      {/* ✅ PUBLIC TOOLS — NO AUTH */}
      <Route path="/chart" element={<RingSizeChart />} />
      <Route path="/tuner" element={<ChainmailWeaveTuner />} />
      <Route path="/atlas" element={<ChainmailWeaveAtlas />} />
      <Route path="/manual" element={<UserManual />} />
      <Route path="/release-notes" element={<ReleaseNotes />} />
<Route path="/_calibration" element={<ColorCalibrationTest />} />
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/wovenrainbowsbyerin" replace />} />
    </Routes>
  );
}

// ======================================
// ✅ EXPORTS
// ======================================
export { DraggableCompassNav, DraggablePill };
export default App;

// Keep imports “live” for future switching / shared helpers.
void generateRingsDesigner;
void BOMButtons;
void getDeviceLimits;
void clampPersistedDims;
void SAFE_DEFAULT;
void WorkspaceGate;