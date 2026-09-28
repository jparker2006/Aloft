// Sea height under one point, computed on the GPU and read back a frame or two late. It keeps the free
// camera above passing crests; the CPU ocean query planned for milestone 2 replaces it for gameplay.
import * as THREE from 'three/webgpu';
import { Fn, instancedArray, uniform } from 'three/tsl';
import type { Ocean } from './ocean';

interface FloatArray {
  element(i: number): { assign(v: unknown): void };
}

export class SurfaceProbe {
  /** Last sea height read back, metres; NaN until the first readback arrives. */
  height = Number.NaN;
  private readonly at = uniform(new THREE.Vector2());
  private readonly buffer = instancedArray(1, 'float');
  private readonly compute: THREE.ComputeNode;
  private pending = false;

  constructor(ocean: Ocean) {
    const out = this.buffer as unknown as FloatArray;
    this.compute = Fn(() => {
      out.element(0).assign(ocean.surfaceLevel0(this.at).height);
    })().compute(1);
  }

  /** Requests the height at world (x, z). Skipped while a readback is still in flight. */
  update(renderer: THREE.WebGPURenderer, x: number, z: number): void {
    if (this.pending) return;
    this.pending = true;
    this.at.value.set(x, z);
    renderer.compute(this.compute);
    renderer
      .getArrayBufferAsync((this.buffer as unknown as { value: THREE.BufferAttribute }).value)
      .then((data) => {
        this.height = new Float32Array(data)[0]!;
      })
      .catch(() => undefined)
      .finally(() => {
        this.pending = false;
      });
  }
}
