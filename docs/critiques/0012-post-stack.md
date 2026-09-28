# 0012-post-stack

Capture run `post-agx`, seed 1, full post stack (no flags), AgX tone mapping. Contact sheet: [0012-post-stack.jpg](0012-post-stack.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.27 / 0.039 / 0.352 / 0.455 / 0.29 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.5454) |
| `night__sea_low` | 0.054 / 0 / 0.051 / 0.117 / 0.566 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.229) |
| `night__sea_low__flash` | 0.234 / 0.001 / 0.145 / 0.662 / 0.348 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.0998) |
| `dusk__storm_sky` | 0.336 / 0.164 / 0.299 / 0.65 / 0.189 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | changed (0.7907) |
| `night__storm_sky` | 0.063 / 0.001 / 0.061 / 0.126 / 0.591 | none | changed (0.3194) |
| `night__storm_sky__flash` | 0.33 / 0.061 / 0.308 / 0.693 / 0.244 | none | changed (0.1408) |

**Change:** the full post stack (step 10) turned on for the first time since the all-features probe, with the grade values measured from the references:
- **Dusk:** exposure 0.8, saturation 1.18, contrast 1.1, teal-blue split shadows and orange split highlights.
- **Night:** saturation 0.94, contrast 1.05.
- **Auto exposure:** key 0.09.

The stack: TRAA, motion blur (off for stills), bloom, auto exposure (flash-excluded), lens rain, tone map, grade, vignette, grain, dither. The 0011 follow-ups are included: narrow horizon band, silhouetted curtains, fine spray, stretched lace, patchy aged foam.

**Value structure:**
- **Dusk:** `sea_low` mean 0.27 against 0.25, but `storm_sky` is 0.34 against 0.24 with p05 at 0.16 against 0.09. The dusk frames are milky: the haze's ambient in-scatter sets a floor under everything.
- **Night:** 0.05 to 0.06 against 0.07. Flash frames are 0.23 to 0.33.

**Color:** the grade moves the sea from copper toward teal-black, and the gap reads orange. The deck is still grey-mauve rather than slate.

**Post read:**
- **Better:**
  - The sun path in `storm_sky` is a column of gold glitter on dark water, as in the references.
  - Bloom gives the bolt a glow and lifts the sun disc.
  - Spray on the `sea_low` crest reads as fine wind-torn wisps.
  - The foreground foam is patchy marbling instead of a uniform net.
- **Worse:**
  - **Full-height vertical lines cover every frame, worst at night.** TSL's `hash` takes a scalar; grain, dither and the volumetric jitter passed it `screenCoordinate.xy`, so only x was hashed and each column got one value.
  - A bright orange ball near the bottom of `dusk__sea_low` is a firefly. One wave facet catches the sun disc at a tiny roughness, the unclamped glint reaches thousands, and bloom turns it into a disc.
  - AgX leaves the dusk frames flat and milky (see 0013).

**Better than the reference:** the gold sun path, the flash glow and the spray all come from the same light and move with the sea.

**Worse than the reference:**
- The vertical line artifact (a bug, fixed below).
- The firefly.
- Milky dusk blacks.
- No lit rain curtains yet: they are there, but thin.

**Regressions:** the vertical lines were already present in the first all-features probe (`probe2`). They were hidden in every isolated capture because grain and the volumetric pass were off there.

**Next fix:**
- A per-pixel hash that flattens the pixel to one integer (`pixelHash` in the pipeline) for grain, dither and jitter.
- Sun glint clamped at 24 before exposure.
- Haze ambient in-scatter from `ambient * 9 + 0.02` to `ambient * 5 + 0.008`.
- Rain forward scatter 3.5 to 1.2.
- The tone mapper (0013).
