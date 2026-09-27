# 0003-clipmap

Capture run `0003`, seed 1. Contact sheet: [0003-clipmap.jpg](0003-clipmap.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.306 / 0.077 / 0.327 / 0.613 / 0.541 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.646) |
| `night__sea_low` | 0.068 / 0.02 / 0.064 / 0.113 / 0.851 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.9427) |
| `night__sea_low__flash` | 0.068 / 0.02 / 0.064 / 0.113 / 0.851 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.9427) |
| `dusk__sea_high` | 0.332 / 0.076 / 0.36 / 0.689 / 0.52 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | changed (0.5657) |
| `night__sea_high` | 0.075 / 0.027 / 0.082 / 0.113 / 0.858 | none | changed (0.9217) |
| `night__sea_high__flash` | 0.075 / 0.027 / 0.082 / 0.113 / 0.858 | none | changed (0.9217) |
| `dusk__horizon_lightning` | 0.291 / 0.084 / 0.328 / 0.454 / 0.565 | none | changed (0.7023) |
| `night__horizon_lightning` | 0.065 / 0.02 / 0.063 / 0.11 / 0.827 | none | changed (0.9657) |
| `night__horizon_lightning__flash` | 0.065 / 0.02 / 0.063 / 0.11 / 0.827 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | changed (0.9657) |
| `dusk__storm_sky` | 0.359 / 0.109 / 0.334 / 0.66 / 0.513 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | changed (0.7646) |
| `night__storm_sky` | 0.047 / 0.012 / 0.037 / 0.107 / 0.786 | none | changed (0.9519) |
| `night__storm_sky__flash` | 0.047 / 0.012 / 0.037 / 0.107 / 0.786 | none | changed (0.9519) |

**Change:** the 2 km test grid is replaced by the snapped geometry clipmap: 8 levels from 25 cm to 32 m cells, plus a skirt to the horizon. Shots now freeze simulation time while settling.

**Value structure:** close to 0002. Dusk keeps a real range (p05 0.08, p95 0.61 vs reference 0.05 / 0.60). Night still has no highlights (p95 0.11 vs 0.22).

**Color:** unchanged problems:
- The night sea is a flat teal (saturation 0.85 vs 0.44).
- The dusk scene is a saturated copper wash (0.54 vs 0.32).

**Foam and spray read:** none yet.

**Sky:** placeholder gradient.

**Better than the reference:** near water now has real small-scale relief, riding on larger swells with no seams between levels. The level boundaries are invisible in every shot, including the 25 m `sea_high`.

**Worse than the reference:**
- **Composition.** The camera looks downwind, so it sees the backs of waves running away toward the sun. In `dusk__sea_low` the wave faces the camera and the sun is behind the crest, which is what makes the crest glow. The low shots need to look upwind, into approaching crests.
- **Shading.** It is still a plain mirror: no subsurface light, no foam.
- **Chop.** `dusk__horizon_lightning` reads as wrinkled fabric: the chop is uniform and has no whitecaps to break it up.

**Regressions:** none; all changes are intended.

**Next fix:**
1. Composition: flip the wind so the waves approach the low cameras from the sun side, and pick shot times with a crest near the camera.
2. Subsurface and body shading (5d).
3. Foam (5e).
