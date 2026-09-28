// Analytic sky radiance for a view direction, shared by the sky background and ocean reflections so the
// horizon never seams. Replaced by the volumetric cloud sky (step 6); the ocean keeps using this for the
// far reflection until the sky cube lands.
import { Fn, dot, exp, float, max, mix, pow, saturate, smoothstep } from 'three/tsl';
import type * as THREE from 'three/webgpu';
import type { LookUniforms } from '../render/look';

type V3 = THREE.Node<'vec3'>;

export function makeSkyRadiance(look: LookUniforms) {
  return Fn(([dirIn]: [V3]) => {
    const dir = dirIn.normalize();
    const up = max(dir.y, 0);
    // Only the horizon toward the key light glows; the rest of the rim is rain haze under the deck.
    const flat = dir.xz.div(max(dir.xz.length(), 1e-4));
    const keyFlat = look.keyDirection.xz.div(max(look.keyDirection.xz.length(), 1e-4));
    const sunward = pow(dot(flat, keyFlat).mul(0.5).add(0.5), 3);
    const horizon = mix(look.u.skyHorizonAway, look.u.skyHorizon, sunward);
    // The horizon color lives in a band about 12 degrees deep; above it (seen only through holes in the
    // deck) the sky is the dark zenith, never the sunset.
    const base = mix(horizon, look.u.skyZenith, pow(saturate(up.div(0.22)), 0.5));
    // Warm glow around the key light near the horizon.
    const cosSun = max(dot(dir, look.keyDirection), 0);
    const glow = look.u.keyColor
      .mul(look.u.keyIntensity)
      .mul(pow(cosSun, 12).mul(0.35).add(pow(cosSun, 180).mul(1.2)));
    const horizonBand = exp(up.mul(-9)).mul(smoothstep(-0.2, 0.02, dir.y));
    const disc = smoothstep(float(0.99995), float(0.999985), cosSun).mul(look.u.keyDiscIntensity);
    // Below the horizon the sky is never seen directly, but reflections of it must stay dark and neutral.
    const below = smoothstep(0.0, -0.08, dir.y);
    const radiance = base.add(glow.mul(horizonBand)).add(look.u.keyColor.mul(disc));
    return mix(radiance, horizon.mul(0.6), below) as unknown as V3;
  });
}
