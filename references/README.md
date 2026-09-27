# References

These are the final reference images, chosen by the user from `candidates/`, which holds the 24 generated variants, their contact sheet and `manifest.json`. They were generated from the prompts in `PROMPTS.md`.

- **What they are for:** mood, value structure and color targets. They are not pixel targets. The 3D build must beat them.
- **Ignore these details:** the ships carry full sail in a storm, the lighthouse shots have modern steel railings, and the harbor shows red and green channel markers instead of aligned leading lights.

## Naming

`<preset>__<bookmark>[__flash].jpg`

- **`preset`** is `dusk` or `night`.
- **`bookmark`** matches a camera bookmark in `src/shots.ts`.
- **`__flash`** means the reference is lit by lightning. It is compared against the mid-flash capture of that bookmark; files without it are compared against the between-flash capture.

## Finals

| File | Source candidate | Milestone |
|---|---|---|
| `dusk__sea_low.jpg` | `dusk__sea_low__v1` | 1 |
| `night__sea_low.jpg` | `night__sea_low_dark__v1` | 1 |
| `night__sea_low__flash.jpg` | `night__sea_low_flash__v2` | 1 |
| `dusk__sea_high.jpg` | `dusk__sea_high__v1` | 1 |
| `night__horizon_lightning__flash.jpg` | `night__horizon_lightning__v1` | 1 |
| `dusk__storm_sky.jpg` | `dusk__storm_sky__v1` | 1 |
| `dusk__ship_wide.jpg` | `dusk__ship_wide__v2` | 2 and 4 |
| `night__deck_bow.jpg` | `night__deck_bow__v1` | 2 and 4 |
| `dusk__masthead_down.jpg` | `dusk__masthead_down__v1` | 2 and 4 |
| `night__yard_reefing__flash.jpg` | `night__yard_reefing__v1` | 4 |
| `night__lighthouse_far.jpg` | `night__lighthouse_far__v1` | 5 |
| `night__harbor_entrance.jpg` | `night__harbor_entrance__v2` | 5 |
