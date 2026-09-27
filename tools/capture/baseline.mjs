// Promotes an existing capture run to the committed baselines without re-rendering.
// Usage: node tools/capture/baseline.mjs captures/<run>
import { mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readImage, resizeToWidth, writePng } from './image.mjs';

const run = process.argv[2];
if (!run) throw new Error('usage: node tools/capture/baseline.mjs captures/<run>');
const ROOT = resolve(import.meta.dirname, '../..');
const out = join(ROOT, 'tests/visual/baseline');
mkdirSync(out, { recursive: true });
let n = 0;
for (const file of readdirSync(run)) {
  if (!file.endsWith('.png') || !file.includes('__')) continue;
  writePng(join(out, file), resizeToWidth(readImage(join(run, file)), 768));
  n++;
}
console.log(`[baseline] updated ${n} baselines from ${run}`);
