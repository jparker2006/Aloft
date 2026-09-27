// Ocean system: three FFT cascades, spectrum rebuilds from the weather, and the TSL functions surfaces
// use to displace and shade the sea.
import * as THREE from 'three/webgpu';
import { float, smoothstep, texture, vec3, vec4 } from 'three/tsl';
import type { App, FrameInfo } from '../app/app';
import type { WeatherController, WeatherState } from '../render/weather';
import { CascadeGpu } from './fft';
import { FoamAccumulator } from './foam';
import { buildInitialSpectrum, cascadeBands, spectrumParamsFromWeather, type CascadeBand } from './spectrum';

type F = THREE.Node<'float'>;
type V2 = THREE.Node<'vec2'>;
type V3 = THREE.Node<'vec3'>;

export const CASCADE_SIZE = 256;
/** Seconds to cross-fade from the previous spectrum after a rebuild. */
export const SPECTRUM_CROSSFADE_SECONDS = 4;

/** Camera distances over which each cascade's displacement fades out, meters (near, far). */
const DISPLACEMENT_FADE: readonly [number, number][] = [
  [3000, 6000],
  [900, 2500],
  [120, 400],
];
/** Distances over which each cascade's normal detail fades out (mipmaps handle the rest). */
const NORMAL_FADE: readonly [number, number][] = [
  [8000, 16000],
  [3000, 8000],
  [600, 2000],
];

export class Ocean {
  readonly name = 'ocean';
  readonly bands: CascadeBand[] = cascadeBands();
  readonly cascades: CascadeGpu[];
  /** Foam accumulates on the two largest cascades, where waves actually break. */
  readonly foam: FoamAccumulator[];
  private readonly foamNodes: { node: THREE.TextureNode; accumulator: FoamAccumulator }[] = [];
  private readonly weather: WeatherController;
  private readonly app: App;

  constructor(app: App, weather: WeatherController) {
    this.app = app;
    this.weather = weather;
    this.cascades = this.bands.map((b) => new CascadeGpu({ size: CASCADE_SIZE, patchSize: b.patchSize }));
    this.foam = this.cascades.slice(0, 2).map((c) => new FoamAccumulator(c));
    weather.onSpectrumRebuild((state, instant) => this.rebuild(state, instant));
  }

  private rebuild(state: WeatherState, instant: boolean): void {
    const params = spectrumParamsFromWeather(state);
    this.bands.forEach((band, i) => {
      this.cascades[i]!.setSpectrum(
        buildInitialSpectrum(params, band, CASCADE_SIZE, this.app.params.seed),
        instant,
      );
    });
  }

  /** Quality ladder's last resort: update the finest cascade every other frame. */
  fineCascadeEveryOtherFrame = false;

  update(frame: FrameInfo): void {
    const choppiness = this.weather.state.choppiness;
    const step = frame.realDt / SPECTRUM_CROSSFADE_SECONDS;
    this.cascades.forEach((c, i) => {
      const skip = this.fineCascadeEveryOtherFrame && i === this.cascades.length - 1 && frame.frame % 2 === 1;
      if (!skip) c.update(this.app.renderer, frame.time, choppiness, step);
    });
    this.stepFoam(frame.realDt);
  }

  private stepFoam(dt: number): void {
    if (dt <= 0) return;
    for (const f of this.foam) {
      f.setWind(this.weather.state.windSpeed);
      f.step(this.app.renderer, Math.min(dt, 0.25));
    }
    for (const { node, accumulator } of this.foamNodes) node.value = accumulator.texture;
  }

  /**
   * Builds foam history for a still capture: runs the large cascades and the foam integration over the
   * `seconds` before the current time, then restores the current time.
   */
  prewarm(seconds: number, time: number, onStep?: (t: number, dt: number) => void): void {
    const dt = 0.4;
    const choppiness = this.weather.state.choppiness;
    for (let t = time - seconds; t < time; t += dt) {
      for (let i = 0; i < this.foam.length; i++) this.cascades[i]!.update(this.app.renderer, t, choppiness);
      this.stepFoam(dt);
      onStep?.(t, dt);
    }
    for (const c of this.cascades) c.update(this.app.renderer, time, choppiness);
  }

  /**
   * Height and Jacobian of the displaced surface at undisplaced world XZ, sampled at mip 0 so it works in
   * compute and vertex stages. Height uses every cascade; the Jacobian the two that break.
   */
  surfaceLevel0(xz: V2): { height: F; jacobian: F } {
    let height: F = float(0);
    let jacobian: F = float(1);
    this.cascades.forEach((c, i) => {
      const d = texture(c.displacement, this.uvFor(i, xz)).level(float(0));
      height = height.add(d.y) as F;
      if (i < 2) jacobian = jacobian.add(d.w.sub(1)) as F;
    });
    return { height, jacobian };
  }

  /** Accumulated foam (x) and fresh injection (y) at undisplaced world XZ, summed over cascades. */
  foamAmount(xz: V2): THREE.Node<'vec2'> {
    let sum = vec4(0, 0, 0, 0).xy as THREE.Node<'vec2'>;
    this.foam.forEach((f, i) => {
      const node = texture(f.texture, this.uvFor(i, xz));
      this.foamNodes.push({ node, accumulator: f });
      sum = sum.add(node.xy) as THREE.Node<'vec2'>;
    });
    return sum;
  }

  private uvFor(i: number, xz: V2): V2 {
    const c = this.cascades[i]!;
    return xz.div(c.patchSize).add(0.5 / c.size);
  }

  /** Summed displacement at undisplaced world XZ, faded by camera distance. Vertex stage. */
  displacement(xz: V2, distance: F): V3 {
    let sum: V3 = vec3(0, 0, 0);
    this.cascades.forEach((c, i) => {
      const [near, far] = DISPLACEMENT_FADE[i]!;
      const fade = float(1).sub(smoothstep(near, far, distance));
      sum = sum.add(texture(c.displacement, this.uvFor(i, xz)).level(float(0)).xyz.mul(fade)) as V3;
    });
    return sum;
  }

  /**
   * Surface slope terms at undisplaced world XZ: (dY/dX, dY/dZ, dDx/dX, dDz/dZ) summed over cascades.
   * Fragment stage (mipmapped).
   */
  slopes(xz: V2, distance: F): THREE.Node<'vec4'> {
    let sum = vec4(0, 0, 0, 0) as THREE.Node<'vec4'>;
    this.cascades.forEach((c, i) => {
      const [near, far] = NORMAL_FADE[i]!;
      const fade = float(1).sub(smoothstep(near, far, distance));
      sum = sum.add(texture(c.slopes, this.uvFor(i, xz)).mul(fade)) as THREE.Node<'vec4'>;
    });
    return sum;
  }

  /** World-space normal of the displaced surface from summed slopes. */
  normalFromSlopes(s: THREE.Node<'vec4'>): V3 {
    const sx = s.x.div(s.z.add(1).max(0.2));
    const sz = s.y.div(s.w.add(1).max(0.2));
    return vec3(sx.negate(), 1, sz.negate()).normalize() as V3;
  }

  /** Jacobian of the summed displacement, for foam; fragment stage. */
  jacobianAt(xz: V2): F {
    let j: F = float(1);
    this.cascades.forEach((c, i) => {
      j = j.add(texture(c.displacement, this.uvFor(i, xz)).w.sub(1)) as F;
    });
    return j;
  }
}
