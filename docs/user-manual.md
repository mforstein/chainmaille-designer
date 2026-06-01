# Chainmail Studio — User Manual

**Chainmail Studio by Woven Rainbows by Erin**
Version 1.0 · Updated 2026-05-31

---

## Contents

1. [Read first — assumptions](#1-read-first--assumptions)
2. [Accounts & subscriptions](#2-accounts--subscriptions)
3. [Home page](#3-home-page)
4. [Workspace navigator](#4-workspace-navigator)
5. [Freeform Studio](#5-freeform-studio)
6. [3D Designer](#6-3d-designer)
7. [Ring Size Chart](#7-ring-size-chart)
8. [Weave Tuner](#8-weave-tuner)
9. [Weave Atlas](#9-weave-atlas)
10. [Basic 2D Designer](#10-basic-2d-designer)
11. [Export — BOM, CSV, PDF, 3D](#11-export--bom-csv-pdf-3d)
12. [How-to recipes](#12-how-to-recipes)
13. [Keyboard shortcuts](#13-keyboard-shortcuts)

> **📷 Note on screenshots**: every section has a `[SCREENSHOT:]` placeholder describing what to capture. When you're filling this in, open the relevant page in the app and grab the indicated view.

---

## 1. Read first — assumptions

Everything here assumes the following. Read once; later sections won't repeat them.

### Geometry
- The canvas is a **4-in-1 European hex grid**. All renderers (Freeform, Designer, Basic) place rings on this grid. Other weaves (Box Chain, Byzantine, Persian, Scale Maille) live in the Atlas but their dedicated canvas engines are in progress.
- All distances are in **millimeters**. Inner Diameter (ID), Wire Diameter (WD), and Aspect Ratio (AR = ID ÷ WD) drive geometry. AR < 3 is too tight; the workable range is **3.5–5.5**.
- The **Tuner snapshot** is the source of truth for ring + scale geometry. Whatever you set in the Tuner pushes live to Freeform and Designer without a reload.

### Tier access (v1)
| Tier | Cost | Unlocks |
|---|---|---|
| **Free** | $0 | Home, Basic, Ring Chart, Atlas browse, Tuner preview |
| **Maker** | $2.99/mo | 3D Designer (no image overlay), Tuner save, Atlas apply, CSV export |
| **Crafter** | $5.99/mo | 3D Designer full (spline, flood fill, image overlay), Erin Pattern 2D full, PDF BOM, Physical Pattern PDF |
| **Studio** | $9.99/mo | Freeform full + image overlay/transfer, shape & spline fill, check available colors at any supplier website, GLB/STL export, commercial-use license |

**iPhone/iPad/Android apps** ship with **Free tier features only**. Subscribe at [chainmaildesigner.com](https://chainmaildesigner.com) to unlock paid tools.

### Default scale shape
- The "Standard" scale is internally named **"leaf"** — an almond/lancet silhouette matching a real chainmaille scale. This is the default for new designs.
- The legacy **"teardrop"** shape is still selectable. Older designs saved with teardrop render unchanged.

### Persistence
- Most preferences (color palette, last-used scale shape, panel positions, weave snapshot, Atlas matrix) live in **localStorage**. Clearing site data resets to defaults.
- Project files (JSON) capture canvas contents + overlay settings, but **not** the palette or Tuner snapshot — those follow the device, not the file.

### Browser / device requirements
- **WebGL 2** required for all 3D renders. Hardware acceleration must be on.
- Touch + mouse + Apple Pencil all supported. Two-finger pan and pinch-zoom always work regardless of active tool.
- Installable as a **PWA** on mobile/desktop (manifest references `/icons/icon-192.png` and `/icons/icon-512.png`).

---

## 2. Accounts & subscriptions

### Two ways to use Chainmail Studio

| Path | Who it's for | How long it lasts |
|---|---|---|
| **Free browsing** | First-time visitors | No account needed for Home, Ring Chart, Atlas browse, Tuner preview, Basic 2D |
| **Paid subscription** (Maker / Crafter / Studio) | Customers who want the paid tools | Persistent — tied to your account, paid monthly via Stripe |

### Creating a Supabase account

1. Go to [chainmaildesigner.com/auth](https://chainmaildesigner.com/auth).
2. Click **Sign up**, enter your email + password.
3. Confirm via the verification email (if email confirmation is enabled).
4. New accounts start on the **Free** tier.

You can sign in/out at any time. Signing out drops you back to Free locally — your Supabase account and Stripe subscription are preserved on the server.

### Upgrading via subscription

Subscriptions use **Stripe Payment Links** for checkout — no credit card data ever touches our site, Stripe handles the hosted checkout page.

**Steps to upgrade:**

1. Sign in at [chainmaildesigner.com](https://chainmaildesigner.com) (account required so we can match the subscription to you).
2. Go to [chainmaildesigner.com/pricing](https://chainmaildesigner.com/pricing).
3. Click the **"Start Maker"** / **"Start Crafter"** / **"Start Studio"** button on the tier you want.
4. You'll be redirected to Stripe's secure checkout page. Your email is pre-filled.
5. Enter card details, confirm.
6. Stripe charges your card, then sends a webhook to our server which updates your tier in your account profile.
7. Return to chainmaildesigner.com — refresh the page — the new tier badge appears in the top-right of the home page and your previously-locked tools unlock immediately.

### Managing or cancelling a subscription

On the [pricing page](https://chainmaildesigner.com/pricing), the tier you currently have shows a **"Manage subscription"** button instead of an upgrade button. Click it to open Stripe's Customer Portal where you can:

- Update card or billing info
- Switch to a different tier (upgrade/downgrade)
- Cancel — your access continues through the end of the current billing month, then drops to Free

### Commercial-use license

Studio tier ($9.99/mo) includes a commercial-use license — see [chainmaildesigner.com/commercial-license](https://chainmaildesigner.com/commercial-license) for full terms. Maker and Crafter tiers are for personal/hobby use only.

---

## 3. Home page

**URL**: `/wovenrainbowsbyerin`
**Access**: public, no account required

[SCREENSHOT: Home page hero with the Etsy shop strip visible below]

The public landing page. Loads live data from Erin's Etsy shop, the designer features gallery, and the blog.

| Element | What it does |
|---|---|
| **Access Studio button** | Routes to the Workspace Navigator where you pick a design tool. |
| **Latest Release Notes** | Shows the most recent update post. Admin users see a "+ Post Update" button. |
| **Designer Gallery** | Live grid from `/designer_features.json` — feature shots with captions. |
| **Etsy shop strip** | Live listings from the Woven Rainbows by Erin Etsy shop. Tap a card to open in a new tab. |
| **Blog system** | Erin (admin) can post updates; entries persist via Supabase in production. |

---

## 4. Workspace navigator

**URL**: `/workspace`
**Access**: any signed-in user (login is optional in v1)

[SCREENSHOT: Workspace navigator showing tool tiles]

The launchpad after signing in. Shows your account tier and links to every design tool.

**Design tools**:
- 🪡 **Basic** — grid color planner (free)
- 💎 **Designer** — 3D Ring Grid Designer (Maker+)
- ✨ **Studio** — Freeform Designer (Studio)

**Utilities**:
- 📊 **Ring Size Chart** — AR reference (free)
- ⚙️ **Weave Tuner** — geometry workbench (preview free, save requires Maker)
- 🌐 **Weave Atlas** — curated preset catalog (browse free, apply requires Maker)

---

## 5. Freeform Studio

**URL**: `/freeform`
**Access**: Studio tier (preview-only on free)

[SCREENSHOT: Freeform Studio with a multi-color design in progress, palette visible bottom-left, toolbar on the left edge]

The primary production design environment. Place rings and scales on a free-form hex grid, apply colors, overlay reference images, fill shapes, copy + paste regions, and export finished patterns.

### Toolbar (left side, draggable)

| Icon | Tool | What it does |
|---|---|---|
| ☰ | Navigation | Opens the compass overlay to jump between pages |
| 📦 | Finalize & Export | PDF, CSV, GLB, STL, Physical Pattern exports |
| ⚙️ | Utility Panel | Toggles secondary pill (Geometry, Save/Load, Library, Stats, BG, Reset) |
| 🎨 | Draw (Paint) | Primary placement tool. Click or drag to place rings at hex-grid positions. R/S toggles ring/scale layer. |
| ⌫ | Eraser | Click or drag to remove. Painting wipes any prior image-fill patch. |
| ↩️ ↪️ | Undo / Redo | Per-action history. **Each Cmd+Z reverts exactly one action.** Cmd+Shift+Z to redo. |
| ⬚ | **Marquee Select** | Click-then-drag to select a rectangular region of existing rings/scales (no painting). Then Cmd+C to copy, right-click to paste. |
| ◼ | Shapes | Shape picker (Square, Circle, Hex, Octagon, Heart, Triangle). Drag on canvas to fill the shape (paint-and-select). |
| R/S | Ring/Scale layer | Switches the active paint layer. S = scales highlighted blue. |
| ✋ | Pan | Click-drag to scroll without placing. Two-finger touch always pans. |
| ✛ | Scale-Plane drag | Drags the scale grid relative to rings, writing to `gridOffsetXmm/Ymm`. |
| 📋 | Copy | Copies selected region's rings + scales (with image patches) onto the clipboard. Cmd/Ctrl+C also works. |
| 🖼️ | Image Overlay | Opens the Image Overlay panel (Studio tier). |
| 🧹 | Clear All | Removes everything. Confirmation required. |

### Copy / paste workflow

1. **Marquee Select** (⬚) — click button, drag rectangle around existing rings/scales
2. **Cmd+C** (or 📋 Copy) — captures the selection. The 📋 button shows a count badge. A blue dashed outline marks the captured region.
3. **Right-click anywhere on the canvas** — pastes the clipboard at that point. A blue ghost preview follows your cursor showing exactly where rings will land.
4. **Esc** dismisses the ghost without pasting.

> **Note**: paste auto-snaps the target row to the nearest matching-parity row (because chainmail's brick pattern shifts odd rows by half a centerSpacing). So a paste may land one row above or below where you clicked — that's how the cluster keeps its original shape.

[SCREENSHOT: Marquee selection with dashed outline + paste preview ghost following cursor]

### Image overlay (Studio tier)

[SCREENSHOT: Image overlay panel with sliders, image loaded, preview visible on canvas]

| Control | What it does |
|---|---|
| **Load / Replace image** | Drag-and-drop or click drop zone to load. Replace swaps for a new file. |
| **Scale / Opacity / Rotation / Pan X / Pan Y** | Register the image against your design. On-canvas preview updates live. |
| **Tile (repeat)** | Repeat the image across the design. **Pattern Scale (%)** sets tile size; 100% = single image fills design, 15% = small dense pattern. |
| **Mask outline** | Dashed rectangle defines the world-space region to paint into. Drag corners or body; "Reset" snaps to auto-bounds. |
| **Transfer Scope** | All rings (every cell of target) or Selection only. |
| **Transfer Target** | Rings · Scales · Both. |
| **Preview Mode** | "Sampled Colors" (default, shows actual ring/scale colors) or "Raw Image" (legacy clipped view). |
| **Image Fill on Scales** | When on, scales get a per-scale image patch instead of flat color. **Image Boundary (%)** insets the image inside the scale outline. |
| **Transfer (green, bottom)** | Commits the preview to actual ring/scale colors. Closing the panel without transfer reverts the preview. |

### Studio Stats panel (top-right)

Shows live counters: rings, colors used, geometry params (ID, WD, center spacing), design bounds (mm + ring count), and a breakdown of rings by color. Scales appear when present.

---

## 6. 3D Designer

**URL**: `/designer`
**Access**: Maker tier (Crafter+ for spline fill, image overlay)

[SCREENSHOT: 3D Designer with a colored ring grid rotated 30°, palette visible]

A 3D-rendered ring grid where every ring is a real torus you can rotate around. Use for projects where you want to validate the weave visually before cutting wire.

### Tools (same icons as Freeform where applicable)

- **Paint** — click a ring to color it; drag to color multiple
- **Erase** — same flow but removes color
- **Flood Fill** — fills connected same-color rings (Crafter)
- **Spline Fill** — draw a curve, the renderer fills the strip (Crafter)
- **Image Overlay** — apply image colors to the grid (Crafter)
- **Camera rotate** — orbit with click-drag, zoom with scroll/pinch
- **Camera reset** — snaps back to top-down

### Geometry tied to the Weave Tuner

Inner diameter, wire diameter, center spacing, and tilt angles come from the Tuner. Adjust there to retune the entire 3D scene.

---

## 7. Ring Size Chart

**URL**: `/chart`
**Access**: public, always free

[SCREENSHOT: Ring Size Chart with 3D viewport on left, AR calculator on right]

Interactive 3D visualization of every common ring size combination. Use it to **pick a ring spec before cutting wire**.

| Control | What it does |
|---|---|
| Ring grid selector | Pick rows and columns of (ID, WD) combinations |
| AR calculator | Enter ID and WD; see AR and a weave-suitability hint |
| Material color picker | Visualize what each combo looks like in your chosen color |
| 3D preview | Each cell renders as actual torus geometry; rotate to inspect |

---

## 8. Weave Tuner

**URL**: `/tuner`
**Access**: preview free, save/load requires Maker

[SCREENSHOT: Tuner page with a live 3D preview + sliders for geometry, with the snapshot save panel visible]

Live geometry workbench. Adjust every ring + scale parameter and watch the 3D scene update instantly.

### Panels

1. **Ring Geometry** — inner diameter, wire diameter, center spacing, angles (In/Out)
2. **Calibrate Scales** — Size & Style (presets, shape, color) and Dimensions (Hole ID + 4 sliders + calibrate link)
3. **Tune Scales** — Angles & View (enable, view toggle, sliders, sync) and Depth & Zoom (Plane Z, Tip Lift, Row Clearance Z, Zoom)
4. **Save / Load** — named weave snapshots in localStorage (Maker+)

### Tuner ↔ Freeform sync

The Tuner snapshot is written to `localStorage["freeform.tunerSnapshot.v1"]` and broadcast to Freeform via a custom event. Open Freeform after changing Tuner values and the new geometry applies immediately — no reload needed.

### Scale Row Clearance Z

Range: **−5 to +5**. Negative values sink scales behind ring plane.

### 3-state weave status (when saving)

When you save a Tuner entry, you set its status — this colors the matching cell in the Weave Atlas so other users (and you) can tell at a glance whether the combination is usable.

| Status | Meaning | Atlas cell color |
|---|---|---|
| **Rings + Scales** | Both ring and ring+scale weaves succeed at this ID / wire pair | 🟢 Green |
| **Rings only (no scales)** | Rings close cleanly, but the scale hole won't admit the ring at this AR. Still usable as a ring-only section. | 🟠 Orange |
| **No Solution** | Neither rings nor scales work at this combination | 🔴 Red |

### Grid X / Y under the lock

With **"Lock hole to ring center"** on, scales snap to ring centers — but the **Grid X** and **Grid Y** sliders are still editable. They apply a uniform offset to the whole scale plane: every scale shifts by the same vector, so registration to ring centers is preserved. Use them to dial in horizontal/vertical scale-vs-ring alignment without unlocking. (Scale Center Spacing stays disabled with the lock — that one is genuinely determined by the ring grid.)

---

## 9. Weave Atlas

**URL**: `/atlas`
**Access**: browse free, apply requires Maker

[SCREENSHOT: Weave Atlas grid with multiple weave types in cells, status colors visible]

Matrix of **inner diameter (rows)** × **wire diameter (columns)**. Each saved Tuner entry colors its cell by the 3-state status from the Tuner.

### Cell colors

| Color | Meaning |
|---|---|
| 🟢 Green | Both rings and ring+scale weave at this combination |
| 🟠 Orange | Rings close cleanly, scales don't at this AR — ring-only sections still usable |
| 🔴 Red | No solution at this combination |
| `+` (empty) | Untested — open the Tuner to calibrate |

> ⚠️ **The matrix is populated entirely by *your* Tuner saves — it's per-device.** Two users on different devices see independent matrices until they share a JSON export.

### Clicking cells

- **Click an active cell**: Applies that weave's geometry (ID, WD, center spacing, tilt) to the currently-active design tool. Does NOT change colors or layout — apply, then paint freely on top.
- **Click a `+` cell**: Opens the Tuner pre-loaded with that ID + wire combination and a guided setup flow (tune rings first, then scales, then save with a 3-state status).

---

## 10. Basic 2D Designer

**URL**: `/erin2d`
**Access**: Crafter tier

[SCREENSHOT: Erin Pattern 2D with a grid pattern in progress, image overlay visible]

Grid-based 2D pattern designer for traditional pixel-style chainmaille charting. Each cell = one ring. Best for **planning color sequences** before you start the weave.

**Tools**: paint, erase, row/column operations (insert, delete, shift), image overlay, export.

---

## 11. Export — BOM, CSV, PDF, 3D

[SCREENSHOT: Finalize & Export panel open over a finished design, ring counts visible]

Open via 📦 Finalize & Export in any designer.

### Bill of Materials (BOM)

Live ring count by color and size. Updates as you design.

### Export formats

| Format | Tier | Best for |
|---|---|---|
| **CSV** | Maker+ | Spreadsheets, order forms, raw data |
| **PDF Overview** | Crafter+ | Print a copy of your design with BOM table |
| **Physical Pattern PDF** | Crafter+ | True 1:1 scale per-color pages. Lay rings directly on the paper. |
| **GLB** | Studio | 3D model for Blender/Cinema 4D/etc. |
| **STL (per-color)** | Studio | One STL per color for multi-color 3D printing |

### Physical Pattern PDF details

- A4 portrait: 210×297mm at 10 px/mm
- 8mm margins, 14mm header, 6mm tile overlap (so adjacent sheets align)
- Per-color pages + a combined overview
- Ruler ticks every 10mm so you can verify the printer scale (no "fit to page" stretching)

---

## 12. How-to recipes

### Copy a heart with image colors and paste it elsewhere

1. Use Image Overlay to transfer an image into rings (e.g. a heart shape on a 4-in-1 panel).
2. Open Shapes, pick Heart, drag over the area you want to copy. *The selection auto-paints with the active color — that's the legacy Shape tool's behavior.*
3. **The clipboard captures the pre-paint state**, so the image colors are preserved.
4. Press **Cmd+C** or click 📋. The paste preview ghost appears.
5. Press **Cmd+Z** to undo the auto-paint so the heart's image colors are restored.
6. **Right-click** anywhere on the canvas to paste a copy of the heart. Each right-click pastes once; Esc dismisses the ghost.

### Place scales behind the rings

1. Open Studio Geometry (⚙️ → 🧰) and switch to the 🐠 Scale Tuners tab.
2. Drag the **Scale Plane Z (mm)** slider into negative values. Scales sink behind the ring plane.
3. Both renderers respect negative Z; adjacent rows still avoid clipping.

### Plan a project with the right ring before cutting wire

1. Open **Ring Size Chart**.
2. Enter the inner and wire diameters you have on hand → see the AR.
3. If AR < 3, weave will be too tight. 3.5–5.5 is workable. >6 gets sloppy.
4. Open **Weave Atlas** → filter by weave type → preview the cell at your AR.
5. Open **Tuner** → load that weave's snapshot → tweak if needed → save.
6. Open **Designer** or **Freeform** → start placing rings.

### Add a custom scale shape and make it the default

1. In **Freeform**, click the S-shape picker icon (the emoji button in the toolbar).
2. Click **+ Add custom shape**. The Custom Shape Editor opens.
3. Trace your outline by clicking points on the editor canvas, or paste polygon coordinates.
4. Save the shape. **It renders immediately on the design** — no reload required. (The renderer's lookup cache is invalidated on save; before this fix, freshly-created customs fell back to the legacy "teardrop" silhouette until you reloaded the page.)
5. Back in the picker, click the brush icon next to your shape's row, check **"Set as default"**, and apply. The next session will start with this shape as the default.

### Mark a tuned ring/wire pair as "rings only" in the Atlas

1. Open **Atlas**. Click a `+` (untested) cell at the ring ID × wire combo you want to tune.
2. The Tuner opens with the geometry pre-filled. Tune rings until they close cleanly on the AR.
3. Switch to **Calibrate Scales** → **Tune Scales** and observe whether scales weave at this geometry. If the scale hole won't pass over the ring, scales fail.
4. In the Tune Rings panel, set **Status → Rings only (no scales)**.
5. Click **Save**. Return to the Atlas — the cell now renders 🟠 orange.

### Shift the entire scale plane relative to the rings (without unlocking)

1. Open **Tuner** → **Tune Weave** panel.
2. Keep **Lock hole to ring center** checked. **Grid X** and **Grid Y** are now editable (Scale Center stays disabled — that one is determined by the ring grid).
3. Drag **Grid X** to nudge all scales left/right by the same amount; **Grid Y** nudges them up/down. Registration to ring centers is preserved.
4. Click **Save**. Freeform Studio picks up the offset on the next snapshot read — no reload.

### Upgrade your subscription tier

1. Sign in at [chainmaildesigner.com](https://chainmaildesigner.com).
2. Visit [chainmaildesigner.com/pricing](https://chainmaildesigner.com/pricing).
3. Click the **Start Maker / Crafter / Studio** button for the tier you want.
4. Stripe's hosted checkout page opens; your email is pre-filled.
5. Enter card details and click **Subscribe**.
6. Stripe processes payment, fires a webhook, and your account's tier flips within seconds.
7. Return to the app, refresh, and the locked tools are unlocked.

To **manage or cancel**, return to the pricing page — your current tier shows **"Manage subscription"** instead of an upgrade button. That opens Stripe's Customer Portal where you can switch tiers, update card info, or cancel.

### Get a printable pattern for a 6-color design

1. Finish the design in **Freeform** or **Designer**.
2. Open 📦 **Finalize & Export**.
3. Click **Physical Pattern PDF**. Confirm size estimate if prompted.
4. Print at 100% (NOT "fit to page"). Verify the 10mm ruler ticks match a real ruler.
5. Lay rings directly on the printed pages, one per page per color.

---

## 13. Keyboard shortcuts

| Keys | What it does | Available in |
|---|---|---|
| `Cmd/Ctrl + Z` | Undo | All designers |
| `Cmd/Ctrl + Shift + Z` | Redo | All designers |
| `Cmd/Ctrl + Y` | Redo | All designers |
| `Cmd/Ctrl + C` | Copy current selection | Freeform |
| `Cmd/Ctrl + V` | Toggle paste mode (legacy click-to-paste) | Freeform |
| `Right-click` | Paste at click point (modern) | Freeform |
| `Esc` | Exit paste mode / dismiss preview / cancel drag | Freeform |
| `Mouse wheel` | Zoom in/out | All canvases |
| `Pinch (touch)` | Zoom in/out | All canvases |
| `Two-finger drag (touch)` | Pan | All canvases |

---

## Signing out

Click **Sign out** in the auth bar (top-right of the home page when signed in) to end your local session and drop back to Free tier. Your Supabase account and any active Stripe subscription are preserved on the server — sign back in any time to restore your paid tier.

---

## Support & contact

- **Website**: [chainmaildesigner.com](https://chainmaildesigner.com)
- **Privacy policy**: [chainmaildesigner.com/privacy](https://chainmaildesigner.com/privacy)
- **EULA**: [chainmaildesigner.com/eula](https://chainmaildesigner.com/eula)
- **Email**: [micahforstein@gmail.com](mailto:micahforstein@gmail.com)
- **Shop (Etsy)**: search "Woven Rainbows by Erin"

---

*© 2026 Woven Rainbows by Erin · Chainmail Studio*
*Built with React, Three.js, and a lot of actual chainmaille at the workbench.*
