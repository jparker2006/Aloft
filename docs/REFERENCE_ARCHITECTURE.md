# Reference Architecture Study

This is a study of `reference/spiderbench` (cloned from github.com/xikhar/spiderbench, single commit `9c22368`). It is a browser web-swinging game: three.js r186 on WebGL2, a procedural city, Blender-built assets and generated textures. Aloft's genre, setting and renderer differ. This document records how the reference solves problems that Aloft also has, so our spec can reuse the ideas and skip the mistakes.

**Ground rules**

- The reference is under a view-only license that forbids reuse in any other game. Nothing here is code from it. Techniques are described in our own words, and citations exist so a reader can verify a claim. `reference/` is gitignored and must never be committed. Aloft must not copy its code, shaders, assets, UI, fonts or visual theme.
- Citations are `path:line` relative to `reference/spiderbench/`.
- The reference is WebGL2 and GLSL. Aloft is WebGPURenderer plus TSL. Section 9 lists what translates and what does not.

## 1. At a glance

| Concern | Reference (spiderbench) | Consequence for Aloft |
|---|---|---|
| Backend | `WebGLRenderer`, reversed depth, GLSL3 `ShaderMaterial` passes | Everything must be rebuilt as TSL nodes and compute |
| Post stack | 16 custom fullscreen passes plus n8ao; the `postprocessing` dependency is never imported | Port the ideas onto three's `PostProcessing` node graph with MRT |
| Lighting looks | 7 fixed presets plus 2 sun variants, resolved from elevation keyframes, blended over 2.5 s | Same pattern, with storm and lightning parameters added |
| Assets | GLB from Blender 5.2 exporter, scripts not published | Commit rerunnable scripts plus a GLB contract test |
| Traversal | Mode and sub-state strings, 120 Hz substeps, one-sided rope constraint | Transfers, but must run in the ship's non-inertial frame |
| Large world | 256 m tiles, instanced pools, dithered LOD, staggered cascades | Ocean clipmaps, cascaded FFT and compute particles replace most city tactics |

## 2. Renderer setup

- **Construction.** `WebGLRenderer` with antialias off (TAA replaces MSAA), high-performance power preference, no stencil and a reversed depth buffer (`src/main.js:26`). The camera is 55 degree FOV, near 0.1 m, far 150 km. Reversed float depth keeps precision to the fogged horizon without a logarithmic depth buffer (`src/main.js:48`).
- **Pixel ratio.** Capped at `min(devicePixelRatio, 1.5)` (`src/main.js:27`), times a user render-scale setting from 0.6 to 1.25 (`src/ui/menus/settings.js:23`). There is no dynamic resolution.
- **Color.** Renderer tone mapping is off and output is sRGB. Tone mapping, grading and the sRGB encode all happen in the final post pass (`src/main.js:31-32`, `src/render/pipeline.js:997-1075`).
- **Targets.** Every render target defaults to RGBA HalfFloat, no mipmaps (`src/render/common.js:34-49`). The scene target carries a float depth texture. There is **no MRT**: normals are reconstructed from depth (`src/render/pipeline.js:155-160`), and SSR reflectivity is smuggled through scene alpha (`src/render/surface.js:266-280`).
- **Shadows.** Custom cascaded shadow maps built from one DirectionalLight per cascade. Only the first carries light; the rest just own shadow maps (`src/render/csm.js:184-196`). Details are in section 8.
- **Material patching.** Global `ShaderChunk` rewrites inject wetness, puddles, SSR weight and graded ambient into every standard material (`src/render/surface.js:121-345`). A helper chains `onBeforeCompile` hooks and builds a combined program cache key (`src/render/materials.js:38-56`).
- **Warmup.** Before the first frame every program is queued with `renderer.compile()`, and the driver links them in parallel. After that a trickle compiles at most 4 new programs within 2 ms per frame (`src/render/warmup.js:1-54`, `src/main.js:67-72`). Without this, first sight of a material froze the game for 0.2 to 6 s.
- **Profiler.** `?prof=1` enables GPU timer queries per pass, polled asynchronously and averaged (`src/render/profiler.js:1-50`). There is no on-screen overlay.
- **Frame loop.** Variable dt clamped to 1/20 s with a global time scale for hit-stop. The order is player, world, lighting, HUD, systems, render (`src/main.js:95-99`).

## 3. Post-processing pass order and settings

Order as executed in `src/render/pipeline.js:1148-1474`. "Half" means half-resolution.

| # | Pass | Technique | Key settings |
|---|---|---|---|
| 1 | Glass mirror | Player and nearby peds re-rendered mirrored across the nearest facade, oblique near plane | Half res; SSR tiers only (`src/render/glassmirror.js:95-142`) |
| 2 | Scene | HDR scene with TAA jitter, Halton(2,3), 16 samples | Shadow maps render inside this call (`:1173-1179`) |
| 3 | Character mask | Depth-only re-render of the player so TAA can reproject with the player's own motion | `:1192-1211` |
| 4 | Sky and clouds | Raymarched cloud layer, IGN jitter, resolved by TAA | Half res; 10, 16 or 22 steps by tier (`src/render/sky.js:413-469`) |
| 5 | Sun visibility | 9x9 depth and cloud taps around the sun into a 1x1 target, drives the lens flare | `:408-426` |
| 6 | SSR | Screen march with 1/z interpolation, binary refine, hits read *previous TAA history*. Output is a delta over the env map, times confidence | Half res, one of 4 pixels per frame; 20 or 28 steps, 5 refine, 220 m max, firefly clamp 3x env (`:121-224`) |
| 7 | SSGI | Cosine rays against depth; radiance from the previous frame's bloom mip; output is an irradiance *ratio* because there is no albedo buffer | Half res, rotating 2x2; 4x4 or 6x4 directions x steps; radius `clamp(0.06 d, 4, 40)` m; cap 1.6; strength 0.5 (`:298-405`) |
| 8 | Sun shafts | Raymarch through the cascaded shadow maps, height-falloff fog, dual Henyey-Greenstein | Half res; 12 or 16 steps to 180 m; g = 0.62 and -0.2 (`:228-289`) |
| 9 | AO | n8ao (WebGL-only library) | Radius 3, intensity 3.4, falloff 0.9; full res high, half res med, off low (`:91-111`) |
| 10 | Composite | Sky and sun or moon discs, `color *= 1 + SSGI`, SSR delta, cloud shadows (0.4), analytic exponential height fog with sky in-scatter, depth-aware upsample of half-res inputs | Fog falloff 1/300 m, start 35 m, converges to sky 9 to 45 km (`:429-594`) |
| 11 | TAA | Catmull-Rom history, closest-depth reprojection, YCoCg variance clip in a compressed domain | Blend 0.08 rising to 0.25 with motion; gamma 1.9 static down to 0.9 fast; history reset on a 60 m or 0.6 rad cut (`:597-686`, `:1165`) |
| 12 | DoF | CoC prefilter, golden-angle gather, tent, combine | Only when aperture > 0.01; 16, 22 or 43 taps; max CoC 14 px (`:689-775`) |
| 13 | Motion blur | Camera-only, from depth plus previous view-projection | 6, 8 or 10 samples; length cap 0.1 x width; near-field mask; normalized to a 60 fps shutter (`:778-818`) |
| 14 | Bloom | 13-tap downsample with Karis average on mip 0, tent upsample, **threshold applied during upsample** so the down chain stays usable as plain radiance for exposure and SSGI | Threshold 0.9, knee 0.7, input clamp 48, 5 or 6 mips, additive 0.11 (`:821-861`) |
| 15 | Auto exposure | 32-bin log2 histogram over -12 to +4 EV from a bloom mip, mean of the 40th to 60th percentile, applied as a *partial* correction | Key -2.05, strength 0.42, clamp +/-1.25 EV, rate `1 - exp(-1.95 dt)` (`:868-898`) |
| 16 | Final | Adaptive luma sharpen, edge chromatic aberration, bloom add, lens flare, exposure and white balance, vignette, ACES fitted with a soft toe, split toning, rain streaks, lift/gamma/gain, saturation, chroma soft clip, log contrast, highlight shoulder, manual sRGB encode, grain plus dither | CA 0.0009, vignette 0.28, toe 0.34, saturation 1.14, contrast 1.18 at pivot 0.18, shoulder 0.62, grain 0.012 (`:901-1080`) |

**Quality tiers** come only from `?q=low|med|high` (`src/render/quality.js:34-49`). There is no GPU detection or frame-time adaptation. Per-field overrides use `?qset=k:v`, and `?nossr`-style flags toggle single passes for A/B checks.

| Setting | low | med | high |
|---|---|---|---|
| Cascades and map size | 2 x 1024 | 3 x 2048 | 5 x 2048 |
| AO | off | half res | full res |
| Cloud steps | 10 | 16 | 22 |
| SSR, shafts, SSGI | off | 20 / 12 / 4x4 | 28 / 16 / 6x4 |
| DoF taps, blur samples | 16, 6 | 22, 8 | 43, 10 |

**Ideas worth keeping.**

- Checkerboarded half-res SSR and SSGI integrated by TAA.
- SSR stored as a delta over the IBL so misses fall back cleanly.
- Bloom thresholded at upsample so its mip chain doubles as scene radiance.
- Histogram-percentile exposure applied as a partial correction.
- A character mask for TAA.
- One graded final pass that owns tone mapping.

## 4. Time-of-day preset system

- **Definition.** Presets are `{elevation, azimuth, look}` objects: day, morning, sunrise, sunset, dusk, night, overcast, plus two day-sun variants (`src/render/lighting.js:81-100`). There is **no running clock**; time of day is a fixed choice.
- **Resolution.** `resolvePreset` merges three layers (`src/render/lighting.js:56-79`, `:300-306`):
  - Derived defaults, for example window emissive as a smoothstep of sun elevation.
  - A look interpolated from six keyframes keyed on sun elevation (-14, -4.5, 3, 10, 24, 45 degrees).
  - The preset's own overrides.
- **Look keys** are one flat numeric dictionary:
  - Light: sun gain and warmth, diffuse and specular IBL gain, ambient saturation, exposure.
  - Atmosphere: fog density multiplier and tint, Mie haze, cloud coverage, an overcast deck flag, horizon glow.
  - Bounce: fake bounce and vertical fill.
  - Weather and night: window emissive, wetness, rain, flare gate, moon direction.
- **Application.** One `applyTod` fans the resolved look out to (`src/render/lighting.js:147-214`):
  - Sky uniforms and a re-rendered sky LUT.
  - The key light. It switches to the moon once the sun is down; its color comes from CPU-side transmittance (`src/render/atmosphere.js:50-66`).
  - Cascade refit, only on a real direction change.
  - The post pipeline's fog, exposure, bloom and rain values.
  - A global uniform struct read by the injected shader chunks.
  - Emissive scaling, found by traversing the scene.
- **Transitions.** A smoothstep lerp of every numeric key over 2.5 s, with shortest-arc azimuth. The environment cube is re-baked one face per frame during the blend, followed by a PMREM pass (`src/render/lighting.js:309-340`).
- **Sky.** Custom single scattering (Rayleigh, Mie, ozone) with an approximate multi-scatter term, raymarched into a 256x128 sky-view LUT. Clouds are a Nubis-style layer from a baked 128^3 Perlin-Worley volume, plus cirrus (`src/render/sky.js:13-341`). The sky, fog, IBL cube and water all sample the same LUT function, so horizons never seam. The cloud offset is static: clouds do not move (`src/render/sky.js:367`).
- **Weather.**
  - "Rain" is only the overcast preset: wet albedo and roughness, puddle ripples and screen-space streaks after tone mapping (`src/render/surface.js:48-116`, `src/render/pipeline.js:1038-1050`).
  - There are no rain particles, wind or lightning.
  - Night multiplies exposure by up to 4.5 and bloom by 2.6.
- **Deterministic shots.** `?shot=name&tod=preset` poses the player and camera from `src/shots.js`, pins lighting and disables systems and warmup. It then runs a fixed number of 1/60 s frames so TAA and shadows settle, and sets `window.__shotReady` (`src/main.js:78-91`). The external capture script it expects (`tools/shot.mjs`) is not in the repo. `?cam=x,y,z,tx,ty,tz` forces a camera (`src/world/city.js:195-227`).

**Takeaways for Aloft.**

- Keep "flat look dictionary plus one resolve plus one apply" and URL-pinned shots. Commit the capture script, which the reference failed to do.
- Add what a storm needs:
  - Animated clouds and wind.
  - Particle rain.
  - Lightning as a transient additive term, not a PMREM re-bake.
  - Preset-driven sea state.
  - Exposure that does not pump on flashes.

## 5. How Blender Python scripts generate and export assets

The runtime refers to `tools/blender/city_props.py`, `city_vehicles.py`, `city_npc.py`, `city_textures.py`, `city_props_leaves.py` and `enemy_tex.py` (for example `src/world/props.js:645`, `src/world/npc/crowd.js:1`), but **none of these scripts are in the published repo**. The contract below was reconstructed from the loaders and from the GLB files themselves.

- **Exporter.** All four GLBs report `Khronos glTF Blender I/O v5.2.40`.
  - No Draco, meshopt, KTX2, morph targets or `extras`.
  - Every node has identity transforms, so transforms and modifiers were applied before export.
  - Indices are uint16.
- **Names are the API.**
  - Object name equals glTF node name equals runtime key: `sedan`, `sedan_l1`, `sedan_l2` for LODs (`src/world/vehicles.js:185-217`), and prop keys like `hvac` and `dumpster`.
  - The character material must be named `SpiderSuit` (`src/player/suitfabric.js:43`).
  - Bones are resolved by regex over `.L/.R` names (`src/player/rig.js:26-49`).
- **Packed attributes instead of materials.**
  - Props and vehicles export with no materials. COLOR_0 holds linear albedo, or Cycles-baked AO in the red channel for vehicles.
  - A second UV layer stores an integer part ID in U. At load it becomes an `aPart` attribute that picks roughness, metalness and emission from one shared material (`src/world/props.js:650-663`, `src/world/partmat.js:6-63`).
- **Characters.**
  - One 58-joint armature in T-pose, feet at y=0, facing +Z.
  - Tangents exported; 4096 WebP textures embedded via `EXT_texture_webp`.
  - 79 Actions exported as named clips with every bone sampled on every channel. Root motion is kept in place because the runtime locks hip drift (`src/player/anim/clips.js:21-35`).
  - A second character shares the skeleton's bone names, so it retargets the hero's clips purely by name (`src/game/systems/crimeactors.js:22-30`).
- **Custom binaries.** The crowd is not glTF.
  - A script writes a JSON manifest of byte offsets plus a flat `.bin`: positions, normals, region IDs, AO, 4 bone indices and weights, UVs and indices, 4-byte aligned.
  - It also writes pre-baked 3x4 skinning matrices per frame, uploaded as a float texture for GPU skinning (`src/world/npc/crowd.js:472-485`, `:685-712`).
- **Fallbacks.** Most loaders degrade instead of crashing:
  - The character falls back to a capsule figure.
  - Vehicles fall back to procedural low-poly models.
  - Props are skipped with a console warning that names the script to rerun (`src/world/props.js:670`).
  - City textures have no fallback and reject the whole world build.
- **Drift nobody caught.** In `props.glb` the part IDs landed in TEXCOORD_0 while the loader reads TEXCOORD_1, so every prop silently renders as part 0. The Blender UV-layer order evidently flipped and no test checked the contract.

**Takeaways for Aloft.**

- Commit every script under `tools/blender`. Make each one rerunnable as `blender -b -P tools/blender/<asset>.py -- --out public/assets/<asset>.glb`.
- Add a Node-side GLB contract test that asserts:
  - node names and pivots
  - attribute semantics per slot
  - clip names
  - bounds
  - the generator string
- Keep rigged ship parts (yards, sails, blocks) as separate nodes with meaningful pivots so the runtime can brace yards and reef sails without a skin.

## 6. How generated textures are integrated

- **Color space by role.** Color maps are `SRGBColorSpace`; normal, height, AO and roughness maps are `NoColorSpace`. Mipmaps are trilinear with anisotropy up to 16 (`src/world/textures.js:2-31`).
- **Strips become array textures.** Generated tile sets ship as vertical strips of square tiles (for example walls color 1024x16384, 16 layers). At load they are sliced into a `DataArrayTexture` through a canvas, with a manual Y flip (`src/world/textures.js:36-67`). One `sampler2DArray` then feeds every facade (`src/world/facade.js:181-230`).
- **Metric UVs.** Facades and ground sample in world or wall meters divided by a per-layer tile size, not authored UVs.
  - Ground uses two rotated taps to hide repetition (`src/world/ground.js:39-47`).
  - Height in a packed map drives parallax.
- **Detail normals** are blended in tangent space and faded by `fwidth` to avoid moire (`src/player/suitfabric.js:66-121`). An alternative derivative-TBN helper exists (`src/render/materials.js:81-106`).
- **Channel packing.** Leaf cards use RGBA for value, hue selector, depth and coverage (`src/world/trees.js:121`). Height, AO and weathering share one map.
- **Atlases.**
  - Decals and ads are grid atlases; the rectangle JSON uses `{name: [u0, v0, du, dv]}` (`src/world/ground.js:438-458`).
  - Screens and ad signs share one GPU copy of the ad atlas (`src/world/adstex.js:5-10`).
- **Runtime-generated textures.** About 20 `CanvasTexture` and `DataTexture` uses handle procedural content.
- **Loading.** No KTX2 or Basis compression and no streaming. The only resilience is image-load retry with backoff (`src/world/textures.js:9-20`).
- **Waste.** Several large build inputs ship in `public/` unused at runtime, for example an 18.6 MB `suit_normal.png`.

**Takeaways for Aloft.**

- Adopt the explicit per-role color space rule.
- Use array textures for tiling wood, canvas, rope and iron, with metric UVs on the hull.
- Fade detail normals with `fwidth`.
- Keep build inputs out of `public/`.
- Evaluate KTX2 for VRAM.

## 7. Physics and animation state machine

- **Loop.** Traversal substeps at about 120 Hz by slicing the variable frame dt into equal parts (`n = ceil(dt * 120)`, `src/player/traversal/traversal.js:1980`). Button edges are consumed after the first substep. Rope springs, dynamic collision, a push-out safety net, orientation and the animation write run once per frame after the substeps (`:1993-2029`).
- **States.** Two strings, `mode` (ground, air, swing, wall, zip, perch, rope) and `sub`, dispatched by an if-chain. A separate scripted-motion slot `kin` plays Bezier or ballistic moves such as vault, ledge, wall hop and zip (`:2`, `:132-140`, `:1309-1385`).
  - `setMode` and `setSub` reset timers.
  - One-frame `events[]` feed camera and audio.
  - An asserted invariant: a swing only ends on button release or an explicit override (`:128-136`).
- **Per-state tuning.**
  - Ground: walk, run and sprint are 2.6, 9.8 and 15.5 m/s. Acceleration is 24 to 30 m/s^2. Turn rate is speed-dependent, with a skid turn (`:20`, `:205-215`).
  - Air: gravity 24 m/s^2, scaled by 0.55 near the apex for hang time. Air control fades in over 0.35 to 0.9 s after a release (`:19`, `:421-463`).
  - Landing grades (light, medium, roll, hard) come from impact speed and drop height, with input lock of up to 0.42 s (`:582-601`).
- **Rope physics.**
  - Integration is explicit Euler plus a **one-sided distance constraint**. When beyond rope length, the body is projected back onto the sphere and only the outward radial velocity is removed, so the rope can go slack (`:841-849`).
  - Slack is detected from `v_t^2 / L - g * u_y < 0`, and a "snap" event fires when the rope goes taut again (`:853-859`).
  - The physics pivot is separate from the drawn anchor so arcs stay playable (`:686-715`).
  - Energy is injected by an elevation-capped pump and a first-arc minimum speed (`:797-825`).
  - Release adds tuned boosts (`:997-1012`).
- **Anchors.** Candidate points on building faces come from a 24 m spatial hash. They are scored, and the top 7 are confirmed by raycast and an arc-clearance test (`src/player/traversal/anchors.js:37-161`).
- **Collision.**
  - The world is a static uniform 24 m grid of boxes, cylinders, ramps and height fields with 2D DDA ray marching (`src/world/collision.js:5-218`, `:354-397`).
  - The player is a vertical capsule, 0.36 m radius and 1.8 m tall. Push-out is horizontal only; vertical support is floor snapping.
  - Moving cars contribute a translation-only velocity while grounded (`src/player/traversal/traversal.js:225`, `:1837-1850`).
- **Animation.** A hybrid of Blender clips and procedural layers.
  - Traversal writes a plain `anim` struct every frame (mode, sub, timers, velocity, swing phase, tension) (`src/player/traversal/anim.js:65-116`). The animator mirrors it; it does not own state.
  - A selector maps mode and sub to a node, and the target pushes a new layer that crossfades in using a per-transition table. At most 6 layers, with the oldest collapsed into a frozen pose (`src/player/anim/animator.js:28-214`).
  - Post layers add:
    - Hand IK onto the rope.
    - Spring-driven limb reaction to acceleration.
    - Distributed look-at.
    - Foot IK with pelvis drop and surface-aligned feet.
    - Wall-plane penetration fixes.
    - A NaN guard (`:707-1256`).
  - Locomotion warps stride to ground speed to kill foot sliding (`:1299-1335`).
- **Camera.**
  - Critically damped springs throughout. Speed-based FOV from 58 to 71, plus kicks. Roll from yaw rate.
  - Probe-ray collision with fast pull-in and slow ease-out. Trauma-squared shake (`src/player/camera.js:17-270`).
  - A `jumpOff` spring absorbs body position steps that velocity does not explain (`:120-130`); this is ideal for deck jolts.
- **Input.** Taps are latched until the next poll so short presses are never lost (`src/player/input.js:23-111`). There is a 0.22 s jump buffer and 0.12 s coyote time. Standard gamepad mapping uses a 0.15 rescaled deadzone.

**What breaks on a pitching ship.** The reference has no moving reference frame.

- Anchors, perch points, zip targets and scripted-move endpoints are world-space (`src/player/traversal/traversal.js:84-98`).
- Collision is built once in world space.
- World up is hard-coded, and the moving platform model is translation-only.
- The world updates *after* the player, which would give a one-frame lag.

For Aloft:

- Store every attachment as `(body, localPoint)`.
- Build ship collision in ship-local space.
- Advance the ship first.
- Simulate the sailor in ship-local coordinates with fictitious forces: `a_local = R^T g - A0 - alpha x r - omega x (omega x r) - 2 omega x v_local`.
  - At a 30 m masthead with 15 degree roll over a 10 s period, these terms reach several m/s^2. This is the feel we want, not a bug to hide.
  - The rope constraint then works unchanged in the local frame.
  - Convert to world velocity once, on going overboard.
- Use a fixed-step accumulator, not variable slices, so the deck and rope constraint stay deterministic.

## 8. Performance tactics for a large world

- **Batching.**
  - The city is cut into 256 m tiles, each with a full facade, bare-mass LOD and detail builder (`src/world/buildings.js:15`, `:47`). Far tiles merge 2x2 into super-tiles drawn by index sub-range (`src/world/tilebatch.js:1-99`).
  - BatchedMesh was tried and rejected because of ANGLE multi-draw stalls (`src/world/tilebatch.js:7-8`).
  - Everything repeated is an InstancedMesh: props, trees, cars in 3 tiers, pedestrians in 3 LODs.
  - Empty pools are hidden so they cost nothing in any cascade (`src/world/pool.js:154`).
- **LOD without popping.**
  - Each instance carries `(in0, in1, out0, out1)` fade distances. The shader dithers complementary thresholds that TAA resolves (`src/world/pool.js:8-63`). Every switch has hysteresis, for example 650 m in and 690 m out for facades (`src/world/city.js:257-258`).
  - Props get auto-generated box LODs (`src/world/props.js:605-608`).
- **Detail in shaders.**
  - Windows, interiors, storefronts and blinds are procedural fragment work, box-filtered so sub-pixel grids converge to their average instead of shimmering (`src/world/facade.js:296-304`).
  - One material covers many parts through `aPart`.
  - Crowds are GPU-skinned from an animation texture; dogs, trees and flags animate in vertex shaders.
- **Culling.** Tile distance plus three's frustum culling. There is a view-wedge repack for pools and a CPU sphere test for cars. Fog plays the role of the far plane. There is no occlusion culling.
- **CPU.**
  - Per-system time budgets: prop repack 0.6 ms, trees 0.5 ms (`src/world/props.js:1593-1601`).
  - Distance-sliced update rates: crowd agents every 1, 2, 4 or 12 frames (`src/world/npc/crowd.js:1756-1759`).
  - Preallocated scratch math and typed arrays, and live-prefix buffer uploads (`src/world/pool.js:214-220`).
  - No workers.
- **Shadows.**
  - Cascade update periods are 1, 2, 4, 8 and 8 frames, staggered, with radius padding to hide staleness.
  - Far cascades draw only a big-caster layer; low-poly proxies stand in for detailed casters.
  - Cascades are fitted to a fixed wide FOV so FOV kicks do not refit them, with texel snapping (`src/render/csm.js:182-426`).
  - Instance shadow casting is limited to the nearest instances within 160 m (`src/world/pool.js:65-81`).
- **Hitches.**
  - Program warmup (section 2).
  - Pre-uploading vertex buffers for tiles about to swap, one per frame, frustum first (`src/world/tilebatch.js:101-123`).
  - Game systems loaded by dynamic `import()` after the world.
- **Measurement.**
  - GPU pass timers.
  - CPU per-system EMA (exponential moving average) timings behind a flag (`src/world/city.js:216-250`).
  - Many `?no*` switches for A/B tests.
- **Missing.** No dynamic resolution, no frame-time-driven quality and no GPU capability detection.

**What maps to an ocean storm.**

- Tile streaming, city LOD bands, crowd and traffic slicing and interior mapping do not apply.
- Their replacements:
  - Camera-centered geometry clipmaps for the ocean, snapped per ring, with morphing at seams.
  - Cascaded FFT in compute, time-sliced like the shadow cascades.
  - Jacobian foam accumulated in a ping-pong texture.
  - Compute-driven spray, rain and foam particles with indirect draws.
  - Instanced rope segments.
  - GPU cloth for sails at a fixed substep.
- Worth keeping:
  - The warmup discipline.
  - Dithered crossfades with hysteresis.
  - fwidth-aware procedural detail.
  - Staggered cascades.
  - Live-prefix uploads.
  - A URL-driven A/B flag habit.
- Add what the reference lacked: automatic dynamic resolution, and a profiler overlay.

## 9. Translation to WebGPURenderer and TSL

| Reference mechanism | Status in Aloft | Replacement |
|---|---|---|
| `ShaderChunk` rewrites, `onBeforeCompile` | Does not exist for node materials | NodeMaterial overrides (`colorNode`, `normalNode`, `roughnessNode`), shared `uniform()` nodes, custom lighting model if needed |
| Custom GLSL fullscreen passes | Rewrite | `PostProcessing` with `pass()` and MRT (color, normal, velocity, emissive or reflectivity); evaluate built-in TRAA, GTAO, bloom, SSR, DoF and motion blur nodes before writing our own |
| n8ao | WebGL-only | GTAO node or custom TSL |
| Hand-built CSM from DirectionalLights | Rewrite | `CSMShadowNode`, or a ship-focused custom shadow setup (the storm key light is weak and mostly the ship casts) |
| `renderer.compile()` warmup | Replace | `renderer.compileAsync(scene, camera)` for each pipeline variant |
| Timer queries | Replace | WebGPU timestamp queries (`trackTimestamp`) |
| GL state monkey-patches (polygon offset, uniform cache, shadow layers) | Not applicable | Recheck whether the WebGPU backend has the same polygon-offset and shadow-layer issues before assuming it does |
| CPU vertex displacement, CPU crowd sim | Replace | Compute shaders for FFT ocean, particles, cloth and rope |

## 10. Pitfalls observed in the reference

1. **Lens flare anchored at the corner.** The line that copies the sun's screen position into the final pass is inside a comment, so the flare is anchored at UV (0, 0) (`src/render/pipeline.js:1453`).
2. **Asset contract drift.** Prop part IDs are in the wrong UV slot and every prop renders as part 0 (section 5).
3. **Lost tooling.** Build and capture scripts referenced by code (`tools/blender/*`, `tools/shot.mjs`, `tools/perf_probe.mjs`) are not in the repo, so nobody can regenerate or re-verify anything.
4. **Silent config overrides and dead settings.**
   - The shadow type set in `src/main.js:30` is overridden in `src/render/lighting.js:112`.
   - `envSize` and `shadowFar` are never read.
5. **AO darkens direct sun.** AO multiplies the entire lit color, including direct sunlight.
6. **Global state.** It reaches through `window.__ctx`, and many systems read previous-frame buffers, which makes cuts and captures order-sensitive.
7. **Build inputs shipped to users.** Unused textures sit in `public/`.

## 11. Implications carried into the Aloft spec

These are defaults the interview can override.

- **Rendering and presets.**
  - One sky and atmosphere function shared by sky, fog, IBL and ocean.
  - Presets as flat look dictionaries with resolve and apply steps, plus storm keys (wind, sea state, rain, lightning rate, spray).
  - Transitions by lerp; lightning as a transient additive term.
- **Shots.** A deterministic shot mode (`?shot=&preset=`), a settle-frame count and a ready flag, driven by a committed Playwright script that loops bookmarks x presets.
- **Traversal.**
  - Mode and sub-state machine, with a scripted-motion slot for ladders, stays and yard leaps.
  - Everything simulated in the ship frame at a fixed step.
  - Attachments stored as body-local points.
- **Animation.** Traversal owns state; the animator mirrors a plain struct and adds procedural IK and spring layers over Blender-authored clips.
- **Assets.** Every asset from a committed, rerunnable headless Blender script, with a contract test in CI and loader fallbacks that name the script to rerun.
- **Performance.**
  - Ocean clipmaps plus cascaded FFT compute.
  - Compute particles, instanced rigging and GPU cloth.
  - Warmup with `compileAsync`.
  - Dynamic resolution and a GPU timing overlay from the first milestone.
