# Chainmail Studio — Google Play Store Listing

Reference copy for the Play Console listing fields. Generated 2026-05-30. Update before each major version.

---

## Required fields

### App name (30 char max)
```
Chainmail Studio
```
*(16 chars — well under limit; leaves room for tagline variants if you ever want one)*

### Short description (80 char max)
```
Design chainmaille patterns. Plan ring counts. Export print-ready PDFs.
```
*(71 chars)*

### Full description (4000 char max)

```
Chainmail Studio is a complete design and planning toolkit for chainmaille makers, jewelry designers, and armorers. Whether you're laying out a single bracelet or planning a full hauberk, Chainmail Studio gives you the tools to design accurately, predict ring counts, and produce print-ready patterns.

DESIGN MODES

• Freeform Studio — a paint-first 2D workspace where every click places a ring. Draw shapes, fill regions with rings, layer scales over rings, copy and paste sections, and use reference images as overlays to trace from.

• 3D Designer — work directly on a 3D ring grid. Paint colors per ring, place scales on top, and rotate the camera to verify the weave from any angle.

• Erin Pattern 2D — a grid-based pattern designer for traditional pixel-style chainmaille charting, with reference image overlays and row/column operations.

PLANNING TOOLS

• Ring Size Chart — interactive 3D visualization of every ring size combination with built-in AR (aspect ratio) calculator. Helps you choose the right ring before you cut the wire.

• Weave Tuner — optimize ring geometry for your chosen weave. Adjust inner diameter, wire diameter, center spacing, and angles in real time with a live 3D preview. Save and load named weave sets.

• Weave Atlas — browse a curated catalog of preset weaves with one-click apply to the designer.

BILL OF MATERIALS

Every design produces an accurate Bill of Materials: ring counts broken down by color and size, ready for ordering. Export as CSV for spreadsheets or PDF for printing. Generate physical pattern PDFs at true 1:1 scale, per color or combined, for printing and laying rings directly on the paper.

WHAT'S FREE

• Browse Weave Atlas presets, use the Ring Size Chart, preview Weave Tuner
• View basic 2D Erin Pattern designs
• Read the user manual, browse the blog

UPGRADE FOR FULL DESIGN POWER

Maker, Crafter, and Studio tiers unlock 3D Designer paint and flood-fill, full Freeform 2D with image overlays and shape fill, supplier cost estimation, and the full BOM/PDF export pipeline. Visit chainmaildesigner.com to learn more.

DESIGNED BY MAKERS

Chainmail Studio is built by Woven Rainbows by Erin, a working chainmaille shop. Every feature exists because we needed it on real projects. Updates ship continuously based on what's actually helpful at the workbench.

PRIVACY

We collect only what's needed to run the app — email for sign-in and the designs you save. No advertising, no tracking, no selling your data. Full privacy policy at chainmaildesigner.com/privacy.
```

*(~2,200 chars — well under 4,000)*

---

## Graphics

### App icon
- **Source**: `resources/icon.png` (1024×1024)
- Already generated for Android via `@capacitor/assets`
- Play Console wants a 512×512 hi-res icon for the listing — same file works

### Feature graphic (required — 1024×500)
Suggested concept: a stylized chainmaille weave (rendered from the 3D Designer) with the app name overlaid. Render a clean European 4-in-1 pattern in silver against a dark navy background (`#0b0f1a` to match the app's color scheme), with white "Chainmail Studio" text bottom-right.

*Status: needs to be created. Quick path — open Designer, build a 12×8 patch, screenshot, crop to 1024×500, add text in any image editor.*

### Screenshots (required — at least 2, up to 8, per device class)
**Phone (16:9 or 9:16)**: 320 to 3840 px on the long edge

Recommended captures:
1. **3D Designer in action** — colored ring grid rotated, with palette visible
2. **Freeform Studio** — a finished design with rings + scales
3. **Weave Atlas browser** — grid of weave thumbnails
4. **Weave Tuner** — sliders + live 3D preview
5. **Ring Size Chart** — 3D visualization
6. **BOM/Export panel** — showing color breakdown ready to export

**Tablet (optional but recommended for "designed for tablet" badge)**: 1080 to 7680 px

---

## App content / Policy fields

### Privacy policy URL
```
https://chainmaildesigner.com/privacy
```

### App access
- "All or some app functionality is restricted in my app" — **No** (login is optional in v1)
- *Or* "**Yes**, sign-in is required" if you want to gate the Designer behind login

### Ads
**No** — the app contains no ads.

### Content rating questionnaire
- **Violence**: None
- **Sexuality**: None
- **Language**: None
- **Controlled substances**: None
- **User-generated content**: Yes (users save their own designs, but designs are not shared publicly in v1)
- **Social interaction features**: No
- Result: **Everyone**

### Target audience and content
- **Age groups**: 13+, 18+ (chainmaille construction can involve sharp tools; designed for general makers)
- **App designed primarily for children?** No

### News
**No** — not a news app.

### COVID-19 contact tracing
**No**.

### Data safety form
**Data collected and shared:**

| Data type | Collected? | Shared? | Optional? | Purpose | Linked to user? |
|---|---|---|---|---|---|
| Email address | Yes | No | Required for account | App functionality | Yes |
| User content (designs) | Yes | No | Optional (only if user signs in) | App functionality | Yes |
| Device or other IDs | No | — | — | — | — |
| Location | No | — | — | — | — |
| Personal info (name, etc.) | No | — | — | — | — |
| Financial info | No | — | — | — | — |
| Photos and videos | Locally only (camera plugin) | No | User-initiated | App functionality (reference image import) | No |
| Audio | No | — | — | — | — |
| Files and docs | Locally only (Share plugin for PDF export) | No | User-initiated | App functionality | No |

**Security practices**:
- Data is encrypted in transit (HTTPS/TLS)
- Users can request that their data be deleted (email us)

### Government apps
**No**.

### Financial features
**No**.

### Health (if applicable)
**No**.

---

## Categorization

- **App category**: Art & Design (primary), Hobbies (secondary if available)
- **Tags**: design, crafts, jewelry, 3d

---

## Pricing & distribution
- **Free** (in-app subscription via website for v1; no native IAP)
- **Countries**: All available (start with worldwide; remove territories later if needed)

---

## Release tracks (in order)

1. **Internal testing** — fastest review, invite by email. Use this for the first build.
2. **Closed testing** — opt-in via email/group, slightly more review.
3. **Open testing** — anyone with the link can join.
4. **Production** — public Play Store listing.

Promote one track at a time, with at least a day in each, so you have time to catch issues before public release.
