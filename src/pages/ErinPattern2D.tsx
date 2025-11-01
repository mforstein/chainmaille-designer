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

  // 🧭 Geometry and layout settings
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

  // 🎥 Viewport transforms
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panOrigRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 🖌️ Painting and layers
  const [showLines, setShowLines] = useState(true);
  const [showImage, setShowImage] = useState(true);
  const [paintActive, setPaintActive] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [isErasing, setIsErasing] = useState(false);
  const [cells, setCells] = useState<Map<string, string>>(new Map());
  const [isPainting, setIsPainting] = useState(false);

  // 📏 Refs
  const svgRef = useRef<SVGSVGElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgDims, setImgDims] = useState({ w: 1920, h: 1080 });
  const transformRef = useRef<HTMLDivElement | null>(null);
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
// Image dimensions sync (iOS-safe)
// ------------------------------
useEffect(() => {
  const img = imgRef.current;
  if (!img) return;

  const updateDims = () => {
    // ✅ Always set explicit dimensions (for Safari repaint reliability)
    setImgDims({
      w: img.naturalWidth || 1920,
      h: img.naturalHeight || 1080,
    });
  };

  // If already loaded (e.g., after refresh), force re-render
  if (img.complete && img.naturalWidth > 0) {
    updateDims();
  } else {
    img.addEventListener("load", updateDims);
  }

  // 🔁 iOS Safari fix: force a repaint when image toggles or on refresh
  const safariRepaint = () => {
    if (!img.complete) return;
    img.style.display = "none";
    void img.offsetHeight; // trigger reflow
    img.style.display = "block";
  };
  safariRepaint();

  return () => img.removeEventListener("load", updateDims);
}, [showImage]);
  // ------------------------------
  // LocalStorage: Save + Load
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

  // ------------------------------
  // Clear all cells
  // ------------------------------
  const clearAll = () => {
    if (window.confirm("Clear all painted cells?")) {
      setCells(new Map());
      localStorage.removeItem(STORAGE_KEY);
    }
  };

// ------------------------------
// ✅ Universal paint coordinate mapping (mouse + touch + Safari)
// ------------------------------
const updateCellAtPosition = (clientX: number, clientY: number) => {
  const svg = svgRef.current;
  if (!svg) return;

  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;

  const ctm = svg.getScreenCTM();
  if (!ctm) return;

  const svgPt = pt.matrixTransform(ctm.inverse());

  // 🧮 Detect if CTM already includes zoom (Safari vs Chrome difference)
  // Safari sometimes gives CTM with scale = 1 even after zoom
  const scaleX = Math.abs(ctm.a);
  const scaleY = Math.abs(ctm.d);
  const avgScale = (scaleX + scaleY) / 2;
  const needsManualScale = Math.abs(avgScale - zoom) > 0.05;

  // 🧭 Adjust coordinates only if Safari's CTM is stale
  const effectiveZoom = needsManualScale ? zoom : 1;

  const x = (svgPt.x - offsetX) / effectiveZoom;
  const y = (svgPt.y - offsetY) / effectiveZoom;

  const c = Math.floor(x / spacingX);
  const r = Math.floor(y / spacingY);

  if (!Number.isFinite(c) || !Number.isFinite(r)) return;
  if (c < 0 || r < 0 || c >= cols || r >= rows) return;

  const key = `${r}-${c}`;
  const next = new Map(cells);
  if (isErasing) next.delete(key);
  else next.set(key, selectedColor);
  setCells(next);
};
// ------------------------------
// ✅ Force redraw helper (Safari CTM refresh)
// ------------------------------
const forceRedraw = () => {
  const svg = svgRef.current;
  if (!svg) return;
  svg.style.willChange = "transform";
  svg.style.transform = "translateZ(0)";
  void (svg as unknown as HTMLElement).offsetHeight;
  svg.style.transform = "";
  svg.style.willChange = "";
};
// 🩹 Safari-specific zoom-out CTM fix (targeting the transform container)
useEffect(() => {
  if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;

  const container = transformRef.current;
  if (!container) return;

  const t = setTimeout(() => {
    container.style.willChange = "transform";
    container.style.transform += " translateZ(0)";
    void container.offsetHeight; // layout flush
    container.style.willChange = "";

    const baseTransform = `translate(${Math.round(panX)}px, ${Math.round(panY)}px) scale(${zoom})`;
    container.style.transform = baseTransform;

    requestAnimationFrame(forceRedraw);
  }, 80);

  return () => clearTimeout(t);
}, [zoom, panX, panY]);
// ------------------------------
// ✅ Mouse Painting & Panning
// ------------------------------
const handleMouseDown = (e: React.MouseEvent) => {
  e.preventDefault();
  if (paintActive) {
    setIsPainting(true);
    updateCellAtPosition(e.clientX, e.clientY);
  } else {
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panOrigRef.current = { x: panX, y: panY };
  }
};

const handleMouseMove = (e: React.MouseEvent) => {
  if (paintActive && isPainting) {
    updateCellAtPosition(e.clientX, e.clientY);
  } else if (!paintActive && panStartRef.current) {
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanX(panOrigRef.current.x + dx);
    setPanY(panOrigRef.current.y + dy);
  }
};

const handleMouseUp = () => {
  setIsPainting(false);
  panStartRef.current = null;
};

// ------------------------------
// ✅ Touch / Pinch Zoom (Safari-stable, accurate paint coords)
// ------------------------------
const lastDist = useRef<number | null>(null);
const lastZoom = useRef<number>(zoom);

const handleTouchMove = (e: React.TouchEvent) => {
  e.preventDefault(); // block scroll + bounce

  if (e.touches.length === 2) {
    // Pinch zoom
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (lastDist.current != null) {
      const diff = dist - lastDist.current;
      setZoom((z) => {
        const next = Math.max(0.3, Math.min(5, z + diff * 0.002));
        const rounded = Math.round(next * 100) / 100;
        lastZoom.current = rounded;
        requestAnimationFrame(forceRedraw);
        return rounded;
      });
    }
    lastDist.current = dist;
  } else if (e.touches.length === 1) {
    // Paint or pan
    const t = e.touches[0];
    if (paintActive) {
      updateCellAtPosition(t.clientX, t.clientY);
    } else if (panStartRef.current) {
      const dx = t.clientX - panStartRef.current.x;
      const dy = t.clientY - panStartRef.current.y;
      setPanX(panOrigRef.current.x + dx);
      setPanY(panOrigRef.current.y + dy);
    }
  }
};

const handleTouchEnd = () => {
  lastDist.current = null;
  setIsPainting(false);
  panStartRef.current = null;
};

// ------------------------------
// ✅ Mouse Wheel Zoom (Safari + Chrome safe)
// ------------------------------
const handleWheel = (e: React.WheelEvent) => {
  e.preventDefault();
  const delta = -e.deltaY * 0.0015;
  setZoom((z) => {
    const next = Math.max(0.3, Math.min(5, z + delta));
    const rounded = Math.round(next * 100) / 100;
    requestAnimationFrame(forceRedraw);
    return rounded;
  });
};

// ------------------------------
// 🩹 Fix "Unable to preventDefault" (non-passive event listeners)
// ------------------------------
useEffect(() => {
  const svg = svgRef.current;
  if (!svg) return;

  // Remove React synthetic listeners (they're passive)
  svg.onwheel = null;
  svg.ontouchmove = null;

  const touchMove = (e: TouchEvent) => handleTouchMove(e as any);
  const wheelMove = (e: WheelEvent) => handleWheel(e as any);

  svg.addEventListener("touchmove", touchMove, { passive: false });
  svg.addEventListener("wheel", wheelMove, { passive: false });

  return () => {
    svg.removeEventListener("touchmove", touchMove);
    svg.removeEventListener("wheel", wheelMove);
  };
}, [handleTouchMove, handleWheel]);
  // ------------------------------
  // Draw Rings
  // ------------------------------
  const drawRing = (cx: number, cy: number, fill: string | null, key: string) => {
    const stroke = "#000";
    const sw = 1.1;
    const rOuterX = (majorAxis / 2);
    const rOuterY = (minorAxis / 2);
    const rInnerX = Math.max(1, rOuterX - wireD / 2);
    const rInnerY = Math.max(1, rOuterY - wireD / 2);

    return (
      <g key={key}>
{fill && (
  <path
    d={`M ${cx - rOuterX},${cy}
      a ${rOuterX},${rOuterY} 0 1,0 ${2 * rOuterX},0
      a ${rOuterX},${rOuterY} 0 1,0 -${2 * rOuterX},0
      M ${cx - rInnerX},${cy}
      a ${rInnerX},${rInnerY} 0 1,0 ${2 * rInnerX},0
      a ${rInnerX},${rInnerY} 0 1,0 -${2 * rInnerX},0`}
    fillRule="evenodd"
    fill={fill}
    opacity={0.55} // slightly more visible
  />
)}
        {showLines && (
          <>
            <ellipse cx={cx} cy={cy} rx={rOuterX} ry={rOuterY} fill="none" stroke={stroke} strokeWidth={sw} />
            <ellipse cx={cx} cy={cy} rx={rInnerX} ry={rInnerY} fill="none" stroke={stroke} strokeWidth={sw} />
          </>
        )}
      </g>
    );
  };

  const elements: JSX.Element[] = [];
for (let r = 0; r < rows; r++) {
  const xOffset = rowOffsetX * spacingX;
  const yOffset = rowOffsetY * spacingY;
  for (let c = 0; c < cols; c++) {
    const cx = offsetX + c * spacingX + (r % 2 === 0 ? xOffset : -xOffset);
    const cy = offsetY + r * spacingY + (r % 2 === 0 ? yOffset : -yOffset);
    const key = `${r}-${c}`;
    elements.push(drawRing(cx, cy, cells.get(key) || null, key));
  }
}
  // ------------------------------
  // Save JSON (settings)
  // ------------------------------
  const saveSettingsJSON = () => {
    const settings = {
      cols, rows, majorAxis, minorAxis, wireD,
      spacingX, spacingY, offsetX, offsetY,
      rowOffsetX, rowOffsetY, scale
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "erin-pattern-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

 // ------------------------------
// Draggable helpers
// ------------------------------
const useDraggable = (
  initial: { top: number; left: number },
  resetKey?: any
) => {
  const [pos, setPos] = useState(initial);
  const offset = useRef<{ x: number; y: number } | null>(null);

  // 👇 if the caller gives us a *new* initial (e.g. mobile vs desktop),
  // re-apply it
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
// 🧰 Responsive starting positions for draggable panels
const toolsPanel = useDraggable({
  top: window.innerWidth < 768 ? 60 : 16,  // push down for mobile (below notch)
  left: window.innerWidth < 768 ? 8 : 16,  // add slight left padding
});

const colorsPanel = useDraggable({
  top: window.innerWidth < 768 ? 60 : 16,  // align vertically with toolbar
  left: window.innerWidth < 768 ? 70 : 90, // keep beside toolbar, tighter on small screens
});
const handlePrint = () => {
  // 🔹 Temporarily add a "printing" class to hide UI
  document.body.classList.add("printing");

  // Wait a moment for the UI to hide
  setTimeout(() => {
    window.print();

    // 🔹 Restore UI after printing
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
            style={{
              ...floatIconBtn,
              background: paintActive ? "#f97316" : "#1f2937",
            }}
            onClick={() => setPaintActive((v) => !v)}
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
              >
                🧽
              </button>
              <button
                onClick={clearAll}
                style={{ ...floatIconBtn, background: "#ef4444" }}
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
          >
            🖼️
          </button>
          <button
            onClick={() => setShowLines((v) => !v)}
            style={{
              ...floatIconBtn,
              background: showLines ? "#22c55e" : "#1f2937",
            }}
          >
            📏
          </button>
          <button
            onClick={handlePrint}
            style={{ ...floatIconBtn, background: "#6b21a8" }}
          >
            🖨️
          </button>
          <button
            onClick={() => setShowControls((v) => !v)}
            style={{
              ...floatIconBtn,
              background: showControls ? "#f97316" : "#1f2937",
            }}
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
            height: "auto",
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
                    selectedColor === c
                      ? "2px solid #fff"
                      : "1px solid #111",
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
              <button
                onClick={() => loadSettingsJSON()}
                style={smallToolBtnBlue}
              >
                🔄 Reload
              </button>
            </div>
          </div>
        )}

{/* 🖼️ IMAGE + SVG — unified pan/zoom transform */}
<div style={outerWrap}>
  {/* One shared transform container */}
  <div
    style={{
      position: "absolute",
      inset: 0,
      transform: `translate(${Math.round(panX)}px, ${Math.round(panY)}px) scale(${zoom})`,
      transformOrigin: "top left",
    }}
  >
    {/* Background Image */}
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
        }}
      />
    )}

    {/* Grid Overlay */}
    <svg
      ref={svgRef}
      width={imgDims.w}
      height={imgDims.h}
      viewBox={`0 0 ${imgDims.w} ${imgDims.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 2,
        touchAction: "none",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={(e) => {
        if (!paintActive) {
          const touch = e.touches[0];
          panStartRef.current = { x: touch.clientX, y: touch.clientY };
          panOrigRef.current = { x: panX, y: panY };
        }
      }}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* 🧭 Debug border to verify alignment */}
      <rect
        x="0"
        y="0"
        width={imgDims.w}
        height={imgDims.h}
        fill="none"
        stroke="red"
        strokeWidth={2}
      />
      {elements}
    </svg>
  </div>
</div>
</div> {/* closes outerWrap */}
</>
  ); // ✅ end of return
}; // ✅ end of ErinPattern2D component
// ------------------------------
// 💅 Styles
// ------------------------------
const wrap: React.CSSProperties = {
  width: "100%",
  height: "100vh",
  background: "#0f172a",
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
};

const staticImageWrap: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
};

const staticImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  opacity: 0.45,
  pointerEvents: "none",
  background: "#111",
};

export default ErinPattern2D;