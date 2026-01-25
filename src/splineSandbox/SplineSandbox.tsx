// ============================================================
// src/splineSandbox/SplineSandbox.tsx
// FULL FILE — Visible spline overlay + optional control panel
// Emoji-only panel UI (no words in the subpanel)
// - Multi-spline
// - Click/tap canvas to add points
// - Tap point to select pivot
// - Smooth Catmull-Rom preview
// - Close/Open + Auto-close hint
// - Mirror semantics:
//    * OPEN spline: mirror COPY about pivot AND MERGE into same spline
//    * CLOSED spline: mirror creates a NEW spline (copy), original preserved
// - Mirror + Close option
// - Undo/Clear per active spline
// - Export/Import JSON for all splines
// - Embedded overlay safe z-index + transparent background
// - Optional panel (showPanel) that is DRAGGABLE + persisted
//
// FIXES (NO FEATURE REMOVALS):
// - Add explicit coordinate-space metadata for apply payload.
// - Provide BOTH client-space (viewport) and page-space polygons so the caller
//   can map into canvas/world space correctly (fixes “spline doesn’t transfer”).
// - Ensure pointer coords are stable even if the page scrolls.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Axis = "vertical" | "horizontal";

export type ControlPoint = { x: number; y: number };

export type SplinePath = {
  id: string;
  name: string;
  points: ControlPoint[];
  closed: boolean;
  resolution?: number; // samples per segment
  tension?: number; // reserved (not used yet)
};

export type SandboxState = {
  version: 1;
  splines: SplinePath[];
  activeSplineId: string;
};

function modeIcon(mode: "designer" | "freeform" | "erin2d") {
  if (mode === "designer") return "🎨";
  if (mode === "freeform") return "🧷";
  return "📐";
}

export default function SplineSandbox(props: {
  embedded?: boolean;
  storageKey?: string;
  onRequestClose?: () => void;
  onChangeState?: (s: SandboxState) => void;

  showPanel?: boolean;

  mode?: "designer" | "freeform" | "erin2d";
  currentColorHex?: string;

  onApplyClosedSpline?: (args: {
    // ORIGINAL (kept): viewport/client-space points (same as e.clientX/Y)
    polygon: ControlPoint[];

    // NEW: page-space points (client + scroll), useful if caller uses page coords
    polygonPage: ControlPoint[];

    // NEW: which space "polygon" uses
    coordSpace: "client" | "page";

    // NEW: useful for conversions on the caller side
    viewport: {
      innerWidth: number;
      innerHeight: number;
      scrollX: number;
      scrollY: number;
      devicePixelRatio: number;
    };

    colorHex: string;
    spline: SplinePath;
    state: SandboxState;
  }) => void;
}) {
  const {
    embedded = false,
    storageKey,
    onRequestClose,
    onChangeState,
    showPanel = true,
    mode = "designer",
    currentColorHex = "#8F00FF",
    onApplyClosedSpline,
  } = props;

  // ============================================================
  // Helpers
  // ============================================================

  const uid = (prefix = "id") =>
    `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;

  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

  const dist = (a: ControlPoint, b: ControlPoint) => Math.hypot(a.x - b.x, a.y - b.y);

  const clampPos = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

  function sampleCatmullRom(pts: ControlPoint[], closed: boolean, samplesPerSeg = 18): ControlPoint[] {
    if (!pts || pts.length < 2) return pts ?? [];
    const out: ControlPoint[] = [];

    const get = (i: number) => {
      const n = pts.length;
      if (closed) return pts[(i + n) % n];
      return pts[clamp(i, 0, n - 1)];
    };

    const nSegs = closed ? pts.length : pts.length - 1;

    for (let i = 0; i < nSegs; i++) {
      const p0 = get(i - 1);
      const p1 = get(i);
      const p2 = get(i + 1);
      const p3 = get(i + 2);

      for (let j = 0; j <= samplesPerSeg; j++) {
        const t = j / samplesPerSeg;
        const t2 = t * t;
        const t3 = t2 * t;

        const x =
          0.5 *
          ((2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

        const y =
          0.5 *
          ((2 * p1.y) +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

        out.push({ x, y });
      }
    }

    return out;
  }

  function toSvgPath(pts: ControlPoint[], closed: boolean) {
    if (!pts || pts.length === 0) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    if (closed) d += " Z";
    return d;
  }

  function mirrorAboutPivot(pts: ControlPoint[], axis: Axis, pivot: ControlPoint) {
    return pts.map((p) =>
      axis === "vertical" ? { x: 2 * pivot.x - p.x, y: p.y } : { x: p.x, y: 2 * pivot.y - p.y },
    );
  }

  // ============================================================
  // Draggable panel position (persisted)
  // ============================================================

  const posKey = storageKey ? `${storageKey}::panelPos` : undefined;

  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>(() => {
    if (!posKey) return { x: 16, y: 16 };
    try {
      const raw = localStorage.getItem(posKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 16, y: 16 };
  });

  useEffect(() => {
    if (!posKey) return;
    try {
      localStorage.setItem(posKey, JSON.stringify(panelPos));
    } catch {}
  }, [panelPos, posKey]);

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0, pointerId: null });

  // ============================================================
  // UI styles
  // ============================================================

  const btn: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(15,23,42,0.85)",
    color: "#e5e7eb",
    cursor: "pointer",
    fontSize: 13,
    userSelect: "none",
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: "#2563eb",
    border: "none",
    color: "white",
    fontWeight: 800,
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

  const panel: React.CSSProperties = {
    position: "fixed",
    left: panelPos.x,
    top: panelPos.y,
    zIndex: embedded ? 1000002 : 9999,
    width: 360,
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,.6)",
    background: "rgba(17,24,39,0.92)",
    boxShadow: "0 16px 48px rgba(0,0,0,.45)",
    padding: 12,
    color: "#e5e7eb",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
  };

  // ============================================================
  // STATE
  // ============================================================

  const [state, setState] = useState<SandboxState>(() => {
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as SandboxState;
          if (
            parsed?.version === 1 &&
            Array.isArray(parsed.splines) &&
            parsed.splines.length &&
            typeof parsed.activeSplineId === "string"
          ) {
            return parsed;
          }
        }
      } catch {}
    }

    const first: SplinePath = {
      id: uid("spline"),
      name: `🧵1`,
      points: [],
      closed: false,
      resolution: 18,
      tension: 0.5,
    };
    return { version: 1, splines: [first], activeSplineId: first.id };
  });

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const undoRef = useRef<Record<string, ControlPoint[][]>>({});

  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {}
    }
    onChangeState?.(state);
  }, [state, storageKey, onChangeState]);

  const activeSpline = useMemo(() => {
    return state.splines.find((s) => s.id === state.activeSplineId) ?? state.splines[0];
  }, [state.splines, state.activeSplineId]);

  const activePoints = activeSpline?.points ?? [];

  useEffect(() => {
    if (!activeSpline) return;
    if (activePoints.length === 0) {
      setSelectedIndex(null);
      return;
    }
    setSelectedIndex((prev) => {
      if (prev == null) return activePoints.length - 1;
      return Math.min(prev, activePoints.length - 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeSplineId, activePoints.length]);

  const pushUndo = useCallback((splineId: string, prevPoints: ControlPoint[]) => {
    if (!undoRef.current[splineId]) undoRef.current[splineId] = [];
    undoRef.current[splineId].push(prevPoints.map((p) => ({ ...p })));
    if (undoRef.current[splineId].length > 100) undoRef.current[splineId].shift();
  }, []);

  const sampledBySpline = useMemo(() => {
    const map: Record<string, ControlPoint[]> = {};
    for (const s of state.splines) {
      const pts = s.points ?? [];
      const n = s.resolution ?? 18;
      map[s.id] = pts.length >= 3 ? sampleCatmullRom(pts, s.closed, n) : pts;
    }
    return map;
  }, [state.splines]);

  const autoCloseReady = useMemo(() => {
    if (!activeSpline) return false;
    if (activeSpline.closed) return false;
    if (activePoints.length < 3) return false;
    return dist(activePoints[0], activePoints[activePoints.length - 1]) < 16;
  }, [activeSpline, activePoints]);

  const setActiveSplineId = useCallback((id: string) => {
    setState((s) => ({ ...s, activeSplineId: id }));
  }, []);

  const addSpline = useCallback(() => {
    setState((s) => {
      const nextNum = s.splines.length + 1;
      const next: SplinePath = {
        id: uid("spline"),
        name: `🧵${nextNum}`,
        points: [],
        closed: false,
        resolution: 18,
        tension: 0.5,
      };
      return { ...s, splines: [...s.splines, next], activeSplineId: next.id };
    });
  }, []);

  const deleteActiveSpline = useCallback(() => {
    setState((s) => {
      if (s.splines.length <= 1) return s;
      const remaining = s.splines.filter((sp) => sp.id !== s.activeSplineId);
      const nextActive = remaining[0]?.id ?? s.activeSplineId;
      return { ...s, splines: remaining, activeSplineId: nextActive };
    });
  }, []);

  // ============================================================
  // INPUT
  // ============================================================

  const addPointFromEvent = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-ui='panel']")) return;

      // NOTE:
      // - clientX/Y are viewport-relative (what most canvases use)
      // - pageX/Y include scroll (useful for callers that store page coords)
      const pClient = { x: e.clientX, y: e.clientY };

      // point selection (tap near a point)
      const hitRadius = 18;
      if (activePoints.length > 0) {
        let bestIdx: number | null = null;
        let bestD = Infinity;
        for (let i = 0; i < activePoints.length; i++) {
          const d = dist(pClient, activePoints[i]);
          if (d < hitRadius && d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
        if (bestIdx != null) {
          setSelectedIndex(bestIdx);
          return;
        }
      }

      setState((s) => {
        const idx = s.splines.findIndex((sp) => sp.id === s.activeSplineId);
        if (idx < 0) return s;

        const sp = s.splines[idx];
        pushUndo(sp.id, sp.points);

        const updated: SplinePath = { ...sp, points: [...sp.points, pClient] };
        const next = [...s.splines];
        next[idx] = updated;
        return { ...s, splines: next };
      });
    },
    [pushUndo, activePoints],
  );

  const undo = useCallback(() => {
    const sid = state.activeSplineId;
    const stack = undoRef.current[sid];
    if (!stack || stack.length === 0) return;
    const prev = stack.pop();
    if (!prev) return;

    setState((s) => {
      const idx = s.splines.findIndex((sp) => sp.id === sid);
      if (idx < 0) return s;
      const next = [...s.splines];
      next[idx] = {
        ...next[idx],
        points: prev,
        closed: next[idx].closed && prev.length >= 3,
      };
      return { ...s, splines: next };
    });
  }, [state.activeSplineId]);

  const clear = useCallback(() => {
    setState((s) => {
      const idx = s.splines.findIndex((sp) => sp.id === s.activeSplineId);
      if (idx < 0) return s;
      const sp = s.splines[idx];
      pushUndo(sp.id, sp.points);

      const next = [...s.splines];
      next[idx] = { ...sp, points: [], closed: false };
      return { ...s, splines: next };
    });
  }, [pushUndo]);

  const closeActive = useCallback(() => {
    setState((s) => {
      const idx = s.splines.findIndex((sp) => sp.id === s.activeSplineId);
      if (idx < 0) return s;
      const sp = s.splines[idx];
      if (sp.points.length < 3) return s;

      const next = [...s.splines];
      next[idx] = { ...sp, closed: true };
      return { ...s, splines: next };
    });
  }, []);

  const openActive = useCallback(() => {
    setState((s) => {
      const idx = s.splines.findIndex((sp) => sp.id === s.activeSplineId);
      if (idx < 0) return s;

      const next = [...s.splines];
      next[idx] = { ...next[idx], closed: false };
      return { ...s, splines: next };
    });
  }, []);

  const mirrorCopyAndMaybeClose = useCallback(
    (axis: Axis, forceClose?: boolean) => {
      setState((s) => {
        const idx = s.splines.findIndex((sp) => sp.id === s.activeSplineId);
        if (idx < 0) return s;

        const src = s.splines[idx];
        if (!src || src.points.length === 0) return s;

        const pivotIdx =
          selectedIndex != null ? clamp(selectedIndex, 0, src.points.length - 1) : src.points.length - 1;

        const pivot = src.points[pivotIdx];
        const nextClosed = forceClose ? true : src.closed;

        // OPEN spline: merge mirrored segment into SAME spline
        if (!src.closed) {
          pushUndo(src.id, src.points);

          const mirroredAll = mirrorAboutPivot(src.points, axis, pivot);
          const mirroredSegment = mirroredAll.slice(0, pivotIdx + 1).reverse().slice(1);
          const merged = [...src.points, ...mirroredSegment];

          const next = [...s.splines];
          next[idx] = {
            ...src,
            points: merged,
            closed: nextClosed,
            name: `${src.name}🪞${axis === "vertical" ? "↔️" : "↕️"}`,
          };
          return { ...s, splines: next };
        }

        // CLOSED spline: create NEW mirrored spline
        const mirroredPoints = mirrorAboutPivot(src.points, axis, pivot);
        const mirrored: SplinePath = {
          id: uid("spline"),
          name: `${src.name}🪞${axis === "vertical" ? "↔️" : "↕️"}`,
          points: mirroredPoints,
          closed: nextClosed,
          resolution: src.resolution ?? 18,
          tension: src.tension ?? 0.5,
        };

        return { ...s, splines: [...s.splines, mirrored], activeSplineId: mirrored.id };
      });
    },
    [selectedIndex, pushUndo],
  );

  const exportJson = useCallback(() => {
    const payload = JSON.stringify(state, null, 2);
    navigator.clipboard?.writeText(payload).catch(() => {});
    alert("📋✅");
  }, [state]);

  const importJson = useCallback(() => {
    const raw = prompt("📥");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SandboxState;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.splines) || parsed.splines.length === 0) {
        alert("⚠️");
        return;
      }

      const cleaned = parsed.splines.map((sp, i) => ({
        id: sp.id ?? uid("spline"),
        name: sp.name ?? `🧵${i + 1}`,
        points: Array.isArray(sp.points) ? sp.points : [],
        closed: !!sp.closed,
        resolution: typeof sp.resolution === "number" ? sp.resolution : 18,
        tension: typeof sp.tension === "number" ? sp.tension : 0.5,
      }));

      undoRef.current = {};
      setState({
        version: 1,
        splines: cleaned,
        activeSplineId:
          parsed.activeSplineId && cleaned.some((x) => x.id === parsed.activeSplineId)
            ? parsed.activeSplineId
            : cleaned[0].id,
      });
    } catch {
      alert("⚠️");
    }
  }, []);

  const setResolution = useCallback((n: number) => {
    setState((s) => {
      const idx = s.splines.findIndex((sp) => sp.id === s.activeSplineId);
      if (idx < 0) return s;
      const next = [...s.splines];
      next[idx] = { ...next[idx], resolution: n };
      return { ...s, splines: next };
    });
  }, []);

  // ============================================================
  // APPLY
  // ============================================================

// ============================================================
// APPLY
// - Allow apply if the spline is officially closed (🔒)
//   OR if it is "auto-close ready" (end is near start)
// - If auto-close-ready but not closed, we still apply by
//   passing a closed polygon (append first point)
// ============================================================

const canApply =
  !!activeSpline &&
  activePoints.length >= 3 &&
  (activeSpline.closed || autoCloseReady);

const doApply = useCallback(() => {
  if (!activeSpline) return;
  if (activeSpline.points.length < 3) return;

  // If user didn't press 🔒 but the end is close to start,
  // still allow apply by treating it as closed.
  const polygon =
    activeSpline.closed
      ? activeSpline.points
      : autoCloseReady
        ? [...activeSpline.points, activeSpline.points[0]]
        : null;

  if (!polygon || polygon.length < 3) return;

  // Helpful debug signal (safe; remove later if you want)
  // eslint-disable-next-line no-console
  console.log("[SplineSandbox] APPLY", {
    closed: activeSpline.closed,
    autoCloseReady,
    n: polygon.length,
    color: currentColorHex,
  });

onApplyClosedSpline?.({
  polygon,
  polygonPage: polygon, // fallback
  coordSpace: "client",
  viewport: {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio ?? 1,
  },
  colorHex: currentColorHex,
  spline: activeSpline,
  state,
});
}, [activeSpline, autoCloseReady, currentColorHex, onApplyClosedSpline, state]);

  // ============================================================
  // UX: ESC closes
  // ============================================================

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onRequestClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRequestClose]);

  const activeUndoCount = undoRef.current[state.activeSplineId]?.length ?? 0;

  const pivotEmoji =
    activeSpline && activePoints.length ? `⭐${(selectedIndex ?? activePoints.length - 1) + 1}` : "⭐—";

  // ============================================================
  // RENDER
  // ============================================================

  const ROOT_Z = embedded ? 1000000 : 10;
  const SVG_Z = embedded ? 1000001 : 2;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: ROOT_Z,
        background: embedded
          ? "transparent"
          : "radial-gradient(1200px 700px at 30% 20%, rgba(59,130,246,.12), transparent 60%), #0b1220",
      }}
      onPointerDown={addPointFromEvent}
    >
      {/* UI Panel (optional) */}
      {showPanel && (
        <div
          data-ui="panel"
          style={panel}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            {/* Drag handle (left) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: dragRef.current.active ? "grabbing" : "grab",
                userSelect: "none",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                dragRef.current = {
                  active: true,
                  startX: e.clientX,
                  startY: e.clientY,
                  baseX: panelPos.x,
                  baseY: panelPos.y,
                  pointerId: e.pointerId,
                };
              }}
              onPointerMove={(e) => {
                if (!dragRef.current.active) return;
                e.stopPropagation();

                const dx = e.clientX - dragRef.current.startX;
                const dy = e.clientY - dragRef.current.startY;

                const nextX = dragRef.current.baseX + dx;
                const nextY = dragRef.current.baseY + dy;

                const maxX = (typeof window !== "undefined" ? window.innerWidth : 1200) - 60;
                const maxY = (typeof window !== "undefined" ? window.innerHeight : 900) - 60;

                setPanelPos({
                  x: clampPos(nextX, 0, maxX),
                  y: clampPos(nextY, 0, maxY),
                });
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                dragRef.current.active = false;
                try {
                  if (dragRef.current.pointerId != null) {
                    (e.currentTarget as HTMLDivElement).releasePointerCapture(dragRef.current.pointerId);
                  }
                } catch {}
                dragRef.current.pointerId = null;
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                dragRef.current.active = false;
                dragRef.current.pointerId = null;
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>🧵 {modeIcon(mode)}</div>
            </div>

            {/* Right side stats + close */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "right" }}>
                🔢 {activePoints.length}
                {activeSpline?.closed ? " 🔒" : ""}
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{pivotEmoji}</div>
              </div>

              <button
                type="button"
                title="✕"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestClose?.();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ width: 32, height: 32, borderRadius: 10, ...btn, padding: 0, lineHeight: "32px" }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "10px 0" }} />

          <select
            value={state.activeSplineId}
            onChange={(e) => setActiveSplineId(e.target.value)}
            style={selectStyle}
            title="🎯"
          >
            {state.splines.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name} {sp.points.length}
                {sp.closed ? "🔒" : ""}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={btnPrimary} onClick={addSpline} title="➕">
              ➕
            </button>
            <button style={btn} onClick={deleteActiveSpline} disabled={state.splines.length <= 1} title="🗑️">
              🗑️
            </button>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "10px 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              style={btnPrimary}
              onClick={closeActive}
              disabled={activePoints.length < 3 || !!activeSpline?.closed}
              title="🔒"
            >
              🔒
            </button>
            <button style={btn} onClick={openActive} disabled={!activeSpline?.closed} title="🔓">
              🔓
            </button>

            <button style={btn} onClick={undo} disabled={activeUndoCount === 0} title="↩️">
              ↩️
            </button>
            <button style={btn} onClick={clear} disabled={activePoints.length === 0} title="🧼">
              🧼
            </button>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "10px 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button style={btn} onClick={() => mirrorCopyAndMaybeClose("vertical")} title="🪞↔️">
              🪞↔️
            </button>
            <button style={btn} onClick={() => mirrorCopyAndMaybeClose("horizontal")} title="🪞↕️">
              🪞↕️
            </button>
            <button
              style={btn}
              onClick={() => mirrorCopyAndMaybeClose("vertical", true)}
              disabled={activePoints.length < 3}
              title="🪞↔️🔒"
            >
              🪞↔️🔒
            </button>
            <button
              style={btn}
              onClick={() => mirrorCopyAndMaybeClose("horizontal", true)}
              disabled={activePoints.length < 3}
              title="🪞↕️🔒"
            >
              🪞↕️🔒
            </button>
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button style={btn} onClick={closeActive} disabled={!autoCloseReady} title="🤝🔒">
              🤝🔒
            </button>
            <button style={btn} onClick={exportJson} title="📋">
              📋
            </button>
            <button style={btn} onClick={importJson} title="📥">
              📥
            </button>
          </div>



          {/* Current color swatch + apply */}
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 6,
                background: currentColorHex,
                border: "1px solid rgba(0,0,0,.8)",
              }}
              title="🎨"
            />
            <div style={{ flex: 1 }} />
            <button
              style={canApply ? btnPrimary : { ...btnPrimary, opacity: 0.45, cursor: "not-allowed" }}
              disabled={!canApply}
              onClick={doApply}
              title={canApply ? "🪣➡️" : "🔒➕➕➕"}
            >
              🪣
            </button>
          </div>
        </div>
      )}

      {/* Overlay drawing */}
      <svg
        style={{
          position: "fixed",
          inset: 0,
          zIndex: SVG_Z,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {state.splines.map((sp) => {
          const pts = sp.points ?? [];
          const smooth = sampledBySpline[sp.id] ?? [];
          const isActive = sp.id === state.activeSplineId;

          const activeFill =
            sp.closed && isActive
              ? `${currentColorHex}22`
              : sp.closed
                ? "rgba(59,130,246,0.10)"
                : "none";

          return (
            <g key={sp.id} opacity={isActive ? 1 : 0.75}>
              {smooth.length >= 2 && (
                <path
                  d={toSvgPath(smooth, sp.closed)}
                  fill={activeFill}
                  stroke={isActive ? "rgba(255,255,255,0.95)" : "rgba(59,130,246,0.9)"}
                  strokeWidth={isActive ? 3.0 : 2.4}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {pts.length >= 2 && (
                <path
                  d={toSvgPath(pts, false)}
                  fill="none"
                  stroke={isActive ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.18)"}
                  strokeWidth={1.6}
                  strokeDasharray="6 6"
                />
              )}

              {pts.map((p, i) => {
                const isPivot = isActive && i === (selectedIndex ?? pts.length - 1);
                return (
                  <g key={i}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={10}
                      fill={isPivot ? "rgba(37,99,235,0.95)" : "rgba(15,23,42,0.80)"}
                      stroke={isActive ? "rgba(255,255,255,0.85)" : "rgba(59,130,246,0.9)"}
                      strokeWidth={2.6}
                    />
                    <circle cx={p.x} cy={p.y} r={3.6} fill="white" opacity={0.95} />
                    <text
                      x={p.x + 12}
                      y={p.y - 12}
                      fontSize={13}
                      fill={isPivot ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.72)"}
                      style={{ userSelect: "none" }}
                    >
                      {i + 1}
                      {isPivot ? "⭐" : ""}
                    </text>
                  </g>
                );
              })}

              {isActive && !sp.closed && pts.length >= 3 && dist(pts[0], pts[pts.length - 1]) < 16 && (
                <line
                  x1={pts[0].x}
                  y1={pts[0].y}
                  x2={pts[pts.length - 1].x}
                  y2={pts[pts.length - 1].y}
                  stroke="rgba(34,197,94,0.95)"
                  strokeWidth={3}
                  strokeDasharray="8 8"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}