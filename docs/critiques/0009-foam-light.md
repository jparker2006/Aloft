# 0009-foam-light

Capture run `0009`, seed 1, flags `norain&nospray&nofog&notaa&nomotionblur&nobloom&nolensrain&nograde`. Contact sheet: [0009-foam-light.jpg](0009-foam-light.jpg)

| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |
|---|---|---|---|
| `dusk__sea_low` | 0.286 / 0.013 / 0.394 / 0.555 / 0.245 | 0.251 / 0.045 / 0.219 / 0.6 / 0.32 | changed (0.657) |
| `dusk__sea_high` | 0.328 / 0.011 / 0.351 / 0.781 / 0.252 | 0.237 / 0.061 / 0.213 / 0.502 / 0.345 | changed (0.9037) |
| `dusk__storm_sky` | 0.357 / 0.057 / 0.346 / 0.718 / 0.149 | 0.242 / 0.086 / 0.198 / 0.529 / 0.317 | changed (0.9356) |

**Change:** foam lighting and far-field texture.
- The key light no longer wraps: `saturate(n.L)` replaces `n.L * 0.6 + 0.4`, so a sun 2.5 degrees up only lights faces turned toward it.
- Each foam octave fades to its own measured mean at its own distance: lace at 2.4 m, broad lace at 7.3 m, bubbles at 0.9 m, breakup never. Distant whitecaps keep the broad lace instead of collapsing to a flat threshold.

**Value structure:**
- **Means:** 0.29, 0.33 and 0.36 against the references' 0.25, 0.24 and 0.24. The deck is still the brightest large area, and the sea is darker than the references' sea.
- **`sea_high`:** p95 0.78 comes from the whitecaps, which are still near white.

**Color:**
- The whole sea is copper-brown. It mirrors a warm-grey deck (rgb about 98, 89, 87), where the references' deck is a cool slate and their sea a dark teal.
- The teal subsurface on the crests is right, but it sits in a brown field.

**Foam read:**
- **Better:** whitecaps at 100 m and beyond are no longer uniform discs; broad lace survives at their edges (`sea_high`, right side).
- **Worse:**
  - Seen toward the sun, the foam is still bright salmon-white. The backlight translucency term (key light times 0.3 when looking into the sun) dominates, so removing the wrap barely changed these shots, which all look toward the sun.
  - On the near face of `sea_low`, the aged lace is a hard black and white net, and the wind streaks read as straight scratches.

**Better than the reference:** the foam is placed by the wave field: patches sit on crests and trail downwind, and the near face carries an aged net. The references' foam is painted per image.

**Worse than the reference:**
- The foam is too bright and too uniform when backlit.
- The near-face net is too contrasty.
- The sea is brown where it should be teal-black.

**Regressions:** none.

**Next fix:**
- Cut the foam backlight to thin edges only, soften the aged net, and weaken the straight streaks.
- The sea and deck colors belong to the grade and the deck's ambient; see step 10.
