import { describe, expect, it } from 'vitest';
import { MAX_RUNG, QualityLadder, TIERS, applyRung, tierFromBenchmark } from '../../src/render/quality';

describe('quality ladder', () => {
  it('steps down under sustained load, one rung per settle period', () => {
    const ladder = new QualityLadder();
    let changes = 0;
    for (let i = 0; i < 60 * 3; i++) if (ladder.sample(24, 1 / 60)) changes++;
    expect(ladder.rung).toBe(1);
    expect(changes).toBe(1);
    for (let i = 0; i < 60 * 30; i++) ladder.sample(24, 1 / 60);
    expect(ladder.rung).toBe(MAX_RUNG);
  });

  it('does not oscillate around the budget (hysteresis)', () => {
    const ladder = new QualityLadder();
    for (let i = 0; i < 60 * 60; i++) ladder.sample(i % 2 ? 15.5 : 17, 1 / 60);
    expect(ladder.rung).toBe(0);
  });

  it('steps back up only after sustained headroom', () => {
    const ladder = new QualityLadder();
    for (let i = 0; i < 60 * 10; i++) ladder.sample(30, 1 / 60);
    // Let the smoothed frame time fall through the budget first (it may take one last step down).
    for (let i = 0; i < 60; i++) ladder.sample(8, 1 / 60);
    const low = ladder.rung;
    expect(low).toBeGreaterThan(1);
    for (let i = 0; i < 60 * 2; i++) ladder.sample(8, 1 / 60);
    expect(ladder.rung).toBe(low);
    for (let i = 0; i < 60 * 12; i++) ladder.sample(8, 1 / 60);
    expect(ladder.rung).toBeLessThan(low);
  });

  it('protects the ocean until the last rung', () => {
    for (let r = 0; r < MAX_RUNG; r++)
      expect(applyRung(TIERS.high, r).fineCascadeEveryOtherFrame).toBe(false);
    expect(applyRung(TIERS.high, MAX_RUNG).fineCascadeEveryOtherFrame).toBe(true);
    expect(applyRung(TIERS.high, MAX_RUNG).renderScale).toBe(0.65);
  });

  it('maps benchmark times to tiers', () => {
    expect(tierFromBenchmark(6)).toBe('high');
    expect(tierFromBenchmark(11)).toBe('med');
    expect(tierFromBenchmark(40)).toBe('low');
  });
});
