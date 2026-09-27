// Atmosphere (SPEC section 7, step 9).
//
// Two parts:
//   Analytic height fog, full resolution and nearly free: exponential density falling off with height,
//   integrated in closed form along each view ray. Density comes from the weather's visibility (Koschmieder:
//   extinction = 3.912 / visibility) plus rain. In-scatter is the look's fog color lit by the ambient sky,
//   a forward-scattering lobe toward the key light, and the lightning flash.
//
//   Volumetric in-scatter from local lights, half resolution: a short raymarch through rain curtains
//   (fog density modulated by a drifting noise field) lit by the lightning strike as a point source. This
//   is what makes the rain shafts light up around a strike.
//
// Decision (SPEC section 19): the half-res raymarch is used for local lights in milestone 1, where
// lightning is the only one. A froxel grid pays off with several local lights (lantern, lighthouse beam,
// lightning) and is to be profiled against the raymarch on the target machine in milestone 4 or 5.
import * as THREE from 'three/webgpu';
import {
  Fn,
  Loop,
  exp,
  float,
  min,
  mix,
  normalize,
  pow,
  saturate,
  texture3D,
  uniform,
  vec3,
} from 'three/tsl';
import type { LightningUniforms } from '../fx/lightning';
import type { LookUniforms } from './look';
import type { WeatherUniforms } from './weather';
import type { FrameUniforms } from './frameUniforms';

type F = THREE.Node<'float'>;
type V3 = THREE.Node<'vec3'>;

/** Farthest distance fog is integrated to (the sky counts as this far away). */
export const FOG_MAX_DISTANCE = 30000;
const VOLUME_STEPS = 12;
const VOLUME_MAX_DISTANCE = 9000;

export class Atmosphere {
  /** Extinction at sea level per metre, set from the weather each frame. */
  readonly density = uniform(0.0008);

  constructor(
    private readonly look: LookUniforms,
    private readonly weather: WeatherUniforms,
    private readonly lightning: LightningUniforms | null,
  ) {}

  update(): void {
    const visibility = Math.max(this.weather.visibility.value, 200);
    const rain = this.weather.rainRate.value;
    // Koschmieder, then extra extinction from rain; the look's fog density scales the whole thing.
    this.density.value =
      (3.912 / visibility) * (1 + rain * 0.6) * (this.look.u.fogDensity.value / 0.00018) * 0.55;
  }

  /** Optical depth from the camera along a ray of length `distance` in direction `dir`. */
  opticalDepth(cameraY: F, dir: V3, distance: F): F {
    const falloff = this.look.u.fogHeightFalloff;
    const densityAtCamera = this.density.mul(exp(cameraY.mul(falloff).negate()));
    const k = dir.y.mul(falloff);
    // Integral of exp(-k t) from 0 to d, with the k -> 0 limit (horizontal rays) handled.
    const steep = k.abs().greaterThan(1e-5);
    const kSafe = steep.select(k, float(1e-5));
    const integral = steep.select(
      float(1)
        .sub(exp(kSafe.mul(distance).negate()))
        .div(kSafe),
      distance,
    );
    return densityAtCamera.mul(integral) as F;
  }

  /** Color scattered toward the camera by the fog along a ray (before transmittance weighting). */
  inScatter(dir: V3): V3 {
    const L = this.look.keyDirection;
    const cosTheta = dir.dot(L);
    // Forward-scattering lobe toward the key light (the glow around a low sun through haze).
    const g = 0.72;
    const hg = float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(cosTheta.mul(2 * g)), 1.5));
    const key = this.look.u.keyColor.mul(this.look.u.keyIntensity).mul(hg.mul(0.9));
    let color = this.look.u.fogColor.mul(this.look.u.ambient.mul(9).add(0.02)).add(key) as unknown as V3;
    if (this.lightning) {
      const toFlash = normalize(this.lightning.cloudPos);
      const lobe = pow(saturate(dir.dot(toFlash)), 3)
        .mul(0.8)
        .add(0.12);
      color = color.add(this.lightning.color.mul(this.lightning.flash.mul(lobe))) as V3;
    }
    return color;
  }

  /** Applies fog to a radiance seen at `distance` along `dir`. */
  apply(color: V3, cameraY: F, dir: V3, distance: F): V3 {
    const transmittance = exp(this.opticalDepth(cameraY, dir, min(distance, FOG_MAX_DISTANCE)).negate());
    return mix(this.inScatter(dir), color, transmittance) as V3;
  }

  /**
   * Half-res raymarch of light scattered by rain curtains from the lightning strike. Returns radiance
   * to add (rgb) and nothing else. `noise` is the clouds' 3D shape volume.
   */
  volumetric(
    cameraPos: V3,
    dir: V3,
    sceneDistance: F,
    noise: THREE.Storage3DTexture,
    frame: FrameUniforms,
    jitter: F,
  ): V3 {
    if (!this.lightning) return vec3(0, 0, 0) as V3;
    const lightning = this.lightning;
    return Fn(() => {
      const radiance = vec3(0, 0, 0).toVar();
      const end = min(sceneDistance, VOLUME_MAX_DISTANCE);
      Loop(VOLUME_STEPS, ({ i }: { i: THREE.Node<'int'> }) => {
        // Exponentially spaced samples: dense near the camera, sparse far away.
        const a = float(i).add(jitter).div(VOLUME_STEPS);
        const b = float(i).add(1).add(jitter).div(VOLUME_STEPS);
        const t0 = pow(a, 2).mul(end);
        const t1 = pow(b, 2).mul(end);
        const p = cameraPos.add(dir.mul(t0));
        // Rain curtains: tall shafts drifting with the wind, from the cloud noise at a large scale.
        const q = vec3(
          p.x.sub(this.weather.windDir.x.mul(frame.time.mul(12))).div(2600),
          p.y.div(9000),
          p.z.sub(this.weather.windDir.y.mul(frame.time.mul(12))).div(2600),
        );
        const n = texture3D(noise, q).level(float(0)).r;
        const curtain = saturate(n.sub(0.35).mul(2.2)).mul(this.weather.rainRate);
        const sigma = this.density
          .mul(exp(p.y.mul(this.look.u.fogHeightFalloff).negate()))
          .mul(curtain.mul(3).add(0.3));
        const d = p.sub(lightning.cloudPos).length();
        const light = lightning.color
          .mul(lightning.flash)
          .mul(float(1).div(float(1).add(d.div(1400).pow(2))))
          .mul(18);
        radiance.addAssign(
          light
            .mul(sigma)
            .mul(t1.sub(t0))
            .mul(1 / (4 * Math.PI)),
        );
      });
      return radiance;
    })() as unknown as V3;
  }
}
