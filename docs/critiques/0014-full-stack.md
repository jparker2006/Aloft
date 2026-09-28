# 0014-full-stack

Capture run `0014`, seed 1. Contact sheet: [0014-full-stack.jpg](0014-full-stack.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.2 / 0.033 / 0.251 / 0.359 / 0.36 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | updated |
| `night__sea_low` | 0.058 / 0.009 / 0.053 / 0.116 / 0.556 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | updated |
| `night__sea_low__flash` | 0.254 / 0.015 / 0.126 / 0.799 / 0.368 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | updated |
| `dusk__sea_high` | 0.28 / 0.051 / 0.209 / 0.823 / 0.328 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | updated |
| `night__sea_high` | 0.05 / 0.008 / 0.045 / 0.1 / 0.562 | none | updated |
| `night__sea_high__flash` | 0.298 / 0.024 / 0.181 / 0.799 / 0.326 | none | updated |
| `dusk__horizon_lightning` | 0.188 / 0.046 / 0.229 / 0.284 / 0.284 | none | updated |
| `night__horizon_lightning` | 0.056 / 0.012 / 0.053 / 0.108 / 0.572 | none | updated |
| `night__horizon_lightning__flash` | 0.401 / 0.055 / 0.351 / 0.894 / 0.234 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | updated |
| `dusk__storm_sky` | 0.241 / 0.082 / 0.195 / 0.648 / 0.256 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | updated |
| `night__storm_sky` | 0.071 / 0.015 / 0.068 / 0.13 / 0.562 | none | updated |
| `night__storm_sky__flash` | 0.356 / 0.051 / 0.304 / 0.831 / 0.271 | none | updated |

**Change:** every system on, with the fixes from 0012 and 0013:
- ACES-fitted tone mapping.
- A per-pixel hash for grain, dither and jitter.
- Sun glint clamped at 8.
- Dimmer haze ambient.
- Weaker forward scatter on rain and spray.
- Dusk saturation 1.1 and subsurface 0.7.
- Night exposure 2.0 and night ambient doubled.

Baselines were promoted from this run.

**Value structure:**
- **Dusk:**
  - `storm_sky` is on the reference at 0.241 against 0.242.
  - `sea_low` is darker at 0.20 against 0.25, because its sea is too clean (below).
  - `sea_high` is 0.28 against 0.24; its gold sun path is brighter than the reference's.
- **Night:** unflashed frames are 0.056 to 0.071 against 0.073.
- **Flash:**
  - `sea_low` is 0.254 against 0.211.
  - `horizon_lightning` is 0.40 against 0.19, still the outlier: a close, tall bolt whose lit deck fills the upper frame and doubles in the sea.

**Color:**
- Dusk now has the references' split: teal-black water, a slate deck, and an orange gap with a gold sun path.
- Night is cold blue-grey with a violet-white flash.
- The emerald crest glow at dusk is right in hue, a little strong in `sea_low`.

**Full-stack read:**
- **Better:**
  - The vertical line artifact is gone.
  - Bloom gives the bolts and the sun disc a believable glow.
  - Mid-flash frames show lit mammatus over a dark sea with a reflection column, the strongest images in the set.
  - `storm_sky` at dusk reads as a real storm sunset: dark deck, torn shelf, gold path.
- **Worse:**
  - **The sea is too clean for a gale.** The references are a Beaufort 10 sea with roughly a third of the surface in whitewater, breaking crests and streaks. Ours has sparse patches, and the `sea_low` foreground is nearly black since aged foam was made patchy (0011).
  - A glint highlight near the bottom of `dusk__sea_low` still blooms into a small disc, though much smaller than before.
  - Rain curtains are still faint.
  - The clouds lack the references' sculpted cauliflower detail.

**Better than the reference:**
- One consistent world across eight views: the same deck, the same sea and the same light.
- Flashes that reveal cloud structure the references cannot show from one exposure.
- A flash rate that is limited and unit tested.

**Worse than the reference:**
- Whitewater coverage and breaking crests.
- The dusk gap's drama (saturated cloud edges, rain shafts).
- Cloud detail.

**Regressions:** foam coverage dropped against 0010 through the 0011 patch change. That was intended for the near-face net, but it went too far overall.

**Next fix:** a foam pass for a Beaufort 10 sea (0015):
- More crests break.
- Foam lives longer.
- Aged foam keeps a floor of coverage outside the breakup gaps.
- Foam in shade stays bright.
