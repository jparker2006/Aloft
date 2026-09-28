# 0010-particles

Capture run `0010`, seed 1, flags `nofog&notaa&nomotionblur&nobloom&nolensrain&nograde`. Contact sheet: [0010-particles.jpg](0010-particles.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.287 / 0.013 / 0.395 / 0.557 / 0.245 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.6285) |
| `night__sea_low` | 0.07 / 0 / 0.1 / 0.136 / 0.387 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.4536) |
| `night__sea_low__flash` | 0.198 / 0 / 0.147 / 0.662 / 0.396 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.2082) |
| `dusk__sea_high` | 0.33 / 0.013 / 0.344 / 0.776 / 0.253 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | changed (0.8243) |
| `night__sea_high` | 0.066 / 0 / 0.052 / 0.16 / 0.484 | none | changed (0.6883) |
| `night__sea_high__flash` | 0.221 / 0.003 / 0.147 / 0.664 / 0.351 | none | changed (0.1951) |

**Change:** particles (step 8).
- **Rain:**
  - Drops fade in from 2.5 to 6 m instead of 0.6 to 2.5 m, so no streak smears across the lens (lens rain covers that range).
  - Streak alpha halved.
  - Particles are lit by the key light only through forward scatter toward the gap (base 0.04, was 0.25), and by a weaker flash.
- **Spindrift:** four spawn attempts per dead particle per step instead of one.

Foam is as in 0009, with rain and spindrift on and fog and post still off.

**Value structure:** unchanged from 0009 and 0008 within 0.01 in every shot's mean. Rain adds no measurable brightness, which is right for clear drops.

**Color:** unchanged. Rain takes the scene's light.

**Particles read:**
- **Better:**
  - The rain is readable without being noise. In `dusk__sea_high` it is a field of fine slanted streaks driven downwind, and at night it is barely there until the flash.
  - The hard diagonal bars across the lens in the first all-features probe are gone.
- **Worse:**
  - Over the brightly glinting sea in `dusk__sea_high`, streaks still read as scratches on the water.
  - In `dusk__sea_low` the camera looks into the wind, so drops come straight at it and render as short dots, like dust against the deck. Motion blur (off here) is what turns them into radial streaks in play.
  - **Spindrift is not visible in any shot.** Its spawn test uses the Jacobian of the two coarse cascades (1 km and 173 m) below 0.55, which almost never happens: breaking lives mostly in the fine cascade.

**Better than the reference:** the rain is a simulated volume that slants with the weather's wind and drifts past the camera. The references' rain is a static overlay.

**Worse than the reference:**
- No spray torn off the crests, which is the reference's brightest and most dramatic element at dusk (`sea_low`: the backlit plume over the crest).
- Rain over glinting water reads as scratches.

**Regressions:** none.

**Next fix:**
- Spindrift spawns where the foam pass reports fresh injection (every cascade), or where the coarse Jacobian drops below 0.6.
- Rain alpha down again (0.16 to 0.09) and ambient gain 5 to 3.
- The atmosphere (step 9) will put rain haze between the camera and the far sea, which also softens the streaks against it.
