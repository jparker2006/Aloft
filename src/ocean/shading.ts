// Sea surface shading (SPEC section 7). Radiance leaving the surface toward the camera, before fog:
//   reflection  Fresnel-weighted sky
//   glint       GGX key-light specular; roughness grows with wind and distance so mip-filtered normals
//               keep their energy instead of turning the far sea into a mirror
//   subsurface  light scattered through thin, backlit crests (the green glow in dusk__sea_low)
//   body        the water's own dim upwelling color under the ambient sky light
// Foam and lightning are layered on by the caller.
import * as THREE from 'three/webgpu';
import {
  abs,
  clamp,
  dot,
  float,
  fwidth,
  max,
  mix,
  mx_noise_float,
  normalize,
  pow,
  reflect,
  saturate,
  smoothstep,
  texture,
  vec2,
  vec3,
} from 'three/tsl';
import type { LookUniforms } from '../render/look';
import type { LightningUniforms } from '../fx/lightning';
import type { WeatherUniforms } from '../render/weather';

type F = THREE.Node<'float'>;
type V2 = THREE.Node<'vec2'>;
type V3 = THREE.Node<'vec3'>;

export interface SeaShadingInputs {
  /** World-space surface normal. */
  normal: V3;
  /** Unit vector from the surface toward the camera. */
  view: V3;
  /** Distance to the camera, m. */
  distance: F;
  /** Height of the displaced surface above mean sea level, m. */
  height: F;
  /** Undisplaced world XZ, for procedural detail. */
  gridXZ: V2;
  time: F;
}

/** GGX normal distribution. */
function ggxD(nDotH: F, alpha: F): F {
  const a2 = alpha.mul(alpha);
  const d = nDotH.mul(nDotH).mul(a2.sub(1)).add(1);
  return a2.div(d.mul(d).mul(Math.PI)) as F;
}

/** Rain ripples: a small, animated normal perturbation that fades with distance. */
export function rainRippleNormal(n: V3, xz: V2, time: F, rain: F, distance: F): V3 {
  const p = vec3(xz.x.mul(3.1), xz.y.mul(3.1), time.mul(2.3));
  const e = 0.05;
  const h0 = mx_noise_float(p);
  const hx = mx_noise_float(p.add(vec3(e, 0, 0)));
  const hz = mx_noise_float(p.add(vec3(0, e, 0)));
  const strength = rain.mul(0.18).mul(float(1).sub(smoothstep(8, 60, distance)));
  const grad = vec2(hx.sub(h0), hz.sub(h0)).div(e).mul(strength);
  return normalize(vec3(n.x.sub(grad.x), n.y, n.z.sub(grad.y))) as V3;
}

/** Returns a builder that emits the shading nodes inline (called once per material). */
export interface FlashLight {
  direction: V3;
  radiance: V3;
}

/** A lightning strike as a directional light at a surface point (null when lightning is disabled). */
export function flashLightAt(lightning: LightningUniforms | null, worldPos: V3): FlashLight | null {
  if (!lightning) return null;
  const toFlash = lightning.cloudPos.sub(worldPos);
  const d = toFlash.length();
  const falloff = float(1).div(float(1).add(d.div(5000).pow(2)));
  return {
    direction: toFlash.div(d) as V3,
    radiance: lightning.color.mul(lightning.flash.mul(falloff).mul(0.12)) as unknown as V3,
  };
}

export function makeSeaShading(look: LookUniforms, weather: WeatherUniforms, sky: (dir: V3) => V3) {
  return (inputs: SeaShadingInputs, flash: FlashLight | null = null): V3 => {
    const { view: v, distance, height } = inputs;
    const n = rainRippleNormal(inputs.normal, inputs.gridXZ, inputs.time, weather.rainRate, distance);
    const L = look.keyDirection;
    const keyRadiance = look.u.keyColor.mul(look.u.keyIntensity);

    const nDotV = max(dot(n, v), 0.001);
    const fresnel = float(0.02).add(float(0.98).mul(pow(float(1).sub(nDotV), 5)));

    // Reflection. Rays reflected below the horizon (back-facing micro slopes) are folded up.
    const r = reflect(v.negate(), n) as V3;
    const rUp = vec3(r.x, abs(r.y).max(0.002), r.z);
    const reflection = sky(rUp);

    // Glint: GGX with roughness from wind, widened with distance to stand in for filtered-out slopes.
    const windRough = float(0.035).add(weather.windSpeed.mul(0.0016));
    // Kept narrow: facing a low sun, a wide lobe turns the whole sea into warm sheen instead of a path.
    const alpha = clamp(windRough.add(distance.mul(0.000015)), 0.03, 0.2);
    const h = normalize(L.add(v));
    const nDotL = max(dot(n, L), 0);
    const nDotH = max(dot(n, h), 0);
    const vDotH = max(dot(v, h), 0);
    const fh = float(0.02).add(float(0.98).mul(pow(float(1).sub(vDotH), 5)));
    const visibility = float(0.25).div(max(nDotL.mul(nDotV), 0.02));
    const glint = keyRadiance.mul(ggxD(nDotH, alpha).mul(fh).mul(visibility).mul(nDotL));

    // Subsurface: strongest looking toward the light through the thin top of a raised crest. Water
    // lower on the face is metres thick and stays dark, so the crest curve is deliberately steep.
    const towardLight = pow(saturate(dot(v.negate(), L)), 6);
    const backFacing = pow(saturate(float(0.5).sub(dot(L, n).mul(0.5))), 2);
    const crest = pow(saturate(height.div(weather.hs.mul(0.75).max(0.5))), 2.2);
    const sssDirect = keyRadiance.mul(crest.mul(towardLight).mul(backFacing).mul(3.0));
    const subsurface = look.u.waterScatter
      .mul(sssDirect.add(look.u.ambient.mul(crest.mul(0.8).add(0.03))))
      .mul(look.u.subsurface);

    // Body: dim upwelling light.
    const body = look.u.waterDeep.mul(look.u.ambient.mul(2.2).add(keyRadiance.mul(saturate(L.y).mul(0.15))));

    let color = mix(body.add(subsurface), reflection, fresnel).add(glint) as unknown as V3;
    if (flash) {
      // The flash as a second, broad key light: glint and a little light scattered up out of the water.
      const hf = normalize(flash.direction.add(v));
      const nDotLf = max(dot(n, flash.direction), 0);
      const flashGlint = flash.radiance.mul(
        ggxD(max(dot(n, hf), 0), alpha.add(0.03))
          .mul(fresnel.max(0.02))
          .mul(float(0.25).div(max(nDotLf.mul(nDotV), 0.02)))
          .mul(nDotLf),
      );
      const flashBody = look.u.waterScatter.mul(flash.radiance).mul(crest.mul(0.6).add(0.03));
      color = color.add(flashGlint).add(flashBody.mul(float(1).sub(fresnel))) as unknown as V3;
    }
    return color;
  };
}

export interface FoamInputs {
  /** Accumulated foam amount (x) and fresh injection (y), summed over cascades. */
  amount: THREE.Node<'vec2'>;
  gridXZ: V2;
  normal: V3;
  view: V3;
}

/**
 * Foam coverage in [0, 1] from the accumulated amount and the Blender-baked foam texture:
 *   R lace, G fine bubbles, B wind streaks, A breakup (see tools/blender/foam_texture.py).
 * Texture space is rotated so +U runs downwind, which lays streaks along the wind.
 */
export function makeFoamCoverage(foamTexture: THREE.Texture, weather: WeatherUniforms) {
  return (inputs: FoamInputs): F => {
    const wind = weather.windDir;
    const along = dot(inputs.gridXZ, wind);
    const across = dot(inputs.gridXZ, vec2(wind.y.negate(), wind.x));
    const uvAt = (tileAlong: number, tileAcross: number) =>
      vec2(along.div(tileAlong), across.div(tileAcross));
    // Lace cells are stretched downwind, as wind-dragged foam marbles into streaks.
    const lace = texture(foamTexture, uvAt(3.6, 1.7)).r;
    const laceBroad = texture(foamTexture, uvAt(10, 5.2)).r;
    const bubbles = texture(foamTexture, uvAt(0.9, 0.9)).g;
    const streak = texture(foamTexture, uvAt(38, 24)).b;
    const breakup = texture(foamTexture, uvAt(70, 70)).a;

    // Foam dissolves rather than being drawn: the lace acts as a threshold field (bubble walls high,
    // cell centres low) and the foam amount decides how much of it passes. Fresh foam covers everything;
    // ageing foam opens holes at the cell centres and ends as a thin irregular net, then nothing.
    // Where one texel spans many pixels, each octave fades to its own mean (measured from the baked
    // texture) at its own distance, so far whitecaps keep the broad lace and breakup instead of going flat.
    const texel = fwidth(along);
    const fadeAt = (tile: number) => smoothstep(0.08, 0.45, texel.div(tile));
    const fade = fadeAt(1.7);
    const fieldSafe = mix(lace, float(0.338), fade)
      .mul(0.38)
      .add(mix(laceBroad, float(0.338), fadeAt(5.2)).mul(0.3))
      .add(breakup.mul(0.17))
      .add(mix(bubbles, float(0.084), fadeAt(0.9)).mul(0.15));
    const softness = float(0.26).add(fade.mul(0.2));

    const f = inputs.amount.x;
    const fresh = inputs.amount.y;
    // Aged foam is patchy: the breakup field opens wide gaps in it; fresh whitewater stays solid.
    const agedPatches = smoothstep(0.3, 0.75, breakup).mul(1.1).add(0.15);
    const amount = f.mul(1.35).mul(agedPatches).add(fresh.mul(1.0));
    const threshold = float(1).sub(amount);
    const dissolved = smoothstep(threshold, threshold.add(softness), fieldSafe);
    const bubblesSafe = mix(bubbles, float(0.084), smoothstep(0.02, 0.1, texel.div(1.7)));
    const streaky = smoothstep(0.08, 0.45, f)
      .mul(smoothstep(0.5, 0.95, streak))
      .mul(breakup)
      .mul(0.16);
    // Aged foam is a thin film the water shows through; only fresh whitewater is opaque.
    const opacity = mix(float(0.45), float(1), saturate(fresh.mul(2)));
    const coverage = max(dissolved.mul(bubblesSafe.mul(0.15).add(0.9)).mul(opacity), streaky);
    return saturate(coverage) as unknown as F;
  };
}

/** Radiance of lit foam: a bright, rough, slightly translucent layer. */
export function foamRadiance(look: LookUniforms, normal: V3, view: V3, flash: FlashLight | null = null): V3 {
  const L = look.keyDirection;
  const keyRadiance = look.u.keyColor.mul(look.u.keyIntensity);
  // Lambert without wrap: a sun 2.5 degrees up lights only the faces turned toward it, as in the
  // references, where whitecaps glow on sun-facing slopes and stay grey elsewhere.
  const diffuse = saturate(dot(normal, L));
  const backlight = pow(saturate(dot(view.negate(), L)), 6).mul(0.06);
  const albedo = float(0.82).mul(look.u.foamBrightness);
  let light = look.u.ambient.mul(2.4).add(keyRadiance.mul(diffuse.mul(0.9).add(backlight))) as unknown as V3;
  if (flash)
    light = light.add(flash.radiance.mul(saturate(dot(normal, flash.direction)).mul(0.5).add(0.2))) as V3;
  return light.mul(albedo) as unknown as V3;
}
