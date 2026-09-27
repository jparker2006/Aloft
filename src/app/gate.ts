// WebGPU gate. Aloft is WebGPU only: no adapter means the unsupported screen, never a WebGL fallback.

export type GateResult =
  | { ok: true; adapter: GPUAdapter; description: string; isFallback: boolean }
  | { ok: false; reason: string };

export async function checkWebGPU(): Promise<GateResult> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    return { ok: false, reason: 'This browser does not expose WebGPU (navigator.gpu is missing).' };
  }
  let adapter: GPUAdapter | null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch (e) {
    return { ok: false, reason: `Requesting a WebGPU adapter failed: ${String(e)}` };
  }
  if (!adapter) {
    return { ok: false, reason: 'WebGPU is present but no GPU adapter is available.' };
  }
  const info = adapter.info;
  const description = [info.vendor, info.architecture, info.device, info.description]
    .filter(Boolean)
    .join(' ');
  // `isFallbackAdapter` moved from GPUAdapter to GPUAdapterInfo; read whichever exists.
  const isFallback = Boolean(
    (info as { isFallbackAdapter?: boolean }).isFallbackAdapter ??
    (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter,
  );
  return { ok: true, adapter, description: description || 'unknown adapter', isFallback };
}
