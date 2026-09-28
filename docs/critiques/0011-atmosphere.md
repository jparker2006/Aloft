# 0011-atmosphere

Capture run `atmo2`, seed 1, flags `notaa&nomotionblur&nobloom&nolensrain&nograde`. Contact sheet: [0011-atmosphere.jpg](0011-atmosphere.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.273 / 0.014 / 0.389 / 0.492 / 0.222 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.713) |
| `night__sea_low` | 0.038 / 0 / 0.03 / 0.092 / 0.467 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.6402) |
| `night__sea_low__flash` | 0.217 / 0 / 0.144 / 0.629 / 0.406 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.2257) |
| `dusk__sea_high` | 0.297 / 0.023 / 0.323 / 0.643 / 0.228 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | changed (0.8282) |
| `night__sea_high` | 0.028 / 0 / 0.012 / 0.076 / 0.613 | none | changed (0.7272) |
| `night__sea_high__flash` | 0.274 / 0.007 / 0.221 / 0.637 / 0.282 | none | changed (0.1752) |
| `dusk__storm_sky` | 0.317 / 0.071 / 0.312 / 0.556 / 0.155 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | changed (0.8942) |
| `night__storm_sky` | 0.051 / 0 / 0.056 / 0.1 / 0.607 | none | changed (0.5712) |
| `night__storm_sky__flash` | 0.319 / 0.059 / 0.307 / 0.653 / 0.208 | none | changed (0.1792) |
| `dusk__horizon_lightning` | 0.296 / 0.057 / 0.373 / 0.413 / 0.121 | none | changed (0.8975) |
| `night__horizon_lightning` | 0.038 / 0 / 0.034 / 0.084 / 0.651 | none | changed (0.6483) |
| `night__horizon_lightning__flash` | 0.365 / 0.075 / 0.354 / 0.72 / 0.173 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | changed (0.1202) |

**Change:** the atmosphere (step 9), plus the foam, glint and spindrift follow-ups from 0009 and 0010.
- **Fog:**
  - Analytic height fog thinned by a third.
  - Its key-light lobe now only applies to rays within about 8 degrees of the horizon, scaled by the gap: under the deck the sun lights haze only far away, under the gap.
  - The flash lobe is narrower and dimmer, and measured from the camera.
- **Rain curtains:** the volumetric pass now always runs. It marches columns of heavier rain hanging from the deck with fine vertical striations, lit by the key light through the gap and by lightning, and returns their transmittance as well as their light.
- **Particles and foam:**
  - Spindrift spawns where the foam pass reports fresh breaking.
  - Foam backlight 0.3 to 0.06, aged foam as a film, sun glint lobe narrowed.

A first run (`atmo1`, stopped) had the full-strength key lobe: the dusk sky vanished behind bright beige haze, and at night the flash turned the whole sky flat grey.

**Value structure:**
- **Dusk means:** 0.27 to 0.32 against the references' 0.24 to 0.25, still bright by the same margin as before; exposure and grade come next.
- **Night:**
  - Unflashed frames sit at 0.03 to 0.05, darker than the 0.07 reference.
  - Flash frames are 0.22 to 0.37, too bright at `horizon_lightning` (0.37 against 0.19), because the curtains and haze add flash light on top of the deck.

**Color:** the haze is warm grey at dusk and cold at night, as intended. The sea and deck stay copper and grey-mauve until the grade.

**Atmosphere read:**
- **Better:**
  - The deck now sits in air. The far sea fades into haze before the horizon, and the horizon line softens instead of cutting.
  - The gap glow is a band low on the horizon, not a wash over the sky.
- **Worse:**
  - The rain curtains barely read. Toward the sun, their glow matches the gap behind them, so they neither silhouette nor stand out, where the references' curtains are the defining feature of the dusk sky.
  - Rusty blotches on the deck overhead are the sky gradient seen through eroded holes: the sunward horizon color reaches about 30 degrees up.
  - Rain seen head-on into the wind is a radial warp-speed field of dots and short streaks.
  - Spindrift renders as large blurry smears (width up to 0.9 m).

**Better than the reference:** the atmosphere is one model shared by every surface. Fog, curtains and lightning agree on where light comes from, so the flash lights the rain around it and the dusk gap lights only the far haze.

**Worse than the reference:** no readable rain curtains, spindrift smears, and flash frames too bright with fog on.

**Regressions:** none against 0010. Foam on the near face is unchanged, and the spray is new.

**Next fix:**
- Narrow the sky's horizon band to about 12 degrees.
- Curtains: denser and less sun-lit, so they silhouette against the gap.
- Spindrift about a third the size and half the alpha.
- Foam lace stretched downwind, with wide gaps opened in aged foam.
- Rain alpha down again.
- Halve the flash light on the curtains.
