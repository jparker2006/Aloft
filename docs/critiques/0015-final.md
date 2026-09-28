# 0015-final

Capture run `0015`, seed 1. Contact sheet: [0015-final.jpg](0015-final.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.223 / 0.036 / 0.265 / 0.493 / 0.313 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | updated |
| `night__sea_low` | 0.078 / 0.012 / 0.062 / 0.256 / 0.536 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | updated |
| `night__sea_low__flash` | 0.276 / 0.019 / 0.171 / 0.796 / 0.345 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | updated |
| `dusk__sea_high` | 0.273 / 0.051 / 0.202 / 0.797 / 0.326 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | updated |
| `night__sea_high` | 0.057 / 0.008 / 0.047 / 0.116 / 0.556 | none | updated |
| `night__sea_high__flash` | 0.304 / 0.024 / 0.196 / 0.795 / 0.32 | none | updated |
| `dusk__horizon_lightning` | 0.189 / 0.046 / 0.226 / 0.281 / 0.282 | none | updated |
| `night__horizon_lightning` | 0.059 / 0.012 / 0.054 / 0.112 / 0.569 | none | updated |
| `night__horizon_lightning__flash` | 0.401 / 0.056 / 0.355 / 0.893 / 0.233 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | updated |
| `dusk__storm_sky` | 0.239 / 0.084 / 0.192 / 0.631 / 0.254 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | updated |
| `night__storm_sky` | 0.074 / 0.016 / 0.07 / 0.132 / 0.559 | none | updated |
| `night__storm_sky__flash` | 0.355 / 0.053 / 0.308 / 0.827 / 0.271 | none | updated |

**Change:** foam for a Beaufort 10 sea, the last visual change of milestone 1.
- Injection threshold 0.64 + 0.3t (0.83 at a gale).
- Foam half-life 3 + 4.5t s (5.9 s at a gale).
- Aged foam keeps a coverage floor outside the breakup gaps.
- Dense whitewater is shaded by the lace field instead of rendering as a flat sheet.
- Foam in shade is lit by 3.5 times the ambient (was 2.4).
- Bloom threshold raised above the clamped glint.

An intermediate run (`foam2`) overshot: threshold 0.89 and half-life 6.9 s turned `sea_low`'s foreground into a white sheet like snow with holes.

Baselines were promoted from this run. "Reduce flashing" was captured separately (`0015-reduceflash`): [0015-reduceflash.jpg](0015-reduceflash.jpg), normal on the left and reduced on the right. The same strike drops from mean 0.401 to 0.168.

**Value structure against the references:**

| Shot | Ours | Reference |
|---|---|---|
| `dusk__storm_sky` | 0.239, p05 0.084 | 0.242, p05 0.086 |
| `dusk__sea_low` | 0.223 | 0.251 |
| `dusk__sea_high` | 0.273 | 0.237 |
| `night__sea_low` | 0.078 | 0.073 |
| `night__sea_low__flash` | 0.276 | 0.211 |
| `night__horizon_lightning__flash` | 0.401 | 0.190 |

- `dusk__storm_sky` is on the reference in both mean and p05.
- `dusk__sea_high` is brighter than its reference because of its gold sun path.
- `night__horizon_lightning__flash` remains the outlier; see 0014.

**Color:**
- Dusk: teal-black water, a slate deck, an orange gap, a gold path and emerald crest glow.
- Night: cold blue-grey with a violet-white flash.
- Saturation sits a little under the references at dusk (0.25 to 0.33 against 0.32 to 0.35) and above them at night. The night references are more neutral.

**Foam read:**
- **Better:**
  - `sea_low` has a whitewater line along the crest and lace marbling on the face, the references' read.
  - `sea_high` carries patches with lace edges across the field.
  - At night the foam shows as grey lace under the ambient and flares white in the flash.
- **Worse:**
  - Whitewater is still sparser than the references' Beaufort 10 sea at `sea_high`.
  - There are no plunging crests or spray plumes, which an FFT sea cannot make.
  - The night foreground lace is a little bright.

**Better than the reference:** every whitecap sits where the wave field breaks and ages downwind, consistent across all eight views and both presets.

**Worse than the reference:**
- Breaking crests and spray volume, beyond the FFT technique; milestone 4 or 5 would need crest particles or breaking-wave geometry.
- Cloud detail and the gap's saturated edges.
- `horizon_lightning`'s flash brightness.

**Regressions:** none; the changes are intended. SSIM of each frame against run 0014, computed after the run:
- 0.95 to 0.98 where little foam is in view (`storm_sky`, `horizon_lightning`, `sea_high`).
- 0.81 to 0.83 at `sea_low`, whose foreground is mostly foam.

**Next fix:** milestone 1 stops here. The open items are listed in `docs/reports/M1.md` for the user's review on the target machine.
