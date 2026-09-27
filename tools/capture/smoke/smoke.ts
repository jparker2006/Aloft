// WebGPU smoke test: a TSL compute shader writes a storage texture, which is drawn on a full-screen
// plane. Verifies both an offscreen readback and the presented canvas, so a capture environment that
// renders but cannot present (black screenshots) is caught here.
import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, texture, textureStore, uvec2, vec4 } from 'three/tsl';

declare global {
  interface Window {
    __smoke?: { ok: boolean; adapter?: string; detail?: string; error?: string };
  }
}

const SIZE = 256;

function toSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// Expected texel colour; the render target stays linear, the presented canvas is sRGB-encoded.
function expected(u: number, v: number, srgb = false): number[] {
  return [u, v, 1 - u * v].map((c) => Math.round((srgb ? toSrgb(c) : c) * 255));
}

function close(a: ArrayLike<number>, b: number[], tol = 12): boolean {
  return b.every((c, i) => Math.abs((a[i] ?? 0) - c) <= tol);
}

async function run(): Promise<void> {
  if (!navigator.gpu) throw new Error('navigator.gpu missing');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('requestAdapter returned null');
  const adapterName = [adapter.info.vendor, adapter.info.architecture, adapter.info.device]
    .filter(Boolean)
    .join(' ');

  const target = new THREE.StorageTexture(SIZE, SIZE);
  const fill = Fn(() => {
    const x = instanceIndex.mod(SIZE);
    const y = instanceIndex.div(SIZE);
    const u = float(x).div(SIZE);
    const v = float(y).div(SIZE);
    textureStore(target, uvec2(x, y), vec4(u, v, u.mul(v).oneMinus(), 1)).toWriteOnly();
  })().compute(SIZE * SIZE);

  const renderer = new THREE.WebGPURenderer({ antialias: false });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
    throw new Error('renderer fell back to a non-WebGPU backend');
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = texture(target);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  await renderer.computeAsync(fill);

  // Offscreen readback of the centre-right texel.
  const rt = new THREE.RenderTarget(64, 64, { type: THREE.UnsignedByteType });
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  const pixels = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 64, 64)) as Uint8Array;
  const i = (32 * 64 + 60) * 4;
  const rtPx = Array.from(pixels.slice(i, i + 4));

  // Presented canvas, copied within the same task as the render.
  renderer.render(scene, camera);
  const probe = document.createElement('canvas');
  probe.width = renderer.domElement.width;
  probe.height = renderer.domElement.height;
  const ctx = probe.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the canvas probe');
  ctx.drawImage(renderer.domElement, 0, 0);
  const canvasPx = Array.from(ctx.getImageData(probe.width - 8, 8, 1, 1).data);

  const rtOk = close(rtPx, expected(60 / 64, 32 / 64));
  const canvasOk = close(canvasPx, expected(0.98, 0.98, true), 16);
  window.__smoke = {
    ok: rtOk && canvasOk,
    adapter: adapterName,
    detail: `offscreen ${rtPx.join(',')} (${rtOk ? 'ok' : 'bad'}), canvas ${canvasPx.join(',')} (${canvasOk ? 'ok' : 'bad'})`,
  };
}

run().catch((e: unknown) => {
  window.__smoke = { ok: false, error: e instanceof Error ? e.message : String(e) };
});
