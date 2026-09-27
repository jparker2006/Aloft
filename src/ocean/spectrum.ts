// Ocean wave spectrum (SPEC section 7): JONSWAP wind sea plus a swell term, with directional spreading.
//
// Resolution-independent seeding: the random amplitude of each mode comes from a hash of its integer
// wave-vector index (n, m), the cascade and the run seed. A 32x32, 64x64 or 256x256 build of the same
// cascade therefore produces identical coefficients for every mode they share. This is what lets the
// CPU physics query (milestone 2) float the ship on exactly the waves the GPU draws.
//
// Pure TypeScript, no three.js, so it runs in tests, in a worker and on the main thread alike.

import { hashInts, unitFloat } from '../app/rng';

export const GRAVITY = 9.81;

export interface SeaState {
  hs: number;
  peakPeriod: number;
  /** Unit vector the waves travel toward, world XZ. */
  dirX: number;
  dirZ: number;
  /** cos^2s spreading exponent. */
  spreading: number;
}

export interface SpectrumParams {
  wind: SeaState;
  swell: SeaState;
  /** Wavelength below which amplitude is damped away, m (keeps the finest band free of aliasing). */
  minWavelength: number;
}

export interface CascadeBand {
  index: number;
  /** Side of the square patch the cascade tiles, m. */
  patchSize: number;
  /** Modes with |k| in [kLow, kHigh) belong to this cascade. */
  kLow: number;
  kHigh: number;
}

/** Patch sizes (SPEC appendix A) and the wavelengths at which one cascade hands over to the next. */
export const PATCH_SIZES = [1024, 173, 31] as const;
const HANDOVER_WAVELENGTHS = [32, 5.2] as const;

export function cascadeBands(): CascadeBand[] {
  const k = (wavelength: number) => (2 * Math.PI) / wavelength;
  return [
    { index: 0, patchSize: PATCH_SIZES[0], kLow: 0, kHigh: k(HANDOVER_WAVELENGTHS[0]) },
    {
      index: 1,
      patchSize: PATCH_SIZES[1],
      kLow: k(HANDOVER_WAVELENGTHS[0]),
      kHigh: k(HANDOVER_WAVELENGTHS[1]),
    },
    { index: 2, patchSize: PATCH_SIZES[2], kLow: k(HANDOVER_WAVELENGTHS[1]), kHigh: Infinity },
  ];
}

/** Deep-water dispersion. */
export function omegaOf(k: number): number {
  return Math.sqrt(GRAVITY * k);
}

const JONSWAP_GAMMA = 3.3;

/** Unnormalized JONSWAP shape (alpha = 1) at angular frequency omega. */
function jonswapShape(omega: number, omegaPeak: number): number {
  if (omega <= 0) return 0;
  const sigma = omega <= omegaPeak ? 0.07 : 0.09;
  const r = Math.exp(-((omega - omegaPeak) ** 2) / (2 * sigma * sigma * omegaPeak * omegaPeak));
  return ((GRAVITY * GRAVITY) / omega ** 5) * Math.exp(-1.25 * (omegaPeak / omega) ** 4) * JONSWAP_GAMMA ** r;
}

const alphaCache = new Map<number, number>();

/** Zeroth moment of the unit-alpha shape, by Simpson's rule; cached per peak frequency. */
function shapeMoment(omegaPeak: number): number {
  const cached = alphaCache.get(omegaPeak);
  if (cached !== undefined) return cached;
  const a = omegaPeak * 0.3;
  const b = omegaPeak * 12;
  const n = 4000;
  const h = (b - a) / n;
  let sum = jonswapShape(a, omegaPeak) + jonswapShape(b, omegaPeak);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * jonswapShape(a + i * h, omegaPeak);
  const m0 = (sum * h) / 3;
  alphaCache.set(omegaPeak, m0);
  return m0;
}

/** Frequency spectrum S(omega) scaled so that 4 * sqrt(m0) equals hs. */
export function frequencySpectrum(omega: number, hs: number, peakPeriod: number): number {
  if (hs <= 0) return 0;
  const omegaPeak = (2 * Math.PI) / peakPeriod;
  const targetM0 = (hs / 4) ** 2;
  return (targetM0 / shapeMoment(omegaPeak)) * jonswapShape(omega, omegaPeak);
}

const spreadingNormCache = new Map<number, number>();

/** Normalized cos^2s((theta)/2) spreading, integrating to 1 over [-pi, pi]. */
export function spreadingFunction(theta: number, s: number): number {
  let norm = spreadingNormCache.get(s);
  if (norm === undefined) {
    const n = 2048;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const t = -Math.PI + ((i + 0.5) * 2 * Math.PI) / n;
      sum += Math.abs(Math.cos(t / 2)) ** (2 * s);
    }
    norm = 1 / ((sum * 2 * Math.PI) / n);
    spreadingNormCache.set(s, norm);
  }
  return norm * Math.abs(Math.cos(theta / 2)) ** (2 * s);
}

/** Directional wavenumber spectrum S(kx, kz) of one sea state, per unit dkx dkz. */
function waveNumberSpectrum(kx: number, kz: number, sea: SeaState): number {
  const k = Math.hypot(kx, kz);
  if (k <= 0 || sea.hs <= 0) return 0;
  const omega = omegaOf(k);
  const theta = Math.atan2(kz, kx) - Math.atan2(sea.dirZ, sea.dirX);
  const dOmegaDk = GRAVITY / (2 * omega);
  return (
    (frequencySpectrum(omega, sea.hs, sea.peakPeriod) * spreadingFunction(theta, sea.spreading) * dOmegaDk) /
    k
  );
}

/** Standard normal pair from a mode's hash (Box-Muller on two derived uniforms). */
function gaussianPair(seed: number, cascade: number, n: number, m: number): [number, number] {
  const h1 = hashInts(seed, cascade, n, m, 1);
  const h2 = hashInts(seed, cascade, n, m, 2);
  const u = Math.max(unitFloat(h1), 1e-12);
  const v = unitFloat(h2);
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

/** Signed mode index stored at array index i (wrap-around layout, so no FFT shift is needed). */
export function modeIndex(i: number, size: number): number {
  return i < size / 2 ? i : i - size;
}

/**
 * Initial spectrum h0 for one cascade at a given resolution, as RGBA float texels:
 *   (Re h0(k), Im h0(k), Re conj(h0(-k)), Im conj(h0(-k)))
 * in wrap-around order (texel i holds mode n = i for i < N/2, else i - N).
 * The zero mode and Nyquist rows are zero, so every stored mode has its mirror partner.
 */
export function buildInitialSpectrum(
  params: SpectrumParams,
  band: CascadeBand,
  size: number,
  seed: number,
): Float32Array {
  const out = new Float32Array(size * size * 4);
  const dk = (2 * Math.PI) / band.patchSize;
  const kCut = (2 * Math.PI) / params.minWavelength;
  const amplitude = (n: number, m: number): [number, number] => {
    const kx = n * dk;
    const kz = m * dk;
    const k = Math.hypot(kx, kz);
    if (k < band.kLow || k >= band.kHigh || k === 0) return [0, 0];
    const s = waveNumberSpectrum(kx, kz, params.wind) + waveNumberSpectrum(kx, kz, params.swell);
    const damp = Math.exp(-((k / kCut) ** 2));
    const a = (Math.sqrt(s * dk * dk) / 2) * damp;
    const [xr, xi] = gaussianPair(seed, band.index, n, m);
    return [xr * a, xi * a];
  };
  const half = size / 2;
  for (let j = 0; j < size; j++) {
    const m = modeIndex(j, size);
    for (let i = 0; i < size; i++) {
      const n = modeIndex(i, size);
      if (n === -half || m === -half) continue;
      const [ar, ai] = amplitude(n, m);
      const [br, bi] = amplitude(-n, -m);
      const o = (j * size + i) * 4;
      out[o] = ar;
      out[o + 1] = ai;
      out[o + 2] = br;
      out[o + 3] = -bi;
    }
  }
  return out;
}

/** Spectrum parameters from the weather state's sea description. */
export function spectrumParamsFromWeather(w: {
  hs: number;
  peakPeriod: number;
  spreading: number;
  windFrom: number;
  swellHs: number;
  swellPeriod: number;
  swellFrom: number;
  swellSpreading: number;
}): SpectrumParams {
  // Waves travel toward (from + 180). World axes: +Z north, +X west, so bearing b -> (-sin b, cos b).
  const toward = (fromDeg: number) => {
    const b = ((fromDeg + 180) * Math.PI) / 180;
    return { dirX: -Math.sin(b), dirZ: Math.cos(b) };
  };
  return {
    wind: { hs: w.hs, peakPeriod: w.peakPeriod, spreading: w.spreading, ...toward(w.windFrom) },
    swell: { hs: w.swellHs, peakPeriod: w.swellPeriod, spreading: w.swellSpreading, ...toward(w.swellFrom) },
    minWavelength: 0.25,
  };
}
