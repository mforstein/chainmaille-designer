// src/components/ErinPattern2D.tsx
import React, { useState, useEffect, useRef } from "react";

const PALETTE_24 = [
  "#000000", "#1f2937", "#6b7280", "#9ca3af", "#ffffff",
  "#991b1b", "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#0ea5e9", "#2563eb",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#f973c5", "#7c2d12"
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

  // 🧭 Geometry + transforms
  const [cols, setCols] = useState(defaultSettings.cols);
  const [rows, setRows] = useState(defaultSettings.rows);
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
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panOrigRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 🖌️ Paint + layers
  const [showLines, setShowLines] = useState(true);
  const [showImage, setShowImage] = useState(true);
  const [paintActive, setPaintActive] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [isErasing, setIsErasing] = useState(false);
  const [cells, setCells] = useState<Map<string, string>>(new Map());
  const [isPainting, setIsPainting] = useState(false);

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
  const [imgDims, setImgDims] = useState({ w: 1920, h: 1080 });

  // ------------------------------
  // Load settings JSON
  // ------------------------------
  const loadSettingsJSON = async () => {
    try {
      const res = await fetch(SETTINGS_URL + `?v=${Date.now()}`);
      if (!res.ok) throw new Error("Settings not found");
      const data = await res.json();
      setCols(data.cols ?? defaultSettings.cols);
      setRows(data.rows ?? defaultSettings.rows);
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

  useEffect(() => {
    loadSettingsJSON().then(() => {
      setPanX(0);
      setPanY(0);
      setZoom(1);
    });
  }, []);
  
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
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setCells(new Map(JSON.parse(saved)));
      } catch {
        console.warn("⚠️ Could not parse paint data");
      }
    }
  }, []);
  
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cells.entries())));
    }, 400);
    return () => clearTimeout(t);
  }, [cells]);

  const clearAll = () => {
    if (window.confirm("Clear all painted cells?")) {
      setCells(new Map());
      localStorage.removeItem(STORAGE_KEY);
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
            Math.PI * 2
          );
          ctx.stroke();
        }
      }
    }

    ctx.restore();
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
    rows, cols, cells, majorAxis, minorAxis, wireD,
    spacingX, spacingY, offsetX, offsetY,
    rowOffsetX, rowOffsetY, showLines,
    showHitGrid, hitRadiusFactor, hitOffsetX, hitOffsetY,
    imgDims.w, imgDims.h
  ]);
  

  // convert screen → canvas coordinates considering zoom/pan
  const screenToCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;
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
      el.style.transform = `translate(${Math.round(panX)}px, ${Math.round(panY)}px) scale(${zoom})`;
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
  // Mouse panning + painting
  // ------------------------------
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!paintActive) {
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOrigRef.current = { x: panX, y: panY };
    } else {
      setIsPainting(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!paintActive && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanX(panOrigRef.current.x + dx);
      setPanY(panOrigRef.current.y + dy);
    } else if (paintActive && isPainting) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      const c = Math.round((x - offsetX) / spacingX);
      const r = Math.round((y - offsetY) / spacingY);
      if (r < 0 || r >= rows || c < 0 || c >= cols) return;
      const key = `${r}-${c}`;
      const next = new Map(cells);
      if (isErasing) next.delete(key);
      else next.set(key, selectedColor);
      setCells(next);
    }
  };

  const handleMouseUp = () => {
    setIsPainting(false);
    panStartRef.current = null;
  };

// ------------------------------
// ✅ Touch / Pinch Zoom (centered + fully iOS Safari compatible)
// ------------------------------
const lastDist = useRef<number | null>(null);
const pinchStartZoom = useRef<number>(zoom);

const handleTouchMove = (e: React.TouchEvent) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const t1 = e.touches.item(0)!; const t2 = e.touches.item(1)!;

    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Midpoint between fingers
    const midX = (t1.clientX + t2.clientX) / 2;
    const midY = (t1.clientY + t2.clientY) / 2;

    if (lastDist.current == null) {
      lastDist.current = dist;
      pinchStartZoom.current = zoom;
      return;
    }

    const scaleFactor = dist / lastDist.current;
    const nextZoom = Math.max(0.3, Math.min(5, pinchStartZoom.current * scaleFactor));

    const rect = interactionRef.current!.getBoundingClientRect();
    const cx = midX - rect.left;
    const cy = midY - rect.top;

    const worldX = (cx - panX) / zoom;
    const worldY = (cy - panY) / zoom;
    const newPanX = cx - worldX * nextZoom;
    const newPanY = cy - worldY * nextZoom;

    setZoom(nextZoom);
    setPanX(newPanX);
    setPanY(newPanY);
    requestAnimationFrame(forceRedraw);
  } else if (e.touches.length === 1 && !paintActive) {
    e.preventDefault();
    const t = e.touches[0];
    if (panStartRef.current) {
      const dx = t.clientX - panStartRef.current.x;
      const dy = t.clientY - panStartRef.current.y;
      setPanX(panOrigRef.current.x + dx);
      setPanY(panOrigRef.current.y + dy);
    }
  } else if (e.touches.length === 1 && paintActive && isPainting) {
    e.preventDefault();
    const t = e.touches[0];
    const { x, y } = screenToCanvas(t.clientX, t.clientY);
    const c = Math.round((x - offsetX) / spacingX);
    const r = Math.round((y - offsetY) / spacingY);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    const key = `${r}-${c}`;
    const next = new Map(cells);
    if (isErasing) next.delete(key);
    else next.set(key, selectedColor);
    setCells(next);
  }
};

const handleTouchEnd = (e: React.TouchEvent) => {
  if (e.touches.length < 2) {
    lastDist.current = null;
  }
  setIsPainting(false);
  panStartRef.current = null;
};

// ------------------------------
// 🩹 Ensure non-passive listeners (Safari requires it for preventDefault())
// ------------------------------
useEffect(() => {
  const el = interactionRef.current;
  if (!el) return;

  const touchMove = (ev: TouchEvent) => handleTouchMove(ev as any);
  const touchEnd = (ev: TouchEvent) => handleTouchEnd(ev as any);
  el.addEventListener("touchmove", touchMove, { passive: false });
  el.addEventListener("touchend", touchEnd, { passive: false });

  return () => {
    el.removeEventListener("touchmove", touchMove);
    el.removeEventListener("touchend", touchEnd);
  };
}, [handleTouchMove]);
// ------------------------------
// ✅ Handle Canvas Click (paint or erase cell)
// ------------------------------
const handleCanvasClick = (e: React.MouseEvent<HTMLElement>) => {
  if (!paintActive) return;
  const { x, y } = screenToCanvas(e.clientX, e.clientY);

  const c = Math.round((x - offsetX) / spacingX);
  const r = Math.round((y - offsetY) / spacingY);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return;

  const key = `${r}-${c}`;
  const next = new Map(cells);
  if (isErasing) next.delete(key);
  else next.set(key, selectedColor);
  setCells(next);
};
// ------------------------------
// ✅ Mouse Wheel Zoom (centered under cursor)
// ------------------------------
const handleWheel = (e: React.WheelEvent) => {
  e.preventDefault();

  const delta = -e.deltaY * 0.0015;
  const zoomFactor = 1 + delta;
  const nextZoom = Math.max(0.3, Math.min(5, zoom * zoomFactor));

  const rect = (interactionRef.current as HTMLDivElement).getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  const worldX = (cx - panX) / zoom;
  const worldY = (cy - panY) / zoom;
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

  // ------------------------------
  // Draggable helper hook
  // ------------------------------
  const useDraggable = (
    initial: { top: number; left: number },
    resetKey?: any
  ) => {
    const [pos, setPos] = useState(initial);
    const offset = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
      setPos(initial);
    }, [initial.top, initial.left, resetKey]);

    const startDrag = (x: number, y: number) => {
      offset.current = { x: x - pos.left, y: y - pos.top };
    };

    const moveDrag = (x: number, y: number) => {
      if (!offset.current) return;
      setPos({ top: y - offset.current.y, left: x - offset.current.x });
    };

    const endDrag = () => {
      offset.current = null;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startDrag(e.clientX, e.clientY);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        startDrag(t.clientX, t.clientY);
      }
    };

    useEffect(() => {
      const onMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
      const onUp = () => endDrag();
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          moveDrag(t.clientX, t.clientY);
        }
      };
      const onTouchEnd = () => endDrag();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onTouchMove);
      window.addEventListener("touchend", onTouchEnd);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
      };
    }, [pos]);

    return { pos, handleMouseDown, handleTouchStart };
  };
  
    // 🧰 Panels
  const toolsPanel = useDraggable({
    top: window.innerWidth < 768 ? 60 : 16,
    left: window.innerWidth < 768 ? 8 : 16,
  });
  const colorsPanel = useDraggable({
    top: window.innerWidth < 768 ? 60 : 16,
    left: window.innerWidth < 768 ? 70 : 90,
  });

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
        <div
          style={{
            ...floatingPanel,
            position: "fixed",
            top: toolsPanel.pos.top,
            left: toolsPanel.pos.left,
            flexDirection: "column",
            gap: 8,
            cursor: "move",
          }}
          onMouseDown={toolsPanel.handleMouseDown}
          onTouchStart={toolsPanel.handleTouchStart}
        >
          <button
            style={{ ...floatIconBtn, background: "#2563eb" }}
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = "/wovenrainbowsbyerin";
            }}
            title="Back to Home"
          >
            🏠
          </button>

          <button
            style={{
              ...floatIconBtn,
              background: paintActive ? "#f97316" : "#1f2937",
            }}
            onClick={() => setPaintActive((v) => !v)}
            title="Toggle paint mode"
          >
            🎨
          </button>

          {paintActive && (
            <>
              <button
                onClick={() => setIsErasing((v) => !v)}
                style={{
                  ...floatIconBtn,
                  background: isErasing ? "#fbbf24" : "#1f2937",
                }}
                title="Eraser"
              >
                🧽
              </button>
              <button
                onClick={clearAll}
                style={{ ...floatIconBtn, background: "#ef4444" }}
                title="Clear all"
              >
                🧹
              </button>
            </>
          )}

          <button
            onClick={() => setShowImage((v) => !v)}
            style={{
              ...floatIconBtn,
              background: showImage ? "#0ea5e9" : "#1f2937",
            }}
            title="Toggle image"
          >
            🖼️
          </button>

          <button
            onClick={() => setShowLines((v) => !v)}
            style={{
              ...floatIconBtn,
              background: showLines ? "#22c55e" : "#1f2937",
            }}
            title="Toggle outlines"
          >
            📏
          </button>

          <button
            onClick={handlePrint}
            style={{ ...floatIconBtn, background: "#6b21a8" }}
            title="Print"
          >
            🖨️
          </button>

          <button
            onClick={() => setShowHitGrid((v) => !v)}
            style={{
              ...floatIconBtn,
              background: showHitGrid ? "#14b8a6" : "#1f2937",
            }}
            title="Toggle hit grid"
          >
            🎯
          </button>

          <button
            onClick={() => setShowControls((v) => !v)}
            style={{
              ...floatIconBtn,
              background: showControls ? "#f97316" : "#1f2937",
            }}
            title="Show controls"
          >
            🧰
          </button>
        </div>

        {/* 🎨 COLOR PANEL */}
        <div
          style={{
            ...floatingPanel,
            position: "fixed",
            top: colorsPanel.pos.top,
            left: colorsPanel.pos.left,
            flexDirection: "column",
            width: 70,
            padding: 6,
            cursor: "move",
            zIndex: 60,
          }}
          onMouseDown={colorsPanel.handleMouseDown}
          onTouchStart={colorsPanel.handleTouchStart}
        >
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

        {/* ⚙️ CONTROL PANEL */}
        {showControls && (
          <div style={controlPanel}>
            {[
              ["Columns", cols, setCols, 1, 100, 1],
              ["Rows", rows, setRows, 1, 100, 1],
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
        <div style={outerWrap}>
          <div
            ref={transformRef}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translate(${Math.round(panX)}px, ${Math.round(
                panY
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
  onMouseDown={handleMouseDown}
  onMouseMove={handleMouseMove}
  onMouseUp={handleMouseUp}
  onMouseLeave={handleMouseUp}
  onWheel={handleWheel}
  onTouchStart={(e) => {
    if (!paintActive) {
      const t = e.touches[0];
      panStartRef.current = { x: t.clientX, y: t.clientY };
      panOrigRef.current = { x: panX, y: panY };
    } else {
      setIsPainting(true);
    }
  }}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
  onClick={handleCanvasClick}  // ✅ just reference the function, do NOT redeclare it
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