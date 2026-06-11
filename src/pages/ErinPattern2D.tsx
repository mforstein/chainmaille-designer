// src/components/ErinPattern2D.tsx

import { DraggableCompassNav, DraggablePill } from "../App";
import ProjectSaveLoadButtons from "../components/ProjectSaveLoadButtons";
import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { IconHamburger, IconEraser, IconUndo, IconRedo } from "../components/icons/ToolIcons";
import { ToolBtn } from "../components/ui/ToolBtn";
import {
  getDeviceLimits,
  SAFE_DEFAULT,
  clampPersistedDims,
  clampAndPersist,
} from "../utils/limits";

const PALETTE_24 = [
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

const STORAGE_KEY = "erin2DPattern";
const IMAGE_SRC = "/braid-reference.jpeg";
const SETTINGS_URL = "/erin-pattern-settings.json";

const ErinPattern2D: React.FC = () => {
  const defaultSettings = {
    cols: 28,
    rows: 55,
    majorAxis: 21.8,
    minorAxis: 18.5,
    wireD: 6.8,
    spacingX: 24,
    spacingY: 22,
    offsetX: 23,
    offsetY: -2,
    rowOffsetX: -0.4,
    rowOffsetY: -0.2,
    scale: 1.0,
  };

  // --- Device caps & initial dims (persisted + clamped) ---
  const limits = getDeviceLimits();
  const initDims = useMemo(() => clampPersistedDims("erin", SAFE_DEFAULT), []);

  // 🧭 Geometry + transforms
  const [cols, setCols] = useState<number>(
    Number.isFinite(initDims.cols) ? initDims.cols : defaultSettings.cols,
  );
  const [rows, setRows] = useState<number>(
    Number.isFinite(initDims.rows) ? initDims.rows : defaultSettings.rows,
  );
  const [majorAxis, setMajorAxis] = useState(defaultSettings.majorAxis);
  const [minorAxis, setMinorAxis] = useState(defaultSettings.minorAxis);
  const [wireD, setWireD] = useState(defaultSettings.wireD);
  const [spacingX, setSpacingX] = useState(defaultSettings.spacingX);
  const [spacingY, setSpacingY] = useState(defaultSettings.spacingY);
  const [offsetX, setOffsetX] = useState(defaultSettings.offsetX);
  const [offsetY, setOffsetY] = useState(defaultSettings.offsetY);
  const [rowOffsetX, setRowOffsetX] = useState(defaultSettings.rowOffsetX);
  const [rowOffsetY, setRowOffsetY] = useState(defaultSettings.rowOffsetY);
  const [scale, setScale] = useState(defaultSettings.scale);

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [showCompass, setShowCompass] = useState(false);

  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panOrigRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 🖌️ Paint + layers
  const [showLines, setShowLines] = useState(false);
  const [showImage, setShowImage] = useState(true);
  const [paintActive, setPaintActive] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [isErasing, setIsErasing] = useState(false);
  const [cells, setCells] = useState<Map<string, string>>(new Map());
  const [isPainting, setIsPainting] = useState(false);

  // Refs always in sync — safe to read in event handlers that fire before React re-renders
  const cellsRef = useRef<Map<string, string>>(new Map());
  const isPaintingRef = useRef(false);   // isPainting state may be stale in rapid touch events
  const hasDraggedRef = useRef(false);   // true once the pointer has moved (drag vs tap)
  // Pointer Events: track active pointers by id for pinch-zoom detection
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // ↩ Undo / Redo
  const cellsHistoryRef = useRef<Map<string, string>[]>([new Map()]);
  const cellsHistoryIdxRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Deduplicates: skips push if snapshot is identical to the current history entry.
  // This makes it safe to call push from both touchEnd and onClick without double-counting.
  const pushCellsHistory = useCallback((snapshot: Map<string, string>) => {
    const history = cellsHistoryRef.current;
    const idx = cellsHistoryIdxRef.current;
    const current = history[idx];
    // Skip if unchanged
    if (current && current.size === snapshot.size) {
      let same = true;
      for (const [k, v] of snapshot) { if (current.get(k) !== v) { same = false; break; } }
      if (same) return;
    }
    const newHistory = history.slice(0, idx + 1);
    newHistory.push(new Map(snapshot));
    cellsHistoryRef.current = newHistory;
    cellsHistoryIdxRef.current = newHistory.length - 1;
    setCanUndo(newHistory.length > 1);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    const idx = cellsHistoryIdxRef.current;
    if (idx <= 0) return;
    const prevIdx = idx - 1;
    cellsHistoryIdxRef.current = prevIdx;
    const restored = new Map(cellsHistoryRef.current[prevIdx]);
    cellsRef.current = restored;
    setCells(restored);
    setCanUndo(prevIdx > 0);
    setCanRedo(true);
  }, []);

  const handleRedo = useCallback(() => {
    const idx = cellsHistoryIdxRef.current;
    const history = cellsHistoryRef.current;
    if (idx >= history.length - 1) return;
    const nextIdx = idx + 1;
    cellsHistoryIdxRef.current = nextIdx;
    const restored = new Map(history[nextIdx]);
    cellsRef.current = restored;
    setCells(restored);
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

  // 🎯 Hit detection
  const [showHitGrid, setShowHitGrid] = useState(false);
  const [hitRadiusFactor, setHitRadiusFactor] = useState(0.6);
  const [hitOffsetX, setHitOffsetX] = useState(0);
  const [hitOffsetY, setHitOffsetY] = useState(0);

  // 📏 Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const transformRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<HTMLDivElement | null>(null);

  // ✅ NEW: stable, untransformed container for coordinate math
  const outerWrapRef = useRef<HTMLDivElement | null>(null);

  const [imgDims, setImgDims] = useState({ w: 1920, h: 1080 });

  // ------------------------------
  // Load settings JSON
  // ------------------------------
  const loadSettingsJSON = async () => {
    try {
      const res = await fetch(SETTINGS_URL + `?v=${Date.now()}`);
      if (!res.ok) throw new Error("Settings not found");
      const data = await res.json();
      setCols(Number.isFinite(data.cols) ? data.cols : defaultSettings.cols);
      setRows(Number.isFinite(data.rows) ? data.rows : defaultSettings.rows);
      setMajorAxis(data.majorAxis ?? defaultSettings.majorAxis);
      setMinorAxis(data.minorAxis ?? defaultSettings.minorAxis);
      setWireD(data.wireD ?? defaultSettings.wireD);
      setSpacingX(data.spacingX ?? defaultSettings.spacingX);
      setSpacingY(data.spacingY ?? defaultSettings.spacingY);
      setOffsetX(data.offsetX ?? defaultSettings.offsetX);
      setOffsetY(data.offsetY ?? defaultSettings.offsetY);
      setRowOffsetX(data.rowOffsetX ?? defaultSettings.rowOffsetX);
      setRowOffsetY(data.rowOffsetY ?? defaultSettings.rowOffsetY);
      setScale(data.scale ?? defaultSettings.scale);
      setHitRadiusFactor(data.hitRadiusFactor ?? 0.6);
      setHitOffsetX(data.hitOffsetX ?? 0);
      setHitOffsetY(data.hitOffsetY ?? 0);
    } catch {
      console.warn("⚠️ Could not load JSON — using defaults");
    }
  };

  // When user edits rows/cols (text box, slider, buttons), always go through clampAndPersist:
  const onRowsChange = (n: number) => {
    const { rows: r, cols: c, clamped } = clampAndPersist("erin", n, cols);
    setRows(r);
    setCols(c);
    if (clamped) console.warn("Grid clamped to device limits for stability.");
  };

  const onColsChange = (n: number) => {
    const { rows: r, cols: c, clamped } = clampAndPersist("erin", rows, n);
    setRows(r);
    setCols(c);
    if (clamped) console.warn("Grid clamped to device limits for stability.");
  };

  useEffect(() => {
    loadSettingsJSON().then(() => {
      setPanX(0);
      setPanY(0);
      setZoom(1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional: belt-and-suspenders guard if something external sets state:
  useEffect(() => {
    const area = rows * cols;
    if (
      rows > limits.MAX_ROWS ||
      cols > limits.MAX_COLS ||
      area > limits.MAX_AREA
    ) {
      const { rows: r, cols: c } = clampAndPersist("erin", rows, cols);
      if (r !== rows) setRows(r);
      if (c !== cols) setCols(c);
    }
  }, [rows, cols, limits]);

  // ------------------------------
  // Image dimensions sync
  // ------------------------------
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const updateDims = () => {
      setImgDims({
        w: img.naturalWidth || 1920,
        h: img.naturalHeight || 1080,
      });
    };

    if (img.complete && img.naturalWidth > 0) updateDims();
    else img.addEventListener("load", updateDims);

    const safariRepaint = () => {
      if (!img.complete) return;
      img.style.display = "none";
      void img.offsetHeight;
      img.style.display = "block";
    };
    safariRepaint();

    return () => img.removeEventListener("load", updateDims);
  }, [showImage]);

  // ------------------------------
  // LocalStorage save / load
  // ------------------------------
  // Intentionally not loading cells from localStorage on mount — page starts blank on refresh.

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(Array.from(cells.entries())),
        );
      } catch {
        /* private mode / quota — ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [cells]);

  const clearAll = () => {
    if (window.confirm("Clear all painted cells?")) {
      const empty = new Map<string, string>();
      cellsRef.current = empty;
      setCells(empty);
      pushCellsHistory(empty);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  };

  // ------------------------------
  // Canvas Drawing
  // ------------------------------
  const drawCanvas = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, imgDims.w, imgDims.h);
    ctx.save();

    for (let r = 0; r < rows; r++) {
      const even = r % 2 === 0;
      const xOffset = rowOffsetX * spacingX;
      const yOffset = rowOffsetY * spacingY;

      for (let c = 0; c < cols; c++) {
        const cx = offsetX + c * spacingX + (even ? xOffset : -xOffset);
        const cy = offsetY + r * spacingY + (even ? yOffset : -yOffset);
        const key = `${r}-${c}`;
        const fill = cells.get(key);
        const rOuterX = majorAxis / 2;
        const rOuterY = minorAxis / 2;
        const rInnerX = Math.max(1, rOuterX - wireD / 2);
        const rInnerY = Math.max(1, rOuterY - wireD / 2);

        // Filled ring area
        if (fill) {
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rOuterX, rOuterY, 0, 0, Math.PI * 2);
          ctx.ellipse(cx, cy, rInnerX, rInnerY, 0, 0, Math.PI * 2, true);
          ctx.fill("evenodd");
        }

        // Ring outlines
        if (showLines) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rOuterX, rOuterY, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(cx, cy, rInnerX, rInnerY, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Optional hit grid
        if (showHitGrid) {
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = "#14b8a6";
          ctx.beginPath();
          ctx.arc(
            cx + hitOffsetX,
            cy + hitOffsetY,
            Math.min(rOuterX, rOuterY) * hitRadiusFactor,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  };

  type Erin2DProject = {
    type: "erin2d";
    version: 1;
    cells: [string, string][];
    settings: {
      cols: number;
      rows: number;
      majorAxis: number;
      minorAxis: number;
      wireD: number;
      spacingX: number;
      spacingY: number;
      offsetX: number;
      offsetY: number;
      rowOffsetX: number;
      rowOffsetY: number;
      scale: number;
      hitRadiusFactor: number;
      hitOffsetX: number;
      hitOffsetY: number;
      showLines: boolean;
      showImage: boolean;
    };
    view: {
      zoom: number;
      panX: number;
      panY: number;
    };
    metadata: {
      createdAt: number;
    };
  };

  const savePatternProject = (): Erin2DProject => {
    return {
      type: "erin2d",
      version: 1,
      cells: Array.from(cells.entries()),
      settings: {
        cols,
        rows,
        majorAxis,
        minorAxis,
        wireD,
        spacingX,
        spacingY,
        offsetX,
        offsetY,
        rowOffsetX,
        rowOffsetY,
        scale,
        hitRadiusFactor,
        hitOffsetX,
        hitOffsetY,
        showLines,
        showImage,
      },
      view: { zoom, panX, panY },
      metadata: { createdAt: Date.now() },
    };
  };

  const loadPatternProject = (data: any) => {
    if (!data || data.type !== "erin2d") {
      alert("❌ Not an Erin 2D project file");
      return;
    }
    if (!Array.isArray(data.cells)) {
      alert("❌ Invalid project (cells missing)");
      return;
    }

    const loaded = new Map<string, string>(data.cells);
    cellsRef.current = loaded;
    setCells(loaded);

    const s = data.settings ?? {};
    setCols(s.cols ?? cols);
    setRows(s.rows ?? rows);
    setMajorAxis(s.majorAxis ?? majorAxis);
    setMinorAxis(s.minorAxis ?? minorAxis);
    setWireD(s.wireD ?? wireD);
    setSpacingX(s.spacingX ?? spacingX);
    setSpacingY(s.spacingY ?? spacingY);
    setOffsetX(s.offsetX ?? offsetX);
    setOffsetY(s.offsetY ?? offsetY);
    setRowOffsetX(s.rowOffsetX ?? rowOffsetX);
    setRowOffsetY(s.rowOffsetY ?? rowOffsetY);
    setScale(s.scale ?? scale);

    setHitRadiusFactor(s.hitRadiusFactor ?? hitRadiusFactor);
    setHitOffsetX(s.hitOffsetX ?? hitOffsetX);
    setHitOffsetY(s.hitOffsetY ?? hitOffsetY);

    setShowLines(!!s.showLines);
    setShowImage(s.showImage !== false);

    const v = data.view ?? {};
    setZoom(v.zoom ?? 1);
    setPanX(v.panX ?? 0);
    setPanY(v.panY ?? 0);

    console.log("✅ Erin 2D project loaded");
  };

  // ------------------------------
  // Redraw effect (HiDPI + transparent)
  // ------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = imgDims.w;
    const logicalHeight = imgDims.h;

    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    ctx.translate(0.5, 0.5);

    drawCanvas(ctx);
  }, [
    rows,
    cols,
    cells,
    majorAxis,
    minorAxis,
    wireD,
    spacingX,
    spacingY,
    offsetX,
    offsetY,
    rowOffsetX,
    rowOffsetY,
    showLines,
    showHitGrid,
    hitRadiusFactor,
    hitOffsetX,
    hitOffsetY,
    imgDims.w,
    imgDims.h,
  ]);

  // ------------------------------
  // ✅ Keep latest values in refs to avoid stale closures (wheel/touch)
  // ------------------------------
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);

  useEffect(() => {
    zoomRef.current = zoom;
    panXRef.current = panX;
    panYRef.current = panY;
  }, [zoom, panX, panY]);

  // ------------------------------
  // ✅ Correct coordinate transform (fixes drift after zoom)
  // IMPORTANT:
  // - We must compute coords relative to an UNTRANSFORMED container.
  // - Do NOT use canvas.getBoundingClientRect() here because canvas is inside a scaled/translated layer.
  // ------------------------------
  const screenToCanvas = (clientX: number, clientY: number) => {
    const baseEl = outerWrapRef.current;
    if (!baseEl) return { x: 0, y: 0 };

    const rect = baseEl.getBoundingClientRect();

    // coords in base (untransformed) screen space
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;

    const z = Math.max(1e-6, zoomRef.current);
    const px = panXRef.current;
    const py = panYRef.current;

    // invert the CSS transform: translate(pan) then scale(zoom)
    const x = (cx - px) / z;
    const y = (cy - py) / z;

    return { x, y };
  };

  // ------------------------------
  // Force redraw helper (Safari fix)
  // ------------------------------
  const forceRedraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.willChange = "transform";
    canvas.style.transform = "translateZ(0)";
    void (canvas as unknown as HTMLElement).offsetHeight;
    canvas.style.transform = "";
    canvas.style.willChange = "";
  };

  // ------------------------------
  // Apply zoom + pan transforms
  // ------------------------------
  useEffect(() => {
    const el = transformRef.current;
    if (!el) return;

    const apply = () => {
      el.style.transformOrigin = "top left";
      el.style.transform = `translate(${Math.round(panX)}px, ${Math.round(
        panY,
      )}px) scale(${zoom})`;
    };

    apply();
    const id = requestAnimationFrame(apply);
    const onResize = () => requestAnimationFrame(apply);
    const onOrient = () => setTimeout(apply, 200);

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrient);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, [panX, panY, zoom]);

  // ------------------------------
  // Unified Pointer Events (mouse + touch + stylus — fires exactly once, no synthesized duplicates)
  // ------------------------------
  const lastDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(1);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      if (paintActive) {
        hasDraggedRef.current = false;
        isPaintingRef.current = true;
        setIsPainting(true);
      } else {
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panOrigRef.current = { x: panX, y: panY };
      }
      lastDist.current = null;
    } else if (activePointersRef.current.size === 2) {
      // Second pointer down: switch to pinch zoom, cancel any in-progress paint
      isPaintingRef.current = false;
      setIsPainting(false);
      panStartRef.current = null;
      const pts = [...activePointersRef.current.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      lastDist.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartZoom.current = zoomRef.current;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      // Pinch zoom
      const pts = [...activePointersRef.current.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (lastDist.current == null) {
        lastDist.current = dist;
        pinchStartZoom.current = zoomRef.current;
        return;
      }

      const nextZoom = Math.max(0.3, Math.min(5, pinchStartZoom.current * (dist / lastDist.current)));
      const baseEl = outerWrapRef.current;
      if (!baseEl) return;
      const rect = baseEl.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      const z = Math.max(1e-6, zoomRef.current);
      const worldX = (midX - panXRef.current) / z;
      const worldY = (midY - panYRef.current) / z;
      setZoom(nextZoom);
      setPanX(midX - worldX * nextZoom);
      setPanY(midY - worldY * nextZoom);
      return;
    }

    if (activePointersRef.current.size === 1) {
      if (paintActive && isPaintingRef.current) {
        hasDraggedRef.current = true;
        const { x, y } = screenToCanvas(e.clientX, e.clientY);
        const c = Math.round((x - offsetX) / spacingX);
        const r = Math.round((y - offsetY) / spacingY);
        if (r < 0 || r >= rows || c < 0 || c >= cols) return;
        const key = `${r}-${c}`;
        const next = new Map(cellsRef.current);
        if (isErasing) next.delete(key);
        else next.set(key, selectedColor);
        cellsRef.current = next;
        setCells(next);
      } else if (!paintActive && panStartRef.current) {
        setPanX(panOrigRef.current.x + (e.clientX - panStartRef.current.x));
        setPanY(panOrigRef.current.y + (e.clientY - panStartRef.current.y));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    const wasOnlyPointer = activePointersRef.current.size === 1;

    if (wasOnlyPointer && isPaintingRef.current) {
      if (!hasDraggedRef.current && paintActive) {
        // Tap: no drag happened — paint the cell under the lift point
        const { x, y } = screenToCanvas(e.clientX, e.clientY);
        const c = Math.round((x - offsetX) / spacingX);
        const r = Math.round((y - offsetY) / spacingY);
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          const key = `${r}-${c}`;
          const next = new Map(cellsRef.current);
          if (isErasing) next.delete(key);
          else next.set(key, selectedColor);
          cellsRef.current = next;
          setCells(next);
        }
      }
      pushCellsHistory(cellsRef.current);
    }

    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      lastDist.current = null;
    }
    if (activePointersRef.current.size === 0) {
      isPaintingRef.current = false;
      setIsPainting(false);
      panStartRef.current = null;
    }
  };

  // ------------------------------
  // ✅ Mouse Wheel Zoom (centered under cursor) — FIXED
  // Uses UNTRANSFORMED outerWrap rect; keeps cursor anchored correctly at any zoom/pan.
  // ------------------------------
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const baseEl = outerWrapRef.current;
    if (!baseEl) return;

    const rect = baseEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const z = Math.max(1e-6, zoomRef.current);
    const px = panXRef.current;
    const py = panYRef.current;

    const delta = -e.deltaY * 0.0015;
    const zoomFactor = 1 + delta;
    const nextZoom = Math.max(0.3, Math.min(5, z * zoomFactor));

    // world coordinate under cursor BEFORE zoom
    const worldX = (cx - px) / z;
    const worldY = (cy - py) / z;

    // choose new pan so that same world point stays under cursor AFTER zoom
    const newPanX = cx - worldX * nextZoom;
    const newPanY = cy - worldY * nextZoom;

    setZoom(nextZoom);
    setPanX(newPanX);
    setPanY(newPanY);
  };

  // ------------------------------
  // 💾 Save JSON (includes hit circle settings)
  // ------------------------------
  const saveSettingsJSON = () => {
    const settings = {
      cols,
      rows,
      majorAxis,
      minorAxis,
      wireD,
      spacingX,
      spacingY,
      offsetX,
      offsetY,
      rowOffsetX,
      rowOffsetY,
      scale,
      hitRadiusFactor,
      hitOffsetX,
      hitOffsetY,
    };

    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "erin-pattern-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // cells: Map<string, string> where value is the fill color hex
  const erinExportRings = useMemo(
    () => Array.from(cells.values()).map((hex) => ({ colorHex: hex })),
    [cells],
  );

  const erinBOMMeta = useMemo(
    () => ({
      title: "Erin 2D — Color BOM",
      supplier: "TRL",
      ringSizeLabel: `5/16"`,
      material: "Anodized Aluminum",
      packSize: 1500,
      background: "#0b1220",
      textColor: "#e5e7eb",
    }),
    [],
  );


  const handlePrint = () => {
    document.body.classList.add("printing");
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing");
      }, 500);
    }, 100);
  };

  // ------------------------------
  // Render
  // ------------------------------
  return (
    <>
      <div style={wrap}>
        {/* 🧰 TOOL PANEL */}
        <DraggablePill id="erin-toolbar" defaultPosition={{ x: 16, y: 16 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              alignItems: "center",
              padding: "10px 8px",
              background: "#0f172a",
              border: "1px solid #0b1020",
              borderRadius: 20,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
              maxHeight: "calc(100vh - 40px)",
              overflowY: "auto",
            }}
          >
            <ToolBtn title="Navigation Menu" active={showCompass}
              onClick={() => setShowCompass((v) => !v)}>
              <IconHamburger size={18} />
            </ToolBtn>
            <ToolBtn title="Back to Home" style={{ background: "#2563eb" }}
              onClick={(e) => { e.stopPropagation(); window.location.href = "/wovenrainbowsbyerin"; }}>
              🏠
            </ToolBtn>
            <ToolBtn title="Paint mode" active={paintActive}
              onClick={() => setPaintActive(true)}>
              🎨
            </ToolBtn>
            <ToolBtn title="Pan / move (drag to pan)" active={!paintActive}
              onClick={() => setPaintActive(false)}>
              ✋
            </ToolBtn>
            {paintActive && (
              <>
                <ToolBtn title="Eraser" active={isErasing}
                  onClick={() => setIsErasing((v) => !v)}>
                  <IconEraser size={18} />
                </ToolBtn>
                <ToolBtn title="Clear all painted cells" style={{ background: "#ef4444" }}
                  onClick={clearAll}>
                  🧹
                </ToolBtn>
              </>
            )}
            <div style={{ opacity: canUndo ? 1 : 0.35, pointerEvents: canUndo ? "auto" : "none" }}>
              <ToolBtn title="Undo (Ctrl+Z)" onClick={handleUndo}>
                <IconUndo size={18} />
              </ToolBtn>
            </div>
            <div style={{ opacity: canRedo ? 1 : 0.35, pointerEvents: canRedo ? "auto" : "none" }}>
              <ToolBtn title="Redo (Ctrl+Shift+Z)" onClick={handleRedo}>
                <IconRedo size={18} />
              </ToolBtn>
            </div>
          </div>
        </DraggablePill>

        {/* 🎨 COLOR PANEL */}
        <DraggablePill id="erin-colors" defaultPosition={{ x: 80, y: 16 }}>
          <div
            style={{
              padding: 8,
              background: "#0f172a",
              border: "1px solid #0b1020",
              borderRadius: 20,
            }}
          >
          <div
            title="Drag to move palette"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              height: 18,
              marginBottom: 6,
              borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              color: "#94a3b8",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              cursor: "grab",
              userSelect: "none",
            }}
          >
            <span style={{ fontSize: 10, opacity: 0.7 }}>⋮⋮</span>
            <span>COLORS</span>
            <span style={{ fontSize: 10, opacity: 0.7 }}>⋮⋮</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 4,
            }}
          >
            {PALETTE_24.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setIsErasing(false);
                  setSelectedColor(c);
                }}
                style={{
                  ...colorSwatch,
                  background: c,
                  outline:
                    selectedColor === c ? "2px solid #fff" : "1px solid #111",
                }}
              />
            ))}
          </div>
          </div>
        </DraggablePill>

        {/* ⚙️ CONTROL PANEL */}
        {showControls && (
          <div style={controlPanel}>
            {/* Columns (clamped + persisted) */}
            <div style={sliderRow}>
              <label style={sliderLabel}>Columns</label>
              <input
                type="number"
                value={Number(cols)}
                step={1}
                min={1}
                max={limits.MAX_COLS}
                onChange={(e) => onColsChange(Number(e.target.value))}
                style={numInput}
              />
            </div>

            {/* Rows (clamped + persisted) */}
            <div style={sliderRow}>
              <label style={sliderLabel}>Rows</label>
              <input
                type="number"
                value={Number(rows)}
                step={1}
                min={1}
                max={limits.MAX_ROWS}
                onChange={(e) => onRowsChange(Number(e.target.value))}
                style={numInput}
              />
            </div>

            {[
              ["Major Axis", majorAxis, setMajorAxis, 5, 150, 0.01],
              ["Minor Axis", minorAxis, setMinorAxis, 5, 150, 0.01],
              ["Wire Diameter", wireD, setWireD, 1, 60, 0.01],
              ["Spacing X", spacingX, setSpacingX, 5, 300, 0.01],
              ["Spacing Y", spacingY, setSpacingY, 5, 300, 0.01],
              ["Row Offset X", rowOffsetX, setRowOffsetX, -2, 2, 0.001],
              ["Row Offset Y", rowOffsetY, setRowOffsetY, -2, 2, 0.001],
              ["Offset X", offsetX, setOffsetX, -500, 500, 0.1],
              ["Offset Y", offsetY, setOffsetY, -500, 500, 0.1],
              ["Scale", scale, setScale, 0.1, 3, 0.001],
              ["Hit Radius", hitRadiusFactor, setHitRadiusFactor, 0.05, 1, 0.01],
              ["Hit Offset X", hitOffsetX, setHitOffsetX, -20, 20, 0.1],
              ["Hit Offset Y", hitOffsetY, setHitOffsetY, -20, 20, 0.1],
            ].map(([label, val, setter, min, max, step], idx) => (
              <div key={idx} style={sliderRow}>
                <label style={sliderLabel}>{label as string}</label>
                <input
                  type="number"
                  value={Number(val)}
                  step={Number(step)}
                  min={Number(min)}
                  max={Number(max)}
                  onChange={(e) =>
                    (setter as (n: number) => void)(Number(e.target.value))
                  }
                  style={numInput}
                />
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={saveSettingsJSON} style={smallToolBtn}>
                💾 Save
              </button>
              <button onClick={() => loadSettingsJSON()} style={smallToolBtnBlue}>
                🔄 Reload
              </button>
            </div>
          </div>
        )}

        {/* 🖼️ IMAGE + CANVAS (one unified interaction layer) */}
        <div style={outerWrap} ref={outerWrapRef}>
          <div
            ref={transformRef}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translate(${Math.round(panX)}px, ${Math.round(
                panY,
              )}px) scale(${zoom})`,
              transformOrigin: "top left",
              background: "transparent",
            }}
          >
            <div
              ref={interactionRef}
              style={{
                position: "absolute",
                inset: 0,
                touchAction: "none",
                cursor: paintActive ? "crosshair" : "grab",
                zIndex: 2,
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            >
              {showImage && (
                <img
                  ref={imgRef}
                  src={IMAGE_SRC}
                  alt="Reference"
                  style={{
                    ...staticImageStyle,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: `${imgDims.w}px`,
                    height: `${imgDims.h}px`,
                    objectFit: "contain",
                    zIndex: 1,
                  }}
                />
              )}

              <canvas
                ref={canvasRef}
                width={imgDims.w}
                height={imgDims.h}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  zIndex: 2,
                  backgroundColor: "transparent",
                  touchAction: "none",
                  cursor: paintActive ? "crosshair" : "grab",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {showCompass && (
        <DraggableCompassNav onNavigate={() => setShowCompass(false)} />
      )}
    </>
  );
};

// ------------------------------
// 💅 Styles
// ------------------------------
const wrap: React.CSSProperties = {
  width: "100%",
  height: "100vh",
  background: "transparent",
  overflow: "hidden",
  position: "relative",
  touchAction: "none",
};

const floatingPanel: React.CSSProperties = {
  background: "rgba(15,23,42,0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  padding: 8,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
};

const floatIconBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "none",
  color: "#fff",
  fontSize: 18,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const colorSwatch: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  cursor: "pointer",
};

const controlPanel: React.CSSProperties = {
  position: "fixed",
  top: 80,
  right: 20,
  background: "#fff",
  color: "#111",
  padding: 10,
  borderRadius: 10,
  maxHeight: "70vh",
  overflowY: "scroll",
  width: 280,
  zIndex: 40,
  boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
};

const sliderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
};

const sliderLabel: React.CSSProperties = {
  width: 120,
  fontWeight: 600,
  fontSize: 12,
};

const numInput: React.CSSProperties = {
  width: 70,
  border: "1px solid #ccc",
  borderRadius: 4,
  padding: "2px 4px",
  textAlign: "right",
};

const smallToolBtn: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#fff",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const smallToolBtnBlue: React.CSSProperties = {
  ...smallToolBtn,
  background: "#2563eb",
};

const outerWrap: React.CSSProperties = {
  position: "relative",
  flex: 1,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "transparent",
};

const staticImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  opacity: 1.0,
  pointerEvents: "none",
  background: "transparent",
};

export default ErinPattern2D;