import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../../src/app/clock';

describe('FixedStepClock', () => {
  it('runs whole steps and keeps the remainder as alpha', () => {
    const c = new FixedStepClock({ hz: 120, maxStepsPerFrame: 4 });
    expect(c.advance(1 / 60)).toBe(2);
    expect(c.step).toBe(2);
    expect(c.alpha).toBeCloseTo(0, 6);
    expect(c.advance(1 / 240)).toBe(0);
    expect(c.alpha).toBeCloseTo(0.5, 6);
    expect(c.renderTime).toBeCloseTo(2.5 / 120, 9);
  });

  it('caps steps per frame and drops the excess time', () => {
    const c = new FixedStepClock({ hz: 120, maxStepsPerFrame: 4 });
    expect(c.advance(0.5)).toBe(4);
    expect(c.droppedTime).toBeCloseTo(0.5 - 4 / 120, 6);
    expect(c.advance(0)).toBe(0);
  });

  it('is deterministic: sim time depends only on the step count', () => {
    const a = new FixedStepClock({ hz: 120, maxStepsPerFrame: 4 });
    const b = new FixedStepClock({ hz: 120, maxStepsPerFrame: 4 });
    for (let i = 0; i < 600; i++) a.advance(1 / 60);
    for (let i = 0; i < 300; i++) b.advance(1 / 30);
    expect(a.step).toBe(b.step);
    expect(a.simTime).toBe(b.simTime);
  });

  it('never produces alpha of 1 or more', () => {
    const c = new FixedStepClock({ hz: 120, maxStepsPerFrame: 4 });
    for (let i = 0; i < 1000; i++) {
      c.advance(0.001 * ((i * 7) % 13));
      expect(c.alpha).toBeGreaterThanOrEqual(0);
      expect(c.alpha).toBeLessThan(1);
    }
  });
});
