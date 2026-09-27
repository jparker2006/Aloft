# 0001-capture-loop

Capture run `0001`, seed 1. Contact sheet: [0001-capture-loop.jpg](0001-capture-loop.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.392 / 0.281 / 0.412 / 0.457 / 0.667 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | same (1) |
| `night__sea_low` | 0.062 / 0.038 / 0.066 / 0.077 / 0.44 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | same (1) |
| `night__sea_low__flash` | 0.062 / 0.038 / 0.066 / 0.077 / 0.44 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | same (1) |
| `dusk__sea_high` | 0.414 / 0.31 / 0.457 / 0.457 / 0.679 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | same (1) |
| `night__sea_high` | 0.067 / 0.042 / 0.077 / 0.077 / 0.429 | none | same (1) |
| `night__sea_high__flash` | 0.067 / 0.042 / 0.077 / 0.077 / 0.429 | none | same (1) |
| `dusk__horizon_lightning` | 0.389 / 0.276 / 0.403 / 0.457 / 0.665 | none | same (1) |
| `night__horizon_lightning` | 0.062 / 0.035 / 0.065 / 0.077 / 0.442 | none | same (1) |
| `night__horizon_lightning__flash` | 0.062 / 0.035 / 0.065 / 0.077 / 0.442 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | same (1) |
| `dusk__storm_sky` | 0.35 / 0.238 / 0.337 / 0.457 / 0.636 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | same (1) |
| `night__storm_sky` | 0.053 / 0.031 / 0.05 / 0.077 / 0.461 | none | same (1) |
| `night__storm_sky__flash` | 0.053 / 0.031 / 0.05 / 0.077 / 0.461 | none | same (1) |

**Purpose:** proves the loop works end to end before any real visuals exist:
- shot mode, 12 captures (4 bookmarks at dusk and night, plus mid-flash night frames), about 3 s each on the SwiftShader adapter
- reference pairing
- value statistics
- SSIM baselines, which a second run matched at 1.0
- this contact sheet

The scene is a placeholder two-color gradient sky with no sea.

**Value structure:**
- Dusk is a flat mid-value field (p05 0.28, p95 0.46). The reference has a real black-to-highlight range (p05 0.05, p95 0.60). The final image needs deep darks in wave troughs and bright crest and foam highlights, not a mid-grey average.
- Night already matches the reference mean (0.06 vs 0.07), but it has no highlights at all (p95 0.08 vs 0.22). In the reference the foam carries the night image.

**Color:** the dusk gradient is far too saturated (0.67 vs 0.32). The reference keeps saturation for the sun and gap only, and the sea stays green-grey. The copper should be a narrow band, not the whole sky.

**Foam and spray read:** none yet (no ocean).

**Sky:** a gradient only. The references rely on a dark, textured cloud deck over a thin bright gap.

**Better than the reference:** nothing yet; this is infrastructure.

**Worse than the reference:** everything that matters: no sea, no clouds, no light.

**Regressions:** none (first baseline).

**Next fix:** presets and weather as shared uniforms (step 4), then the FFT ocean (step 5).
