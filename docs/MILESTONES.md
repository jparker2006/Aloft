# Aloft: Milestones

The order is fixed. Each milestone ends with a capture, a critique and a short report (timings, known issues).

**Standing rules** (from `docs/SPEC.md` section 12):

- Feel changes need approval before commit.
- No em dashes.
- Every visual change is followed by capture, then compare, then critique.

## Milestone 1: Hero still scene

**Goal:** the best-looking browser ocean storm we can make, with no ship and no gameplay. It must be viewable from fixed bookmarks at both presets.

**Groundwork**

1. Project scaffold:
   - Vite, TypeScript strict, three `WebGPURenderer` with TSL.
   - Vitest, ESLint, Prettier.
   - A lint rule or script that rejects em dashes in the repo.
2. WebGPU gate: an adapter check and an unsupported screen.
3. Fixed-step clock (120 Hz simulation, render interpolation) and a URL param module.
4. Shot mode:
   - `?shot=&preset=&seed=&flash=`, with settle frames and `window.__shotReady`.
   - `src/shots.ts` with bookmarks `sea_low`, `sea_high`, `horizon_lightning`, `storm_sky`.
5. Capture harness:
   - `tools/capture` (Playwright, Chromium with WebGPU).
   - Contact sheet against `references/`.
   - Baseline diff.
   - `npm run capture`.
6. Profiler overlay (F3): GPU timestamps per pass, CPU per system, internal resolution, tier.
7. Reference images:
   - Candidates generated from `references/PROMPTS.md`.
   - The user picks finals, which are saved as `references/<preset>__<bookmark>.jpg`.

**Rendering work**

1. **Ocean:**
   - JONSWAP spectrum.
   - Three FFT cascades in compute.
   - Choppy displacement.
   - Clipmap mesh with seam morphing.
   - Normal and Jacobian outputs.
2. **Foam:** Jacobian injection, ping-pong accumulation with decay, wind-aligned streak texture (Blender-baked), `fwidth` fade.
3. **Ocean shading:** Fresnel sky reflection, glitter, subsurface through crests, absorption color, rain ripples.
4. **Sky:** half-res volumetric storm cloud deck with temporal reprojection, low scud layer, cloud-gap light for dusk.
5. **Lightning:** seeded strikes, bolt ribbons, cloud in-scatter point, flash light on the sea, flicker curves, `?flash=` freeze.
6. **Particles:** compute rain (camera-local volume) and spindrift torn from crests.
7. **Atmosphere:** height fog and rain haze with aerial perspective; a volumetric in-scatter hook ready for the beam later.
8. **Presets:** `dusk` and `night` as look dictionaries with resolve, apply and blend. Weather state uniforms drive ocean, particles, clouds and lightning.
9. **Post stack in order:**
   - MRT scene pass.
   - Clouds composite.
   - Particles.
   - Volumetrics.
   - SSR delta.
   - GTAO (indirect only).
   - TRAA.
   - Motion blur.
   - Bloom (threshold at upsample).
   - Auto exposure (flash-excluded).
   - Lens rain.
   - Tone map (AgX vs ACES chosen by capture comparison).
   - Grade, vignette, grain, dither.
10. **Performance:**
    - Quality tiers with auto selection.
    - Dynamic resolution controller.
    - `compileAsync` warmup.
    - Per-pass A/B flags.

**Free camera:** an orbit or fly camera (not gameplay) so the user can explore the scene between bookmarks.

**Acceptance**

- [ ] All four bookmarks capture at both presets, plus mid-flash night frames, with no console errors.
- [ ] Each critique in `docs/critiques/` names at least one concrete improvement over the matching reference image, and no open "worse than reference" item is left unaddressed or unexplained.
- [ ] Foam shows structure (streaks, lines, patches), not noise. Crests show subsurface glow at dusk.
- [ ] Lightning lights clouds from within and visibly lights the sea for a few frames. Exposure does not pump after a flash.
- [ ] No shimmer or tiling visible at the horizon or in foam at 1080p.
- [ ] 60 fps on the target machine at the default tier, per the overlay (user-measured). Budget table filled in with measured numbers.
- [ ] Unit tests pass: fixed-step clock, preset resolve and blend, seeded RNG determinism.

**Out of scope:** ship, character, gameplay, audio, lighthouse geometry.

## Milestone 2: Graybox feel prototype

**Goal:** answer "is moving around a violently moving ship fun?" It is ugly on purpose.

**Work**

1. **Blender pipeline bring-up** (install, runner and self-test are already done in `tools/blender/`):
   - `tools/blender/common.py`.
   - `npm run assets`.
2. **`tools/blender/graybox_ship.py`:**
   - Box hull, deck, spar boxes.
   - The **final** rigging-graph naming: shroud surfaces, yard footropes, stays, lines, holds, tops.
   - Collision proxies.
   - Exported to `public/assets/graybox_ship.glb`.
3. **GLB contract test** for the graybox ship (node names, attribute slots, bounds).
4. **CPU swell worker:** 64x64 FFT mirror of the swell cascade with height, normal and velocity queries, plus a debug overlay comparing CPU and GPU heights.
5. **Ship rigid body at 120 Hz:**
   - Buoyancy probes, damping and righting.
   - Constant scripted forward drive and a fixed heading. No helm yet: the ship just rides the sea.
6. **Sailor as a capsule, simulated in the ship frame with fictitious forces:**
   - Modes: `deck`, `climb`, `footrope`, `hang`, `swing`, `slide`, `air`, `knockdown` (placeholder).
   - All attachments are ship-local.
7. **Rope rendering:** simple instanced segments along the rigging graph. Swing lines are a solved pendulum.
8. **Camera:** horizon-stable, spring follow, jolt absorption, probe collision.
9. **Input:** keyboard and mouse bindings from the spec, gamepad mapping, input latching, jump buffer, coyote time.
10. **Tuning:** `src/game/tuning.ts` and a live debug tuning panel with export of current values.
11. **Debug views:** ship-frame vectors (fictitious forces), hold snap radii, rigging graph, state readout.
12. **Weather slider:** from act 1 to act 3 sea states, so feel can be tested across the range.
13. **Captures:** `ship_wide`, `deck_bow` and `masthead_down` bookmarks, graybox only.

**Acceptance**

- [ ] The sailor can go from deck to the fore topgallant yard and back down, using climb, footrope, swing, slide and leap, at every sea state on the slider.
- [ ] Ship motion is felt in traversal (swings are pumped or robbed by the roll, and leaps drift) without causing input-model falls.
- [ ] Deterministic: the same seed and input recording replay the same path (a recorded-input test).
- [ ] Unit tests pass: ship-frame acceleration terms against analytic cases, rope constraint, fixed-step interpolation.
- [ ] No regression in milestone 1 captures or timings.

**STOP: user playtest.** Work halts here. Deliver the build instructions, a controls sheet and the tuning panel guide. Feel changes from playtest feedback are proposed, approved, then committed. Milestone 3 starts only after sign-off.

## Milestone 3: Helm and sail trim

**Goal:** the ship becomes something you drive, and surfing swells without broaching becomes a skill.

**Work**

1. **Hydrodynamics:** lateral resistance, hull drag, rudder lift with authority lost when the stern lifts, wave yaw moment.
2. **Wheel:** inertia, rudder lag, weather helm feedback, helm camera, `helm` mode.
3. **Lashing the wheel,** with drift over time and escalating broach cues.
4. **Sail model:**
   - Set states (full, reef 1, reef 2, furled).
   - Brace and sheet trim.
   - Force from apparent wind at the center of effort, producing heel and weather helm.
5. **Surfing:** a speed burst on a swell face. Broach and capsize detection, and dismasting load integration (lose states as debug events for now).
6. **Trim interaction:** from the pin rail as a `task` mode stub. Reefing aloft uses the footrope from milestone 2.
7. **HUD:** heel and trim indicator, wind ribbon, broach warning.
8. **Tuning:** all new constants in `tuning.ts`, with the tuning panel extended.

**Acceptance**

- [ ] A player can hold a run down swells at the act 2 sea state, and a careless player broaches.
- [ ] Reefing measurably reduces heel and dismast load; over-canvassed gusts can dismast.
- [ ] A lashed wheel holds course for a tunable period, then drifts, with cues before broach risk peaks.
- [ ] Unit tests pass: sail force monotonic in area and wind, rudder authority vs stern immersion, broach detector.
- [ ] Feel changes approved before commit; user playtest of the helm before milestone 4.

## Milestone 4: The real ship and sailor

**Goal:** replace the graybox with production assets without changing feel.

**Work**

1. **`tools/blender/ship.py`:**
   - Brigantine hull (planking and wale detail through the part-ID and texture system).
   - Spars with pivots at real hinges; blocks, deadeyes, pin rails, wheel, rudder, lantern.
   - The rigging graph with **identical names** to the graybox.
   - Sail grids with pin weights; collision proxies.
2. **Materials:** a part-ID shared material; wood, tarred wood, canvas, rope and iron array textures baked by Blender scripts with declared color spaces; wet shading driven by weather.
3. **Cloth sails:**
   - Position-based dynamics in compute at a fixed substep, pinned to the yards and gaff.
   - Wind pressure from the sail model, so the visual billow matches the force model.
   - Reef states reduce the cloth area.
   - Tearing and flogging states.
4. **Rope rendering:** instanced tube segments with catenary or solved shape, distance-based thinning to a shader line, and taut or slack states from the simulation.
5. **`tools/blender/sailor.py`:** an oilskin-clad sailor, armature with `.L`/`.R` names, and the full clip list from the spec, in place.
6. **Animator:** anim struct mirror, transition table, hand and foot IK on holds and ropes, spring reaction to ship acceleration, look-at.
7. **Bow and hull spray particles** from hull-water contact.
8. **Lantern light** on deck.
9. **Audio** first pass: wind, sea, rigging, thunder.
10. **GLB contract tests** for `ship.glb` and `sailor.glb`.
11. **Captures:** all ship bookmarks at both presets, compared against `references/`.

**Acceptance**

- [ ] Swapping graybox for real ship changes no traversal numbers (same rigging-graph positions within tolerance, verified by test).
- [ ] Sails visibly respond to reefing, trim and gusts; no cloth explosions at act 3 wind.
- [ ] The character reads clearly at gameplay distance at night (lantern and lightning rim).
- [ ] 60 fps on the target machine with ship, cloth, ropes and particles (user-measured), the ocean still at protected quality.

## Milestone 5: Storm, tasks, overboard and ending

**Goal:** the full 25-minute crossing.

**Work**

1. **Act director:** four acts with weather curves, preset switches, task beats with deadlines and light randomization, and checkpoints.
2. **Tasks:** stow jib, reef 1 and 2, secure torn staysail, cut away topgallant, lash wheel. Each has consequences on a missed deadline.
3. **Green water:** wave-over-deck detection from the CPU swell query, deck water sheet effect, knockdown mode, sailor tumble and grab.
4. **Overboard:**
   - Swim mode in world space with wave physics.
   - The trailing line astern; the haul hand over hand and climb aboard.
   - Drown and restart.
5. **Lose conditions** wired to checkpoints: capsize, dismast, drown. Wear carries across acts.
6. **`tools/blender/lighthouse.py`:** headland, tower, lantern room, rocks, leading lights.
7. **Lighthouse beam:** volumetric rotating beam through fog and rain, lighting the sea.
8. **Harbor entrance set piece:** breakers on the rocks, the leading-light alignment, the win trigger, the storm-breaks cinematic.
9. **Menus:** start, pause, settings (quality, bindings, sensitivity), act select after completion.
10. **Captures:** `lighthouse_far` and `harbor_entrance` bookmarks.

**Acceptance**

- [ ] A full run from act 1 to the harbor is completable in about 25 minutes by a competent player; each lose condition is reachable and restarts its act correctly.
- [ ] Overboard recovery works at every act's sea state.
- [ ] The lighthouse beam reads as the goal from its first appearance.
- [ ] 60 fps on the target machine through the worst moments of act 3 (user-measured).
- [ ] Final capture set and critique committed.
