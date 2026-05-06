// src/pages/UserManual.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DraggableCompassNav, DraggablePill } from "../App";
import { IconHamburger } from "../components/icons/ToolIcons";

// ─── shared helpers ────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "home",      icon: "🏠", title: "Home Page" },
  { id: "workspace", icon: "🧭", title: "Workspace" },
  { id: "studio",    icon: "✨", title: "Freeform Studio" },
  { id: "designer",  icon: "💎", title: "3D Designer" },
  { id: "chart",     icon: "📊", title: "Ring Size Chart" },
  { id: "tuner",     icon: "⚙️", title: "Weave Tuner" },
  { id: "atlas",     icon: "🌐", title: "Weave Atlas" },
  { id: "pattern",   icon: "🎨", title: "Pattern 2D" },
];

const MOCK_WRAP: React.CSSProperties = {
  border: "1px solid #1e293b",
  borderRadius: 10,
  overflow: "hidden",
  margin: "14px 0",
  background: "#0b1020",
  position: "relative",
};

const LABEL: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  right: 8,
  fontSize: 10,
  color: "#475569",
  background: "rgba(0,0,0,0.6)",
  padding: "2px 6px",
  borderRadius: 4,
};

/** Draws a hex grid of ring SVG circles. */
function HexRings({ rows = 4, cols = 6, colors, bg = "#111827", ringW = 3, r = 10, spacing = 24 }: {
  rows?: number; cols?: number; colors: string[][]; bg?: string; ringW?: number; r?: number; spacing?: number;
}) {
  const ry = spacing * 0.866;
  const W = cols * spacing + spacing / 2 + 8;
  const H = rows * ry + r + 8;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: bg }}>
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: row % 2 === 0 ? cols : cols - 1 }, (_, col) => {
          const x = 4 + r + col * spacing + (row % 2 === 1 ? spacing / 2 : 0);
          const y = 4 + r + row * ry;
          const c = (colors[row] ?? [])[col] ?? "#64748b";
          return (
            <g key={`${row}-${col}`}>
              <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={ringW} opacity={0.9} />
              <circle cx={x} cy={y} r={r * 0.42} fill={bg} />
            </g>
          );
        })
      )}
    </svg>
  );
}

/** Draws a teardrop scale shape in SVG. */
function Scale({ cx, cy, w, h, color }: { cx: number; cy: number; w: number; h: number; color: string }) {
  const hw = w / 2;
  const d = `M ${cx},${cy - h * 0.08}
    C ${cx + hw * 1.1},${cy - h * 0.12} ${cx + hw * 1.15},${cy + h * 0.38} ${cx + hw * 0.36},${cy + h * 0.72}
    C ${cx + hw * 0.18},${cy + h * 0.88} ${cx},${cy + h * 0.94} ${cx},${cy + h * 0.94}
    C ${cx},${cy + h * 0.94} ${cx - hw * 0.18},${cy + h * 0.88} ${cx - hw * 0.36},${cy + h * 0.72}
    C ${cx - hw * 1.15},${cy + h * 0.38} ${cx - hw * 1.1},${cy - h * 0.12} ${cx},${cy - h * 0.08} Z`;
  return <path d={d} fill={color} stroke="#1a3040" strokeWidth={0.8} opacity={0.92} />;
}

/** Mock slider row. */
function MSlider({ label, pct, color = "#3b82f6" }: { label: string; pct: number; color?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>
        <span>{label}</span><span style={{ color: "#93c5fd" }}>{Math.round(pct * 100) / 10}</span>
      </div>
      <div style={{ height: 4, background: "#1e293b", borderRadius: 2 }}>
        <div style={{ height: 4, width: `${pct * 100}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

/** Mock toggle/button. */
function MBtn({ label, active }: { label: string; active?: boolean }) {
  return (
    <div style={{ display: "inline-block", padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 7, border: `1px solid ${active ? "#3b82f6" : "#334155"}`, background: active ? "#1e40af" : "#0f172a", color: active ? "#fff" : "#94a3b8", margin: "0 4px 4px 0" }}>
      {label}
    </div>
  );
}

/** Labelled box wrapper. */
function Mock({ label, children, height }: { label: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ ...MOCK_WRAP, minHeight: height }}>
      {children}
      <div style={LABEL}>{label}</div>
    </div>
  );
}

// ─── per-section mockups ───────────────────────────────────────────────────────

const HomeMock = () => (
  <Mock label="Home page">
    <div style={{ background: "linear-gradient(180deg,#0f1115,#1a1c22)", padding: 16 }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ width: 60, height: 60, background: "#1f2937", borderRadius: 10, margin: "0 auto 8px", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🌈</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#f1f5f9", marginBottom: 4 }}>🌈 Woven Rainbows by Erin</div>
        <div style={{ fontSize: 10, color: "#94a3b8", maxWidth: 280, margin: "0 auto", lineHeight: 1.5 }}>This app was created by Micah Forstein for his wife Erin Forstein's 50th birthday as a special present.</div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>💎 Explore Chainmail Studio</div>
        <div style={{ background: "#2563eb", color: "#fff", borderRadius: 8, padding: "7px 20px", display: "inline-block", fontSize: 12, fontWeight: 700, boxShadow: "0 4px 12px rgba(37,99,235,0.4)" }}>🧩 Access Studio</div>
      </div>
      <div style={{ background: "#1f2937", borderRadius: 10, padding: 12, marginBottom: 12, maxWidth: 360, margin: "0 auto 12px" }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: "#f1f5f9", marginBottom: 8 }}>Latest Release Notes</div>
        <div style={{ fontSize: 11, color: "#d1d5db", lineHeight: 1.6, marginBottom: 8 }}>This is the initial commercial release of the Chainmail Studio app! Enjoy! Send me your feedback at micahforstein727@gmail.com</div>
        <div style={{ color: "#6b7280", fontSize: 10, marginBottom: 10 }}>— Erin, 5/5/2026</div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ background: "#0f172a", color: "#94a3b8", borderRadius: 6, padding: "3px 8px", fontSize: 9, border: "1px solid #334155" }}>View All Release Notes</div>
          <div style={{ background: "#0f172a", color: "#60a5fa", borderRadius: 6, padding: "3px 8px", fontSize: 9, border: "1px solid #334155" }}>📖 User Manual</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, maxWidth: 360, margin: "0 auto" }}>
        {[["💍","Chainmaille Bracelet","$45"],["⛓","Scale Maille Earrings","$32"],["🔗","Byzantine Necklace","$78"]].map(([em,t,p]) => (
          <div key={t as string} style={{ background: "#1f2937", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ height: 52, background: "#374151", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{em}</div>
            <div style={{ padding: "5px 7px" }}>
              <div style={{ fontSize: 9, color: "#cbd5e1", lineHeight: 1.3, marginBottom: 2 }}>{t}</div>
              <div style={{ fontSize: 9, color: "#93c5fd" }}>{p}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </Mock>
);

const WorkspaceMock = () => (
  <Mock label="Workspace Navigator">
    <div style={{ background: "#0f1115", padding: 16 }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 13, color: "#f1f5f9", marginBottom: 14 }}>Workspace Navigator</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 300, margin: "0 auto" }}>
        {[["🎨 Basic Design","#1e293b"],["💎 Designer (3D)","#1e293b"],["✨ Studio (Freeform)","#1e3a8a"]].map(([l,bg]) => (
          <div key={l as string} style={{ background: bg as string, border: "1px solid #334155", borderRadius: 10, padding: "10px 16px", fontSize: 12, fontWeight: 700, color: "#f1f5f9", textAlign: "center" }}>{l}</div>
        ))}
        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: 1, paddingTop: 4 }}>UTILITIES</div>
        {[["📊 Ring Size Chart"],["⚙️ Weave Tuner"],["🌐 Weave Atlas"]].map(([l]) => (
          <div key={l as string} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "8px 16px", fontSize: 11, fontWeight: 600, color: "#cbd5e1", textAlign: "center" }}>{l}</div>
        ))}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          <div style={{ border: "1px solid #334155", borderRadius: 10, padding: "7px 16px", fontSize: 11, color: "#94a3b8", textAlign: "center" }}>🌈 Woven Rainbows by Erin Etsy Site</div>
          <div style={{ border: "1px solid #334155", borderRadius: 10, padding: "7px 16px", fontSize: 11, color: "#94a3b8", textAlign: "center" }}>🏠 Homepage</div>
        </div>
      </div>
    </div>
  </Mock>
);

const STUDIO_BLUES = [
  ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa"],
  ["#60a5fa","#f472b6","#f472b6","#f472b6","#60a5fa"],
  ["#f472b6","#a78bfa","#a78bfa","#f472b6","#f472b6","#f472b6"],
  ["#60a5fa","#a78bfa","#a78bfa","#a78bfa","#60a5fa"],
];

const StudioCanvasMock = () => (
  <Mock label="Freeform Studio — canvas, toolbar, palette" height={240}>
    <div style={{ display: "flex", height: 240, background: "#111827" }}>
      {/* Left toolbar */}
      <div style={{ width: 44, background: "#0f172a", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingTop: 10 }}>
        {["✏️","⌫","🪣","〰️","◼️","S"].map(i => (
          <div key={i} style={{ width: 32, height: 32, background: i === "✏️" ? "#1d4ed8" : "#1e293b", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: i === "S" ? 11 : 14, color: i === "S" ? "#93c5fd" : "#94a3b8", fontWeight: 700, border: "1px solid #334155" }}>{i}</div>
        ))}
      </div>
      {/* Canvas */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <HexRings rows={4} cols={6} colors={STUDIO_BLUES} spacing={28} r={11} ringW={3.5} />
        </div>
        {/* Palette */}
        <div style={{ background: "#0f172a", borderTop: "1px solid #1e293b", padding: "6px 10px", display: "flex", gap: 6, alignItems: "center" }}>
          {["#60a5fa","#f472b6","#a78bfa","#34d399","#fbbf24","#f87171","#e2e8f0"].map(c => (
            <div key={c} style={{ width: c === "#60a5fa" ? 22 : 18, height: c === "#60a5fa" ? 22 : 18, borderRadius: "50%", background: c, border: c === "#60a5fa" ? "2px solid #fff" : "none", flexShrink: 0 }} />
          ))}
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1px dashed #334155", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 12 }}>+</div>
        </div>
      </div>
    </div>
  </Mock>
);

const StudioScaleMock = () => {
  const scalePositions = [
    {cx:52, cy:38}, {cx:80, cy:38}, {cx:108, cy:38}, {cx:136, cy:38},
    {cx:66, cy:62}, {cx:94, cy:62}, {cx:122, cy:62},
    {cx:52, cy:86}, {cx:80, cy:86}, {cx:108, cy:86}, {cx:136, cy:86},
  ];
  return (
    <Mock label="Scale mode — scales overlaid on rings" height={180}>
      <div style={{ background: "#111827", height: 180, position: "relative", overflow: "hidden" }}>
        <HexRings rows={4} cols={6} colors={[
          ["#64748b","#64748b","#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b","#64748b"],
        ]} spacing={28} r={11} ringW={3} bg="#111827" />
        <svg style={{ position: "absolute", top: 0, left: 44, width: "calc(100% - 44px)", height: "100%" }} viewBox="0 0 220 160">
          {scalePositions.map((p, i) => (
            <Scale key={i} cx={p.cx} cy={p.cy} w={18} h={30} color={i % 3 === 0 ? "#4dd0e1" : i % 3 === 1 ? "#22d3ee" : "#06b6d4"} />
          ))}
        </svg>
      </div>
    </Mock>
  );
};

const StudioTransferMock = () => (
  <Mock label="Image overlay aligned → colors transferred to rings">
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1, background: "#111827", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(135deg,#7c2d12 0%,#991b1b 25%,#b45309 50%,#92400e 75%,#78350f 100%)", opacity: 0.5 }} />
        <HexRings rows={3} cols={5} colors={[
          ["#64748b","#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b","#64748b"],
        ]} spacing={30} r={11} ringW={3} bg="transparent" />
        <div style={{ position: "absolute", bottom: 6, left: 8, fontSize: 9, color: "#94a3b8", background: "rgba(0,0,0,0.7)", padding: "2px 6px", borderRadius: 4 }}>Before transfer</div>
      </div>
      <div style={{ width: 1, background: "#334155" }} />
      <div style={{ flex: 1, background: "#111827" }}>
        <HexRings rows={3} cols={5} colors={[
          ["#dc2626","#dc2626","#b45309","#b45309","#b45309"],
          ["#dc2626","#92400e","#b45309","#fbbf24"],
          ["#b45309","#b45309","#fbbf24","#fbbf24","#92400e"],
        ]} spacing={30} r={11} ringW={3} bg="#111827" />
        <div style={{ position: "absolute", bottom: 6, right: 8, fontSize: 9, color: "#94a3b8", background: "rgba(0,0,0,0.7)", padding: "2px 6px", borderRadius: 4 }}>After transfer</div>
      </div>
    </div>
  </Mock>
);

const StudioShapeMock = () => (
  <Mock label="Shape fill — hexagon shape filled with rings">
    <div style={{ display: "flex", gap: 0 }}>
      <div style={{ flex: 1, background: "#111827" }}>
        <HexRings rows={4} cols={5} colors={[
          ["#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
          ["#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
          ["#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
          ["#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
        ]} spacing={28} r={11} ringW={3} />
      </div>
      <div style={{ width: 120, background: "#0f172a", borderLeft: "1px solid #1e293b", padding: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>Shape Fill</div>
        {["Rectangle","Circle","Hexagon","Diamond"].map(s => (
          <div key={s} style={{ fontSize: 9, color: s === "Hexagon" ? "#fff" : "#94a3b8", background: s === "Hexagon" ? "#1d4ed8" : "transparent", padding: "3px 6px", borderRadius: 5, marginBottom: 3 }}>{s}</div>
        ))}
        <div style={{ marginTop: 8 }}>
          <MSlider label="Width" pct={0.6} />
          <MSlider label="Height" pct={0.6} />
        </div>
        <div style={{ background: "#1d4ed8", color: "#fff", borderRadius: 6, padding: "4px 0", fontSize: 10, fontWeight: 700, textAlign: "center", marginTop: 8 }}>Apply</div>
      </div>
    </div>
  </Mock>
);

const StudioSplineMock = () => (
  <Mock label="Spline tool — rings placed along a curve">
    <div style={{ background: "#111827", padding: 12, height: 150, position: "relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 320 130">
        <path d="M 20,100 C 80,30 160,110 240,40 S 290,80 300,60" stroke="#334155" strokeWidth={1} fill="none" strokeDasharray="4 3" />
        {[[20,100],[55,62],[90,52],[125,70],[160,82],[195,58],[230,42],[265,50],[300,60]].map(([x,y],i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={11} fill="none" stroke="#60a5fa" strokeWidth={3} />
            <circle cx={x} cy={y} r={5} fill="#111827" />
          </g>
        ))}
      </svg>
    </div>
  </Mock>
);

const StudioBOMMock = () => (
  <Mock label="Bill of Materials — ring counts by color">
    <div style={{ background: "#0f172a", padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>Bill of Materials</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e293b" }}>
            {["Color","Hex","Count","Wire","ID"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "4px 6px", color: "#475569", fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ["#60a5fa","Blue","#60a5fa",142,"1.2mm","5/16\""],
            ["#f472b6","Pink","#f472b6",98,"1.2mm","5/16\""],
            ["#a78bfa","Purple","#a78bfa",67,"1.2mm","5/16\""],
          ].map(([c,l,hex,count,wire,id]) => (
            <tr key={l as string} style={{ borderBottom: "1px solid #0f172a" }}>
              <td style={{ padding: "5px 6px" }}><div style={{ width: 14, height: 14, borderRadius: "50%", background: c as string, border: "2px solid rgba(255,255,255,0.15)" }} /></td>
              <td style={{ padding: "5px 6px", color: "#cbd5e1" }}>{l}</td>
              <td style={{ padding: "5px 6px", color: "#93c5fd", fontWeight: 700 }}>{count}</td>
              <td style={{ padding: "5px 6px", color: "#94a3b8" }}>{wire}</td>
              <td style={{ padding: "5px 6px", color: "#94a3b8" }}>{id}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {["Export PDF","Export CSV","Physical Pattern PDF"].map(b => (
          <div key={b} style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 7, padding: "5px 4px", fontSize: 9, color: "#94a3b8", textAlign: "center", fontWeight: 600 }}>{b}</div>
        ))}
      </div>
    </div>
  </Mock>
);

const DesignerMock = () => (
  <Mock label="3D Ring Grid Designer — metallic rendered grid" height={180}>
    <div style={{ background: "#1a1f2e", padding: 12, position: "relative" }}>
      <svg width="100%" viewBox="0 0 340 160">
        {(()=>{
          const cols6 = [
            ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa"],
            ["#60a5fa","#f472b6","#f472b6","#f472b6","#60a5fa"],
            ["#f472b6","#a78bfa","#a78bfa","#f472b6","#f472b6","#f472b6"],
            ["#60a5fa","#a78bfa","#a78bfa","#a78bfa","#60a5fa"],
          ];
          const sp=50, r=18, ry=43;
          return cols6.flatMap((row, ri) =>
            row.map((c, ci) => {
              const x = 20 + r + ci * sp + (ri%2===1 ? sp/2 : 0);
              const y = 16 + r + ri * ry;
              return (
                <g key={`${ri}-${ci}`}>
                  <ellipse cx={x} cy={y+3} rx={r+1} ry={(r+1)*0.28} fill="rgba(0,0,0,0.25)" />
                  <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={6} />
                  <circle cx={x} cy={y} r={r-3} fill="none" stroke={c} strokeWidth={1.5} opacity={0.3} />
                  <circle cx={x-r*0.3} cy={y-r*0.3} r={r*0.12} fill="rgba(255,255,255,0.35)" />
                </g>
              );
            })
          );
        })()}
      </svg>
    </div>
  </Mock>
);

function arColor(ar: number) {
  if (ar < 3) return "#dc2626";
  if (ar < 3.5) return "#f97316";
  if (ar < 5.5) return "#60a5fa";
  if (ar < 7.5) return "#94a3b8";
  return "#ca8a04";
}
function toMM(frac: string) { const [n,d]=frac.split("/").map(Number); return 25.4*n/d; }

const ChartMock = () => {
  const IDs = ["7/64","1/8","5/32","3/16","1/4","5/16"];
  const WDs = [0.9, 1.2, 1.6, 2.0];
  const cellW = 52, cellH = 52;
  const padL = 44, padT = 24;
  const W = padL + WDs.length * cellW + 8;
  const H = padT + IDs.length * cellH + 8;
  return (
    <Mock label="Ring Size Chart — AR color-coded ring grid">
      <div style={{ background: "#0f1a2e", overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", minWidth: 260 }}>
          {/* WD axis labels */}
          {WDs.map((w, wi) => (
            <text key={w} x={padL + wi * cellW + cellW / 2} y={16} textAnchor="middle" fontSize={9} fill="#64748b">{w}mm</text>
          ))}
          {/* ID axis labels */}
          {IDs.map((id, ii) => (
            <text key={id} x={padL - 4} y={padT + ii * cellH + cellH / 2 + 4} textAnchor="end" fontSize={9} fill="#64748b">{id}"</text>
          ))}
          {/* Rings */}
          {IDs.map((id, ii) =>
            WDs.map((wd, wi) => {
              const idMm = toMM(id);
              const ar = idMm / wd;
              const color = arColor(ar);
              const cx = padL + wi * cellW + cellW / 2;
              const cy = padT + ii * cellH + cellH / 2;
              const outerR = Math.min(cellW, cellH) * 0.38;
              const wireR = Math.max(wd * 3.5, 3.5);
              return (
                <g key={`${ii}-${wi}`}>
                  <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={color} strokeWidth={wireR} />
                </g>
              );
            })
          )}
        </svg>
      </div>
    </Mock>
  );
};

const ChartDetailMock = () => {
  const idMm = toMM("5/16");
  const wd = 1.2;
  const ar = idMm / wd;
  return (
    <Mock label="Ring detail panel — measurements and supplier matches">
      <div style={{ display: "flex", background: "#0f1a2e" }}>
        {/* Big ring */}
        <div style={{ width: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <svg width={100} height={100} viewBox="0 0 100 100">
            <circle cx={50} cy={50} r={40} fill="none" stroke={arColor(ar)} strokeWidth={12} />
            <text x={50} y={54} textAnchor="middle" fontSize={10} fill="#f1f5f9" fontWeight="bold">5/16"</text>
            <text x={50} y={66} textAnchor="middle" fontSize={8} fill="#94a3b8">AR {ar.toFixed(1)}</text>
          </svg>
        </div>
        {/* Info panel */}
        <div style={{ flex: 1, padding: 12, borderLeft: "1px solid #1e293b" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[["ID",`${idMm.toFixed(2)} mm`],["WD",`${wd} mm`],["OD",`${(idMm+wd*2).toFixed(2)} mm`],["AR",ar.toFixed(2)]].map(([k,v]) => (
              <div key={k} style={{ background: "#0b1020", borderRadius: 6, padding: "5px 8px" }}>
                <div style={{ fontSize: 9, color: "#475569" }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd", marginBottom: 6 }}>Suppliers</div>
          {[
            { name: "The Ring Lord", colors: ["#c0c0c0","#ffd700","#b87333"] },
            { name: "Chainmail Joe", colors: ["#c0c0c0","#4a9eff"] },
          ].map(s => (
            <div key={s.name} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: "#64748b", marginBottom: 3 }}>{s.name}</div>
              <div style={{ display: "flex", gap: 4 }}>
                {s.colors.map(c => (
                  <div key={c} style={{ width: 14, height: 14, borderRadius: "50%", background: c, border: "1px solid #334155" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Mock>
  );
};

const TunerMock = () => (
  <Mock label="Weave Tuner — mode strip (left), 3D preview, bottom controls" height={280}>
    <div style={{ display: "flex", height: 280, background: "#f3f4f6" }}>
      {/* Mode strip */}
      <div style={{ width: 52, background: "rgba(13,18,28,0.97)", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, paddingTop: 60 }}>
        {[{icon:"📐",active:false},{icon:"🔧",active:true},{icon:"⚖️",active:false},{icon:"✨",active:false},{icon:"🧩",active:false}].map(m => (
          <div key={m.icon} style={{ width: 38, height: 38, borderRadius: 9, border: m.active ? "1px solid #3b82f6" : "1px solid #1e293b", background: m.active ? "#1e40af" : "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{m.icon}</div>
        ))}
      </div>
      {/* 3D preview + bottom sheet */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* 3D scene */}
        <div style={{ flex: 1, background: "#1a1f2e", overflow: "hidden" }}>
          <svg width="100%" height="100%" viewBox="0 0 260 170">
            {[
              {cx:40,cy:60},{cx:80,cy:60},{cx:120,cy:60},{cx:160,cy:60},
              {cx:60,cy:100},{cx:100,cy:100},{cx:140,cy:100},
              {cx:40,cy:140},{cx:80,cy:140},{cx:120,cy:140},{cx:160,cy:140},
            ].map((p,i) => (
              <g key={i}>
                <circle cx={p.cx} cy={p.cy} r={18} fill="none" stroke="#64748b" strokeWidth={5} />
              </g>
            ))}
            {/* Scales */}
            {[
              {cx:40,cy:60},{cx:80,cy:60},{cx:120,cy:60},{cx:160,cy:60},
              {cx:60,cy:100},{cx:100,cy:100},{cx:140,cy:100},
            ].map((p,i) => (
              <Scale key={i} cx={p.cx} cy={p.cy+14} w={20} h={36} color="#4dd0e1" />
            ))}
          </svg>
        </div>
        {/* Bottom sheet */}
        <div style={{ background: "rgba(18,24,32,0.97)", borderTop: "1px solid #1e293b", borderRadius: "12px 12px 0 0", padding: "8px 14px" }}>
          <div style={{ width: 32, height: 3, background: "#334155", borderRadius: 2, margin: "0 auto 8px" }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>🔧 Tune Rings</div>
          <MSlider label="Center spacing" pct={0.54} />
          <MSlider label="Angle In" pct={0.66} />
          <MSlider label="Angle Out" pct={0.34} />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", borderRadius: 7, padding: "4px 0", fontSize: 10, color: "#94a3b8", textAlign: "center" }}>Reload</div>
            <div style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 7, padding: "4px 0", fontSize: 10, color: "#93c5fd", fontWeight: 700, textAlign: "center" }}>Save</div>
          </div>
        </div>
      </div>
    </div>
  </Mock>
);

const TunerScalesMock = () => (
  <Mock label="Tune Scales panel — angles, plane Z, tip lift, row clearance">
    <div style={{ background: "rgba(18,24,32,0.97)", padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", marginBottom: 10 }}>✨ Tune Scales</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "#cbd5e1", fontWeight: 600 }}>Enable scales</span>
        <div style={{ width: 32, height: 16, background: "#1d4ed8", borderRadius: 8, position: "relative" }}>
          <div style={{ position: "absolute", right: 2, top: 2, width: 12, height: 12, background: "#fff", borderRadius: "50%" }} />
        </div>
      </div>
      <div style={{ background: "#1d4ed8", color: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 10, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>🟢 Weave view</div>
      <MSlider label="Angle In" pct={0.64} color="#a78bfa" />
      <MSlider label="Angle Out" pct={0.36} color="#a78bfa" />
      <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 7, padding: "5px 8px", fontSize: 9, color: "#7dd3fc", marginBottom: 8, textAlign: "center" }}>↺ Sync to ring angles (25° / -25°)</div>
      <MSlider label="Plane Z" pct={0.5} />
      <MSlider label="Tip lift" pct={0.58} />
      <MSlider label="Row clearance Z" pct={0.45} />
    </div>
  </Mock>
);

const AtlasMock = () => (
  <Mock label="Weave Atlas — preset weave catalog">
    <div style={{ background: "#0f1115", padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>🌐 Weave Atlas</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { name: "Box Chain", ar: "4.5", wire: "1.2", id: "5/16" },
          { name: "Byzantine", ar: "3.8", wire: "1.6", id: "5/16" },
          { name: "Full Persian", ar: "4.2", wire: "1.2", id: "1/4" },
          { name: "Scale Maille", ar: "3.5", wire: "1.2", id: "5/16" },
        ].map(w => (
          <div key={w.name} style={{ background: "#1f2937", borderRadius: 8, padding: 10, border: "1px solid #1e293b" }}>
            <div style={{ height: 40, background: "#111827", borderRadius: 6, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={80} height={36} viewBox="0 0 80 36">
                {[10,28,46,64].map((x,i) => (
                  <circle key={i} cx={x} cy={18} r={13} fill="none" stroke={arColor(parseFloat(w.ar))} strokeWidth={4} />
                ))}
              </svg>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{w.name}</div>
            <div style={{ fontSize: 9, color: "#64748b" }}>AR {w.ar} · {w.wire}mm wire · {w.id}"</div>
            <div style={{ background: "#1d4ed8", color: "#fff", borderRadius: 6, padding: "3px 0", fontSize: 9, fontWeight: 700, textAlign: "center", marginTop: 8 }}>Apply</div>
          </div>
        ))}
      </div>
    </div>
  </Mock>
);

const Pattern2DMock = () => {
  const grid = [
    ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa","#f472b6","#f472b6"],
    ["#f472b6","#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa","#f472b6"],
    ["#60a5fa","#f472b6","#a78bfa","#a78bfa","#60a5fa","#f472b6","#a78bfa","#a78bfa"],
    ["#f472b6","#a78bfa","#a78bfa","#60a5fa","#f472b6","#a78bfa","#a78bfa","#60a5fa"],
    ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa","#f472b6","#f472b6"],
  ];
  return (
    <Mock label="Erin Pattern 2D — grid-based color planner">
      <div style={{ background: "#111827", padding: 10 }}>
        <div style={{ display: "inline-grid", gridTemplateColumns: "repeat(8,1fr)", gap: 3 }}>
          {grid.flatMap((row, ri) => row.map((c, ci) => (
            <div key={`${ri}-${ci}`} style={{ width: 28, height: 28, background: c, borderRadius: 4, border: ri === 2 && ci === 2 ? "2px solid #fff" : "1px solid rgba(0,0,0,0.2)" }} />
          )))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {["#60a5fa","#f472b6","#a78bfa"].map(c => (
            <div key={c} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: c === "#60a5fa" ? "2px solid #fff" : "none" }} />
          ))}
          <div style={{ width: 18, height: 18, borderRadius: 4, border: "1px dashed #475569", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 12 }}>+</div>
        </div>
      </div>
    </Mock>
  );
};

// ─── shared text components ────────────────────────────────────────────────────

const Feat: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 12, background: "#0f172a", borderRadius: 8, padding: "11px 14px", border: "1px solid #1e293b" }}>
    <div style={{ fontWeight: 700, color: "#93c5fd", marginBottom: 5, fontSize: 13 }}>{title}</div>
    <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.65 }}>{children}</div>
  </div>
);

const Sec: React.FC<{ id: string; icon: string; title: string; children: React.ReactNode }> = ({ id, icon, title, children }) => (
  <section id={id} style={{ marginBottom: 52, scrollMarginTop: 100 }}>
    <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f1f5f9", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1e293b", paddingBottom: 12 }}>
      <span style={{ fontSize: "1.5rem" }}>{icon}</span>{title}
    </h2>
    {children}
  </section>
);

const Sub: React.FC<{ title: string }> = ({ title }) => (
  <h3 style={{ color: "#7dd3fc", fontWeight: 700, margin: "20px 0 10px", fontSize: "0.95rem", letterSpacing: 0.5 }}>{title}</h3>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: "rgba(30,58,138,0.2)", border: "1px solid #3b82f6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#93c5fd", lineHeight: 1.6, margin: "10px 0" }}>
    💡 {children}
  </div>
);

// ─── main component ────────────────────────────────────────────────────────────

export default function UserManual() {
  const [showCompass, setShowCompass] = useState(false);
  const navigate = useNavigate();

  return (
    <div style={{ background: "#070d1a", color: "#e2e8f0", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* Fixed header */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(7,13,26,0.98)", borderBottom: "1px solid #1e293b", padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: "1rem", fontWeight: 800, whiteSpace: "nowrap" }}>📖 User Manual</span>
          <span style={{ color: "#475569", fontSize: 13 }}>Chainmail Studio</span>
          <button onClick={() => navigate("/wovenrainbowsbyerin")} style={{ marginLeft: "auto", background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
            ← Home
          </button>
        </div>
        <nav style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} style={{ whiteSpace: "nowrap", color: "#94a3b8", fontSize: 11, fontWeight: 600, textDecoration: "none", padding: "4px 10px", borderRadius: 6, background: "#0f172a", border: "1px solid #1e293b", flexShrink: 0 }}>
              {s.icon} {s.title}
            </a>
          ))}
        </nav>
      </div>

      {/* Hamburger nav */}
      <DraggablePill id="manual-nav" defaultPosition={{ x: 20, y: 80 }}>
        <button onClick={() => setShowCompass(v => !v)} style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid #1e293b", background: "#1f2937", color: "#d1d5db", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconHamburger size={18} />
        </button>
      </DraggablePill>
      {showCompass && <DraggableCompassNav onNavigate={() => setShowCompass(false)} />}

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "120px 20px 80px" }}>

        <p style={{ color: "#64748b", marginBottom: 40, fontSize: 14, lineHeight: 1.75 }}>
          Chainmail Studio is a professional chainmaille design tool created by <strong style={{ color: "#94a3b8" }}>Micah Forstein</strong> for <strong style={{ color: "#94a3b8" }}>Woven Rainbows by Erin</strong>. This manual covers every page, panel, and tool in the app.
        </p>

        {/* HOME */}
        <Sec id="home" icon="🏠" title="Home Page">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The landing page introduces Woven Rainbows by Erin, shows the latest release notes, and links to the Etsy shop.
          </p>
          <HomeMock />
          <Feat title="🧩 Access Studio Button">Opens the Workspace Navigator to choose a design tool.</Feat>
          <Feat title="Latest Release Notes">Shows the most recent update note. Admins see a <strong>+ Post Update</strong> button. All users see <strong>View All Release Notes</strong> and <strong>📖 User Manual</strong> links.</Feat>
          <Feat title="Etsy Shop Grid">Live grid of featured listings from the Woven Rainbows by Erin Etsy shop. Tap any card to open it in your browser.</Feat>
        </Sec>

        {/* WORKSPACE */}
        <Sec id="workspace" icon="🧭" title="Workspace Navigator">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>Your central hub. All design tools and utilities launch from here.</p>
          <WorkspaceMock />
          <Sub title="Design Tools" />
          <Feat title="Basic Design">Opens Erin Pattern 2D — a grid-based row-and-column color planner. Great for quick color-way sketches.</Feat>
          <Feat title="Designer (3D)">Opens the full 3D Ring Grid Designer with paint, erase, flood fill, and spline fill tools.</Feat>
          <Feat title="Studio (Freeform)">Opens Freeform Studio — the most powerful tool with free-form ring and scale placement, image overlay, shape fill, spline tools, and full export capabilities.</Feat>
          <Sub title="Utilities" />
          <Feat title="Ring Size Chart">Interactive reference chart for inner diameter × wire diameter combinations, color-coded by aspect ratio.</Feat>
          <Feat title="Weave Tuner">3D geometry optimizer. Dial in ring and scale parameters and sync to Studio.</Feat>
          <Feat title="Weave Atlas">Preset weave catalog. Apply a named weave to the 3D Designer instantly.</Feat>
        </Sec>

        {/* STUDIO */}
        <Sec id="studio" icon="✨" title="Freeform Studio">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The primary production design environment. Place rings and scales freely, apply colors, overlay reference images, fill shapes, and export finished patterns.
          </p>
          <StudioCanvasMock />

          <Sub title="Canvas & Drawing" />
          <Feat title="Ring Placement (Draw Mode)">Tap or click-drag on the dark canvas to place rings. Each ring snaps to the hexagonal grid. Hold and drag to paint a continuous stroke.</Feat>
          <Feat title="Erase Tool (⌫)">Select the eraser, then tap any ring or scale to remove it. Drag to erase multiple in one pass.</Feat>
          <Feat title="Flood Fill (🪣)">Tap any ring to flood-fill the entire contiguous region of same-colored rings with the active color — paint-bucket style.</Feat>
          <Feat title="Clear All">Removes all rings and scales. A confirmation prevents accidental clears.</Feat>

          <Sub title="Scale Mode" />
          <Feat title="Enter Scale Mode (S)">Press S or tap the S button in the toolbar. Placing a ring position now places a decorative metallic scale instead. Scale geometry is loaded from the Weave Tuner snapshot.</Feat>
          <StudioScaleMock />

          <Sub title="Color Palette" />
          <Feat title="Selecting a Color">Tap any swatch in the color bar at the bottom to activate it. All new placements use that color. The active swatch has a white ring around it.</Feat>
          <Feat title="Repainting Existing Rings">With Draw mode active and a color selected, tap any placed ring to repaint just that ring.</Feat>
          <Feat title="Adding Colors">Tap the + button at the end of the palette to open the color picker and add a new swatch.</Feat>

          <Sub title="Image Overlay & Color Transfer" />
          <Feat title="Load Reference Image">Open the Image Overlay panel (camera icon) and load a photo. It appears as a semi-transparent layer behind the ring grid.</Feat>
          <Feat title="Align the Image">Use Scale, X, and Y sliders to resize and reposition the image so it aligns with the ring grid.</Feat>
          <Feat title="Image Color Transfer">Tap Transfer Colors. Each ring samples its position on the reference image and receives the nearest palette color — mapping the photo onto your design instantly.</Feat>
          <StudioTransferMock />
          <Note>Transfer works best when your palette closely matches the dominant colors in the reference photo.</Note>

          <Sub title="Shape Fill Tool" />
          <Feat title="Fill a Geometric Area">Open the Shape panel, choose a shape (Rectangle, Circle, Hexagon, Diamond, Ellipse, Triangle), set dimensions, then tap Apply to instantly fill that area with rings.</Feat>
          <StudioShapeMock />

          <Sub title="Spline Tool" />
          <Feat title="Draw a Curve">Select the Spline tool and tap a series of control points on the canvas to define a smooth curve.</Feat>
          <Feat title="Fill Along the Curve">Tap Apply to place rings following the spline path. Adjust density to control ring spacing along the curve.</Feat>
          <StudioSplineMock />

          <Sub title="Bill of Materials & Export" />
          <Feat title="BOM Panel">Opens a table counting rings and scales by color and size — your material shopping list.</Feat>
          <Feat title="Export PDF — Overview">Full-color PDF of the complete design at a readable scale.</Feat>
          <Feat title="Export PDF — Physical Pattern (1:1)">Print-to-scale A4 PDF. One page per color, rings at actual size, with 10 mm ruler ticks so you can verify print scale before using it as a weaving template.</Feat>
          <Feat title="Export CSV">Ring list as a spreadsheet for inventory or supplier orders.</Feat>
          <Feat title="Save / Load Project">Save as a JSON file and reload later. Preserves all positions, colors, scales, and palette settings.</Feat>
          <StudioBOMMock />
        </Sec>

        {/* 3D DESIGNER */}
        <Sec id="designer" icon="💎" title="3D Ring Grid Designer">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A fully 3D-rendered ring grid. Rings are shown with metallic sheen and correct annulus geometry to preview how the finished piece will look under light.
          </p>
          <DesignerMock />
          <Feat title="Paint Mode">Click any ring cell to color it with the active palette color. Drag to paint multiple cells.</Feat>
          <Feat title="Erase Mode">Removes color from ring cells, resetting them to default silver.</Feat>
          <Feat title="Flood Fill">Click a ring to fill its entire contiguous same-colored region with the active color.</Feat>
          <Feat title="Spline Fill">Draw a spline across the grid; all rings along its path receive the active color. Great for color transitions and stripe effects.</Feat>
          <Feat title="Ring Geometry Controls">Sliders for inner diameter, wire diameter, and center spacing scale the 3D preview to match your physical rings.</Feat>
          <Feat title="Weave Atlas Integration">Apply any Atlas preset to instantly reconfigure the ring geometry for a named weave pattern.</Feat>
          <Feat title="BOM, PDF, CSV Export">Identical export pipeline as Freeform Studio.</Feat>
        </Sec>

        {/* RING SIZE CHART */}
        <Sec id="chart" icon="📊" title="Ring Size Chart">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            An interactive reference chart of inner diameter (rows) × wire diameter (columns). Each cell shows a to-scale ring annulus colored by aspect ratio. Pan, zoom, and tap to explore.
          </p>
          <ChartMock />

          <Sub title="Navigation" />
          <Feat title="Pan the Chart">Click-drag or touch-drag to pan. The full grid is larger than the screen — pan to see all combinations.</Feat>
          <Feat title="Zoom">Pinch on mobile or scroll wheel on desktop. Zoom pivots at your finger/cursor position.</Feat>

          <Sub title="Aspect Ratio Color Coding" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "8px 0 14px" }}>
            {[
              { color: "#dc2626", label: "AR < 3.0 — Too tight, won't flex" },
              { color: "#f97316", label: "AR 3.0–3.5 — Tight weave" },
              { color: "#60a5fa", label: "AR 3.5–5.5 — Ideal range" },
              { color: "#94a3b8", label: "AR 5.5–7.5 — Loose weave" },
              { color: "#ca8a04", label: "AR > 7.5 — Very loose" },
            ].map(r => (
              <div key={r.color} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0f172a", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{r.label}</span>
              </div>
            ))}
          </div>

          <Sub title="Ring Detail & Supplier Info" />
          <Feat title="Tap to Zoom In">Tapping any ring smoothly zooms it to fill the view and opens the detail panel.</Feat>
          <Feat title="Tap Again to Reset">Tap the selected ring again to return to the full chart.</Feat>
          <ChartDetailMock />
          <Feat title="Supplier Matches">The detail panel shows products from The Ring Lord, Chainmail Joe, Metal Designz, and Steampunk Garage matched by ID and WD within ±0.35 mm — with color swatches and direct purchase links.</Feat>
        </Sec>

        {/* WEAVE TUNER */}
        <Sec id="tuner" icon="⚙️" title="Weave Tuner">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A live 3D geometry workbench. Dial in ring and scale measurements, preview the result instantly in 3D, then save the configuration so Freeform Studio uses the correct geometry.
          </p>
          <TunerMock />
          <Note>When you Save in the Tuner, Freeform Studio receives the updated geometry automatically. Scale shapes, angles, and Z offsets all sync.</Note>

          <Sub title="Mode Strip — Left Edge Icons" />
          <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
            Five icon buttons on the left edge switch between control groups. Each mode shows only the controls relevant to that task, keeping the panel short so the 3D preview above stays unobstructed.
          </p>

          {[
            { icon: "📐", name: "Calibrate Rings", desc: "Select wire gauge and ring inner diameter to match your physical rings. AR = ID ÷ Wire Diameter updates live. Tap Calibrate to open the screen color accuracy tool." },
            { icon: "🔧", name: "Tune Rings", desc: "Adjust center spacing, Angle In (even rows), and Angle Out (odd rows) to set ring tilt. Zoom slider and pinch/scroll both control the camera. Mark Valid or No Solution, then Save." },
            { icon: "⚖️", name: "Calibrate Scales", desc: "Enter hole inner diameter, shape (teardrop / leaf / round / kite), display color, width, height, drop, and hole position to match your physical scales." },
            { icon: "✨", name: "Tune Scales", desc: "Enable/disable the overlay. Toggle Weave view vs. Alignment view. Set Angle In/Out (tilt per row), sync to ring angles, adjust Plane Z (depth), Tip Lift (pitch), and Row Clearance Z (front-to-back row stacking to prevent clipping)." },
            { icon: "🧩", name: "Tune Weave", desc: "Set weave mode (interlocked vs. independent). Lock scale holes to ring centers. Toggle Overlay Every Cell. When unlocked, adjust Scale Center spacing and Grid X/Y offsets." },
          ].map(m => (
            <div key={m.name} style={{ marginBottom: 12, background: "#0f172a", borderRadius: 8, padding: "11px 14px", border: "1px solid #1e293b", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{m.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: "#93c5fd", marginBottom: 5, fontSize: 13 }}>{m.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.65 }}>{m.desc}</div>
              </div>
            </div>
          ))}

          <TunerScalesMock />
          <Feat title="Save & Reload">Save stores ring + scale configuration to local storage and syncs to Studio. Reload Last Save restores all sliders to the last saved state.</Feat>
          <Feat title="Weave View vs. Alignment View">Weave view: scales in front of rings as in a finished piece. Alignment view: tilts the scene back so you can see how scale holes align with ring centers.</Feat>
        </Sec>

        {/* WEAVE ATLAS */}
        <Sec id="atlas" icon="🌐" title="Weave Atlas">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A curated catalog of preset ring configurations for well-known chainmaille weaves. Apply a preset to the 3D Designer without manually entering geometry values.
          </p>
          <AtlasMock />
          <Feat title="Browse Presets">Scroll through cards showing weave name, a ring preview, and key parameters (AR, wire, ring size).</Feat>
          <Feat title="Apply to Designer">Tap Apply on any preset to push its geometry into the 3D Designer. The grid reconfigures immediately.</Feat>
          <Note>Applying a preset requires a Maker tier account or higher. Browsing the catalog is free.</Note>
        </Sec>

        {/* PATTERN 2D */}
        <Sec id="pattern" icon="🎨" title="Erin Pattern 2D">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A grid-based 2D color planner. Lighter and faster than Freeform Studio — ideal for quick color-way sketches and simple row-and-column patterns.
          </p>
          <Pattern2DMock />
          <Feat title="Grid Painting">Tap any cell to apply the active palette color. Drag to paint continuously across multiple cells.</Feat>
          <Feat title="Row & Column Operations">Insert or delete entire rows and columns. Shift alternate rows to create offset hexagonal patterns.</Feat>
          <Feat title="Reference Image Overlay">Load a reference photo behind the grid, then scale and pan it to align for color-matching or tracing.</Feat>
          <Feat title="Color Palette">Tap any swatch to activate it. Tap + to add new colors with the color picker.</Feat>
          <Feat title="Export">Export the finished pattern as a PNG or PDF for reference during weaving.</Feat>
        </Sec>

        {/* Footer */}
        <div style={{ textAlign: "center", borderTop: "1px solid #1e293b", paddingTop: 32, color: "#475569", fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 8 }}>Chainmail Studio — created by Micah Forstein</div>
          <div>Woven Rainbows by Erin · <a href="https://www.etsy.com/shop/WovenRainbowsByErin" target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa" }}>Etsy Shop</a></div>
          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate("/wovenrainbowsbyerin")} style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13 }}>
              ← Back to Home
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
