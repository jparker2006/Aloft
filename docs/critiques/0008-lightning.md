# 0008-lightning

Capture run `0008`, seed 1, flags `norain&nospray&nofog&notaa&nomotionblur&nobloom&nolensrain&nograde`. Contact sheet: [0008-lightning.jpg](0008-lightning.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `night__sea_low` | 0.066 / 0 / 0.092 / 0.13 / 0.393 | 0.073 / 0.004 / 0.053 / 0.224 / 0.439 | changed (0.4857) |
| `night__sea_low__flash` | 0.195 / 0 / 0.143 / 0.662 / 0.4 | 0.211 / 0.024 / 0.163 / 0.57 / 0.419 | changed (0.2231) |
| `night__sea_high` | 0.063 / 0 / 0.05 / 0.159 / 0.474 | none | changed (0.7046) |
| `night__sea_high__flash` | 0.214 / 0.003 / 0.143 / 0.662 / 0.372 | none | changed (0.2633) |
| `night__horizon_lightning` | 0.075 / 0 / 0.1 / 0.127 / 0.525 | none | changed (0.6312) |
| `night__horizon_lightning__flash` | 0.295 / 0.064 / 0.217 / 0.751 / 0.237 | 0.19 / 0.023 / 0.145 / 0.518 / 0.465 | changed (0.1921) |
| `night__storm_sky` | 0.095 / 0.003 / 0.114 / 0.134 / 0.466 | none | changed (0.525) |
| `night__storm_sky__flash` | 0.261 / 0.031 / 0.197 / 0.688 / 0.272 | none | changed (0.2261) |

**Change:** lightning (step 7), captured with auto exposure on, so night brightness is judged the way it will be seen. Changes:
- The flash inside the deck is a point source with a 450 m core and extinction through kilometres of cloud. It is diffused through the cloud between the sample and the channel (two density probes, two-stream transmittance) and evaluated only while a flash is live.
- The sea takes a narrower flash glint.
- The cheap cloud reflection carries the flash, so a reflection column runs under the bolt.
- Auto exposure now lifts a dark scene by at most 1.2 EV (it was 3 EV), so a night storm stays dark.
- Shot mode holds the flash back for the first half of the settle frames, so exposure settles on the unlit scene first, as it does in play; flash frames used to render at EV 0. Clouds restart accumulation when the flash state changes in a still frame.
- `horizon_lightning`'s strike moves from 4 km to 2.4 km, and the default mid-flash strike from 5.2 km to 3 km.
- In play, lightning is suppressed until the first-run photosensitivity notice is answered (unit tested).
- `?reduceflash` forces "Reduce flashing" for captures.

Earlier iterations in this critique: runs `light1` (mean 0.62, the whole deck white), `light3` (flash frames at EV 0), `light5` (0.41, a broad sheen over the whole sea) and `light7` (0.30).

**Value structure:**
- **Night, no flash:** the frames now sit at the references' level: `sea_low` mean 0.066 against 0.073. The deck is a faint texture over a near-black sea.
- **Mid-flash:**
  - `sea_low`: 0.195 against 0.211.
  - `horizon_lightning`: 0.295 against 0.19, still brighter than the reference because its bolt is closer and taller.
  - p95 sits at 0.66 to 0.75 against the references' 0.52 to 0.57. Our highlights are the lit cloud core and the reflection column, where the references' highlights are the bolt and foam.

**Color:** neutral cold blue-grey from the flash color (0.75, 0.82, 1.0). The references lean slightly more violet. Saturation is lower than the references (0.24 to 0.40 against 0.42 to 0.47), because grading is off.

**Lightning read:**
- **Better:**
  - The strike lights the deck from inside. The glow is brightest around the channel and falls away across the ceiling, and it reveals the pouches and rolls of the underside (`storm_sky`, `sea_high`), which the unlit night deck hides.
  - The sea shows a reflection column under the bolt and broken glints on the facing slopes.
  - "Reduce flashing" (run `light7r`) halves the frame's mean, 0.30 to 0.15, and keeps the bolt visible.
- **Worse:**
  - The bolt is a thin, hard ribbon with no glow. Bloom is off here.
  - There are no rain shafts lit around the strike (step 9).
  - In `sea_low` the lace foam in the foreground reads as a bright net at night, brighter than the reference's grey foam.

**Better than the reference:** the flash is a physically placed light. Pouches facing the strike light up and those behind stay dark, so every flash reveals the deck's structure differently. The limiter guarantees at most three full-screen flashes per second (unit tested).

**Worse than the reference:**
- The bolt lacks glow and the lit rain curtains around it.
- `horizon_lightning` is 50% brighter than its reference.
- The foreground foam net is too bright at night.

**Regressions:** none; changes are intended.

**Next fix:**
- Particles (step 8): rain streaks faded out near the lens, and spindrift spawning four times more often.
- Foam lighting: no light wrap from a grazing sun, and per-octave distance fades so far whitecaps keep texture.
