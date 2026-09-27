// Runtime asset loading with the fallback rule: a missing asset never crashes the game; it logs which
// Blender script to rerun and substitutes a neutral placeholder.
import * as THREE from 'three/webgpu';

export interface DataTextureOptions {
  /** Script that generates the asset, named in the warning if it is missing. */
  script: string;
  /** Placeholder RGBA (0..255) used until or instead of the real texture. */
  fallback: [number, number, number, number];
  repeat?: boolean;
}

/** Loads a linear (non-color) data texture. The returned texture is usable immediately. */
export function loadDataTexture(url: string, options: DataTextureOptions): THREE.Texture {
  const placeholder = new Uint8Array(options.fallback);
  const texture = new THREE.DataTexture(placeholder, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', colorSpaceConversion: 'none' }).load(
    url,
    (bitmap) => {
      const t = texture as unknown as THREE.Texture;
      t.image = bitmap;
      t.colorSpace = THREE.NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 8;
      if (options.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
      loaded.add(url);
    },
    undefined,
    () => console.warn(`[assets] ${url} is missing; run ${options.script}. Using a placeholder.`),
  );
  if (options.repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const loaded = new Set<string>();

/** Resolves once every listed URL has loaded or failed (for shot mode, which must not capture early). */
export async function whenLoaded(urls: string[], timeoutMs = 20000): Promise<void> {
  const start = performance.now();
  while (urls.some((u) => !loaded.has(u)) && performance.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}
