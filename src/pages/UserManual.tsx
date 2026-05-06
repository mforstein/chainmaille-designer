// src/pages/UserManual.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DraggableCompassNav, DraggablePill } from "../App";
import { IconHamburger } from "../components/icons/ToolIcons";

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

const Shot: React.FC<{ label: string; tall?: boolean }> = ({ label, tall }) => (
  <div style={{
    background: "#0a0f1a",
    border: "1px dashed #334155",
    borderRadius: 10,
    minHeight: tall ? 200 : 130,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#475569",
    fontSize: 12,
    margin: "14px 0",
    padding: 16,
    textAlign: "center",
    gap: 8,
  }}>
    <span style={{ fontSize: 28 }}>📸</span>
    <span>{label}</span>
  </div>
);

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
          <button
            onClick={() => navigate("/wovenrainbowsbyerin")}
            style={{ marginLeft: "auto", background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}
          >
            ← Home
          </button>
        </div>
        {/* TOC */}
        <nav style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {SECTIONS.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{ whiteSpace: "nowrap", color: "#94a3b8", fontSize: 11, fontWeight: 600, textDecoration: "none", padding: "4px 10px", borderRadius: 6, background: "#0f172a", border: "1px solid #1e293b", flexShrink: 0 }}
            >
              {s.icon} {s.title}
            </a>
          ))}
        </nav>
      </div>

      {/* Hamburger nav */}
      <DraggablePill id="manual-nav" defaultPosition={{ x: 20, y: 80 }}>
        <button
          onClick={() => setShowCompass(v => !v)}
          style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid #1e293b", background: "#1f2937", color: "#d1d5db", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <IconHamburger size={18} />
        </button>
      </DraggablePill>
      {showCompass && <DraggableCompassNav onNavigate={() => setShowCompass(false)} />}

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "120px 20px 80px" }}>

        <p style={{ color: "#64748b", marginBottom: 40, fontSize: 14, lineHeight: 1.75 }}>
          Chainmail Studio is a professional chainmaille design tool created by <strong style={{ color: "#94a3b8" }}>Micah Forstein</strong> for <strong style={{ color: "#94a3b8" }}>Woven Rainbows by Erin</strong>. This manual covers every page, panel, and tool available in the app.
        </p>

        {/* ── HOME PAGE ── */}
        <Sec id="home" icon="🏠" title="Home Page">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The landing page introduces Woven Rainbows by Erin, shows the latest release notes, and links to the Etsy shop.
          </p>
          <Shot label="Home page — logo, about text, Access Studio button, Latest Release Notes, Etsy grid" />
          <Feat title="🧩 Access Studio Button">
            Opens the Workspace Navigator where you choose which design tool to launch.
          </Feat>
          <Feat title="Latest Release Notes">
            Displays the most recent update note. Admins see a <strong>+ Post Update</strong> button to add new entries. All users see a <strong>View All</strong> link to the full release notes history.
          </Feat>
          <Feat title="📖 User Manual Button">
            Opens this manual from the Latest Release Notes section.
          </Feat>
          <Feat title="Etsy Shop Grid">
            Live grid of featured listings from the Woven Rainbows by Erin Etsy shop. Tap any card to open the listing in your browser.
          </Feat>
        </Sec>

        {/* ── WORKSPACE NAVIGATOR ── */}
        <Sec id="workspace" icon="🧭" title="Workspace Navigator">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            Your central hub. All design tools and utilities launch from here.
          </p>
          <Shot label="Workspace Navigator — all tool buttons visible" />
          <Sub title="Design Tools" />
          <Feat title="Basic Design">
            Opens <strong>Erin Pattern 2D</strong> — a grid-based row-and-column color planner. Best for simple layouts and quick color-way experiments.
          </Feat>
          <Feat title="Designer (3D)">
            Opens the <strong>3D Ring Grid Designer</strong> with a full rendered three-dimensional grid. Paint, erase, flood fill, and spline fill are available.
          </Feat>
          <Feat title="Studio (Freeform)">
            Opens <strong>Freeform Studio</strong> — the most powerful tool. Free-form ring and scale placement, image overlay, shape fill, spline tools, and full PDF/CSV export.
          </Feat>
          <Sub title="Utilities" />
          <Feat title="Ring Size Chart">
            Interactive reference chart for inner diameter and wire gauge combinations. Color-coded by aspect ratio.
          </Feat>
          <Feat title="Weave Tuner">
            3D geometry optimizer. Dial in ring and scale parameters and sync them to Studio.
          </Feat>
          <Feat title="Weave Atlas">
            Preset weave catalog. Apply a named weave to the 3D Designer instantly.
          </Feat>
          <Sub title="External Links" />
          <Feat title="Woven Rainbows by Erin Etsy Site">Opens the Etsy shop in your browser.</Feat>
          <Feat title="Homepage">Returns to the app home page.</Feat>
        </Sec>

        {/* ── FREEFORM STUDIO ── */}
        <Sec id="studio" icon="✨" title="Freeform Studio">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            The primary production design environment. Place rings and scales freely, apply colors from a palette, overlay reference images, fill geometric shapes, and export finished patterns.
          </p>
          <Shot label="Freeform Studio — canvas with rings and scales, toolbar on left, palette at bottom" tall />

          <Sub title="Canvas & Drawing" />
          <Feat title="Ring Placement (Draw Mode)">
            Tap or click-drag on the canvas to place rings. Each ring snaps to the hexagonal grid. Hold and drag to paint a continuous stroke of rings.
          </Feat>
          <Feat title="Erase Tool">
            Select the eraser from the toolbar, then tap any ring or scale to delete it. Drag to erase multiple in one pass.
          </Feat>
          <Feat title="Clear All">
            Removes all rings and scales from the canvas. Confirmation prevents accidental clears.
          </Feat>
          <Feat title="Selection">
            Tap a ring to select it. Selected rings can be moved or recolored individually.
          </Feat>

          <Sub title="Scale Mode" />
          <Feat title="Enter Scale Mode (S key / Scale tool)">
            Press <strong>S</strong> or tap the scale tool button to switch to scale placement mode. In this mode, tapping a position places a decorative metallic scale. Scale geometry (shape, size, hole diameter, angles) is loaded from the most recent Weave Tuner snapshot.
          </Feat>
          <Feat title="Scale Colors">
            The palette applies to scales the same way it does to rings. Tap a color swatch before placing scales to set their color.
          </Feat>
          <Shot label="Studio — scale mode active, teal scales overlaid on silver ring grid" />

          <Sub title="Color Palette" />
          <Feat title="Selecting a Color">
            Tap any swatch in the color bar to make it the active color. All new rings and scales use this color.
          </Feat>
          <Feat title="Repainting Existing Rings">
            With a color selected in Draw mode, tap an existing ring to repaint just that one ring. Same works for scales in Scale mode.
          </Feat>
          <Feat title="Adding / Editing Colors">
            Tap the <strong>+</strong> button in the palette row to open the color picker. Tap an existing swatch and hold to edit or delete it.
          </Feat>

          <Sub title="Image Overlay" />
          <Feat title="Load Reference Image">
            Open the Image Overlay panel (camera icon) and select a photo. The image appears as a semi-transparent layer behind the ring grid, letting you trace or color-match it.
          </Feat>
          <Feat title="Align the Image">
            Use the Scale slider to resize the image and the X/Y offset sliders to position it so it aligns with your ring grid.
          </Feat>
          <Feat title="Image Color Transfer">
            Tap <strong>Transfer Colors</strong> to automatically sample each ring's position on the reference image and assign the nearest palette color. This maps a photograph directly onto your chainmaille layout in one tap.
          </Feat>
          <Shot label="Studio — reference photo aligned behind rings, then palette colors transferred to each ring" tall />
          <Note>Image Transfer works best when you have a palette that closely matches the dominant colors in your reference photo.</Note>

          <Sub title="Shape Fill Tool" />
          <Feat title="Opening the Shape Panel">
            Tap the Shape icon in the toolbar to open the Shape Fill panel. Choose a shape (rectangle, circle, ellipse, triangle, diamond, hexagon), set its dimensions, and tap <strong>Apply</strong> to fill that area with rings.
          </Feat>
          <Feat title="Positioning the Shape">
            Drag the shape preview on the canvas to reposition it before applying, or use the X/Y offset controls in the panel.
          </Feat>
          <Shot label="Studio — shape fill panel open, hexagon shape previewed over canvas" />

          <Sub title="Spline Tool" />
          <Feat title="Drawing a Spline">
            Select the Spline tool, then click or tap a series of control points on the canvas to define a curve. A smooth spline is drawn through all points.
          </Feat>
          <Feat title="Filling the Spline">
            Tap <strong>Apply</strong> to place a row of rings following the spline path. Use the density control to set ring spacing along the curve.
          </Feat>
          <Shot label="Studio — spline curve drawn across canvas with rings placed along its path" />

          <Sub title="Scale Tuner Overrides" />
          <Feat title="Local Geometry Sliders">
            The Scale Tuner panel (accessible from the toolbar) provides local overrides for all scale geometry parameters — hole diameter, width, height, drop, tilt angles, plane Z, tip lift, and row clearance Z — without having to switch to the Weave Tuner page. Ranges: Row Clearance Z is −5 to +5.
          </Feat>

          <Sub title="Bill of Materials (BOM)" />
          <Feat title="Viewing the BOM">
            Open the BOM panel to see a count of rings and scales broken down by color and size. This is your shopping list for ordering materials.
          </Feat>
          <Shot label="Studio — BOM panel showing ring counts by color and wire size" />

          <Sub title="Export" />
          <Feat title="PDF — Design Overview">
            Exports a full-color PDF showing the complete design at a readable scale. Useful for record-keeping or sharing.
          </Feat>
          <Feat title="PDF — Physical Pattern (1:1 tiles)">
            Exports a print-to-scale PDF — A4 portrait, 10 px/mm. Includes one page per color plus a combined overview, with ruler tick marks every 10 mm so you can verify print scale before using it as a physical weaving template.
          </Feat>
          <Feat title="Export CSV">
            Exports the full ring list as a spreadsheet for inventory management or supplier order forms.
          </Feat>
          <Feat title="Save / Load Project">
            Save your design to a JSON file on your device. Load it later to continue working. Projects preserve all ring positions, colors, scales, and palette settings.
          </Feat>
        </Sec>

        {/* ── 3D DESIGNER ── */}
        <Sec id="designer" icon="💎" title="3D Ring Grid Designer">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A fully 3D-rendered grid view of your design. Great for visualizing how a finished piece will look under light. Shares BOM and export capabilities with Freeform Studio.
          </p>
          <Shot label="3D Designer — rendered ring grid with multiple colors, metallic sheen" tall />
          <Feat title="Paint Mode">
            Click any ring cell to color it with the active palette color. Click-drag to paint multiple cells in one stroke.
          </Feat>
          <Feat title="Erase Mode">
            Removes color from ring cells, resetting them to the default metal appearance.
          </Feat>
          <Feat title="Flood Fill">
            Click any ring to fill the entire contiguous region of same-colored rings with the active color — behaves like a paint-bucket tool.
          </Feat>
          <Feat title="Spline Fill">
            Draw a spline curve across the grid and fill all rings along its path with the active color. Good for creating color transitions and stripe effects.
          </Feat>
          <Feat title="Ring Geometry Controls">
            Sliders for inner diameter, wire diameter, and center spacing let you scale the 3D preview to match your actual ring dimensions.
          </Feat>
          <Feat title="Weave Atlas Integration">
            Apply a preset from the Weave Atlas to instantly reconfigure ring geometry for a named weave pattern.
          </Feat>
          <Feat title="BOM, PDF, CSV Export">
            Same Bill of Materials and export pipeline as Freeform Studio. See the Export section above for details.
          </Feat>
        </Sec>

        {/* ── RING SIZE CHART ── */}
        <Sec id="chart" icon="📊" title="Ring Size Chart">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            An interactive 2D chart mapping inner diameter (rows) against wire diameter (columns). Each cell shows a to-scale ring annulus colored by aspect ratio. Use it to find compatible ring sizes and browse supplier options.
          </p>
          <Shot label="Ring Size Chart — full grid of ring annuli, AR color-coded" tall />

          <Sub title="Navigation" />
          <Feat title="Pan the Chart">
            Click-drag or touch-drag anywhere on the chart to pan. The grid extends beyond the screen — pan to see all ring size combinations.
          </Feat>
          <Feat title="Zoom">
            Pinch on mobile or use the scroll wheel on desktop to zoom in and out. The zoom pivot is at your finger/cursor position.
          </Feat>

          <Sub title="Ring Detail" />
          <Feat title="Tap to Zoom In">
            Tap any ring in the chart to smoothly zoom in so that ring fills the view. A detail panel opens showing its exact measurements.
          </Feat>
          <Feat title="Tap Again to Zoom Out">
            Tap the selected ring (or anywhere) again to return to the full chart view.
          </Feat>
          <Feat title="Label Scaling">
            Ring labels scale proportionally with zoom so they remain readable at any zoom level.
          </Feat>
          <Shot label="Ring Size Chart — one ring zoomed in, detail panel open beside it" />

          <Sub title="Aspect Ratio Color Coding" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "8px 0 14px" }}>
            {[
              { color: "#dc2626", label: "AR < 3.0 — Too tight, rings won't flex" },
              { color: "#f97316", label: "AR 3.0–3.5 — Tight weave" },
              { color: "#60a5fa", label: "AR 3.5–5.5 — Ideal range for most weaves" },
              { color: "#94a3b8", label: "AR 5.5–7.5 — Loose weave" },
              { color: "#ca8a04", label: "AR > 7.5 — Very loose, may be unstable" },
            ].map(r => (
              <div key={r.color} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0f172a", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{r.label}</span>
              </div>
            ))}
          </div>

          <Sub title="Supplier Info Panel" />
          <Feat title="Matched Products">
            When a ring is selected, the detail panel shows matching products from The Ring Lord, Chainmail Joe, Metal Designz, and Steampunk Garage — matched by inner diameter and wire diameter within ±0.35 mm.
          </Feat>
          <Feat title="Color Swatches & Links">
            Each matched product shows a color swatch and a direct link to the product page. Tap the link to open the supplier's site and order directly.
          </Feat>
          <Feat title="Materials">
            Available materials (aluminum, stainless, sterling silver, etc.) are shown as tags for each matched ring.
          </Feat>
          <Shot label="Ring size detail panel — ID/WD/OD/AR, materials, supplier colors and links" />
        </Sec>

        {/* ── WEAVE TUNER ── */}
        <Sec id="tuner" icon="⚙️" title="Weave Tuner">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A live 3D geometry workbench for rings and scales. Dial in exact measurements to match your physical materials, then save the configuration and sync it to Freeform Studio so scales appear with the correct proportions.
          </p>
          <Shot label="Weave Tuner — 3D ring and scale preview occupying top half, mode strip on left edge, controls as bottom sheet" tall />
          <Note>The Weave Tuner and Freeform Studio stay in sync automatically. When you save in the Tuner, Studio receives the updated geometry immediately via localStorage.</Note>

          <Sub title="Mode Strip (Left Edge Icons)" />
          <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
            Five icon buttons on the left edge switch between control groups. Each mode shows only the controls relevant to that task — keeping the panel short so the 3D preview above stays visible.
          </p>

          {[
            { icon: "📐", name: "Calibrate Rings", desc: "Select your wire gauge and ring inner diameter to match your physical rings. The Aspect Ratio (AR = ID ÷ Wire Diameter) updates live. Tap the Calibrate button to open the screen color accuracy tool." },
            { icon: "🔧", name: "Tune Rings", desc: "Adjust center-to-center spacing, Angle In (even rows), and Angle Out (odd rows) to set the ring tilt for your weave style. Use the Zoom slider or pinch/scroll the 3D preview. Mark the configuration as Valid or No Solution, then Save to store it." },
            { icon: "⚖️", name: "Calibrate Scales", desc: "Enter the physical measurements of your scales: hole inner diameter, shape (teardrop, leaf, round, kite), display color, width, height, drop, and hole position offset. These values control the 3D model geometry." },
            { icon: "✨", name: "Tune Scales", desc: "Control how scales sit in the weave. Enable or disable the scale overlay. Toggle between Weave view (scales in front) and Alignment view (tilted back to show hole alignment). Set Angle In / Angle Out (left-right tilt per row), sync those angles to match ring angles, adjust Plane Z (front-to-back depth), Tip Lift (pitch so the tip rises above neighboring scales), and Row Clearance Z (extra depth per row to eliminate row-to-row clipping)." },
            { icon: "🧩", name: "Tune Weave", desc: "Set the weave mode — interlocked (scale holes lock to ring centers) or independent (scale grid floats separately). Toggle Overlay Every Cell to fill or thin the scale coverage. When unlocked, adjust Scale Center spacing and Grid X/Y offsets to position the scale grid relative to the ring grid." },
          ].map(m => (
            <div key={m.name} style={{ marginBottom: 12, background: "#0f172a", borderRadius: 8, padding: "11px 14px", border: "1px solid #1e293b", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{m.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: "#93c5fd", marginBottom: 5, fontSize: 13 }}>{m.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.65 }}>{m.desc}</div>
              </div>
            </div>
          ))}

          <Shot label="Weave Tuner — Tune Scales panel: angle sliders, plane Z, tip lift, row clearance" />

          <Sub title="Save & Reload" />
          <Feat title="Save Button (Tune Rings / Tune Weave panels)">
            Stores the complete ring + scale configuration to local storage under the current ring size key. Also immediately pushes a snapshot to Freeform Studio.
          </Feat>
          <Feat title="Reload Last Save">
            Restores all sliders to the most recently saved configuration. Useful when you've been experimenting and want to get back to a known-good state.
          </Feat>

          <Sub title="3D Preview Controls" />
          <Feat title="Scroll / Pinch to Zoom">
            Scroll the mouse wheel over the 3D scene, or pinch on mobile, to zoom the camera in and out. The Zoom slider in the Tune Rings and Tune Scales panels does the same thing.
          </Feat>
          <Feat title="Weave View vs. Alignment View">
            <em>Weave view</em>: scales layered naturally in front of rings as in a finished piece. <em>Alignment view</em>: the camera tilts back slightly so you can see how scale holes sit relative to ring centers — useful when calibrating the interlocked mode.
          </Feat>
        </Sec>

        {/* ── WEAVE ATLAS ── */}
        <Sec id="atlas" icon="🌐" title="Weave Atlas">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A curated catalog of preset ring configurations for well-known chainmaille weaves. Apply a preset to the 3D Designer without manually entering geometry values.
          </p>
          <Shot label="Weave Atlas — catalog of named weave presets with preview thumbnails" />
          <Feat title="Browse Presets">
            Scroll through the catalog to see all available weaves. Each card shows the weave name, a visual preview, and key parameters (ring size, wire gauge, AR, weave style).
          </Feat>
          <Feat title="Apply to Designer">
            Tap <strong>Apply</strong> on any preset to push its ring geometry into the 3D Designer. The Designer reconfigures its grid and ring dimensions to match the chosen weave immediately.
          </Feat>
          <Note>Applying a preset requires a Maker tier account or higher. Browsing is free for all users.</Note>
        </Sec>

        {/* ── ERIN PATTERN 2D ── */}
        <Sec id="pattern" icon="🎨" title="Erin Pattern 2D">
          <p style={{ color: "#64748b", marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
            A grid-based 2D pattern designer for simple row-and-column color planning. Lighter and faster than Freeform Studio — ideal for quick color-way sketches.
          </p>
          <Shot label="Erin Pattern 2D — colored grid with reference image overlay" />
          <Feat title="Grid Painting">
            Tap any cell in the grid to apply the active palette color. Drag to paint rows continuously.
          </Feat>
          <Feat title="Row & Column Operations">
            Insert or delete entire rows and columns. Shift rows left or right to offset alternate rows for hexagonal patterns.
          </Feat>
          <Feat title="Reference Image Overlay">
            Load a reference image behind the grid. Scale and pan it to align with your grid for tracing or color-matching.
          </Feat>
          <Feat title="Color Palette">
            A color picker lets you define any palette color. Tap a swatch to activate it.
          </Feat>
          <Feat title="Export">
            Export the finished pattern as a PNG image or PDF for reference during weaving.
          </Feat>
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
