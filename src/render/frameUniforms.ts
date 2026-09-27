// Per-frame shared uniforms read by many shaders.
import { uniform } from 'three/tsl';
import type { FrameInfo } from '../app/app';

export class FrameUniforms {
  readonly name = 'frame-uniforms';
  /** Interpolated simulation time, seconds (wrapped to keep float precision). */
  readonly time = uniform(0);

  update(frame: FrameInfo): void {
    this.time.value = frame.time % 4096;
  }
}
