# 0002-fft-cascades

Capture run `0002`, seed 1. Contact sheet: [0002-fft-cascades.jpg](0002-fft-cascades.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.326 / 0.077 / 0.34 / 0.633 / 0.534 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.5773) |
| `night__sea_low` | 0.065 / 0.02 / 0.059 / 0.113 / 0.839 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.9103) |
| `night__sea_low__flash` | 0.065 / 0.02 / 0.059 / 0.113 / 0.839 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.9103) |
| `dusk__sea_high` | 0.34 / 0.077 / 0.364 / 0.699 / 0.513 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | changed (0.4739) |
| `night__sea_high` | 0.074 / 0.027 / 0.08 / 0.113 / 0.854 | none | changed (0.9127) |
| `night__sea_high__flash` | 0.074 / 0.027 / 0.08 / 0.113 / 0.854 | none | changed (0.9127) |
| `dusk__horizon_lightning` | 0.299 / 0.09 / 0.331 / 0.454 / 0.559 | none | changed (0.6511) |
| `night__horizon_lightning` | 0.064 / 0.02 / 0.06 / 0.11 / 0.822 | none | changed (0.9301) |
| `night__horizon_lightning__flash` | 0.064 / 0.02 / 0.06 / 0.11 / 0.822 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | changed (0.9301) |
| `dusk__storm_sky` | 0.365 / 0.116 / 0.338 / 0.666 / 0.513 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | changed (0.7304) |
| `night__storm_sky` | 0.046 / 0.012 / 0.037 / 0.104 / 0.782 | none | changed (0.8846) |
| `night__storm_sky__flash` | 0.046 / 0.012 / 0.037 / 0.104 / 0.782 | none | changed (0.8846) |

**Change:**
- Three compute FFT cascades (1024, 173 and 31 m patches, 256x256 each) displace a temporary 2 km test grid with 4 m cells.
- Basic Fresnel shading: sky reflection plus a sun glint.
- A temporary AgX display transform.
- Peak periods shortened, to a young storm sea with steepness near 0.05.

GPU tests confirm the FFT matches a direct CPU sum: 9e-5 m error at 64, and 1.5e-3 m on 3 m waves at 256.

**Value structure:**
- **Dusk:** now spans a real range (p05 0.08, p95 0.63 vs reference 0.05 / 0.60). The glitter path under the sun reads well in `sea_high`.
- **Night:** has no highlights yet (p95 0.11 vs 0.22). The foam that carries the night reference does not exist yet.

**Color:**
- **Night:** far too saturated (0.84 vs 0.44). The water scatter term floods the sea with teal, and at night that term should be close to zero.
- **Dusk:** still too saturated overall (0.53 vs 0.32), because the analytic sky is a saturated copper wash that the sea reflects everywhere.

**Foam and spray read:** none yet.

**Sky:** unchanged placeholder gradient.

**Better than the reference:** the multi-scale wave structure is physically coherent. Swell, wind sea and chop travel at their own speeds, and the glitter path in `dusk__sea_high` already has believable breakup.

**Worse than the reference:**
- From 2 m the sea still reads as moderate, not violent. Even at steepness 0.05 the waves are long relative to the eye height, and nothing breaks.
- The 4 m test grid is too coarse for the 5 to 30 m waves, so near water looks like folded fabric (`dusk__horizon_lightning`).
- The shading is a mirror with no subsurface light, so crests never glow.

**Regressions:** none; all baselines changed intentionally (new ocean).

**Next fix:**
1. The clipmap (5c), for 25 cm geometry near the camera.
2. Then shading (5d): subsurface through thin crests, absorption, a darker night water term.
3. Then foam (5e).
4. Revisit choppiness and the bookmark times, so the low shots sit in a trough facing a crest.
