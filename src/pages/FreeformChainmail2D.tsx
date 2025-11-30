// ======================================================
// src/pages/FreeformChainmail2D.tsx
// Freeform 2D chainmail painter over the shared 3D RingRenderer
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

import {
  WEAVE_SETTINGS_DEFAULT,
  RingMap,
  PlacedRing,
  resolvePlacement,
} from "../utils/e4in1Placement";

// ======================================================
// Safety placeholders for any legacy bindings (no-op)
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
// Color Palette (same as Designer)
// ======================================================
const PALETTE: string[] = [
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
// UI Helpers
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

// ======================================================
// RingSet (matches Tuner JSON)
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

// localStorage keys
const TUNER_LS_KEY = "chainmailMatrix";
const AUTO_FOLLOW_KEY = "freeformAutoFollowTuner";
const ACTIVE_SET_KEY = "freeformActiveRingSetId";

// ======================================================
// Shared 3D camera constants (MATCH RingRenderer)
// ======================================================
const CAMERA_Z = 240; // same as RingRenderer initialZRef
const FOV_DEG = 45;
const FOV_RAD = (FOV_DEG * Math.PI) / 180;

// 1 world unit == 1 mm everywhere (Tuner/Designer/RingRenderer)
const SCALE = 1;

// ======================================================
// MAIN COMPONENT
// ======================================================
const FreeformChainmail2D: React.FC = () => {
  const navigate = useNavigate();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ring placement data (hex grid of placed rings)
  const [rings, setRings] = useState<RingMap>(() => new Map());
  const [nextClusterId, setNextClusterId] = useState(1);

  const [activeColor, setActiveColor] = useState(PALETTE[0]);
  const [eraseMode, setEraseMode] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Geometry → synced with Tuner ring sets
  const [innerIDmm, setInnerIDmm] = useState(7.94); // ~5/16"
  const [wireMm, setWireMm] = useState(1.2);
  const [centerSpacing, setCenterSpacing] = useState(7.0);
  const [angleIn, setAngleIn] = useState(25);
  const [angleOut, setAngleOut] = useState(-25);

  const aspectRatio = useMemo(
    () => (wireMm > 0 ? innerIDmm / wireMm : 0),
    [innerIDmm, wireMm]
  );

  // Tuner ring sets
  const [ringSets, setRingSets] = useState<RingSet[]>([]);
  const [activeRingSetId, setActiveRingSetId] = useState<string | null>(null);
  const [autoFollowTuner, setAutoFollowTuner] = useState<boolean>(true);

  // Weave grid settings (used by resolvePlacement)
  const settings = useMemo(
    () => ({
      ...WEAVE_SETTINGS_DEFAULT,
      spacingX: centerSpacing,
      spacingY: centerSpacing * 0.866, // hex vertical spacing
      wireD: wireMm,
    }),
    [centerSpacing, wireMm]
  );

  // ======================================================
  // 3D data for RingRenderer (project placed rings into 3D)
  // ======================================================
  const { rings3D, paintMap } = useMemo(() => {
    const arr: any[] = [];
    const paint = new Map<string, string>();

    const ID_mm = innerIDmm;
    const WD_mm = wireMm;
    const radius = (ID_mm + WD_mm) / 2;

    rings.forEach((r: PlacedRing) => {
      // ✅ True European 4-in-1 hex grid staggering:
      //   - Odd rows shifted by centerSpacing / 2 horizontally
      //   - Vertical spacing = centerSpacing * 0.866 (sqrt(3)/2)
      const rowOffset = r.row % 2 === 1 ? centerSpacing / 2 : 0;
      const worldX = r.col * centerSpacing + rowOffset;
      const worldY = r.row * centerSpacing * 0.866;

// EXACT Designer/Tuner tilt rule:
const tiltDeg = r.row % 2 === 0 ? angleIn : angleOut;

arr.push({
  row: r.row,
  col: r.col,
  x: worldX,
  y: -worldY, // RingRenderer uses Y flipped when positioning
  z: 0,
  innerDiameter: ID_mm,
  wireDiameter: WD_mm,
  radius,
  tilt: tiltDeg,       // <-- MUST pass degrees (NOT tiltRad)
  centerSpacing,
});

      // Paint map keyed by world-grid row/col (stable for now)
      paint.set(`${r.row},${r.col}`, r.color);
    });

    return { rings3D: arr, paintMap: paint };
  }, [rings, innerIDmm, wireMm, centerSpacing, angleIn, angleOut]);

  const rendererParams = useMemo(
    () => ({
      rows: 1,
      cols: 1,
      innerDiameter: innerIDmm,
      wireDiameter: wireMm,
      ringColor: "#ffffff",
      bgColor: "#020617",
      centerSpacing,
    }),
    [innerIDmm, wireMm, centerSpacing]
  );

  // ======================================================
  // Canvas resize (transparent overlay for interaction)
  // ======================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;

    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H); // fully transparent so 3D shows through
  }, [rings]);

  // ======================================================
  // Coordinate Helpers — MATCH DESIGNER / TUNER 3D CAMERA
  // ======================================================

  // screen pixel → canvas-local pixel
  const getCanvasPoint = useCallback(
    (evt: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { sx: 0, sy: 0 };
      }
      const rect = canvas.getBoundingClientRect();
      return {
        sx: evt.clientX - rect.left,
        sy: evt.clientY - rect.top,
      };
    },
    []
  );

  // canvas pixel → world mm at z=0 using same perspective math
  // as RingRenderer (camera at z=CAMERA_Z, FOV=45°).
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const aspect = width / height;

    // Screen → NDC
    const xNdc = (sx / width) * 2 - 1;
    const yNdc = -((sy / height) * 2 - 1);

    // NDC → world units at plane z=0 with camera at (0,0,CAMERA_Z)
    const halfHeightAtZ = CAMERA_Z * Math.tan(FOV_RAD / 2);
    const halfWidthAtZ = halfHeightAtZ * aspect;

    const worldX_units = xNdc * halfWidthAtZ;
    const worldY_units = yNdc * halfHeightAtZ;

    // world units → mm (SCALE is kept for future flexibility)
    // NOTE: worldY_mm is flipped so positive Y is "down" to match
    // the way we build rings (worldY = row * spacing * 0.866).
    const worldX_mm = worldX_units / SCALE;
    const worldY_mm = worldY_units / SCALE;

    return { x: worldX_mm, y: worldY_mm };
  }, []);

  // ======================================================
  // Mouse Interaction — click = place / erase / recolor
  // ======================================================
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { sx, sy } = getCanvasPoint(e);
      const { x: worldX, y: worldY } = screenToWorld(sx, sy);

      // world mm → hex-grid coordinates (dimensionless)
      //
      // Matches WEAVE_SETTINGS_DEFAULT + snapToHexCell:
      //
      //   spacingX = centerSpacing
      //   spacingY = centerSpacing * 0.866
      //
      // snapToHexCell then:
      //   row = round(gridY)
      //   colShift = row%2 ? 0.5 : 0
      //   col = round(gridX - colShift)
      //
      const gridX = worldX / centerSpacing;
      const gridY = worldY / (centerSpacing * 0.866);

      // Let resolvePlacement choose the correct hex cell
      const { ring, newClusterId } = resolvePlacement(
        gridX,
        gridY,
        rings,
        nextClusterId,
        eraseMode ? "#000000" : activeColor,
        settings
      );

      const mapCopy: RingMap = new Map(rings);

      if (eraseMode) {
        const delKey = [...mapCopy.entries()].find(
          ([, v]) => v.row === ring.row && v.col === ring.col
        )?.[0];
        if (delKey) mapCopy.delete(delKey);
      } else {
        const key = `${ring.row}-${ring.col}`;
        const existing = [...mapCopy.entries()].find(
          ([, v]) => v.row === ring.row && v.col === ring.col
        );

        if (existing) {
          mapCopy.set(existing[0], {
            ...existing[1],
            color: activeColor,
          });
        } else {
          mapCopy.set(key, ring);
        }
      }

      setRings(mapCopy);
      setNextClusterId(newClusterId);
      commitRings();
      updateHistory();
    },
    [
      getCanvasPoint,
      screenToWorld,
      rings,
      nextClusterId,
      eraseMode,
      activeColor,
      settings,
      centerSpacing,
    ]
  );

  // ======================================================
  // Wheel / Touch — keep simple for now (no 2D pan/zoom)
  // ======================================================
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault(); // prevent page scroll when wheel over canvas
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
    },
    []
  );

  const handleMouseUp = useCallback(() => {}, []);
  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<HTMLCanvasElement>) => {},
    []
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
    },
    []
  );
  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
    },
    []
  );
  const handleTouchEnd = useCallback(() => {}, []);

  // ======================================================
  // Clear / Reset Geometry
  // ======================================================
  const handleClear = useCallback(() => {
    if (!window.confirm("Clear all rings?")) return;
    setRings(new Map());
    setNextClusterId(1);
    applyHistory();
  }, []);

  const resetGeometryToDefaults = useCallback(() => {
    setCenterSpacing(WEAVE_SETTINGS_DEFAULT.spacingX);
    setAngleIn(25);
    setAngleOut(-25);
  }, []);

  // ======================================================
  // Tuner Ring Set Loading (same structure as Tuner)
  // ======================================================
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
    if (storedActive) {
      setActiveRingSetId(storedActive);
    }
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
    if (activeRingSetId) {
      localStorage.setItem(ACTIVE_SET_KEY, activeRingSetId);
    }
  }, [activeRingSetId]);

  // ======================================================
  // Manual JSON load (same format as Tuner saves)
  // ======================================================
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
    []
  );

  // ======================================================
  // RENDER
  // ======================================================
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
      }}
    >
      {/* LEFT TOOLBAR */}
      <div
        style={{
          width: 72,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "#020617",
          borderRight: "1px solid rgba(148,163,184,0.2)",
          zIndex: 5,
        }}
      >
        <ToolButton
          active={!eraseMode}
          onClick={() => {
            setEraseMode(false);
          }}
          title="Place / recolor ring"
        >
          🎨
        </ToolButton>

        <ToolButton
          active={eraseMode}
          onClick={() => {
            setEraseMode(true);
          }}
          title="Erase ring"
        >
          🧽
        </ToolButton>

        <ToolButton
          active={showControls}
          onClick={() => setShowControls((v) => !v)}
          title="Show geometry & JSON controls"
        >
          🧰
        </ToolButton>

        <ToolButton onClick={handleClear} title="Clear all">
          🧹
        </ToolButton>
      </div>

      {/* MAIN WORK AREA */}
      <div
        ref={wrapRef}
        style={{
          flex: 1,
          position: "relative",
          background: "#020617",
        }}
      >
        {/* 3D VIEW (RingRenderer — same as Designer/Tuner) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
          }}
        >
          <RingRenderer
            rings={rings3D}
            params={rendererParams}
            paint={paintMap}
            setPaint={() => {}}
            activeColor={activeColor}
            initialPaintMode={false}
            initialEraseMode={false}
            initialRotationLocked={true}
          />
        </div>

        {/* TRANSPARENT INTERACTION CANVAS */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            cursor: eraseMode ? "not-allowed" : "crosshair",
            touchAction: "none",
            background: "transparent",
            zIndex: 3,
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* COLOR PALETTE */}
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            padding: 8,
            borderRadius: 12,
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(148,163,184,0.3)",
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gap: 6,
            zIndex: 6,
          }}
        >
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                setActiveColor(c);
                setEraseMode(false);
              }}
              title={c}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border:
                  activeColor === c
                    ? "2px solid #f9fafb"
                    : "1px solid rgba(15,23,42,0.9)",
                background: c,
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        {/* RIGHT CONTROL PANEL (Geometry + JSON) */}
        {showControls && (
          <div
            style={{
              position: "absolute",
              right: 16,
              top: 16,
              width: 340,
              background: "#0f172a",
              color: "#e5e7eb",
              borderRadius: 12,
              padding: 12,
              border: "1px solid rgba(148,163,184,0.35)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              zIndex: 7,
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
              Tuner. Vertical spacing is always <code>center × 0.866</code> and
              odd rows are shifted by <code>center / 2</code> so the freeform
              grid matches the 3D tuner grid.
            </p>

            <SliderRow
              label="Center Spacing (mm)"
              value={centerSpacing}
              setValue={setCenterSpacing}
              min={2}
              max={25}
              step={0.1}
              unit="mm"
            />

            <SliderRow
              label="Angle In (°)"
              value={angleIn}
              setValue={setAngleIn}
              min={-75}
              max={75}
              step={1}
              unit="°"
            />

            <SliderRow
              label="Angle Out (°)"
              value={angleOut}
              setValue={setAngleOut}
              min={-75}
              max={75}
              step={1}
              unit="°"
            />

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
                <input
                  type="checkbox"
                  checked={autoFollowTuner}
                  onChange={(e) => setAutoFollowTuner(e.target.checked)}
                />
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
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Load JSON File
                </div>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleFileJSONLoad}
                  style={{ fontSize: 11 }}
                />
                <div style={{ opacity: 0.7, marginTop: 2 }}>
                  JSON structure:{" "}
                  <code>
                    innerDiameter, wireDiameter, centerSpacing, angleIn,
                    angleOut
                  </code>{" "}
                  (same as the Tuner saves).
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
      </div>
    </div>
  );
};

export default FreeformChainmail2D;