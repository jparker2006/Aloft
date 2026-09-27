// Weather state (SPEC section 6): the storm, independent of the lighting preset.
// The act script (milestone 5) drives it; captures pin a named state. Every system reads the shared
// TSL uniforms; the ocean additionally listens for spectrum rebuilds, which it cross-fades over 4 s.

import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { WeatherName } from '../shots';
import { bearingToDir } from '../app/world';

export interface WeatherState {
  /** Mean wind speed at 10 m, m/s. */
  windSpeed: number;
  /** Bearing the wind blows from, degrees. */
  windFrom: number;
  /** Gust strength as a fraction of mean wind. */
  gustAmplitude: number;
  /** Typical time between gust peaks, s. */
  gustPeriod: number;
  /** Significant wave height of the wind sea, m. */
  hs: number;
  /** Peak period of the wind sea, s. */
  peakPeriod: number;
  /** Directional spreading exponent of the wind sea (cos^2s); higher is more aligned. */
  spreading: number;
  swellHs: number;
  swellPeriod: number;
  /** Bearing the swell comes from, degrees. */
  swellFrom: number;
  swellSpreading: number;
  /** Horizontal displacement scale; 1 is physically nominal, higher sharpens crests. */
  choppiness: number;
  /** 0 dry to 1 torrential. */
  rainRate: number;
  /** Strikes per minute. */
  lightningRate: number;
  lightningMinDistance: number;
  lightningMaxDistance: number;
  /** Cloud base height, m. */
  cloudBase: number;
  /** Meteorological visibility, m. */
  visibility: number;
}

export type WeatherKey = keyof WeatherState;

/**
 * Waves run toward the hero bearing, so the wind blows from the opposite side.
 * Peak periods describe a young, steep storm sea (Hs / peak wavelength near 0.05), not a fully developed
 * one: the long, gentle swell of a fully developed sea reads as calm water from deck height.
 */
const WIND_FROM = 100;

export const WEATHER: Readonly<Record<WeatherName, WeatherState>> = {
  rising: {
    windSpeed: 17,
    windFrom: WIND_FROM,
    gustAmplitude: 0.25,
    gustPeriod: 14,
    hs: 4,
    peakPeriod: 7.5,
    spreading: 6,
    swellHs: 1.6,
    swellPeriod: 12,
    swellFrom: WIND_FROM + 25,
    swellSpreading: 24,
    choppiness: 1.0,
    rainRate: 0.3,
    lightningRate: 0.3,
    lightningMinDistance: 8000,
    lightningMaxDistance: 20000,
    cloudBase: 700,
    visibility: 9000,
  },
  gale: {
    windSpeed: 24,
    windFrom: WIND_FROM,
    gustAmplitude: 0.3,
    gustPeriod: 12,
    hs: 7,
    peakPeriod: 9.5,
    spreading: 8,
    swellHs: 2.5,
    swellPeriod: 14,
    swellFrom: WIND_FROM + 25,
    swellSpreading: 24,
    choppiness: 1.15,
    rainRate: 0.8,
    lightningRate: 2,
    lightningMinDistance: 3000,
    lightningMaxDistance: 12000,
    cloudBase: 500,
    visibility: 5000,
  },
  worst: {
    windSpeed: 30,
    windFrom: WIND_FROM,
    gustAmplitude: 0.35,
    gustPeriod: 10,
    hs: 10,
    peakPeriod: 11.5,
    spreading: 10,
    swellHs: 3.5,
    swellPeriod: 15,
    swellFrom: WIND_FROM + 25,
    swellSpreading: 24,
    choppiness: 1.25,
    rainRate: 1,
    lightningRate: 4,
    lightningMinDistance: 1000,
    lightningMaxDistance: 6000,
    cloudBase: 350,
    visibility: 2500,
  },
  light: {
    windSpeed: 22,
    windFrom: WIND_FROM,
    gustAmplitude: 0.25,
    gustPeriod: 14,
    hs: 6,
    peakPeriod: 9,
    spreading: 7,
    swellHs: 2.5,
    swellPeriod: 14,
    swellFrom: WIND_FROM + 25,
    swellSpreading: 24,
    choppiness: 1.1,
    rainRate: 0.6,
    lightningRate: 1,
    lightningMinDistance: 5000,
    lightningMaxDistance: 15000,
    cloudBase: 550,
    visibility: 7000,
  },
};

const ANGLE_KEYS: ReadonlySet<WeatherKey> = new Set(['windFrom', 'swellFrom']);

export function lerpWeather(a: WeatherState, b: WeatherState, t: number): WeatherState {
  const out = {} as Record<WeatherKey, number>;
  for (const key of Object.keys(a) as WeatherKey[]) {
    const d = ANGLE_KEYS.has(key) ? ((((b[key] - a[key]) % 360) + 540) % 360) - 180 : b[key] - a[key];
    out[key] = a[key] + d * t;
  }
  return out;
}

/** Spectrum-affecting keys and how much each may drift before the ocean rebuilds its spectrum. */
export const SPECTRUM_REBUILD_THRESHOLDS: Readonly<Partial<Record<WeatherKey, number>>> = {
  hs: 0.15,
  peakPeriod: 0.3,
  windSpeed: 0.75,
  windFrom: 3,
  spreading: 0.5,
  swellHs: 0.15,
  swellPeriod: 0.3,
  swellFrom: 3,
  swellSpreading: 2,
};

export function spectrumNeedsRebuild(built: WeatherState, current: WeatherState): boolean {
  for (const [key, threshold] of Object.entries(SPECTRUM_REBUILD_THRESHOLDS) as [WeatherKey, number][]) {
    const d = ANGLE_KEYS.has(key)
      ? Math.abs(((((current[key] - built[key]) % 360) + 540) % 360) - 180)
      : Math.abs(current[key] - built[key]);
    if (d > threshold) return true;
  }
  return false;
}

/** Shared TSL uniforms for the weather, in forms shaders use directly. */
export class WeatherUniforms {
  readonly windSpeed = uniform(0);
  /** Unit vector the wind blows toward, world XZ. */
  readonly windDir = uniform(new THREE.Vector2(0, 1));
  readonly gust = uniform(0);
  readonly choppiness = uniform(1);
  readonly rainRate = uniform(0);
  readonly cloudBase = uniform(500);
  readonly visibility = uniform(5000);
  readonly hs = uniform(1);

  apply(w: WeatherState, gust = 0): void {
    this.windSpeed.value = w.windSpeed * (1 + gust);
    const toward = bearingToDir(w.windFrom + 180);
    this.windDir.value.set(toward.x, toward.z);
    this.gust.value = gust;
    this.choppiness.value = w.choppiness;
    this.rainRate.value = w.rainRate;
    this.cloudBase.value = w.cloudBase;
    this.visibility.value = w.visibility;
    this.hs.value = w.hs;
  }
}

export type SpectrumListener = (state: WeatherState, instant: boolean) => void;

/**
 * Blends the weather toward a target over a duration and tells the ocean when the spectrum must be
 * rebuilt. Runs in the fixed step, so it is deterministic.
 */
export class WeatherController {
  readonly name = 'weather';
  readonly uniforms = new WeatherUniforms();
  private current: WeatherState;
  private from: WeatherState;
  private to: WeatherState;
  private blendT = 1;
  private blendSeconds = 1;
  private built: WeatherState;
  private readonly listeners: SpectrumListener[] = [];

  constructor(initial: WeatherState) {
    this.current = initial;
    this.from = initial;
    this.to = initial;
    this.built = initial;
    this.uniforms.apply(initial);
  }

  get state(): WeatherState {
    return this.current;
  }

  onSpectrumRebuild(listener: SpectrumListener): void {
    this.listeners.push(listener);
    listener(this.built, true);
  }

  /** Moves toward a new state over `seconds`, or snaps with an instant spectrum rebuild. */
  setTarget(state: WeatherState, seconds = 0): void {
    if (seconds <= 0) {
      this.current = this.from = this.to = this.built = state;
      this.blendT = 1;
      this.uniforms.apply(state);
      for (const l of this.listeners) l(state, true);
      return;
    }
    this.from = this.current;
    this.to = state;
    this.blendT = 0;
    this.blendSeconds = seconds;
  }

  step(dt: number, simTime: number): void {
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendSeconds);
      this.current = lerpWeather(this.from, this.to, this.blendT);
      if (spectrumNeedsRebuild(this.built, this.current)) {
        this.built = this.current;
        for (const l of this.listeners) l(this.built, false);
      }
    }
    this.uniforms.apply(this.current, this.gustAt(simTime));
  }

  /** Smooth, deterministic gust factor from two incommensurate sines. */
  gustAt(simTime: number): number {
    const w = this.current;
    const p = (2 * Math.PI) / w.gustPeriod;
    const g = 0.6 * Math.sin(simTime * p) + 0.4 * Math.sin(simTime * p * 2.37 + 1.3);
    return w.gustAmplitude * Math.max(0, g);
  }
}
