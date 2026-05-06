# Chainmaille Designer — Scale Rendering Context for Claude Code

## Project location
```
/Volumes/3Bang/Micah/chainmailledesginer/chainmaille-designer/chainmaille-designer-prod
```
Run dev server: `cd` to above, then `npm run dev` (Vite).

Key files:
- `src/pages/FreeformChainmail2D.tsx`
- `src/components/RingRenderer.tsx` (or similar path — confirm with `find src -name RingRenderer.tsx`)
- `src/pages/ChainmailWeaveTuner.tsx`

---

## Application overview

Two-page React + TypeScript + Three.js chainmaille design app:

**Tuner page** (`ChainmailWeaveTuner.tsx`): Adjusts ring and scale geometry with sliders. Saves settings to `localStorage["freeform.tunerSnapshot.v1"]` continuously (useEffect auto-save) AND on "Save" button click. The snapshot format is:
```json
{
  "geometry": { "innerDiameter": 7.94, "wireDiameter": 1.2, "centerSpacing": 6.7, "angleIn": 25, "angleOut": -25 },
  "scaleSettings": {
    "scaleHoleDiameter": 7.9375, "scaleWidth": 10.3, "scaleHeight": 27.6,
    "scaleShape": "teardrop", "scaleDrop": 13.15, "scaleColor": "#1fc5d8",
    "scaleAngleIn": -1.0, "scaleAngleOut": 1.0,
    "scalePlaneZ": 12.9, "scaleTipLiftDeg": 8.0, "scaleRowClearanceZ": 0.0,
    "lockScaleHolesToRingCenters": true, "scaleWeaveMode": "interlocked", ...
  },
  "scales": [{ "row": 0, "col": 0, "holeX": 0, "holeY": 0, "bodyX": 0, "bodyY": -13.15, "holeDiameter": 7.9375, "width": 10.3, "height": 27.6, "shape": "teardrop", "tiltRad": -0.0175, "colorHex": "#1fc5d8" }],
  "rings": [{ "row": 0, "col": 0, "color": "#ffffff" }]
}
```

**Freeform page** (`FreeformChainmail2D.tsx`): Freeform ring/scale placement. Reads the Tuner snapshot from localStorage. Has its own scale sliders ("Scale Tuners from Tuner" panel) that override the snapshot values locally without changing the Tuner.

**RingRenderer** (`RingRenderer.tsx`): Shared Three.js WebGL renderer used by both pages.

---

## Data pipeline (Freeform scale rendering)

```
tunerSnapshot (localStorage)
  → normalizeFreeformScaleSettings(tunerSnapshot.scaleSettings)
    → baseScaleSettings (FreeformScaleSettings object)
      → activeScaleSettings = { ...baseScaleSettings, ...scaleSettingsOverride }
        → exportScales (useMemo) — builds ExportScale[] from scaleColors + tunerSnapshot.scales
          → scales3D (useMemo) — converts to ScaleRenderItem[], applies origin shift
            → <RingRenderer scales3D={scales3D} showScales={...} />
              → makeScaleShape() + makeScalePivot() in geometry useEffect
```

### Key types

**FreeformScaleSettings** fields (Freeform internal):
- `holeIdMm`, `widthMm`, `heightMm`, `dropMm`, `shape`
- `angleInDeg`, `angleOutDeg` (even/odd row tilt)
- `scalePlaneZ` (depth in front of ring plane)
- `scaleTipLiftDeg`, `scaleRowClearanceZ`
- `colorHex`, `lockScaleHolesToRingCenters`, `weaveMode`, etc.

**normalizeFreeformScaleSettings** maps Tuner JSON field names → internal names:
- `scaleHoleDiameter` → `holeIdMm`
- `scaleWidth` → `widthMm`, `scaleHeight` → `heightMm`
- `scaleDrop` → `dropMm`, `scaleColor` → `colorHex`
- `scaleAngleIn` → `angleInDeg`, `scaleAngleOut` → `angleOutDeg`
- `scalePlaneZ` → `scalePlaneZ` (direct)
- `scaleTipLiftDeg` → `scaleTipLiftDeg` (direct)
- `scaleRowClearanceZ` → `scaleRowClearanceZ` (direct)

**ExportScale** fields:
- `x_mm`, `y_mm` (hole position in logical mm)
- `bodyX_mm`, `bodyY_mm` (body anchor in logical mm)
- `holeIdMm`, `widthMm`, `heightMm`, `shape`, `dropMm`
- `tiltRad` (angleIn or angleOut * DEG depending on row parity)
- `planeZMm`, `tipLiftDeg`, `rowClearanceZMm`
- `colorHex`

**ScaleRenderItem** (passed to RingRenderer):
- `x`, `y` (hole position, origin-shifted)
- `bodyY` (body anchor, origin-shifted)
- `holeDiameter`, `width`, `height`, `shape`
- `tiltRad`, `tipLiftDeg`
- `planeZMm` (pre-stacked Z = planeZ + rowClearance stacking)
- `rowClearanceZMm` = 0 (stacking already done in scales3D)
- `dropMm` (needed by RingRenderer to recompute bodyOffsetY correctly)
- `color`

---

## bodyOffsetY — CRITICAL

**Correct formula** (matches Tuner exactly):
```
holeShoulderInset = max(holeDiameter * 0.54, height * 0.15)
bodyOffsetY = -holeShoulderInset + dropMm
```

With `dropMm=13.05`, `holeDia=7.9375`, `height=27.6`:
- `holeShoulderInset = max(4.29, 4.14) = 4.29`
- `bodyOffsetY = -4.29 + 13.05 = +8.76` (positive = body above hole in local space, tip hangs below)

**DO NOT** use `bodyY - holeY` from the snapshot — the snapshot stores `bodyY = -scaleDrop` (wrong sign) which produces an upside-down scale shape.

RingRenderer must compute bodyOffsetY from `dropMm` directly:
```typescript
const holeShoulderInset = Math.max(holeDia * 0.54, height * 0.15);
const bodyOffsetY = -holeShoulderInset + dropMm;
```

---

## Scale shape geometry (Tuner's makeScaleShape)

```typescript
const halfW = width / 2;
const tipY      = bodyOffsetY - height;          // bottom of scale
const shoulderY = bodyOffsetY - height * 0.08;   // top of scale body (near hole)
const bellyY    = bodyOffsetY - height * 0.45;
const lowerY    = bodyOffsetY - height * 0.78;
// hole at local (0, 0) with clockwise winding (absellipse true)
```

Teardrop (default):
```typescript
s.moveTo(0, shoulderY);
s.bezierCurveTo(halfW*1.08, bodyOffsetY-height*0.14, halfW*1.16, bellyY, halfW*0.36, lowerY);
s.bezierCurveTo(halfW*0.18, bodyOffsetY-height*0.88, halfW*0.08, bodyOffsetY-height*0.95, 0, tipY);
s.bezierCurveTo(-halfW*0.08, bodyOffsetY-height*0.95, -halfW*0.18, bodyOffsetY-height*0.88, -halfW*0.36, lowerY);
s.bezierCurveTo(-halfW*1.16, bellyY, -halfW*1.08, bodyOffsetY-height*0.14, 0, shoulderY);
const hole = new THREE.Path();
hole.absellipse(0, 0, holeDiameter/2, holeDiameter/2, 0, Math.PI*2, true, 0); // clockwise
s.holes.push(hole);
```

---

## Pivot / rotation — CURRENT IMPLEMENTATION

After extensive debugging, the correct transform for scale pivots in Freeform is a **matrix transform** (not Euler rotations):

```typescript
// m00 drives Angle In/Out (horizontal lean), m11 drives Tip Lift (vertical compression)
const m00 = tiltRad;                        // signed: even rows = angleInDeg*DEG, odd = angleOutDeg*DEG
const m11 = Math.cos(tipLiftDeg * S_DEG);  // 1=flat, approaches 0 at 90deg

pivot.matrix.set(
  m00, 0,   0, 0,
  0,   m11, 0, 0,
  0,   0,   1, 0,
  0,   0,   0, 1,
);
pivot.matrixAutoUpdate = false;
pivot.matrix.setPosition(holeX, -holeY, finalZ + index * 0.01);
```

This was determined empirically — `m00` (the X-scale term) produces the correct fan/lean visual, `m11` (Y-scale term) produces the correct tip lift. Euler rotations and group rotations all produced wrong-axis effects in this front-on camera setup.

---

## Camera setup in RingRenderer

Camera is tilted down to give 3D perspective (like the Tuner's `root.rotation.x = -0.22`), but using camera position instead of group rotation (group rotation corrupts pivot local axes):

```typescript
const tilt = scalesBehindRings ? 0.08 : 0.22;
const camY = cy + dist * Math.sin(tilt);
const camZ = dist * Math.cos(tilt);
cam.position.set(cx, camY, camZ);
cam.lookAt(cx, cy, 0);
```

Camera distance uses `fitCameraToBounds` (matching Tuner):
```typescript
const fovY = THREE.MathUtils.degToRad(cam.fov);
const fovX = 2 * Math.atan(Math.tan(fovY / 2) * (cam.aspect || 1));
const distY = (ch / 2) / Math.tan(fovY / 2);
const distX = (cw / 2) / Math.tan(fovX / 2);
const dist = Math.max(distX, distY) * 1.3;
```

---

## Z depth (Scale Plane Z)

- Freeform `scales3D` pre-stacks row clearance: `stackedZ = planeZ + (maxScaleRow - row) * rowClearance`
- Passes `planeZMm: stackedZ`, `rowClearanceZMm: 0` to RingRenderer
- RingRenderer uses `finalZ = s.planeZMm` directly (no re-stacking since rowClearanceZMm=0)
- `pivot.position.z += index * 0.01` adds intra-row depth separation

---

## Scale mode (S-mode) in Freeform

- Toggle button sets `activeLayerRef.current` synchronously BEFORE `setActiveLayer(next)`
- `handleClick` checks `activeLayerRef.current === "scales" || activeLayer === "scales"`
- Scale clicks store: `scaleColors.set("row,col", normalizeColor6(activeColorRef.current || activeScaleSettings.colorHex))`
- Key format: `"${row},${col}"` (comma-separated, NOT dash)

---

## exportScales — merges two sources

```typescript
const exportScales = useMemo(() => {
  const importedScales = tunerSnapshot?.scales ?? [];
  if (importedScales.length === 0 && scaleColors.size === 0) return [];
  
  // Build merged Map<"row,col", ExportScale>
  // 1. Load tunerSnapshot.scales first
  // 2. scaleColors (user clicks) override/add
  // Both use buildScale() which computes bodyY from activeScaleSettings
}, [scaleColors, tunerSnapshot, activeScaleSettings, rcToLogical]);
```

---

## Slider override system

```typescript
const [scaleSettingsOverride, setScaleSettingsOverride] = useState<Partial<FreeformScaleSettings>>({});
const lastSnapshotKeyRef = useRef<string | null>(null);

// Only clear overrides when Tuner snapshot CONTENT changes, not just object reference
useEffect(() => {
  const key = tunerSnapshot ? JSON.stringify(tunerSnapshot.scaleSettings ?? null) : null;
  if (key !== lastSnapshotKeyRef.current) {
    lastSnapshotKeyRef.current = key;
    setScaleSettingsOverride({});
  }
}, [tunerSnapshot]);

const activeScaleSettings = useMemo(
  () => ({ ...baseScaleSettings, ...scaleSettingsOverride }),
  [baseScaleSettings, scaleSettingsOverride],
);
```

NO `window.addEventListener("focus", refreshTunerSnapshot)` — this was removed because it wiped slider overrides on every window focus.

---

## handleFileJSONLoad — loads Tuner JSON file

```typescript
const geo = data.geometry ?? data; // support nested OR flat format
// set ring geometry from geo.*
if (data.scaleSettings) {
  const syntheticSnapshot = {
    geometry: geo,
    scaleSettings: data.scaleSettings,
    scales: data.scales ?? [],
    rings: data.rings ?? [],
    savedAt: data.savedAt ?? new Date().toISOString(),
  };
  localStorage.setItem(FREEFORM_TUNER_SNAPSHOT_KEY, JSON.stringify(syntheticSnapshot));
  setTunerSnapshot(syntheticSnapshot);
}
```

---

## Known issues status

| Issue | Status |
|-------|--------|
| Scales not displaying | FIXED — mode check uses ref+state dual check |
| Scale shape upside down | FIXED — bodyOffsetY recomputed from dropMm |
| Angle In/Out rotating about Z | IN PROGRESS — matrix transform (m00=tiltRad) |
| Scale Plane Z slider no effect | FIXED — camera uses fitCameraToBounds |
| Slider overrides wiped on focus | FIXED — focus listener removed |
| JSON load missing scaleSettings | FIXED — handleFileJSONLoad sets tunerSnapshot |
| Tuner snapshot scales ignored | FIXED — exportScales merges importedScales |

---

## What still needs verification

1. The `m00 = tiltRad` matrix transform for Angle In/Out — may need scaling factor adjustment. If angles look too large/small visually, try `m00 = tiltRad * k` where k is tuned empirically.
2. `m11 = Math.cos(tipLiftDeg * S_DEG)` for Tip Lift — similarly may need adjustment.
3. The camera tilt (0.22 rad) matches the Tuner's `root.rotation.x = -0.22` — but may need fine-tuning for the specific camera distance in Freeform.
4. Scale Plane Z visual effect — ensure depth changes are proportionally visible.

---

## Tuner's exact rendering (ground truth to match)

```typescript
// ChainmailWeaveTuner.tsx — makeScalePivot()
const bodyOffsetY = scale.bodyY - scale.holeY;  // DO NOT use this — snapshot bodyY is wrong
const pivot = new THREE.Group();
const rowStackZ = (maxRow - scale.row) * rowClearanceZ;
pivot.position.set(scale.holeX, -scale.holeY, planeZ + rowStackZ);
pivot.rotation.order = "YXZ";
pivot.rotation.y = scale.tiltRad;    // Angle In/Out
pivot.rotation.x = -tipLiftDeg * DEG; // Tip Lift

// Root group tilt (makes rotation.y visible as fan)
root.rotation.x = scaleBehindRings ? -0.08 : -0.22;

// Camera fit
camera.position.set(target.x, target.y + height * 0.02, target.z + dist);
```

The Tuner uses `rotation.y` on individual pivots AND `root.rotation.x = -0.22` on the scene group. In Freeform's RingRenderer, the group rotation was replaced with camera tilt because group rotation corrupts pivot local Y axes (making rotation.y appear as Z-axis rotation). The matrix approach (m00/m11) was adopted as an alternative after Euler rotations failed.

---

## File structure notes

- `FREEFORM_TUNER_SNAPSHOT_KEY = "freeform.tunerSnapshot.v1"` (localStorage key)
- `TUNER_STORAGE_KEY` = separate key for the Tuner's ring set list (NOT the Freeform snapshot)
- The Tuner "Save" button saves to TUNER_STORAGE_KEY (ring sets list), not a file download
- There is no JSON file download in the Tuner — "Load JSON..." in Freeform loads a manually exported snapshot file in the nested format above

