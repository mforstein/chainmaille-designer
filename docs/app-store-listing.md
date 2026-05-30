# Chainmail Studio — Apple App Store Listing

Reference copy for the App Store Connect listing fields. Generated 2026-05-30. Update before each major version.

App Store Connect: [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
Signing Apple ID: `micahforstein@me.com`
Bundle ID: `com.wovenrainbows.chainmailledesigner`

---

## Required fields

### App Name (30 char max — what appears under the icon)
```
Chainmail Studio
```
*(16 chars)*

### Subtitle (30 char max — shown below name in search & lists)
```
Design chainmaille patterns
```
*(28 chars)*

### Promotional Text (170 char max — editable without app review)
```
Plan chainmaille builds with a 3D ring grid, freeform 2D designer, Weave Atlas, and a Weave Tuner. Accurate BOM exports for every project.
```
*(140 chars)*

### Description (4000 char max)
```
Chainmail Studio is a complete design and planning toolkit for chainmaille makers, jewelry designers, and armorers. Whether you're laying out a single bracelet or planning a full hauberk, Chainmail Studio gives you the tools to design accurately, predict ring counts, and produce print-ready patterns.

DESIGN MODES

— Freeform Studio: a paint-first 2D workspace where every click places a ring. Draw shapes, fill regions with rings, layer scales over rings, copy and paste sections, and use reference images as overlays to trace from.

— 3D Designer: work directly on a 3D ring grid. Paint colors per ring, place scales on top, and rotate the camera to verify the weave from any angle.

— Erin Pattern 2D: a grid-based pattern designer for traditional pixel-style chainmaille charting, with reference image overlays and row/column operations.

PLANNING TOOLS

— Ring Size Chart: interactive 3D visualization of every ring size combination with built-in AR (aspect ratio) calculator. Helps you choose the right ring before you cut the wire.

— Weave Tuner: optimize ring geometry for your chosen weave. Adjust inner diameter, wire diameter, center spacing, and angles in real time with a live 3D preview. Save and load named weave sets.

— Weave Atlas: browse a curated catalog of preset weaves with one-click apply to the designer.

BILL OF MATERIALS

Every design produces an accurate Bill of Materials: ring counts broken down by color and size, ready for ordering. Export as CSV for spreadsheets or PDF for printing. Generate physical pattern PDFs at true 1:1 scale, per color or combined, for printing and laying rings directly on the paper.

WHAT'S FREE

— Browse Weave Atlas presets
— Use the Ring Size Chart
— Preview the Weave Tuner
— View basic 2D Erin Pattern designs
— Read the full user manual

UPGRADE FOR FULL DESIGN POWER

Maker, Crafter, and Studio tiers unlock 3D Designer paint and flood-fill, full Freeform 2D with image overlays and shape fill, supplier cost estimation, and the full BOM/PDF export pipeline. Visit chainmaildesigner.com to learn more.

DESIGNED BY MAKERS

Chainmail Studio is built by Woven Rainbows by Erin, a working chainmaille shop. Every feature exists because we needed it on real projects. Updates ship continuously based on what's actually helpful at the workbench.

PRIVACY

We collect only what's needed to run the app — email for sign-in and the designs you save. No advertising, no tracking, no selling your data. Full privacy policy at chainmaildesigner.com/privacy.
```

### Keywords (100 char max, COMMA-SEPARATED, NO SPACES after commas — they waste characters)
```
chainmaille,chainmail,jewelry,ring,weave,scale,pattern,maille,armor,craft,maker,bom,pdf,3d,design
```
*(96 chars)*

### Support URL (required)
```
https://chainmaildesigner.com
```

### Marketing URL (optional but recommended)
```
https://chainmaildesigner.com
```

### Privacy Policy URL (required)
```
https://chainmaildesigner.com/privacy
```

---

## Categorization
- **Primary category**: Graphics & Design
- **Secondary category**: Lifestyle

---

## App Privacy (Apple's privacy nutrition labels)

App Store Connect → App Privacy → Data Types Collected.

Declare each of the following:

### Contact Info — Email Address
- **Collected? Yes**
- **Linked to user? Yes**
- **Used to track user? No**
- **Used for**: App Functionality (sign-in / account)

### User Content — Customer Support
- *Skip unless you have a support form embedded*

### User Content — Other User Content (the saved designs)
- **Collected? Yes**
- **Linked to user? Yes**
- **Used to track user? No**
- **Used for**: App Functionality (save/load designs across devices)

### Identifiers
- **Collected? No** (no advertising IDs, no device IDs)

### Diagnostics
- **Collected? No** (no analytics or crash reporting in v1; add later if needed)

### Tracking
- **Does the app track users? No**

---

## Age rating questionnaire
- **Cartoon or Fantasy Violence**: None
- **Realistic Violence**: None
- **Prolonged Graphic or Sadistic Realistic Violence**: None
- **Profanity or Crude Humor**: None
- **Mature/Suggestive Themes**: None
- **Horror/Fear Themes**: None
- **Medical/Treatment Information**: None
- **Alcohol, Tobacco, or Drug Use or References**: None
- **Simulated Gambling**: None
- **Sexual Content or Nudity**: None
- **Graphic Sexual Content and Nudity**: None
- **Unrestricted Web Access**: No
- **Gambling and Contests**: No

Result: **4+**

---

## Pricing
- **Free**
- Available in all territories (start worldwide; can restrict per-country later)
- **No in-app purchases** in v1 (subscription via website only — per Apple Guideline 3.1.3(a), you may inform users about external purchase options in plain text but not link directly)

---

## Screenshots

App Store Connect requires screenshots for at least two device classes (Apple picks the largest you provide and may auto-scale).

### 6.7" iPhone (iPhone 14/15 Pro Max — 1290×2796 portrait)
Submit 3–10 screenshots. Order matters — first 3 show up in search results.

Recommended sequence:
1. **Hero**: 3D Designer with a finished chainmaille design rotated 30° for depth
2. **Freeform Studio**: a real project (bracelet or wall hanging) mid-design
3. **Weave Atlas**: catalog grid showing many weaves
4. **Weave Tuner**: sliders + live 3D preview
5. **BOM export**: showing the ring breakdown ready to order
6. **Ring Size Chart**: 3D visualization with AR calculator

### 12.9" iPad Pro (2048×2732 portrait) — recommended for "Designed for iPad" tagline
Same content as iPhone but use the extra screen real estate (panel + canvas both visible).

### iPad screenshots are required if you want to be discoverable in iPad search results — even if the app is universal.

---

## Build & TestFlight workflow (first submission)

1. Xcode → archive (Product → Archive)
2. Xcode Organizer → upload to App Store Connect
3. Wait ~10–30 min for Apple to process the binary
4. App Store Connect → TestFlight → enable for internal testing
5. Test on at least one real device for a few days
6. App Store Connect → 1.0 → fill all the fields above → "Submit for Review"
7. Review takes 1–3 days typically; you'll get email updates

---

## Things to know about Apple v1 reviews

- **Guideline 4.2 (Minimum Functionality)** is the most common cause of v1 rejection for "thin wrappers around a website." Your app has native Camera + Share integration via Capacitor plugins, plus the offline-capable 3D designer — call those out explicitly in your "Notes for Reviewer" field.

- **Guideline 5.1.1 (Account Sign-In)**: if you make accounts mandatory, you must offer **Sign in with Apple** as one of the options. v1 keeps sign-in optional so this rule doesn't bite us yet — but plan for it when you add tier gating.

- **Guideline 3.1.1 (In-App Purchase)**: for any digital subscription consumed in the app, you must use Apple IAP. v1 hides paid tools entirely with no native purchase flow, so this is sidestepped. The website mention in the description is allowed under 3.1.3(a) as long as it's plain text, not a tappable button.

### Notes for App Review (paste this when you submit)
```
Chainmail Studio is a chainmaille design tool with multiple native integrations:

- Native Camera (via Capacitor) for importing reference images into the
  design canvas
- Native Share Sheet (via Capacitor) for exporting Bill of Materials PDFs
  and design files to Files / AirDrop / etc.
- Offline-capable 3D designer (Three.js / WebGL) — works without network
  once the app is launched

This is not a web wrapper — the bundled Vite build is the core of the app
and the native plugins are integral to the design workflow.

The app is free; paid Maker/Crafter/Studio tiers are managed entirely on
the desktop website and are not purchasable from the app. The Description
mentions the website as informational text per Guideline 3.1.3(a).

If you need test credentials for any reason, contact micahforstein@gmail.com.
```
