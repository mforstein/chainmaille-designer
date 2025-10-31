// src/components/ErinPattern2D.tsx
import React, { useState, useEffect, useRef } from "react";

const COLORS = [
  "#000000",
  "#2563EB",
  "#16A34A",
  "#F59E0B",
  "#DC2626",
  "#9333EA",
  "#FFFFFF",
];

const STORAGE_KEY = "erin2DPattern";
const IMAGE_SRC = "/braid-reference.jpeg";
const SETTINGS_URL = "/erin-pattern-settings.json";

const ErinPattern2D: React.FC = () => {
  // ------------------------------
  // Default settings
  // ------------------------------
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

  // ------------------------------
  // State
  // ------------------------------
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
  const [showLines, setShowLines] = useState(true);
  const [showImage, setShowImage] = useState(true);

  // Painting
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [isErasing, setIsErasing] = useState(false);
  const [cells, setCells] = useState<Map<string, string>>(new Map());
  const [isPainting, setIsPainting] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgDims, setImgDims] = useState({ w: 1920, h: 1080 });

  useEffect(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const onLoad = () =>
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, []);

  // ------------------------------
  // Load settings JSON
  // ------------------------------
  const loadSettingsJSON = async () => {
    try {
      const res = await fetch(SETTINGS_URL + `?v=${Date.now()}`);
      if (!res.ok) throw new Error("No JSON found");
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
    } catch (err) {
      console.warn("Failed to load settings JSON:", err);
    }
  };

  useEffect(() => {
    loadSettingsJSON();
  }, []);

  // ------------------------------
  // Save settings JSON
  // ------------------------------
  const saveSettingsJSON = () => {
    const json = {
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
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "erin-pattern-settings.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ------------------------------
  // Painting logic
  // ------------------------------
  const updateCellAtPosition = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    const x = svgP.x;
    const y = svgP.y;

    const cellW = spacingX;
    const cellH = spacingY;
    const c = Math.floor((x - offsetX) / cellW);
    const r = Math.floor((y - offsetY) / cellH);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;

    const key = `${r}-${c}`;
    const next = new Map(cells);
    if (isErasing) next.delete(key);
    else next.set(key, selectedColor);
    setCells(next);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPainting(true);
    updateCellAtPosition(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPainting) updateCellAtPosition(e.clientX, e.clientY);
  };

  const handleMouseUp = () => setIsPainting(false);

  const clearAll = () => {
    if (window.confirm("Clear the entire pattern?")) {
      setCells(new Map());
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // ------------------------------
  // Draw ellipse rings
  // ------------------------------
  const drawRing = (cx: number, cy: number, fill: string | null, key: string) => {
    const stroke = "#000";
    const sw = 1.1;
    const rOuterX = (majorAxis / 2) * scale;
    const rOuterY = (minorAxis / 2) * scale;
    const rInnerX = rOuterX - wireD / 2;
    const rInnerY = rOuterY - wireD / 2;

    return (
      <g key={key}>
        {fill && (
          <path
            d={`
              M ${cx - rOuterX},${cy}
              a ${rOuterX},${rOuterY} 0 1,0 ${2 * rOuterX},0
              a ${rOuterX},${rOuterY} 0 1,0 -${2 * rOuterX},0
              M ${cx - rInnerX},${cy}
              a ${rInnerX},${rInnerY} 0 1,0 ${2 * rInnerX},0
              a ${rInnerX},${rInnerY} 0 1,0 -${2 * rInnerX},0
            `}
            fillRule="evenodd"
            fill={fill}
            opacity={0.35}
          />
        )}
        {showLines && (
          <>
            <ellipse
              cx={cx}
              cy={cy}
              rx={rOuterX}
              ry={rOuterY}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
            />
            <ellipse
              cx={cx}
              cy={cy}
              rx={rInnerX}
              ry={rInnerY}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
            />
          </>
        )}
      </g>
    );
  };

  // ------------------------------
  // Build uniform grid
  // ------------------------------
  const elements: JSX.Element[] = [];
  const cellW = spacingX;
  const cellH = spacingY;

  for (let r = 0; r < rows; r++) {
    const xOffset = rowOffsetX * cellW;
    const yOffset = rowOffsetY * cellH;

    for (let c = 0; c < cols; c++) {
      const cx = offsetX + c * cellW + (r % 2 === 0 ? xOffset : -xOffset);
      const cy = offsetY + r * cellH + (r % 2 === 0 ? yOffset : -yOffset);
      const key = `${r}-${c}`;
      const fillColor = cells.get(key) || null;
      elements.push(drawRing(cx, cy, fillColor, key));
    }
  }

  // ------------------------------
  // Controls definition with typing
  // ------------------------------
  const controls: [
    string,
    number,
    React.Dispatch<React.SetStateAction<number>>,
    number,
    number,
    number
  ][] = [
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
  ];

  // ------------------------------
  // Render
  // ------------------------------
  return (
    <div style={wrap as React.CSSProperties}>
      {/* Toolbar */}
      <div style={toolbar as React.CSSProperties}>
        <span style={{ fontWeight: 600, marginRight: 6 }}>Color:</span>
        <div style={paletteWrap as React.CSSProperties}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setIsErasing(false);
                setSelectedColor(c);
              }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                border:
                  selectedColor === c && !isErasing
                    ? "3px solid #000"
                    : "1px solid #ccc",
                background: c,
                marginLeft: 6,
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        <button onClick={() => setIsErasing((v) => !v)} style={toolbarBtn as React.CSSProperties}>
          {isErasing ? "Eraser: ON" : "Eraser: OFF"}
        </button>

        <button onClick={clearAll} style={clearBtn as React.CSSProperties}>
          Clear
        </button>

        <button onClick={saveSettingsJSON} style={saveBtn as React.CSSProperties}>
          Save JSON
        </button>

        <button onClick={loadSettingsJSON} style={blueBtn as React.CSSProperties}>
          Reload JSON
        </button>

        <button
          onClick={() => setShowLines((v) => !v)}
          style={{ ...toolbarBtn, background: showLines ? "#10B981" : "#6B7280" }}
        >
          {showLines ? "Lines: ON" : "Lines: OFF"}
        </button>

        <button
          onClick={() => setShowImage((v) => !v)}
          style={{ ...toolbarBtn, background: showImage ? "#3B82F6" : "#6B7280" }}
        >
          {showImage ? "Underlay: ON" : "Underlay: OFF"}
        </button>
      </div>

      {/* Controls */}
      <div style={controlPanel as React.CSSProperties}>
        {controls.map(([label, val, setter, min, max, step], idx) => (
          <div key={idx} style={sliderRow as React.CSSProperties}>
            <label style={sliderLabel as React.CSSProperties}>{label}</label>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={val}
              onChange={(e) => setter(Number(e.target.value))}
              style={{ flexGrow: 1, minWidth: "720px" }}
            />
            <input
              type="number"
              value={val}
              step={step}
              min={min}
              max={max}
              onChange={(e) => setter(Number(e.target.value))}
              style={numInput as React.CSSProperties}
            />
          </div>
        ))}
      </div>

      {/* Static Underlay + Pattern */}
      <div style={outerWrap as React.CSSProperties}>
        {showImage && (
          <div style={staticImageWrap as React.CSSProperties}>
            <img
              ref={imgRef}
              src={IMAGE_SRC}
              alt="Reference"
              style={staticImageStyle as React.CSSProperties}
            />
          </div>
        )}

        <div style={patternWrap as React.CSSProperties}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${imgDims.w} ${imgDims.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              touchAction: "none",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <rect width="1920" height="1080" fill="transparent" />
            {elements}
          </svg>
        </div>
      </div>
    </div>
  );
};


// ------------------------------
// Styles
// ------------------------------
const wrap: React.CSSProperties = {
  width: "100%",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  background: "#f3f4f6",
  overflow: "auto",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "#fff",
  padding: "10px 16px",
  borderBottom: "1px solid #ccc",
  width: "100%",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const toolbarBtn: React.CSSProperties = {
  marginLeft: "0.75rem",
  padding: "6px 10px",
  border: "none",
  borderRadius: 4,
  color: "white",
  background: "#6B7280",
  cursor: "pointer",
  fontWeight: 600,
};

const clearBtn: React.CSSProperties = { ...toolbarBtn, background: "#ef4444" };
const saveBtn: React.CSSProperties = { ...toolbarBtn, background: "#10B981" };
const blueBtn: React.CSSProperties = { ...toolbarBtn, background: "#3B82F6" };

const paletteWrap: React.CSSProperties = { display: "flex", overflowX: "auto" };
const controlPanel: React.CSSProperties = {
  background: "#fff",
  padding: "10px",
  marginTop: "6px",
  borderRadius: 6,
  width: "95%",
  maxHeight: "35vh",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};
const sliderRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
const sliderLabel: React.CSSProperties = { width: "150px", fontWeight: 600 };
const numInput: React.CSSProperties = {
  width: "80px",
  border: "1px solid #ccc",
  borderRadius: 4,
  padding: "2px 6px",
  textAlign: "right",
};
const outerWrap: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  overflow: "hidden",
};
const staticImageWrap: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  zIndex: 0,
  overflow: "hidden",
};
const staticImageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  opacity: 0.45,
  pointerEvents: "none",
};
const patternWrap: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  zIndex: 2,
};

export default ErinPattern2D;