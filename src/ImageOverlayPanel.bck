import React from "react";

interface ImageOverlayPanelProps {
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
  imageScale: number;
  setImageScale: (n: number) => void;
  paletteSource: "current" | "cmj" | "trl" | "mdz" | "all";
  setPaletteSource: (s: "current" | "cmj" | "trl" | "mdz" | "all") => void;
  onApplyTransfer: () => void;
  previewOffset: { x: number; y: number };
  setPreviewOffset: (v: { x: number; y: number }) => void;
  previewRotation: number;
  setPreviewRotation: (n: number) => void;
}

/**
 * Panel for selecting an image and controlling overlay parameters.
 */
export default function ImageOverlayPanel({
  imageFile,
  setImageFile,
  imageScale,
  setImageScale,
  paletteSource,
  setPaletteSource,
  onApplyTransfer,
  previewOffset,
  setPreviewOffset,
  previewRotation,
  setPreviewRotation,
}: ImageOverlayPanelProps) {
  return (
    <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-800 space-y-3">
      {/* Header */}
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
        Image Overlay
      </div>

      {/* Preview Image */}
      {imageFile && (
        <div className="mb-3 flex justify-center">
          <img
            src={URL.createObjectURL(imageFile)}
            alt="Image preview"
            style={{
              maxWidth: "220px",
              maxHeight: "220px",
              borderRadius: "8px",
              border: "1px solid #555",
              objectFit: "contain",
            }}
            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
          />
        </div>
      )}

      {/* File Picker */}
      <div className="flex items-center gap-2">
        <label className="text-xs">Choose File:</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setImageFile(file);
          }}
          className="text-xs"
        />
      </div>

      {/* Scale Control */}
      <div className="flex items-center gap-2">
        <label className="text-xs w-20">Scale:</label>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.01}
          value={imageScale}
          onChange={(e) => setImageScale(parseFloat(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          min={0.1}
          max={5}
          step={0.01}
          value={imageScale}
          onChange={(e) => setImageScale(parseFloat(e.target.value))}
          className="w-16 bg-slate-800 border border-slate-700 rounded px-1 text-right text-xs"
        />
      </div>

      {/* Offset X */}
      <div className="flex items-center gap-2">
        <label className="text-xs w-20">Offset X:</label>
        <input
          type="range"
          min={-500}
          max={500}
          step={1}
          value={previewOffset.x}
          onChange={(e) =>
            setPreviewOffset({ ...previewOffset, x: parseFloat(e.target.value) })
          }
          className="flex-1"
        />
        <input
          type="number"
          min={-500}
          max={500}
          step={1}
          value={previewOffset.x}
          onChange={(e) =>
            setPreviewOffset({ ...previewOffset, x: parseFloat(e.target.value) })
          }
          className="w-16 bg-slate-800 border border-slate-700 rounded px-1 text-right text-xs"
        />
      </div>

      {/* Offset Y */}
      <div className="flex items-center gap-2">
        <label className="text-xs w-20">Offset Y:</label>
        <input
          type="range"
          min={-500}
          max={500}
          step={1}
          value={previewOffset.y}
          onChange={(e) =>
            setPreviewOffset({ ...previewOffset, y: parseFloat(e.target.value) })
          }
          className="flex-1"
        />
        <input
          type="number"
          min={-500}
          max={500}
          step={1}
          value={previewOffset.y}
          onChange={(e) =>
            setPreviewOffset({ ...previewOffset, y: parseFloat(e.target.value) })
          }
          className="w-16 bg-slate-800 border border-slate-700 rounded px-1 text-right text-xs"
        />
      </div>

      {/* Rotation */}
      <div className="flex items-center gap-2">
        <label className="text-xs w-20">Rotation:</label>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={previewRotation}
          onChange={(e) => setPreviewRotation(parseFloat(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          min={-180}
          max={180}
          step={1}
          value={previewRotation}
          onChange={(e) => setPreviewRotation(parseFloat(e.target.value))}
          className="w-16 bg-slate-800 border border-slate-700 rounded px-1 text-right text-xs"
        />
      </div>

      {/* Palette Source */}
      <div>
        <label className="text-xs mr-2">Palette Source:</label>
        <select
          value={paletteSource}
          onChange={(e) =>
            setPaletteSource(e.target.value as "current" | "cmj" | "trl" | "mdz" | "all")
          }
          className="bg-slate-800 text-xs border border-slate-700 rounded p-1"
        >
          <option value="current">Current Supplier</option>
          <option value="cmj">Chainmail Joe</option>
          <option value="trl">The Ring Lord</option>
          <option value="mdz">MetalDesignz</option>
          <option value="all">All Suppliers Combined</option>
        </select>
      </div>

      {/* Apply Button */}
      <div>
        <button
          onClick={onApplyTransfer}
          className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 rounded"
        >
          Apply Image Transfer
        </button>
      </div>
    </div>
  );
}