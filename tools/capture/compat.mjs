// Init script injected into capture pages only (never shipped in the game).
// The preinstalled headless Chromium (141) implements an older draft of texture view swizzle and
// rejects three.js's default `swizzle: 'rgba'`. 'rgba' is the identity swizzle, so dropping it is
// lossless. Current Chrome and Safari accept or ignore the field, so the game needs no such shim.
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
})();
`;
