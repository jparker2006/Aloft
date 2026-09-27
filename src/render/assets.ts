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

/**
 * Loads a linear (non-color) data texture. The returned texture is usable immediately: until the image
 * arrives three binds its default placeholder, and if loading fails a 1x1 fallback color is used.
 */
export function loadDataTexture(url: string, options: DataTextureOptions): THREE.Texture {
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  if (options.repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'none', colorSpaceConversion: 'none' }).load(
    url,
    (bitmap) => {
      texture.image = bitmap;
      texture.needsUpdate = true;
      loaded.add(url);
    },
    undefined,
    () => {
      console.warn(`[assets] ${url} is missing; run ${options.script}. Using a placeholder.`);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const [r, g, b, a] = options.fallback;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
        ctx.fillRect(0, 0, 1, 1);
      }
      texture.image = canvas;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      loaded.add(url);
    },
  );
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
