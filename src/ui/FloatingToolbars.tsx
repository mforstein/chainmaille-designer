import {
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Hand,
  Brush,
  Eraser,
  Crosshair,
  Maximize2,
  Minimize2,
  Focus,
  Printer,
  Info,
} from "lucide-react";
import React from "react";

type Num = number;

export function TopLeftControls({
  scale,
  setScale,
  rows,
  cols,
  setRows,
  setCols,
}: {
  scale: Num;
  setScale: (n: Num) => void;
  rows: Num;
  cols: Num;
  setRows: (n: Num) => void;
  setCols: (n: Num) => void;
}) {
  return (
    <div className="top-left-controls">
      <div
        className="panel"
        style={{ padding: 8, display: "flex", gap: 8, alignItems: "center" }}
      >
        <span className="panel-heading" style={{ padding: 0 }}>
          Zoom
        </span>
        <button
          className="icon-btn"
          onClick={() => setScale(Math.max(0.1, +(scale - 0.1).toFixed(2)))}
        >
          <ZoomOut size={16} />
        </button>
        <input
          className="mini-input"
          type="number"
          step={0.05}
          min={0.1}
          max={20}
          value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value) || 1)}
        />
        <button
          className="icon-btn"
          onClick={() => setScale(Math.min(20, +(scale + 0.1).toFixed(2)))}
        >
          <ZoomIn size={16} />
        </button>
        <div style={{ width: 12 }} />
        <span className="panel-heading" style={{ padding: 0 }}>
          Rows
        </span>
        <input
          className="mini-input"
          type="number"
          min={1}
          max={400}
          value={rows}
          onChange={(e) => setRows(parseInt(e.target.value || "0", 10))}
        />
        <span className="panel-heading" style={{ padding: 0 }}>
          Cols
        </span>
        <input
          className="mini-input"
          type="number"
          min={1}
          max={400}
          value={cols}
          onChange={(e) => setCols(parseInt(e.target.value || "0", 10))}
        />
      </div>
    </div>
  );
}

export function LeftToolbar({
  onUndo,
  onRedo,
  onFit,
  onCenter,
  onOneToOne,
  paintOn,
  togglePaint,
  eraseOn,
  toggleErase,
  panOn,
  togglePan,
  onPrint,
  onAbout,
}: {
  onUndo: () => void;
  onRedo: () => void;
  onFit: () => void;
  onCenter: () => void;
  onOneToOne: () => void;
  paintOn: boolean;
  togglePaint: () => void;
  eraseOn: boolean;
  toggleErase: () => void;
  panOn: boolean;
  togglePan: () => void;
  onPrint: () => void;
  onAbout: () => void;
}) {
  return (
    <div className="dock toolbar-left">
      <button className="icon-btn" title="Undo" onClick={onUndo}>
        <Undo size={16} />
      </button>
      <button className="icon-btn" title="Redo" onClick={onRedo}>
        <Redo size={16} />
      </button>
      <div style={{ height: 6 }} />
      <button
        className="icon-btn"
        title="Paint"
        onClick={togglePaint}
        style={{ outline: paintOn ? "2px solid #22c55e" : undefined }}
      >
        <Brush size={16} />
      </button>
      <button
        className="icon-btn"
        title="Eraser"
        onClick={toggleErase}
        style={{ outline: eraseOn ? "2px solid #ef4444" : undefined }}
      >
        <Eraser size={16} />
      </button>
      <button
        className="icon-btn"
        title="Pan"
        onClick={togglePan}
        style={{ outline: panOn ? "2px solid #60a5fa" : undefined }}
      >
        <Hand size={16} />
      </button>
      <div style={{ height: 6 }} />
      <button className="icon-btn" title="Fit" onClick={onFit}>
        <Maximize2 size={16} />
      </button>
      <button className="icon-btn" title="Center" onClick={onCenter}>
        <Crosshair size={16} />
      </button>
      <button className="icon-btn" title="1:1" onClick={onOneToOne}>
        <Focus size={16} />
      </button>
      <div style={{ height: 6 }} />
      <button className="icon-btn" title="Print 1:1" onClick={onPrint}>
        <Printer size={16} />
      </button>
      <button className="icon-btn" title="About" onClick={onAbout}>
        <Info size={16} />
      </button>
    </div>
  );
}
