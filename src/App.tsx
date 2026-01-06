// ==============================
// src/App.tsx
// Chainmaille Designer – BOM-Ready Root
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
import FreeformChainmail2D from "./pages/FreeformChainmail2D";
import ErinPattern2D from "./pages/ErinPattern2D";
import BOMButtons from "./components/BOMButtons";

// ==============================
// BOM-RELATED SHARED TYPES
// ==============================

export type SupplierId = "cmj" | "trl" | "mdz";
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
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem(`pill-pos-${id}`);
    return saved ? JSON.parse(saved) : defaultPosition;
  });

  // keep a state so cursor updates (ref alone won't re-render)
  const [dragging, setDragging] = useState(false);

  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    try {
      localStorage.setItem(`pill-pos-${id}`, JSON.stringify(pos));
    } catch {
      // ignore
    }
  }, [id, pos]);

  // iOS Safari sometimes gives Text nodes (emoji) as event targets.
  const getTargetElement = (t: EventTarget | null): Element | null => {
    if (!t) return null;

    const anyT = t as any;
    // Text node: nodeType === 3
    if (anyT?.nodeType === 3) return anyT.parentElement ?? null;

    if (t instanceof Element) return t;
    return null;
  };

  const isInteractive = (t: EventTarget | null) => {
    const el = getTargetElement(t);
    if (!el) return false;
    return !!el.closest(
      "button, input, select, textarea, label, a, [role='button'], [role='slider']",
    );
  };

  const start = (clientX: number, clientY: number) => {
    draggingRef.current = true;
    setDragging(true);
    offsetRef.current = { x: clientX - pos.x, y: clientY - pos.y };
  };

  const move = (clientX: number, clientY: number) => {
    if (!draggingRef.current) return;
    setPos({
      x: clientX - offsetRef.current.x,
      y: clientY - offsetRef.current.y,
    });
  };

  const stop = () => {
    draggingRef.current = false;
    setDragging(false);
  };

  return (
    <div
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
        // ✅ critical for iPad Safari: prevents scroll/gesture interference during drag
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        // If the user tapped a button/input inside the pill, do NOT drag.
        if (isInteractive(e.target)) return;

        // Only react to primary pointer (prevents multi-touch weirdness)
        if (!e.isPrimary) return;

        // Capture so dragging continues even if pointer leaves pill bounds
        try {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }

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
        } catch {
          // ignore
        }
      }}
      onPointerCancel={() => {
        stop();
      }}
    >
      {children}
    </div>
  );
}
// ---------------- Icon Button ----------------
const IconBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
    tooltip?: string;
  }
> = ({ active, tooltip, children, ...rest }) => (
  <div style={{ position: "relative", width: 40, height: 40 }}>
    <button
      {...rest}
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        background: active ? "#2563eb" : "#1f2937",
        color: active ? "white" : "#d1d5db",
        border: "1px solid #111827",
        boxShadow: "0 2px 10px rgba(0,0,0,.35)",
        cursor: "pointer",
        userSelect: "none",
        padding: 0,
      }}
      title={tooltip}
    >
      {children}
    </button>
  </div>
);

// ==============================================
// === CHAINMAIL DESIGNER COMPONENT STARTS HERE ===
// ==============================================
function ChainmailDesigner() {
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
  const [showMagnet, setShowMagnet] = useState(false);
  const [showMaterialPalette, setShowMaterialPalette] = useState(false);
  const [showCompass, setShowCompass] = useState(false);
  const [overlayState, setOverlayState] = useState<OverlayState | null>(null);

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

  const [paint, setPaint] = useState<PaintMap>(() => {
    const saved = localStorage.getItem("cmd.paint");
    return saved ? new Map(JSON.parse(saved)) : new Map();
  });

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
    rendererRef.current?.clearPaint();
    setPaint(new Map());
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
        />
      </div>

      {/* === Left Toolbar (emoji pill) === */}
      <DraggablePill id="camera-pill" defaultPosition={{ x: 20, y: 20 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            alignItems: "center",
            width: 76,
            padding: 10,
            background: "#0f172a",
            border: "1px solid #0b1020",
            borderRadius: 20,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <IconBtn
            tooltip="Camera Tools"
            active={activeMenu === "camera"}
            onClick={(e) => {
              e.stopPropagation();
              toggleExclusive("camera");
            }}
          >
            📷
          </IconBtn>

          <IconBtn
            tooltip="Controls Menu"
            active={activeMenu === "controls"}
            onClick={(e) => {
              e.stopPropagation();
              toggleExclusive("controls");
            }}
          >
            ▶
          </IconBtn>
        </div>

        {/* --- Controls (▶) Menu — rows/cols dialog --- */}
        {activeMenu === "controls" && (
          <div
            style={{
              marginTop: 12,
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
              width: 76,
              padding: 14,
              background: "#0b1324",
              border: "1px solid #0b1020",
              borderRadius: 20,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <ProjectSaveLoadButtons
              onSave={saveDesignerProject}
              onLoad={loadDesignerProject}
              defaultFileName="chainmail-designer"
            />

            <div
              style={{
                width: "100%",
                height: 1,
                background: "rgba(255,255,255,0.08)",
                margin: "6px 0",
              }}
            />

            <IconBtn
              tooltip="Image Overlay"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowOverlayPanel((v) => !v);
              }}
            >
              🖼️
            </IconBtn>

            <IconBtn
              tooltip="Paint Mode"
              active={paintMode}
              onClick={() => {
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
            </IconBtn>

            {paintMode && (
              <IconBtn
                tooltip="Erase Mode"
                active={eraseMode}
                onClick={() => {
                  const next = !eraseMode;
                  setEraseMode(next);
                  rendererRef.current?.setEraseMode?.(next);
                }}
              >
                🧽
              </IconBtn>
            )}

            <IconBtn tooltip="Reset View" onClick={doReset}>
              ↺
            </IconBtn>

            <IconBtn
              tooltip={rotationLocked ? "Unlock 3D Rotation" : "Lock to Flat 2D"}
              onClick={() => setLock(!rotationLocked)}
              active={!rotationLocked}
            >
              {rotationLocked ? "🔒" : "🔓"}
            </IconBtn>

            <IconBtn tooltip="Clear Paint" onClick={doClearPaint}>
              🧹
            </IconBtn>

            <IconBtn
              tooltip="Supplier & Atlas"
              onClick={() => setShowMagnet((v) => !v)}
            >
              🧲
            </IconBtn>

            <IconBtn
              tooltip="Bill of Materials"
              onClick={() => setShowBOM((v) => !v)}
            >
              🧾
            </IconBtn>

            <IconBtn
              tooltip="Finalize & Export (PDF / CSV / Map / Preview)"
              onClick={() => setFinalizeOpen(true)}
            >
              📦
            </IconBtn>

            <IconBtn
              tooltip="Navigation Menu"
              onClick={() => setShowCompass((v) => !v)}
            >
              🧭
            </IconBtn>
          </div>
        )}

        {/* ✅ Base Material Label */}
        <div
          onClick={() => setShowMaterialPalette((v) => !v)}
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
          }}
          title="Click to choose base material"
        >
          <div style={{ fontWeight: 600, fontSize: 12 }}>
            {MATERIALS.find((m) => m.hex === params.ringColor)?.name ||
              "Base Material"}
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
        </div>
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
                  onClick={() => setActiveColor(hex)}
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
          </div>
        </DraggablePill>
      )}

      {/* === Floating Magnet Dialog (Supplier + Atlas) === */}
      {showMagnet && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            right: 18,
            top: 74,
            zIndex: 70,
            background: "rgba(10,15,20,.98)",
            border: "1px solid rgba(0,0,0,.6)",
            borderRadius: 14,
            padding: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,.45)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "320px 440px",
              gap: 10,
              alignItems: "stretch",
            }}
          >
            {/* Supplier Menu */}
            <div
              style={{
                background: "rgba(17,24,39,.96)",
                borderRadius: 10,
                padding: 10,
                border: "1px solid #1f2937",
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

            {/* Atlas Palette */}
            <div
              style={{
                background: "rgba(17,24,39,.96)",
                borderRadius: 10,
                padding: 10,
                border: "1px solid #1f2937",
              }}
            >
              <AtlasPalette onApply={(e) => applyAtlas(e)} />
            </div>
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
          mapMode="grid" // ✅ Designer wants the grid map
        />
      )}
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

        <button onClick={() => go("/erin2d")} title="Erin 2D" style={btnStyle}>
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

        <button
          onClick={() => go("/blog-editor")}
          title="Blog"
          style={btnStyle}
        >
          🪶
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
  const unlocked =
    localStorage.getItem("designerAuth") === "true" &&
    localStorage.getItem("freeformAuth") === "true" &&
    localStorage.getItem("erin2DAuth") === "true";

  if (!unlocked) {
    return <Navigate to="/wovenrainbowsbyerin" replace />;
  }

  return <WorkspaceHome />;
}

// ==============================================
// 🏠 Simple Home / Landing (keeps routing hub in App.tsx)
// ==============================================
function WorkspaceHome() {
  const [unlocked, setUnlocked] = React.useState(
    () =>
      localStorage.getItem("designerAuth") === "true" &&
      localStorage.getItem("freeformAuth") === "true" &&
      localStorage.getItem("erin2DAuth") === "true",
  );

  if (!unlocked) {
    return (
      <PasswordGateWrapper
        onUnlock={() => {
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0E0F12",
        color: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
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
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
          Woven Rainbows by Erin — Chainmaille Tools
        </div>

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
          <Link to="/designer" style={homeLinkStyle}>
            🧩 Designer (3D)
          </Link>
          <Link to="/freeform" style={homeLinkStyle}>
            ✨ Freeform 2D
          </Link>
          <Link to="/erin2d" style={homeLinkStyle}>
            🪡 Erin 2D Pattern
          </Link>
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

        <div style={{ marginTop: 14, color: "#9ca3af", fontSize: 12 }}>
          Tip: Use 🧭 inside Designer to jump between pages.
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

function RequireDesignerAuth({ children }: { children: JSX.Element }) {
  const authed = localStorage.getItem("designerAuth") === "true";
  if (!authed) {
    return (
      <Navigate
        to="/wovenrainbowsbyerin/login"
        state={{ redirect: "/designer" }}
        replace
      />
    );
  }
  return children;
}

function RequireFreeformAuth({ children }: { children: JSX.Element }) {
  const authed = localStorage.getItem("freeformAuth") === "true";
  if (!authed) {
    return (
      <Navigate
        to="/wovenrainbowsbyerin/login"
        state={{ redirect: "/freeform" }}
        replace
      />
    );
  }
  return children;
}

function RequireErin2DAuth({ children }: { children: JSX.Element }) {
  const authed = localStorage.getItem("erin2DAuth") === "true";
  if (!authed) {
    return (
      <Navigate
        to="/wovenrainbowsbyerin/login"
        state={{ redirect: "/erin2d" }}
        replace
      />
    );
  }
  return children;
}

// ==============================================
// ✅ APP ROOT — Routing Hub (NO FEATURE REMOVAL)
// ==============================================
function App() {
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

      {/* ✅ PUBLIC TOOLS — NO AUTH */}
      <Route path="/chart" element={<RingSizeChart />} />
      <Route path="/tuner" element={<ChainmailWeaveTuner />} />
      <Route path="/atlas" element={<ChainmailWeaveAtlas />} />
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