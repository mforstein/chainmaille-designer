// ============================================================
// src/tools/tools.tsx
// Shared tool system for Freeform + Designer
// - B-spline paths
// - Auto-closure
// - Mirror
// - Outermost boundary
// - RingSpec library (multi ring sizes)
// - Ring combos (stampable subpanels)
//
// GOAL: Pages only import and provide a tiny adapter.
// ============================================================

// ============================================================
// File: src/tools/tools.tsx
// Purpose: Shared tools module for Freeform + Designer.
// Drop-in: import { ToolsPanel } from "./tools/tools";
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------
// Types
// ---------------------------

export type ToolMode =
  | "none"
  | "spline"
  | "mirror"
  | "boundary"
  | "combo"
  | "specs";

export type Axis = "vertical" | "horizontal";

export type SupplierId = "cmj" | "trl" | "mdz";

export type ControlPoint = { x: number; y: number };

export type SplinePath = {
  id: string;
  name: string;
  points: ControlPoint[];
  closed: boolean;
  // Optional tuning knobs later
  tension?: number;
  resolution?: number;
};

export type Boundary = {
  id: string;
  pathId: string; // references SplinePath.id
  mode: "inside" | "stroke";
  strokeWidthMm?: number;
  rule?: "evenOdd" | "nonZero";
};

export type RingSpec = {
  id: string;
  name: string;
  innerDiameterMm: number;
  wireDiameterMm: number;
  centerSpacingMm: number;
  supplier?: SupplierId;
  material?: string;
};

export type PlacedRingLike = {
  id: string;
  x_mm: number;
  y_mm: number;
  colorHex: string;
  specId?: string; // ✅ multi-size support (optional during migration)
};

export type ComboRing = {
  dx_mm: number;
  dy_mm: number;
  colorHex?: string;
  specId?: string;
};

export type RingCombo = {
  id: string;
  name: string;
  version: 1;
  // anchor in combo-local space
  anchor_mm: { x: number; y: number };
  rings: ComboRing[];
  // optional convenience metadata
  tags?: string[];
};

export type ToolsProjectState = {
  version: 1;
  // geometry tools
  splines: SplinePath[];
  boundaries: Boundary[];

  // multi-size ring spec library
  ringSpecs: RingSpec[];
  activeSpecId: string | null;

  // combos
  comboLibrary: RingCombo[];
};

export type ToolsUIState = {
  gearOpen: boolean;
  mode: ToolMode;
  selectedSplineId: string | null;
  showLibrary: boolean;
  showSpecs: boolean;
};

// ---------------------------
// Adapter: what Freeform/Designer must provide
// ---------------------------

export type ToolsHostAdapter = {
  // Used for stamping combos or boundary fill (later)
  getRings: () => PlacedRingLike[];
  setRings?: (rings: PlacedRingLike[]) => void;

  // Add rings in a host-native way if you prefer (optional)
  addRings?: (rings: PlacedRingLike[]) => void;

  // Convert screen coords to design coords (mm or your design coordinate system)
  // If you don’t have mm mapping, you can treat px as mm for now and upgrade later.
  screenToDesign: (
    x_px: number,
    y_px: number,
  ) => { x_mm: number; y_mm: number };
  designToScreen?: (
    x_mm: number,
    y_mm: number,
  ) => { x_px: number; y_px: number };

  // Persist the tool state with the project if desired
  // If omitted, tools.tsx will persist global to localStorage.
  getProjectToolsState?: () => ToolsProjectState | null;
  setProjectToolsState?: (s: ToolsProjectState) => void;
};

// ---------------------------
// Defaults + Persistence
// ---------------------------

const LS_KEY = "wrbe.tools.v1";

export function makeDefaultToolsState(): ToolsProjectState {
  const defaultSpec: RingSpec = {
    id: "spec-default",
    name: "Default (7.94 / 1.20)",
    innerDiameterMm: 7.94,
    wireDiameterMm: 1.2,
    centerSpacingMm: 7.0,
    supplier: "cmj",
    material: "Aluminum",
  };

  return {
    version: 1,
    splines: [],
    boundaries: [],
    ringSpecs: [defaultSpec],
    activeSpecId: defaultSpec.id,
    comboLibrary: [],
  };
}

function safeLoadState(): ToolsProjectState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return makeDefaultToolsState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return makeDefaultToolsState();
    return parsed as ToolsProjectState;
  } catch {
    return makeDefaultToolsState();
  }
}

function safeSaveState(s: ToolsProjectState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

// ---------------------------
// Small utilities
// ---------------------------

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(
    16,
  )}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// ---------------------------
// Geometry stubs (replace later)
// ---------------------------

// NOTE: Start with a simple polyline through control points.
// Replace with true B-spline sampling later.
export function sampleSpline(path: SplinePath): ControlPoint[] {
  const pts = path.points ?? [];
  if (pts.length < 2) return pts;
  // Minimal: return points as-is (polyline).
  // TODO: true B-spline / Catmull-Rom sampling.
  return pts;
}

// Convex hull stub for "outermost boundary"
export function convexHull(points: ControlPoint[]): ControlPoint[] {
  // Monotonic chain (Andrew’s) - stable & fast.
  const pts = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x,
  );
  if (pts.length <= 3) return pts;

  const cross = (o: ControlPoint, a: ControlPoint, b: ControlPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: ControlPoint[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: ControlPoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// ---------------------------
// UI pieces
// ---------------------------

const IconBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
    tooltip?: string;
  }
> = ({ active, tooltip, children, ...rest }) => (
  <button
    {...rest}
    title={tooltip}
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
  >
    {children}
  </button>
);

// Minimal draggable wrapper (optional)
// If you already have DraggablePill in App.tsx, pass it in via props instead.
// This keeps tools.tsx independent.
function DraggableLite({
  defaultPos = { x: 120, y: 120 },
  children,
}: {
  defaultPos?: { x: number; y: number };
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState(defaultPos);
  const drag = useRef<{ on: boolean; dx: number; dy: number }>({
    on: false,
    dx: 0,
    dy: 0,
  });

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 99999,
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        // don’t drag from interactive controls
        const t = e.target as HTMLElement;
        if (t.closest("button,input,select,textarea")) return;
        drag.current.on = true;
        drag.current.dx = e.clientX - pos.x;
        drag.current.dy = e.clientY - pos.y;
        try {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
      onPointerMove={(e) => {
        if (!drag.current.on) return;
        setPos({
          x: clamp(e.clientX - drag.current.dx, 8, window.innerWidth - 80),
          y: clamp(e.clientY - drag.current.dy, 8, window.innerHeight - 80),
        });
      }}
      onPointerUp={() => (drag.current.on = false)}
      onPointerCancel={() => (drag.current.on = false)}
    >
      {children}
    </div>
  );
}

// ---------------------------
// Main hook
// ---------------------------

export function useToolsState(adapter?: ToolsHostAdapter) {
  const [project, setProject] = useState<ToolsProjectState>(() => {
    const fromHost = adapter?.getProjectToolsState?.();
    return fromHost ?? safeLoadState();
  });

  const [ui, setUI] = useState<ToolsUIState>({
    gearOpen: false,
    mode: "none",
    selectedSplineId: null,
    showLibrary: false,
    showSpecs: false,
  });

  // Persist either into host project or localStorage
  useEffect(() => {
    if (adapter?.setProjectToolsState) adapter.setProjectToolsState(project);
    else safeSaveState(project);
  }, [project, adapter]);

  const activeSpec = useMemo(() => {
    const id = project.activeSpecId;
    return (
      project.ringSpecs.find((s) => s.id === id) ??
      project.ringSpecs[0] ??
      null
    );
  }, [project.activeSpecId, project.ringSpecs]);

  // ---------------------------
  // Actions
  // ---------------------------

  const setActiveSpecId = useCallback((id: string) => {
    setProject((p) => ({ ...p, activeSpecId: id }));
  }, []);

  const addSpec = useCallback((spec?: Partial<RingSpec>) => {
    const s: RingSpec = {
      id: uid("spec"),
      name: spec?.name ?? "New Spec",
      innerDiameterMm: spec?.innerDiameterMm ?? 7.94,
      wireDiameterMm: spec?.wireDiameterMm ?? 1.2,
      centerSpacingMm: spec?.centerSpacingMm ?? 7.0,
      supplier: spec?.supplier ?? "cmj",
      material: spec?.material ?? "Aluminum",
    };
    setProject((p) => ({
      ...p,
      ringSpecs: [...p.ringSpecs, s],
      activeSpecId: s.id,
    }));
  }, []);

  const updateSpec = useCallback((id: string, patch: Partial<RingSpec>) => {
    setProject((p) => ({
      ...p,
      ringSpecs: p.ringSpecs.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const removeSpec = useCallback((id: string) => {
    setProject((p) => {
      const next = p.ringSpecs.filter((s) => s.id !== id);
      const nextActive =
        p.activeSpecId === id ? (next[0]?.id ?? null) : p.activeSpecId;
      return { ...p, ringSpecs: next, activeSpecId: nextActive };
    });
  }, []);

  // Splines
  const addSpline = useCallback(() => {
    const s: SplinePath = {
      id: uid("spline"),
      name: `Spline ${project.splines.length + 1}`,
      points: [],
      closed: false,
      resolution: 64,
      tension: 0.5,
    };
    setProject((p) => ({ ...p, splines: [...p.splines, s] }));
    setUI((u) => ({
      ...u,
      selectedSplineId: s.id,
      mode: "spline",
      gearOpen: true,
    }));
  }, [project.splines.length]);

  const addSplinePoint = useCallback(
    (x_px: number, y_px: number) => {
      if (!adapter) return;
      const sel = ui.selectedSplineId;
      if (!sel) return;
      const pt = adapter.screenToDesign(x_px, y_px);
      setProject((p) => ({
        ...p,
        splines: p.splines.map((s) =>
          s.id === sel
            ? { ...s, points: [...s.points, { x: pt.x_mm, y: pt.y_mm }] }
            : s,
        ),
      }));
    },
    [adapter, ui.selectedSplineId],
  );

  const toggleSplineClosed = useCallback((id: string) => {
    setProject((p) => ({
      ...p,
      splines: p.splines.map((s) =>
        s.id === id ? { ...s, closed: !s.closed } : s,
      ),
    }));
  }, []);

  // Auto-close: if ends are within threshold, set closed
  const autoCloseSpline = useCallback((id: string, thresholdMm = 6) => {
    setProject((p) => {
      const s = p.splines.find((x) => x.id === id);
      if (!s || s.points.length < 3) return p;
      const a = s.points[0];
      const b = s.points[s.points.length - 1];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > thresholdMm) return p;
      return {
        ...p,
        splines: p.splines.map((x) =>
          x.id === id ? { ...x, closed: true } : x,
        ),
      };
    });
  }, []);

  // Mirror: generate a mirrored copy of selected spline
  const mirrorSpline = useCallback((id: string, axis: Axis) => {
    setProject((p) => {
      const s = p.splines.find((x) => x.id === id);
      if (!s || s.points.length === 0) return p;

      // Mirror around centroid for now (simple + predictable)
      const cx = s.points.reduce((sum, q) => sum + q.x, 0) / s.points.length;
      const cy = s.points.reduce((sum, q) => sum + q.y, 0) / s.points.length;

      const mirrored: SplinePath = {
        ...s,
        id: uid("spline"),
        name: `${s.name} (mirrored)`,
        points: s.points.map((q) =>
          axis === "vertical"
            ? { x: cx - (q.x - cx), y: q.y }
            : { x: q.x, y: cy - (q.y - cy) },
        ),
      };

      return { ...p, splines: [...p.splines, mirrored] };
    });
  }, []);

  // Outermost boundary: create new spline from hull of all sampled points
  const createOutermostBoundary = useCallback(() => {
    setProject((p) => {
      const allPts: ControlPoint[] = [];
      for (const s of p.splines) {
        for (const pt of sampleSpline(s)) allPts.push(pt);
      }
      if (allPts.length < 3) return p;
      const hull = convexHull(allPts);
      const outer: SplinePath = {
        id: uid("spline"),
        name: "Outer Boundary",
        points: hull,
        closed: true,
        resolution: 128,
      };
      return { ...p, splines: [...p.splines, outer] };
    });
  }, []);

  // Combos
  const saveComboFromRings = useCallback(
    (name: string) => {
      if (!adapter) return;
      const rings = adapter.getRings();
      if (!rings || rings.length === 0) return;

      // anchor = min bounds
      const minX = Math.min(...rings.map((r) => r.x_mm));
      const minY = Math.min(...rings.map((r) => r.y_mm));

      const combo: RingCombo = {
        id: uid("combo"),
        name,
        version: 1,
        anchor_mm: { x: minX, y: minY },
        rings: rings.map((r) => ({
          dx_mm: r.x_mm - minX,
          dy_mm: r.y_mm - minY,
          colorHex: r.colorHex,
          specId: r.specId ?? project.activeSpecId ?? undefined,
        })),
      };

      setProject((p) => ({ ...p, comboLibrary: [combo, ...p.comboLibrary] }));
    },
    [adapter, project.activeSpecId],
  );

  const dropCombo = useCallback(
    (comboId: string, x_px: number, y_px: number) => {
      if (!adapter) return;
      const combo = project.comboLibrary.find((c) => c.id === comboId);
      if (!combo) return;

      const pos = adapter.screenToDesign(x_px, y_px);
      const anchorX = pos.x_mm;
      const anchorY = pos.y_mm;

      const newRings: PlacedRingLike[] = combo.rings.map((cr) => ({
        id: uid("ring"),
        x_mm: anchorX + cr.dx_mm,
        y_mm: anchorY + cr.dy_mm,
        colorHex: cr.colorHex ?? "#ffffff",
        specId: cr.specId ?? project.activeSpecId ?? undefined,
      }));

      if (adapter.addRings) adapter.addRings(newRings);
      else if (adapter.setRings)
        adapter.setRings([...adapter.getRings(), ...newRings]);
      // else: no-op
    },
    [adapter, project.comboLibrary, project.activeSpecId],
  );

  return {
    project,
    setProject,
    ui,
    setUI,

    activeSpec,
    actions: {
      // UI
      openGear: () => setUI((u) => ({ ...u, gearOpen: true })),
      closeGear: () => setUI((u) => ({ ...u, gearOpen: false })),
      toggleGear: () => setUI((u) => ({ ...u, gearOpen: !u.gearOpen })),
      setMode: (m: ToolMode) => setUI((u) => ({ ...u, mode: m })),

      // specs
      setActiveSpecId,
      addSpec,
      updateSpec,
      removeSpec,

      // splines
      addSpline,
      addSplinePoint,
      toggleSplineClosed,
      autoCloseSpline,
      mirrorSpline,
      createOutermostBoundary,

      // combos
      saveComboFromRings,
      dropCombo,
    },
  };
}

// ---------------------------
// ToolsPanel (gear + floating panel)
// ---------------------------

export function ToolsPanel({
  adapter,
  defaultPos,
  onRequestClose,
}: {
  adapter: ToolsHostAdapter;
  defaultPos?: { x: number; y: number };
  onRequestClose?: () => void;
}) {
  const { project, ui, setUI, activeSpec, actions } = useToolsState(adapter);

  // “drop combo on next click”
  const pendingDropRef = useRef<string | null>(null);

  const onCanvasPointerDown = useCallback(
    (e: PointerEvent) => {
      // Only active when a tool needs canvas clicks
      if (ui.mode === "spline") {
        actions.addSplinePoint(e.clientX, e.clientY);
        return;
      }
      if (ui.mode === "combo" && pendingDropRef.current) {
        actions.dropCombo(pendingDropRef.current, e.clientX, e.clientY);
        pendingDropRef.current = null;
        return;
      }
    },
    [ui.mode, actions],
  );

  // Attach global listener (host-agnostic).
  // If you prefer, you can wire this into your canvas container instead.
  useEffect(() => {
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener("pointerdown", onCanvasPointerDown, opts);
    return () => {
      window.removeEventListener("pointerdown", onCanvasPointerDown, opts);
    };
  }, [onCanvasPointerDown]);

  return (
    <DraggableLite defaultPos={defaultPos}>
      <div
        style={{
          width: 76,
          padding: 10,
          background: "rgba(15,23,42,.92)",
          border: "1px solid rgba(0,0,0,.6)",
          borderRadius: 20,
          boxShadow: "0 12px 40px rgba(0,0,0,.45)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
          userSelect: "none",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <IconBtn
          tooltip="Tools Menu"
          active={ui.gearOpen}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleGear();
          }}
        >
          ⚙️
        </IconBtn>

        {ui.gearOpen && (
          <div
            style={{
              marginTop: 8,
              width: 240,
              background: "rgba(17,24,39,.96)",
              border: "1px solid rgba(0,0,0,.6)",
              borderRadius: 14,
              padding: 10,
              boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
              color: "#e5e7eb",
              fontSize: 13,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong>Tools</strong>
              <button
                onClick={() => {
                  actions.closeGear();
                  onRequestClose?.();
                }}
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

            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.08)",
                margin: "10px 0",
              }}
            />

            {/* Modes */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
              }}
            >
              <IconBtn
                tooltip="Spline Tool"
                active={ui.mode === "spline"}
                onClick={() =>
                  setUI((u) => ({
                    ...u,
                    mode: u.mode === "spline" ? "none" : "spline",
                  }))
                }
              >
                〰️
              </IconBtn>
              <IconBtn
                tooltip="Mirror Tool"
                active={ui.mode === "mirror"}
                onClick={() =>
                  setUI((u) => ({
                    ...u,
                    mode: u.mode === "mirror" ? "none" : "mirror",
                  }))
                }
              >
                🪞
              </IconBtn>
              <IconBtn
                tooltip="Boundary Tool"
                active={ui.mode === "boundary"}
                onClick={() =>
                  setUI((u) => ({
                    ...u,
                    mode: u.mode === "boundary" ? "none" : "boundary",
                  }))
                }
              >
                🧱
              </IconBtn>
              <IconBtn
                tooltip="Combos"
                active={ui.mode === "combo"}
                onClick={() =>
                  setUI((u) => ({
                    ...u,
                    mode: u.mode === "combo" ? "none" : "combo",
                  }))
                }
              >
                🧩
              </IconBtn>
            </div>

            {/* Ring Specs */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Ring Spec</div>
              <select
                value={project.activeSpecId ?? ""}
                onChange={(e) => actions.setActiveSpecId(e.target.value)}
                style={{
                  width: "100%",
                  background: "#111827",
                  color: "#e5e7eb",
                  border: "1px solid #1f2937",
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                {project.ringSpecs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {activeSpec && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#cbd5e1" }}>
                  ID {activeSpec.innerDiameterMm.toFixed(2)} mm • WD{" "}
                  {activeSpec.wireDiameterMm.toFixed(2)} mm • Spacing{" "}
                  {activeSpec.centerSpacingMm.toFixed(2)} mm
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => actions.addSpec({ name: "New Spec" })} style={miniBtn}>
                  + Add
                </button>
                {project.ringSpecs.length > 1 && project.activeSpecId && (
                  <button
                    onClick={() => actions.removeSpec(project.activeSpecId!)}
                    style={miniBtn}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Spline actions */}
            {ui.mode === "spline" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Spline</div>
                <button onClick={actions.addSpline} style={wideBtn}>
                  + New Spline
                </button>

                {project.splines.length > 0 && (
                  <select
                    value={ui.selectedSplineId ?? ""}
                    onChange={(e) =>
                      setUI((u) => ({ ...u, selectedSplineId: e.target.value }))
                    }
                    style={selectStyle}
                  >
                    <option value="" disabled>
                      Select spline…
                    </option>
                    {project.splines.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}

                {ui.selectedSplineId && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() =>
                        actions.toggleSplineClosed(ui.selectedSplineId!)
                      }
                      style={miniBtn}
                    >
                      Toggle Closed
                    </button>
                    <button
                      onClick={() => actions.autoCloseSpline(ui.selectedSplineId!, 6)}
                      style={miniBtn}
                    >
                      Auto Close
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mirror actions */}
            {ui.mode === "mirror" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Mirror</div>
                <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 6 }}>
                  Select a spline (Spline tool) then mirror it.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    disabled={!ui.selectedSplineId}
                    onClick={() =>
                      ui.selectedSplineId &&
                      actions.mirrorSpline(ui.selectedSplineId, "vertical")
                    }
                    style={miniBtn}
                  >
                    Vertical
                  </button>
                  <button
                    disabled={!ui.selectedSplineId}
                    onClick={() =>
                      ui.selectedSplineId &&
                      actions.mirrorSpline(ui.selectedSplineId, "horizontal")
                    }
                    style={miniBtn}
                  >
                    Horizontal
                  </button>
                </div>
              </div>
            )}

            {/* Boundary actions */}
            {ui.mode === "boundary" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Boundary</div>
                <button onClick={actions.createOutermostBoundary} style={wideBtn}>
                  Outermost (Hull)
                </button>
                <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 6 }}>
                  (Convex hull now; upgrade to concave later.)
                </div>
              </div>
            )}

            {/* Combo library */}
            {ui.mode === "combo" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Combos</div>
                <button
                  onClick={() =>
                    actions.saveComboFromRings(
                      `Combo ${project.comboLibrary.length + 1}`,
                    )
                  }
                  style={wideBtn}
                >
                  Save current rings
                </button>

                <div style={{ marginTop: 10, maxHeight: 180, overflowY: "auto" }}>
                  {project.comboLibrary.length === 0 && (
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      No combos saved yet.
                    </div>
                  )}
                  {project.comboLibrary.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span style={{ fontSize: 12 }}>{c.name}</span>
                      <button
                        style={miniBtn}
                        onClick={() => {
                          // next click drops it
                          pendingDropRef.current = c.id;
                          setUI((u) => ({ ...u, mode: "combo" }));
                        }}
                      >
                        Drop
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DraggableLite>
  );
}

// ---------------------------
// Styles
// ---------------------------

const wideBtn: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  background: "#2563eb",
  border: "none",
  color: "white",
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 10,
  background: "rgba(15, 23, 42, 0.85)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#dbeafe",
  cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  background: "#111827",
  color: "#e5e7eb",
  border: "1px solid #1f2937",
  borderRadius: 10,
  padding: "8px 10px",
};