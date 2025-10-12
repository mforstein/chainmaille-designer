import React from "react";

export default function RightControls({
  inner, wire, overlapX, overlapY,
  setInner, setWire, setOverlapX, setOverlapY,
  supplier, ringSpec, suppliers, ringSpecs,
  setSupplier, setRingSpec,
  requestReport
}: {
  inner:number; wire:number; overlapX:number; overlapY:number;
  setInner:(n:number)=>void; setWire:(n:number)=>void; setOverlapX:(n:number)=>void; setOverlapY:(n:number)=>void;
  supplier:string; ringSpec:string;
  suppliers:{id:string;name:string}[];
  ringSpecs:{label:string}[];
  setSupplier:(id:string)=>void; setRingSpec:(label:string)=>void;
  requestReport:()=>void;
}) {
  return (
    <div className="dock toolbar-right">
      <div className="panel" style={{width:240}}>
        <div className="panel-heading">Geometry</div>
        <div className="panel-section" style={{display:"grid", gap:8}}>
          <label style={{display:"grid", gridTemplateColumns:"1fr 80px", alignItems:"center", gap:8}}>
            <span>Inner Ø</span>
            <input className="mini-input" type="number" step={0.01} min={0.1}
                   value={inner} onChange={e=>setInner(parseFloat(e.target.value)||inner)} />
          </label>
          <label style={{display:"grid", gridTemplateColumns:"1fr 80px", alignItems:"center", gap:8}}>
            <span>Wire Ø</span>
            <input className="mini-input" type="number" step={0.01} min={0.1}
                   value={wire} onChange={e=>setWire(parseFloat(e.target.value)||wire)} />
          </label>
          <label style={{display:"grid", gridTemplateColumns:"1fr 80px", alignItems:"center", gap:8}}>
            <span>Overlap X</span>
            <input className="mini-input" type="number" step={0.01} min={0} max={0.8}
                   value={overlapX} onChange={e=>setOverlapX(parseFloat(e.target.value)||overlapX)} />
          </label>
          <label style={{display:"grid", gridTemplateColumns:"1fr 80px", alignItems:"center", gap:8}}>
            <span>Overlap Y</span>
            <input className="mini-input" type="number" step={0.01} min={0} max={0.8}
                   value={overlapY} onChange={e=>setOverlapY(parseFloat(e.target.value)||overlapY)} />
          </label>
        </div>

        <div className="panel-heading">Supplier & Size</div>
        <div className="panel-section" style={{display:"grid", gap:8}}>
          <select className="mini-input" value={supplier} onChange={(e)=>setSupplier(e.target.value)}>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="mini-input" value={ringSpec} onChange={(e)=>setRingSpec(e.target.value)}>
            {ringSpecs.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
          </select>
          <button className="icon-btn" onClick={requestReport} title="Report / Order Info"
                  style={{width:"100%", display:"flex", justifyContent:"center"}}>Report</button>
        </div>
      </div>
    </div>
  );
}