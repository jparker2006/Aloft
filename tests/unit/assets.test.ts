// Contract tests for generated assets (SPEC section 14): every file the runtime loads must exist, match
// the shape its loader expects, and declare its color space.
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const TEX = 'public/assets/tex';

describe('texture manifest', () => {
  const manifest = JSON.parse(readFileSync(`${TEX}/manifest.json`, 'utf8')) as Record<
    string,
    { script: string; colorSpace: string; size: [number, number] }
  >;

  it('declares a color space and generating script for every texture', () => {
    for (const [name, entry] of Object.entries(manifest)) {
      expect(['linear', 'srgb'], name).toContain(entry.colorSpace);
      expect(entry.script, name).toMatch(/^tools\/blender\/.+\.py$/);
    }
  });

  it('describes the foam texture the ocean loads', () => {
    expect(manifest['foam.png']?.colorSpace).toBe('linear');
  });
});

describe('foam.png', () => {
  const png = PNG.sync.read(readFileSync(`${TEX}/foam.png`));
  const at = (x: number, y: number, c: number) => png.data[(y * png.width + x) * 4 + c]!;

  it('is a square RGBA texture of the declared size', () => {
    expect(png.width).toBe(1024);
    expect(png.height).toBe(1024);
  });

  it('uses every channel', () => {
    for (let c = 0; c < 4; c++) {
      let min = 255;
      let max = 0;
      for (let i = 0; i < png.width * png.height; i += 97) {
        const v = png.data[i * 4 + c]!;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      expect(max - min, `channel ${c}`).toBeGreaterThan(120);
    }
  });

  it('tiles seamlessly: the wrap seam is no rougher than the interior', () => {
    for (let c = 0; c < 4; c++) {
      let seam = 0;
      let interior = 0;
      for (let y = 0; y < png.height; y++) {
        seam += Math.abs(at(0, y, c) - at(png.width - 1, y, c));
        interior += Math.abs(at(511, y, c) - at(512, y, c));
      }
      expect(seam, `channel ${c}`).toBeLessThan(interior * 1.5 + png.height * 2);
    }
  });
});
