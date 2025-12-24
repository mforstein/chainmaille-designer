import React, { useState } from "react";
import { SupplierId } from "../App";
import ImageOverlayPanel from "../ImageOverlayPanel";

type PaletteEntry = { supplier: SupplierId; name: string; hex: string };

interface Props {
  // tools
  paintMode: boolean;
  setPaintMode: (v: boolean) => void;
  eraserMode: boolean;
  setEraserMode: (v: boolean) => void;
  panZoomEnabled: boolean;
  setPanZoomEnabled: (v: boolean) => void;

  currentBrushColor: string;
  setCurrentBrushColor: (hex: string) => void;
  supplierPalette: PaletteEntry[];
  onPickPaletteColor: (hex: string) => void;

  // image overlay
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

export default function LeftToolbar(props: Props) {
  const [openImagePanel, setOpenImagePanel] = useState(true);

  return (
    <div className="h-full bg-slate-900/60 border-r border-slate-800 p-3 space-y-4 overflow-auto">
      {/* Tool buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => {
            props.setPaintMode(!props.paintMode);
            if (props.eraserMode) props.setEraserMode(false);
          }}
          className={`px-2 py-1 rounded text-xs ${props.paintMode ? "bg-green-700" : "bg-slate-700 hover:bg-slate-600"}`}
        >
          Paint
        </button>
        <button
          onClick={() => {
            props.setEraserMode(!props.eraserMode);
            if (props.paintMode) props.setPaintMode(false);
          }}
          className={`px-2 py-1 rounded text-xs ${props.eraserMode ? "bg-red-700" : "bg-slate-700 hover:bg-slate-600"}`}
        >
          Erase
        </button>
        <button
          onClick={() => props.setPanZoomEnabled(!props.panZoomEnabled)}
          className={`px-2 py-1 rounded text-xs ${props.panZoomEnabled ? "bg-blue-700" : "bg-slate-700 hover:bg-slate-600"}`}
        >
          Pan
        </button>
      </div>

      {/* Palette */}
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
          Palette
        </div>
        <div className="flex flex-wrap gap-2">
          {props.supplierPalette.map(({ name, hex }) => (
            <button
              key={hex}
              title={name}
              style={{ backgroundColor: hex }}
              className="h-6 w-6 rounded-full border border-white/70"
              onClick={() => props.onPickPaletteColor(hex)}
            />
          ))}
        </div>
        <div className="mt-2 text-[10px] text-slate-300">
          Brush:{" "}
          <span
            className="inline-block align-middle h-3 w-3 rounded-full border"
            style={{ background: props.currentBrushColor }}
          />
          <span className="ml-1">{props.currentBrushColor}</span>
        </div>
      </div>

      {/* Image Overlay (collapsible) */}
      <div className="border border-slate-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setOpenImagePanel((v) => !v)}
          className="w-full text-left bg-slate-800 px-3 py-2 text-xs font-semibold"
        >
          Image Overlay {openImagePanel ? "▾" : "▸"}
        </button>
        {openImagePanel && (
          <div className="p-3 bg-slate-900/40">
            <ImageOverlayPanel
              imageFile={props.imageFile}
              setImageFile={props.setImageFile}
              imageScale={props.imageScale}
              setImageScale={props.setImageScale}
              paletteSource={props.paletteSource}
              setPaletteSource={props.setPaletteSource}
              onApplyTransfer={props.onApplyTransfer}
              previewOffset={props.previewOffset}
              setPreviewOffset={props.setPreviewOffset}
              previewRotation={props.previewRotation}
              setPreviewRotation={props.setPreviewRotation}
            />
          </div>
        )}
      </div>
    </div>
  );
}
