import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/app/rng';
import {
  LightningSystem,
  MAX_FLASHES_PER_SECOND,
  boltIntensity,
  countOnsets,
  makeStrike,
  strikeEnvelope,
} from '../../src/fx/lightning';

const HZ = 120;

function simulate(rate: number, reduced: boolean, seconds: number, seed = 1): number[] {
  const system = new LightningSystem(new Rng(seed), () => new THREE.Vector3());
  system.rate = rate;
  system.reduced = reduced;
  const samples: number[] = [];
  for (let i = 0; i < seconds * HZ; i++) {
    const t = i / HZ;
    system.step(1 / HZ, t);
    system.update(t);
    samples.push(system.uniforms.flash.value);
  }
  return samples;
}

describe('lightning flash limiter', () => {
  it('never exceeds 3 full-screen flashes in any 1 s window, even in an absurd storm', () => {
    for (const seed of [1, 2, 3]) {
      const onsets = countOnsets(simulate(400, false, 60, seed));
      expect(onsets.length).toBeGreaterThan(30);
      for (let i = 0; i + MAX_FLASHES_PER_SECOND < onsets.length; i++) {
        expect(onsets[i + MAX_FLASHES_PER_SECOND]! - onsets[i]!).toBeGreaterThanOrEqual(HZ);
      }
    }
  });

  it('keeps return-stroke ripples shallow so one strike is one flash', () => {
    const strike = makeStrike(new Rng(5), 0, new THREE.Vector3(), { bearing: 0, distance: 4000 }, 500);
    const samples = Array.from({ length: 2 * HZ }, (_, i) => strikeEnvelope(strike, i / HZ, false));
    expect(countOnsets(samples)).toHaveLength(1);
    // The bolt itself does flicker.
    const bolt = Array.from({ length: HZ }, (_, i) => boltIntensity(strike, i / HZ, false));
    expect(countOnsets(bolt, 0.5).length).toBeGreaterThanOrEqual(2);
  });

  it('reduces flashing to a single soft pulse at 30% peak', () => {
    const samples = simulate(30, true, 30);
    expect(Math.max(...samples)).toBeLessThanOrEqual(0.3 + 1e-9);
    const strike = makeStrike(new Rng(9), 0, new THREE.Vector3(), { bearing: 0, distance: 4000 }, 500);
    const bolt = Array.from({ length: HZ }, (_, i) => boltIntensity(strike, i / HZ, true));
    expect(countOnsets(bolt, 0.5)).toHaveLength(1);
  });

  it('is deterministic for a seed', () => {
    expect(simulate(10, false, 20, 4)).toEqual(simulate(10, false, 20, 4));
  });
});
