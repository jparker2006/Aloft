// Init script injected into capture pages only (never shipped in the game).
// Two workarounds for the preinstalled headless Chromium (141) on SwiftShader:
// 1. It implements an older draft of texture view swizzle and rejects three.js's default
//    `swizzle: 'rgba'`. 'rgba' is the identity swizzle, so dropping it is lossless.
// 2. Its lazy zero-initialisation of a 3D texture with RENDER_ATTACHMENT usage builds a 2D view of the
//    volume and fails validation at submit, leaving the texture unwritten. three.js adds that usage to
//    every uncompressed texture; the game never renders into a 3D texture, so the capture drops it.
// Current Chrome and Safari need neither, so the game ships without this shim.
export const COMPAT_INIT_SCRIPT = `
(() => {
  if (typeof GPUTexture === 'undefined') return;
  const createView = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (descriptor) {
    if (descriptor && descriptor.swizzle === 'rgba') {
      const { swizzle, ...rest } = descriptor;
      return createView.call(this, rest);
    }
    return createView.call(this, descriptor);
  };
  const createTexture = GPUDevice.prototype.createTexture;
  GPUDevice.prototype.createTexture = function (descriptor) {
    if (descriptor && descriptor.dimension === '3d' && descriptor.usage & 0x10) {
      descriptor = { ...descriptor, usage: descriptor.usage & ~0x10 };
    }
    return createTexture.call(this, descriptor);
  };
})();
`;
