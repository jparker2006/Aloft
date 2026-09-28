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
  smoothstep,
  texture3D,
  uniform,
  vec3,
  vec4,
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
const VOLUME_MAX_DISTANCE = 12000;
/** Extinction of a rain curtain relative to the ambient haze. */
const CURTAIN_DENSITY = 7;

export class Atmosphere {
  /** Extinction at sea level per metre, set from the weather each frame. */
  readonly density = uniform(0.0008);
  readonly cameraPos = uniform(new THREE.Vector3());

  constructor(
    private readonly look: LookUniforms,
    private readonly weather: WeatherUniforms,
    private readonly lightning: LightningUniforms | null,
  ) {}

  update(cameraPosition: THREE.Vector3): void {
    this.cameraPos.value.copy(cameraPosition);
    const visibility = Math.max(this.weather.visibility.value, 200);
    const rain = this.weather.rainRate.value;
    // Koschmieder, then extra extinction from rain; the look's fog density scales the whole thing.
    this.density.value =
      (3.912 / visibility) * (1 + rain * 0.6) * (this.look.u.fogDensity.value / 0.00018) * 0.35;
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
    // Forward-scattering lobe toward the key light (the glow around a low sun through haze). Under the
    // deck the key only reaches haze that lies under the gap: far away and low on the horizon, so the
    // lobe is confined to low rays and scaled by the gap's strength.
    const g = 0.8;
    const hg = float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(cosTheta.mul(2 * g)), 1.5));
    const lowRay = smoothstep(0.14, 0.0, dir.y.abs());
    const underDeck = mix(float(0.004), float(0.06), this.look.u.cloudGapStrength).mul(lowRay);
    const key = this.look.u.keyColor.mul(this.look.u.keyIntensity).mul(hg.mul(underDeck));
    let color = this.look.u.fogColor.mul(this.look.u.ambient.mul(5).add(0.008)).add(key) as unknown as V3;
    if (this.lightning) {
      const toFlash = normalize(this.lightning.cloudPos.sub(this.cameraPos));
      const lobe = pow(saturate(dir.dot(toFlash)), 8)
        .mul(0.1)
        .add(0.004);
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
   * Half-res raymarch through rain curtains: columns of heavier rain hanging from the deck, drifting with
   * the wind, with fine vertical striations. They are lit by the key light where it enters under the deck
   * (strong forward scatter, so shafts glow when backlit against the dusk gap) and by the lightning
   * strike as a point source. Returns in-scattered radiance (rgb) and the curtains' own transmittance (a),
   * on top of the analytic fog. `shape` and `detail` are the clouds' noise volumes.
   */
  volumetric(
    cameraPos: V3,
    dir: V3,
    sceneDistance: F,
    shape: THREE.Storage3DTexture,
    detail: THREE.Storage3DTexture,
    frame: FrameUniforms,
    jitter: F,
  ): THREE.Node<'vec4'> {
    const lightning = this.lightning;
    const L = this.look.keyDirection;
    return Fn(() => {
      const radiance = vec3(0, 0, 0).toVar();
      const transmittance = float(1).toVar();
      const end = min(sceneDistance, VOLUME_MAX_DISTANCE);
      const cosKey = dir.dot(L);
      const g = 0.75;
      const phaseKey = float((1 - g * g) / (4 * Math.PI)).div(
        pow(float(1 + g * g).sub(cosKey.mul(2 * g)), 1.5),
      );
      // Under the deck the key reaches the rain only through the gap, as for the fog.
      const keyLight = this.look.u.keyColor
        .mul(this.look.u.keyIntensity)
        .mul(mix(float(0.002), float(0.03), this.look.u.cloudGapStrength))
        .mul(smoothstep(0.2, 0.0, dir.y.abs()));
      const ambient = this.look.u.fogColor.mul(this.look.u.ambient.mul(5).add(0.008));
      Loop(VOLUME_STEPS, ({ i }: { i: THREE.Node<'int'> }) => {
        // Exponentially spaced samples: dense near the camera, sparse far away.
        const a = float(i).add(jitter).div(VOLUME_STEPS);
        const b = float(i).add(1).add(jitter).div(VOLUME_STEPS);
        const t0 = pow(a, 2).mul(end);
        const t1 = pow(b, 2).mul(end);
        const dt = t1.sub(t0);
        const p = cameraPos.add(dir.mul(t0));
        const drift = this.weather.windDir.mul(frame.time.mul(12));
        // Curtains: tall columns from the cloud noise at a large scale, striated by the detail noise.
        const q = vec3(p.x.sub(drift.x).div(2600), p.y.div(9000), p.z.sub(drift.y).div(2600));
        const n = texture3D(shape, q).level(float(0)).r;
        const sq = vec3(p.x.sub(drift.x).div(160), p.y.div(4000), p.z.sub(drift.y).div(160));
        const striations = texture3D(detail, sq).level(float(0)).g;
        const column = saturate(n.sub(0.34).mul(3)).mul(striations.mul(0.75).add(0.25));
        // Rain fills the air from the sea to the cloud base.
        const underBase = float(1).sub(
          smoothstep(this.weather.cloudBase.mul(0.7), this.weather.cloudBase, p.y),
        );
        const sigma = this.density.mul(column.mul(this.weather.rainRate).mul(underBase)).mul(CURTAIN_DENSITY);
        let light = ambient.add(keyLight.mul(phaseKey)) as unknown as V3;
        if (lightning) {
          const d = p.sub(lightning.cloudPos).length();
          const flash = lightning.color
            .mul(lightning.flash)
            .mul(float(1).div(float(1).add(d.div(1400).pow(2))))
            .mul(0.6);
          light = light.add(flash) as V3;
        }
        const stepT = exp(sigma.mul(dt).negate());
        radiance.addAssign(light.mul(float(1).sub(stepT)).mul(transmittance));
        transmittance.mulAssign(stepT);
      });
      return vec4(radiance, transmittance);
    })() as unknown as THREE.Node<'vec4'>;
  }
}
