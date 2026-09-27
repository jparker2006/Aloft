# 0004-composition

Capture run `0004`, seed 1. Contact sheet: [0004-composition.jpg](0004-composition.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.235 / 0.073 / 0.213 / 0.48 / 0.665 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.6469) |
| `night__sea_low` | 0.071 / 0.019 / 0.086 / 0.113 / 0.879 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.9611) |
| `night__sea_low__flash` | 0.071 / 0.019 / 0.086 / 0.113 / 0.879 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.9611) |
| `dusk__sea_high` | 0.328 / 0.077 / 0.356 / 0.687 / 0.508 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | changed (0.5073) |
| `night__sea_high` | 0.076 / 0.027 / 0.083 / 0.113 / 0.86 | none | changed (0.9327) |
| `night__sea_high__flash` | 0.076 / 0.027 / 0.083 / 0.113 / 0.86 | none | changed (0.9327) |
| `dusk__horizon_lightning` | 0.306 / 0.12 / 0.328 / 0.454 / 0.563 | none | changed (0.6463) |
| `night__horizon_lightning` | 0.063 / 0.02 / 0.063 / 0.107 / 0.825 | none | changed (0.9688) |
| `night__horizon_lightning__flash` | 0.063 / 0.02 / 0.063 / 0.107 / 0.825 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | changed (0.9688) |
| `dusk__storm_sky` | 0.363 / 0.116 / 0.335 / 0.662 / 0.512 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | changed (0.7497) |
| `night__storm_sky` | 0.047 / 0.012 / 0.037 / 0.104 / 0.786 | none | changed (0.9573) |
| `night__storm_sky__flash` | 0.047 / 0.012 / 0.037 / 0.104 / 0.786 | none | changed (0.9573) |

**Change:**
- The wind now blows from the sunset bearing, so waves approach the low cameras with the sun behind their crests.
- `sea_low` sits 1 m above mean sea level, at t = 16.5 s. That time was chosen with the CPU reference sum: a 2.4 m trough under the camera, with a 6.4 m crest 40 m ahead.
- Every other shot changed only because the waves now run the other way.

**Value structure:** `dusk__sea_low` now matches the reference's middle values (mean 0.24 vs 0.25, p50 0.21 vs 0.22). A dark wave face fills the lower two thirds of the frame and hides the sun, which is the reference's composition. It still lacks the reference's bright crest and spray highlights (p95 0.48 vs 0.60).

**Color:** still too saturated (0.67 vs 0.32). The face is a dark copper mirror of the sky; in the reference it is green-black water with a glowing green crest. Subsurface light and a less saturated sky deck fix this.

**Foam and spray read:** none yet. The crest line is where the reference is brightest: spray backlit by the sun.

**Sky:** placeholder gradient.

**Better than the reference:** the crest is a real, moving wave shape with smaller waves riding up its face. The reference's crest is a single painted moment.

**Worse than the reference:** no crest glow, no whitecap, no spray. The wave reads as a heavy dark hill rather than a breaking wall.

**Regressions:** none intended. Every non-sea_low shot changed its wave arrangement because the wind direction flipped.

**Next fix:** subsurface, body and glint shading (5d), then foam (5e).
