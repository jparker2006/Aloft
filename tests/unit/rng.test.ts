import { describe, expect, it } from 'vitest';
import { Rng, RngStreams, hashInts } from '../../src/app/rng';

describe('seeded randomness', () => {
  it('repeats exactly for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs between seeds', () => {
    expect(new Rng(1).nextU32()).not.toBe(new Rng(2).nextU32());
  });

  it('keeps named streams independent', () => {
    const s = new RngStreams(7);
    const first = s.stream('lightning').next();
    const other = s.stream('rain');
    for (let i = 0; i < 50; i++) other.next();
    expect(s.stream('lightning').next()).toBe(first);
  });

  it('produces floats in [0, 1) with a sane mean', () => {
    const r = new Rng(3);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });

  it('hashes integer tuples order-sensitively', () => {
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1));
    expect(hashInts(1, 2)).toBe(hashInts(1, 2));
  });
});
