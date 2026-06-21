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
import { useViewport } from "./hooks/useViewport";
// SupplierColorRefreshButton removed 2026-06-01 — no longer surfaced anywhere
// in the 3D Designer UI (was a "Refresh supplier color cache" affordance).
import { Routes, Route, Navigate, useNavigate, Link } from "react-router-dom";
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
import * as THREE from "three";
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
// SupplierMenu removed from 3D Designer 2026-06-01 — supplier-specific color
// browsing is gone here. Generic catalog references only remain in Freeform.
import DesignerRingStrip from "./components/DesignerRingStrip";
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
import PrivacyPolicy from "./pages/PrivacyPolicy";
import CommercialLicensePage from "./pages/CommercialLicensePage";
import FreeformChainmail2D from "./pages/FreeformChainmail2D";
import ErinPattern2D from "./pages/ErinPattern2D";
import UserManual from "./pages/UserManual";
import ReleaseNotes from "./pages/ReleaseNotes";
import AnalyticsTracker from "./components/AnalyticsTracker";
import AnalyticsNotice from "./components/AnalyticsNotice";
import BOMButtons from "./components/BOMButtons";
import { IconHamburger, IconSpline, IconEraser, IconUndo, IconRedo, IconGridResize } from "./components/icons/ToolIcons";
import { ToolBtn } from "./components/ui/ToolBtn";
import RequiresTier from "./auth/RequiresTier";
import { useAuth, tierAtLeast } from "./auth/AuthContext";
import type { Tier } from "./auth/AuthContext";
import SupplierColorPalette from "./components/SupplierColorPalette";
import AutoCalibrateButton from "./components/AutoCalibrateButton";
import ShapePanel, { ShapeTool as ShapeToolId } from "./components/ShapePanel";
import { computeShapeCells, shapeOutline } from "./utils/shapeFill";
import { calibrationUpdatedEventName } from "./utils/colorCalibration";

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
        // 🔓 unlock everything once (sessionStorage so it expires on tab close
        // or signOut — see auth/AuthContext.tsx)
        sessionStorage.setItem("designerAuth", "true");
        sessionStorage.setItem("freeformAuth", "true");
        sessionStorage.setItem("erin2DAuth", "true");

        onUnlock();
      }}
    />
  );
}
const UI_MARGIN = 12;


// Read the CSS env() safe-area insets (status bar / Dynamic Island / notch /
// home indicator). The app uses viewport-fit=cover, so the WKWebView extends
// UNDER these regions and iOS intercepts touches there — a panel's drag grip
// placed under the Dynamic Island becomes untappable (the "top toolbar freezes
// but the bottom palette is fine" bug). A cached hidden probe element lets us
// read the live inset values (they change with orientation).
let _insetProbe: HTMLDivElement | null = null;
function safeInsets(): { top: number; right: number; bottom: number; left: number } {
  try {
    if (typeof document === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
    if (!_insetProbe) {
      const el = document.createElement("div");
      el.style.cssText = [
        "position:fixed", "top:0", "left:0", "width:0", "height:0",
        "pointer-events:none", "visibility:hidden",
        "padding-top:env(safe-area-inset-top,0px)",
        "padding-right:env(safe-area-inset-right,0px)",
        "padding-bottom:env(safe-area-inset-bottom,0px)",
        "padding-left:env(safe-area-inset-left,0px)",
      ].join(";");
      document.documentElement.appendChild(el);
      _insetProbe = el;
    }
    const cs = getComputedStyle(_insetProbe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

function clampToViewport(
  pos: { x: number; y: number },
  size: { w: number; h: number },
) {
  // Keep panels clear of the safe-area insets so a drag grip never lands under
  // the Dynamic Island / status bar / side notch where touches are eaten.
  const ins = safeInsets();
  const topClear = ins.top + UI_MARGIN;
  const leftClear = ins.left + UI_MARGIN;
  const rightClear = ins.right + UI_MARGIN;
  const bottomInset = ins.bottom;
  // Minimum slice of the panel that must stay on-screen so its drag handle
  // remains reachable. The vertical travel is bounded by KEEP, NOT by the
  // panel's measured height: some panels' boxes measure much taller than they
  // look (padding / conditionally-rendered or zero-opacity sections), and the
  // old `maxY = innerHeight - size.h - margin` then pinned them near the middle
  // of the screen — the "paint palette / control panel won't move to the
  // bottom" bug. Keying the bottom limit off KEEP lets every panel travel to
  // the bottom edge regardless of how tall its box measures.
  const KEEP = 56;

  // Position that keeps the far (right/bottom) edge inside the margin + inset.
  const fitX = window.innerWidth - size.w - rightClear;

  // Horizontal: clamp fully on-screen (clear of side notches) when it fits;
  // allow overhang when oversized.
  const minX = Math.min(leftClear, fitX);
  const maxX = Math.max(leftClear, fitX);

  // Vertical: the drag GRIP is at the TOP of the panel, so the top edge must
  // stay BELOW the safe-area top (Dynamic Island / status bar). Pinning it at a
  // bare 12px put the grip under the Dynamic Island in the fullscreen app,
  // where iOS eats the touches — the top toolbar froze while the bottom palette
  // (clear of the inset) stayed fine. Pin the top at the safe-area top + margin;
  // an oversized panel's bottom simply overflows (it scrolls / can be shrunk).
  const minY = topClear;
  const maxY = Math.max(topClear, window.innerHeight - KEEP - bottomInset);

  return {
    x: clamp(pos.x, minX, maxX),
    y: clamp(pos.y, minY, maxY),
  };
}

// ==============================
// Draggable Floating Pill (Shared UI)
// iPad-safe: Pointer Events + Text-node target handling
// ==============================

function zoomBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 20,
    height: 20,
    lineHeight: "18px",
    textAlign: "center",
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,.18)",
    background: disabled ? "rgba(30,41,59,.5)" : "rgba(30,41,59,.95)",
    color: disabled ? "#475569" : "#e2e8f0",
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    padding: 0,
  };
}

function DraggablePill({
  id,
  defaultPosition = { x: 20, y: 20 },
  style: overrideStyle,
  children,
}: {
  id: string;
  defaultPosition?: { x: number; y: number };
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Bumped on every orientation change to force WebKit to recompute this fixed
  // panel's TOUCH hit region. iOS WKWebView has a long-standing bug where a
  // position:fixed element keeps its OLD hit region after a rotation — the
  // panel renders in the right place but taps land nowhere, so the toolbar and
  // color palette "lock" (dead to touch) after rotating. Applying a sub-pixel
  // top offset that flips each rotation changes the element's geometry just
  // enough to refresh the hit region, invisibly. (No event-based unstick helps
  // here because the pointer events never reach the panel at all.)
  const [repaintTick, setRepaintTick] = useState(0);

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

    // Conservative guess: assume panel could be up to 80% of viewport wide
    const guessedSize = {
      w: Math.min(400, Math.round(window.innerWidth * 0.8)),
      h: Math.min(500, Math.round(window.innerHeight * 0.7)),
    };
    return clampToViewport(initial, guessedSize);
  });

  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  // The pointerId that currently "owns" a drag, or null. Tracking the id (rather
  // than relying on PointerEvent.isPrimary) keeps drag-start working after an
  // orientation change, where iOS can leave its primary-pointer bookkeeping
  // stale and flag the next genuine touch as non-primary.
  const dragPointerIdRef = useRef<number | null>(null);
  // Timestamp of the last pointer activity (down/move/up) for the owning drag.
  // Used to self-heal a STALE owner: if a new press arrives while a pointer is
  // still "owned" but there's been no activity for a while, the previous
  // gesture's end-event was dropped (classic iOS-on-rotation behavior), so the
  // owner is dead and we take over instead of staying frozen forever.
  const dragActivityRef = useRef(0);
  const STALE_DRAG_MS = 700;

  // Per-panel zoom. Lets the user shrink an individual panel so it fits on a
  // short screen (e.g. iPhone). Scale is applied as a CSS transform from the
  // top-left anchor (so the panel stays put) and persisted per panel id. The
  // global "Reset UI" button clears these back to 1. NOTE: the Reset UI button
  // itself is a fixed, standalone button (not a pill), so it never scales.
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 1;
  const SCALE_STEP = 0.1;
  const [scale, setScale] = useState<number>(() => {
    try {
      const n = parseFloat(localStorage.getItem(`pill-scale-${id}`) ?? "1");
      return Number.isFinite(n) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) : 1;
    } catch {
      return 1;
    }
  });
  const [hovered, setHovered] = useState(false);
  // Touch devices have no hover, so the zoom control stays visible there.
  const coarsePointer = (() => {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return false;
    }
  })();
  const clampScale = (s: number) =>
    Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(s * 100) / 100));
  const bumpScale = (d: number) => setScale((s) => clampScale(s + d));

  // Mouse wheel (when the pointer is over the panel) and two-finger pinch both
  // zoom the panel. Attached as NATIVE non-passive listeners so they can
  // preventDefault — otherwise the wheel scrolls the page / panel and the
  // pinch triggers the browser's own zoom. scaleRef gives the handlers the
  // live scale without re-binding.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 0.94;
      setScale(clampScale(scaleRef.current * factor));
    };
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchRef.current = { startDist: dist(e.touches), startScale: scaleRef.current };
        // Cancel any drag the first finger started so pinch owns the gesture.
        dragPointerIdRef.current = null;
        draggingRef.current = false;
        setDragging(false);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const p = pinchRef.current;
      if (p && e.touches.length === 2 && p.startDist > 0) {
        e.preventDefault();
        setScale(clampScale(p.startScale * (dist(e.touches) / p.startDist)));
      }
    };
    const onTouchEnd = () => {
      pinchRef.current = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On each rotation (repaintTick), force a synchronous layout flush so WebKit
  // rebuilds this fixed panel's touch hit region — pairs with the sub-pixel top
  // nudge to fix the iOS "panel dead to touch after rotating" bug.
  useEffect(() => {
    const el = rootRef.current;
    if (el) void el.offsetHeight; // reading offsetHeight forces reflow
  }, [repaintTick]);

  // Persist position
  useEffect(() => {
    try {
      localStorage.setItem(`pill-pos-${id}`, JSON.stringify(pos));
    } catch {}
  }, [id, pos]);

  // Persist scale
  useEffect(() => {
    try {
      localStorage.setItem(`pill-scale-${id}`, String(scale));
    } catch {}
  }, [id, scale]);

  // ✅ After first paint (and on resize/orientation change), measure and clamp
  // the panel back inside the viewport so it can never get stranded off-screen.
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

    // iOS Safari fires `orientationchange` (and an early `resize`) BEFORE the
    // viewport metrics (window.innerWidth/Height) have settled to the new
    // orientation, so a single clamp reads stale dimensions and leaves the
    // panel off-screen — the "panels get stuck after rotating" bug. Re-run the
    // clamp several times across the rotation animation so at least one pass
    // sees the final dimensions. visualViewport's resize is the most reliable
    // "metrics settled" signal on mobile, so we listen to it too.
    const timers: number[] = [];
    // Refresh the fixed-element touch hit region (see repaintTick note). Bumped
    // across the rotation settle so WebKit recomputes where taps land.
    const bumpRepaint = () => setRepaintTick((t) => t + 1);
    const scheduleClamp = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
      requestAnimationFrame(() => {
        clampNow();
        bumpRepaint();
      });
      for (const d of [60, 200, 450, 800]) {
        timers.push(
          window.setTimeout(() => {
            clampNow();
            bumpRepaint();
          }, d),
        );
      }
    };

    // Clear any in-flight drag (and its owning pointer) so a rotation can never
    // leave the panel stuck to a pointer. iOS frequently DROPS the
    // pointerup/lostpointercapture during a rotation, which would otherwise
    // leave dragPointerIdRef pinned to a dead pointer — and then the
    // pointerdown guard (`if dragPointerIdRef !== null return`) blocks every
    // future drag, i.e. the panel "freezes" after rotating. The legacy
    // `orientationchange` event is unreliable in the Capacitor WKWebView, so we
    // can't depend on it; instead we detect a real orientation flip from the
    // resize / visualViewport signals (which DO fire) by watching for the
    // viewport's portrait/landscape state to change.
    const clearDragState = () => {
      dragPointerIdRef.current = null;
      draggingRef.current = false;
      setDragging(false);
    };
    let wasPortrait = window.innerHeight >= window.innerWidth;
    const onViewportChange = () => {
      const isPortrait = window.innerHeight >= window.innerWidth;
      if (isPortrait !== wasPortrait) {
        wasPortrait = isPortrait;
        clearDragState(); // orientation actually flipped → unstick dragging
      }
      scheduleClamp();
    };

    // Keep the legacy event too (harmless where it fires); always unstick on it.
    const onLegacyOrientation = () => {
      clearDragState();
      scheduleClamp();
    };

    // clamp after mount
    requestAnimationFrame(clampNow);

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onLegacyOrientation);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportChange);

    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onLegacyOrientation);
      vv?.removeEventListener("resize", onViewportChange);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Watchdog: an unconditional guarantee that a panel can NEVER stay locked.
  // Regardless of WHY a drag's end-event was lost (rotation dropping pointerup,
  // a captured pointer never releasing, an event listener that didn't fire),
  // if a drag is "owned" but has had no pointer activity for a moment, it's
  // dead — so we clear it. An active drag fires continuous pointermove, so its
  // activity is always fresh and it's never interrupted. This self-heals a
  // stuck panel within ~0.5s with no user action and no reliance on any
  // particular browser event firing.
  useEffect(() => {
    // Longer than STALE_DRAG_MS so a deliberate press-pause-then-drag on the
    // grip isn't cancelled; still recovers a genuinely stuck panel in ~1.5s.
    const WATCHDOG_MS = 1500;
    const iv = window.setInterval(() => {
      if (
        dragPointerIdRef.current !== null &&
        Date.now() - dragActivityRef.current > WATCHDOG_MS
      ) {
        dragPointerIdRef.current = null;
        draggingRef.current = false;
        setDragging(false);
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, []);

  // "Reset floating panels" — snap back to the default position + 100% zoom and
  // drop any drag state, so a stuck/off-screen panel is recoverable instantly
  // without reloading the page. defaultPosition can depend on window size, so
  // read it from a ref to keep this listener stable.
  const defaultPosRef = useRef(defaultPosition);
  defaultPosRef.current = defaultPosition;
  useEffect(() => {
    const onResetPills = () => {
      dragPointerIdRef.current = null;
      draggingRef.current = false;
      setDragging(false);
      setScale(1);
      const el = rootRef.current;
      const size = el
        ? {
            w: Math.max(1, Math.round(el.getBoundingClientRect().width)),
            h: Math.max(1, Math.round(el.getBoundingClientRect().height)),
          }
        : { w: 280, h: 280 };
      setPos(clampToViewport(defaultPosRef.current, size));
    };
    window.addEventListener(RESET_PILLS_EVENT, onResetPills);
    return () => window.removeEventListener(RESET_PILLS_EVENT, onResetPills);
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
        // Default chrome (only when caller didn't provide style)
        ...(!overrideStyle ? {
          background: "rgba(17,24,39,.92)",
          border: "1px solid rgba(0,0,0,.6)",
          boxShadow: "0 12px 40px rgba(0,0,0,.45)",
          borderRadius: 24,
          padding: 12,
          maxWidth: "min(92vw, 520px)",
        } : {}),
        // Caller visual overrides
        ...(overrideStyle ?? {}),
        // Infrastructure always wins
        position: "fixed",
        left: pos.x,
        // Sub-pixel nudge that flips each rotation (repaintTick) forces WebKit
        // to recompute this fixed panel's touch hit region, fixing the iOS bug
        // where the toolbar/palette go dead to touch after rotating. Invisible.
        top: pos.y + (repaintTick % 2) * 0.01,
        zIndex: 9999,
        userSelect: "none",
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
        // Only set a transform when actually zoomed. A non-`none` transform
        // (even scale(1)) makes this panel a containing block for any nested
        // position:fixed element, which would mis-position modals like the
        // custom-shape editor. `undefined` leaves transform as `none`.
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: "top left",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        if (isInteractive(e.target)) return;
        // Claim the drag only when none is active. Deliberately NOT gated on
        // e.isPrimary — after an orientation flip iOS can mark the next genuine
        // touch as non-primary, which silently blocked dragging ("panel won't
        // move after rotating"). Owning the pointerId is robust to that.
        //
        // Self-heal: if a pointer is still "owned" but has had no activity for
        // a while, its end-event was dropped (iOS commonly drops pointerup/
        // lostpointercapture during a rotation) — the owner is dead, so take
        // over instead of being frozen forever. A real in-progress drag fires
        // continuous pointermove, so its activity is always recent; this never
        // steals an active drag (and a 2nd finger for pinch is still blocked,
        // since the first finger's activity is recent).
        if (
          dragPointerIdRef.current !== null &&
          Date.now() - dragActivityRef.current < STALE_DRAG_MS
        ) {
          return;
        }
        dragPointerIdRef.current = e.pointerId;
        dragActivityRef.current = Date.now();
        try {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        } catch {}
        start(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (dragPointerIdRef.current !== e.pointerId) return;
        dragActivityRef.current = Date.now(); // keep the owner "alive"
        move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (dragPointerIdRef.current !== e.pointerId) return;
        dragPointerIdRef.current = null;
        stop();
        try {
          (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        } catch {}
      }}
      onPointerCancel={(e) => {
        if (dragPointerIdRef.current !== e.pointerId) return;
        dragPointerIdRef.current = null;
        stop();
      }}
      // Reliable "this pointer is finished" signal — fires even when a pointerup
      // is dropped (e.g. interrupted by a rotation), so a drag can never wedge
      // "active" and block all future drags.
      onLostPointerCapture={(e) => {
        if (dragPointerIdRef.current !== e.pointerId) return;
        dragPointerIdRef.current = null;
        stop();
      }}
    >
      {(hovered || coarsePointer) && (
        <div
          data-nondrag
          style={{
            position: "absolute",
            right: 6,
            top: 0,
            // Counter-scale so the control stays a constant, tappable size and
            // floats just above the panel's top-right corner regardless of zoom.
            transform: `translateY(-115%) scale(${1 / scale})`,
            transformOrigin: "bottom right",
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: "rgba(2,6,23,.9)",
            border: "1px solid rgba(255,255,255,.14)",
            borderRadius: 8,
            padding: "2px 4px",
            zIndex: 3,
          }}
        >
          <button
            data-nondrag
            aria-label="Shrink panel"
            onClick={() => bumpScale(-SCALE_STEP)}
            disabled={scale <= SCALE_MIN}
            style={zoomBtnStyle(scale <= SCALE_MIN)}
          >
            −
          </button>
          <span style={{ fontSize: 10, color: "#94a3b8", minWidth: 30, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            data-nondrag
            aria-label="Enlarge panel"
            onClick={() => bumpScale(SCALE_STEP)}
            disabled={scale >= SCALE_MAX}
            style={zoomBtnStyle(scale >= SCALE_MAX)}
          >
            +
          </button>
        </div>
      )}
      {/* Drag handle — a panel can be wall-to-wall buttons/swatches (e.g. the
          color palette), leaving almost no empty area to grab (a press on any
          button is a tap, not a drag). This always-empty grip bar gives a
          reliable, obvious place to drag from on BOTH desktop and touch. It's a
          plain non-interactive div, so pressing it starts the drag via the
          root's pointer handlers. */}
      {(
        <div
          aria-label="Drag to move panel"
          title="Drag to move"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // Taller grip = a bigger, easier touch target to move the panel
            // (the body is wall-to-wall swatches/buttons, so this bar is the
            // only reliable drag surface on a phone).
            height: 36,
            marginBottom: 6,
            borderRadius: 999,
            background: dragging ? "rgba(59,130,246,.45)" : "rgba(255,255,255,.12)",
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
        >
          <span
            style={{
              width: 44,
              height: 6,
              borderRadius: 999,
              background: "rgba(255,255,255,.6)",
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
// Event every DraggablePill listens for; dispatched by resetAllPills().
const RESET_PILLS_EVENT = "reset-draggable-pills";

function resetAllPills() {
  try {
    Object.keys(localStorage).forEach((k) => {
      // Reset both position and per-panel zoom so the button can rescue a
      // panel that was dragged off-screen or shrunk too far.
      if (k.startsWith("pill-pos-") || k.startsWith("pill-scale-")) localStorage.removeItem(k);
    });
  } catch {}
  // Tell every mounted pill to snap back to its default position + 100% zoom
  // immediately. No page reload — so an in-progress design isn't disturbed and
  // it works the same on Freeform and Designer. (Pills re-persist the defaults.)
  window.dispatchEvent(new Event(RESET_PILLS_EVENT));
}
// ==============================================
// === CHAINMAIL DESIGNER COMPONENT STARTS HERE ===
// ==============================================
// #5 — per-edge arrow controls (replaces the steppers AND the drag gesture).
// Each of the 4 edges has a grow arrow (points outward) and a shrink arrow
// (points inward); press-and-hold auto-repeats for a sustained resize. Lives in
// the Grid Size panel — no canvas gesture, so it never collides with painting.
// Growing top/left re-indexes the design (see resizeEdge). All tiers; free is
// capped at 20×20 inside resizeEdge.
type GridEdge = "top" | "bottom" | "left" | "right";
function EdgeArrows({
  onResize,
}: {
  onResize: (edge: GridEdge, delta: number) => void;
}) {
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current != null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => stop, []);
  const start = (edge: GridEdge, delta: number) => {
    stop();
    onResize(edge, delta);
    timer.current = window.setInterval(() => onResize(edge, delta), 110);
  };

  const btn = (edge: GridEdge, delta: number, label: string, title: string) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
        start(edge, delta);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      style={{
        width: 34,
        height: 30,
        borderRadius: 8,
        border: "1px solid #374151",
        background: "#1f2937",
        color: "#f3f4f6",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        touchAction: "none",
      }}
    >
      {label}
    </button>
  );

  // + adds a row/column on that edge, − removes one. Same for all four edges.
  const rows: { edge: GridEdge; name: string; grow: string; shrink: string }[] = [
    { edge: "top", name: "Top", grow: "+", shrink: "−" },
    { edge: "bottom", name: "Bottom", grow: "+", shrink: "−" },
    { edge: "left", name: "Left", grow: "+", shrink: "−" },
    { edge: "right", name: "Right", grow: "+", shrink: "−" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <div
          key={r.edge}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
        >
          <span style={{ color: "#94a3b8", fontSize: 12, width: 52 }}>{r.name}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {btn(r.edge, 1, r.grow, `Grow ${r.name.toLowerCase()} edge`)}
            {btn(r.edge, -1, r.shrink, `Shrink ${r.name.toLowerCase()} edge`)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChainmailDesigner() {
  const { tier, user } = useAuth();
  const navigate = useNavigate();
  const trial = trialInfo(user, tier); // 3-day free-trial state (free tier only)
  // Paid = any non-free tier (the single paid plan is "crafter"; existing
  // maker/studio subscribers count as paid too). Free is the limited Designer:
  // fixed 20×20 grid, no image overlay. Paid unlocks both.
  const isPaid = tier !== "free";
  const canUseOverlay = isPaid;
  // Free tier is hard-locked to a 20×20 grid; paid can resize up to the device
  // limit and defaults to 50×50.
  const FREE_GRID = 20;
  // 🧩 All your useState hooks go here — top level
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showOverlayPanel, setShowOverlayPanel] = useState(false);
  // Geometric fill-shape tool (ported from Freeform). When set, dragging on the
  // canvas colors the rings inside the shape with the active color (no rings
  // added). null = normal paint.
  const [shapeTool, setShapeTool] = useState<ShapeToolId | null>(null);
  const [shapePanelOpen, setShapePanelOpen] = useState(false);
  // Live shape drag rect in screen coords → drives the blue ghost preview.
  const [shapeDragScreen, setShapeDragScreen] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // When true, the next shape drag transfers the IMAGE OVERLAY into the shape
  // region only (masked), instead of filling it with the active solid color —
  // overlaying onto the existing design without wiping the rest.
  const [overlayShapeMode, setOverlayShapeMode] = useState(false);
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
  // Persist the image overlay (incl. its dataURL) so a refresh / "Continue"
  // doesn't wipe it. Restored from localStorage on load.
  const [overlayState, setOverlayState] = useState<OverlayState | null>(() => {
    try {
      const saved = localStorage.getItem("cmd.overlay");
      return saved ? (JSON.parse(saved) as OverlayState) : null;
    } catch {
      return null;
    }
  });
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
      // Paid default grid. Free tier is clamped down to 20×20 by a tier effect
      // once the user's tier is known.
      rows: 50,
      cols: 50,
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

  // Persist the image overlay so it survives a refresh / "Continue". The dataURL
  // can be large; if it exceeds the storage quota the write is skipped (the
  // overlay just won't persist for that image) rather than crashing.
  useEffect(() => {
    try {
      if (overlayState && (overlayState as any).dataUrl) {
        localStorage.setItem("cmd.overlay", JSON.stringify(overlayState));
      } else {
        localStorage.removeItem("cmd.overlay");
      }
    } catch {}
  }, [overlayState]);

  // Free tier can resize up to 20×20. Once the tier is known (and whenever it
  // changes), cap a free user's grid at 20 per dimension (preserving anything
  // smaller). Paid users are untouched (their saved size or 50×50 default).
  useEffect(() => {
    if (isPaid) return;
    setParams((p) =>
      p.rows <= FREE_GRID && p.cols <= FREE_GRID
        ? p
        : { ...p, rows: Math.min(p.rows, FREE_GRID), cols: Math.min(p.cols, FREE_GRID) },
    );
  }, [isPaid]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "cmd.paint",
        JSON.stringify(Array.from(paint.entries())),
      );
    } catch {}
  }, [paint]);

  // Show "new project?" dialog on mount when there's existing saved state
  useEffect(() => {
    const hasPaint = (() => {
      try {
        const raw = localStorage.getItem("cmd.paint");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0;
      } catch { return false; }
    })();
    const hasNonDefaultGrid = params.rows !== 20 || params.cols !== 20;
    if (hasPaint || hasNonDefaultGrid) setShowNewProjectDialog(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // When the auto-calibrate ("C") button saves a new calibration, remount the
  // 3D renderer so every ring re-colors through the saved gain/gamma table.
  // (Remount is the Designer's existing refresh mechanism — see setRendererKey.)
  useEffect(() => {
    const onCalib = () => setRendererKey((k) => k + 1);
    window.addEventListener(calibrationUpdatedEventName(), onCalib);
    return () => window.removeEventListener(calibrationUpdatedEventName(), onCalib);
  }, []);

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

    // Project each ring to screen EXACTLY through the renderer camera. Rings
    // render at world (r.x, -r.y, 0) (RingRenderer mesh.position.set(r.x,-r.y)),
    // so camera.project gives the true screen position. The previous fitted
    // mm->screen approximation (a guessed scale + pad fudge) consistently
    // shrank the projected grid inward, so the fill came out smaller than the
    // drawn boundary. We only fall back to that approximation if no camera.
    const cam = (rendererRef.current as any)?.getCamera?.() ?? null;
    if (cam) cam.updateMatrixWorld(); // ensure projection reflects current pan/zoom

    // Fallback fitted scale (used only when the camera is unavailable).
    const cs = safeParams.centerSpacing ?? 7.5; // mm spacing between centers
    const cols = Math.max(1, safeParams.cols ?? params.cols ?? 1);
    const rows = Math.max(1, safeParams.rows ?? params.rows ?? 1);
    const gridW_mm = (cols - 1) * cs;
    const gridH_mm = (rows - 1) * cs;
    const pad_mm = cs * 0.9;
    const scale = Math.min(
      rect.width / (gridW_mm + pad_mm),
      rect.height / (gridH_mm + pad_mm),
    );
    const screenCx = rect.left + rect.width / 2;
    const screenCy = rect.top + rect.height / 2;
    const mmCx = gridW_mm / 2;
    const mmCy = gridH_mm / 2;

    // Project a ring's ACTUAL world position to screen. We must use the raw
    // `rings` coords (r.x, -r.y) — that's literally where the renderer draws
    // each mesh (RingRenderer mesh.position.set(r.x,-r.y); generateRings:
    // x = col*pitchX + xOffset, y = row*pitchY). exportRings.x_mm (= col*cs)
    // is a DIFFERENT coordinate system (different pitch + offset), which is why
    // projecting it was consistently shifted/scaled. Falls back to a rough fit
    // only if the camera isn't available.
    const projectWorld = (wx: number, wy: number): { sx: number; sy: number } => {
      if (cam) {
        const v = new THREE.Vector3(wx, -wy, 0).project(cam);
        return {
          sx: rect.left + (v.x * 0.5 + 0.5) * rect.width,
          sy: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
        };
      }
      return { sx: screenCx + (wx - mmCx) * scale, sy: screenCy + (wy - mmCy) * scale };
    };

    setPaint((prev) => {
      const next = new Map(prev);

      for (const r of rings as any[]) {
        const wx = r?.x;
        const wy = r?.y;
        if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;

        const { sx, sy } = projectWorld(wx, wy);

        if (pointInPoly(sx, sy, polygonScreen)) {
          next.set(`${r.row},${r.col}`, colorHex); // paint key is "row,col"
        }
      }

      return next;
    });
  },
  [
    rings,
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
    // Keep the ring strip open so it behaves like a selection manager — the
    // picked ring stays highlighted as active (matches the Freeform strip).

    console.log("🧲 Material/Weave updated — paint and overlay preserved.");
  };
  // #5 — edge-drag resize (paid only). Grows/shrinks one edge of the grid.
  // The grid is anchored at row0/col0 (top-left), growing right/down, so the
  // bottom/right edges just change the count, while the top/left edges also
  // shift every painted cell by the added rows/cols (dRow/dCol) so the existing
  // design stays put and the dragged edge visibly moves outward. Cells pushed
  // off the grid (on shrink) are dropped.
  const resizeEdge = useCallback(
    (edge: "top" | "bottom" | "left" | "right", delta: number) => {
      if (!delta) return;
      // Free can resize up to 20×20; paid up to the device limit.
      const MAX = isPaid ? 400 : FREE_GRID;
      setParams((p) => {
        let rows = p.rows;
        let cols = p.cols;
        let dRow = 0;
        let dCol = 0;
        if (edge === "top" || edge === "bottom") {
          rows = Math.max(1, Math.min(MAX, p.rows + delta));
          if (edge === "top") dRow = rows - p.rows;
        } else {
          cols = Math.max(1, Math.min(MAX, p.cols + delta));
          if (edge === "left") dCol = cols - p.cols;
        }
        const safe = clampAndPersist("designer", rows, cols);
        rows = safe.rows;
        cols = safe.cols;
        if (rows === p.rows && cols === p.cols) return p;
        // Re-index / clip the paint map to the new grid.
        setPaint((prev) => {
          const next = new Map<string, string | null>();
          for (const [k, v] of prev) {
            const i = k.indexOf(",");
            if (i < 0) continue;
            const r = parseInt(k.slice(0, i), 10) + dRow;
            const c = parseInt(k.slice(i + 1), 10) + dCol;
            if (r >= 0 && c >= 0 && r < rows && c < cols) next.set(`${r},${c}`, v);
          }
          return next;
        });
        return { ...p, rows, cols };
      });
    },
    [isPaid],
  );

  // Geometric fill: RingRenderer hands us the shape's drag rect in WORLD coords;
  // we map it to grid cells (computeShapeCells) and COLOR the rings inside with
  // the active color — no rings are added. The renderer flips Y (world_y =
  // −logical_y), so negate y to get the logical frame computeShapeCells expects.
  const onShapeFill = useCallback(
    (tool: string, worldSel: { x0: number; y0: number; x1: number; y1: number }) => {
      const spacing = params.centerSpacing ?? 7.5;
      const rowOffset = (row: number) => (row % 2 === 1 ? spacing / 2 : 0);
      const rcToLogical = (row: number, col: number) => ({
        x: col * spacing + rowOffset(row),
        y: row * spacing * 0.866,
      });
      const logicalToRowColApprox = (x: number, y: number) => {
        const row = Math.round(y / (spacing * 0.866));
        const col = Math.round((x - rowOffset(row)) / spacing);
        return { row, col };
      };
      const cells = computeShapeCells({
        tool: tool as ShapeToolId,
        sel: { lx0: worldSel.x0, ly0: -worldSel.y0, lx1: worldSel.x1, ly1: -worldSel.y1 },
        logicalToRowColApprox,
        rcToLogical,
      });
      if (!cells.length) return;
      const inBounds = cells.filter(
        ({ row, col }) => row >= 0 && col >= 0 && row < params.rows && col < params.cols,
      );

      // Overlay-within-shape: transfer the IMAGE into just these rings, leaving
      // the rest of the design intact. Falls back to solid fill otherwise.
      if (overlayShapeMode && overlayState && (overlayState as any).dataUrl) {
        const maskKeys = new Set(inBounds.map(({ row, col }) => `${row},${col}`));
        rendererRef.current?.applyOverlayToRings?.(overlayState, maskKeys);
        setOverlayShapeMode(false);
        setShapeTool(null);
        return;
      }

      setPaint((prev) => {
        const next = new Map(prev);
        for (const { row, col } of inBounds) {
          next.set(`${row},${col}`, effectiveColor);
        }
        return next;
      });
    },
    [params.centerSpacing, params.rows, params.cols, effectiveColor, overlayShapeMode, overlayState],
  );

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
          shapeTool={shapeTool}
          onShapeFill={onShapeFill}
          onShapeDragUpdate={setShapeDragScreen}
        />
      </div>

      {/* Blue "ghost" preview of the fill shape while dragging (screen-space) */}
      {shapeTool && shapeDragScreen && (() => {
        const pts = shapeOutline(shapeTool, {
          lx0: shapeDragScreen.x0, ly0: shapeDragScreen.y0,
          lx1: shapeDragScreen.x1, ly1: shapeDragScreen.y1,
        });
        if (pts.length < 2) return null;
        const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
        return (
          <svg
            style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 40, pointerEvents: "none" }}
          >
            <path d={d} fill="rgba(59,130,246,0.18)" stroke="#3b82f6" strokeWidth={2} />
          </svg>
        );
      })()}

      {/* Free-trial countdown banner (free tier only, while the trial is live) */}
      {trial.onTrial && !trial.expired && (
        <button
          onClick={() => navigate("/pricing")}
          style={{
            position: "fixed",
            top: "calc(8px + env(safe-area-inset-top))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9998,
            padding: "5px 12px",
            borderRadius: 999,
            border: "1px solid rgba(167,139,250,0.5)",
            background: "rgba(124,58,237,0.85)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
          }}
        >
          Free trial · {trial.daysLeft} day{trial.daysLeft === 1 ? "" : "s"} left · Upgrade
        </button>
      )}

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
            title="Navigation Menu"
            active={showCompass}
            onClick={() => setShowCompass((v) => !v)}
          >
            <IconHamburger size={18} />
          </ToolBtn>

          {/* Camera Tools — the triangle IS the camera toggle (▸ closed / ▾ open). */}
          <ToolBtn
            title="Camera Tools"
            active={activeMenu === "camera"}
            onClick={(e) => { e.stopPropagation(); toggleExclusive("camera"); }}
          >
            {activeMenu === "camera" ? "▾" : "▸"}
          </ToolBtn>

          <ToolBtn
            title="Finalize & Export"
            onClick={() => setFinalizeOpen(true)}
          >
            📦
          </ToolBtn>

          <ToolBtn
            title="Controls Menu"
            active={activeMenu === "controls"}
            onClick={(e) => { e.stopPropagation(); toggleExclusive("controls"); }}
          >
            <IconGridResize size={18} />
          </ToolBtn>

          <ToolBtn
            title={showSplineTool ? "Close spline tool" : "Open spline tool"}
            active={showSplineTool}
            onClick={() => setShowSplineTool((v) => !v)}
          >
            <IconSpline size={16} />
          </ToolBtn>

          {/* Draw toggle (Paint ⇄ Erase, icon swaps) + Pan hand live in the
              always-visible top half of the toolbar, so they stay reachable even
              when the Camera tools menu below is collapsed. */}
          <ToolBtn
            title={eraseMode ? "Erase (click to paint)" : "Paint (click to erase)"}
            active={paintMode}
            onClick={(e) => {
              e.stopPropagation();
              // Coming from Pan: resume drawing in the same mode (no flip).
              // Already drawing: flip paint ⇄ erase.
              const nextErase = paintMode ? !eraseMode : eraseMode;
              setEraseMode(nextErase);
              setPaintMode(true);
              setTimeout(() => {
                rendererRef.current?.setPaintMode?.(true);
                rendererRef.current?.setEraseMode?.(nextErase);
                rendererRef.current?.setPanEnabled?.(false);
              }, 0);
            }}
          >
            {eraseMode ? <IconEraser size={18} /> : "🎨"}
          </ToolBtn>

          <ToolBtn
            title={paintMode ? "Pan / Navigate (drag to move the view)" : "Pan is on — click to draw"}
            active={!paintMode}
            onClick={(e) => {
              e.stopPropagation();
              if (paintMode) {
                setPaintMode(false);
                setTimeout(() => {
                  rendererRef.current?.setPaintMode?.(false);
                  rendererRef.current?.setEraseMode?.(false);
                  rendererRef.current?.setPanEnabled?.(true);
                }, 0);
              } else {
                setPaintMode(true);
                setTimeout(() => {
                  rendererRef.current?.setPaintMode?.(true);
                  rendererRef.current?.setEraseMode?.(eraseMode);
                  rendererRef.current?.setPanEnabled?.(false);
                }, 0);
              }
            }}
          >
            ✋
          </ToolBtn>
        </div>

        {/* --- Controls (▶) Menu — rows/cols dialog --- */}
        {activeMenu === "controls" && (
          /* Grid Size lives in its OWN draggable panel (DraggablePill is
             position:fixed, so it floats free instead of widening the toolbar).
             The wrapper stops pointer events from bubbling into the toolbar pill
             (camera-pill): nested DraggablePills otherwise fight over pointer
             capture, leaving this panel stuck following the cursor. */
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
          <DraggablePill
            id="designer-grid-size"
            defaultPosition={{ x: 180, y: 70 }}
            style={{
              maxHeight: "calc(100vh - 180px - env(safe-area-inset-bottom))",
              overflowY: "auto",
              paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: 220,
              background: "#0b1324",
              border: "1px solid #0b1020",
              borderRadius: 16,
              padding: 12,
              color: "#ddd",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Grid Size</div>

            {/* Steppers replaced by per-edge arrow controls (#5): grow/shrink
                each edge (press-and-hold to repeat). Free caps at 20×20; paid
                goes to the device limit (default 50×50). */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <div style={{ color: "#e5e7eb" }}>
                {params.cols} × {params.rows}
                {!isPaid && <span style={{ color: "#64748b" }}> (max 20×20)</span>}
              </div>
              <EdgeArrows onResize={resizeEdge} />
              {!isPaid && (
                <button
                  onClick={() => navigate("/pricing")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "transparent",
                    color: "#94a3b8",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  🔓 Upgrade for larger grids (50×50+)
                </button>
              )}
            </div>
          </DraggablePill>
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

    {/* Geometric fill shapes — color rings inside a dragged shape. Tap to open
        the picker; when a shape is active, tap again to return to painting. */}
    <ToolBtn
      title={shapeTool ? "Shapes (active — tap to exit)" : "Fill Shapes"}
      active={!!shapeTool}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (shapeTool) {
          setShapeTool(null);
          setShapePanelOpen(false);
        } else {
          setShapePanelOpen((v) => !v);
        }
      }}
    >
      ◼
    </ToolBtn>

    {/* Draw toggle + Pan hand moved to the always-visible top of the toolbar. */}

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
      {/* 🧰 "Supplier & Atlas" toolbox removed for the first release (per Erin)
          — it toggled the Atlas/supplier-driven rings strip, and the Atlas is
          hidden until scales return. The strip + showMagnet state remain in the
          code (just unreachable) for an easy re-add. */}

      {/* Save / Open */}
      <ProjectSaveLoadButtons
        onSave={saveDesignerProject}
        onLoad={loadDesignerProject}
        defaultFileName="chainmail-designer"
      />

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

            {/* Auto color-calibration — small "C" button. Runs a headless
                calibration in place (progress bar only), then auto-saves +
                applies. No page or dialog. */}
            <AutoCalibrateButton from="designer" />
          </div>
        </DraggablePill>
      )}
      {/* === Quick Base Material Palette === */}
      {showMaterialPalette && (
        <DraggablePill
          id="material-selector"
          defaultPosition={{ x: Math.min(120, Math.max(8, window.innerWidth - 220)), y: 80 }}
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

      {/* === Floating RINGS strip — draggable, like the Freeform calibrated-rings strip.
             Drag the header / padding to move it; clicking a ring selects it. === */}
      {showMagnet && (
        <DraggablePill
          id="designer-rings-pill"
          defaultPosition={{ x: 90, y: 60 }}
          style={{
            width: 132,
            maxHeight: "calc(100vh - 68px)",
            background: "rgba(10,15,20,.98)",
            border: "1px solid rgba(0,0,0,.6)",
            borderRadius: 14,
            padding: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,.45)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}
          >
            {/* header row with close button */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>RINGS</span>
              <button
                data-nondrag
                onClick={() => setShowMagnet(false)}
                style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
              >×</button>
            </div>

            {/* ring strip section */}
            <div
              style={{
                background: "rgba(17,24,39,.96)",
                borderRadius: 10,
                padding: 10,
                border: "1px solid #1f2937",
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              <DesignerRingStrip
                onApply={(e) => applyAtlas(e)}
                activeMatch={{ innerDiameter: params.innerDiameter, wireDiameter: params.wireDiameter }}
              />
            </div>
          </div>
        </DraggablePill>
      )}

      {/* === Fill-Shapes picker === */}
      <ShapePanel
        open={shapePanelOpen}
        active={shapeTool ?? "square"}
        onClose={() => setShapePanelOpen(false)}
        onPick={(t) => {
          setShapeTool(t);
          setShapePanelOpen(false);
        }}
      />

      {/* === Image Overlay Panel === */}
      {showOverlayPanel && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 100001,
          }}
        >
          <ImageOverlayPanel
            gridAspect={gridAspect}
            hideScaleControls
            onClose={() => setShowOverlayPanel(false)}
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
            onApplyToShape={(overlay) => {
              // Store the overlay, close the panel, and enter "overlay within
              // shape" mode: the user picks a shape and drags, and the image is
              // transferred into that area only (rest of the design preserved).
              setOverlayState(overlay);
              setShowOverlayPanel(false);
              setOverlayShapeMode(true);
              setShapeTool("square");
              setShapePanelOpen(true);
              setDebugMessage("📐 Pick a shape, then drag on the canvas to place the image.");
              setDebugVisible(true);
            }}
          />
        </div>
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
          // Safe-area aware so it never tucks under the home indicator / notch
          // in any orientation. This button never scales — it's the always-on
          // recovery control for the per-panel zoom.
          right: "calc(12px + env(safe-area-inset-right))",
          bottom: "calc(12px + env(safe-area-inset-bottom))",
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

      {/* ✅ New Project Dialog */}
      {showNewProjectDialog && (
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
            <div style={{ fontSize: 20, fontWeight: 800 }}>New project?</div>
            <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.6 }}>
              You have a saved design ({params.rows}×{params.cols} grid
              {paint.size > 0 ? `, ${paint.size.toLocaleString()} painted rings` : ""}).
              <br />
              Start fresh with a blank 20×20 grid, or continue where you left off?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setParams(prev => ({ ...prev, rows: 20, cols: 20 }));
                  setPaint(new Map());
                  setOverlayState(null);
                  paintHistoryRef.current = [new Map()];
                  paintHistoryIdxRef.current = 0;
                  setCanUndo(false);
                  setCanRedo(false);
                  try { localStorage.removeItem("cmd.paint"); } catch {}
                  try { localStorage.removeItem("cmd.overlay"); } catch {}
                  setShowNewProjectDialog(false);
                }}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12,
                  background: "rgba(59,130,246,0.30)",
                  border: "1px solid rgba(59,130,246,0.60)",
                  color: "#e5e7eb", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                New project
              </button>
              <button
                type="button"
                onClick={() => setShowNewProjectDialog(false)}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#e5e7eb", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
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
    <DraggablePill id="compass-nav" defaultPosition={{ x: Math.min(140, Math.max(8, window.innerWidth / 2 - 100)), y: Math.min(140, window.innerHeight / 2 - 100) }}>
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
          maxWidth: "calc(100vw - 24px)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 🗂️ Workspace button removed 2026-05-31: redundant with the
            🏠 Home button below now that /workspace redirects to the
            home page (which is the workspace navigator). */}

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

        {/* Freeform (/freeform) and Basic (/erin2d) removed from nav per Erin's
            review — routes remain for deep-linking. */}

        <button onClick={() => go("/chart")} title="Ring Chart" style={btnStyle}>
          📊
        </button>

        {/* Weave Tuner (⚙️) and Weave Atlas (🌐) hidden for the first release
            (per Erin) — they'll return alongside scales. Routes still exist. */}

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
  // Allow if Supabase user exists, or legacy ERIN50 unlock is present.
  // ERIN50 flags moved from localStorage → sessionStorage on 2026-05-31 so the
  // unlock expires when the tab/browser closes (see auth/AuthContext.tsx).
  // We accept either location for one-session backwards compat.
  const legacyOk =
    (sessionStorage.getItem("designerAuth") === "true" || localStorage.getItem("designerAuth") === "true") &&
    (sessionStorage.getItem("freeformAuth") === "true" || localStorage.getItem("freeformAuth") === "true") &&
    (sessionStorage.getItem("erin2DAuth")    === "true" || localStorage.getItem("erin2DAuth")    === "true");
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
          {/* Basic (/erin2d) and Freeform (/freeform, "Studio") removed per
              Erin's review — kept off the navigator like the home page. Routes
              remain for deep-linking. */}
          <Link to="/designer" style={homeLinkStyle}>
            🧩 Designer (3D)
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
          {/* Weave Tuner + Weave Atlas hidden for first release (per Erin);
              they return with scales. Routes remain for deep-linking. */}
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

        <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 8px" }}>
          About — Get the App
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" style={homeLinkStyle}>
            ▶️ Chainmail Studio on Google Play
          </a>
          {APP_STORE_URL && (
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={homeLinkStyle}>
              🍎 Chainmail Studio on the App Store
            </a>
          )}
        </div>

        <div style={{ marginTop: 14, color: "#9ca3af", fontSize: 12 }}>
          Tip: Use the menu button (☰) inside Studio to jump between pages.
        </div>
      </div>
    </div>
  );
}

// Public store listings for the native apps, linked from the Home "About" section.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.wovenrainbows.chainmailledesigner";
// Apple App Store: fill in once App Store Connect assigns the numeric Apple ID
// (App Store Connect → your app → App Information → "Apple ID", ~10 digits), e.g.
// "https://apps.apple.com/app/id1234567890". Empty string hides the link until set.
const APP_STORE_URL = "";

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
// 3-day free trial length, in ms.
const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
/** Trial state for a (possibly null) user at the current tier. Only Free users
 *  with a datable account are on the trial; paid users and undatable
 *  anon/legacy free users are never "expired". */
export function trialInfo(
  user: { created_at?: string } | null,
  tier: Tier,
): { onTrial: boolean; expired: boolean; daysLeft: number } {
  if (tier !== "free") return { onTrial: false, expired: false, daysLeft: 0 };
  const createdMs = user?.created_at ? new Date(user.created_at).getTime() : null;
  if (createdMs == null || !Number.isFinite(createdMs))
    return { onTrial: false, expired: false, daysLeft: 0 };
  const elapsed = Date.now() - createdMs;
  const daysLeft = Math.max(0, Math.ceil((TRIAL_MS - elapsed) / 86400000));
  return { onTrial: true, expired: elapsed > TRIAL_MS, daysLeft };
}

function RequireDesignerAuth({ children }: { children: JSX.Element }) {
  // 3D Designer is FREE for a 3-day trial (20×20, no image overlay); the paid
  // $5.99 plan removes the limit + adds image overlay + commercial license.
  // Once a Free user's 3 days are up, gate the Designer behind upgrade.
  const { user, tier, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F1115", color: "#9ca3af" }}>
        Loading…
      </div>
    );
  }
  const { expired } = trialInfo(user, tier);
  if (expired) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0F1115", color: "#e5e7eb", padding: 32, gap: 16, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>⌛</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Your free trial has ended</h2>
        <p style={{ color: "#9ca3af", maxWidth: 380, margin: 0 }}>
          The 3-day free trial of the 3D Designer is over. Subscribe for{" "}
          <strong style={{ color: "#f9fafb" }}>$5.99/mo</strong> to keep designing
          — larger grids, image overlay, and a commercial-use license.
        </p>
        <a href="/pricing" style={{ marginTop: 8, padding: "12px 28px", background: "#7c3aed", color: "white", borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
          Subscribe — $5.99/mo
        </a>
        <a href="/wovenrainbowsbyerin" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← Back to home</a>
      </div>
    );
  }
  return <RequiresTier minTier="free" featureName="3D Designer">{children}</RequiresTier>;
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
    <>
      {/* First-party page-view + funnel analytics (headless) */}
      <AnalyticsTracker />
      <Routes>
      {/* Public landing */}
      <Route path="/wovenrainbowsbyerin" element={<HomeWovenRainbows />} />

      {/* Password page */}
      <Route path="/wovenrainbowsbyerin/login" element={<PasswordGate />} />

      {/* Workspace chooser removed 2026-05-31 — the home page hosts the
          navigator directly now. Redirect any bookmarks / old links back
          to home. WorkspaceHome function is kept in this file as a
          fallback target for WorkspaceGate (auth flow) and as the source
          of TIER_BADGE_COLOR consumers; safe to remove later if unused. */}
      <Route
        path="/workspace"
        element={<Navigate to="/wovenrainbowsbyerin" replace />}
      />

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
      <Route path="/privacy" element={<PrivacyPolicy />} />
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
      {/* One-time transparency banner about first-party analytics */}
      <AnalyticsNotice />
    </>
  );
}

// ======================================
// ✅ EXPORTS
// ======================================
export { DraggableCompassNav, DraggablePill, resetAllPills };
export default App;

// Keep imports "live" for future switching / shared helpers.
void generateRingsDesigner;
void BOMButtons;
void getDeviceLimits;
void clampPersistedDims;
void SAFE_DEFAULT;
void WorkspaceGate;