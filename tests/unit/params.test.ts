import { describe, expect, it } from 'vitest';
import { parseParams } from '../../src/app/params';

describe('parseParams', () => {
  it('reads shot mode parameters', () => {
    const p = parseParams('?shot=sea_low&preset=night&seed=9&flash=0.12');
    expect(p.shot).toBe('sea_low');
    expect(p.preset).toBe('night');
    expect(p.seed).toBe(9);
    expect(p.flash).toBeCloseTo(0.12);
    expect(p.dev).toBe(true);
  });

  it('rejects unknown presets and quality values', () => {
    const p = parseParams('?preset=noon&q=ultra');
    expect(p.preset).toBeNull();
    expect(p.quality).toBeNull();
  });

  it('parses quality overrides and bare flags', () => {
    const p = parseParams('?qset=cloudSteps:24,bad:x&nossr&norain');
    expect(p.qualityOverrides).toEqual({ cloudSteps: 24 });
    expect(p.has('nossr')).toBe(true);
    expect(p.has('norain')).toBe(true);
    expect(p.has('nofoam')).toBe(false);
  });

  it('defaults the seed', () => {
    expect(parseParams('').seed).toBe(1);
  });
});
