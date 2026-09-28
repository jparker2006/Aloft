# Aloft: Game Specification

**Status:** v2. It incorporates the design interview, the confirmed reference images and a refinement pass that closes gaps found in v1 (see section 20).

**Markers used in this document:**

- **Tunable** marks a starting value that playtests will settle. Every Tunable is listed in Appendix A.
- **Assumption** marks a decision the interview did not cover. All of them are listed in section 19.

## 1. Pitch

A lone sailor must bring a brigantine through a violent night storm to a lighthouse. The fun is momentum on the rigging:

- Climb ratlines, swing on lines, slide down stays and leap between yards, while the deck pitches and rolls beneath.
- Take the wheel to surf the swells without broaching.

The storm escalates through four scripted acts and forces jobs aloft: reef before the gusts, cut away torn canvas, survive green water, and claw back aboard if you are washed over the side. The run ends by threading a harbor entrance under the lighthouse beam.

**Visual target:** the best-looking real-time ocean storm possible in a browser.

## 2. Player experience

These statements are the source for acceptance criteria in `docs/MILESTONES.md`.

1. The first thing I see is a sea that looks enormous and heavy, not a lake. Foam has structure, and crests glow when the light is behind them.
2. When lightning hits at night, the whole sea is revealed for an instant, then it goes dark again and my eyes have to find the foam.
3. On deck, I feel the ship move under me: walking uphill against the heel, bracing when she drops off a wave.
4. Climbing the ratlines feels physical. The roll presses me into the shrouds on one side and swings me out on the other.
5. A swing on a line has real pendulum weight, and the ship's roll can pump my swing or rob it. Good timing lets me ride that motion.
6. I never fall because the controls failed me. If I fall, it is because I mistimed a leap or the sea took me.
7. At the wheel, I read the swell behind me and counter-steer before it yaws the ship. Getting it right surfs her forward; getting it wrong broaches her.
8. I can lash the wheel and go aloft, but the ship will not wait forever. I hear and see her start to wander.
9. The storm gives me jobs with deadlines I can see coming: a squall line on the horizon, a gust front darkening the water.
10. Missing a job hurts before it kills: a torn sail, a groaning mast, a hard round-up. I get a chance to recover.
11. Being washed overboard is terrifying but survivable if I reach the trailing line.
12. The lighthouse beam first appears as a faint sweep in the rain. It becomes my compass for the last act.
13. The ending asks for everything I learned at the helm, then gives me calm water.
14. If I fail, I restart the act I was in, not the whole crossing.
15. The game runs smoothly on my MacBook, and I can turn down flashing if lightning bothers me.

## 3. Platform and targets

| Item | Decision |
|---|---|
| Target machine | Apple Silicon laptop, M2 Pro or M3 Pro class |
| Frame rate | 60 fps sustained in gameplay on the target machine at the default tier |
| Browsers | Chrome (current stable) and Safari 26+ on macOS |
| Graphics API | **WebGPU only.** If `navigator.gpu` or an adapter is missing, show a clear unsupported screen. No WebGL fallback |
| Primary input | Keyboard and mouse. Gamepad supported with the same actions |
| Session length | About 25 minutes for a full run, with a checkpoint per act |

**Stack**

- Three.js `WebGPURenderer` with TSL for all materials and post.
- Compute shaders for the ocean, particles, sail cloth and visual rope motion.
- Vite and TypeScript (strict).
- Vitest for unit and contract tests, Playwright for captures.

**WebGPU portability rules** (so Safari works without a second code path):

- Request no optional features and no raised limits unless feature-detected with a fallback. Design compute passes within the WebGPU default limits:
  - 8 storage buffers per shader stage.
  - 16 KB workgroup storage.
  - 256 invocations per workgroup.
- Textures that are sampled with filtering use `rgba16float` or 8-bit formats. `rgba32float` is only read with `textureLoad` and manual filtering, since float32 filtering is optional.
- Timestamp queries are optional. When unavailable, the profiler overlay falls back to CPU timings plus total frame time.

**Frame budget on the target machine** (16.6 ms):

| Area | Budget | Notes |
|---|---|---|
| Ocean compute (FFT, foam) | 1.5 ms | Protected |
| Ocean shading | 3.0 ms | Protected |
| Sky, clouds, lightning | 2.5 ms | First to degrade |
| Particles (rain, spray, spindrift) | 2.0 ms | Second to degrade |
| Ship, sails, rigging, character | 2.5 ms | From milestone 4; unused before |
| Post stack | 3.0 ms | |
| Headroom | 2.1 ms | |

**CPU budget per frame:** 4 ms for simulation, which covers 2 fixed physics steps at 120 Hz, the ocean query snapshots and the game logic.

**Resolution policy**

- The internal render resolution is based on CSS pixels (device pixel ratio 1), not Retina pixels. TAA resolves to output size.
- Over budget, a controller walks this degradation ladder in order, with hysteresis. Each rung is undone in reverse when there is headroom again:
  1. Cloud raymarch steps and resolution.
  2. Particle counts.
  3. Volumetric resolution (fog, beam).
  4. SSR, then GTAO, dropped to lower quality.
  5. Internal resolution, down to 65%.
  6. Fine ocean cascade from 256 to 128. This is the last resort.
- The ocean surface and foam are protected: the swell and mid cascades never degrade.

## 4. Conventions

- **Units:** meters, seconds, radians in code (degrees only in UI and docs), SI everywhere else.
- **World axes:** right-handed, +Y up. The sea's mean level is Y = 0.
- **Ship-local axes:** +Z toward the bow, +Y up, +X to port, so starboard is -X. The origin is on the centerline at the waterline, midships. The Blender scripts produce this frame directly: Blender's -Y forward and +Z up become glTF +Z forward and +Y up on export.
- **Directions:**
  - Wind direction is where the wind comes **from**. Compass bearings run clockwise from north (+Z world is north, +X world is west).
  - Wave direction is where waves travel **to**.
- **Time:** a single simulation clock advanced by the fixed-step loop. Everything that must agree across CPU and GPU (ocean, weather, lightning, act script) reads this clock. The renderer uses the interpolated clock value for the current frame.
- **Randomness:** one seeded RNG per system, all derived from a run seed. `?seed=` sets it. No `Math.random()` in simulation or rendering code.

## 5. Visual pillars

Priority order when budget forces a choice:

1. **Ocean surface and foam (protected).**
   - Cascaded FFT swell and chop, with sharp crests from choppy displacement.
   - Foam from the Jacobian that persists and streaks along the wind.
   - Subsurface glow through thin crests, wet specular, and lightning reflected in wave faces.
2. **Spray, spindrift and rain.** Wind tearing spindrift off crests, bow spray on impacts, driving rain, and later water sheeting across the deck.
3. **Storm sky and lightning.**
   - A low volumetric cloud deck with scud racing beneath it.
   - Lightning lights the clouds from inside, with visible bolts. Flashes light the whole sea for a few frames.
4. **Lighthouse beam and fog.**
   - Height fog and rain haze with aerial perspective.
   - A volumetric rotating beam through rain as the emotional goal.

**Reference images** in `references/` (chosen by the user; see `references/README.md`) define mood, value structure and color targets, not pixel matches. The 3D result must beat them.

- **What each reference teaches:**
  - `dusk__sea_low`: translucent green crest with backlit spray.
  - `night__sea_low`: foam legible in near-black.
  - `night__sea_low__flash`: a flash backlighting a breaking crest.
  - `dusk__sea_high`: glitter path and rain shafts.
  - `night__horizon_lightning__flash`: bolt and reflected path.
  - `dusk__storm_sky`: a heavy deck over a copper gap.
- **Known inaccuracies to ignore:**
  - Ships under full sail in a storm.
  - Modern steel railings.
  - Red and green channel markers where the ending has aligned leading lights.

## 6. Lighting presets and weather

**Presets and weather are two separate layers:**

- A **lighting preset** defines the look: sun or moon, sky, exposure, grading.
- The **weather state** defines the storm: wind, sea state, rain, lightning rate, cloud base, visibility.
- The act script drives the weather and chooses the preset.

**Presets** (the only two in scope):

| Preset | Used in | Look |
|---|---|---|
| `dusk` | Act 1 | Low copper sun bleeding through a gap under a slate cloud deck, backlit spray, green-grey sea |
| `night` | Acts 2 to 4 and the ending | Near black between flashes. Lightning reveals the sea for a few frames. Local light comes only from the ship's lantern and, later, the lighthouse |

**Preset data model**

- Each preset is a flat dictionary of numeric look keys:
  - Key light direction, color and gain.
  - Ambient and IBL gains.
  - Exposure.
  - Fog density and tint.
  - Cloud coverage, base and density.
  - Grading: lift, gamma, gain, saturation, contrast, split tone.
  - Bloom.
  - Lantern gain.
- `resolvePreset()` merges defaults with preset overrides. `applyPreset()` writes the result to shared TSL `uniform()` nodes that every material and pass reads. There is no scene traversal and no material patching.
- Switching blends every key over 2.5 s (**Tunable**). Captures pin the preset with no blend.

**Weather state keys:**

- Wind speed and direction.
- Gust amplitude and period.
- Significant wave height (Hs).
- Peak period.
- Swell direction and spread.
- Choppiness.
- Rain rate.
- Lightning rate and distance range.
- Cloud base.
- Visibility.

**Blending:** weather blends continuously along act curves. The ocean spectrum is rebuilt when Hs, wind or swell change by more than a small threshold. Rebuilding cross-fades between the old and new spectrum over 4 s to avoid a visible pop.

**Lightning** is a transient event, not a preset.

- **Strikes:** each strike is seeded. It has a position, a bolt shape (a branching polyline generated on the CPU) and a flicker curve of 3 to 5 return strokes.
- **What a strike drives:**
  - A cloud in-scatter point source in the cloud march.
  - An additive sky and ambient term.
  - A directional flash light for specular on the sea.
  - An emissive bolt ribbon.
- **No PMREM re-bake per flash.**
- **Exposure:** auto exposure ignores flash frames, and flashes clip into bloom on purpose.
- **Photosensitivity** (see section 16): return strokes are spaced so that full-screen luminance never flashes more than 3 times in any 1 s window. The "Reduce flashing" setting lowers flash peak luminance by 70%, removes flicker, and stretches each flash into a single soft pulse.
- **Capture control:** `?flash=<seconds>` freezes the next strike at a given phase.

## 7. Rendering architecture

**Renderer**

- `WebGPURenderer` with HDR half-float targets.
- Reversed depth is used if the three.js WebGPU backend supports it. Otherwise the camera uses near 0.2 m, and a separate far-skirt pass draws the horizon.
- Renderer tone mapping is off; tone mapping and grading run in our final pass.
- `renderer.compileAsync(scene, camera)` warms every pipeline variant behind the loading screen, including the shot mode, flash, and every quality tier's variants.

**Frame graph (per frame)**

1. **Simulation compute:**
   - Ocean spectrum update (only on rebuild) and FFT per cascade.
   - Foam accumulate and decay.
   - Particle simulate and emit.
   - Sail cloth and visual rope solve (milestone 4).
2. **Scene pass with MRT:** outputs are HDR color, view normal plus roughness, motion vectors and depth. It draws the ocean, ship, rigging, character and opaque particles.
3. **Sky and clouds:** a half-res raymarch with temporal reprojection. The cloud deck is lit by the sun or moon and by lightning points, and composites behind scene depth.
4. **Transparent particles:** rain streaks and fine spray with soft-particle depth fade. Over budget, they render at half res with a depth-aware upsample.
5. **Volumetrics:**
   - Height fog and rain haze with aerial perspective.
   - In-scatter from lightning, the lantern and, later, the lighthouse beam.
   - Froxel grid or half-res raymarch, whichever profiles better in milestone 1.
6. **Reflections:**
   - The ocean reflects the sky via a 128 px sky cube. It is refreshed one face per frame when the preset or weather changes.
   - Half-res SSR covers the ship, lantern, lighthouse and lightning. It is stored as a delta over the sky reflection so misses fall back cleanly.
7. **AO:** half-res GTAO, applied to indirect light only.
8. **TAA:** TRAA with the velocity buffer and a character mask.
9. **Motion blur:** from the velocity buffer, with capped length, normalized to a 60 fps shutter.
10. **Bloom:** a mip chain with the threshold applied during upsample, so the down chain doubles as scene radiance for exposure metering.
11. **Auto exposure:**
    - A histogram, averaged over the 40th to 60th percentile.
    - Applied as a partial correction, with separate up and down adaptation speeds.
    - Flash frames are excluded.
12. **Lens:** rain droplets and streaks on the lens when the camera faces the wind, plus subtle edge chromatic aberration.
13. **Final:**
    - Exposure.
    - Tone map: AgX or ACES-fitted, chosen by capture comparison in milestone 1.
    - Grade: lift, gamma, gain, split tone, saturation, contrast.
    - Vignette, grain and dither.

**Ocean**

- **Spectrum:** JONSWAP with directional spreading plus a separate swell term. All parameters come from the weather state.
- **Resolution-independent seeding.** The initial amplitude h0(k) for each wave vector is generated from a hash of its integer wave-vector index and the run seed. It is not generated by walking an RNG across the grid.
  - Any FFT resolution therefore produces identical coefficients for the modes it shares.
  - This is what lets the CPU physics query (below) agree with the GPU surface.
- **Cascades:** three FFT cascades of 256x256 at non-commensurate patch sizes (**Tunable:** 1024 m, 173 m, 31 m).
  - Each outputs displacement (with horizontal choppiness), slope derivatives for normals, and the Jacobian.
  - Wave bands are split so no wavelength is counted twice.
- **Mesh:**
  - A camera-centered geometry clipmap with 8 rings. Each ring doubles the cell size and snaps to its own grid.
  - Vertices morph at ring seams.
  - Displacement fades to normal-only beyond about 3 km, and a far skirt runs to the horizon.
- **Foam:**
  - Injected where the Jacobian drops below a threshold scaled by wind.
  - Accumulated with decay in a ping-pong texture per cascade.
  - Rendered with a streaked foam texture (baked by a Blender script) oriented along the wind.
  - Detail fades with `fwidth`, so it never shimmers at the horizon.
- **Shading:**
  - Fresnel sky reflection.
  - Sun or moon glitter.
  - Lightning specular.
  - A subsurface term from crest height and back-lighting.
  - Absorption color.
  - Foam and whitecaps.
  - Rain ripple normals.

**Ocean physics query** (CPU; there is never any GPU readback)

- **Coverage:** the CPU runs its own FFT of the two largest cascades: the 1024 m patch at 64x64 and the 173 m patch at 32x32. Thanks to the shared seeding, these reproduce every wave longer than about 11 m exactly as the GPU renders them. Shorter chop is not needed to float a 30 m hull.
- **Snapshots:** they are computed at fixed simulation times, every 4th physics step (30 Hz). Queries interpolate linearly between the two snapshots around the current time.
  - Snapshots depend only on time, so results are deterministic.
  - They run in a Web Worker one snapshot ahead. Physics only blocks if a snapshot is missing, which should never happen and is counted in the profiler.
- **API:** height, normal and surface velocity at a world XZ point. Horizontal displacement is inverted with 3 fixed-point iterations, so the answer matches the displaced surface, not the undisplaced grid.
- **Drift check:** a debug view draws CPU probe heights over the GPU surface. A unit test compares CPU and GPU heights for shared bands on a fixed seed.

**Particles** (compute, storage buffers, indirect draw)

- **Rain:** a camera-local wrapped volume, wind-driven and motion-stretched. **Tunable:** 40k to 80k streaks by tier.
- **Spindrift:** emitted from crest texels where foam injection is high and wind is above threshold. It blows downwind and fades into haze.
- **Bow and hull spray:** emitted from hull-water contact. The ship's CPU buoyancy probes report submersion rate per probe, which is uploaded as emitter data each frame.
- **Deck water:** a sheet effect plus drips, from milestone 5.

**Quality tiers**

- Low, medium and high are chosen at startup from a 2 s benchmark of the milestone 1 scene. Adapter info is not used, because Safari reports little of it.
- The resolution controller in section 3 then holds the frame rate.
- **Overrides:**
  - URL: `?q=low|med|high` and `?qset=key:value`.
  - Per-pass A/B flags such as `?nossr`, `?noclouds`, `?norain`, `?nofoam`.

**Profiling:** an in-game overlay (toggle F3) shows:

- GPU time per pass.
- CPU time per system.
- Draw calls.
- Internal resolution.
- Active tier and ladder rung.
- Worker snapshot misses.

Only the target machine's numbers count. Cloud captures run on a software adapter and are for looks only.

## 8. Ship and world

**The brigantine** (**Assumption**, based on a typical 19th-century brigantine):

- About 30 m length on deck, 7.5 m beam, 3.2 m draft, around 180 t displacement.
- **Foremast:** square-rigged with course, topsail and topgallant yards.
- **Mainmast:** fore-and-aft, with a gaff mainsail and boom plus a gaff topsail.
- Bowsprit and jibboom with a jib and fore topmast staysail, plus main staysails.
- Fore topgallant yard about 25 m above the deck.

**Articulated parts:**

- Yards brace (rotate about the mast), and the gaff and boom swing. The wheel and rudder turn.
- Each is a separate node with its pivot at the real hinge.
- Rigging attached to a moving part moves with it (section 9).

**Ship physics** (fixed 120 Hz, on the CPU):

- **Body:** a rigid body with 6 degrees of freedom.
- **Hydrostatics:** buoyancy from 24 hull probes (**Tunable**) against the ocean query. Righting comes from the probe distribution, not a scripted curve.
- **Hydrodynamics:**
  - Damping in heave, roll and pitch.
  - Lateral resistance from keel area.
  - Hull drag.
  - Rudder lift proportional to speed through water squared times rudder angle. Authority scales with rudder immersion, so it is lost when the stern lifts clear.
  - A wave yaw moment from the sea's slope under the stern quarter.
- **Sails:**
  - Force comes from an analytic model: apparent wind, set state (full, reef 1, reef 2, furled, torn) and trim error.
  - Forces act at each sail's center of effort, producing drive, heel and weather helm.
  - **The cloth simulation is visual only and never feeds back into physics.** This keeps physics deterministic and free of GPU readback. The cloth is driven by the same pressure the force model computes, so what you see matches what you feel.
- **Broach:** running before a big sea, the stern lifts, the rudder loses authority, and the wave yaw moment swings her beam-on.
- **Capsize:** triggered when heel exceeds 70 degrees for more than 1.5 s, or when roll energy exceeds the remaining righting energy (**Tunable**).
- **Dismasting:**
  - Each mast integrates load above its safe limit over a sliding 3 s window (**Tunable**). Crossing the limit dismasts.
  - Warnings start at 60% of the limit: rig groaning, visible mast flex, shrouds singing.

**World**

- Open ocean to a 20 km horizon.
- A distant coastline and headland with the lighthouse, placed so it rises into view during act 4.
- A harbor entrance with breaking rocks either side.
- There is no streaming world; the sea is the world.
- The act script moves the ship's start point and heading per act. The distance to the lighthouse shrinks across acts regardless of player speed (**Assumption**), so pacing stays authored.

## 9. Traversal

**Feel:** weighty momentum with forgiving grip.

- Real inertia and real pendulum dynamics. The ship's pitch and roll push the sailor around, and that force is the core of the feel.
- Grabs snap generously: within 1.0 m of a hold while moving toward it (**Tunable**).
- The input model never causes a fall. Falls come only from mistimed leaps, green water and extreme motion events.
- There is no stamina meter.

**Reference frames**

- **The ship-local frame is non-inertial.** The ship is advanced first each fixed step. The sailor then integrates in the ship-local frame with the frame's fictitious accelerations: `a_local = R^T g - A0 - alpha x r - omega x (omega x r) - 2 omega x v_local`.
- **Attachments** are stored as `(node, localPoint)`, where `node` is the hull or an articulated part (a yard, gaff or boom). A hold on a yard is expressed in that yard's frame, so bracing the yard carries the sailor with it. The sailor's position is resolved through the node's transform each step.
- **Collision** is in ship-local space against the collision proxies. It never needs rebuilding, because the ship is rigid apart from its articulated parts, which have their own proxies.
- **Leaving the ship** (overboard): velocity is converted to world space once: `v_world = V + omega x r + R v_local`. The sailor then simulates in world space until back aboard.
- **Timing:** all physics runs in a fixed-step accumulator at 120 Hz with render interpolation. The accumulator is capped at 4 steps per frame. If it falls further behind, simulation slows instead of spiralling.

**State machine**

- State is a `mode` plus `sub` pair, with a scripted-motion slot for authored moves: mantle onto a top, swing onto the footrope, climb in over the rail.
- `setMode` resets the mode timers. States emit one-frame events for camera and audio.

| Mode | Description |
|---|---|
| `deck` | Walk and run on the moving deck. Bracing is automatic when ship acceleration at the sailor exceeds a threshold; Shift braces harder. Without bracing, steep heel slides the sailor toward the low side |
| `climb` | Shrouds with ratlines as a parametric climbing surface (u across, v up). Movement is in 2D on the surface, and climb speed is affected by roll |
| `footrope` | Shuffle along a yard's footrope, leaning over the yard. Reefing and furling happen here |
| `hang` | Hang from a yard, stay or line by the hands. Swing the legs to pump |
| `swing` | Pendulum on a free line (halyard, buntline, clewline). One-sided distance constraint, slack detection and energy-capped pumping. Release converts to air |
| `slide` | Down a stay or backstay along its line parameter. Speed comes from gravity along the line minus friction. Holding brake is cheap and forgiving |
| `air` | Leaps between yards, from a top to a line, or from a line to the shrouds. Real ballistics in the ship frame, with a grab assist toward the targeted hold |
| `helm` | At the wheel (section 10) |
| `task` | Context interactions: haul, tie reef points, cut away, lash the wheel. Short input sequences, interruptible by events |
| `overboard` | Swimming in world space among the waves (section 11) |
| `knockdown` | Green water or a violent roll throws the sailor. A short, physically driven tumble along the deck ends in a grab at the nearest hold within reach, or in `overboard` if the sailor clears the rail |

**Rigging graph** (authored in Blender, exported in the ship GLB, validated by the contract test)

| Element | Node naming | Data |
|---|---|---|
| Shroud surface | `shroud_<mast>_<side>_<n>` | 4 corner empties, ratline spacing |
| Footrope | `footrope_<yard>` | Polyline empties, parented to the yard node |
| Stay or backstay | `stay_<name>` | 2 end empties plus a sag value in custom properties |
| Free line | `line_<name>` | Fixed end, free length, parented to the spar it hangs from |
| Hold | `hold_<name>` | A point with a type in custom properties (`rail`, `pin`, `yard`, `cap`) |
| Top or platform | `top_<mast>` | A walkable box |
| Task spot | `task_<name>` | A point plus the facing the sailor snaps to |

**Controls (keyboard and mouse)**

| Input | Action |
|---|---|
| WASD | Move, climb direction, pump on a swing, lean on a footrope |
| Mouse | Look |
| Space | Jump, leap, release |
| Shift | Brace on deck, brake on a slide |
| E | Interact: grab line, start task, take or leave the helm |
| Ctrl | Let go, drop |
| Esc | Pause |
| F3 | Profiler overlay (dev builds and `?dev`) |

- **Gamepad:** left stick move, right stick look, A jump, RB brace or brake, X interact, B drop, Start pause.
- **Input handling:**
  - Presses are latched until the next fixed step, so short taps are never lost.
  - Jump buffer 0.15 s and coyote time 0.12 s (**Tunable**).
- All bindings are rebindable in settings.

**Camera**

- Third person and horizon-stable: camera up is world up, so the deck visibly heels while the horizon stays level.
- Follows the sailor with critically damped springs. A jolt spring absorbs position steps that the sailor's own velocity does not explain.
- Lookahead comes from ship-local velocity, so the roll does not slosh the view.
- Probe-ray collision against the ship's collision proxies.
- FOV widens with speed.
- Shake is trauma-based: green water, close lightning, gear failure. It is scaled by the "Camera shake" setting.

**Animation**

- Traversal owns state and writes a plain `anim` struct every fixed step: mode, sub, timers, ship-local velocity, contact points, swing phase and rope tension.
- The animator mirrors that struct with a crossfade transition table over Blender-authored clips. It adds procedural layers:
  - Hand IK on holds and ropes.
  - Foot IK on ratlines and footropes.
  - Spring reaction to ship acceleration.
  - Look-at.
- The animator never changes simulation state.

## 10. Helm and sail trim

**Wheel**

- A/D (or the left stick) applies torque to a weighted wheel with inertia. The rudder follows the wheel with lag.
- Weather helm and wave yaw push back through the wheel, so the player counter-steers on the face of a swell. The skill is anticipation.
- **Surfing:** a well-held run down a swell face gives a speed burst. Holding the stern square to the sea avoids broaching.
- The helm camera frames the bow, the sea ahead, the sails and a glimpse of the following sea over the quarter.

**Lashing**

- Press E while holding a wheel angle to lash it and leave the helm. The rudder is then fixed at that angle.
- Course keeping emerges from physics. The lashing also slips toward the wave-induced yaw at a slow rate (**Tunable**), so drift is guaranteed even in a steady sea.
- Cues escalate as yaw error grows:
  1. Sails slatting.
  2. Increasing heel.
  3. The lashing creaking.
  4. The HUD heading tick swinging off course.
  5. A broach warning.

**Sail trim** (milestone 3)

- Each sail has a set state: full, reef 1, reef 2, furled or torn.
- Square sails have a brace angle, set by hauling braces at the pin rail. The gaff sail has a sheet.
- Drive and heel come from a polar-style function of apparent wind angle, trim error, set area and wind speed squared.

**HUD** (minimal, diegetic where possible)

- A heading strip with a course tick, and a wind arrow on the strip.
- A heel and trim indicator.
- Task prompts in world space.
- A broach warning.
- Nothing is shown while aloft except task prompts.

## 11. Storm structure, tasks, failure and ending

**Acts:** scripted, about 25 minutes in total, with fixed beats and light timing randomization (**Tunable** weather values).

| Act | Preset | Target length | Weather | Beats |
|---|---|---|---|---|
| 1. Rising wind | dusk | 7 min | Wind 17 m/s, Hs 4 m, light rain, rare distant lightning | Learn the helm and surfing; lash the wheel; stow the jib; first reef in the fore topsail before a squall line arrives |
| 2. Full gale | night | 7 min | Wind 24 m/s, Hs 7 m, heavy rain, lightning every 20 to 40 s | Second reef; secure a torn fore staysail; first green water on deck |
| 3. The worst | night | 6 min | Wind 30 m/s, Hs 10 m, horizontal rain, frequent close lightning | The topgallant blows out and must be cut away aloft; run under storm canvas; a rogue wave set piece with the first real overboard risk |
| 4. The light | night | 5 min | Wind easing to 22 m/s, Hs 6 m; the lighthouse rises into view | Navigate by the beam; line up the leading lights; the harbor entrance run |

**Tasks**

- Each task is an authored beat with a `task_*` spot on the ship, a telegraph and a deadline.
  - The telegraph is a visible weather event: a squall line on the horizon, darkening water from a gust front, a tear starting in the canvas.
  - The deadline is tied to the event's arrival (for example, the gust front reaches the ship in 60 s).
- Missing a deadline has consequences, not an instant fail: a sail tears, a mast loads up, the ship rounds up. Consequences can chain into a lose condition.
- Task inputs are short and readable: hold E to haul with a rhythm cue, tap E per reef point, hold E to cut. They can be interrupted by knockdowns and resume where they stopped.

**Lose conditions**

- Capsize after a broach (section 8 thresholds).
- Dismasting (section 8 load window).
- Drowning after failing overboard recovery.

**Checkpoints**

- Each act starts from a checkpoint: a fixed ship pose, weather timeline position and task state, plus the wear carried in.
- Wear (torn canvas remnants, spars already cut away) is visible damage only. It never changes handling.
- A lose condition shows a short failure beat, then restarts the current act.
- The act reached is saved locally so "Continue" works after closing the tab.

**Overboard and recovery**

- The ship always trails a line astern: a CPU rope chain in world space, attached to the stern, about 40 m long (**Tunable**).
- Washed over the side, the sailor swims in world space, riding the wave surface from the ocean query.
- The sailor has 20 s (**Tunable**) to reach the line while the ship sails on under the lashed wheel.
- Grabbing the line starts a hand-over-hand haul to the stern, then a scripted climb aboard.
- The timer running out means drowning, which restarts the act.

**Ending**

- A final helm set piece. Two leading lights stand on shore: a low front light and a high rear light. The channel bearing is correct when they line up vertically. The lighthouse beam sweeps overhead.
- The player surfs through a gap about 60 m wide (**Tunable**) between breaking rocks into the lee.
- **Win:** the ship's center crosses the harbor trigger with no lose condition active.
- **Rocks:** hitting them grounds the ship, which counts as a lose condition and restarts act 4.
- **Cinematic:** a short sequence as the storm breaks. It uses the night preset with weather eased toward calm; it is not a new preset.

## 12. Game flow and UI

1. **Boot:** WebGPU check, then either the unsupported screen or the loading screen.
2. **Loading:** asset load plus `compileAsync` warmup. **Assumption:** under 10 s on the target machine.
3. **First run:** a photosensitivity notice with a direct link to "Reduce flashing".
4. **Title:** New crossing, Continue (if saved), Settings.
5. **Play:** acts 1 to 4, with pause (Esc) offering Resume, Restart act, Settings and Quit to title.
6. **End:** credits card, then an act select unlocked for replay.

**Settings** (saved locally, and all reads and writes tolerate storage being unavailable):

- Quality tier (auto, low, medium, high) and a render scale override.
- Mouse sensitivity and invert Y.
- FOV.
- Camera shake scale.
- Reduce flashing.
- Key and gamepad rebinding.
- Master, music and effects volume.

## 13. Audio

**Assumption:** audio is in scope from milestone 4 and not designed in detail yet. The first pass covers:

- Layered wind that follows apparent wind speed.
- The sea: hull slap, breaking crests, green water.
- Rigging: creak, flogging canvas, shrouds singing under load.
- Thunder, delayed by strike distance at 343 m/s.
- The sailor's effort sounds.
- A sparse score that swells per act.

Audio cues double as gameplay warnings (dismast groan, lashing creak), so they must be audible over the storm mix.

## 14. Asset pipeline

**Blender scripts**

- Every 3D asset comes from a Python script in `tools/blender/`, run headless through `tools/blender/run.sh`. With a real binary, that is `blender -b --factory-startup --python-exit-code 1 -P <script> -- --out public/assets/<asset>.glb`.
- Scripts are rerunnable and deterministic:
  - A fixed seed.
  - No dependence on a saved .blend file.
  - They start from factory settings.
- `npm run assets` rebuilds everything.
- The Blender version is pinned in `tools/blender/VERSION` (5.2.2 LTS). `tools/blender/install.sh` installs it, and `tools/blender/selftest.py` verifies the install.

**Shared module** `tools/blender/common.py`

- Scene reset, units and scale.
- Naming helpers.
- A part-ID UV layer writer that always targets UV slot 1.
- Pivot helpers.
- glTF export with fixed settings: +Y up, modifiers applied, tangents, vertex colors where used, animations sampled, and WebP textures embedded.

**GLB contract tests** (Vitest; a test parses each GLB and asserts):

- Required node names and pivots.
- Attribute semantics per slot. This includes reading back part-ID values from `TEXCOORD_1`, which catches the silent slot drift the reference project shipped with.
- Clip names.
- Bounding boxes within tolerance.
- The exporter generator string.

**Planned assets**

| Asset | Milestone | Key contract |
|---|---|---|
| Foam and detail textures | 1 | Baked by Blender scripts to `public/assets/tex/`, with color space declared per texture in `public/assets/tex/manifest.json` |
| `graybox_ship.glb` | 2 | Box hull, spar boxes, articulated nodes with real pivots, the full rigging graph with final names (section 9), collision proxies `col_*` |
| `ship.glb` | 4 | The same rigging-graph names and positions as the graybox, within tolerance. Hull, spars and blocks with a part-ID layer (wood, tarred wood, iron, brass, canvas, rope, glass, lamp). Sail meshes are subdivided grids with a pin-weight attribute for the bolt ropes |
| `sailor.glb` | 4 | One armature with `.L`/`.R` bone names, in-place clips: `idle_brace, walk, run, climb, footrope_shuffle, hang, swing, slide, leap, land, helm_idle, helm_turn, haul, reef_tie, cut, swim, haul_line, knockdown` |
| `lighthouse.glb` | 5 | Tower, lantern room with an emissive lamp part, headland and rocks, front and rear leading-light towers |

**Ropes:**

- Ropes are built at runtime from the rigging graph as instanced segments along catenaries or solved lines, not modelled in Blender.
- Slack lines flog in a compute solve, which is visual only.
- The line the sailor is holding is solved on the CPU as part of traversal, and its visual follows that solution.

**Loaders:** each loader has a placeholder fallback plus a console warning that names the script to rerun.

**Environment:**

- The cloud container installs Blender from the official `bpy` PyPI build, because `download.blender.org` is blocked there. Locally, a real Blender 5.2.2 binary works the same way.
- The cloud environment setup script should call `tools/blender/install.sh`.

## 15. Capture and visual review loop

**Shot mode:** `?shot=<bookmark>&preset=<dusk|night>&seed=<n>[&flash=<t>]`

- Fixes the camera, simulation time, weather and RNG.
- Advances a set number of fixed-dt frames so TAA, foam accumulation and exposure settle.
- Then sets `window.__shotReady = true`.

**Bookmarks** (in `src/shots.ts`; names match `references/`):

| Bookmark | Milestone | Camera | References |
|---|---|---|---|
| `sea_low` | 1 | Low in a trough (camera 1 m above mean sea level), looking upwind toward the low sun into an approaching crest | `dusk__sea_low`, `night__sea_low`, `night__sea_low__flash` |
| `sea_high` | 1 | 25 m up, looking across the swell toward the sun or moon bearing | `dusk__sea_high` |
| `horizon_lightning` | 1 | 6 m up, facing a strike seeded at 4 km | `night__horizon_lightning__flash` |
| `storm_sky` | 1 | 8 m up, pitched 15 degrees up, facing the cloud gap | `dusk__storm_sky` |
| `ship_wide` | 2, 4 | 60 m off the port quarter, 8 m up | `dusk__ship_wide` |
| `deck_bow` | 2, 4 | Ship-local, at the helm looking forward | `night__deck_bow` |
| `masthead_down` | 2, 4 | Ship-local, fore top looking down to leeward | `dusk__masthead_down` |
| `yard_reefing` | 4 | Ship-local, behind and above the sailor on the topsail footrope | `night__yard_reefing__flash` |
| `lighthouse_far` | 5 | Ship-local, on deck looking toward the lighthouse at 3 km | `night__lighthouse_far` |
| `harbor_entrance` | 5 | Ship-local, behind the bowsprit on the final approach | `night__harbor_entrance` |

**`npm run capture`** (Playwright, Chromium with WebGPU)

- **Viewport:** 1536x1024, matching the references' 3:2 aspect. Rendered at DPR 1 and the high tier.
- **Output:**
  - Every bookmark at every preset goes to `captures/<run>/`.
  - Night bookmarks also get a mid-flash frame.
  - A reference with a `__flash` suffix is compared against the mid-flash frame.
- **Contact sheet:** pairs each capture with its reference.
- **Regression diff:** compares against committed baselines in `tests/visual/baseline/` (downscaled to 768 wide). A luminance SSIM below 0.97 flags an image as changed for review. It is not a failure: intentional changes update the baseline in the same commit.
- **Cloud runs** use a software WebGPU adapter. They are slow, so per-shot timeouts are generous.

**After every visual change:**

1. Capture.
2. Compare against `references/`.
3. Write a critique to `docs/critiques/NNNN-<topic>.md` with a downscaled contact sheet. Each critique covers:
   - Value structure.
   - Color.
   - Foam and spray read.
   - Sky.
   - One thing better than the reference.
   - One thing worse.
   - What regressed.
   - The next fix.
4. Only then continue.

## 16. Accessibility and comfort

- **Photosensitivity:**
  - A notice on first run.
  - Lightning is limited to 3 full-screen flashes per second.
  - The "Reduce flashing" setting (section 6).
- **Motion comfort:**
  - The horizon-stable camera is the default, and the only mode.
  - The camera shake scale goes to 0.
  - The FOV slider.
  - Motion blur can be turned off.
- **Input:** full rebinding for keyboard and gamepad. No inputs need rapid tapping except reef points, which also accept hold.
- **Readability:** task prompts and warnings carry both an icon and audio, never color alone.

## 17. Testing decisions

- **Unit tests (Vitest):**
  - Fixed-step clock and interpolation.
  - Seeded RNG streams.
  - Preset resolve and blend.
  - Weather curve evaluation.
  - Resolution-independent spectrum seeding, where shared modes are identical at 32, 64 and 256.
  - CPU ocean query against a reference evaluation.
  - Ship-frame fictitious acceleration terms against analytic cases.
  - Rope constraint and slack detection.
  - Sail force monotonic in area and wind.
  - Rudder authority against immersion.
  - Broach, capsize and dismast detectors.
  - Lightning flash-rate limiter.
- **Contract tests:** every GLB (section 14), plus the texture manifest's color-space declarations.
- **Determinism test:** a recorded input file replayed on a fixed seed produces the same ship pose and sailor path, within float tolerance, after 60 s.
- **Visual:** the capture loop and the baseline SSIM diff (section 15).
- **Performance:** the profiler overlay reports on the target machine at each milestone. The user runs them and the numbers go in the milestone report.
- **CI:** type-check, lint (including the no-em-dash rule), unit and contract tests on every push. Captures run on demand because they are slow on a software adapter.

## 18. Out of scope

- WebGL fallback, mobile, and browsers other than Chrome and Safari 26+.
- Crew or other characters, dialogue, voice acting.
- Free-roam sailing, navigation charts, multiple routes, procedural storms.
- Ship upgrades, inventory, progression systems, difficulty levels.
- Multiplayer, leaderboards, accounts, cloud saves.
- Lighting presets beyond `dusk` and `night`, and a day or dawn look.
- Photo mode (the shot mode is a dev tool only).

## 19. Open questions and assumptions

| Item | Current assumption | Decide by |
|---|---|---|
| Ship size | About 30 m on deck; topgallant yard 25 m above deck | Milestone 2 playtest |
| Act weather values | Section 11 table | Milestone 3 playtest |
| Act lengths | 7, 7, 6 and 5 minutes | Milestone 5 |
| Control bindings | Section 9 tables | Milestone 2 playtest |
| Distance to lighthouse is authored per act, not simulated | Yes | Milestone 5 |
| Tone mapper | AgX vs ACES-fitted, by capture | Milestone 1 |
| Volumetric technique | **Decided for M1: half-res raymarch** (12 exponentially spaced steps, jittered, at half resolution with a quarter-resolution ladder rung). Lightning is the only local light in M1, and one point light through rain curtains does not justify a froxel grid's fixed cost (a 160x90x64 froxel inject and integrate every frame). Revisit when the lantern and lighthouse beam add local lights; profile both on the target machine then. | Revisit in milestone 4 |
| Audio direction | Section 13 | Milestone 4 |
| Loading time target | Under 10 s | Milestone 1 |

## 20. Process rules

- **Approval gate for feel changes.** Any change to physics, controls or game feel is prepared and shown, with the diff and a tuning table, but is **not committed** until the user approves it.
  - All feel constants live in `src/game/tuning.ts`.
  - A debug tuning panel exposes them live and exports the current values as a diff-ready snippet.
- **Playtest stop:** milestone 2 ends in a stop for a user playtest. No milestone 3 work starts until the user signs off.
- **No em dashes** anywhere: code, comments, UI copy, docs or commit messages. A lint script enforces this.
- **Reference project hygiene:** `reference/` is study material under a view-only license. Never copy code, shaders, assets or theme from it.
- **Performance:** every milestone reports GPU and CPU timings from the in-game overlay. Final numbers must come from the target machine.

**Changes from v1:**

- **New sections:**
  - Player experience statements.
  - Conventions (axes, units, directions, time, RNG).
  - Game flow and UI.
  - Audio.
  - Accessibility and comfort, including the lightning flash-rate limit and "Reduce flashing".
  - Testing decisions.
  - Out of scope.
  - An open-questions register.
  - Appendix A (tunables).
- **Ocean and physics:**
  - Resolution-independent spectrum seeding, so CPU physics matches the GPU sea.
  - The CPU query covers the two largest cascades, with time-keyed snapshots for determinism and inverse displacement.
  - Sail cloth and visual ropes are visual only, and never feed back into physics.
  - Attachments reference articulated nodes, so braced yards carry the sailor.
  - Concrete thresholds for capsize, dismast, overboard, grounding and win.
- **Rendering and performance:**
  - WebGPU portability rules for Safari.
  - An explicit degradation ladder with the ocean protected.
- **Captures:**
  - A 1536x1024 capture viewport.
  - The `__flash` reference suffix.
  - An SSIM regression threshold.
  - A bookmark table with camera placements.

## 21. Repository layout

```
src/
  main.ts                 boot, WebGPU check, loop
  app/                    fixed-step clock, URL params, shot mode, quality selection, settings
  render/                 renderer, post graph, presets, weather uniforms, profiler overlay
  sky/                    clouds, lightning, atmosphere and fog
  ocean/                  spectrum, FFT compute, clipmap mesh, material, foam, CPU query worker
  fx/                     compute particles: rain, spindrift, spray, deck water
  ship/                   rigid body, buoyancy, hydrodynamics, sails, rigging graph, helm
  player/                 traversal FSM and states, ship-frame integrator, camera, input, animator
  game/                   acts, tasks, checkpoints, overboard, ending, tuning.ts
  ui/                     HUD, menus, unsupported screen, photosensitivity notice
  shots.ts                capture bookmarks
tools/
  blender/                headless asset scripts, common.py, install.sh, run.sh, VERSION
  capture/                Playwright capture, contact sheet, baseline diff
tests/                    unit tests, GLB contract tests, visual baselines
public/assets/            generated GLB and textures only (no build inputs)
references/               final reference images, README, PROMPTS.md, candidates/
docs/                     SPEC, MILESTONES, REFERENCE_ARCHITECTURE, critiques/
```

## Appendix A: Starting tunables

All of these live in `src/game/tuning.ts` (feel) or `src/render/quality.ts` (visual budget). Values are starting points for playtests, not commitments. Changes to feel values follow the approval gate.

| Group | Key | Start |
|---|---|---|
| Sim | Physics rate | 120 Hz, max 4 steps per frame |
| Sim | Gravity | 9.81 m/s^2 |
| Ocean | Cascade patch sizes | 1024, 173, 31 m |
| Ocean | CPU query snapshot rate | 30 Hz |
| Ship | Buoyancy probes | 24 |
| Ship | Capsize | Heel > 70 degrees for 1.5 s |
| Ship | Dismast window, warning | 3 s, 60% of limit |
| Ship | Lash slip rate | 0.5 degrees per s toward wave yaw |
| Sailor | Walk, run on deck | 1.6, 4.5 m/s |
| Sailor | Climb speed on ratlines | 1.2 m/s |
| Sailor | Footrope shuffle | 0.8 m/s |
| Sailor | Slide max speed, brake decel | 9 m/s, 6 m/s^2 |
| Sailor | Jump up, run-jump forward | 4.2, 5.5 m/s |
| Sailor | Grab snap radius | 1.0 m |
| Sailor | Jump buffer, coyote time | 0.15, 0.12 s |
| Sailor | Brace threshold (ship accel at sailor) | 2.5 m/s^2 |
| Overboard | Trailing line length, swim time | 40 m, 20 s |
| Ending | Harbor gap width | 60 m |
| Lightning | Max full-screen flashes | 3 per s |
| Presets | Blend time | 2.5 s |
| Render | Min internal resolution | 65% |
| Render | Rain streaks by tier | 40k, 60k, 80k |
