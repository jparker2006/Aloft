# 0013-tonemap

Capture runs `post-agx` (default at the time) and `post-aces` (`?tonemap=aces`), seed 1, full post stack. Comparison sheet: [0013-tonemap.jpg](0013-tonemap.jpg). Each row is AgX, ACES-fitted, reference: `dusk__storm_sky`, `dusk__sea_low`, `night__sea_low__flash`.

ACES run:

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.234 / 0.028 / 0.299 / 0.431 / 0.351 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.5251) |
| `night__sea_low` | 0.042 / 0 / 0.043 / 0.097 / 0.542 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.2771) |
| `night__sea_low__flash` | 0.218 / 0.001 / 0.092 / 0.748 / 0.381 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.1148) |
| `dusk__storm_sky` | 0.285 / 0.112 / 0.227 / 0.729 / 0.248 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | changed (0.7128) |
| `night__storm_sky` | 0.045 / 0 / 0.046 / 0.101 / 0.565 | none | changed (0.3807) |
| `night__storm_sky__flash` | 0.3 / 0.024 / 0.234 / 0.787 / 0.312 | none | changed (0.1604) |

**Change:** none to the scene. Only the tone mapper differs between the runs.

**Comparison against the references:**

| Shot | Metric | AgX | ACES | Reference |
|---|---|---|---|---|
| `dusk__storm_sky` | mean | 0.336 | 0.285 | 0.242 |
| | p05 | 0.164 | 0.112 | 0.086 |
| | saturation | 0.19 | 0.25 | 0.32 |
| `dusk__sea_low` | mean | 0.270 | 0.234 | 0.251 |
| | saturation | 0.29 | 0.35 | 0.32 |
| `night__sea_low__flash` | mean | 0.234 | 0.218 | 0.211 |
| `night__sea_low` | mean | 0.054 | 0.042 | 0.073 |

**Read:**
- **ACES is closer on every dusk metric:**
  - Blacks are deeper; AgX's p05 is almost twice the reference's.
  - The gap and sun path are warmer and more saturated. AgX's hue-preserving desaturation reads the sunset as salmon; ACES gives it the orange of the references.
  - The deck sits darker against the gap, so the shelf edge reads.
- **At night:** ACES flash frames match the reference mean (0.218 against 0.211). Its unflashed night is darker than AgX and the reference (0.042 against 0.073), so night exposure goes from 1.6 to 2.0.
- **Where ACES is worse:** it skews very bright orange toward yellow, visible in the sun disc and the hottest glints. Bloom hides most of it, and the references show the same shift.

**Decision:** ACES-fitted is the default. AgX stays available as `?tonemap=agx`. Recorded in SPEC section 19.

**Better than the reference:** tone mapping is applied to physically scaled radiance with auto exposure, so the same curve serves the dusk gap at thousands of times the night deck's brightness.

**Worse than the reference:** the references are graded photographs with local contrast (clarity) that a global curve cannot reproduce. A local contrast pass is noted for milestone 4's post work.

**Regressions:** none.

**Next fix:** the final full capture with every fix from 0012 and this decision.
