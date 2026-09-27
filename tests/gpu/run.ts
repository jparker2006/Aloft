// GPU tests: run in headless Chromium (npm run test:gpu). Each test returns a list of failures.
import * as THREE from 'three/webgpu';
import { float, texture, texture3D, uv, vec3 } from 'three/tsl';
import { CloudNoise } from '../../src/sky/cloudNoise';
import { CascadeGpu } from '../../src/ocean/fft';
import { sampleSurface } from '../../src/ocean/reference';
import { buildInitialSpectrum, cascadeBands, spectrumParamsFromWeather } from '../../src/ocean/spectrum';
import { WEATHER } from '../../src/render/weather';

declare global {
  interface Window {
    __gpuTests?: { name: string; failures: string[]; detail: string }[];
    __gpuTestsDone?: boolean;
  }
}

async function fftMatchesDirectSum(renderer: THREE.WebGPURenderer, N = 64, bandIndex = 1) {
  const failures: string[] = [];
  const band = cascadeBands()[bandIndex]!;
  const cascade = new CascadeGpu({ size: N, patchSize: band.patchSize });
  const h0 = buildInitialSpectrum(spectrumParamsFromWeather(WEATHER.gale), band, N, 5);
  cascade.setSpectrum(h0, true);
  const t = 37.25;
  cascade.update(renderer, t, 1);
  const raw = await renderer.getArrayBufferAsync(
    (cascade.buffer0 as unknown as { value: THREE.BufferAttribute }).value,
  );
  const data = new Float32Array(raw);
  let maxErr = 0;
  let maxAmp = 0;
  for (const [i, j] of [
    [0, 0],
    [5, 9],
    [31, 2],
    [N - 1, N - 1],
    [17, 44],
  ] as const) {
    const x = (i * band.patchSize) / N;
    const z = (j * band.patchSize) / N;
    const ref = sampleSurface(h0, N, band.patchSize, t, x, z);
    const o = (j * N + i) * 4;
    const got = { dx: data[o]!, dz: data[o + 1]!, dy: data[o + 2]! };
    for (const key of ['dx', 'dy', 'dz'] as const) {
      maxErr = Math.max(maxErr, Math.abs(got[key] - ref[key]));
      maxAmp = Math.max(maxAmp, Math.abs(ref[key]));
    }
  }
  if (maxAmp < 0.05) failures.push(`reference amplitude suspiciously small: ${maxAmp}`);
  if (maxErr > 1e-3 + maxAmp * 1e-3) failures.push(`max error ${maxErr} vs amplitude ${maxAmp}`);
  return { failures, detail: `max error ${maxErr.toExponential(2)} at amplitude ${maxAmp.toFixed(3)} m` };
}

/** The displacement texture, sampled at texel centres in a render pass, must equal the FFT buffer. */
async function assembledTextureMatchesBuffer(renderer: THREE.WebGPURenderer) {
  const failures: string[] = [];
  const N = 256;
  const band = cascadeBands()[0]!;
  const cascade = new CascadeGpu({ size: N, patchSize: band.patchSize });
  cascade.setSpectrum(buildInitialSpectrum(spectrumParamsFromWeather(WEATHER.gale), band, N, 5), true);
  cascade.update(renderer, 21.5, 1);
  const buffer = new Float32Array(
    await renderer.getArrayBufferAsync(
      (cascade.buffer0 as unknown as { value: THREE.BufferAttribute }).value,
    ),
  );

  const rt = new THREE.RenderTarget(N, N, { type: THREE.FloatType });
  const material = new THREE.MeshBasicNodeMaterial();
  // The material output clamps negatives, so heights are encoded into a positive range and decoded below.
  material.colorNode = texture(cascade.displacement, uv()).level(float(0)).mul(0.05).add(0.5);
  const quad = new THREE.QuadMesh(material);
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  renderer.setRenderTarget(null);
  const px = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, N, N)) as Float32Array;
  let maxErr = 0;
  let maxAmp = 0;
  for (const [i, j] of [
    [3, 7],
    [100, 200],
    [255, 0],
    [128, 128],
  ] as const) {
    const b = (j * N + i) * 4;
    // Render target rows may be flipped relative to texture rows; accept either.
    const rows = [j, N - 1 - j].map((jj) => (jj * N + i) * 4);
    const errs = rows.map((o) => Math.abs((px[o + 1]! - 0.5) * 20 - buffer[b + 2]!));
    maxErr = Math.max(maxErr, Math.min(...errs));
    maxAmp = Math.max(maxAmp, Math.abs(buffer[b + 2]!));
  }
  if (maxAmp < 0.1) failures.push(`amplitude suspiciously small: ${maxAmp}`);
  if (maxErr > 0.02 + maxAmp * 0.01) failures.push(`height error ${maxErr} at amplitude ${maxAmp}`);
  return { failures, detail: `height error ${maxErr.toExponential(2)} at amplitude ${maxAmp.toFixed(3)} m` };
}

/** The cloud noise volume generates in compute and samples as a 3D texture. */
async function cloudNoiseSamples(renderer: THREE.WebGPURenderer) {
  const failures: string[] = [];
  const noise = new CloudNoise();
  noise.generate(renderer);
  const rt = new THREE.RenderTarget(32, 32, { type: THREE.FloatType });
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = texture3D(noise.shape, vec3(uv(), 0.5)).level(float(0));
  const quad = new THREE.QuadMesh(material);
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  renderer.setRenderTarget(null);
  const px = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 32, 32)) as Float32Array;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < px.length; i += 4) {
    min = Math.min(min, px[i]!);
    max = Math.max(max, px[i]!);
  }
  if (!(max - min > 0.2)) failures.push(`noise range too small: ${min}..${max}`);
  return { failures, detail: `shape.r range ${min.toFixed(2)}..${max.toFixed(2)}` };
}

async function run(): Promise<void> {
  const renderer = new THREE.WebGPURenderer();
  await renderer.init();
  const tests = {
    fft64: (r: THREE.WebGPURenderer) => fftMatchesDirectSum(r, 64, 1),
    fft256: (r: THREE.WebGPURenderer) => fftMatchesDirectSum(r, 256, 0),
    assembledTextureMatchesBuffer,
    cloudNoiseSamples,
  };
  const results: NonNullable<Window['__gpuTests']> = [];
  for (const [name, fn] of Object.entries(tests)) {
    try {
      const r = await fn(renderer);
      results.push({ name, ...r });
    } catch (e) {
      results.push({ name, failures: [e instanceof Error ? e.message : String(e)], detail: '' });
    }
  }
  window.__gpuTests = results;
  window.__gpuTestsDone = true;
}

void run();
