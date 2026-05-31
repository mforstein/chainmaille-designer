# Chainmaille Designer — Master Architecture Spec
# READ THIS EVERY SESSION. DO NOT REMOVE OR SKIP FEATURES.

## Project Identity
- **App:** Chainmaille Designer by Woven Rainbows by Erin
- **Owner:** Micah Forstein (micahforstein@gmail.com)
- **Stack:** React 18 + TypeScript + Vite + Three.js + pdf-lib + Tailwind
- **Hosting:** Netlify
- **Dev command:** `npm run dev` from project root
- **Project root:** `/Volumes/3Bang/Micah/chainmailledesginer/chainmaille-designer/chainmaille-designer-prod`

---

## Non-Negotiable Rules

1. **Never remove existing features.** Only add or fix.
2. **Never remove existing UI controls** (sliders, buttons, panels) unless the user explicitly asks.
3. **Never break the BOM/export pipeline.** CSV and PDF export must always work.
4. **Never break the Tuner ↔ Freeform snapshot sync** (`localStorage["freeform.tunerSnapshot.v1"]`).
5. **Always preserve the bodyOffsetY formula** — see CRITICAL NOTE below.
6. **Auth must be additive** — gating a route must never delete the page behind it.
7. **Subscription tiers must never reduce existing functionality for existing users.**

---

## Current Pages & All Features (complete inventory)

### `/wovenrainbowsbyerin` — Home (HomeWovenRainbows.tsx)
- Landing page with hero, brand identity
- Etsy shop integration / product links
- Blog system (posts loaded from JSON)
- Designer Gallery
- Public, no auth required

### `/designer` — 3D Ring Grid Designer (App.tsx — inline route)
- 3D ring grid: paint, erase, flood fill, spline fill
- Per-ring color assignment
- Scale layer (S-mode): place colored scales on top of rings
- BOM (Bill of Materials): ring count by color/size
- Export: PDF bill of materials, CSV ring list
- Supplier integration hook (SupplierMenu.tsx)
- Weave Atlas integration (apply preset weaves)
- Ring geometry controls (inner diameter, wire diameter, center spacing)
- Save/load project JSON
- Currently gated: password `ERIN50` → migrating to **Crafter tier**

### `/freeform` — Freeform 2D Designer (FreeformChainmail2D.tsx)
- Freeform ring placement (click to place, drag to paint)
- Erase tool, clear all
- Scale layer (S-mode) with full scale geometry
- Color palette: per-ring and per-scale color assignment
- Image overlay: load reference image, zoom (scale), pan (drag or sliders)
- Image transfer: map image colors onto placed rings/scales
- Shape fill: fill geometric shapes with rings (ShapePanel.tsx)
- Spline tool: draw curves, fill with rings
- Scale Tuner overrides: local sliders for all scale geometry params
  - Scale Row Clearance Z: **range -5 to +5**
- BOM view and export
- Export: PDF overview, Physical Pattern PDF (per-color 1:1 tiles), CSV
- Save/load project JSON
- Currently gated: password `ERIN50` → migrating to **Studio tier**

### `/erin2d` — Erin Pattern 2D (ErinPattern2D.tsx)
- Grid-based 2D pattern designer
- Reference image overlay (pan, zoom)
- Color palette tools
- Row/column operations
- Export capabilities
- Currently gated: password `ERIN50` → migrating to **Crafter tier**

### `/chart` — Ring Size Chart (RingSizeChart.tsx)
- 3D visualization of ring size combinations
- AR (aspect ratio) calculator
- Reference tool for ring selection
- **Public, always free**

### `/tuner` — Weave Tuner (ChainmailWeaveTuner.tsx)
- Ring geometry optimizer: inner diameter, wire diameter, center spacing, angles
- Scale geometry: hole diameter, width, height, drop, shape, plane Z, tip lift, row clearance
- Live 3D preview (RingRenderer.tsx)
- Save/load named weave sets (localStorage)
- Snapshot pushed to Freeform via `localStorage["freeform.tunerSnapshot.v1"]`
- **Free with account** (save requires login), preview always free

### `/atlas` — Weave Atlas (ChainmailWeaveAtlas.tsx)
- Preset weave browser (curated catalog)
- Apply preset to Designer
- **Free (read-only), apply requires Maker tier+**

### `/wovenrainbowsbyerin/login` — Password Gate (PasswordGate.tsx)
- Currently: single shared password `ERIN50`
- Migrating to: Supabase Auth (email/password + tier-based access)
- Old password gate to remain as fallback during transition

### `/blog-editor` — Blog Editor (BlogEditor.tsx, BlogManager.tsx)
- Erin-only content management
- Create/edit/delete blog posts
- **Admin only** — tied to specific email (micahforstein@gmail.com)

### `/_calibration` — Color Calibration (ColorCalibrationTest.tsx)
- Internal utility for screen color accuracy
- **Admin only**

---

## Subscription Tier Strategy

### Tiers

| Tier | Monthly Price | Target User |
|------|---------------|-------------|
| **Free** | $0 | Browsers, beginners |
| **Maker** | $2.99/mo | Hobbyists building for themselves |
| **Crafter** | $5.99/mo | Semi-pro, selling at markets/online |
| **Studio** | $9.99/mo | Full-time makers, pattern designers, shops |

> Pricing updated 2026-05-31 per Erin: top tier capped at $10/mo, lower
> tiers scaled proportionally. Free tier may eventually carry optional
> advertising via a service — undecided; no ads in v1.

### Feature Access Matrix

| Feature | Free | Maker | Crafter | Studio |
|---------|:----:|:-----:|:-------:|:------:|
| Home, Blog | ✓ | ✓ | ✓ | ✓ |
| Ring Size Chart | ✓ | ✓ | ✓ | ✓ |
| Weave Atlas (browse) | ✓ | ✓ | ✓ | ✓ |
| Weave Atlas (apply to Designer) | — | ✓ | ✓ | ✓ |
| Weave Tuner (preview) | ✓ | ✓ | ✓ | ✓ |
| Weave Tuner (save/load weaves) | — | ✓ | ✓ | ✓ |
| **Basic 2D Rings** (Erin Pattern 2D, basic) | ✓ | ✓ | ✓ | ✓ |
| 3D Designer (no image overlay) | — | ✓ | ✓ | ✓ |
| 3D Designer (full, spline, flood fill) | — | — | ✓ | ✓ |
| Freeform (preview, default design only) | — | — | ✓ | ✓ |
| Freeform (full: custom ring/scale placement) | — | — | — | ✓ |
| Freeform (image overlay + transfer) | — | — | — | ✓ |
| Freeform (shape fill, spline) | — | — | — | ✓ |
| Export CSV | — | ✓ | ✓ | ✓ |
| Export PDF BOM | — | — | ✓ | ✓ |
| Physical Pattern PDF (1:1 tiles) | — | — | ✓ | ✓ |
| Supplier cost estimator | — | — | — | ✓ |
| Supplier catalog sync | — | — | — | ✓ |
| Affiliate buy buttons | — | — | ✓ | ✓ |
| Commercial use license | — | — | — | ✓ |
| Mobile app access | ✓ | ✓ | ✓ | ✓ |
| Blog editor (admin) | — | — | — | admin |

### Existing Users
- Issue existing `ERIN50` users a **90-day free Studio trial** on migration so nobody loses access.

---

## Roadmap (in priority order)

### Phase 1 — Auth Layer (CURRENT)
- Install `@supabase/supabase-js`
- `src/auth/AuthContext.tsx` — Supabase client, session state, tier from user metadata
- `src/auth/useAuth.ts` — hook exposing `user`, `tier`, `signIn`, `signUp`, `signOut`
- `src/auth/RequiresTier.tsx` — route/feature guard with upsell UI
- `src/pages/AuthPage.tsx` — sign in / sign up / forgot password UI
- Replace PasswordGate with RequiresTier checks
- Supabase project: create at supabase.com, add URL + anon key to `.env`

### Phase 2 — PWA (Mobile Foundation)
- `public/manifest.json` — app name, icons, theme color
- `public/sw.js` — service worker for offline caching
- Register service worker in `index.html`
- Meta tags for iOS standalone mode

### Phase 3 — Supplier Integration (Studio Tier)
- `src/data/suppliers/` — curated JSON catalogs for:
  - The Ring Lord (trl)
  - Chainmail Joe (cmj)
  - Metal Designz (mdz)
  - Steampunk Garage (spg)
- Catalog schema: `{ sku, name, innerDiameter, wireDiameter, material, colorHex, priceUsd, unitQty, url, supplierId }`
- `src/lib/supplierMatcher.ts` — match BOM ring specs → supplier SKUs
- `src/components/CostEstimator.tsx` — source picker + price breakdown UI
- Affiliate links (deep link to product pages with tracking params)
- Availability flags in design tools

### Phase 4 — Mobile App (Capacitor)
- Add Capacitor.js wrapper
- iOS + Android configs, signing setup
- Responsive layout pass (side panels → bottom sheets on small screens)
- Touch gesture audit (pinch-to-zoom vs tool gestures)
- Native camera integration (import reference images from photo library)
- Native share sheet (export PDF to Files/Drive)
- App Store + Google Play submission

### Phase 5 — Billing
- Stripe Checkout per tier
- Webhook → Supabase user metadata `tier` update
- Subscription management page

---

## Critical Technical Notes (read before touching these areas)

### bodyOffsetY — NEVER CHANGE THIS FORMULA
```typescript
const holeShoulderInset = Math.max(holeDia * 0.54, height * 0.15);
const bodyOffsetY = -holeShoulderInset + dropMm;
```
Using `bodyY - holeY` from the snapshot produces upside-down scales. This formula is ground truth.

### Scale Pivot Transform — Matrix, not Euler
```typescript
pivot.matrix.set(
  m00, 0, 0, 0,   // m00 = tiltRad (Angle In/Out)
  0, m11, 0, 0,   // m11 = cos(tipLiftDeg * DEG) (Tip Lift)
  0, 0,   1, 0,
  0, 0,   0, 1,
);
pivot.matrixAutoUpdate = false;
pivot.matrix.setPosition(holeX, -holeY, finalZ + index * 0.01);
```
Euler rotations produce wrong-axis effects in this front-on camera setup.

### Image Overlay Pan/Transfer Coordinate Math
- `offsetX`/`offsetY` are screen pixels in a `360×180` preview panel
- Convert to image-normalized fraction: `offsetX / (PREVIEW_W * scale)`
- Transfer formula:
```typescript
let nx = ((wx - worldCenterX) / worldW) * invScale + 0.5 - offsetX / (PREVIEW_W * scale);
let ny = ((wy - worldCenterY) / worldH) * invScale + 0.5 - offsetY / (PREVIEW_H * scale);
```

### Tuner ↔ Freeform Sync
- Key: `localStorage["freeform.tunerSnapshot.v1"]`
- Freeform reads this on mount + when Tuner saves
- NO `window.addEventListener("focus", ...)` — this was removed because it wiped slider overrides
- Slider overrides only clear when snapshot *content* changes (not object reference)

### White Ring Visibility
- `#FFFFFF` on white canvas = invisible
- All drawing functions use luminance check: `lum > 0.88 → "#d4d4d4"`
```typescript
const lum = hexLuminance(hex);
const displayHex = lum > 0.88 ? "#d4d4d4" : hex;
```

### Scale Row Clearance Z slider
- Range: **-5 to +5** (not 0 to 3)

### destination-out canvas compositing
- DO NOT use `destination-out` for ring holes in PDF/pattern canvas
- Use **white fill** instead — destination-out punches through scales drawn below

### PDF Physical Pattern
- A4 portrait: 210×297mm, 10px/mm
- 8mm margins, 14mm header, 6mm tile overlap
- Per-color pages + combined overview
- Ruler ticks every 10mm for print scale verification

---

## File Structure Notes

```
src/
  App.tsx                          # Root routing, 3D Designer inline
  auth/                            # (ROADMAP Phase 1 — to be created)
    AuthContext.tsx
    useAuth.ts
    RequiresTier.tsx
  pages/
    HomeWovenRainbows.tsx
    FreeformChainmail2D.tsx        # Main freeform designer
    ErinPattern2D.tsx              # Grid pattern designer
    RingSizeChart.tsx
    ChainmailWeaveTuner.tsx
    ChainmailWeaveAtlas.tsx
    BlogEditor.tsx
    BlogManager.tsx
    ColorCalibrationTest.tsx
    PasswordGate.tsx               # → replace with RequiresTier
    AuthPage.tsx                   # (ROADMAP — to be created)
  components/
    RingRenderer.tsx               # Three.js WebGL renderer (shared)
    RingRenderer3D.tsx
    FinalizeAndExportPanel.tsx     # PDF/CSV export + physical pattern
    FinalizeAndExportPanel — buildPatternPdf() = physical 1:1 per-color PDF
    ShapePanel.tsx                 # Shape fill tool
    SupplierMenu.tsx               # Supplier integration entry point
    BOMButtons.tsx
    BOMExport.ts
    FloatingPanel.tsx
    ImageOverlayPanel.tsx
    PrintPreviewOverlay.tsx
    GeometryPanel.tsx
    EulaDialog.tsx
    Paywall.tsx                    # Stub → replace with RequiresTier
    ProjectSaveLoadButtons.tsx
    Canvas2DGrid.tsx
    AtlasPalette.tsx
    ui/
      ToolBtn.tsx                  # 44×44px tool button, active state = blue
  hooks/
    useUnlocked.ts                 # Stub → replace with useAuth tier check
  data/
    suppliers.ts                   # Legacy stub (do not delete)
    supplierCatalog/               # Phase 3 — full product catalog
  BOM/
    bomCalculator.ts
```

---

## Environment Variables (required)
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
Create `.env.local` for development, set in Netlify dashboard for production.

---

## Supplier Catalog Schema (for Phase 3)
```typescript
interface SupplierProduct {
  sku: string;
  supplierId: "trl" | "cmj" | "mdz" | "spg";
  name: string;
  type: "ring" | "scale";
  innerDiameterMm?: number;
  wireDiameterMm?: number;
  material: string;             // "aluminum" | "sterling" | "stainless" | etc.
  colorHex?: string;
  priceUsd: number;
  unitQty: number;              // rings or scales per pack
  url: string;                  // deep link to product page
  affiliateUrl?: string;        // with tracking params
  inStock?: boolean;
}
```

---

## Suppliers Reference
| ID | Name | URL |
|----|------|-----|
| trl | The Ring Lord | theringlord.com |
| cmj | Chainmail Joe | chainmailjoe.com |
| mdz | Metal Designz | metaldesignz.com |
| spg | Steampunk Garage | steampunkgarage.com |

---

## Mobile App Notes (Phase 4)
- **Technology: Capacitor.js** (wraps existing React app — no rewrite needed)
- Canvas tools work as-is; only layout and touch gestures need mobile pass
- Side panels → bottom sheets at screen width < 768px
- PWA (manifest.json + service worker) ships before Capacitor for early testing
- Target: iOS App Store + Google Play Store
- Native features needed: camera (reference image import), share sheet (PDF export)
