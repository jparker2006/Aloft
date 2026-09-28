// Foam accumulation (SPEC section 7). Per cascade, a ping-pong rgba16float texture holds foam amount in .x:
//   foam = max(previous * decay^dt, injection)
// where injection grows as the cascade's Jacobian drops below a wind-scaled threshold (the surface
// folding over at a crest). Foam stays where it formed while the crest moves on, which leaves the streaks
// and patches behind breaking waves. Mipmaps are generated so the far sea averages instead of shimmering.
import * as THREE from 'three/webgpu';
import {
  Fn,
  exp,
  instanceIndex,
  ivec2,
  int,
  max,
  saturate,
  textureLoad,
  textureStore,
  uniform,
  uvec2,
  vec4,
} from 'three/tsl';
import type { CascadeGpu } from './fft';

export class FoamAccumulator {
  readonly textures: [THREE.StorageTexture, THREE.StorageTexture];
  /** Seconds of simulation to integrate this dispatch. */
  readonly dt = uniform(0);
  /** Jacobian below which foam starts to form. */
  readonly threshold = uniform(0.6);
  /** Foam injected per unit of Jacobian below the threshold. */
  readonly gain = uniform(2.6);
  /** Foam half-life in seconds. */
  readonly halfLife = uniform(3.5);
  private readonly passes: [THREE.ComputeNode, THREE.ComputeNode];
  private current = 0;

  constructor(readonly cascade: CascadeGpu) {
    const N = cascade.size;
    const make = () => {
      const t = new THREE.StorageTexture(N, N);
      t.type = THREE.HalfFloatType;
      t.format = THREE.RGBAFormat;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      return t;
    };
    this.textures = [make(), make()];
    const build = (read: THREE.StorageTexture, write: THREE.StorageTexture) =>
      Fn(() => {
        const i = instanceIndex.mod(N);
        const j = instanceIndex.div(N);
        const coord = ivec2(int(i), int(j));
        const previous = textureLoad(read, coord).x;
        const jacobian = textureLoad(cascade.displacement, coord).w;
        const injection = saturate(this.threshold.sub(jacobian).mul(this.gain));
        const decay = exp(this.dt.mul(-Math.LN2).div(this.halfLife));
        const foam = max(previous.mul(decay), injection);
        textureStore(write, uvec2(i, j), vec4(foam, injection, 0, 1)).toWriteOnly();
      })().compute(N * N, [64]);
    this.passes = [build(this.textures[0], this.textures[1]), build(this.textures[1], this.textures[0])];
  }

  /** The texture holding the latest foam. */
  get texture(): THREE.StorageTexture {
    return this.textures[this.current];
  }

  /** Integrates `dt` seconds. The cascade must already be updated for the current time. */
  step(renderer: THREE.WebGPURenderer, dt: number): void {
    if (dt <= 0) return;
    this.dt.value = dt;
    renderer.compute(this.passes[this.current]);
    this.current = 1 - this.current;
  }

  /**
   * Configures thresholds from the wind: stronger wind breaks more crests and keeps foam longer. At a
   * gale (about 25 m/s) roughly a third of the sea should be whitewater or streaks, as in the references.
   */
  setWind(windSpeed: number): void {
    const t = Math.min(Math.max((windSpeed - 12) / 20, 0), 1);
    this.threshold.value = 0.64 + 0.3 * t;
    this.halfLife.value = 3 + 4.5 * t;
  }
}
