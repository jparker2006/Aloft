import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('no em dash rule', () => {
  it('passes on the repository', () => {
    const out = execFileSync('node', ['scripts/check-no-em-dash.mjs'], { encoding: 'utf8' });
    expect(out).toMatch(/no em dashes/);
  });
});
