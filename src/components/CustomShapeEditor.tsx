import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type BuiltinScaleShape,
  type CustomScaleShape,
  type CustomShapeSource,
  normalizePolygon,
  simplifyPolygon,
  traceImageToPolygon,
  traceImageDebugMask,
  rotatePolygon,
  safeShapeId,
  polygonToPath2D,
} from "../lib/customScaleShapes";

// Only the Standard scale (internally "leaf" — the elongated, pointed-both-
// ends silhouette of the physical Standard) is exposed to the user. Other
// built-ins stay in the type system for legacy data but aren't pickable.
const BUILTIN_OPTIONS: Array<{ shape: BuiltinScaleShape; label: string; emoji: string }> = [
  { shape: "leaf", label: "Standard", emoji: "💧" },
];

type Tab = CustomShapeSource;

interface Props {
  initial?: CustomScaleShape | null;
  /** Called when the user saves. `makeDefault` is true when they clicked the
   *  "Save & make default" button — the host should persist the shape's id as
   *  the application's default scale shape. */
  onSave: (shape: CustomScaleShape, makeDefault: boolean) => void;
  onCancel: () => void;
}

export default function CustomShapeEditor({ initial, onSave, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>(initial?.source ?? "image");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "✨");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [error, setError] = useState<string | null>(null);

  // Image-source state
  const [imagePolygon, setImagePolygon] = useState<Array<[number, number]> | null>(
    initial?.source === "image" ? (initial.polygon ?? null) : null,
  );
  const [imageHoles, setImageHoles] = useState<Array<Array<[number, number]>>>(
    initial?.source === "image" ? (initial.holes ?? []) : [],
  );
  // `null` means "auto-detect"; a number overrides the auto-picked value.
  const [thresholdOverride, setThresholdOverride] = useState<number | null>(null);
  // Last threshold the library picked (auto). Displayed in the UI.
  const [autoThresholdHint, setAutoThresholdHint] = useState<number | null>(null);
  // `null` means "auto-detect"; a boolean overrides.
  const [invertOverride, setInvertOverride] = useState<boolean | null>(null);
  const [autoInvertHint, setAutoInvertHint] = useState<boolean | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [tracing, setTracing] = useState(false);
  const [showMask, setShowMask] = useState(false);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);

  // Working canvas for the image-source flow: the user can paint over regions
  // to exclude them BEFORE thresholding (handy for 3D-lit photos where a
  // single luminance cutoff can't separate shadow from background).
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eraseFillRef = useRef<string>("#000000");
  const [workVersion, setWorkVersion] = useState(0); // bumps when canvas mutates
  const [hasWorkCanvas, setHasWorkCanvas] = useState(false);
  const [brushPx, setBrushPx] = useState(18);
  const [brushMode, setBrushMode] = useState<"erase" | "restore">("erase");

  const WORK_SIZE = 280;

  // Sample perimeter colour from a canvas (median of the 4% border band).
  const sampleBackgroundColor = (cvs: HTMLCanvasElement): string => {
    const ctx = cvs.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "#000000";
    const w = cvs.width;
    const h = cvs.height;
    const { data } = ctx.getImageData(0, 0, w, h);
    const samples: Array<[number, number, number]> = [];
    const band = Math.max(1, Math.round(Math.min(w, h) * 0.04));
    const push = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < band || x >= w - band || y < band || y >= h - band) push(x, y);
      }
    }
    if (!samples.length) return "#000000";
    const med = (idx: number) => {
      const arr = samples.map((s) => s[idx]).sort((a, b) => a - b);
      return arr[Math.floor(arr.length / 2)];
    };
    const r = med(0), g = med(1), b = med(2);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Build the original + work canvases when a file is uploaded.
  const loadImageIntoCanvases = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      let cw = WORK_SIZE;
      let ch = WORK_SIZE;
      if (aspect > 1) ch = Math.max(60, Math.round(WORK_SIZE / aspect));
      else cw = Math.max(60, Math.round(WORK_SIZE * aspect));

      const original = document.createElement("canvas");
      original.width = cw;
      original.height = ch;
      const octx = original.getContext("2d");
      octx?.drawImage(img, 0, 0, cw, ch);
      originalCanvasRef.current = original;
      eraseFillRef.current = sampleBackgroundColor(original);

      // The visible canvas is created by React. Wait a tick so the ref is set,
      // then copy the original into it.
      requestAnimationFrame(() => {
        const work = workCanvasRef.current;
        if (work) {
          work.width = cw;
          work.height = ch;
          const wctx = work.getContext("2d");
          wctx?.drawImage(original, 0, 0);
        }
        setHasWorkCanvas(true);
        setWorkVersion((v) => v + 1);
      });
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    };
    img.onerror = () => {
      setError("Couldn't load that image. Try JPG or PNG.");
      setTimeout(() => URL.revokeObjectURL(url), 100);
    };
    img.src = url;
  };

  const paintAt = (clientX: number, clientY: number) => {
    const cvs = workCanvasRef.current;
    const original = originalCanvasRef.current;
    if (!cvs || !original) return;
    const rect = cvs.getBoundingClientRect();
    const sx = (clientX - rect.left) * (cvs.width / rect.width);
    const sy = (clientY - rect.top) * (cvs.height / rect.height);
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const r = Math.max(2, brushPx * (cvs.width / rect.width) / 2);
    if (brushMode === "erase") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = eraseFillRef.current;
      ctx.fill();
      ctx.restore();
    } else {
      // Restore: clip a circle and redraw the original beneath it.
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(original, 0, 0);
      ctx.restore();
    }
    setWorkVersion((v) => v + 1);
  };

  const resetMask = () => {
    const cvs = workCanvasRef.current;
    const original = originalCanvasRef.current;
    if (!cvs || !original) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.drawImage(original, 0, 0);
    setWorkVersion((v) => v + 1);
  };

  // Freehand state
  const [freehandPoints, setFreehandPoints] = useState<Array<[number, number]> | null>(
    initial?.source === "freehand" ? (initial.polygon ?? null) : null,
  );

  // Rotation (degrees, 0.5° resolution). Applied to image / freehand polygons.
  const [rotationDeg, setRotationDeg] = useState(0);

  // Base state. Default fallback is the Standard ("leaf") almond/lancet
  // shape — never teardrop. Per Erin (2026-05-31): the only default
  // anywhere in the app is the Standard shape.
  const [baseShape, setBaseShape] = useState<BuiltinScaleShape>(
    initial?.source === "base" ? (initial.baseShape ?? "leaf") : "leaf",
  );

  const previewPolygon = useMemo<Array<[number, number]> | null>(() => {
    const raw = tab === "image" ? imagePolygon : tab === "freehand" ? freehandPoints : null;
    if (!raw) return null;
    return rotationDeg ? rotatePolygon(raw, rotationDeg) : raw;
  }, [tab, imagePolygon, freehandPoints, rotationDeg]);

  const previewHoles = useMemo<Array<Array<[number, number]>>>(() => {
    if (tab !== "image" || !imageHoles.length) return [];
    return rotationDeg
      ? imageHoles.map((h) => rotatePolygon(h, rotationDeg))
      : imageHoles;
  }, [tab, imageHoles, rotationDeg]);

  // Re-trace when threshold, polarity, or the user's paint-edits change.
  useEffect(() => {
    if (tab !== "image" || !imageFile) return;
    // Prefer the user-edited work canvas; fall back to the raw file before
    // the canvas has been populated.
    const src: File | HTMLCanvasElement | null =
      hasWorkCanvas && workCanvasRef.current
        ? workCanvasRef.current
        : imageFile;
    if (!src) return;
    let cancelled = false;
    setTracing(true);
    setError(null);

    const traceOpts = {
      ...(thresholdOverride !== null ? { threshold: thresholdOverride } : {}),
      ...(invertOverride !== null ? { invert: invertOverride } : {}),
    };

    const run = async () => {
      try {
        const res = await traceImageToPolygon(src, traceOpts);
        if (cancelled) return;
        setImagePolygon(res.polygon);
        setImageHoles(res.holes ?? []);
        if (invertOverride === null) setAutoInvertHint(res.invertUsed);
        if (thresholdOverride === null) setAutoThresholdHint(res.thresholdUsed);
        if (showMask) {
          traceImageDebugMask(src, traceOpts)
            .then((url) => !cancelled && setMaskUrl(url))
            .catch(() => {});
        }
        setTracing(false);
      } catch (err: any) {
        if (cancelled) return;
        if (invertOverride === null) {
          try {
            const fallbackInvert = !(autoInvertHint ?? false);
            const res = await traceImageToPolygon(src, {
              ...traceOpts,
              invert: fallbackInvert,
            });
            if (cancelled) return;
            setImagePolygon(res.polygon);
            setImageHoles(res.holes ?? []);
            setAutoInvertHint(res.invertUsed);
            if (thresholdOverride === null) setAutoThresholdHint(res.thresholdUsed);
            setTracing(false);
            return;
          } catch {
            /* fall through */
          }
        }
        setError(
          (err?.message ?? String(err)) +
            " Try adjusting the threshold, toggling Invert, or erasing background with the brush.",
        );
        setImagePolygon(null);
        if (showMask) {
          traceImageDebugMask(src, traceOpts)
            .then((url) => !cancelled && setMaskUrl(url))
            .catch(() => {});
        }
        setTracing(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    imageFile,
    hasWorkCanvas,
    workVersion,
    thresholdOverride,
    invertOverride,
    showMask,
  ]);

  const handleFile = (file: File | null) => {
    setImageFile(file);
    setInvertOverride(null);     // re-auto-detect polarity for the new image
    setAutoInvertHint(null);
    setThresholdOverride(null);  // and re-auto-tune threshold
    setAutoThresholdHint(null);
    setMaskUrl(null);
    setRotationDeg(0);
    setHasWorkCanvas(false);
    if (!file) {
      setImagePolygon(null);
      originalCanvasRef.current = null;
      return;
    }
    loadImageIntoCanvases(file);
  };

  const handleSave = (makeDefault: boolean = false) => {
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Give it a name.");
      return;
    }
    const e = emoji.trim() || "✨";
    const now = Date.now();
    const baseEntry: Partial<CustomScaleShape> = {
      id: initial?.id ?? safeShapeId(),
      emoji: e,
      label: trimmed,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };

    if (tab === "base") {
      onSave(
        {
          ...(baseEntry as any),
          source: "base",
          baseShape,
        },
        makeDefault,
      );
      return;
    }
    const raw = tab === "image" ? imagePolygon : freehandPoints;
    if (!raw || raw.length < 3) {
      setError(
        tab === "image"
          ? "Upload an image and wait for the trace to finish."
          : "Draw a closed shape first.",
      );
      return;
    }
    // Bake the rotation into the saved polygon so renderers don't need to know.
    const poly = rotationDeg ? rotatePolygon(raw, rotationDeg) : raw;
    const bakedHoles =
      tab === "image" && imageHoles.length
        ? rotationDeg
          ? imageHoles.map((h) => rotatePolygon(h, rotationDeg))
          : imageHoles
        : undefined;
    onSave(
      {
        ...(baseEntry as any),
        source: tab,
        polygon: poly,
        ...(bakedHoles ? { holes: bakedHoles } : {}),
      },
      makeDefault,
    );
  };

  // Portal to <body> so the modal lays out against the viewport, NOT against
  // the floating control panel it's nested under. The panel-zoom feature gives
  // DraggablePill a CSS transform, which would otherwise make this fixed/inset:0
  // modal position relative to that panel (collapsing it into the panel's box).
  // Rendering through a portal gives the custom-shape editor its own dialog.
  return createPortal(
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100000,
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "92vh",
          background: "#0f172a",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 16,
          color: "#e5e7eb",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <strong style={{ fontSize: 16 }}>
            {initial ? "Edit scale shape" : "Add custom scale shape"}
          </strong>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable middle */}
        <div
          style={{
            overflowY: "auto",
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {([
            { id: "image", label: "🖼 Image" },
            { id: "freehand", label: "✏️ Draw" },
            { id: "base", label: "📐 Base shape" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setError(null);
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 8,
                border:
                  tab === t.id
                    ? "1px solid rgba(59,130,246,0.6)"
                    : "1px solid rgba(255,255,255,0.10)",
                background: tab === t.id ? "rgba(37,99,235,0.25)" : "transparent",
                color: tab === t.id ? "#f9fafb" : "#9ca3af",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: tab === t.id ? 700 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Source-specific UI */}
        <div style={{ display: "grid", gap: 10 }}>
          {tab === "image" && (
            <ImageTab
              onFile={handleFile}
              file={imageFile}
              thresholdOverride={thresholdOverride}
              onThresholdOverride={setThresholdOverride}
              autoThresholdHint={autoThresholdHint}
              invertOverride={invertOverride}
              onInvertOverride={setInvertOverride}
              autoInvertHint={autoInvertHint}
              tracing={tracing}
              polygon={imagePolygon}
              holes={imageHoles}
              showMask={showMask}
              onShowMask={setShowMask}
              maskUrl={maskUrl}
              workCanvasRef={workCanvasRef}
              hasWorkCanvas={hasWorkCanvas}
              workSize={WORK_SIZE}
              brushPx={brushPx}
              onBrushPx={setBrushPx}
              brushMode={brushMode}
              onBrushMode={setBrushMode}
              onPaintAt={paintAt}
              onResetMask={resetMask}
              rotationDeg={rotationDeg}
            />
          )}
          {tab === "freehand" && (
            <FreehandTab
              points={freehandPoints}
              onPoints={setFreehandPoints}
            />
          )}
          {tab === "base" && (
            <BaseTab baseShape={baseShape} onBaseShape={setBaseShape} />
          )}
        </div>

        {/* Preview */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: 12,
            minHeight: 140,
          }}
        >
          <ShapePreview
            polygon={previewPolygon}
            holes={previewHoles}
            baseShape={tab === "base" ? baseShape : null}
          />
        </div>

        {/* Rotation slider — only meaningful for image/freehand polygons. */}
        {tab !== "base" && (
          <div style={{ display: "grid", gap: 4 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 12,
                color: "#9ca3af",
              }}
            >
              <span>Rotation</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#cbd5e1" }}>
                  {rotationDeg.toFixed(1)}°
                </span>
                <button
                  type="button"
                  onClick={() => setRotationDeg(0)}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.14)",
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 6,
                  }}
                  title="Reset to 0°"
                >
                  Reset
                </button>
              </span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={0.5}
              value={rotationDeg}
              onChange={(e) => setRotationDeg(parseFloat(e.target.value))}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {[-0.5, -0.1, +0.1, +0.5].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() =>
                    setRotationDeg((v) =>
                      Math.max(-180, Math.min(180, +(v + step).toFixed(1))),
                    )
                  }
                  style={{
                    flex: 1,
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "transparent",
                    color: "#cbd5e1",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {step > 0 ? `+${step}°` : `${step}°`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Title + emoji */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={4}
            placeholder="✨"
            aria-label="Emoji"
            style={{
              width: 56,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#f8fafc",
              fontSize: 18,
              textAlign: "center",
            }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={28}
            placeholder="Name your shape"
            aria-label="Name"
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#f8fafc",
              fontSize: 14,
            }}
          />
        </div>

        {error && (
          <div
            style={{
              color: "#fca5a5",
              fontSize: 12,
              background: "rgba(127,29,29,0.3)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              padding: 8,
            }}
          >
            {error}
          </div>
        )}
        </div>{/* end scrollable middle */}

        {/* Sticky footer */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "12px 16px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "#0f172a",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "#cbd5e1",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "#f9fafb",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {initial ? "Save changes" : "Add to menu"}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            title="Save and use this as the default scale shape on every new session"
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(37,99,235,0.95)",
              color: "#f9fafb",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {initial ? "Save & make default" : "Add & make default"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------

function ImageTab(props: {
  onFile: (f: File | null) => void;
  file: File | null;
  thresholdOverride: number | null;
  onThresholdOverride: (v: number | null) => void;
  autoThresholdHint: number | null;
  invertOverride: boolean | null;
  onInvertOverride: (b: boolean | null) => void;
  autoInvertHint: boolean | null;
  tracing: boolean;
  polygon: Array<[number, number]> | null;
  holes: Array<Array<[number, number]>>;
  showMask: boolean;
  onShowMask: (b: boolean) => void;
  maskUrl: string | null;
  workCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  hasWorkCanvas: boolean;
  workSize: number;
  brushPx: number;
  onBrushPx: (n: number) => void;
  brushMode: "erase" | "restore";
  onBrushMode: (m: "erase" | "restore") => void;
  onPaintAt: (clientX: number, clientY: number) => void;
  onResetMask: () => void;
  rotationDeg: number;
}) {
  const {
    onFile,
    file,
    thresholdOverride,
    onThresholdOverride,
    autoThresholdHint,
    invertOverride,
    onInvertOverride,
    autoInvertHint,
    tracing,
    polygon,
    holes,
    showMask,
    onShowMask,
    maskUrl,
    workCanvasRef,
    hasWorkCanvas,
    workSize,
    brushPx,
    onBrushPx,
    brushMode,
    onBrushMode,
    onPaintAt,
    onResetMask,
    rotationDeg,
  } = props;
  const paintingRef = useRef(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Redraw the polygon overlay whenever the polygon, holes, or rotation change.
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    const work = workCanvasRef.current;
    if (!overlay || !work) return;
    if (overlay.width !== work.width || overlay.height !== work.height) {
      overlay.width = work.width;
      overlay.height = work.height;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!polygon || polygon.length < 3) return;

    const w = overlay.width;
    const h = overlay.height;
    // The traced polygon is normalised so its bbox fits within a unit square
    // centred at (0,0). Place it back over the image at the polygon's bbox
    // center — which, by construction of the trace, is the centroid of the
    // foreground mask. Scale by min(w,h) to fill most of the canvas.
    const scale = Math.min(w, h) * 0.95;
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const place = (p: [number, number]): [number, number] => {
      const rx = p[0] * cos - p[1] * sin;
      const ry = p[0] * sin + p[1] * cos;
      return [w / 2 + rx * scale, h / 2 + ry * scale];
    };

    const drawPath = (poly: Array<[number, number]>) => {
      const path = new Path2D();
      const [x0, y0] = place(poly[0]);
      path.moveTo(x0, y0);
      for (let i = 1; i < poly.length; i++) {
        const [x, y] = place(poly[i]);
        path.lineTo(x, y);
      }
      path.closePath();
      return path;
    };

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(34,197,94,0.95)";
    ctx.fillStyle = "rgba(34,197,94,0.18)";
    const outer = drawPath(polygon);
    const combined = new Path2D();
    combined.addPath(outer);
    for (const hole of holes) {
      if (hole.length >= 3) combined.addPath(drawPath(hole));
    }
    ctx.fill(combined, "evenodd");
    ctx.stroke(outer);
    ctx.strokeStyle = "rgba(244,114,182,0.95)"; // pink for holes
    for (const hole of holes) {
      if (hole.length >= 3) ctx.stroke(drawPath(hole));
    }
  }, [polygon, holes, rotationDeg, workCanvasRef]);

  // The effective values currently in play.
  const effectiveInvert =
    invertOverride !== null ? invertOverride : (autoInvertHint ?? false);
  const effectiveThreshold =
    thresholdOverride !== null
      ? thresholdOverride
      : (autoThresholdHint ?? 0.5);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px dashed rgba(255,255,255,0.20)",
          background: "rgba(255,255,255,0.03)",
          color: "#cbd5e1",
          cursor: "pointer",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        {file ? `📎 ${file.name}` : "Upload an image (JPG / PNG / GIF)"}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
      </label>

      {/* Editable image canvas + brush */}
      {file && (
        <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: workSize,
            }}
          >
            <canvas
              ref={workCanvasRef}
              width={workSize}
              height={workSize}
              onPointerDown={(e) => {
                paintingRef.current = true;
                (e.target as Element).setPointerCapture?.(e.pointerId);
                onPaintAt(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (paintingRef.current) onPaintAt(e.clientX, e.clientY);
              }}
              onPointerUp={() => (paintingRef.current = false)}
              onPointerCancel={() => (paintingRef.current = false)}
              style={{
                width: "100%",
                display: "block",
                background: "#0b1220",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8,
                touchAction: "none",
                cursor: hasWorkCanvas ? "crosshair" : "default",
              }}
            />
            <canvas
              ref={overlayCanvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                borderRadius: 8,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              maxWidth: workSize,
            }}
          >
            <button
              type="button"
              onClick={() => onBrushMode("erase")}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.14)",
                background: brushMode === "erase" ? "rgba(239,68,68,0.7)" : "transparent",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: brushMode === "erase" ? 700 : 400,
              }}
              title="Paint over background / highlights with the sampled background colour"
            >
              🧽 Erase
            </button>
            <button
              type="button"
              onClick={() => onBrushMode("restore")}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.14)",
                background:
                  brushMode === "restore" ? "rgba(37,99,235,0.7)" : "transparent",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: brushMode === "restore" ? 700 : 400,
              }}
              title="Restore original pixels in this region"
            >
              ↩︎ Restore
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>Size</span>
              <input
                type="range"
                min={4}
                max={80}
                step={1}
                value={brushPx}
                onChange={(e) => onBrushPx(parseInt(e.target.value, 10))}
                style={{ flex: 1 }}
              />
              <span style={{ color: "#cbd5e1", fontSize: 11, width: 24, textAlign: "right" }}>
                {brushPx}
              </span>
            </div>
            <button
              type="button"
              onClick={onResetMask}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent",
                color: "#9ca3af",
                cursor: "pointer",
                fontSize: 11,
              }}
              title="Discard brush edits and restore the full image"
            >
              Reset
            </button>
          </div>
          <div style={{ color: "#64748b", fontSize: 11 }}>
            Paint over highlights, shadows, or background you want excluded
            before thresholding.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
          <span style={{ color: "#9ca3af" }}>
            Threshold
            {thresholdOverride === null && autoThresholdHint !== null && (
              <span style={{ color: "#64748b", marginLeft: 6 }}>(auto)</span>
            )}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#cbd5e1" }}>{effectiveThreshold.toFixed(2)}</span>
            {thresholdOverride !== null && (
              <button
                type="button"
                onClick={() => onThresholdOverride(null)}
                title="Auto-tune threshold from image"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 6,
                }}
              >
                Auto
              </button>
            )}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effectiveThreshold}
          onChange={(e) => onThresholdOverride(parseFloat(e.target.value))}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "#cbd5e1",
            fontSize: 12,
            flex: 1,
          }}
        >
          <input
            type="checkbox"
            checked={effectiveInvert}
            onChange={(e) => onInvertOverride(e.target.checked)}
          />
          Invert (treat dark pixels as the shape)
          {invertOverride === null && autoInvertHint !== null && (
            <span style={{ color: "#64748b", fontSize: 11 }}>(auto)</span>
          )}
        </label>
        {invertOverride !== null && (
          <button
            type="button"
            onClick={() => onInvertOverride(null)}
            title="Auto-pick polarity from image"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 6,
            }}
          >
            Auto
          </button>
        )}
      </div>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          color: "#cbd5e1",
          fontSize: 12,
        }}
      >
        <input
          type="checkbox"
          checked={showMask}
          onChange={(e) => onShowMask(e.target.checked)}
        />
        Show detected mask
      </label>
      {showMask && maskUrl && (
        <img
          src={maskUrl}
          alt="Detected foreground mask"
          style={{
            width: "100%",
            maxHeight: 180,
            objectFit: "contain",
            background: "#1f2937",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
          }}
        />
      )}
      <div style={{ color: "#9ca3af", fontSize: 11 }}>
        {tracing
          ? "Tracing…"
          : polygon
            ? `Traced ${polygon.length} points.`
            : "Pick an image to trace its outline."}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FreehandTab(props: {
  points: Array<[number, number]> | null;
  onPoints: (p: Array<[number, number]> | null) => void;
}) {
  const { points, onPoints } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const rawRef = useRef<Array<[number, number]>>([]);

  const SIZE = 280;

  const redraw = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (points && points.length > 1) {
      ctx.strokeStyle = "#60a5fa";
      ctx.fillStyle = "rgba(59,130,246,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(points[0][0] * SIZE + SIZE / 2, points[0][1] * SIZE + SIZE / 2);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(
          points[i][0] * SIZE + SIZE / 2,
          points[i][1] * SIZE + SIZE / 2,
        );
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = "#64748b";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Click and drag to draw the outline", SIZE / 2, SIZE / 2);
    }
  };

  useEffect(() => {
    redraw();
  }, [points]);

  const localPt = (e: React.PointerEvent) => {
    const cvs = canvasRef.current;
    if (!cvs) return null;
    const rect = cvs.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as [number, number];
  };

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={(e) => {
          const pt = localPt(e);
          if (!pt) return;
          drawingRef.current = true;
          rawRef.current = [pt];
          onPoints(null);
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return;
          const pt = localPt(e);
          if (!pt) return;
          rawRef.current.push(pt);
          // draw raw stroke directly for snappy feedback
          const cvs = canvasRef.current;
          const ctx = cvs?.getContext("2d");
          if (!ctx || rawRef.current.length < 2) return;
          const [a, b] = [
            rawRef.current[rawRef.current.length - 2],
            rawRef.current[rawRef.current.length - 1],
          ];
          ctx.strokeStyle = "#60a5fa";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          const raw = rawRef.current;
          if (raw.length < 3) {
            onPoints(null);
            return;
          }
          const normalized = normalizePolygon(raw).map(
            ([x, y]) => [x, y] as [number, number],
          );
          const simplified = simplifyPolygon(normalized, 0.01);
          onPoints(simplified);
        }}
        style={{
          background: "#0b1220",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          touchAction: "none",
          cursor: "crosshair",
        }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            rawRef.current = [];
            onPoints(null);
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "transparent",
            color: "#cbd5e1",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BaseTab(props: {
  baseShape: BuiltinScaleShape;
  onBaseShape: (s: BuiltinScaleShape) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ color: "#9ca3af", fontSize: 12 }}>
        Use one of the built-in geometries with your own name + emoji. The shape
        renders exactly like the base; only the menu entry differs.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {BUILTIN_OPTIONS.map((o) => {
          const active = props.baseShape === o.shape;
          return (
            <button
              key={o.shape}
              type="button"
              onClick={() => props.onBaseShape(o.shape)}
              style={{
                flex: "1 1 100px",
                padding: "8px 10px",
                borderRadius: 10,
                border: active
                  ? "1px solid rgba(59,130,246,0.7)"
                  : "1px solid rgba(255,255,255,0.10)",
                background: active ? "rgba(37,99,235,0.25)" : "transparent",
                color: "#e5e7eb",
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>{o.emoji}</span>
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ShapePreview(props: {
  polygon: Array<[number, number]> | null;
  holes?: Array<Array<[number, number]>>;
  baseShape: BuiltinScaleShape | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const W = 140;
  const H = 140;

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);

    if (props.polygon && props.polygon.length >= 3) {
      const sw = W * 0.85;
      const sh = H * 0.85;
      const outer = polygonToPath2D(props.polygon, sw, sh);
      // Build a combined path that includes holes; fill with evenodd so the
      // holes punch through.
      const combined = new Path2D();
      combined.addPath(outer);
      for (const hole of props.holes ?? []) {
        combined.addPath(polygonToPath2D(hole, sw, sh));
      }
      ctx.fillStyle = "#60a5fa";
      ctx.strokeStyle = "#0b1220";
      ctx.lineWidth = 1.5;
      ctx.fill(combined, "evenodd");
      ctx.stroke(outer);
      for (const hole of props.holes ?? []) {
        ctx.stroke(polygonToPath2D(hole, sw, sh));
      }
    } else if (props.baseShape) {
      // Render a rough preview of the base shape
      const w = W * 0.7;
      const h = H * 0.85;
      const halfW = w / 2;
      const topY = -h / 2;
      const tipY = h / 2;
      ctx.fillStyle = "#60a5fa";
      ctx.beginPath();
      switch (props.baseShape) {
        case "kite":
          ctx.moveTo(0, topY);
          ctx.lineTo(halfW * 0.96, topY + h * 0.2);
          ctx.lineTo(halfW * 0.56, topY + h * 0.78);
          ctx.lineTo(0, tipY);
          ctx.lineTo(-halfW * 0.56, topY + h * 0.78);
          ctx.lineTo(-halfW * 0.96, topY + h * 0.2);
          break;
        case "round":
          ctx.moveTo(0, topY);
          ctx.bezierCurveTo(halfW, topY, halfW * 1.05, h * 0.0, 0, tipY);
          ctx.bezierCurveTo(-halfW * 1.05, h * 0.0, -halfW, topY, 0, topY);
          break;
        case "leaf":
          ctx.moveTo(0, topY);
          ctx.bezierCurveTo(halfW * 0.95, h * -0.42, halfW * 1.05, 0, halfW * 0.34, topY + h * 0.76);
          ctx.bezierCurveTo(halfW * 0.18, topY + h * 0.9, halfW * 0.08, topY + h * 0.96, 0, tipY);
          ctx.bezierCurveTo(-halfW * 0.08, topY + h * 0.96, -halfW * 0.18, topY + h * 0.9, -halfW * 0.34, topY + h * 0.76);
          ctx.bezierCurveTo(-halfW * 1.05, 0, -halfW * 0.95, h * -0.42, 0, topY);
          break;
        default:
          ctx.moveTo(0, topY);
          ctx.bezierCurveTo(halfW, h * -0.34, halfW, 0, 0, tipY);
          ctx.bezierCurveTo(-halfW, 0, -halfW, h * -0.34, 0, topY);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#0b1220";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = "#475569";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Preview", 0, 0);
    }
    ctx.restore();
  }, [props.polygon, props.baseShape, props.holes]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ background: "transparent" }}
    />
  );
}
