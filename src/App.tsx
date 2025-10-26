// ==============================
// src/App.tsx (Merged Full Version, FIXED + COMPLETE)
// ==============================

import React, { useRef, useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ImageOverlayPanel, OverlayState } from "./components/ImageOverlayPanel";

import "./index.css";
import "./ui/ui-grid.css";

// Unified imports from RingRenderer
import RingRenderer, {
  computeRingVarsFixedID,
  generateRingsChart,
  generateRingsDesigner,
  generateRingsTuner,
  generateRings,
  RingRendererHandle,
} from "./components/RingRenderer";

import { MATERIALS, UNIVERSAL_COLORS } from "./utils/colors";
import SupplierMenu from "./components/SupplierMenu";
import AtlasPalette from "./components/AtlasPalette";

import RingSizeChart from "./pages/RingSizeChart";
import ChainmailWeaveTuner from "./pages/ChainmailWeaveTuner";
import ChainmailWeaveAtlas from "./pages/ChainmailWeaveAtlas";

// ---------- Types ----------
export type SupplierId = "cmj" | "trl" | "mdz";
type ColorMode = "solid" | "checker";
type Unit = "mm" | "in";

interface Params {
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
}

type PaintMap = Map<string, string | null>;

// ---------- Utility ----------
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------- Draggable Floating Pill ----------
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
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  const start = (clientX: number, clientY: number) => {
    draggingRef.current = true;
    offsetRef.current = { x: clientX - pos.x, y: clientY - pos.y };
  };
  const move = (clientX: number, clientY: number) => {
    if (!draggingRef.current) return;
    setPos({ x: clientX - offsetRef.current.x, y: clientY - offsetRef.current.y });
  };
  const stop = () => {
    draggingRef.current = false;
  };

  useEffect(() => {
    localStorage.setItem(`pill-pos-${id}`, JSON.stringify(pos));
  }, [id, pos]);

  // ✅ Prevent drag start on interactive elements
  const isInteractive = (el: EventTarget | null) => {
    if (!(el instanceof HTMLElement)) return false;
    return !!el.closest(
      "button, input, select, textarea, label, a, [role='button'], [role='slider']"
    );
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
        cursor: draggingRef.current ? "grabbing" : "grab",
      }}
      onMouseDown={(e) => {
        if (isInteractive(e.target)) return;
        start(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => move(e.clientX, e.clientY)}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => {
        if (isInteractive(e.target)) return;
        const t = e.touches[0];
        start(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        move(t.clientX, t.clientY);
      }}
      onTouchEnd={stop}
    >
      {children}
    </div>
  );
}

// ---------------- Icon Button ----------------
const IconBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tooltip?: string }
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
  const [params, setParams] = useState<Params>(() => {
    const saved = localStorage.getItem("cmd.params");
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
    };
    if (!saved) return def;
    try {
      return { ...def, ...JSON.parse(saved) };
    } catch {
      return def;
    }
  });

  const [paint, setPaint] = useState<PaintMap>(() => {
    const saved = localStorage.getItem("cmd.paint");
    return saved ? new Map(JSON.parse(saved)) : new Map();
  });

  const [paintMode, setPaintMode] = useState(true);
  const [eraseMode, setEraseMode] = useState(false);
  const [rotationLocked, setRotationLocked] = useState(true);
  const [activeColor, setActiveColor] = useState("#8F00FF");
  const [activeMenu, setActiveMenu] = useState<"camera" | "controls" | null>(null);
  const [showMagnet, setShowMagnet] = useState(false);
  const [showMaterialPalette, setShowMaterialPalette] = useState(false);
  const [showCompass, setShowCompass] = useState(false);
  const [overlayState, setOverlayState] = useState<OverlayState | null>(null);

  const rendererRef = useRef<RingRendererHandle | null>(null);
  const [lastWeave, setLastWeave] = useState<any | null>(null);

  // --- load saved weave on mount ---
  useEffect(() => {
    const loadWeave = () => {
      try {
        const selected = JSON.parse(localStorage.getItem("chainmailSelected") || "null");
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
const rings = useMemo(() => {
  if (!lastWeave) {
    // 🧱 fallback: use params only
    return generateRings({
      rows: params.rows,
      cols: params.cols,
      innerDiameter: params.innerDiameter,
      wireDiameter: params.wireDiameter,
      centerSpacing: params.centerSpacing ?? 7.5,
      angleIn: 25,
      angleOut: -25,
    });
  }

  // ============================================================
  // ✅ Use tuned weave's actual geometry (ID, WD, spacing, angles)
  // ============================================================
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
    : 25;
  const angleOut = Number.isFinite(lastWeave.angleOut)
    ? lastWeave.angleOut
    : -25;

  // ============================================================
  // ✅ Generate correct geometry
  // ============================================================
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
}, [params.rows, params.cols, lastWeave]);
  // --- derive safeParams ---
  const safeParams = {
    rows: params?.rows ?? 1,
    cols: params?.cols ?? 1,
    innerDiameter: params?.innerDiameter ?? 6,
    wireDiameter: params?.wireDiameter ?? 1,
    ringColor: params?.ringColor ?? "#CCCCCC",
    bgColor: params?.bgColor ?? "#0F1115",
    centerSpacing:
      lastWeave?.layout?.centerSpacing ??
      (Array.isArray(lastWeave?.layout)
        ? lastWeave.layout[0]?.centerSpacing
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
  ]
);
  // --- derive color mode ---
  const effectiveColor = eraseMode ? params.ringColor : activeColor;

  // --- helper functions ---
  const toggleExclusive = (menu: "camera" | "controls") =>
    setActiveMenu((prev) => (prev === menu ? null : menu));

// ============================================================
// ✅ Lock/Unlock Rotation — independent from painting
// ============================================================
const setLock = (locked: boolean) => {
  setRotationLocked(locked);
  rendererRef.current?.forceLockRotation?.(locked);

  // Lock camera only when explicitly locking back to 2D
  if (locked) {
    rendererRef.current?.lock2DView?.();
  }

  // ✅ Do not toggle paint here — independent systems
  console.log(`🔒 3D Rotation ${locked ? "locked (2D)" : "unlocked (free rotation)"}`);
};
  const doZoomIn = () => rendererRef.current?.zoomIn();
  const doZoomOut = () => rendererRef.current?.zoomOut();
  const doReset = () => rendererRef.current?.resetView();
  const doClearPaint = () => {
    rendererRef.current?.clearPaint();
    setPaint(new Map());
  };

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
    ringSpec: `ID ${e.innerDiameter.toFixed(2)} mm / WD ${e.wireDiameter.toFixed(2)} mm (AR≈${AR.toFixed(2)})`,
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
      {/* Centered 3D Canvas */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none", // keep UI pills interactive above
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
<RingRenderer
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
              <label style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Columns:</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={params.cols}
                  onChange={(e) => {
                    const val = clamp(parseInt(e.target.value), 1, 200);
                    setParams({ ...params, cols: val });
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
              <label style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Rows:</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={params.rows}
                  onChange={(e) => {
                    const val = clamp(parseInt(e.target.value), 1, 200);
                    setParams({ ...params, rows: val });
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
          <IconBtn tooltip="Zoom In" onClick={doZoomIn}>
              ＋
            </IconBtn>
            <IconBtn tooltip="Zoom Out" onClick={doZoomOut}>
              －
            </IconBtn>

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

            <IconBtn tooltip="Supplier & Atlas" onClick={() => setShowMagnet((v) => !v)}>
              🧲
            </IconBtn>

            <IconBtn tooltip="Navigation Menu" onClick={() => setShowCompass((v) => !v)}>
              🧭
            </IconBtn>
          </div>
        )}

{/* ✅ Fixed Base Material Label (Stacked, Wrapped & Centered) */}
{/* ✅ Compact Base Material Label (Fixed number display) */}
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
    {MATERIALS.find((m) => m.hex === params.ringColor)?.name || "Base Material"}
  </div>
  <div
    style={{ fontSize: 10, color: "#9ca3af" }}
    dangerouslySetInnerHTML={{
      __html: params.ringSpec
        ? params.ringSpec
            .replace(/\s*\/\s*/g, "<br/>")     // put each spec on its own line
            .replace(/\s*mm/g, " mm")          // spacing before mm
            .replace(/\s*\(AR/g, "<br/>(AR")   // AR on new line
        : "ID — mm<br/>WD — mm<br/>(AR≈—)",
    }}
  />
</div>
      </DraggablePill>

      {/* === Draggable Universal Color Palette === */}
      {paintMode && (
        <DraggablePill id="color-palette" defaultPosition={{ x: 20, y: window.innerHeight - 260 }}>
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
                    border: activeColor === hex ? "2px solid white" : "1px solid #333",
                    cursor: "pointer",
                    transform: activeColor === hex ? "scale(1.15)" : "scale(1.0)",
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
        <DraggablePill id="material-selector" defaultPosition={{ x: 120, y: 80 }}>
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
  // 🧩 Handle Default Case — Apply real default values and force rebuild
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

    localStorage.setItem("chainmailSelected", JSON.stringify(defaultWeave));
    localStorage.setItem(
      "cmd.params",
      JSON.stringify({
        rows: 20,
        cols: 20,
        innerDiameter: 7.94,
        wireDiameter: 1.6,
        centerSpacing: 7.5,
      })
    );

    setLastWeave(defaultWeave);
    setParams((prev) => ({
      ...prev,
      innerDiameter: 7.94,
      wireDiameter: 1.6,
      centerSpacing: 7.5,
    }));

    window.dispatchEvent(new Event("weave-updated"));
    console.log("✅ Default weave applied and geometry rebuilt");
    return;
  }

  // 🧩 Otherwise, apply selected weave as before
  const colorHex =
    sel.color && sel.color !== "Default Colors"
      ? typeof sel.color === "string" && sel.color.startsWith("#")
        ? sel.color
        : params.ringColor
      : params.ringColor;

  const parseNumber = (v: any) => {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const m = v.match(/-?\d+(\.\d+)?/);
      return m ? parseFloat(m[0]) : NaN;
    }
    return NaN;
  };

  // ✅ Defensive checks so undefined props don’t crash
  const ID = parseNumber(sel?.innerDiameter ?? sel?.ringID);
  const WD = parseNumber(sel?.wireDiameter ?? sel?.wireGauge);
  const spacing = parseNumber(sel?.centerSpacing) || params.centerSpacing;

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
            zIndex: 100001, // 🔥 higher than everything else
            boxShadow: "0 20px 60px rgba(0,0,0,.7)",
          }}
        >
<ImageOverlayPanel
  onApply={async (overlay) => {
    // 1️⃣ Update overlay preview plane (as before)
    setOverlayState(overlay);
rendererRef.current?.applyOverlayToRings?.(overlay);

    // 2️⃣ NEW: Actually apply the overlay colors to the rings
    try {
      await rendererRef.current?.applyOverlayToRings?.(overlay);
      setDebugMessage("✅ Overlay image successfully applied to rings!");
      setDebugVisible(true);
    } catch (err) {
      console.error("❌ applyOverlayToRings failed:", err);
      setDebugMessage("⚠️ Failed to apply overlay to rings. Check console.");
      setDebugVisible(true);
    }

    // 3️⃣ Close panel
    setShowOverlayPanel(false);
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
    
    </div>
  );
} // ✅ ChainmailDesigner ends here

// ==============================================
// 🧭 Draggable Navigation Panel
// ==============================================
function DraggableCompassNav({ onNavigate }: { onNavigate?: () => void }) {
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
          borderRadius: 14,
          padding: 10,
          boxShadow: "0 8px 22px rgba(0,0,0,0.45)",
          userSelect: "none",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Link
          to="/"
          onClick={onNavigate}
          title="Designer"
          style={{ fontSize: 22, textDecoration: "none" }}
        >
          🧩
        </Link>
        <Link
          to="/chart"
          onClick={onNavigate}
          title="Ring Chart"
          style={{ fontSize: 22, textDecoration: "none" }}
        >
          📊
        </Link>
        <Link
          to="/weave-tuner"
          onClick={onNavigate}
          title="Tuner"
          style={{ fontSize: 22, textDecoration: "none" }}
        >
          ⚙️
        </Link>
        <Link
          to="/weave-atlas"
          onClick={onNavigate}
          title="Atlas"
          style={{ fontSize: 22, textDecoration: "none" }}
        >
          🌐
        </Link>
      </div>
    </DraggablePill>
  );
}

// ======================================
// ✅ EXPORTS
// ======================================
export { DraggableCompassNav, DraggablePill };
export default ChainmailDesigner;