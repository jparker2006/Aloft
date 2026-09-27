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
export function makeSeaShading(look: LookUniforms, weather: WeatherUniforms, sky: (dir: V3) => V3) {
  return (inputs: SeaShadingInputs): V3 => {
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
    const alpha = clamp(windRough.add(distance.mul(0.00004)), 0.03, 0.35);
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

    return mix(body.add(subsurface), reflection, fresnel).add(glint) as unknown as V3;
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
    const lace = texture(foamTexture, uvAt(7, 7)).r;
    const bubbles = texture(foamTexture, uvAt(1.8, 1.8)).g;
    const streak = texture(foamTexture, uvAt(46, 14)).b;
    const breakup = texture(foamTexture, uvAt(95, 95)).a;

    // Fade texture detail to its average where it would alias (one texel covering many pixels).
    const footprint = fwidth(along).div(7);
    const laceSafe = mix(lace, float(0.28), smoothstep(0.08, 0.4, footprint));
    const bubblesSafe = mix(bubbles, float(0.06), smoothstep(0.02, 0.1, footprint));

    const f = inputs.amount.x;
    const fresh = inputs.amount.y;
    const dense = smoothstep(0.5, 0.95, f.add(fresh.mul(0.5)));
    const lacy = smoothstep(0.12, 0.55, f.mul(breakup.mul(0.9).add(0.55))).mul(laceSafe);
    const streaky = smoothstep(0.03, 0.35, f).mul(streak).mul(breakup.mul(0.6).add(0.4));
    const coverage = max(dense.mul(bubblesSafe.mul(0.25).add(0.8)), max(lacy, streaky.mul(0.75)));
    return saturate(coverage) as unknown as F;
  };
}

/** Radiance of lit foam: a bright, rough, slightly translucent layer. */
export function foamRadiance(look: LookUniforms, normal: V3, view: V3): V3 {
  const L = look.keyDirection;
  const keyRadiance = look.u.keyColor.mul(look.u.keyIntensity);
  const diffuse = saturate(dot(normal, L).mul(0.6).add(0.4));
  const backlight = pow(saturate(dot(view.negate(), L)), 6).mul(0.35);
  const albedo = float(0.82).mul(look.u.foamBrightness);
  return look.u.ambient
    .mul(2.4)
    .add(keyRadiance.mul(diffuse.mul(0.32).add(backlight)))
    .mul(albedo) as unknown as V3;
}
