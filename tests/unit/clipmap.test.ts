import { describe, expect, it } from 'vitest';
import { BASE_CELL, GRID, LEVELS, computeLevels } from '../../src/ocean/clipmap';

describe('clipmap levels', () => {
  it('keeps every hole offset within one cell and every centre on its snapping lattice', () => {
    for (let t = 0; t < 2000; t++) {
      const x = Math.sin(t * 12.9898) * 5000;
      const z = Math.cos(t * 78.233) * 5000;
      const levels = computeLevels(x, z);
      expect(levels).toHaveLength(LEVELS);
      levels.forEach((l, i) => {
        const snap = 2 * BASE_CELL * 2 ** i;
        expect(Math.abs(l.centerX / snap - Math.round(l.centerX / snap))).toBeLessThan(1e-9);
        expect(Math.abs(l.holeX)).toBeLessThanOrEqual(1);
        expect(Math.abs(l.holeZ)).toBeLessThanOrEqual(1);
      });
    }
  });

  it('makes each ring hole match the finer level footprint exactly', () => {
    const levels = computeLevels(123.4, -987.6);
    for (let l = 1; l < LEVELS; l++) {
      const fine = levels[l - 1]!;
      const here = levels[l]!;
      const fineHalf = (GRID / 2) * fine.cell;
      const holeHalf = (GRID / 4) * here.cell;
      expect(holeHalf).toBeCloseTo(fineHalf);
      expect(here.centerX + here.holeX * here.cell).toBeCloseTo(fine.centerX);
      expect(here.centerZ + here.holeZ * here.cell).toBeCloseTo(fine.centerZ);
    }
  });

  it('covers about 4 km with the finest cells at 25 cm', () => {
    const last = computeLevels(0, 0)[LEVELS - 1]!;
    expect((GRID / 2) * last.cell).toBe(2048);
    expect(BASE_CELL).toBe(0.25);
  });
});
