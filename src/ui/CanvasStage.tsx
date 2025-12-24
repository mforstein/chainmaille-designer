import React from "react";

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement>;

  viewSize: number;
  setViewSize: (n: number) => void;

  scale: number;
  setScale: (n: number) => void;

  fitToView: () => void;
  centerView: () => void;
  oneToOne: () => void;

  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;

  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: () => void;

  isPanning: boolean;
  paintMode: boolean;
  eraserMode: boolean;
}

export default function CanvasStage({
  canvasRef,
  viewSize,
  setViewSize,
  scale,
  setScale,
  fitToView,
  centerView,
  oneToOne,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  isPanning,
  paintMode,
  eraserMode,
}: Props) {
  return (
    <div className="relative min-h-0 flex items-center justify-center bg-slate-800">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onClick={onClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`my-4 ${
          paintMode || eraserMode
            ? "cursor-crosshair"
            : isPanning
              ? "cursor-grabbing"
              : "cursor-grab"
        }`}
        style={{ width: `${viewSize}px`, height: `${viewSize}px` }}
      />

      {/* Floating controls (top-right) */}
      <div className="absolute top-2 right-2 bg-slate-900/80 border border-slate-700 rounded-lg p-2 space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-[11px]">Zoom</label>
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.05}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="w-40"
          />
          <input
            type="number"
            min={0.1}
            max={5}
            step={0.05}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="w-20 bg-slate-800 border border-slate-700 rounded px-1 text-right text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px]">View Size</label>
          <input
            type="range"
            min={200}
            max={1000}
            step={10}
            value={viewSize}
            onChange={(e) => setViewSize(parseInt(e.target.value))}
            className="w-40"
          />
          <input
            type="number"
            min={200}
            max={1000}
            step={10}
            value={viewSize}
            onChange={(e) => setViewSize(parseInt(e.target.value || "0"))}
            className="w-20 bg-slate-800 border border-slate-700 rounded px-1 text-right text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fitToView}
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs"
          >
            Fit
          </button>
          <button
            onClick={centerView}
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs"
          >
            Center
          </button>
          <button
            onClick={oneToOne}
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs"
          >
            1:1
          </button>
        </div>
      </div>

      {/* Helper tooltip */}
      <div className="absolute bottom-2 left-2 text-[10px] text-slate-300 bg-slate-900/60 border border-slate-700 rounded px-2 py-1">
        Drag: pan • Wheel disabled • Use zoom slider • Paint/Eraser in Tools
      </div>
    </div>
  );
}
