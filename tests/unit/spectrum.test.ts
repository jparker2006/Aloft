import { describe, expect, it } from 'vitest';
import {
  buildInitialSpectrum,
  cascadeBands,
  frequencySpectrum,
  modeIndex,
  spectrumParamsFromWeather,
  spreadingFunction,
} from '../../src/ocean/spectrum';
import { WEATHER } from '../../src/render/weather';

const params = spectrumParamsFromWeather(WEATHER.gale);
const bands = cascadeBands();

function texel(data: Float32Array, size: number, n: number, m: number): number[] {
  const i = n < 0 ? n + size : n;
  const j = m < 0 ? m + size : m;
  const o = (j * size + i) * 4;
  return Array.from(data.slice(o, o + 4));
}

describe('ocean spectrum', () => {
  it('produces identical modes at 32, 64 and 256 (resolution-independent seeding)', () => {
    for (const band of bands.slice(0, 2)) {
      const s32 = buildInitialSpectrum(params, band, 32, 7);
      const s64 = buildInitialSpectrum(params, band, 64, 7);
      const s256 = buildInitialSpectrum(params, band, 256, 7);
      let compared = 0;
      let nonZero = 0;
      for (let m = -15; m < 16; m++) {
        for (let n = -15; n < 16; n++) {
          const a = texel(s32, 32, n, m);
          expect(texel(s64, 64, n, m)).toEqual(a);
          expect(texel(s256, 256, n, m)).toEqual(a);
          compared++;
          if (a[0] !== 0) nonZero++;
        }
      }
      expect(compared).toBe(31 * 31);
      expect(nonZero).toBeGreaterThan(20);
    }
  });

  it('changes with the seed', () => {
    const a = buildInitialSpectrum(params, bands[0]!, 64, 1);
    const b = buildInitialSpectrum(params, bands[0]!, 64, 2);
    expect(a).not.toEqual(b);
  });

  it('stores the conjugate of the mirrored mode alongside each mode', () => {
    const size = 64;
    const s = buildInitialSpectrum(params, bands[1]!, size, 3);
    for (const [n, m] of [
      [3, 5],
      [-7, 2],
      [10, -12],
    ] as const) {
      const here = texel(s, size, n, m);
      const mirror = texel(s, size, -n, -m);
      expect(here[2]).toBeCloseTo(mirror[0]!, 12);
      expect(here[3]).toBeCloseTo(-mirror[1]!, 12);
    }
  });

  it('splits wave numbers between cascades with no overlap', () => {
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.kLow).toBe(bands[i - 1]!.kHigh);
  });

  it('matches the target significant wave height across all cascades', () => {
    let variance = 0;
    for (const band of bands) {
      const s = buildInitialSpectrum(params, band, 256, 11);
      for (let i = 0; i < s.length; i += 4) variance += 2 * (s[i]! ** 2 + s[i + 1]! ** 2);
    }
    const target = (WEATHER.gale.hs ** 2 + WEATHER.gale.swellHs ** 2) / 16;
    // Random amplitudes and a finite grid make this a statistical check.
    expect(variance / target).toBeGreaterThan(0.75);
    expect(variance / target).toBeLessThan(1.25);
  });

  it('normalizes the frequency spectrum and spreading function', () => {
    let m0 = 0;
    for (let w = 0.05; w < 8; w += 0.001) m0 += frequencySpectrum(w, 7, 9.5) * 0.001;
    expect(4 * Math.sqrt(m0)).toBeCloseTo(7, 1);
    let d = 0;
    for (let t = -Math.PI; t < Math.PI; t += 0.001) d += spreadingFunction(t, 8) * 0.001;
    expect(d).toBeCloseTo(1, 2);
  });

  it('maps array indices to signed modes', () => {
    expect(modeIndex(0, 8)).toBe(0);
    expect(modeIndex(3, 8)).toBe(3);
    expect(modeIndex(4, 8)).toBe(-4);
    expect(modeIndex(7, 8)).toBe(-1);
  });
});
