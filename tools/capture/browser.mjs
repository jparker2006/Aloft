// Shared Chromium launch for captures and smoke tests.
// No GPU is assumed: WebGPU runs on SwiftShader (Vulkan) when no hardware adapter exists.
import { chromium } from 'playwright';

export const WEBGPU_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
  '--use-webgpu-adapter=swiftshader',
  '--use-angle=swiftshader',
];

export async function launchBrowser() {
  const hardware = process.env.ALOFT_HW_GPU === '1';
  const override = process.env.ALOFT_CHROME_ARGS?.split(' ').filter(Boolean);
  return chromium.launch({
    channel: 'chromium',
    headless: true,
    args: override ?? (hardware ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] : WEBGPU_ARGS),
  });
}
