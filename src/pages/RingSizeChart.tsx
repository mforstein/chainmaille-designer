// src/pages/RingSizeChart.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { computeRingVars } from "../utils/computeRingVars";
import { ALL_PRODUCTS, SUPPLIER_INFO } from "../data/supplierCatalog";
import type { SupplierProduct } from "../data/supplierCatalog";
import { DraggableCompassNav, DraggablePill } from "../App";
import { IconHamburger } from "../components/icons/ToolIcons";
import SupplierColorRefreshButton from "../components/SupplierColorRefreshButton";

// ── Layout constants ──────────────────────────────────────────────────────────
const ID_OPTIONS = [
  "7/64", "1/8", "9/64", "5/32", "3/16",
  "1/4", "5/16", "3/8", "7/16", "1/2", "5/8",
];
const WIRE_OPTIONS = [0.9, 1.2, 1.6, 2.0, 2.5, 3.0];

const CELL = 80;
const PAD_L = 82;
const PAD_T = 64;
const CHART_W = PAD_L + ID_OPTIONS.length * CELL;
const CHART_H = PAD_T + WIRE_OPTIONS.length * CELL;

// Scale: largest ring (5/8" + 3mm wire) fills 44% of a cell
const MAX_OD_HALF_MM = computeRingVars("5/8", 3.0).OD_mm / 2;
const MM_PX = (CELL * 0.44) / MAX_OD_HALF_MM;

const TOLERANCE_MM = 0.35;
const ANIM_MS = 360;

const GAUGE: Record<number, string> = {
  0.9: "~20G", 1.2: "~18G", 1.6: "~16G",
  2.0: "~14G", 2.5: "~12G", 3.0: "~10G",
};

const AR_LEGEND = [
  { label: "Too tight", range: "< 3",    color: "#dc2626" },
  { label: "Snug",      range: "3–3.5",  color: "#f97316" },
  { label: "Ideal",     range: "3.5–5.5",color: "#60a5fa" },
  { label: "Good",      range: "5.5–7.5",color: "#94a3b8" },
  { label: "Loose",     range: "> 7.5",  color: "#ca8a04" },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface RingData {
  row: number; col: number;
  idFrac: string;
  ID_mm: number; WD_mm: number; OD_mm: number;
  AR: number;
  cx: number; cy: number;   // world px
  outerR: number; innerR: number; // world px
}

interface Tf { x: number; y: number; scale: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function arColor(ar: number) {
  if (ar < 3.0) return "#dc2626";
  if (ar < 3.5) return "#f97316";
  if (ar < 5.5) return "#60a5fa";
  if (ar < 7.5) return "#94a3b8";
  return "#ca8a04";
}

function arLabel(ar: number) {
  if (ar < 3.0) return "Too tight";
  if (ar < 3.5) return "Snug";
  if (ar < 5.5) return "Ideal";
  if (ar < 7.5) return "Good";
  return "Loose";
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeIO(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

// ── Build ring grid ───────────────────────────────────────────────────────────
function buildRings(): RingData[] {
  return WIRE_OPTIONS.flatMap((wire, r) =>
    ID_OPTIONS.map((idFrac, c) => {
      const { ID_mm, WD_mm, OD_mm } = computeRingVars(idFrac, wire);
      const AR = ID_mm / WD_mm;
      const cx = PAD_L + c * CELL + CELL / 2;
      const cy = PAD_T + r * CELL + CELL / 2;
      return {
        row: r, col: c, idFrac, ID_mm, WD_mm, OD_mm, AR, cx, cy,
        outerR: (OD_mm / 2) * MM_PX,
        innerR: (ID_mm / 2) * MM_PX,
      };
    })
  );
}

// ── Canvas drawing ────────────────────────────────────────────────────────────
function drawChart(
  canvas: HTMLCanvasElement,
  rings: RingData[],
  tf: Tf,
  selected: RingData | null,
) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;

  const pw = Math.round(cw * dpr);
  const ph = Math.round(ch * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }

  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#0E0F12";
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(tf.x, tf.y);
  ctx.scale(tf.scale, tf.scale);

  // Grid lines
  ctx.strokeStyle = "#1e2635";
  ctx.lineWidth = 0.5;
  for (let r = 0; r <= WIRE_OPTIONS.length; r++) {
    const y = PAD_T + r * CELL;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(CHART_W, y); ctx.stroke();
  }
  for (let c = 0; c <= ID_OPTIONS.length; c++) {
    const x = PAD_L + c * CELL;
    ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, CHART_H); ctx.stroke();
  }

  // Top axis — ID labels
  ID_OPTIONS.forEach((frac, c) => {
    const { ID_mm } = computeRingVars(frac, 1.0);
    const x = PAD_L + c * CELL + CELL / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#d1d5db";
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${frac}"`, x, PAD_T - 28);
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillText(`${ID_mm.toFixed(1)}mm`, x, PAD_T - 14);
  });

  // Left axis — wire labels
  WIRE_OPTIONS.forEach((wire, r) => {
    const y = PAD_T + r * CELL + CELL / 2;
    ctx.textAlign = "right";
    ctx.fillStyle = "#d1d5db";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${wire}mm`, PAD_L - 6, y - 4);
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillText(GAUGE[wire] ?? "", PAD_L - 6, y + 9);
  });

  // Corner label
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#374151";
  ctx.font = "9px system-ui, sans-serif";
  ctx.fillText("Wire ↓ / ID →", PAD_L - 3, PAD_T - 1);

  // Draw rings
  for (const ring of rings) {
    const isSel = selected?.row === ring.row && selected?.col === ring.col;
    const color = isSel ? "#ffffff" : arColor(ring.AR);

    // Annulus (evenodd: outer circle + inner circle same direction = hole)
    ctx.beginPath();
    ctx.arc(ring.cx, ring.cy, ring.outerR, 0, Math.PI * 2);
    ctx.arc(ring.cx, ring.cy, Math.max(0.5, ring.innerR), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = isSel ? 1.0 : 0.82;
    ctx.fill("evenodd");
    ctx.globalAlpha = 1.0;

    if (isSel) {
      // Glow halo
      ctx.beginPath();
      ctx.arc(ring.cx, ring.cy, ring.outerR + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // AR value below ring — scales with zoom (world coords)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isSel ? "#f9fafb" : "#4b5563";
    ctx.font = `${isSel ? 10 : 8}px system-ui, sans-serif`;
    ctx.fillText(ring.AR.toFixed(1), ring.cx, ring.cy + ring.outerR + 3);
  }

  ctx.restore(); // world transform
  ctx.restore(); // dpr scale
}

// ── Info Panel ────────────────────────────────────────────────────────────────
function InfoPanel({ ring, onClose }: { ring: RingData; onClose: () => void }) {
  const matches = useMemo<SupplierProduct[]>(() => {
    return ALL_PRODUCTS.filter(
      (p) =>
        p.type === "ring" &&
        Math.abs((p.innerDiameterMm ?? -99) - ring.ID_mm) <= TOLERANCE_MM &&
        Math.abs((p.wireDiameterMm ?? -99) - ring.WD_mm) <= TOLERANCE_MM,
    );
  }, [ring.ID_mm, ring.WD_mm]);

  const bySupplier = useMemo(() => {
    const map = new Map<string, SupplierProduct[]>();
    for (const p of matches) {
      const arr = map.get(p.supplierId) ?? [];
      arr.push(p);
      map.set(p.supplierId, arr);
    }
    return map;
  }, [matches]);

  const materials = [...new Set(matches.map((p) => p.material.replace(/_/g, " ")))];
  const col = arColor(ring.AR);
  const lbl = arLabel(ring.AR);

  return (
    <div
      style={{
        position: "fixed",
        top: 68,
        right: 12,
        width: Math.min(272, window.innerWidth - 24),
        maxHeight: "calc(100dvh - 100px)",
        overflowY: "auto",
        background: "rgba(13,17,28,0.97)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 14,
        padding: "14px 16px",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 13,
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
        zIndex: 200,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{ring.idFrac}" ID</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{ring.WD_mm}mm wire · {GAUGE[ring.WD_mm]}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1, marginTop: -2 }}
        >×</button>
      </div>

      {/* Dimensions grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 10 }}>
        {([["ID", `${ring.ID_mm.toFixed(2)}mm`], ["WD", `${ring.WD_mm}mm`], ["OD", `${ring.OD_mm.toFixed(2)}mm`]] as [string, string][]).map(([k, v]) => (
          <div key={k} style={{ background: "#111827", borderRadius: 8, padding: "6px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2, textTransform: "uppercase" }}>{k}</div>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* AR badge */}
      <div style={{ background: "#111827", borderRadius: 8, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0 }} />
        <span style={{ fontWeight: 700 }}>AR {ring.AR.toFixed(2)}</span>
        <span style={{ color: col, fontWeight: 600, marginLeft: 4 }}>{lbl}</span>
      </div>

      {/* Materials */}
      {materials.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Materials
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {materials.map((m) => (
              <span key={m} style={{ background: "#1f2937", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#d1d5db" }}>{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Suppliers + colors */}
      {bySupplier.size > 0 ? (
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Available From
          </div>
          {Array.from(bySupplier.entries()).map(([suppId, products]) => {
            const info = SUPPLIER_INFO[suppId as keyof typeof SUPPLIER_INFO];
            const colorProducts = [...new Map(
              products.filter((p) => p.colorHex).map((p) => [p.colorHex!, p])
            ).values()];
            return (
              <div key={suppId} style={{ marginBottom: 12 }}>
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: info.color, fontWeight: 700, fontSize: 12, textDecoration: "none" }}
                >
                  {info.name} ↗
                </a>
                {colorProducts.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                    {colorProducts.map((p) => (
                      <div
                        key={p.sku}
                        title={p.colorName ?? ""}
                        style={{
                          width: 18, height: 18, borderRadius: "50%",
                          background: p.colorHex ?? "#808080",
                          border: "1px solid rgba(255,255,255,0.14)",
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ color: "#4b5563", fontSize: 12 }}>
          No supplier catalog data for this size.
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RingSizeChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tf, setTf] = useState<Tf>({ x: 0, y: 0, scale: 1 });
  const tfRef = useRef<Tf>(tf);
  const [selected, setSelected] = useState<RingData | null>(null);
  const selectedRef = useRef<RingData | null>(null);
  const [showCompass, setShowCompass] = useState(false);
  const homeRef = useRef<Tf>({ x: 0, y: 0, scale: 1 });
  const rafRef = useRef(0);

  const rings = useMemo(buildRings, []);

  // Keep refs in sync for event handlers that capture
  useEffect(() => { tfRef.current = tf; }, [tf]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Compute fit-to-screen
  const fitView = useCallback((): Tf => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 28;
    const scale = Math.min(
      (vw - pad * 2) / CHART_W,
      (vh - pad * 2) / CHART_H,
    );
    return { scale, x: (vw - CHART_W * scale) / 2, y: (vh - CHART_H * scale) / 2 };
  }, []);

  // Set initial fit
  useEffect(() => {
    const v = fitView();
    homeRef.current = v;
    setTf(v);
    tfRef.current = v;
  }, [fitView]);

  // Refit on resize/orientation
  useEffect(() => {
    const onResize = () => {
      const v = fitView();
      homeRef.current = v;
      setTf(v);
      tfRef.current = v;
      setSelected(null);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [fitView]);

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawChart(canvas, rings, tf, selected);
  }, [rings, tf, selected]);

  // Smooth animation
  const animateTo = useCallback((target: Tf) => {
    cancelAnimationFrame(rafRef.current);
    const from = { ...tfRef.current };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ANIM_MS);
      const e = easeIO(t);
      const next: Tf = {
        x: lerp(from.x, target.x, e),
        y: lerp(from.y, target.y, e),
        scale: lerp(from.scale, target.scale, e),
      };
      tfRef.current = next;
      setTf({ ...next });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // Zoom to ring — fills ~55% of the shorter viewport dimension
  const zoomToRing = useCallback((ring: RingData) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const targetScale = Math.min(
      (Math.min(vw, vh) * 0.55) / (ring.outerR * 2),
      22,
    );
    animateTo({
      scale: targetScale,
      x: vw / 2 - ring.cx * targetScale,
      y: vh / 2 - ring.cy * targetScale,
    });
  }, [animateTo]);

  // Hit test — returns ring under screen point
  const hitTest = useCallback((sx: number, sy: number): RingData | null => {
    const t = tfRef.current;
    const wx = (sx - t.x) / t.scale;
    const wy = (sy - t.y) / t.scale;
    let best: RingData | null = null;
    let bestD = Infinity;
    for (const ring of rings) {
      const d = Math.hypot(wx - ring.cx, wy - ring.cy);
      if (d < ring.outerR * 1.5 && d < bestD) { best = ring; bestD = d; }
    }
    return best;
  }, [rings]);

  const deselect = useCallback(() => {
    setSelected(null);
    animateTo(homeRef.current);
  }, [animateTo]);

  // ── Mouse pan / zoom ────────────────────────────────────────────────────────
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const didDragRef = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: tfRef.current.x, py: tfRef.current.y };
    didDragRef.current = false;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
    if (!didDragRef.current) return;
    cancelAnimationFrame(rafRef.current);
    const next: Tf = { ...tfRef.current, x: dragRef.current.px + dx, y: dragRef.current.py + dy };
    tfRef.current = next;
    setTf(next);
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const wasDrag = didDragRef.current;
    dragRef.current = null;
    if (!wasDrag) {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) {
        if (selected?.row === hit.row && selected?.col === hit.col) {
          deselect();
        } else {
          setSelected(hit);
          zoomToRing(hit);
        }
      } else {
        deselect();
      }
    }
  }, [hitTest, selected, deselect, zoomToRing]);

  // ── Wheel + touch: registered imperatively so { passive: false } works ────────
  const touchRef = useRef<{
    sx: number; sy: number; px: number; py: number;
    startDist: number; startScale: number;
    startMidX: number; startMidY: number;
    moved: boolean; t0: number;
  } | null>(null);

  // Store latest callbacks in refs so the one-time addEventListener closure stays fresh
  const hitTestRef = useRef(hitTest);
  const deselectRef = useRef(deselect);
  const zoomToRingRef = useRef(zoomToRing);
  useEffect(() => { hitTestRef.current = hitTest; }, [hitTest]);
  useEffect(() => { deselectRef.current = deselect; }, [deselect]);
  useEffect(() => { zoomToRingRef.current = zoomToRing; }, [zoomToRing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(rafRef.current);
      const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13;
      const cur = tfRef.current;
      const newScale = Math.max(0.08, Math.min(30, cur.scale * factor));
      const next: Tf = {
        scale: newScale,
        x: e.clientX - (e.clientX - cur.x) * (newScale / cur.scale),
        y: e.clientY - (e.clientY - cur.y) * (newScale / cur.scale),
      };
      tfRef.current = next;
      setTf({ ...next });
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      cancelAnimationFrame(rafRef.current);
      const cur = tfRef.current;
      if (e.touches.length === 1) {
        touchRef.current = {
          sx: e.touches[0].clientX, sy: e.touches[0].clientY,
          px: cur.x, py: cur.y,
          startDist: 0, startScale: cur.scale,
          startMidX: 0, startMidY: 0,
          moved: false, t0: Date.now(),
        };
      } else if (e.touches.length >= 2) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        touchRef.current = {
          sx: 0, sy: 0, px: cur.x, py: cur.y,
          startDist: Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY,
          ),
          startScale: cur.scale,
          startMidX: midX, startMidY: midY,
          moved: true, t0: Date.now(),
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchRef.current) return;
      const tc = touchRef.current;
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - tc.sx;
        const dy = e.touches[0].clientY - tc.sy;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) tc.moved = true;
        const next: Tf = { ...tfRef.current, x: tc.px + dx, y: tc.py + dy };
        tfRef.current = next;
        setTf({ ...next });
      } else if (e.touches.length >= 2) {
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const newScale = Math.max(0.08, Math.min(30, tc.startScale * (dist / tc.startDist)));
        const next: Tf = {
          scale: newScale,
          x: midX - (tc.startMidX - tc.px) * (newScale / tc.startScale),
          y: midY - (tc.startMidY - tc.py) * (newScale / tc.startScale),
        };
        tfRef.current = next;
        setTf({ ...next });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchRef.current) return;
      const tc = touchRef.current;
      const elapsed = Date.now() - tc.t0;
      if (!tc.moved && elapsed < 280 && e.changedTouches.length === 1) {
        const tx = e.changedTouches[0].clientX;
        const ty = e.changedTouches[0].clientY;
        const hit = hitTestRef.current(tx, ty);
        const sel = selectedRef.current;
        if (hit) {
          if (sel?.row === hit.row && sel?.col === hit.col) {
            deselectRef.current();
          } else {
            setSelected(hit);
            zoomToRingRef.current(hit);
          }
        } else {
          deselectRef.current();
        }
      }
      touchRef.current = null;
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, []); // register once — reads live state via refs

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", background: "#0E0F12", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: selected ? "default" : "grab", touchAction: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />

      {/* Title + hint */}
      {!selected && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", pointerEvents: "none", textAlign: "center" }}>
          <div style={{ color: "#374151", fontSize: 11 }}>Tap a ring to see details · Scroll/pinch to zoom · Drag to pan</div>
        </div>
      )}

      {/* Info panel */}
      {selected && (
        <InfoPanel ring={selected} onClose={deselect} />
      )}

      {/* AR Legend */}
      <div style={{
        position: "fixed", bottom: 56, left: "50%", transform: "translateX(-50%)",
        display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center",
        background: "rgba(13,17,28,0.88)", borderRadius: 10,
        padding: "6px 14px", border: "1px solid #1e2635",
        pointerEvents: "none",
      }}>
        {AR_LEGEND.map(({ label, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ fontSize: 10, color: "#6b7280" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Fit-chart button */}
      <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)" }}>
        <button
          onClick={deselect}
          style={{
            background: "rgba(31,41,55,0.9)", border: "1px solid #374151",
            borderRadius: 8, color: "#9ca3af", fontSize: 12,
            padding: "6px 16px", cursor: "pointer",
          }}
        >
          Fit chart
        </button>
      </div>

      {/* Hamburger nav */}
      <DraggablePill id="chart-compass" defaultPosition={{ x: 20, y: 20 }}>
        <button
          onClick={() => setShowCompass((v) => !v)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: 10,
            border: "1px solid #111", background: "#1f2937", color: "#d1d5db", cursor: "pointer",
          }}
          title="Open Navigation"
        >
          <IconHamburger size={18} />
        </button>
      </DraggablePill>

      {showCompass && <DraggableCompassNav onNavigate={() => setShowCompass(false)} />}

      {/* Supplier color refresh button — bottom right */}
      <div style={{ position: "fixed", bottom: 16, right: 12, zIndex: 50 }}>
        <SupplierColorRefreshButton compact />
      </div>
    </div>
  );
}
