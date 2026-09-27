# 0005-sea-shading

Capture run `0005`, seed 1. Contact sheet: [0005-sea-shading.jpg](0005-sea-shading.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.212 / 0 / 0.281 / 0.488 / 0.546 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.5816) |
| `night__sea_low` | 0.014 / 0 / 0.004 / 0.044 / 0.425 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.4643) |
| `night__sea_low__flash` | 0.014 / 0 / 0.004 / 0.044 / 0.425 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.4643) |
| `dusk__sea_high` | 0.318 / 0.004 / 0.363 / 0.708 / 0.57 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | changed (0.8627) |
| `night__sea_high` | 0.021 / 0 / 0.015 / 0.063 / 0.509 | none | changed (0.4631) |
| `night__sea_high__flash` | 0.021 / 0 / 0.015 / 0.063 / 0.509 | none | changed (0.4631) |
| `dusk__horizon_lightning` | 0.289 / 0.037 / 0.326 / 0.454 / 0.659 | none | changed (0.8719) |
| `night__horizon_lightning` | 0.025 / 0 / 0.023 / 0.064 / 0.673 | none | changed (0.6125) |
| `night__horizon_lightning__flash` | 0.025 / 0 / 0.023 / 0.064 / 0.673 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | changed (0.6125) |
| `dusk__storm_sky` | 0.355 / 0.049 / 0.335 / 0.664 / 0.555 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | same (0.9743) |
| `night__storm_sky` | 0.025 / 0 / 0.022 / 0.06 / 0.679 | none | changed (0.7669) |
| `night__storm_sky__flash` | 0.025 / 0 / 0.022 / 0.06 / 0.679 | none | changed (0.7669) |

**Change:** physically based sea shading:
- Fresnel sky reflection.
- GGX key-light glint, with roughness that grows with wind and distance.
- Subsurface light through thin backlit crests, using a steep crest-height curve.
- Dim body color under ambient light.
- Rain ripple normals.

**Value structure:**
- **Dusk:** keeps a strong range (p50 0.28, p95 0.49 in `sea_low`). Deep blacks now appear in wave troughs (p05 0.00 vs reference 0.045): slightly too crushed.
- **Night:** collapsed to near black (mean 0.014 vs reference 0.073). The water body honestly follows the night ambient. What should lift it is exposure (auto exposure in step 10), foam and lightning, not a fake glow.

**Color:**
- **Dusk:** saturation is down from 0.67 to 0.55. The crest of the near wave shows a thin teal-green glow.
- **Night:** saturation is now close to the reference (0.43 vs 0.44). The flat teal flood is gone.

**Foam and spray read:** none yet.

**Sky:** placeholder gradient. The copper wash still dominates the reflections and so the sea's overall color.

**Better than the reference:** the crest glow is physically placed. It appears only where the crest is thin and the sun is behind it, and it moves correctly as the wave travels.

**Worse than the reference:**
- The glow is thinner and dimmer than the reference's broad translucent green band.
- The troughs crush to pure black.
- Night is unreadable without exposure.

**Regressions:** none; changes are intended.

**Next fix:**
1. Foam (5e).
2. Then the cloud deck, which darkens the reflections and makes the green read.
3. Revisit crest glow strength once the sky is in.
