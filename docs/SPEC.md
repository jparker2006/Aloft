# Aloft: Game Specification

Status: v1, written from the design interview. Anything marked **Tunable** is a starting value to be settled in playtests. Anything marked **Assumption** was not covered in the interview; flag it if it is wrong.

## 1. Pitch

A lone sailor must bring a brigantine through a violent night storm to a lighthouse. The fun is momentum on the rigging:

- Climb ratlines, swing on lines, slide down stays and leap between yards, while the deck pitches and rolls beneath.
- Take the wheel to surf the swells without broaching.

The storm escalates through four scripted acts and forces jobs aloft: reef before the gusts, cut away torn canvas, survive green water, and claw back aboard if you are washed over the side. The run ends by threading a harbor entrance under the lighthouse beam.

Visual target: the best-looking real-time ocean storm possible in a browser.

## 2. Platform and targets

| Item | Decision |
|---|---|
| Target machine | Apple Silicon laptop, M2 Pro or M3 Pro class |
| Frame rate | 60 fps sustained in gameplay on the target machine at the default tier |
| Browsers | Chrome (current) and Safari 26+ on macOS |
| Graphics API | **WebGPU only.** If `navigator.gpu` or an adapter is missing, show a clear unsupported screen. No WebGL fallback |
| Primary input | Keyboard and mouse. Gamepad supported with the same actions |
| Session length | About 25 minutes for a full run, with a checkpoint per act |

**Stack**

- Three.js `WebGPURenderer` with TSL for all materials and post.
- Compute shaders for the ocean, particles, cloth and rope.
- Vite and TypeScript (strict).
- Vitest for unit tests and Playwright for captures.

**Frame budget on the target machine** (16.6 ms total, measured with WebGPU timestamp queries):

| Area | Budget | Notes |
|---|---|---|
| Ocean compute (FFT, foam) | 1.5 ms | Protected |
| Ocean shading | 3.0 ms | Protected |
| Sky, clouds, lightning | 2.5 ms | Degrades first |
| Particles (rain, spray, spindrift) | 2.0 ms | Degrades second |
| Ship, sails, rigging, character | 2.5 ms | From milestone 4 |
| Post stack | 3.0 ms | |
| Headroom | 2.1 ms | |

**Resolution policy**

- The internal render resolution is based on CSS pixels (device pixel ratio 1), not Retina pixels.
- Dynamic resolution scales the internal size between 65% and 100% from GPU frame time, with hysteresis. TAA resolves to output size.
- **Visual priority when over budget:** the ocean surface and foam are protected. Clouds, particles, fog and beam lose quality first, in that order.

## 3. Visual pillars

Priority order when budget forces a choice:

1. **Ocean surface and foam (protected).**
   - Cascaded FFT swell and chop, sharp crests from choppy displacement.
   - Foam from the Jacobian that persists and streaks along the wind.
   - Subsurface glow through thin crests, wet specular, and lightning reflected in wave faces.
2. **Spray, spindrift and rain.**
   - Compute particles: wind tearing spindrift off crests, bow spray on impacts, driving rain.
   - Later, water sheeting across the deck.
3. **Storm sky and lightning.**
   - A low volumetric cloud deck with scud racing beneath it.
   - Lightning lights the clouds from inside, with visible bolts, and flashes light the whole sea for a few frames.
4. **Lighthouse beam and fog.**
   - Height fog and rain haze with aerial perspective.
   - A volumetric rotating beam through rain as the emotional goal.

Reference images in `references/` define mood, value structure and color targets, not pixel matches. The 3D result must beat them.

## 4. Lighting presets and weather

**Presets and weather are two separate layers:**

- A **lighting preset** defines the look: sun or moon, sky, exposure, grading.
- The **weather state** defines the storm: wind, sea state, rain, lightning rate, cloud base, visibility.
- The act script drives weather. The act picks the preset.

**Presets** (the only two in scope):

| Preset | Used in | Look |
|---|---|---|
| `dusk` | Act 1 | Low copper sun bleeding through a gap under a slate cloud deck, backlit spray, green-grey sea |
| `night` | Acts 2 to 4 and the ending | Near black between flashes. Lightning reveals the sea for a few frames. Local light comes only from the ship's lantern and, later, the lighthouse |

**Preset data model** (pattern from the reference study, section 4):

- Each preset is a flat dictionary of numeric look keys: key light direction, color and gain; ambient and IBL gains; exposure; fog density and tint; cloud coverage, base and density; grading (lift, gamma, gain, saturation, contrast, split tone); bloom; lantern gain.
- `resolvePreset()` merges defaults and preset overrides. `applyPreset()` fans the result out to shared TSL `uniform()` nodes.
- Switching blends every key over 2.5 s. Captures pin the preset with no blend.

**Weather state keys**

- Wind speed (m/s) and direction.
- Significant wave height (Hs, m), dominant period, swell direction and spread.
- Choppiness.
- Rain rate.
- Lightning rate (strikes per minute) and lightning distance range.
- Cloud base (m).
- Visibility (m).

**Lightning** is a transient event, not a preset:

- Each strike is seeded and has a position, a bolt shape and a flicker curve (3 to 5 return strokes over 0.2 to 0.6 s).
- It drives four things: a cloud in-scatter point source in the cloud march, an additive sky and ambient term, a directional flash light for specular on the sea, and an emissive bolt ribbon.
- No PMREM re-bake per flash.
- Auto exposure ignores flashes; flashes clip into bloom on purpose.
- URL control: `?flash=<seconds>` freezes a strike at a given phase for captures.

## 5. Rendering architecture

**Renderer**

- `WebGPURenderer` with reversed depth if supported, otherwise a near plane tuned for a 20 km view.
- HDR half-float targets.
- Tone mapping and grading run in our final pass (renderer tone mapping off).
- `renderer.compileAsync(scene, camera)` warms every pipeline variant before the first frame, behind the loading screen.

**Frame graph (per frame)**

1. **Simulation compute:**
   - Ocean spectrum update (on weather change only) and FFT per cascade.
   - Foam accumulate and decay.
   - Particle simulate and emit.
   - Cloth and rope solve (milestone 4).
   - Lightning state.
2. **Scene pass with MRT:**
   - Outputs: HDR color, view normal plus roughness, motion vectors, depth.
   - Ocean, ship, rigging, character, and opaque particles such as spray droplets if they are opaque.
3. **Sky and clouds:** half-res raymarch with temporal reprojection. The cloud deck is lit by the sun or moon and by lightning points. It composites behind scene depth.
4. **Transparent particles:** rain streaks and fine spray, soft-particle depth fade. Rendered at half res with a depth-aware upsample when over budget.
5. **Volumetrics:** height fog and rain haze with aerial perspective, and in-scatter from lightning and, later, the lighthouse beam and lantern. Froxel grid or half-res raymarch, whichever profiles better.
6. **Reflections:**
   - The ocean reflects the sky via a small sky cube, refreshed when the preset or weather changes.
   - Half-res SSR for the ship, lantern, lighthouse and lightning, stored as a delta over the sky reflection so misses fall back cleanly.
7. **AO:** half-res GTAO, applied to indirect light only.
8. **TAA:** TRAA with a velocity buffer and a character mask.
9. **Motion blur:** from the velocity buffer, capped length, normalized to a 60 fps shutter.
10. **Bloom:** mip chain with the threshold applied during upsample, so the down chain doubles as scene radiance for exposure.
11. **Auto exposure:**
    - Histogram, 40th to 60th percentile.
    - Applied as a partial correction, with separate up and down adaptation speeds.
    - Flash frames are excluded.
12. **Lens:** rain droplets and streaks on the lens when the camera faces the wind, plus subtle edge chromatic aberration.
13. **Final:**
    - Exposure.
    - Tone map (AgX or ACES-fitted, chosen by a capture comparison in milestone 1).
    - Grade: lift, gamma, gain, split tone, saturation, contrast.
    - Vignette, grain, dither.

**Ocean**

- **Spectrum:** JONSWAP with directional spreading, plus a separate swell term. All parameters come from the weather state.
- **Cascades:** three FFT cascades of 256x256 at non-commensurate patch sizes (**Tunable:** about 1000 m, 170 m, 30 m).
  - Each outputs displacement (with horizontal choppiness), derivatives for normals, and a Jacobian.
  - The fine cascade can drop to 128 under budget pressure; the swell cascade never does.
  - The swell cascade updates every frame. Others may be time-sliced if profiling shows a win.
- **Mesh:** camera-centered geometry clipmap, 7 to 8 rings. Each ring doubles cell size and snaps to its own grid. Vertices morph at ring seams. Displacement fades to normal-only beyond about 3 km, and a far skirt runs to the horizon.
- **Foam:**
  - Injected where the Jacobian drops below a threshold scaled by wind.
  - Accumulated with decay in a ping-pong texture per cascade.
  - Rendered with a streaked foam texture (Blender-baked or procedural) oriented along the wind.
  - Detail fades with `fwidth` so it never shimmers.
- **Shading:**
  - Fresnel sky reflection, sun or moon glitter, and lightning specular.
  - Subsurface term from crest height and back-lighting.
  - Absorption color by depth proxy.
  - Foam and whitecaps.
  - Rain ripple normals.
- **Physics query:** the CPU needs wave height under the ship without GPU readback latency.
  - A Web Worker runs a low-res (64x64) CPU FFT of the swell cascade, using the same seed and spectrum as the GPU.
  - It answers height, normal and velocity queries at buoyancy probes.
  - A debug view overlays CPU probe heights on the GPU surface to catch drift.

**Particles** (compute, storage buffers, indirect draw):

- **Rain:** camera-local wrapped volume, wind-driven and motion-stretched. **Tunable:** 40k to 80k streaks by tier.
- **Spindrift:** emitted from crest texels where foam injection is high and wind is above the threshold, blown downwind, and fades into haze.
- **Bow and hull spray:** emitted from hull-water contact events once the ship exists.
- **Deck water:** a sheet effect plus drips, from milestone 5.

**Quality tiers:** low, medium and high are selected automatically from an adapter probe plus a startup benchmark, then held by the dynamic resolution controller.

- URL overrides: `?q=` and `?qset=key:value`.
- Per-pass A/B flags such as `?nossr`, `?noclouds` and `?norain`.

**Profiling:** an in-game overlay (toggle F3) shows GPU time per pass from timestamp queries, CPU time per system, draw calls, internal resolution and the active tier. The target machine's numbers are the only ones that count. Cloud captures run in software rendering and are for looks only.

## 6. Ship and world

**The brigantine** (**Assumption**, based on a typical 19th-century brigantine):

- Dimensions: about 30 m length on deck, 7.5 m beam, 3.2 m draft.
- **Foremast:** square-rigged with course, topsail and topgallant yards.
- **Mainmast:** fore-and-aft, with a gaff mainsail and boom plus a gaff topsail.
- Bowsprit and jibboom with a jib and fore topmast staysail, plus main staysails.
- Height to the fore topgallant yard about 25 m above the deck.

**Ship physics** (fixed 120 Hz):

- A rigid body with 6 degrees of freedom.
- **Hydrostatics:** buoyancy from about 24 hull probes against the CPU swell query, including a heel-dependent righting arm.
- **Hydrodynamics:** damping in heave, roll and pitch; lateral resistance from keel area; hull drag; rudder lift proportional to speed through water times rudder angle, lost when the stern lifts clear.
- **Sails:** each sail produces force from apparent wind, set state (furled, reefed 1 or 2, full) and trim error. Forces act at the center of effort, which produces heel and weather helm.
- **Broach:**
  - Running before a big sea, the stern lifts and the rudder loses authority.
  - Wave yaw moment swings her beam-on.
  - If heel exceeds the capsize threshold (**Tunable:** 70 degrees, or righting energy exhausted), she is lost.
- **Dismasting:** a mast's load integral over a gust window exceeds its limit when too much sail is set. The warning comes from audio (rig groaning) and visuals (mast flex, shrouds singing).

**World:**

- Open ocean to a 20 km horizon.
- A distant coastline and headland with the lighthouse, placed so it rises into view during act 4.
- A harbor entrance with breaking rocks either side.
- There is no streaming world; the sea is the world.

## 7. Traversal

**Feel:** weighty momentum with forgiving grip.

- Real inertia and real pendulum dynamics. The ship's pitch and roll push the sailor around, and that force is the core of the feel.
- Grabs snap generously: **Tunable:** within 1.0 m of a hold while moving toward it.
- The input model never causes a fall. Falls come from mistimed leaps, green water and extreme motion events only.
- There is no stamina meter.

**Reference frame:** the sailor is simulated in the ship's local frame, which is non-inertial.

- The ship is advanced first each fixed step. The sailor then integrates with the frame's fictitious accelerations: `a_local = R^T g - A0 - alpha x r - omega x (omega x r) - 2 omega x v_local`.
- All holds, anchors and collision are ship-local, so they never need rebuilding.
- On leaving the ship (overboard), velocity is converted to world space once.
- All physics runs in a fixed-step accumulator at 120 Hz, with render interpolation.

**State machine:** a `mode` plus `sub` pair, with a scripted-motion slot for authored moves. Modes, with grab, climb or task actions as appropriate:

| Mode | Description |
|---|---|
| `deck` | Walk and run on the moving deck. Brace automatically when heel or pitch acceleration spikes; hold Shift to brace harder. Slide on steep heel if not braced |
| `climb` | Shrouds with ratlines as a parametric climbing surface. Move in 2D on the surface; climb speed is affected by roll |
| `footrope` | Shuffle along a yard's footrope, leaning over the yard. Reefing and furling happen here |
| `hang` | Hang from a yard, stay or line with the hands. Swing the legs to pump |
| `swing` | Pendulum on a free line (halyard, buntline, clewline) with a one-sided distance constraint, slack detection and energy-capped pumping. Release converts to air |
| `slide` | Down a stay or backstay along its line parameter. Speed comes from gravity along the line minus friction; hold to brake, which is cheap and forgiving |
| `air` | Leaps between yards, from the top to a line, or from line to shrouds. Targeted holds get a grab assist; real ballistics in the ship frame |
| `helm` | At the wheel (section 8) |
| `task` | Context interactions: haul, tie reef points, cut away, lash the wheel. Short input sequences, interruptible by events |
| `overboard` | Swimming in world space among the waves (section 9) |
| `knockdown` | Green water or a violent roll throws the sailor. A short, physically driven tumble along the deck ends in a grab at the nearest hold if one is within reach |

**Rigging data:** the traversable graph is authored in Blender as named empties and curves in ship space:

- Shroud surfaces (4 corners).
- Yard footropes.
- Stays and lines (end points plus sag).
- Holds and belaying pins.
- Tops and platforms.

It is exported in the ship GLB and validated by the asset contract test.

**Controls (keyboard and mouse)**

| Input | Action |
|---|---|
| WASD | Move, climb direction, pump on a swing, lean on a footrope |
| Mouse | Look |
| Space | Jump, leap, release |
| Shift | Brace on deck, brake on a slide |
| E | Interact: grab line, start task, take or leave the helm |
| Ctrl | Let go, drop |

**Gamepad:** left stick move, right stick look, A jump, RB brace or brake, X interact, B drop. All bindings are **Tunable**.

**Camera:**

- Third person, horizon-stable: camera up is world up, so the deck visibly heels and the horizon stays level.
- Follows the sailor with critically damped springs. A jolt spring absorbs deck motion that the sailor's velocity does not explain.
- Lookahead from ship-local velocity so roll does not slosh the view.
- Probe-ray collision against ship geometry.
- FOV widens with speed. Shake comes from trauma (green water, lightning close by, gear failures).

**Animation:** traversal owns state and writes a plain `anim` struct each frame. The animator mirrors it with a crossfade transition table, over Blender-authored clips plus procedural layers:

- Hand IK on holds and ropes.
- Foot IK on ratlines and footropes.
- Spring reaction to ship acceleration.
- Look-at.

## 8. Helm and sail trim

**Wheel:**

- A/D (or the left stick) applies torque to a weighted wheel with inertia. The rudder follows the wheel with lag.
- Weather helm and wave yaw push back through the wheel, so the player counter-steers on the face of a swell. The skill is anticipation.
- Surfing: a well-held run down a swell face gives a speed burst. Holding the stern square to the sea avoids broaching.
- The helm camera frames the bow, the sea ahead and the sails.

**Lashing:**

- Press E while holding a wheel angle to lash it and leave the helm.
- The ship holds course for a while, then drifts as waves yaw it.
- Broach risk rises over time, with escalating cues: sails slatting, heel angle, the wheel lashing creaking, and a HUD compass swing.

**Sail trim** (milestone 3):

- Each sail has a set state (full, reef 1, reef 2, furled).
- Square sails have a brace angle, set from the pin rail by hauling braces. The gaff sail has a sheet.
- Speed and heel come from a polar-style function of apparent wind angle, trim error, set area and wind speed squared.

**HUD** stays minimal:

- A heel and trim indicator.
- A wind direction ribbon.
- Task prompts in world space.
- A broach warning.

## 9. Storm structure, tasks, failure and ending

**Acts** (scripted, about 25 minutes in total, fixed beats with light timing randomization):

| Act | Preset | Weather (**Tunable**) | Beats |
|---|---|---|---|
| 1. Rising wind | dusk | Wind 17 m/s, Hs 4 m, light rain, rare distant lightning | Learn helm and surfing; lash the wheel; stow the jib; first reef in the fore topsail before a squall line arrives |
| 2. Full gale | night | Wind 24 m/s, Hs 7 m, heavy rain, lightning every 20 to 40 s | Second reef; a torn fore staysail must be secured; first green water on deck |
| 3. The worst | night | Wind 30 m/s, Hs 10 m, horizontal rain, frequent close lightning | Topgallant blows out and must be cut away aloft; run under storm canvas; a rogue wave set piece with the first real overboard risk |
| 4. The light | night | Wind easing to 22 m/s, Hs 6 m; the lighthouse rises into view | Navigate by the beam; line up the leading lights; the harbor entrance run |

**Tasks:**

- Each task is an authored beat with a location on the ship and a deadline tied to a weather event, such as a gust front arriving in 60 s.
- Missing a deadline has consequences, not an instant fail: a sail tears, a mast loads up, the ship rounds up.
- Consequences can chain into a lose condition.

**Lose conditions** (restart the current act from its checkpoint):

- Broach into capsize.
- Dismasting from too much sail in a gust.
- Drowning after failing to recover from overboard.

Ship wear (torn canvas remnants, broken spars already cut away) carries across acts as visible damage only.

**Overboard and recovery:**

- The ship always trails a line astern.
- Washed over the side, the sailor swims in world space with wave physics for about 20 s (**Tunable**) to reach the line. The ship sails on under the lashed wheel.
- Once the line is caught, the sailor hauls hand over hand to the stern and climbs back aboard.
- Missing the line means drowning, which restarts the act.

**Ending:**

- A final helm set piece: line up on the lighthouse beam and the two leading lights, then surf through a narrow gap between breakers into the lee.
- Crossing into calm water wins.
- A short cinematic follows. The storm breaks, using the night preset with weather eased toward calm (not a new preset).

**Assumptions:**

- No narrative dialogue or voice. Story is told through the environment.
- Audio (wind layers, rigging, sea, thunder, music) is in scope from milestone 4 but not specified here yet.

## 10. Asset pipeline

**Blender scripts:**

- Every 3D asset comes from a Python script in `tools/blender/`, run headless: `blender -b -P tools/blender/<asset>.py -- --out public/assets/<asset>.glb`.
- Scripts are rerunnable and deterministic: a fixed seed, no dependence on a saved .blend, and they start from factory settings.
- The Blender version is pinned in `tools/blender/VERSION`. `npm run assets` rebuilds everything.

**Shared module** `tools/blender/common.py`:

- Scene reset, units and scale.
- Naming helpers.
- Part-ID UV layer writer.
- Pivot helpers.
- glTF export with fixed settings: +Y up, apply modifiers, tangents, vertex colors where used, animations sampled, WebP textures embedded.

**GLB contracts:** a Vitest test parses each GLB and asserts:

- Required node names and pivots.
- Attribute semantics per slot, including that the part-ID layer actually lands in the slot the loader reads.
- Clip names.
- Bounding boxes within tolerance.
- The exporter generator string.

This closes the gap where the reference shipped part IDs in the wrong UV slot unnoticed.

**Planned assets**

| Asset | Milestone | Key contract |
|---|---|---|
| `graybox_ship.glb` | 2 | Box hull, spar boxes, and the full rigging-graph empties with final names (`rig_*`, `hold_*`, `shroud_*`, `stay_*`, `yard_*`), collision proxies `col_*` |
| `ship.glb` | 4 | Same rigging-graph names as the graybox. Hull, spars and blocks with a part-ID layer (wood, tarred wood, iron, brass, canvas, rope, glass, lamp). Yards, gaff, boom, wheel and rudder as separate nodes with pivots at their real hinges. Sail meshes as subdivided grids with a pin-weight attribute for the bolt ropes |
| `sailor.glb` | 4 | One armature with `.L`/`.R` bone names, in-place clips: `idle_brace, walk, run, climb, footrope_shuffle, hang, swing, slide, leap, land, helm_idle, helm_turn, haul, reef_tie, cut, swim, haul_line, knockdown` |
| `lighthouse.glb` | 5 | Tower, lantern room with an emissive lamp part, headland and rocks, leading-light towers |
| Foam and detail textures | 1 | Baked by Blender scripts to `public/assets/tex/`, with color space declared per texture in a manifest |

**Rope rendering:** ropes are built at runtime from the rigging graph as instanced segments along catenaries or solved lines, not modelled in Blender.

**Loader fallbacks:** each loader has a placeholder fallback plus a console warning that names the script to rerun.

**Environment:**

- Blender 5.2.2 LTS is pinned in `tools/blender/VERSION`. `tools/blender/install.sh` installs it and is safe to rerun.
- **Cloud:** `download.blender.org` is blocked by the network policy, so the cloud container uses the official `bpy` module from PyPI.
- **Locally:** a real Blender 5.2.2 binary works the same way through `tools/blender/run.sh`.
- The environment setup script should call `install.sh` so new sessions start with Blender ready.

## 11. Capture and visual review loop

**Shot mode:** `?shot=<bookmark>&preset=<dusk|night>&seed=<n>[&flash=<t>]`

- Fixes the camera, simulation time, weather and RNG.
- Advances a set number of fixed-dt frames so TAA, foam accumulation and exposure settle.
- Then sets `window.__shotReady = true`.

**Bookmarks** live in `src/shots.ts`:

- Milestone 1: `sea_low`, `sea_high`, `horizon_lightning`, `storm_sky`.
- Later: `ship_wide`, `deck_bow`, `masthead_down`, `yard_reefing`, `lighthouse_far`, `harbor_entrance`.
- Names match the reference image filenames in `references/`.

**`npm run capture`** (Playwright, Chromium with WebGPU enabled):

- Captures every bookmark at every preset to `captures/<run>/`. Night bookmarks also get a mid-flash frame.
- Builds a contact sheet that pairs each capture with its reference.
- Diffs against the previous committed baseline to catch unintended regressions.

**After every visual change:**

1. Capture.
2. Compare against `references/`.
3. Write a short critique to `docs/critiques/NNNN-<topic>.md` with a downscaled contact sheet. It covers value structure, color, foam and spray read, sky, what regressed, and what to fix next.
4. Only then continue.

Baselines are committed downscaled to `tests/visual/baseline/`.

## 12. Process rules

- **Approval gate for feel changes.** Any change to physics, controls or game feel is prepared and shown (the diff and a tuning table) but is **not committed** until the user approves it.
  - All feel constants live in `src/game/tuning.ts`, so these diffs are small and reviewable.
  - A debug tuning panel exposes them live during playtests.
- **Playtest stop.** Milestone 2 ends in a stop for a user playtest. No milestone 3 work until the user signs off.
- **No em dashes** anywhere: code, comments, UI copy, docs or commit messages.
- **Reference project hygiene.** `reference/` is study material under a view-only license. Never copy code, shaders, assets or theme from it.
- **Performance.** Every milestone reports GPU and CPU timings from the in-game overlay. Final numbers must come from the target machine.

## 13. Repository layout

```
src/
  main.ts                 boot, WebGPU check, loop
  app/                    fixed-step clock, URL params, shot mode, quality selection
  render/                 renderer, post graph, presets, weather uniforms, profiler overlay
  sky/                    clouds, lightning, atmosphere and fog
  ocean/                  spectrum, FFT compute, clipmap mesh, material, foam, CPU swell worker
  fx/                     compute particles: rain, spindrift, spray, deck water
  ship/                   rigid body, buoyancy, hydrodynamics, sails, rigging graph, helm
  player/                 traversal FSM and states, ship-frame integrator, camera, input, animator
  game/                   acts, tasks, checkpoints, overboard, ending, tuning.ts
  ui/                     HUD, menus, unsupported screen
  shots.ts                capture bookmarks
tools/
  blender/                headless asset scripts, common.py, VERSION
  capture/                Playwright capture, contact sheet, baseline diff
tests/                    unit tests, GLB contract tests, visual baselines
public/assets/            generated GLB and textures only (no build inputs)
references/               chosen reference images, PROMPTS.md, candidates/
docs/                     SPEC, MILESTONES, REFERENCE_ARCHITECTURE, critiques/
```
