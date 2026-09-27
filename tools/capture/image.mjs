// Image helpers for the capture loop: decode, downscale, luminance statistics and SSIM.
// Pure JS (pngjs, jpeg-js) so the harness needs no native modules.
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/** @typedef {{ width: number, height: number, data: Uint8Array }} Rgba */

/** @returns {Rgba} */
export function readImage(path) {
  const buf = readFileSync(path);
  if (path.toLowerCase().endsWith('.png')) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return { width: img.width, height: img.height, data: img.data };
}

/** @param {Rgba} img */
export function writePng(path, img) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  writeFileSync(path, PNG.sync.write(png));
}

/** Area-average resize to a target width, keeping aspect. @param {Rgba} img @returns {Rgba} */
export function resizeToWidth(img, width) {
  const height = Math.max(1, Math.round((img.height * width) / img.width));
  const out = new Uint8Array(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Display-referred luma in [0, 255] (Rec. 709 weights on encoded values). @param {Rgba} img */
export function luma(img) {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = 0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2];
  }
  return out;
}

/**
 * Value-structure statistics used in critiques: how bright, how contrasty, how saturated.
 * @param {Rgba} img
 */
export function imageStats(img) {
  const y = luma(img);
  const sorted = Float32Array.from(y).sort();
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] / 255;
  let r = 0;
  let g = 0;
  let b = 0;
  let sat = 0;
  let linear = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const R = img.data[o];
    const G = img.data[o + 1];
    const B = img.data[o + 2];
    r += R;
    g += G;
    b += B;
    const mx = Math.max(R, G, B);
    const mn = Math.min(R, G, B);
    sat += mx > 0 ? (mx - mn) / mx : 0;
    linear += srgbToLinear(y[i]);
  }
  return {
    mean: +(y.reduce((a, v) => a + v, 0) / n / 255).toFixed(3),
    meanLinear: +(linear / n).toFixed(4),
    p05: +pct(0.05).toFixed(3),
    p50: +pct(0.5).toFixed(3),
    p95: +pct(0.95).toFixed(3),
    saturation: +(sat / n).toFixed(3),
    rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
  };
}

/**
 * Mean SSIM of two same-size images on luma, 8x8 windows with stride 4.
 * @param {Rgba} a @param {Rgba} b
 */
export function ssim(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('ssim: size mismatch');
  const la = luma(a);
  const lb = luma(b);
  const W = a.width;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let count = 0;
  for (let y = 0; y + 8 <= a.height; y += 4) {
    for (let x = 0; x + 8 <= W; x += 4) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const k = (y + j) * W + x + i;
          ma += la[k];
          mb += lb[k];
        }
      }
      ma /= 64;
      mb /= 64;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const k = (y + j) * W + x + i;
          const da = la[k] - ma;
          const db = lb[k] - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      }
      va /= 63;
      vb /= 63;
      cov /= 63;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count ? total / count : 1;
}
