import { ChevronDown, ChevronUp, RotateCw, Scan } from "lucide-react";
import React, { useState } from "react";

export default function ImagePreviewDock({
  file, setFile,
  scale, setScale,
  offset, setOffset,
  rotation, setRotation,
  paletteSource, setPaletteSource,
  onTransfer
}: {
  file: File | null; setFile:(f:File|null)=>void;
  scale:number; setScale:(n:number)=>void;
  offset:{x:number;y:number}; setOffset:(o:{x:number;y:number})=>void;
  rotation:number; setRotation:(n:number)=>void;
  paletteSource: "current"|"cmj"|"trl"|"mdz"|"all";
  setPaletteSource: (v:"current"|"cmj"|"trl"|"mdz"|"all")=>void;
  onTransfer: ()=>void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="dock preview-dock">
      <div className="panel">
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px"}}>
          <div className="panel-heading" style={{padding:0}}>Image Preview</div>
          <button className="icon-btn" onClick={()=>setOpen(o=>!o)} title={open?"Minimize":"Expand"}>
            {open ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}
          </button>
        </div>

        {open && (
          <div className="panel-section" style={{display:"grid", gap:8}}>
            {/* File + small preview */}
            <input type="file" accept="image/*"
              onChange={(e)=>setFile(e.target.files?.[0] ?? null)} />

            {file && (
              <img
                src={URL.createObjectURL(file)}
                onLoad={(e)=>URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                alt="preview"
                style={{width:"100%", height:160, objectFit:"cover", borderRadius:6, border:"1px solid rgba(255,255,255,.25)"}}
              />
            )}

            {/* Controls */}
            <div style={{display:"grid", gridTemplateColumns:"1fr 70px", alignItems:"center", gap:8}}>
              <label>Scale</label>
              <input className="mini-input" type="number" step={0.01} min={0.1} max={5} value={scale}
                     onChange={(e)=>setScale(parseFloat(e.target.value)||scale)} />
              <label>Offset X</label>
              <input className="mini-input" type="number" step={1} value={offset.x}
                     onChange={(e)=>setOffset({...offset, x: parseFloat(e.target.value)||0})}/>
              <label>Offset Y</label>
              <input className="mini-input" type="number" step={1} value={offset.y}
                     onChange={(e)=>setOffset({...offset, y: parseFloat(e.target.value)||0})}/>
              <label>Rotation</label>
              <input className="mini-input" type="number" step={1} min={-180} max={180} value={rotation}
                     onChange={(e)=>setRotation(parseFloat(e.target.value)||0)}/>
              <label>Palette</label>
              <select className="mini-input" value={paletteSource}
                      onChange={(e)=>setPaletteSource(e.target.value as any)}>
                <option value="current">Current Supplier</option>
                <option value="cmj">Chainmail Joe</option>
                <option value="trl">The Ring Lord</option>
                <option value="mdz">MetalDesignz</option>
                <option value="all">All Suppliers Combined</option>
              </select>
            </div>

            <button className="icon-btn" title="Transfer to chain"
                    onClick={onTransfer}
                    style={{width:"100%", display:"flex", gap:8, justifyContent:"center"}}>
              <Scan size={16}/> Transfer to Chain
            </button>
          </div>
        )}
      </div>
    </div>
  );
}