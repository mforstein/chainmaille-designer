// ==============================
// src/App.tsx (Merged Full Version) — Part 1/3
// ==============================

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";

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

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 40,
        background: "rgba(17,24,39,.92)",
        border: "1px solid rgba(0,0,0,.6)",
        boxShadow: "0 12px 40px rgba(0,0,0,.45)",
        borderRadius: 24,
        padding: 12,
        userSelect: "none",
      }}
      onMouseDown={(e) => start(e.clientX, e.clientY)}
      onMouseMove={(e) => move(e.clientX, e.clientY)}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => {
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

// ==============================
// 🧭 Draggable Navigation Panel
// ==============================
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
        <Link to="/" onClick={onNavigate} title="Designer" style={{ fontSize: 22, textDecoration: "none" }}>
          🧩
        </Link>
        <Link to="/chart" onClick={onNavigate} title="Ring Chart" style={{ fontSize: 22, textDecoration: "none" }}>
          📊
        </Link>
        <Link to="/weave-tuner" onClick={onNavigate} title="Tuner" style={{ fontSize: 22, textDecoration: "none" }}>
          ⚙️
        </Link>
        <Link to="/weave-atlas" onClick={onNavigate} title="Atlas" style={{ fontSize: 22, textDecoration: "none" }}>
          🌐
        </Link>
      </div>
    </DraggablePill>
  );
}
export { DraggableCompassNav, DraggablePill };
// ==============================================
// === CHAINMAIL DESIGNER (Merged & Enhanced) ===
// ==============================================
function ChainmailDesigner() {
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

  const rendererRef = useRef<RingRendererHandle | null>(null);

  useEffect(() => {
    localStorage.setItem("cmd.params", JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem("cmd.paint", JSON.stringify(Array.from(paint.entries())));
  }, [paint]);

  const [lastWeave, setLastWeave] = useState<any | null>(null);

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
    let spacingFromWeave =
      lastWeave?.layout?.centerSpacing ??
      (Array.isArray(lastWeave?.layout)
        ? lastWeave.layout[0]?.centerSpacing
        : undefined) ??
      lastWeave?.centerSpacing ??
      params.centerSpacing ??
      0;

    if (!Number.isFinite(spacingFromWeave) || spacingFromWeave <= 0 || spacingFromWeave > 100) spacingFromWeave = 7.5;

    const geometry = {
      centerSpacing: spacingFromWeave,
      angleIn: Number.isFinite(lastWeave?.angleIn) ? lastWeave.angleIn : 25,
      angleOut: Number.isFinite(lastWeave?.angleOut) ? lastWeave.angleOut : -25,
    };

    return generateRings({
      rows: params.rows,
      cols: params.cols,
      innerDiameter: params.innerDiameter,
      wireDiameter: params.wireDiameter,
      centerSpacing: geometry.centerSpacing,
      angleIn: geometry.angleIn,
      angleOut: geometry.angleOut,
      layout: lastWeave?.layout ?? [],
    });
  }, [params.rows, params.cols, params.innerDiameter, params.wireDiameter, params.centerSpacing, lastWeave]);

  const setLock = (locked: boolean) => {
    rendererRef.current?.forceLockRotation?.(locked);
    setRotationLocked(locked);
    if (!locked) setPaintMode(false);
  };

  const doZoomIn = () => rendererRef.current?.zoomIn();
  const doZoomOut = () => rendererRef.current?.zoomOut();
  const doReset = () => rendererRef.current?.resetView();
  const doClearPaint = () => {
    rendererRef.current?.clearPaint();
    setPaint(new Map());
  };

  const applyAtlas = (e: any) => {
    const AR = e.innerDiameter / e.wireDiameter;
    setParams((prev) => ({
      ...prev,
      innerDiameter: e.innerDiameter,
      wireDiameter: e.wireDiameter,
      centerSpacing: e.centerSpacing,
      ringSpec: `ID ${e.innerDiameter.toFixed(2)} mm / WD ${e.wireDiameter.toFixed(2)} mm (AR≈${AR.toFixed(2)})`,
    }));
    localStorage.setItem("chainmailSelected", JSON.stringify(e));
    window.dispatchEvent(new Event("weave-updated"));
    setShowMagnet(false);
  };

  const effectiveColor = eraseMode ? params.ringColor : activeColor;

  const toggleExclusive = (menu: "camera" | "controls") =>
    setActiveMenu((prev) => (prev === menu ? null : menu));

// ==============================
// src/App.tsx — Part 2/3
// ==============================

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0E0F12" }}>


      {/* Canvas (centered) */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
        }}
      >
        <RingRenderer
          ref={rendererRef}
          rings={rings}
          params={{
            rows: params.rows,
            cols: params.cols,
            innerDiameter: params.innerDiameter,
            wireDiameter: params.wireDiameter,
            ringColor: params.ringColor,
            bgColor: params.bgColor,
            centerSpacing:
              lastWeave?.layout?.centerSpacing ??
              (Array.isArray(lastWeave?.layout)
                ? lastWeave.layout[0]?.centerSpacing
                : undefined) ??
              lastWeave?.centerSpacing ??
              params.centerSpacing ??
              0,
          }}
          paint={paint}
          setPaint={setPaint}
          initialPaintMode={paintMode}
          initialEraseMode={eraseMode}
          initialRotationLocked={rotationLocked}
          activeColor={effectiveColor}
        />
      </div>

      {/* === Left Toolbar (emoji pill) === */}
      <DraggablePill id="camera-pill" defaultPosition={{ x: 20, y: 20 }}>
        {/* Compact pill (always visible) */}
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

        {/* --- Camera Tools Menu --- */}
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
            {/* Paint */}
            <IconBtn
              tooltip="Paint Mode"
              active={paintMode}
              onClick={() => {
                const next = !paintMode;
                setPaintMode(next);
                rendererRef.current?.setPaintMode(next);
                if (next) setLock(true);
              }}
            >
              🎨
            </IconBtn>

            {/* Erase */}
            <IconBtn
              tooltip="Erase Mode"
              active={eraseMode}
              onClick={() => {
                if (!paintMode) setPaintMode(true);
                setEraseMode((v) => !v);
              }}
            >
              🧽
            </IconBtn>

            {/* Zoom In / Out */}
            <IconBtn tooltip="Zoom In" onClick={doZoomIn}>
              ＋
            </IconBtn>
            <IconBtn tooltip="Zoom Out" onClick={doZoomOut}>
              －
            </IconBtn>

            {/* Reset */}
            <IconBtn tooltip="Reset View" onClick={doReset}>
              ↺
            </IconBtn>
            
			
            {/* Lock / Unlock Rotation */}
            <IconBtn
              tooltip={rotationLocked ? "Unlock 3D Rotation" : "Lock to Flat 2D"}
              onClick={() => setLock(!rotationLocked)}
              active={!rotationLocked}
            >
              {rotationLocked ? "🔒" : "🔓"}
            </IconBtn>

            {/* Clear paint */}
            <IconBtn tooltip="Clear Paint" onClick={doClearPaint}>
              🧹
            </IconBtn>

            {/* Magnet (Supplier + Atlas) */}
            <IconBtn
              tooltip="Supplier & Atlas"
              onClick={() => setShowMagnet((v) => !v)}
            >
              🧲
            </IconBtn>
{/* 🧭 Compass Navigation */}
<IconBtn tooltip="Navigation Menu" onClick={() => setShowCompass((v) => !v)}>
  🧭
</IconBtn>
            {/* Current Base Material Label (tap to open quick base-material palette) */}
            <div
              onClick={() => setShowMaterialPalette((v) => !v)}
              style={{
                fontSize: 12,
                color: "#d8dee9",
                marginTop: 6,
                textAlign: "center",
                width: "100%",
                userSelect: "none",
                lineHeight: 1.15,
                cursor: "pointer",
              }}
              title="Click to choose base material"
            >
              {MATERIALS.find((m) => m.hex === params.ringColor)?.name || "Base Material"}
              <br />
              <span style={{ fontSize: 10, color: "#9ca3af" }}>{params.ringSpec}</span>
            </div>
          </div>
        )}

 {/* --- Controls (▶) Menu — rows/cols triangle dialog --- */}
{activeMenu === "controls" && (
  <div
    style={{
      marginTop: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      width: 200,
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
    <div style={{ display: "flex", gap: 8 }}>
      <input
        type="number"
        value={params.cols}
        min={1}
        max={200}
        onChange={(e) => {
          let val = parseInt(e.target.value);
          if (isNaN(val)) return;
          if (val > 200) val = 200;
          const updated = { ...params, cols: val };
          setParams(updated);
        }}
        style={{ width: "50%" }}
      />
      <input
        type="number"
        value={params.rows}
        min={1}
        max={200}
        onChange={(e) => {
          let val = parseInt(e.target.value);
          if (isNaN(val)) return;
          if (val > 200) val = 200;
          const updated = { ...params, rows: val };
          setParams(updated);
        }}
        style={{ width: "50%" }}
      />
    </div>
  </div>
)}
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
                      activeColor === hex ? "2px solid white" : "1px solid #333",
                    cursor: "pointer",
                    transition: "transform 0.1s ease, border 0.2s ease",
                    transform: activeColor === hex ? "scale(1.15)" : "scale(1.0)",
                  }}
                  title={hex}
                />
              ))}
            </div>
          </div>
        </DraggablePill>
      )}

      {/* === Quick Base Material Palette (tap the material label to open) === */}
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
            {/* === Supplier Menu === */}
            <div
              style={{
                background: "rgba(17,24,39,.96)",
                borderRadius: 10,
                padding: 10,
                border: "1px solid #1f2937",
              }}
            >
              <SupplierMenu
                onApplyPalette={(sel) => {
                  // Color update from supplier selection
                  const colorHex =
                    sel.color && sel.color !== "Default Colors"
                      ? (typeof sel.color === "string" && sel.color.startsWith("#")
                          ? sel.color
                          : params.ringColor)
                      : params.ringColor;

                  // Parse helpers
                  const parseNumber = (v: any) => {
                    if (v == null) return NaN;
                    if (typeof v === "number") return v;
                    if (typeof v === "string") {
                      const m = v.match(/-?\d+(\.\d+)?/);
                      return m ? parseFloat(m[0]) : NaN;
                    }
                    return NaN;
                  };

                  const parseFractionalInchesToMm = (s?: string): number | undefined => {
                    if (!s) return undefined;
                    const raw = s.trim();
                    const frac = raw.match(/^\s*(\d+)\s*\/\s*(\d+)\s*(in|")?\s*$/i);
                    if (frac) {
                      const num = parseFloat(frac[1]);
                      const den = parseFloat(frac[2]);
                      if (den !== 0) return (num / den) * 25.4;
                    }
                    const dec = raw.match(/-?\d+(\.\d+)?/);
                    if (dec) {
                      const inches = parseFloat(dec[0]);
                      return inches * 25.4;
                    }
                    return undefined;
                  };

                  // Compute new physical values
                  const maybeIdMm = parseFractionalInchesToMm(
                    typeof sel.ringID === "string" ? sel.ringID : undefined
                  );
                  const newInner = Number.isFinite(maybeIdMm as number)
                    ? (maybeIdMm as number)
                    : params.innerDiameter;

                  const maybeWire = parseNumber(sel.wireGauge);
                  const newWire = Number.isFinite(maybeWire)
                    ? (maybeWire as number)
                    : params.wireDiameter;

                  const newAR = newWire > 0 ? (newInner / newWire).toFixed(2) : "—";

                  setParams((prev) => ({
                    ...prev,
                    ringColor: colorHex,
                    innerDiameter: newInner,
                    wireDiameter: newWire,
                    ringSpec: `ID ${newInner.toFixed(2)} mm / WD ${newWire.toFixed(
                      2
                    )} mm (AR≈${newAR})`,
                  }));
                }}
              />
            </div>

            {/* === Atlas Palette === */}
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
      {/* 🧭 Floating Navigation Panel */}
{showCompass && (
  <DraggableCompassNav onNavigate={() => setShowCompass(false)} />
)}
    </div>
  );
} // end ChainmailDesigner
// ====================================
// === Print / Report Functionality ===
// ====================================
function printReport() {
  const params = JSON.parse(localStorage.getItem("cmd.params") || "{}");
  const paint = new Map<string, string | null>(
    JSON.parse(localStorage.getItem("cmd.paint") || "[]")
  );
  const colorUsage: Record<string, number> = {};
  for (const [, color] of paint.entries()) {
    if (!color) continue;
    colorUsage[color] = (colorUsage[color] || 0) + 1;
  }

  const usageHTML = Object.entries(colorUsage)
    .map(
      ([hex, count]) => `
        <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
          <span style="width:14px;height:14px;border-radius:3px;border:1px solid #000;display:inline-block;background:${hex}"></span>
          <span>${hex}</span>
          <span style="margin-left:auto">${count}</span>
        </div>`
    )
    .join("");

  const totalRings = (params.rows || 0) * (params.cols || 0);
  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.document.write(`
    <html>
      <head><title>Chainmaille Pattern Report</title></head>
      <body style="font-family:system-ui;padding:20px;color:#111;">
        <h2>Chainmaille Pattern Report</h2>
        <p><b>Grid:</b> ${params.cols ?? "—"} × ${params.rows ?? "—"}</p>
        <p><b>Supplier:</b> ${params.supplier || "—"}</p>
        <p><b>Ring Spec:</b> ${params.ringSpec || "—"}</p>
        <p><b>Total Rings:</b> ${totalRings}</p>
        <h3>Colours Used</h3>
        ${usageHTML || "<i>No painted colours.</i>"}
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
}

// ======================================
// === ROUTER WRAPPER (App Root) ===
// ======================================
export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0E0F12" }}>
      <Routes>
        <Route path="/" element={<ChainmailDesigner />} />
        <Route path="chart" element={<RingSizeChart />} />
        <Route path="weave-tuner" element={<ChainmailWeaveTuner />} />
        <Route path="weave-atlas" element={<ChainmailWeaveAtlas />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}