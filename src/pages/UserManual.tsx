// src/pages/UserManual.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DraggableCompassNav, DraggablePill } from "../App";
import { IconHamburger } from "../components/icons/ToolIcons";

// ─── section index ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "home",       icon: "🏠",  title: "Home" },
  { id: "workspace",  icon: "🗂️",  title: "Workspace" },
  { id: "studio",     icon: "✨",  title: "Freeform Studio" },
  { id: "designer",   icon: "💎",  title: "3D Designer" },
  { id: "chart",      icon: "📊",  title: "Ring Chart" },
  { id: "tuner",      icon: "⚙️",  title: "Weave Tuner" },
  { id: "atlas",      icon: "🌐",  title: "Weave Atlas" },
  { id: "pattern",    icon: "🪡",  title: "Pattern 2D" },
  { id: "export",     icon: "📦",  title: "Export" },
  { id: "shortcuts",  icon: "⌨️",  title: "Shortcuts" },
];

// ─── styled primitives ─────────────────────────────────────────────────────────

const MOCK_WRAP: React.CSSProperties = {
  border: "1px solid #1e293b",
  borderRadius: 10,
  overflow: "hidden",
  margin: "14px 0",
  background: "#0b1020",
  position: "relative",
};
const LABEL: React.CSSProperties = {
  position: "absolute", bottom: 6, right: 8,
  fontSize: 10, color: "#475569",
  background: "rgba(0,0,0,0.6)", padding: "2px 6px", borderRadius: 4,
};

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

function Scale({ cx, cy, w, h, color }: { cx: number; cy: number; w: number; h: number; color: string }) {
  const hw = w / 2;
  const d = `M ${cx},${cy - h * 0.08}
    C ${cx + hw * 1.1},${cy - h * 0.12} ${cx + hw * 1.15},${cy + h * 0.38} ${cx + hw * 0.36},${cy + h * 0.72}
    C ${cx + hw * 0.18},${cy + h * 0.88} ${cx},${cy + h * 0.94} ${cx},${cy + h * 0.94}
    C ${cx},${cy + h * 0.94} ${cx - hw * 0.18},${cy + h * 0.88} ${cx - hw * 0.36},${cy + h * 0.72}
    C ${cx - hw * 1.15},${cy + h * 0.38} ${cx - hw * 1.1},${cy - h * 0.12} ${cx},${cy - h * 0.08} Z`;
  return <path d={d} fill={color} stroke="#1a3040" strokeWidth={0.8} opacity={0.92} />;
}

function MSlider({ label, pct, color = "#3b82f6", value }: { label: string; pct: number; color?: string; value?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: "#93c5fd" }}>{value ?? Math.round(pct * 100) / 10}</span>
      </div>
      <div style={{ height: 4, background: "#1e293b", borderRadius: 2 }}>
        <div style={{ height: 4, width: `${pct * 100}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function MBtn({ label, active, color }: { label: string; active?: boolean; color?: string }) {
  return (
    <div style={{ display: "inline-block", padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 7,
      border: `1px solid ${active ? (color ?? "#3b82f6") : "#334155"}`,
      background: active ? (color ? color + "33" : "#1e40af") : "#0f172a",
      color: active ? "#fff" : "#94a3b8", margin: "0 4px 4px 0" }}>
      {label}
    </div>
  );
}

function Mock({ label, children, height }: { label: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ ...MOCK_WRAP, minHeight: height }}>
      {children}
      <div style={LABEL}>{label}</div>
    </div>
  );
}

// ─── mockups ───────────────────────────────────────────────────────────────────

const HomeMock = () => (
  <Mock label="Home page">
    <div style={{ background: "linear-gradient(180deg,#0f1115,#1a1c22)", padding: 16 }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ width: 54, height: 54, background: "#1f2937", borderRadius: 10, margin: "0 auto 8px", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🌈</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#f1f5f9", marginBottom: 4 }}>Woven Rainbows by Erin</div>
        <div style={{ fontSize: 10, color: "#94a3b8", maxWidth: 280, margin: "0 auto", lineHeight: 1.5 }}>
          Chainmail Studio — designed by Micah Forstein
        </div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ background: "#2563eb", color: "#fff", borderRadius: 8, padding: "7px 18px", display: "inline-block", fontSize: 12, fontWeight: 700 }}>🧩 Access Studio</div>
      </div>
      <div style={{ background: "#1f2937", borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "#f1f5f9", marginBottom: 6 }}>Latest Release Notes</div>
        <div style={{ fontSize: 10, color: "#d1d5db", lineHeight: 1.5 }}>Initial commercial release of Chainmail Studio</div>
        <div style={{ color: "#6b7280", fontSize: 9, marginTop: 4 }}>— Erin, 5/5/2026</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <div style={{ background: "#0f172a", color: "#94a3b8", borderRadius: 6, padding: "3px 8px", fontSize: 9, border: "1px solid #334155" }}>View All Release Notes</div>
          <div style={{ background: "#0f172a", color: "#60a5fa", borderRadius: 6, padding: "3px 8px", fontSize: 9, border: "1px solid #1d4ed8" }}>📖 User Manual</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {[["💍","Bracelet","$45"],["⛓","Earrings","$32"],["🔗","Necklace","$78"]].map(([em,t,p]) => (
          <div key={t} style={{ background: "#1f2937", borderRadius: 7, overflow: "hidden" }}>
            <div style={{ height: 44, background: "#374151", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{em}</div>
            <div style={{ padding: "4px 6px" }}>
              <div style={{ fontSize: 9, color: "#cbd5e1" }}>{t}</div>
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
    <div style={{ background: "#0f1115", padding: 14 }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 12, color: "#f1f5f9", marginBottom: 12 }}>Workspace Navigator</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, maxWidth: 280, margin: "0 auto" }}>
        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1 }}>DESIGN TOOLS</div>
        {[["🪡 Basic","#1e293b",""],["💎 Designer (3D)","#1e293b",""],["✨ Studio","#1e3a8a","← most powerful"]].map(([l,bg,note]) => (
          <div key={l as string} style={{ background: bg as string, border: "1px solid #334155", borderRadius: 8, padding: "8px 14px", fontSize: 11, fontWeight: 700, color: "#f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{l}</span>
            {note && <span style={{ fontSize: 9, color: "#93c5fd", fontWeight: 400 }}>{note}</span>}
          </div>
        ))}
        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1, paddingTop: 4 }}>UTILITIES</div>
        {[["📊 Ring Size Chart"],["⚙️ Weave Tuner"],["🌐 Weave Atlas"]].map(([l]) => (
          <div key={l as string} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "7px 14px", fontSize: 10, fontWeight: 600, color: "#cbd5e1" }}>{l}</div>
        ))}
      </div>
    </div>
  </Mock>
);

const STUDIO_COLORS = [
  ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa"],
  ["#60a5fa","#f472b6","#f472b6","#f472b6","#60a5fa"],
  ["#f472b6","#a78bfa","#a78bfa","#f472b6","#f472b6","#f472b6"],
  ["#60a5fa","#a78bfa","#a78bfa","#a78bfa","#60a5fa"],
];

const StudioMock = () => (
  <Mock label="Freeform Studio — toolbar (left), canvas, palette (bottom)" height={230}>
    <div style={{ display: "flex", height: 230, background: "#111827" }}>
      {/* Toolbar */}
      <div style={{ width: 44, background: "#0f172a", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, paddingTop: 8 }}>
        {[
          { icon: "☰", label: "Nav", dim: false },
          { icon: "📦", label: "Export", dim: false },
          { icon: "▼", label: "Collapse", dim: true },
          { icon: "✏️", label: "Draw", active: true },
          { icon: "⌫", label: "Erase", dim: false },
          { icon: "↩", label: "Undo", dim: false },
          { icon: "↪", label: "Redo", dim: true },
          { icon: "◼", label: "Shapes", dim: false },
          { icon: "S",  label: "Scale mode", dim: false },
          { icon: "✋", label: "Pan", dim: false },
        ].map(b => (
          <div key={b.label} title={b.label} style={{
            width: 32, height: 32,
            background: b.active ? "#1d4ed8" : b.dim ? "#111827" : "#1e293b",
            borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: b.icon === "S" ? 11 : 13, color: b.dim ? "#374151" : "#94a3b8",
            fontWeight: 700, border: "1px solid #334155", opacity: b.dim ? 0.5 : 1,
          }}>{b.icon}</div>
        ))}
      </div>
      {/* Canvas */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1 }}>
          <HexRings rows={4} cols={6} colors={STUDIO_COLORS} spacing={28} r={11} ringW={3.5} />
        </div>
        {/* Palette bar */}
        <div style={{ background: "#0f172a", borderTop: "1px solid #1e293b", padding: "5px 8px", display: "flex", gap: 5, alignItems: "center" }}>
          {["#60a5fa","#f472b6","#a78bfa","#34d399","#fbbf24","#f87171","#e2e8f0"].map((c, i) => (
            <div key={c} style={{ width: i === 0 ? 22 : 17, height: i === 0 ? 22 : 17, borderRadius: "50%", background: c, border: i === 0 ? "2px solid white" : "none", flexShrink: 0 }} />
          ))}
          <div style={{ width: 17, height: 17, borderRadius: "50%", border: "1px dashed #334155", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 11 }}>+</div>
        </div>
      </div>
    </div>
  </Mock>
);

const ScaleModeMock = () => {
  const positions = [
    {cx:52,cy:38},{cx:80,cy:38},{cx:108,cy:38},{cx:136,cy:38},
    {cx:66,cy:62},{cx:94,cy:62},{cx:122,cy:62},
    {cx:52,cy:86},{cx:80,cy:86},{cx:108,cy:86},{cx:136,cy:86},
  ];
  return (
    <Mock label="Scale mode — teardrop scales overlaid on rings" height={170}>
      <div style={{ background: "#111827", height: 170, position: "relative", overflow: "hidden" }}>
        <HexRings rows={4} cols={6} colors={[
          ["#64748b","#64748b","#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b","#64748b"],
        ]} spacing={28} r={11} ringW={3} bg="#111827" />
        <svg style={{ position: "absolute", top: 0, left: 44, width: "calc(100% - 44px)", height: "100%" }} viewBox="0 0 220 160">
          {positions.map((p, i) => (
            <Scale key={i} cx={p.cx} cy={p.cy} w={18} h={30} color={i%3===0?"#4dd0e1":i%3===1?"#22d3ee":"#06b6d4"} />
          ))}
        </svg>
        <div style={{ position: "absolute", top: 8, left: 52, background: "rgba(37,99,235,0.85)", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 5, padding: "2px 7px" }}>S (Scale Mode)</div>
      </div>
    </Mock>
  );
};

const SelectionMock = () => (
  <Mock label="Rectangle & circle selection — drag to select, then recolor">
    <div style={{ background: "#111827", padding: 10, position: "relative" }}>
      <HexRings rows={3} cols={7} colors={[
        ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa","#60a5fa"],
        ["#60a5fa","#f472b6","#f472b6","#f472b6","#60a5fa","#60a5fa"],
        ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa","#60a5fa"],
      ]} spacing={26} r={10} ringW={3} bg="#111827" />
      <div style={{ position: "absolute", top: 22, left: 66, width: 68, height: 54, border: "2px solid rgba(99,202,220,0.8)", borderRadius: 4, background: "rgba(99,202,220,0.06)" }} />
      <div style={{ position: "absolute", top: 26, left: 154, width: 44, height: 44, borderRadius: "50%", border: "2px solid rgba(167,139,250,0.8)", background: "rgba(167,139,250,0.06)" }} />
    </div>
  </Mock>
);

const ShapeFillMock = () => (
  <Mock label="Shape fill panel — drag on canvas to place shape">
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1, background: "#111827" }}>
        <HexRings rows={4} cols={5} colors={[
          ["#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
          ["#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
          ["#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
          ["#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
        ]} spacing={26} r={10} ringW={3} />
      </div>
      <div style={{ width: 110, background: "#0f172a", borderLeft: "1px solid #1e293b", padding: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#f1f5f9", marginBottom: 7 }}>Shapes</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 8 }}>
          {["□","○","⬡","⯃","♥","◺"].map((s,i) => (
            <div key={s} style={{ width: 26, height: 26, background: i===2?"rgba(59,130,246,0.35)":"rgba(255,255,255,0.06)", border: i===2?"1px solid rgba(59,130,246,0.65)":"1px solid rgba(255,255,255,0.12)", borderRadius: 7, display: "grid", placeItems: "center", fontSize: 13, color: "#e5e7eb" }}>{s}</div>
          ))}
        </div>
        <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.4 }}>Drag on canvas to fill the shape.</div>
      </div>
    </div>
  </Mock>
);

const SplineMock = () => (
  <Mock label="Spline tool — click points, close shape, apply fill">
    <div style={{ background: "#111827", padding: 10, position: "relative" }}>
      <svg width="100%" height="120" viewBox="0 0 320 120">
        <path d="M 30,90 C 80,20 160,100 240,30 S 290,75 290,60" stroke="#334155" strokeWidth={1} fill="none" strokeDasharray="4 3" />
        <path d="M 30,90 C 80,20 160,100 240,30 C 280,10 295,50 290,60 C 285,80 260,100 200,95 C 140,90 80,100 30,90 Z" stroke="rgba(255,255,255,0.9)" strokeWidth={2.5} fill="rgba(255,255,255,0.06)" fillRule="evenodd" />
        {[[30,90],[80,50],[130,65],[180,85],[230,35],[280,60]].map(([x,y],i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={8} fill="rgba(15,23,42,0.80)" stroke="rgba(255,255,255,0.85)" strokeWidth={2.2} />
            <circle cx={x} cy={y} r={3} fill="white" opacity={0.9} />
            <text x={x+10} y={y-9} fontSize={10} fill="rgba(255,255,255,0.7)" style={{ userSelect: "none" }}>{i+1}</text>
          </g>
        ))}
      </svg>
      {/* Mini panel */}
      <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(17,24,39,0.92)", border: "1px solid rgba(0,0,0,.6)", borderRadius: 12, padding: "7px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontWeight: 900, fontSize: 13 }}>🧵</span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>6 pts 🔒</span>
          <div style={{ width: 11, height: 11, borderRadius: 3, background: "#60a5fa", border: "1px solid rgba(0,0,0,.7)" }} />
          <div style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(15,23,42,0.85)", border: "1px solid rgba(255,255,255,0.12)", display: "grid", placeItems: "center", fontSize: 11, color: "#e5e7eb" }}>✕</div>
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {["🔒","↩️","🧼"].map(b => (
            <div key={b} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(15,23,42,0.85)", border: "1px solid rgba(255,255,255,0.12)", display: "grid", placeItems: "center", fontSize: 13 }}>{b}</div>
          ))}
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#2563eb", display: "grid", placeItems: "center", fontSize: 13, color: "white", fontWeight: 900 }}>🪣</div>
        </div>
      </div>
    </div>
  </Mock>
);

const ImageOverlayMock = () => (
  <Mock label="Image overlay panel — load, align, then transfer colors to rings">
    <div style={{ display: "flex" }}>
      {/* Before */}
      <div style={{ flex: 1, background: "#111827", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(135deg,#7c2d12,#991b1b 30%,#b45309 60%,#78350f)", opacity: 0.5 }} />
        <HexRings rows={3} cols={5} colors={[
          ["#64748b","#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b"],
          ["#64748b","#64748b","#64748b","#64748b","#64748b"],
        ]} spacing={28} r={10} ringW={3} bg="transparent" />
        <div style={{ position: "absolute", bottom: 5, left: 6, fontSize: 8, color: "#94a3b8", background: "rgba(0,0,0,0.7)", padding: "1px 5px", borderRadius: 3 }}>Before</div>
      </div>
      <div style={{ width: 1, background: "#334155" }} />
      {/* After */}
      <div style={{ flex: 1, background: "#111827", position: "relative" }}>
        <HexRings rows={3} cols={5} colors={[
          ["#dc2626","#dc2626","#b45309","#b45309","#b45309"],
          ["#dc2626","#92400e","#b45309","#fbbf24"],
          ["#b45309","#b45309","#fbbf24","#fbbf24","#92400e"],
        ]} spacing={28} r={10} ringW={3} bg="#111827" />
        <div style={{ position: "absolute", bottom: 5, right: 6, fontSize: 8, color: "#94a3b8", background: "rgba(0,0,0,0.7)", padding: "1px 5px", borderRadius: 3 }}>After transfer</div>
      </div>
    </div>
  </Mock>
);

const BOMMock = () => (
  <Mock label="Finalize & Export panel — BOM + multiple export formats">
    <div style={{ background: "#0f172a", padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>Finalize & Export</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 10 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e293b" }}>
            {["Color","Count","Wire","ID"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "3px 5px", color: "#475569", fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ["#60a5fa",142,"1.2mm",'5/16"'],
            ["#f472b6", 98,"1.2mm",'5/16"'],
            ["#a78bfa", 67,"1.2mm",'5/16"'],
          ].map(([c,count,wire,id]) => (
            <tr key={c as string} style={{ borderBottom: "1px solid #0f172a" }}>
              <td style={{ padding: "4px 5px" }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: c as string, border: "1.5px solid rgba(255,255,255,0.15)" }} /></td>
              <td style={{ padding: "4px 5px", color: "#93c5fd", fontWeight: 700 }}>{count}</td>
              <td style={{ padding: "4px 5px", color: "#94a3b8" }}>{wire}</td>
              <td style={{ padding: "4px 5px", color: "#94a3b8" }}>{id}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
        {[
          ["Export PDF (BOM + Map)", "#1e40af"],
          ["Physical Pattern PDF (1:1)", "#065f46"],
          ["Export CSV", "#1e293b"],
          ["Export GLB / STLs", "#1e293b"],
        ].map(([label, bg]) => (
          <div key={label} style={{ background: bg, border: "1px solid #334155", borderRadius: 6, padding: "5px 6px", fontSize: 9, color: "#94a3b8", textAlign: "center", fontWeight: 600 }}>{label}</div>
        ))}
      </div>
    </div>
  </Mock>
);

const DesignLibraryMock = () => {
  const starters: Array<{ title: string; size: string; colors: string[][] }> = [
    { title: "Blank Canvas",     size: "—",     colors: [["#374151","#374151","#374151"],["#374151","#374151"],["#374151","#374151","#374151"]] },
    { title: "Small Patch",      size: "6×8",   colors: [["#60a5fa","#60a5fa","#60a5fa"],["#60a5fa","#60a5fa"],["#60a5fa","#60a5fa","#60a5fa"]] },
    { title: "Bracelet Strip",   size: "4×24",  colors: [["#f472b6","#f472b6","#f472b6"],["#f472b6","#f472b6"],["#f472b6","#f472b6","#f472b6"]] },
    { title: "Wide Fill",        size: "10×14", colors: [["#a78bfa","#60a5fa","#a78bfa"],["#60a5fa","#a78bfa"],["#a78bfa","#60a5fa","#a78bfa"]] },
    { title: "Diamond r=5",      size: "11×11", colors: [["#374151","#fbbf24","#374151"],["#fbbf24","#f59e0b"],["#374151","#fbbf24","#374151"]] },
    { title: "Two-Tone Stripe",  size: "8×16",  colors: [["#60a5fa","#60a5fa","#60a5fa"],["#f472b6","#f472b6"],["#60a5fa","#60a5fa","#60a5fa"]] },
    { title: "Rainbow Rows",     size: "7×12",  colors: [["#f87171","#f87171","#f87171"],["#fbbf24","#fbbf24"],["#34d399","#34d399","#34d399"]] },
    { title: "Chevron Pattern",  size: "10×16", colors: [["#60a5fa","#f472b6","#60a5fa"],["#f472b6","#60a5fa"],["#60a5fa","#f472b6","#60a5fa"]] },
  ];
  return (
    <Mock label="Design Library — Starters tab with built-in template designs">
      <div style={{ background: "#0b1020" }}>
        <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>📚 Design Library</span>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: "#1e293b", display: "grid", placeItems: "center", fontSize: 13, color: "#64748b" }}>×</div>
        </div>
        <div style={{ display: "flex", background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
          {["My Designs", "Starters"].map((tab, i) => (
            <div key={tab} style={{ padding: "6px 16px", fontSize: 11, fontWeight: 700, color: i === 1 ? "#60a5fa" : "#64748b", borderBottom: i === 1 ? "2px solid #60a5fa" : "2px solid transparent" }}>{tab}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: 12 }}>
          {starters.map((s) => (
            <div key={s.title} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ height: 52, overflow: "hidden" }}>
                <HexRings rows={3} cols={3} colors={s.colors} spacing={17} r={6} ringW={2.2} bg="#111827" />
              </div>
              <div style={{ padding: "5px 7px 7px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#e2e8f0", marginBottom: 1 }}>{s.title}</div>
                {s.size !== "—" && <div style={{ fontSize: 8, color: "#64748b", marginBottom: 3 }}>{s.size} rings</div>}
                <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                  <div style={{ flex: 1, background: "#1d4ed8", borderRadius: 4, fontSize: 8, color: "#bfdbfe", textAlign: "center", padding: "2px 0", fontWeight: 700 }}>Load</div>
                  <div style={{ flex: 1, background: "#1e293b", borderRadius: 4, fontSize: 8, color: "#94a3b8", textAlign: "center", padding: "2px 0" }}>Append</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Mock>
  );
};

const DesignerMock = () => (
  <Mock label="3D Ring Grid Designer — metallic rendered rings with paint tools">
    <div style={{ background: "#1a1f2e", padding: 14 }}>
      <svg width="100%" viewBox="0 0 340 150">
        {(()=>{
          const cols = [
            ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa"],
            ["#60a5fa","#f472b6","#f472b6","#f472b6","#60a5fa"],
            ["#f472b6","#a78bfa","#a78bfa","#f472b6","#f472b6","#f472b6"],
            ["#60a5fa","#a78bfa","#a78bfa","#a78bfa","#60a5fa"],
          ];
          const sp=50, r=17, ry=43;
          return cols.flatMap((row, ri) =>
            row.map((c, ci) => {
              const x = 20 + r + ci * sp + (ri%2===1 ? sp/2 : 0);
              const y = 14 + r + ri * ry;
              return (
                <g key={`${ri}-${ci}`}>
                  <ellipse cx={x} cy={y+3} rx={r+1} ry={(r+1)*0.28} fill="rgba(0,0,0,0.25)" />
                  <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={5.5} />
                  <circle cx={x} cy={y} r={r-3} fill="none" stroke={c} strokeWidth={1.2} opacity={0.3} />
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
  const IDs = ["7/64","1/8","5/32","3/16","1/4","5/16","3/8"];
  const WDs = [0.9, 1.2, 1.6, 2.0, 2.5];
  const cellW = 44, cellH = 40;
  const padL = 40, padT = 24;
  const W = padL + WDs.length * cellW + 8;
  const H = padT + IDs.length * cellH + 12;
  return (
    <Mock label="Ring Size Chart — pan/zoom/tap; AR color-coded">
      <div style={{ background: "#0E0F12", overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", minWidth: 240 }}>
          {WDs.map((w, wi) => (
            <text key={w} x={padL + wi * cellW + cellW / 2} y={16} textAnchor="middle" fontSize={8} fill="#64748b">{w}mm</text>
          ))}
          {IDs.map((id, ii) => (
            <text key={id} x={padL - 3} y={padT + ii * cellH + cellH / 2 + 3} textAnchor="end" fontSize={8} fill="#64748b">{id}"</text>
          ))}
          {IDs.map((id, ii) =>
            WDs.map((wd, wi) => {
              const idMm = toMM(id);
              const ar = idMm / wd;
              const color = arColor(ar);
              const cx = padL + wi * cellW + cellW / 2;
              const cy = padT + ii * cellH + cellH / 2;
              const outerR = Math.min(cellW, cellH) * 0.36;
              const wireR = Math.max(wd * 3.2, 3.2);
              return (
                <g key={`${ii}-${wi}`}>
                  <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={color} strokeWidth={wireR} opacity={0.85} />
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
  const idMm = toMM("5/16"), wd = 1.2, ar = idMm / wd;
  return (
    <Mock label="Ring detail panel — dimensions, AR, supplier matches">
      <div style={{ display: "flex", background: "#0f1a2e" }}>
        <div style={{ width: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <svg width={88} height={88} viewBox="0 0 88 88">
            <circle cx={44} cy={44} r={36} fill="none" stroke={arColor(ar)} strokeWidth={11} />
            <text x={44} y={47} textAnchor="middle" fontSize={9} fill="#f1f5f9" fontWeight="bold">5/16"</text>
            <text x={44} y={57} textAnchor="middle" fontSize={7} fill="#94a3b8">AR {ar.toFixed(1)}</text>
          </svg>
        </div>
        <div style={{ flex: 1, padding: 10, borderLeft: "1px solid #1e293b" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
            {[["ID",`${idMm.toFixed(2)} mm`],["WD",`${wd} mm`],["OD",`${(idMm+wd*2).toFixed(2)} mm`],["AR",ar.toFixed(2)]].map(([k,v]) => (
              <div key={k} style={{ background: "#0b1020", borderRadius: 5, padding: "4px 7px" }}>
                <div style={{ fontSize: 8, color: "#475569" }}>{k}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f1f5f9" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#93c5fd", marginBottom: 5 }}>Available From</div>
          {[
            { name: "The Ring Lord", colors: ["#c0c0c0","#ffd700","#b87333","#4a9eff"] },
            { name: "Chainmail Joe", colors: ["#c0c0c0","#4a9eff","#dc2626"] },
          ].map(s => (
            <div key={s.name} style={{ marginBottom: 5 }}>
              <div style={{ fontSize: 8, color: "#64748b", marginBottom: 2 }}>{s.name}</div>
              <div style={{ display: "flex", gap: 3 }}>
                {s.colors.map(c => <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c, border: "1px solid #334155" }} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Mock>
  );
};

const TunerMock = () => (
  <Mock label="Weave Tuner — mode strip (left), 3D preview, bottom sheet controls" height={270}>
    <div style={{ display: "flex", height: 270, background: "#f3f4f6" }}>
      {/* Mode strip */}
      <div style={{ width: 50, background: "rgba(13,18,28,0.97)", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingTop: 56 }}>
        {[{icon:"📐",active:false},{icon:"🔧",active:true},{icon:"⚖️",active:false},{icon:"✨",active:false},{icon:"🧩",active:false}].map(m => (
          <div key={m.icon} style={{ width: 36, height: 36, borderRadius: 8, border: m.active?"1px solid #3b82f6":"1px solid #1e293b", background: m.active?"#1e40af":"#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{m.icon}</div>
        ))}
      </div>
      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* 3D scene */}
        <div style={{ flex: 1, background: "#1a1f2e", overflow: "hidden", position: "relative" }}>
          <svg width="100%" height="100%" viewBox="0 0 260 160">
            {[[40,55],[80,55],[120,55],[160,55],[200,55],[60,100],[100,100],[140,100],[180,100],[40,145],[80,145],[120,145],[160,145],[200,145]].map((p,i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={17} fill="none" stroke="#64748b" strokeWidth={5} />
            ))}
            {[[40,55],[80,55],[120,55],[160,55],[200,55],[60,100],[100,100],[140,100],[180,100]].map((p,i) => (
              <Scale key={i} cx={p[0]} cy={p[1]+14} w={18} h={32} color="#4dd0e1" />
            ))}
          </svg>
        </div>
        {/* Bottom sheet */}
        <div style={{ background: "rgba(18,24,32,0.97)", borderTop: "1px solid #1e293b", borderRadius: "10px 10px 0 0", padding: "7px 12px" }}>
          <div style={{ width: 28, height: 3, background: "#334155", borderRadius: 2, margin: "0 auto 6px" }} />
          <div style={{ fontSize: 9, fontWeight: 700, color: "#cbd5e1", marginBottom: 5 }}>🔧 Tune Rings</div>
          <MSlider label="Center spacing" pct={0.54} value="6.7 mm" />
          <MSlider label="Angle In" pct={0.66} value="25°" />
          <MSlider label="Angle Out" pct={0.34} value="-25°" />
          <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
            <div style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "4px 0", fontSize: 9, color: "#94a3b8", textAlign: "center" }}>Reload Last Save</div>
            <div style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "4px 0", fontSize: 9, color: "#93c5fd", fontWeight: 700, textAlign: "center" }}>Save</div>
          </div>
        </div>
      </div>
    </div>
  </Mock>
);

const TunerScalesMock = () => (
  <Mock label="Tune Scales mode — all scale geometry parameters">
    <div style={{ background: "rgba(18,24,32,0.97)", padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", marginBottom: 8 }}>✨ Tune Scales</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 9, color: "#cbd5e1" }}>Enable scales</span>
        <div style={{ width: 28, height: 14, background: "#1d4ed8", borderRadius: 7, position: "relative" }}>
          <div style={{ position: "absolute", right: 2, top: 2, width: 10, height: 10, background: "#fff", borderRadius: "50%" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
        <div style={{ background: "#1d4ed8", color: "#fff", borderRadius: 7, padding: "4px 0", fontSize: 9, fontWeight: 700, textAlign: "center" }}>Weave view</div>
        <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 7, padding: "4px 0", fontSize: 9, color: "#94a3b8", textAlign: "center" }}>Alignment view</div>
      </div>
      <MSlider label="Angle In / Out" pct={0.64} color="#a78bfa" value="25°" />
      <MSlider label="Plane Z" pct={0.5} value="0.0" />
      <MSlider label="Tip Lift" pct={0.58} value="8.5°" />
      <MSlider label="Row Clearance Z" pct={0.45} color="#34d399" value="0.0" />
    </div>
  </Mock>
);

const AtlasMock = () => (
  <Mock label="Weave Atlas — preset catalog, apply to Designer">
    <div style={{ background: "#0f1115", padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#f1f5f9", marginBottom: 10 }}>🌐 Weave Atlas</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        {[
          { name: "Box Chain",    ar: "4.5", wire: "1.2", id: "5/16", wip: true },
          { name: "Byzantine",    ar: "3.8", wire: "1.6", id: "5/16", wip: true },
          { name: "Full Persian", ar: "4.2", wire: "1.2", id: "1/4",  wip: true },
          { name: "Scale Maille", ar: "3.5", wire: "1.2", id: "5/16", wip: true },
        ].map(w => (
          <div key={w.name} style={{ background: "#1f2937", borderRadius: 7, padding: 8, border: "1px solid #1e293b", position: "relative", opacity: w.wip ? 0.7 : 1 }}>
            {w.wip && (
              <div style={{ position: "absolute", top: 6, right: 6, background: "#78350f", color: "#fcd34d", fontSize: 7, fontWeight: 800, padding: "2px 5px", borderRadius: 4, letterSpacing: "0.04em" }}>
                COMING SOON
              </div>
            )}
            <div style={{ height: 36, background: "#111827", borderRadius: 5, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={76} height={32} viewBox="0 0 76 32">
                {[9,26,43,60].map((x,i) => (
                  <circle key={i} cx={x} cy={16} r={12} fill="none" stroke={arColor(parseFloat(w.ar))} strokeWidth={3.5} />
                ))}
              </svg>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f1f5f9", marginBottom: 3 }}>{w.name}</div>
            <div style={{ fontSize: 8, color: "#64748b", marginBottom: 5 }}>AR {w.ar} · {w.wire}mm · {w.id}"</div>
            <div style={{ background: w.wip ? "#374151" : "#1d4ed8", color: w.wip ? "#6b7280" : "#fff", borderRadius: 5, padding: "3px 0", fontSize: 8, fontWeight: 700, textAlign: "center" }}>
              {w.wip ? "In Development" : "Apply to Designer"}
            </div>
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
            <div key={`${ri}-${ci}`} style={{ width: 26, height: 26, background: c, borderRadius: 3, border: ri===2&&ci===2?"2px solid #fff":"1px solid rgba(0,0,0,0.2)" }} />
          )))}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
          {["#60a5fa","#f472b6","#a78bfa"].map((c,i) => (
            <div key={c} style={{ width: 16, height: 16, borderRadius: 3, background: c, border: i===0?"2px solid #fff":"none" }} />
          ))}
          <div style={{ width: 16, height: 16, borderRadius: 3, border: "1px dashed #475569", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 11 }}>+</div>
        </div>
      </div>
    </Mock>
  );
};

// ─── section/feature components ───────────────────────────────────────────────

const Feat: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 10, background: "#0f172a", borderRadius: 8, padding: "10px 14px", border: "1px solid #1e293b" }}>
    <div style={{ fontWeight: 700, color: "#93c5fd", marginBottom: 4, fontSize: 13 }}>{title}</div>
    <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.65 }}>{children}</div>
  </div>
);

const Sec: React.FC<{ id: string; icon: string; title: string; children: React.ReactNode }> = ({ id, icon, title, children }) => (
  <section id={id} style={{ marginBottom: 52, scrollMarginTop: 100 }}>
    <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f1f5f9", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1e293b", paddingBottom: 10 }}>
      <span style={{ fontSize: "1.4rem" }}>{icon}</span>{title}
    </h2>
    {children}
  </section>
);

const Sub: React.FC<{ title: string }> = ({ title }) => (
  <h3 style={{ color: "#7dd3fc", fontWeight: 700, margin: "20px 0 9px", fontSize: "0.92rem", letterSpacing: 0.4 }}>{title}</h3>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: "rgba(30,58,138,0.18)", border: "1px solid #3b82f6", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#93c5fd", lineHeight: 1.6, margin: "10px 0" }}>
    💡 {children}
  </div>
);

const Tip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: "rgba(6,78,59,0.18)", border: "1px solid #10b981", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#6ee7b7", lineHeight: 1.6, margin: "10px 0" }}>
    ✅ {children}
  </div>
);

const Warn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: "rgba(120,53,15,0.18)", border: "1px solid #f59e0b", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#fcd34d", lineHeight: 1.6, margin: "10px 0" }}>
    ⚠️ {children}
  </div>
);

// Keyboard shortcut badge
const KS: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 5, padding: "1px 7px", fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#e2e8f0", margin: "0 2px" }}>{children}</span>
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
          <span style={{ color: "#475569", fontSize: 12 }}>Chainmail Studio by Woven Rainbows by Erin</span>
          <button onClick={() => navigate("/wovenrainbowsbyerin")} style={{ marginLeft: "auto", background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
            ← Home
          </button>
        </div>
        <nav style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} style={{ whiteSpace: "nowrap", color: "#94a3b8", fontSize: 10, fontWeight: 600, textDecoration: "none", padding: "3px 9px", borderRadius: 6, background: "#0f172a", border: "1px solid #1e293b", flexShrink: 0 }}>
              {s.icon} {s.title}
            </a>
          ))}
        </nav>
      </div>

      {/* Hamburger nav pill */}
      <DraggablePill id="manual-nav" defaultPosition={{ x: 20, y: 80 }}>
        <button onClick={() => setShowCompass(v => !v)} style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid #1e293b", background: "#1f2937", color: "#d1d5db", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconHamburger size={18} />
        </button>
      </DraggablePill>
      {showCompass && <DraggableCompassNav onNavigate={() => setShowCompass(false)} />}

      {/* Body */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "118px 20px 80px" }}>

        <p style={{ color: "#64748b", marginBottom: 40, fontSize: 13, lineHeight: 1.8 }}>
          Chainmail Studio is a professional chainmaille design tool created by <strong style={{ color: "#94a3b8" }}>Micah Forstein</strong> for <strong style={{ color: "#94a3b8" }}>Woven Rainbows by Erin</strong>. This manual documents every page, panel, tool, and control in the app.
        </p>

        {/* ── HOME ─────────────────────────────────────────────────────────── */}
        <Sec id="home" icon="🏠" title="Home Page · /wovenrainbowsbyerin">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The public landing page. No account required.
          </p>
          <HomeMock />

          <Feat title="Access Studio button">
            Navigates to the Workspace Navigator where you pick a design tool.
          </Feat>
          <Feat title="Latest Release Notes">
            Shows the most recent update post. <em>View All Release Notes</em> opens the full release history at <code style={{ color: "#93c5fd", fontSize: 11 }}>/release-notes</code>. <em>📖 User Manual</em> opens this page.
            Admin users see a <strong>+ Post Update</strong> button to publish new entries.
          </Feat>
          <Feat title="Etsy shop gallery">
            Live grid of product listings from the Woven Rainbows by Erin Etsy shop. Tap any card to open it in a new browser tab.
          </Feat>
          <Feat title="Footer links">
            Links to the User Manual, Pricing, EULA, Commercial License, and the Etsy shop.
          </Feat>
        </Sec>

        {/* ── WORKSPACE ───────────────────────────────────────────────────── */}
        <Sec id="workspace" icon="🗂️" title="Workspace Navigator · /workspace">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            Your central hub after signing in. Shows your account tier and links to every design tool and utility. Requires a free account or higher.
          </p>
          <WorkspaceMock />

          <Sub title="Account & tier badge" />
          <Feat title="Tier badge (top right)">
            Shows your current plan: <strong>Free</strong>, <strong>Maker</strong>, <strong>Crafter</strong>, or <strong>Studio</strong>. Tap <em>Pricing</em> to see what each tier unlocks. Tap <em>Sign out</em> to end your session.
          </Feat>

          <Sub title="Design tools" />
          <Feat title="🪡 Basic (Erin Pattern 2D)">
            Grid-based color planner. Lightest tool — great for quick color-way sketches. Available to all tiers.
          </Feat>
          <Feat title="💎 Designer (3D Ring Grid)">
            Full 3D-rendered ring grid with paint, erase, flood fill, spline fill, and image overlay. Requires Maker tier or higher.
          </Feat>
          <Feat title="✨ Studio (Freeform Designer)">
            The most powerful tool: free-form ring and scale placement, image overlay with color transfer, shape fill, spline fill, and full export. Requires Studio tier.
          </Feat>

          <Sub title="Utilities" />
          <Feat title="📊 Ring Size Chart">Interactive AR reference — always free, no account needed.</Feat>
          <Feat title="⚙️ Weave Tuner">3D geometry optimizer for rings and scales. Preview is free; saving weave sets requires a free account.</Feat>
          <Feat title="🌐 Weave Atlas">Preset weave catalog. Browsing is free; applying presets requires Maker tier.</Feat>
        </Sec>

        {/* ── FREEFORM STUDIO ─────────────────────────────────────────────── */}
        <Sec id="studio" icon="✨" title="Freeform Studio · /freeform">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The primary production design environment. Click or drag to place rings and scales on a free-form hex grid, apply colors, overlay reference images, fill shapes, and export finished patterns.
          </p>
          <StudioMock />

          <Sub title="Left toolbar" />
          <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
            The vertical toolbar on the left edge contains all tools. It can be collapsed with the ▼ button to reclaim screen space.
          </p>

          <Feat title="☰ Navigation Menu">Opens the draggable compass to jump between pages.</Feat>
          <Feat title="📦 Finalize & Export">Opens the export panel — PDF, CSV, 3D model, and BOM.</Feat>
          <Feat title="▼ Collapse / ▲ Expand">Hides all tool buttons below it to maximise canvas space. Tap again to restore.</Feat>
          <Feat title="✏️ Draw (Paint rings)">
            The primary drawing tool. Click or drag on the dark canvas to place rings at their hex-grid positions. Rings snap to the grid automatically. The active palette color is applied to each new ring.
          </Feat>
          <Feat title="⌫ Eraser">
            Click any ring or scale to remove it. Drag to erase a continuous stroke. Works on both ring and scale layers.
          </Feat>
          <Feat title="↩️ Undo / ↪️ Redo">
            Step through the full edit history one action at a time. Keyboard shortcuts: <KS>Ctrl+Z</KS> / <KS>Cmd+Z</KS> to undo, <KS>Ctrl+Shift+Z</KS> / <KS>Ctrl+Y</KS> to redo.
          </Feat>
          <Feat title="◼ □ / ○ Shape Select (rubber-band)">
            Two selection tools — rectangle (□) and circle (○) — appear in the toolbar. Drag on the canvas to draw a selection region. All rings inside are highlighted. Once selected, tap any palette color to recolor the entire selection, or tap the eraser to remove all rings in the selection.
          </Feat>
          <SelectionMock />
          <Feat title="◼ Shape Fill">
            Opens the Shape Fill picker with six shape options: Square (□), Circle (○), Hexagon (⬡), Octagon (⯃), Heart (♥), and Triangle (◺). Once a shape is chosen, drag on the canvas to define its bounding box — all rings whose grid positions fall inside the shape are placed immediately.
          </Feat>
          <ShapeFillMock />
          <Feat title="S — Scale Mode toggle">
            Switches the drawing tool between <strong>ring mode</strong> and <strong>scale mode</strong>. In scale mode the S button is highlighted blue. Placing a position now drops a decorative scale instead of a ring. Scale geometry (shape, size, angles) is driven by the Weave Tuner snapshot.
          </Feat>
          <ScaleModeMock />
          <Feat title="✋ Pan / Drag view">
            Activates pan mode — click and drag to scroll the canvas without placing rings. On touch devices, two-finger drag always pans regardless of tool. Scroll wheel or pinch-to-zoom changes the zoom level (range 0.02× to 6.0×).
          </Feat>
          <Feat title="🖼️ Image Overlay">
            Opens the Image Overlay panel (see below). Studio tier required.
          </Feat>
          <Feat title="🗑️ Clear All">
            Removes every ring and scale from the canvas. A confirmation dialog prevents accidental clears.
          </Feat>
          <Feat title="⚙️ Geometry & JSON Controls">
            Opens the right-side geometry panel showing ring and scale tuner parameters (center spacing, wire diameter, ring inner diameter, etc.) and JSON import/export for the current canvas state.
          </Feat>
          <Feat title="📚 Design Library">
            Opens the Design Library with two tabs:
            <br /><strong>My Designs</strong> — previously saved canvases. Each entry can be <em>Loaded</em> (replace canvas) or <em>Appended</em> (merge rings alongside existing work).
            <br /><strong>Starters</strong> — built-in template designs to get started quickly. Can also be loaded or appended.
          </Feat>
          <DesignLibraryMock />
          <Feat title="💰 Cost Estimator">
            Opens the Material Cost Estimator (Studio tier). Matches your BOM ring/scale counts against the supplier catalog, shows per-color pack counts, estimated totals per supplier, and flags potential import tariff scenarios. Estimates only — verify on the supplier site before ordering.
          </Feat>
          <Feat title="🎨 Canvas background">
            Toggles between dark and light canvas background. A custom color picker lets you set any background color for contrast testing.
          </Feat>
          <Feat title="↺ Reset UI">
            Resets floating panel positions, view transform (zoom/pan), and all tool states back to defaults.
          </Feat>

          <Sub title="Color palette" />
          <Feat title="Active color swatch">
            The enlarged swatch with a white ring is the active paint color. Tap any swatch to activate it. Hold a swatch to open the color picker and change it.
          </Feat>
          <Feat title="Adding colors">
            Tap the + button at the end of the palette to open the color picker and add a new swatch.
          </Feat>
          <Feat title="Palette manager">
            A secondary palette icon in the toolbar opens the palette manager — rename swatches, reorder them, or delete ones you no longer need.
          </Feat>
          <Feat title="Reset palette">
            Restores the palette to the default set of colors.
          </Feat>
          <Feat title="Browse Supplier Colors">
            Fetches live ring and scale color data from The Ring Lord, Chainmail Joe, Metal Designz, and Steampunk Garage (cached 6 hours). Results appear as swatches sorted by supplier so you can design with colors that actually exist in the catalog.
          </Feat>
          <Feat title="🔄 Refresh Colors button">
            Forces a fresh fetch from all suppliers (bypasses the 6-hour cache). Also available in the Ring Chart, Color Calibration, and Designer palette.
          </Feat>

          <Sub title="Image overlay & color transfer" />
          <Feat title="Load a reference image">
            In the Image Overlay panel, tap the image area or drop a file to load a reference photo. It appears as a semi-transparent layer behind the ring grid.
          </Feat>
          <Feat title="Align the image">
            Use the Scale, X, and Y sliders to resize and reposition the image so it aligns with the ring grid. You can also click-drag the image directly in the preview to pan it.
          </Feat>
          <Feat title="Transfer scope">
            Choose <strong>All rings</strong> to transfer colors to every placed ring, or <strong>Selection only</strong> to restrict the transfer to a previously rubber-banded selection.
          </Feat>
          <Feat title="Transfer to Rings">
            Each ring samples the image pixel at its world position and is recolored to the nearest matching palette color. Maps the photo onto your design instantly.
          </Feat>
          <ImageOverlayMock />
          <Note>Transfer works best when your palette closely matches the dominant colors in the reference image. Add or adjust swatches before transferring for the most accurate result.</Note>

          <Sub title="Spline fill tool" />
          <Feat title="Open spline tool">
            Tap the 〰️ spline button in the toolbar. A transparent overlay appears and the compact spline panel opens (draggable, persists position between sessions).
          </Feat>
          <Feat title="Place control points">
            Tap anywhere on the canvas (not on a UI element) to add control points. A smooth Catmull-Rom curve is drawn through them in real time. Point numbers appear next to each dot.
          </Feat>
          <Feat title="🔒 Close the shape">
            Tap the lock button in the panel to close the spline into a filled polygon. The fill preview turns semi-transparent in the active color. When the last point is dragged close to the first point, a green "snap" label appears — the shape will auto-close on Apply.
          </Feat>
          <Feat title="↩️ Undo / 🧼 Clear">
            Undo removes the last placed point. Clear removes all points and starts fresh.
          </Feat>
          <Feat title="🪣 Apply (fill rings)">
            Fills every ring whose grid position falls inside the closed spline with the current active palette color. The spline tool closes and the result is committed to the canvas. Active only when the shape is closed or the endpoints are close enough to snap.
          </Feat>
          <SplineMock />
          <Note>The spline operates in screen coordinates. Zoom in before placing points for finer control. Undo in the main canvas (Ctrl+Z) reverses the fill after Apply.</Note>

          <Sub title="Save & load" />
          <Feat title="💾 Save project">
            Saves the entire canvas — ring positions, colors, scale positions, palette, and overlay settings — as a JSON file to your device.
          </Feat>
          <Feat title="📂 Load project">
            Loads a previously saved JSON file. Choose <em>Replace</em> to clear the canvas first, or <em>Append</em> to merge the loaded rings alongside what's already there (merged rings are shifted right to avoid overlaps).
          </Feat>

          <Sub title="Bill of Materials & export" />
          <BOMMock />
          <Feat title="Export PDF (BOM + Map)">
            Generates a multi-page PDF containing the full Bill of Materials (ring/scale counts by color and size), tiled overview maps of the design at multiple scales, and a color preview. The file is named <code style={{ fontSize: 11, color: "#93c5fd" }}>BOM.pdf</code>.
          </Feat>
          <Feat title="Physical Pattern PDF (1:1)">
            Print-to-scale A4 PDF (210×297 mm, 10 px/mm). One page per color, rings drawn at true physical size with an 8 mm margin and ruler ticks every 10 mm. Print at exactly 100% scale and use as a placement template for weaving.
          </Feat>
          <Feat title="Export CSV">
            Ring and scale list as a spreadsheet with columns for color, position, inner diameter, wire diameter, and material — ready for inventory or supplier order entry.
          </Feat>
          <Feat title="Export GLB (VR / Universal)">
            Exports the full design as a binary GLTF file. Each color becomes a named mesh group. Compatible with Unity, Meta Quest, WebXR, Bambu Studio, PrusaSlicer, and most modern 3D tools.
          </Feat>
          <Feat title="Per-Color STLs">
            Exports one STL file per unique color. Assign each STL to a different extruder in your slicer for multi-material 3D printing.
          </Feat>
        </Sec>

        {/* ── 3D DESIGNER ─────────────────────────────────────────────────── */}
        <Sec id="designer" icon="💎" title="3D Ring Grid Designer · /designer">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A fully 3D-rendered ring grid with metallic sheen and correct annulus geometry. Every ring is a real torus; you can rotate the scene for a preview of how the finished piece will look under studio lighting. Requires Maker tier or higher.
          </p>
          <DesignerMock />

          <Sub title="Drawing tools" />
          <Feat title="🎨 Paint Mode">
            Click any ring to color it with the active palette color. Drag to paint multiple rings in one stroke. Paint mode locks the camera to 2D (top-down) view.
          </Feat>
          <Feat title="⌫ Erase Mode">
            Removes the painted color from ring cells, resetting them to the default base material color. Toggle within the Camera Tools menu.
          </Feat>
          <Feat title="Flood Fill">
            Tap any ring to fill its entire contiguous same-colored region with the active color — paint-bucket style. Accessed from the Camera Tools menu.
          </Feat>
          <Feat title="↩️ Undo / ↪️ Redo">
            Full edit history for paint actions. Keyboard: <KS>Ctrl+Z</KS> undo, <KS>Ctrl+Shift+Z</KS> redo.
          </Feat>
          <Feat title="🧹 Clear Paint">
            Removes all color from the grid, returning every ring to the base material.
          </Feat>

          <Sub title="Spline fill" />
          <Feat title="〰️ Spline Fill (Designer)">
            Works identically to the Freeform Studio spline tool. Draw a closed polygon over the ring grid; all rings whose screen positions fall inside the shape receive the active color. The Designer automatically locks to top-down view while the spline tool is open.
          </Feat>

          <Sub title="Camera & navigation" />
          <Feat title="📷 Camera Tools menu">
            Accessed from the toolbar. Contains: Image Overlay, Paint toggle, Erase toggle, Reset View, Undo, Redo, Clear Paint, and the Gear (⚙️) sub-panel.
          </Feat>
          <Feat title="Rotate (3D view)">
            When Paint Mode is off, click-drag to orbit the camera around the ring grid for a 3D perspective.
          </Feat>
          <Feat title="▶ Controls — grid size">
            Sets the number of columns and rows in the ring grid (up to 400×400, memory-limited by device).
          </Feat>

          <Sub title="Ring geometry" />
          <Feat title="Base material">
            Click the material label below the toolbar to open the quick material picker. Choose from pre-set metals (aluminum, sterling silver, stainless, brass, copper, etc.) or open the Supplier Colors browser to pick a color that exists in the catalog.
          </Feat>
          <Feat title="🧰 Supplier & Atlas">
            Opens the combined Supplier Menu + Atlas Palette panel. Apply a named weave from the Atlas to instantly reconfigure geometry (inner diameter, wire diameter, center spacing, and ring tilt angles) without opening the Tuner.
          </Feat>

          <Sub title="Save, load, export" />
          <Feat title="💾 / 📂 Save & Load">
            JSON project files include grid parameters, paint map, and weave geometry. Load replaces the current state entirely.
          </Feat>
          <Feat title="📦 Finalize & Export">
            Identical export pipeline as Freeform Studio: PDF (BOM + map), Physical Pattern PDF, CSV, GLB, and per-color STLs.
          </Feat>

          <Note>Weave Atlas and Weave Tuner geometry changes are preserved when loading/saving. The active Tuner snapshot always overrides designer defaults.</Note>
        </Sec>

        {/* ── RING SIZE CHART ──────────────────────────────────────────────── */}
        <Sec id="chart" icon="📊" title="Ring Size Chart · /chart">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            An interactive reference chart of inner diameter × wire diameter combinations. Each cell shows a to-scale ring annulus color-coded by aspect ratio (AR). Always free — no account needed.
          </p>
          <ChartMock />

          <Sub title="Navigation" />
          <Feat title="Pan">Click-drag (mouse) or touch-drag (one finger) to scroll the chart. The full grid is larger than the screen.</Feat>
          <Feat title="Zoom">Scroll wheel on desktop, or pinch on mobile. Zoom pivots around your cursor/finger position. Tap the <em>Fit chart</em> button at the bottom to reset to the best-fit view.</Feat>
          <Feat title="Tap a ring">Smoothly animates to fill the view and opens the detail panel (see below). Tap the same ring again, or tap empty space, to return to the full chart.</Feat>

          <Sub title="Aspect ratio legend" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, margin: "8px 0 14px" }}>
            {[
              { color: "#dc2626", label: "AR < 3.0 — Too tight, rings won't flex" },
              { color: "#f97316", label: "AR 3.0–3.5 — Tight / snug weave" },
              { color: "#60a5fa", label: "AR 3.5–5.5 — Ideal range for most weaves" },
              { color: "#94a3b8", label: "AR 5.5–7.5 — Loose weave" },
              { color: "#ca8a04", label: "AR > 7.5 — Very loose, may not hold" },
            ].map(r => (
              <div key={r.color} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0f172a", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ width: 11, height: 11, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{r.label}</span>
              </div>
            ))}
          </div>

          <Sub title="Ring detail panel" />
          <ChartDetailMock />
          <Feat title="Dimensions grid">
            Shows Inner Diameter (ID), Wire Diameter (WD), Outer Diameter (OD), and Aspect Ratio (AR = ID ÷ WD) in millimeters.
          </Feat>
          <Feat title="AR badge">
            Color-coded AR label with the plain-language fit description (Too tight / Tight / Ideal / Good / Loose).
          </Feat>
          <Feat title="Supplier matches">
            Products from The Ring Lord, Chainmail Joe, Metal Designz, and Steampunk Garage matched within ±0.35 mm of the tapped ring's ID and WD. Shows available colors as swatches and a direct link to the supplier page.
          </Feat>
          <Feat title="🔄 Refresh Colors button (top-right)">
            Fetches the latest ring colors from all supplier sites and caches them for 6 hours. Swatches in the detail panel update automatically.
          </Feat>

          <Sub title="Axis labels" />
          <Feat title="Inner Diameter (rows) ×  Wire Diameter (columns)">
            Rows go from 7/64" to 5/8" (11 ID sizes). Columns go from 0.9 mm (~20 gauge) to 3.0 mm (~10 gauge). Each cell also shows the calculated AR below the ring.
          </Feat>
        </Sec>

        {/* ── WEAVE TUNER ─────────────────────────────────────────────────── */}
        <Sec id="tuner" icon="⚙️" title="Weave Tuner · /tuner">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A live 3D geometry workbench. Set ring and scale parameters, see the result instantly in a 3D WebGL scene, then save the configuration so Freeform Studio uses the correct geometry. Preview is free; saving requires a free account.
          </p>
          <TunerMock />

          <Note>
            When you save in the Tuner, Freeform Studio receives the updated geometry automatically via <code style={{ fontSize: 11 }}>localStorage["freeform.tunerSnapshot.v1"]</code>. Ring center spacing, tilt angles, scale shape, Z offsets, and row clearance all sync without reloading Studio.
          </Note>

          <Sub title="Mode strip — five panels" />
          <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 10 }}>
            Five icon buttons on the left edge (or a segmented control on desktop) switch between control groups. Only one panel is shown at a time.
          </p>

          {[
            { icon: "📐", name: "Calibrate Rings",
              desc: "Enter your ring's inner diameter and wire gauge to compute AR. Tap Calibrate to open the Color Calibration screen where you can fine-tune screen color accuracy so the 3D preview matches your physical rings. A Mark Valid / No Solution flag records whether this combination works." },
            { icon: "🔧", name: "Tune Rings",
              desc: "Adjust Center Spacing (distance between ring centers in mm), Angle In (rotation of even rows), and Angle Out (rotation of odd rows). Zoom controls and pinch/scroll move the camera. Save stores the snapshot; Reload Last Save restores all sliders." },
            { icon: "⚖️", name: "Calibrate Scales",
              desc: "Enter scale dimensions: Hole Diameter, Width, Height, Drop (distance from hole to body center), and Shape. Four scale shapes are available: Teardrop, Leaf, Round, and Kite. A color swatch lets you preview different anodized colors." },
            { icon: "✨", name: "Tune Scales",
              desc: "Enable or disable the scale overlay. Toggle between Weave view (scales in front of rings, as in a finished piece) and Alignment view (scene tilts back so you can see how scale holes align with ring centers). Set Angle In/Out (per-row tilt), Plane Z (depth offset of the scale layer), Tip Lift (pitch angle of each scale, 0 = flat), and Row Clearance Z (front-to-back Z stacking between rows to prevent clipping — range −5 to +5)." },
            { icon: "🧩", name: "Tune Weave",
              desc: "Choose weave mode: Interlocked (scales share ring connections) or Independent (scales float freely). Lock Scale Holes to Ring Centers snaps scale hole positions to the nearest ring center. Toggle Overlay Every Cell. When unlocked, adjust Scale Center Spacing, Grid Offset X, and Grid Offset Y for fine-tuned alignment." },
          ].map(m => (
            <div key={m.name} style={{ marginBottom: 10, background: "#0f172a", borderRadius: 8, padding: "10px 14px", border: "1px solid #1e293b", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{m.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: "#93c5fd", marginBottom: 4, fontSize: 13 }}>{m.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.65 }}>{m.desc}</div>
              </div>
            </div>
          ))}

          <TunerScalesMock />

          <Sub title="Save & load" />
          <Feat title="Save">
            Writes all ring + scale parameters to localStorage and pushes the snapshot to Freeform Studio. Named save slots are listed in the saved-weaves picker.
          </Feat>
          <Feat title="Reload Last Save">
            Restores all sliders to the last saved state, discarding any unsaved changes.
          </Feat>
          <Feat title="Named weave sets">
            Give a configuration a name and it appears in the dropdown for future sessions. Load any saved set to restore its exact geometry.
          </Feat>

          <Sub title="Color Calibration (linked from Calibrate Rings)" />
          <Feat title="📐 Calibrate → Color Calibration screen">
            Accessible at <code style={{ fontSize: 11, color: "#93c5fd" }}>/_calibration</code>. Renders two instances of the same ring or scale side by side — left uses <code style={{ fontSize: 11 }}>setColorAt</code> (Three.js instanced), right uses a manual <code style={{ fontSize: 11 }}>instanceColor</code> write. Adjust Gain (0.4–1.0) and Gamma (0.8–1.6) sliders until both look identical on your screen. Run Calibration sweeps the full palette automatically, then you can edit each row manually and Save &amp; Apply to lock the calibration globally for all pages.
          </Feat>
          <Feat title="Ring Cal / Scale Cal toggle">
            Switches the calibration shape between a torus ring (for ring color accuracy) and a flat teardrop scale (for scale color accuracy). Results can be saved independently.
          </Feat>
        </Sec>

        {/* ── WEAVE ATLAS ─────────────────────────────────────────────────── */}
        <Sec id="atlas" icon="🌐" title="Weave Atlas · /atlas">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A curated catalog of preset ring configurations for well-known chainmaille weaves. Browse freely — applying a preset to the Designer requires Maker tier.
          </p>
          <AtlasMock />

          <div style={{ background: "#1c1008", border: "1px solid #92400e", borderRadius: 10, padding: "12px 14px", margin: "14px 0" }}>
            <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>🚧 Weave canvas support — current status</div>
            <p style={{ color: "#d97706", fontSize: 12, lineHeight: 1.7, margin: 0 }}>
              The current canvas engine renders <strong style={{ color: "#fcd34d" }}>4-in-1 European</strong> ring placement only. All other weave architectures — Box Chain, Byzantine, Full Persian, Scale Maille grid, and Japanese variants — are <strong style={{ color: "#fcd34d" }}>work in progress</strong> and not yet released.
            </p>
            <p style={{ color: "#92400e", fontSize: 11, marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
              Atlas presets for those weaves configure ring <em>geometry</em> (AR, wire, center spacing) correctly today, but the canvas will still render a 4-in-1 European grid. Each weave pattern requires its own placement algorithm, unit-cell definition, and connectivity graph. These are actively being developed.
            </p>
          </div>

          <Feat title="Browse presets">
            Scroll through cards. Each card shows the weave name, a live ring preview colored by AR, and the key parameters: Aspect Ratio, wire diameter, and recommended inner diameter. Cards marked <strong>Coming Soon</strong> represent weaves whose geometry is catalogued but whose canvas layout engine is not yet released.
          </Feat>
          <Feat title="Apply to Designer">
            Tap <em>Apply to Designer</em> on any released card to push the preset's inner diameter, wire diameter, center spacing, and tilt angles directly into the 3D Designer. The ring grid reconfigures immediately. Existing paint is preserved.
          </Feat>
          <Feat title="Tune from Atlas">
            Clicking any <strong>unchecked (+)</strong> cell in the Atlas table opens the Weave Tuner pre-loaded with that ring size combination and a guided setup flow — tune the rings first, then enable and calibrate scales.
          </Feat>
          <Note>The Atlas applies geometry only — it does not change colors or layout. Apply a preset, then paint freely on top.</Note>
        </Sec>

        {/* ── PATTERN 2D ──────────────────────────────────────────────────── */}
        <Sec id="pattern" icon="🪡" title="Erin Pattern 2D · /erin2d">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A lightweight grid-based 2D color planner. Faster and simpler than Freeform Studio — ideal for quick color-way sketches and simple row-and-column patterns. Free for all tiers.
          </p>
          <Pattern2DMock />
          <Feat title="Grid painting">
            Tap any cell to apply the active palette color. Click-drag to paint continuously across multiple cells in one stroke.
          </Feat>
          <Feat title="Grid size controls">
            Number inputs set the number of rows and columns. Expanding the grid adds new empty rows/columns at the edges. The canvas auto-scrolls to remain centered.
          </Feat>
          <Feat title="Row offset (hex offset)">
            Row Offset X and Row Offset Y sliders shift alternating rows to simulate a hexagonal offset grid, matching the actual ring layout in Studio.
          </Feat>
          <Feat title="Pan & zoom">
            Click-drag on empty cells to pan the canvas. Scroll wheel or pinch to zoom. The view can be reset at any time.
          </Feat>
          <Feat title="Reference image overlay">
            Load a reference image behind the grid, then pan and zoom to align it. Use it as a color-matching or tracing guide. Supports drag-and-drop file loading.
          </Feat>
          <Feat title="Color palette">
            Tap any swatch to activate it. Tap + to add new colors with the color picker.
          </Feat>
          <Feat title="Save & Load">
            Save the full canvas state (grid, colors, palette, overlay settings) to a JSON file. Load restores it completely.
          </Feat>
          <Feat title="Export (BOM + PDF)">
            Opens the shared Finalize &amp; Export panel for PDF and CSV export of the ring layout.
          </Feat>
          <Tip>Erin Pattern 2D is the fastest way to sketch a color-way before committing to a full Studio design. Use it to confirm a color scheme, then recreate the design in Studio for detailed placement.</Tip>
        </Sec>

        {/* ── EXPORT ──────────────────────────────────────────────────────── */}
        <Sec id="export" icon="📦" title="Export Reference">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            All three design tools (Studio, Designer, Pattern 2D) share the same Finalize &amp; Export panel. Here is a summary of every export format.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e293b", background: "#0f172a" }}>
                  {["Format","What it contains","Best use"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#64748b", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["PDF — BOM + Map", "BOM table + tiled overview map + color preview pages", "Sharing a finished design or filing as a record"],
                  ["Physical Pattern PDF (1:1)", "Per-color A4 pages; rings at true size; 10 mm ruler ticks", "Print at 100% as a physical weaving template"],
                  ["CSV", "Row-per-ring spreadsheet: color, position, ID, WD", "Supplier order entry or inventory tracking"],
                  ["GLB (binary GLTF)", "Full 3D model; each color = one named mesh group", "VR/AR engines, Bambu/Prusa slicers, Unity, WebXR"],
                  ["Per-Color STLs", "One STL per unique color", "Multi-material 3D printing (assign each STL to an extruder)"],
                ].map(([fmt, what, use]) => (
                  <tr key={fmt} style={{ borderBottom: "1px solid #0f172a" }}>
                    <td style={{ padding: "8px 10px", color: "#93c5fd", fontWeight: 700 }}>{fmt}</td>
                    <td style={{ padding: "8px 10px", color: "#94a3b8" }}>{what}</td>
                    <td style={{ padding: "8px 10px", color: "#64748b" }}>{use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Note>Physical Pattern PDF prints at 10 px/mm on A4 (210×297 mm). Before weaving, place a ruler on the printout and confirm the 10 mm ticks match exactly. If they don't, your printer is scaling — set it to "actual size" or 100%.</Note>
          <Warn>GLB/STL export is geometry-only and does not capture metallic material properties. Use for shape reference, not color-accurate renders, unless you re-apply materials in your 3D tool.</Warn>
        </Sec>

        {/* ── SHORTCUTS ───────────────────────────────────────────────────── */}
        <Sec id="shortcuts" icon="⌨️" title="Keyboard Shortcuts & Gestures">
          <Sub title="Universal" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              [<><KS>Ctrl+Z</KS> / <KS>Cmd+Z</KS></>, "Undo last action (Freeform Studio & 3D Designer)"],
              [<><KS>Ctrl+Shift+Z</KS> / <KS>Ctrl+Y</KS></>, "Redo"],
              [<KS>Esc</KS>, "Close spline tool / dismiss active overlay"],
            ].map(([keys, desc], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f172a", borderRadius: 7, padding: "8px 12px", border: "1px solid #1e293b" }}>
                <div style={{ flexShrink: 0, minWidth: 160 }}>{keys}</div>
                <div style={{ color: "#94a3b8", fontSize: 13 }}>{desc}</div>
              </div>
            ))}
          </div>

          <Sub title="Freeform Studio & 3D Designer canvas" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["Scroll wheel", "Zoom in/out (pivots at cursor; range 0.02× – 6.0×)"],
              ["Pinch gesture", "Zoom in/out (mobile/trackpad)"],
              ["Two-finger drag", "Pan the canvas regardless of active tool"],
              ["Click + drag", "Draw rings continuously (Draw mode) / pan (Pan mode)"],
              ["Single tap", "Place one ring, select pivot (spline), or tap ring to repaint"],
            ].map(([keys, desc]) => (
              <div key={keys} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f172a", borderRadius: 7, padding: "8px 12px", border: "1px solid #1e293b" }}>
                <div style={{ flexShrink: 0, minWidth: 160, fontSize: 12, color: "#e2e8f0", fontFamily: "ui-monospace, monospace" }}>{keys}</div>
                <div style={{ color: "#94a3b8", fontSize: 13 }}>{desc}</div>
              </div>
            ))}
          </div>

          <Sub title="Ring Size Chart" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["Drag", "Pan the chart"],
              ["Scroll / pinch", "Zoom (pivots at cursor)"],
              ["Tap ring", "Zoom to ring + open detail panel"],
              ["Tap ring again / tap empty", "Zoom back out to full chart"],
              ["Fit chart button", "Animate back to best-fit view"],
            ].map(([keys, desc]) => (
              <div key={keys} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f172a", borderRadius: 7, padding: "8px 12px", border: "1px solid #1e293b" }}>
                <div style={{ flexShrink: 0, minWidth: 160, fontSize: 12, color: "#e2e8f0", fontFamily: "ui-monospace, monospace" }}>{keys}</div>
                <div style={{ color: "#94a3b8", fontSize: 13 }}>{desc}</div>
              </div>
            ))}
          </div>
        </Sec>

        {/* Footer */}
        <div style={{ textAlign: "center", borderTop: "1px solid #1e293b", paddingTop: 32, color: "#475569", fontSize: 13, lineHeight: 1.9 }}>
          <div style={{ marginBottom: 6 }}>Chainmail Studio — created by Micah Forstein</div>
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
