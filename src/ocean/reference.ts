// Direct (slow) evaluation of the ocean surface from an initial spectrum, used to verify the GPU FFT
// and, in milestone 2, as the ground truth for the CPU physics query.
import { REPEAT_PERIOD } from './fft';
import { GRAVITY, modeIndex } from './spectrum';

const OMEGA_0 = (2 * Math.PI) / REPEAT_PERIOD;

export interface SurfaceSample {
  dx: number;
  dy: number;
  dz: number;
}

/** Sum of all modes at world position (x, z) and time t. O(N^2) per sample. */
export function sampleSurface(
  h0: Float32Array,
  size: number,
  patchSize: number,
  t: number,
  x: number,
  z: number,
): SurfaceSample {
  const dk = (2 * Math.PI) / patchSize;
  const tm = t % REPEAT_PERIOD;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  for (let j = 0; j < size; j++) {
    const m = modeIndex(j, size);
    for (let i = 0; i < size; i++) {
      const n = modeIndex(i, size);
      const o = (j * size + i) * 4;
      const ar = h0[o]!;
      const ai = h0[o + 1]!;
      const br = h0[o + 2]!;
      const bi = h0[o + 3]!;
      if (ar === 0 && ai === 0 && br === 0 && bi === 0) continue;
      const kx = n * dk;
      const kz = m * dk;
      const k = Math.hypot(kx, kz);
      const omega = Math.floor(Math.sqrt(GRAVITY * k) / OMEGA_0) * OMEGA_0;
      const c = Math.cos(omega * tm);
      const s = Math.sin(omega * tm);
      // h = h0 e^{iwt} + conj(h0(-k)) e^{-iwt}
      const hr = ar * c - ai * s + (br * c + bi * s);
      const hi = ar * s + ai * c + (bi * c - br * s);
      const ph = kx * x + kz * z;
      const pc = Math.cos(ph);
      const ps = Math.sin(ph);
      // Re(h e^{i k.x})
      dy += hr * pc - hi * ps;
      // D = -i k/|k| h  ->  Re(-i (kx/k) h e^{ikx}) = (kx/k) * Im(h e^{ikx})
      const im = hr * ps + hi * pc;
      dx += (kx / k) * im;
      dz += (kz / k) * im;
    }
  }
  return { dx, dy, dz };
}
