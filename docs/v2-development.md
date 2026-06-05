# Version Two — development notes

Isolated on branch **`v2-development`** (forked from `feature/freeform-panel-tools`).
Do **not** merge into `main` until V2 is reviewed. `main` stays on the shipped
single-size / single-shape engine.

## Goal

Let one Freeform design **mix multiple ring sizes and multiple scale shapes/sizes**,
and make same-lattice weave variants switch seamlessly — by turning *shape* and
*size* into **brush attributes**, stamped per cell exactly like `color` is today.

## Why this is the right altitude

The renderer is already per-element: `ExportScale` (FreeformChainmail2D.tsx:710)
carries `shape / widthMm / heightMm / holeIdMm / dropMm` for each scale, and
`PlacedRing` (utils/e4in1Placement.ts) is a per-cell object. The *only* reason a
design is single-size/shape today is the **authoring** path: cells store color
only and geometry is read from the global `activeScaleSettings` / `safeParams`.
So this is a storage + brush change, not a rendering rewrite.

## Foundation (done)

- **`src/v2/elementBrush.ts`** — registries (`RING_SIZES`, `SCALE_SIZES`),
  `ElementBrush`, per-cell override maps (`RingMetaMap`, `ScaleMetaMap`),
  resolvers (`resolveRingSize/Size/Shape`), brush→meta helpers
  (`ringMetaForBrush`, `scaleMetaForBrush`), and BOM bucketing
  (`bucketRingBom`, `bucketScaleBom`). Pure, React-free, typechecks standalone.
- **`PlacedRing.sizeId?`** added (utils/e4in1Placement.ts) — optional, absent =
  global size, so existing saves are untouched.

### Migration invariant

A cell with **no** meta / no `sizeId` renders from the global default — identical
to today. `scaleMetaForBrush` / `ringMetaForBrush` return `undefined` when the
brush equals the design defaults, so we only ever persist real overrides and old
designs stay byte-compatible.

## Integration points in `src/pages/FreeformChainmail2D.tsx`

Wire these in order; each is independently shippable behind the brush.

1. **Brush state.** Replace the single `activeColor` usage with an `ElementBrush`
   (color + ringSizeId + scaleSizeId + scaleShapeId). The shape picker already
   exists (`scaleShapePickerOpen`, line ~1113) — point it at `brush.scaleShapeId`.

2. **Per-cell stores.** Add state parallel to `scaleColors` (line 937):
   `scaleMeta: ScaleMetaMap` and `ringMeta: RingMetaMap` (or fold `sizeId` into
   the existing `PlacedRing` writes, which is already supported).

3. **Paint write.** Everywhere a scale color is set
   (lines ~2482, ~2857, ~5166, ~5318, ~6013) also write
   `scaleMetaForBrush(brush, defaultScaleSizeId, defaultScaleShapeId)` to
   `scaleMeta` for the same key (delete the key when it returns `undefined`).
   Ring writes set `sizeId` from `ringMetaForBrush`.

4. **Export read (render source).** `exportScales` useMemo (line ~3590): per scale,
   resolve geometry from `scaleMeta.get(key)` →
   `resolveScaleSize` / `resolveScaleShape`, falling back to `activeScaleSettings`.
   Ring build (lines ~3155 / ~3174): resolve OD from `resolveRingSize`.

5. **History.** `HistoryEntry` (line ~951) and `pushToHistory` (~958): include
   `scaleMeta` / ring `sizeId` snapshots so undo/redo preserve per-cell data.

6. **Serialization.** Save/load (load loop ~6555) writes/reads the meta maps;
   missing on load = empty map (legacy design).

7. **BOM.** Replace the color-only count (line ~3232,
   `for (const [, hex] of scaleColors) byColor...`) with `bucketScaleBom` /
   `bucketRingBom` over the resolved (size, shape, color) tuples.

8. **Paste / mirror / selection.** Clipboard items already copy per-cell color;
   extend them to copy the cell's meta so rotated/mirrored pastes keep their
   size/shape. (Touches the `pasteClipboardAt` + mirror paths from
   `feature/freeform-panel-tools`.)

## UX decision (seamless, no modal)

- **Same-lattice changes** (ring size, scale shape/size, E4-1 ↔ E6-1 density):
  on-the-fly brush toggles — geometry maps 1:1, nothing is destroyed.
- **Different-lattice weaves** (Japanese, etc.): a picker at design start + a
  "convert" action that **confirms before reshaping/clearing**, since cells can't
  survive an incompatible lattice.

## Weave roadmap (separate from the brush, but enabled by it)

Decision driver: a weave is low-hanging iff it lives on a **regular 2-D lattice**.

| Weave | Lattice | Effort | Notes |
|---|---|---|---|
| European 6-in-1 | same hex grid | low | pitch/overlap + BOM ring-count change; on-the-fly |
| Scale-maille variants | existing scale engine | low | rides on the per-element brush |
| Japanese 4-in-1 / 6-in-1 | new orthogonal lattice | medium | new placement fn; paints like a sheet |
| Byzantine / Box / Persian | 1-D chain, not a sheet | high / poor fit | different editor entirely — defer |

Start: European 6-in-1 (cheapest visible win) once the brush lands, since size
variants and 6-in-1 both depend on the per-element groundwork above.
