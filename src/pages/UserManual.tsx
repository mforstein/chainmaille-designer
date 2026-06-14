// src/pages/UserManual.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DraggableCompassNav, DraggablePill } from "../App";
import { IconHamburger } from "../components/icons/ToolIcons";

// ─── section index ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "assumptions",   icon: "ℹ️", title: "Read first" },
  { id: "accounts",      icon: "🔑", title: "Accounts & Pricing" },
  { id: "home",          icon: "🏠", title: "Home" },
  { id: "workspace",     icon: "🗂️", title: "Workspace" },
  { id: "studio",        icon: "✨", title: "Freeform Studio" },
  { id: "designer",      icon: "💎", title: "3D Designer" },
  { id: "chart",         icon: "📊", title: "Ring Chart" },
  // Weave Tuner + Weave Atlas hidden for first release (per Erin).
  { id: "pattern",       icon: "🪡", title: "Basic" },
  { id: "export",        icon: "📦", title: "Export" },
  { id: "examples",      icon: "🧪", title: "How-To" },
  { id: "shortcuts",     icon: "⌨️", title: "Shortcuts" },
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

// ─── Shot — screenshot with SVG mockup fallback ────────────────────────────────
// Each section references an image at /manual/<id>.png. If the file is missing
// (most are placeholders — drop real captures from a running browser session),
// the SVG mockup keeps the manual readable in the meantime.
const Shot: React.FC<{
  src: string;
  alt: string;
  label: string;
  fallback?: React.ReactNode;
  height?: number;
}> = ({ src, alt, label, fallback, height }) => {
  const [failed, setFailed] = useState(false);
  if (failed && fallback) return <>{fallback}</>;
  return (
    <div style={{ ...MOCK_WRAP, minHeight: height }}>
      {failed ? (
        <div style={{ padding: 20, color: "#475569", fontSize: 12, textAlign: "center" }}>
          <div style={{ marginBottom: 6 }}>📷 screenshot not yet captured</div>
          <div style={{ fontSize: 10 }}>Drop {src} into public{src} to populate.</div>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      )}
      <div style={LABEL}>{label}</div>
    </div>
  );
};

// ─── SVG mockup helpers (fallback graphics only) ───────────────────────────────

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

function Mock({ label, children, height }: { label: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ ...MOCK_WRAP, minHeight: height }}>
      {children}
      <div style={LABEL}>{label}</div>
    </div>
  );
}

const HomeFallback = () => (
  <Mock label="Home page (fallback graphic)">
    <div style={{ background: "linear-gradient(180deg,#0f1115,#1a1c22)", padding: 16 }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ width: 54, height: 54, background: "#1f2937", borderRadius: 10, margin: "0 auto 8px", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🌈</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#f1f5f9", marginBottom: 4 }}>Woven Rainbows by Erin</div>
        <div style={{ fontSize: 10, color: "#94a3b8" }}>Chainmail Studio — designed by Micah Forstein</div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ background: "#2563eb", color: "#fff", borderRadius: 8, padding: "7px 18px", display: "inline-block", fontSize: 12, fontWeight: 700 }}>🧩 Access Studio</div>
      </div>
    </div>
  </Mock>
);

const StudioFallback = () => (
  <Mock label="Freeform Studio (fallback)" height={170}>
    <div style={{ display: "flex", height: 170, background: "#111827" }}>
      <div style={{ width: 44, background: "#0f172a", borderRight: "1px solid #1e293b" }} />
      <div style={{ flex: 1 }}>
        <HexRings rows={4} cols={6} colors={[
          ["#60a5fa","#60a5fa","#f472b6","#f472b6","#60a5fa","#60a5fa"],
          ["#60a5fa","#f472b6","#f472b6","#f472b6","#60a5fa"],
          ["#f472b6","#a78bfa","#a78bfa","#f472b6","#f472b6","#f472b6"],
          ["#60a5fa","#a78bfa","#a78bfa","#a78bfa","#60a5fa"],
        ]} spacing={26} r={10} ringW={3} />
      </div>
    </div>
  </Mock>
);

const SimpleHex = (label: string) => (
  <Mock label={label} height={140}>
    <HexRings rows={3} cols={6} colors={[
      ["#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
      ["#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
      ["#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa","#60a5fa"],
    ]} spacing={28} r={10} ringW={3} />
  </Mock>
);

// ─── content primitives ────────────────────────────────────────────────────────

const Feat: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 12, background: "rgba(15,23,42,0.7)", borderRadius: 7, padding: "10px 14px", border: "1px solid #1e293b" }}>
    <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: 4, fontSize: 13 }}>{title}</div>
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

const KS: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 5, padding: "1px 7px", fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#e2e8f0", margin: "0 2px" }}>{children}</span>
);

// How-To example block — a numbered step list with optional notes.
const HowTo: React.FC<{ title: string; steps: Array<string | React.ReactNode>; note?: React.ReactNode }> = ({ title, steps, note }) => (
  <div style={{ background: "rgba(15,23,42,0.55)", border: "1px solid #334155", borderRadius: 8, padding: "12px 16px", margin: "10px 0" }}>
    <div style={{ fontWeight: 800, color: "#a7f3d0", marginBottom: 8, fontSize: 13 }}>🧪 How to: {title}</div>
    <ol style={{ margin: "0 0 0 18px", padding: 0, color: "#cbd5e1", fontSize: 13, lineHeight: 1.7 }}>
      {steps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
    </ol>
    {note && <div style={{ marginTop: 10, color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>{note}</div>}
  </div>
);

// Bullet list used for assumption / status entries.
const Bullets: React.FC<{ items: Array<string | React.ReactNode> }> = ({ items }) => (
  <ul style={{ margin: "8px 0 12px 22px", padding: 0, color: "#94a3b8", fontSize: 13, lineHeight: 1.75 }}>
    {items.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
  </ul>
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
          <span style={{ color: "#475569", fontSize: 12 }}>Chainmail Studio · current as of 2026-05-25</span>
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
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "118px 20px 80px" }}>

        <p style={{ color: "#64748b", marginBottom: 28, fontSize: 13, lineHeight: 1.8 }}>
          Chainmail Studio is a chainmaille design tool created by <strong style={{ color: "#94a3b8" }}>Micah Forstein</strong> for <strong style={{ color: "#94a3b8" }}>Woven Rainbows by Erin</strong>. This manual covers every page, panel, tool, and control. Screenshots come from a live capture of the app; if any are missing on your build, the section shows a small SVG fallback in their place.
        </p>

        {/* ── ASSUMPTIONS ─────────────────────────────────────────────────── */}
        <Sec id="assumptions" icon="ℹ️" title="Read first — Assumptions & conventions">
          <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7 }}>
            Everything in this manual assumes the following. Read these once; the page-by-page sections won't repeat them.
          </p>

          <Sub title="Geometry" />
          <Bullets items={[
            <>The canvas is a <strong>4-in-1 European hex grid</strong>. All renderers (Freeform, Designer, Basic) place rings on this grid. Other weaves (Box Chain, Byzantine, Persian) are configured in the Atlas but the canvas engine for them is in progress.</>,
            <>Ring positions use <code>"row-col"</code> keys (e.g. <code>"3-7"</code>). Saved-project files preserve them.</>,
            <>All distances are in mm. Inner Diameter (ID), Wire Diameter (WD), and Aspect Ratio (AR = ID ÷ WD) drive geometry. AR &lt; 3 is too tight; 3.5–5.5 is the workable range.</>,
            <>The Tuner snapshot is the source of truth for ring geometry. It writes to <code>localStorage["freeform.tunerSnapshot.v1"]</code> and pushes live to Freeform without a reload.</>,
          ]} />

          <Sub title="Tiers & gating" />
          <Bullets items={[
            <><strong>Free</strong> ($0): Home, Basic, Ring Chart, Atlas browse, Tuner preview.</>,
            <><strong>Maker</strong> ($2.99/mo): 3D Designer (no image overlay), Tuner save, Atlas apply, CSV export.</>,
            <><strong>Crafter</strong> ($5.99/mo): 3D Designer full (spline, flood fill, image overlay), Basic full, PDF BOM, Physical Pattern PDF.</>,
            <><strong>Studio</strong> ($9.99/mo): Freeform (full), Freeform image overlay & transfer, shape/spline fill, check available colors at any supplier website, GLB/STL export, Commercial-use license.</>,
          ]} />
          <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6, marginTop: 4 }}>
            Subscribe via <a href="/pricing" style={{ color: "#a78bfa" }}>chainmaildesigner.com/pricing</a>. Mobile apps (iOS/Android) ship with Free tier features only — subscribe from the website to unlock paid tools.
          </p>

          <Sub title="Persistence" />
          <Bullets items={[
            <>Most preferences (color palette, panel positions, weave snapshot, Atlas matrix) live in <code>localStorage</code>. Clearing site data resets everything to defaults.</>,
            <>Project files (JSON) capture the canvas contents and overlay settings, but never the palette / Tuner snapshot — those follow the device, not the file.</>,
            <>Subscription tier (real Stripe-paid accounts) lives in your Supabase profile and persists indefinitely — clicking <strong>Sign out</strong> ends your local session but does not affect the underlying account.</>,
          ]} />

          <Sub title="Browser support" />
          <Bullets items={[
            <>WebGL 2 required for all 3D renders. Hardware acceleration must be on.</>,
            <>Touch + mouse + pen are all supported; two-finger pan and pinch-zoom always work regardless of the active tool.</>,
            <>The app is installable as a PWA on mobile/desktop. The manifest references <code>/icons/icon-192.png</code> and <code>/icons/icon-512.png</code>.</>,
          ]} />
        </Sec>

        {/* ── ACCOUNTS, SUBSCRIPTIONS ──────────────────────────────────────── */}
        <Sec id="accounts" icon="🔑" title="Accounts & subscriptions">
          <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7 }}>
            Free browsing doesn't need an account. Paid subscriptions are tied to your account and unlock the higher-tier design tools.
          </p>

          <Sub title="Creating a Supabase account" />
          <Bullets items={[
            <>Go to <a href="/auth" style={{ color: "#a78bfa" }}>chainmaildesigner.com/auth</a>.</>,
            <>Click <strong>Sign up</strong>, enter your email + password, confirm via the verification email.</>,
            <>New accounts start on the <strong>Free</strong> tier.</>,
          ]} />

          <Sub title="Upgrading via subscription (Stripe Payment Links)" />
          <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.7 }}>
            Subscriptions use Stripe-hosted checkout — no card data ever touches our site.
          </p>
          <Bullets items={[
            <>Sign in at chainmaildesigner.com so the subscription can be tied to your account.</>,
            <>Visit <a href="/pricing" style={{ color: "#a78bfa" }}>/pricing</a> and click <strong>Start Maker</strong> ($2.99), <strong>Start Crafter</strong> ($5.99), or <strong>Start Studio</strong> ($9.99).</>,
            <>Stripe's checkout page opens with your email pre-filled. Enter card details. Subscribe.</>,
            <>Webhook updates your tier within seconds. Refresh chainmaildesigner.com — locked tools unlock immediately.</>,
          ]} />

          <Sub title="Managing or cancelling" />
          <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.7 }}>
            On the pricing page, your current tier shows <strong>Manage subscription</strong> instead of an upgrade button. That opens Stripe's Customer Portal — change card info, switch tiers, or cancel. Cancellation keeps access until the end of the paid month, then drops to Free.
          </p>

          <Sub title="Signing out" />
          <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.7 }}>
            Click <strong>Sign out</strong> in the auth bar to end your session and drop back to Free tier locally. Your underlying Supabase account and Stripe subscription are not affected — sign back in any time and your paid tier returns.
          </p>
        </Sec>

        {/* ── HOME ─────────────────────────────────────────────────────────── */}
        <Sec id="home" icon="🏠" title="Home Page · /wovenrainbowsbyerin">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The public landing page. No account required. Loads live data from the Woven Rainbows by Erin Etsy shop, the designer-features list, and the blog entries.
          </p>
          <Shot src="/manual/home.png" alt="Home page" label="/wovenrainbowsbyerin"
                fallback={<HomeFallback />} />

          <Feat title="Access Studio button">Routes to the Workspace Navigator where you pick a design tool.</Feat>
          <Feat title="Latest Release Notes">Shows the most recent update post. Admin users (logged in as <code>micahforstein@gmail.com</code>) see a <strong>+ Post Update</strong> button.</Feat>
          <Feat title="Designer Gallery">Live grid of features from <code>/designer_features.json</code> — small screenshots of capabilities with caption text.</Feat>
          <Feat title="Etsy shop strip">Live listings from the Woven Rainbows by Erin Etsy shop. Tap a card to open the listing in a new tab.</Feat>
          <Feat title="Blog system">An admin can post short updates. Posts persist via <code>/blog_entries.json</code> on the dev server, or via Supabase in production.</Feat>
        </Sec>

        {/* ── WORKSPACE ───────────────────────────────────────────────────── */}
        <Sec id="workspace" icon="🗂️" title="Workspace Navigator · /workspace">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The launchpad after signing in. Shows your account tier and links to every design tool and utility.
          </p>
          <Shot src="/manual/workspace.png" alt="Workspace navigator" label="/workspace"
                fallback={<Mock label="Workspace (fallback)"><div style={{ padding: 20, color: "#94a3b8" }}>Design tools and utilities listing.</div></Mock>} />

          <Sub title="Design tools" />
          <Feat title="🪡 Basic — Grid color planner">Free for all tiers. Quick row-and-column color-way sketching.</Feat>
          <Feat title="💎 Designer (3D Ring Grid)">Full 3D-rendered ring grid with paint, erase, flood fill, spline fill, and image overlay. Maker tier or higher.</Feat>
          <Feat title="✨ Studio (Freeform Designer)">Free-form ring placement, image overlay with color transfer, shape + spline fill, copy/paste, full export. Studio tier.</Feat>

          <Sub title="Utilities" />
          <Feat title="📊 Ring Size Chart">Interactive AR reference. Always free, no account.</Feat>
          {/* Weave Tuner + Weave Atlas hidden for first release (per Erin). */}
        </Sec>

        {/* ── FREEFORM STUDIO ─────────────────────────────────────────────── */}
        <Sec id="studio" icon="✨" title="Freeform Studio · /freeform">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The primary production design environment. Place rings on a free-form hex grid, apply colors, overlay reference images, fill shapes, copy + paste regions, and export finished patterns.
          </p>
          <Shot src="/manual/freeform.jpg" alt="Freeform Studio overview" label="/freeform"
                fallback={<StudioFallback />} />

          <Sub title="Floating toolbar (draggable)" />
          <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
            The vertical toolbar is a draggable pill — grab it anywhere and reposition. Use the ▸ button to collapse the lower section if you need canvas space.
          </p>

          <Feat title="☰ Navigation Menu">Opens the compass overlay for jumping between pages.</Feat>
          <Feat title="📦 Finalize & Export">Opens the export panel (PDF, CSV, GLB, STL, Physical Pattern).</Feat>
          <Feat title="▸ Collapse / ▾ Expand toolbar">Hides everything below it to maximize canvas. Tap again to restore.</Feat>
          <Feat title="⚙️ Utility Panel">Toggles the secondary floating pill (Studio Geometry, Save/Load, Design Library, canvas BG, reset, Studio Stats).</Feat>
          <Feat title="🎨 Draw (Paint)">Primary placement tool. Click or drag to place rings at hex-grid positions in the active color.</Feat>
          <Feat title="⌫ Eraser">Click or drag to remove rings.</Feat>
          <Feat title="↩️ Undo / ↪️ Redo">Per-action history. <KS>Ctrl/Cmd+Z</KS> / <KS>Ctrl+Shift+Z</KS>.</Feat>
          <Feat title="◼ Shapes">Opens the Shape picker (Square, Circle, Hex, Octagon, Heart, Triangle). Drag on canvas to fill the shape. The current selection-tool also acts as a rubber-band selection — see Copy/Paste below.</Feat>
          <Feat title="✋ Pan">Click-drag to scroll without placing rings. Two-finger touch always pans regardless of mode.</Feat>
          <Feat title="📋 Copy — NEW">
            Copies the most recently selected region's rings onto an internal clipboard. The clipboard captures the <strong>pre-paint snapshot</strong> of each cell, so a heart with image-transferred colors copies as the image — not the active paint that the selection tool dropped on top. Cmd/Ctrl+C also works.
          </Feat>
          <Feat title="📌 Paste — NEW">
            Toggles paste mode. The cursor changes to <code>copy</code>; click anywhere on the canvas to drop the clipboard at that cell. Stays on after each click so you can place multiple copies. Cmd/Ctrl+V toggles; Esc exits.
          </Feat>
          <Feat title="🖼️ Image Overlay">Opens the Image Overlay panel (Studio tier). The panel is scrollable — the Transfer button at the bottom stays reachable even on short windows.</Feat>
          <Feat title="🧹 Clear All">Removes all rings. Confirmation required.</Feat>

          <Sub title="Image overlay" />
          <Shot src="/manual/freeform-overlay-rings.jpg" alt="Freeform — image overlay transferred onto rings" label="Image overlay — rings"
                fallback={SimpleHex("Image overlay (rings) — fallback")} />
          <Feat title="Load / Replace image">Tap the drop zone, or drag a file in. Loading a new image replaces the previous one; the in-place "Replace image" button at the top of the panel does the same.</Feat>
          <Feat title="Scale / Opacity / Rotation / Pan X / Pan Y">Adjust how the image is registered against the design. The on-canvas preview reflects every slider in real time.</Feat>
          <Feat title="Tile (repeat)">Tile the image across the design. Pattern Scale (%) — <strong>new slider</strong> — controls tile size as a % of the design's bounding box. 100% = one tile fills the design (no visible tiling); ~15% gives a small dense pattern (matches the Designer's behavior).</Feat>
          <Feat title="Mask outline">A dashed rectangle on the canvas defines the world-space region the image is painted into. Drag corners to resize, drag the body to reposition. Reset snaps it back to the auto bounds of the current target.</Feat>
          <Feat title="Transfer Scope">All rings (every placed cell of the chosen target), or Selection only (rings the user previously rubber-banded).</Feat>
          <Feat title="Preview mode — NEW">
            <strong>Sampled Colors</strong> (default): each ring is drawn as an open colored ring (matches the actual torus geometry) showing the color it will become on Transfer. <strong>Raw Image</strong>: the source image is clipped to ring silhouettes — the legacy view.
          </Feat>
          <Feat title="Transfer button (green, bottom)">"Transfer to Rings". Closing the overlay panel removes the on-canvas preview — only the actual transfer leaves persistent state.</Feat>

          <HowTo
            title="Copy a heart with image colors and paste it elsewhere"
            steps={[
              <>Use Image Overlay to transfer an image into rings (e.g. a heart shape on a 4-in-1 panel).</>,
              <>Open the Shapes menu, pick a shape (e.g. Heart), and drag over the area you want to copy. The selection auto-paints with the active color — that's the existing tool's behavior. <strong>The clipboard captures the pre-paint state, so the image colors are preserved.</strong></>,
              <>Press <KS>Cmd/Ctrl+C</KS> or click 📋. The Paste button (📌) shows an item count.</>,
              <>Press <KS>Ctrl+Z</KS> to undo the paint side-effect and restore the heart's image colors.</>,
              <>Press <KS>Cmd/Ctrl+V</KS> or click 📌. The cursor switches to copy-mode.</>,
              <>Click anywhere on the canvas to place a copy of the heart at that cell. Click more to place additional copies. <KS>Esc</KS> exits paste mode.</>,
            ]}
            note="Each paste is a separate undo step." />

          <Sub title="Studio Geometry panel" />
          <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
            Tabbed dialog: 📏 Ring Spacing · ⭕ Circle Tuning · 💍 Ring Sets · 👁 View · 🔬 Diagnostics. Every parameter syncs with the Tuner snapshot.
          </p>

          <Sub title="Design Library" />
          <Shot src="/manual/freeform-library.png" alt="Design Library" label="Design Library — My Designs + Starters"
                fallback={<Mock label="Design Library (fallback)"><div style={{ padding: 20, color: "#94a3b8" }}>Saved designs grid + built-in starters.</div></Mock>} />
          <Feat title="My Designs">Saved canvas JSONs. <em>Load</em> replaces the canvas; <em>Append</em> merges rings next to the existing work.</Feat>
          <Feat title="Starters">Built-in templates (Blank, Small Patch, Bracelet, Wide Fill, Diamond, Rainbow Rows, Chevron, ...).</Feat>

          <Sub title="Color palette" />
          <Feat title="Swatches">Tap to activate. Long-press to edit. Tap + to add. Drag the palette pill anywhere; position persists.</Feat>
          <Feat title="Check Available Colors at a Supplier Website (Freeform only)">Enter any supplier site's URL — the app attempts to scan that page for color names matching your palette. If the page can't be parsed or the site blocks the request, your default palette colors remain active unchanged.</Feat>
        </Sec>

        {/* ── 3D DESIGNER ─────────────────────────────────────────────────── */}
        <Sec id="designer" icon="💎" title="3D Ring Grid Designer · /designer">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            Fully 3D-rendered ring grid with metallic sheen and correct torus geometry. Rotate to preview how a finished piece will look under lighting. Maker tier or higher.
          </p>
          <Shot src="/manual/designer-overlay.jpg" alt="3D Designer — image overlay transferred onto rings" label="Image overlay — rings"
                fallback={SimpleHex("3D Designer (fallback)")} />

          <Sub title="Drawing tools" />
          <Feat title="🎨 Paint">Click any ring to color it. Drag to paint multiple in a stroke. Paint mode locks the camera to top-down.</Feat>
          <Feat title="⌫ Erase">Resets rings to the base material color.</Feat>
          <Feat title="Flood Fill">Tap any ring to fill its contiguous same-colored region.</Feat>
          <Feat title="〰️ Spline Fill">Identical to Freeform's spline tool.</Feat>
          <Feat title="↩️/↪️ Undo / Redo">Per-action history. <KS>Ctrl/Cmd+Z</KS>.</Feat>
          <Feat title="🧹 Clear Paint">Reverts all rings to base material.</Feat>

          <Sub title="Image overlay" />
          <Feat title="🖼️ Image Overlay panel">
            The panel shows: upload, preview, repeat, scale, rotation, opacity, and the green <strong>📤 Transfer to Rings</strong> button.
          </Feat>
          <Feat title="Tile mode — fixed">
            <strong>Pattern Scale (%) is now honored on Transfer.</strong> Previously the snapshot pipeline force-cleared <code>repeat="none"</code>, so even with Tile checked the result was a single stretched image. Now: pick a Pattern Scale (e.g. 15%), click Transfer, and the rings genuinely tile.
          </Feat>

          <Sub title="Camera & navigation" />
          <Feat title="📷 Camera Tools menu">Contains Image Overlay, Paint/Erase toggles, Reset View, Undo/Redo, Clear Paint, and the ⚙️ sub-panel.</Feat>
          <Feat title="Rotate (3D view)">When Paint Mode is off, click-drag orbits the camera. Pinch/scroll zooms.</Feat>
          <Feat title="▶ Grid size">Sets columns × rows. Up to 400 × 400 (memory-limited). Opens as its own <strong>draggable floating panel</strong> — grab the "Grid Size" header to reposition it; it no longer widens the toolbar.</Feat>

          <Sub title="Materials & geometry presets" />
          <Feat title="Material picker">Quick presets (aluminum, sterling, stainless, brass, copper, etc.).</Feat>
          <Feat title="🧰 Rings strip — UPDATED">
            Open the gear (⚙️) → toolbox (🧰). The ring picker now matches Freeform's <strong>Calibrated Rings strip</strong>: each Tuner-saved ring is drawn to true proportions and color-coded by solution status (<span style={{ color: "#19c37d" }}>🟢 valid</span> · <span style={{ color: "#f59e0b" }}>🟡 rings-only</span> · <span style={{ color: "#ef4444" }}>🔴 no-solution</span>). Click a ring to apply its geometry (ID, WD, spacing, tilt) — the active ring stays highlighted. The strip is a draggable floating panel and stays open as a selection manager.
          </Feat>
        </Sec>

        {/* ── RING SIZE CHART ──────────────────────────────────────────────── */}
        <Sec id="chart" icon="📊" title="Ring Size Chart · /chart">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            Interactive reference chart of ID × WD combinations. Each cell is a to-scale ring annulus color-coded by AR. Always free.
          </p>
          <Shot src="/manual/chart.jpg" alt="Ring size chart matrix" label="/chart"
                fallback={SimpleHex("Ring Size Chart (fallback)")} />
          <Shot src="/manual/chart-detail.jpg" alt="Selected ring detail with available supplier colors" label="Tap a ring — detail + available colors"
                fallback={SimpleHex("Ring detail (fallback)")} />

          <Sub title="AR legend" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, margin: "8px 0 14px" }}>
            {[
              { color: "#dc2626", label: "AR < 3.0 — Too tight" },
              { color: "#f97316", label: "AR 3.0–3.5 — Tight / snug" },
              { color: "#60a5fa", label: "AR 3.5–5.5 — Ideal" },
              { color: "#94a3b8", label: "AR 5.5–7.5 — Loose" },
              { color: "#ca8a04", label: "AR > 7.5 — Very loose" },
            ].map(r => (
              <div key={r.color} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0f172a", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ width: 11, height: 11, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{r.label}</span>
              </div>
            ))}
          </div>

          <Feat title="Tap a ring">Smoothly zooms to fill the view and opens the detail panel.</Feat>
          <Feat title="Detail panel — Available Colors">
            Shows the selected ring's dimensions (ID · WD · OD), its AR with a fit badge, and material. The <strong>Available Colors</strong> swatches are the colors that supplier searches turned up for that ring size <em>at the time of publication</em> — supplier stock changes over time, so treat this as a point-in-time snapshot, not a live inventory.
          </Feat>
        </Sec>

        {/* Weave Tuner (/tuner) + Weave Atlas (/atlas) sections removed for
            the first release (per Erin) — those tools are hidden until
            scales return. Re-add their <Sec> blocks then. */}

        {/* ── BASIC ────────────────────────────────────────────────────────── */}
        <Sec id="pattern" icon="🪡" title="Basic">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            Lightweight grid-based 2D color planner — fastest path from idea to color-way sketch. Free for all tiers.
          </p>
          <Shot src="/manual/erin2d.png" alt="Basic" label="Basic"
                fallback={<Mock label="Basic (fallback)"><div style={{ padding: 20, color: "#94a3b8" }}>Hex-offset grid with palette and pan/zoom.</div></Mock>} />

          <Feat title="Grid painting">Tap to apply the active color; drag for a continuous stroke.</Feat>
          <Feat title="Grid size">Rows / Columns inputs. Expanding adds empty cells at the edges.</Feat>
          <Feat title="Row offset (hex)">Row Offset X / Y sliders shift alternating rows to match the Studio hex layout.</Feat>
          <Feat title="Pan & zoom">Click-drag empty cells or two-finger drag. Scroll wheel / pinch zooms.</Feat>
          <Feat title="Reference image overlay">Load an image behind the grid, pan and zoom to align as a color reference.</Feat>
          <Feat title="Color palette pill — NEW drag handle">
            The palette pill is movable. A thin <strong>⋮⋮ COLORS ⋮⋮</strong> strip sits at the top — drag from that strip (or the 4 px gaps between swatches) to move the pill anywhere. Position persists per device.
          </Feat>
          <Feat title="Save & Load">JSON project state — grid, colors, palette, overlay settings.</Feat>
          <Feat title="Export">Opens the shared Finalize & Export panel for PDF / CSV.</Feat>

          <Tip>Use Basic for fast color-way sketches, then recreate the chosen palette in Freeform Studio for placement.</Tip>
        </Sec>

        {/* ── EXPORT ──────────────────────────────────────────────────────── */}
        <Sec id="export" icon="📦" title="Export Reference">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            Studio, Designer, and Basic all share the Finalize & Export panel.
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
                  ["CSV", "Row-per-ring spreadsheet: color, position, ID, WD", "Order entry / inventory"],
                  ["GLB (binary GLTF)", "Full 3D model; each color = one named mesh group", "VR/AR, Unity, WebXR, Bambu/Prusa slicers"],
                  ["Per-Color STLs", "One STL per unique color", "Multi-material 3D printing"],
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

          <Note>Physical Pattern PDF prints at 10 px/mm on A4 (210 × 297 mm). After printing, verify the 10 mm ruler ticks with a real ruler — if they're off, your printer is scaling. Set the printer to "actual size" or 100%.</Note>
          <Warn>GLB/STL export is geometry-only — material color is not captured. Re-apply materials in your 3D tool for color-accurate renders.</Warn>
        </Sec>

        {/* ── HOW-TO EXAMPLES ─────────────────────────────────────────────── */}
        <Sec id="examples" icon="🧪" title="How-To Examples">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            Worked examples for the common workflows. Each one assumes you're logged in at the required tier.
          </p>

          <HowTo title="Design a 2-color bracelet from scratch in Freeform"
            steps={[
              "Go to /freeform.",
              "Click 🎨 Draw. Pick a base color from the palette.",
              <>Click ◼ Shapes → Square. Drag a 4×24 rectangle on the canvas — the rings fill in the chosen shape.</>,
              "Pick a second color from the palette.",
              <>Click ◼ Shapes → Square again, and drag a smaller rectangle to overpaint a stripe across the bracelet.</>,
              <>Click 📦 Finalize & Export → "Physical Pattern PDF (1:1)". Print at 100%.</>,
            ]} />

          <HowTo title="Transfer a photo onto a heart design"
            steps={[
              "Open /freeform and place a heart of rings using Shapes → Heart.",
              "Click 🖼️ Image Overlay. Drag a photo into the drop zone.",
              "Adjust Scale / Pan / Rotation so the focal point of the photo aligns with the heart on the canvas.",
              "Transfer Scope: All rings. Transfer Target: Rings.",
              "Preview mode: Sampled Colors. You'll see each ring drawn as the color it will become.",
              <>Click <strong>📤 Transfer to Rings</strong>. The heart is recolored with the sampled colors.</>,
              <>Optional: close the Image Overlay panel. The on-canvas preview disappears — only the actual recolor remains.</>,
            ]} />

          <HowTo title="Copy + paste a region with image colors"
            steps={[
              "Run an Image Overlay → Transfer to Rings so your target region has image colors.",
              "Open Shapes, pick a shape that covers the region, drag the selection.",
              <>Press <KS>Cmd/Ctrl+C</KS>. The clipboard captured pre-paint state — the original image colors.</>,
              <>Press <KS>Ctrl+Z</KS> to undo the selection tool's auto-paint.</>,
              <>Press <KS>Cmd/Ctrl+V</KS> to enter paste mode, then click on the canvas to drop the copy. Click again for more copies.</>,
              <><KS>Esc</KS> exits paste mode.</>,
            ]} />
        </Sec>

        {/* ── SHORTCUTS ───────────────────────────────────────────────────── */}
        <Sec id="shortcuts" icon="⌨️" title="Keyboard Shortcuts & Gestures">
          <Sub title="Universal (Freeform & Designer)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              [<><KS>Ctrl+Z</KS> / <KS>Cmd+Z</KS></>, "Undo last action"],
              [<><KS>Ctrl+Shift+Z</KS> / <KS>Ctrl+Y</KS></>, "Redo"],
              [<KS>Esc</KS>, "Close spline tool / exit paste mode / dismiss active overlay"],
            ].map(([keys, desc], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f172a", borderRadius: 7, padding: "8px 12px", border: "1px solid #1e293b" }}>
                <div style={{ flexShrink: 0, minWidth: 200 }}>{keys}</div>
                <div style={{ color: "#94a3b8", fontSize: 13 }}>{desc}</div>
              </div>
            ))}
          </div>

          <Sub title="Freeform Studio — Copy / Paste (NEW)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              [<><KS>Cmd+C</KS> / <KS>Ctrl+C</KS></>, "Copy current (or most-recent) selection of rings — captures pre-paint state"],
              [<><KS>Cmd+V</KS> / <KS>Ctrl+V</KS></>, "Toggle paste mode (cursor → copy)"],
              ["Click on canvas (paste mode)", "Paste clipboard at clicked cell (stays in paste mode for repeats)"],
              [<KS>Esc</KS>, "Exit paste mode"],
            ].map(([keys, desc], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f172a", borderRadius: 7, padding: "8px 12px", border: "1px solid #1e293b" }}>
                <div style={{ flexShrink: 0, minWidth: 200 }}>{keys}</div>
                <div style={{ color: "#94a3b8", fontSize: 13 }}>{desc}</div>
              </div>
            ))}
          </div>

          <Sub title="Canvas gestures" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["Scroll wheel", "Zoom in/out (pivots at cursor; range 0.02× – 6.0×)"],
              ["Pinch", "Zoom (mobile / trackpad)"],
              ["Two-finger drag", "Pan the canvas regardless of active tool"],
              ["Click + drag", "Draw rings continuously / paint stroke"],
              ["Single tap / click", "Place one ring / select pivot / repaint"],
            ].map(([keys, desc]) => (
              <div key={keys} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f172a", borderRadius: 7, padding: "8px 12px", border: "1px solid #1e293b" }}>
                <div style={{ flexShrink: 0, minWidth: 200, fontSize: 12, color: "#e2e8f0", fontFamily: "ui-monospace, monospace" }}>{keys}</div>
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
                <div style={{ flexShrink: 0, minWidth: 200, fontSize: 12, color: "#e2e8f0", fontFamily: "ui-monospace, monospace" }}>{keys}</div>
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
