# 0007-clouds

Capture run `clouds7`, seed 1, flags `nolightning&norain&nospray&nofog&notaa&nomotionblur&nobloom&nolensrain&noexposure&nograde` (clouds in isolation; the rest of the post stack is off). Contact sheet: [0007-clouds.jpg](0007-clouds.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__storm_sky` | 0.297 / 0.029 / 0.279 / 0.665 / 0.172 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | changed (0.9053) |
| `night__storm_sky` | 0.033 / 0 / 0.038 / 0.052 / 0.571 | none | changed (0.8499) |
| `dusk__sea_high` | 0.263 / 0.004 / 0.262 / 0.709 / 0.3 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | changed (0.8408) |
| `night__sea_high` | 0.022 / 0 / 0.012 / 0.068 / 0.444 | none | changed (0.925) |
| `dusk__horizon_lightning` | 0.189 / 0.012 / 0.245 / 0.297 / 0.165 | none | changed (0.7648) |
| `night__horizon_lightning` | 0.025 / 0 / 0.031 / 0.049 / 0.561 | none | changed (0.9174) |

**Change:** the volumetric storm deck (step 6). Seven iterations inside this critique:
- The first pass (run `clouds1`) read as fair-weather cumulus: pale grey puffs with holes to an orange sky everywhere.
- The deck is now:
  - A near-total overcast.
  - An explicit underside: a Worley height field hangs rolls and pouches up to 480 m below the mean base.
  - Diffuse light from above through a two-stream transmittance, so low pouches are darker than the recesses between them.
  - Far-field sun occlusion probed from the coverage field, so the low sun only lights cloud near the gap.
  - Warm light under the deck toward the sun.
  - Self-shadowed scud.
- The sky horizon now glows only on the sunward side (`skyHorizonAway`).

**Value structure:**
- **`dusk__storm_sky`:** mean 0.30 against the reference's 0.24. The ceiling is now in the right range: dark slate overhead, heavy rolls through the middle of the frame, and a bright band between the shelf and the sea. p05 is lower than the reference (0.03 vs 0.09) because the sea under a dark deck has no fill yet.
- **Night:** still near black (mean 0.03). Auto exposure is off here, and lightning, which is what lights a night deck, is disabled.

**Color:**
- The deck is a neutral warm slate. Earlier passes were mauve, because key light leaked through 500 m of cloud everywhere; the far-field occlusion fixed that.
- The gap is a pale salmon where the reference burns orange and gold. With grading and bloom off this is expected, but the sky radiance in the gap is also too flat, with no gradient from the sun outward.

**Clouds read:**
- **Better:**
  - The shelf edge over the gap is the strongest element: torn, eroded, lit warm from below near the sun, with dark scud fragments against the bright band.
  - Rolls converge toward the horizon in perspective and sell the scale of the deck.
- **Worse:**
  - The reference's ceiling is sculpted, with crisp cauliflower billows and hard light and dark separation. Ours is a soft, low-contrast overcast; detail erosion is visible but blurred by the half-resolution march and the 12-frame accumulation.
  - No rain shafts hanging from the deck (that is step 9's volumetric pass).

**Better than the reference:** the deck is a single consistent volume that moves with the wind and is seen the same way from every bookmark. The shelf and the gap sit on the sun bearing wherever the camera turns.

**Worse than the reference:**
- The billows lack crispness and contrast.
- The gap lacks saturated gold and backlit cloud fragments.
- There are no rain curtains.

**Regressions:** none. The sea now reflects a dark sky instead of copper, which is the intended change in `dusk__sea_high`. The flat white foam patches on `dusk__sea_high` predate this change (0006) and are logged for the post stack pass.

**Next fix:** lightning (step 7). The night deck needs its light source before exposure and grading can be judged.
