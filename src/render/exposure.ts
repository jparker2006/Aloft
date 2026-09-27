// Auto exposure (SPEC section 7): meters a small downsample of the HDR scene in compute and applies a
// partial correction toward middle grey, adapting over time. Frames lit by a lightning flash are excluded,
// so exposure never pumps after a strike. The result lives in a one-float storage buffer the final pass
// reads, so there is no CPU readback.
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  clamp,
  exp,
  float,
  instancedArray,
  int,
  ivec2,
  localId,
  log2,
  max,
  mix,
  textureLoad,
  uniform,
  uv,
  vec3,
  vec4,
  workgroupArray,
  workgroupBarrier,
} from 'three/tsl';

type F = THREE.Node<'float'>;
interface FloatArray {
  element(i: unknown): F;
}

const METER_W = 64;
const METER_H = 32;
const THREADS = 256;

export class AutoExposure {
  /** exposure[0]: current exposure in EV relative to the look's exposure. */
  readonly buffer = instancedArray(1, 'float');
  readonly dt = uniform(0);
  /** 1 snaps straight to the target (shots and cuts). */
  readonly snap = uniform(1);
  /** Excludes the current frame from adaptation (a lightning flash). */
  readonly hold = uniform(0);
  private readonly meter: THREE.RenderTarget;
  private readonly downsample: THREE.QuadMesh;
  private readonly compute: THREE.ComputeNode;

  constructor(source: THREE.TextureNode) {
    this.meter = new THREE.RenderTarget(METER_W, METER_H, { type: THREE.HalfFloatType, depthBuffer: false });
    const mat = new THREE.NodeMaterial();
    // Four taps per meter texel spread the sample over the source.
    const o = 0.25 / METER_W;
    const tap = (dx: number, dy: number) => source.sample(uv().add(vec3(dx * o, dy * o, 0).xy)).rgb;
    mat.fragmentNode = vec4(tap(-1, -1).add(tap(1, -1)).add(tap(-1, 1)).add(tap(1, 1)).mul(0.25), 1);
    this.downsample = new THREE.QuadMesh(mat);

    const exposure = this.buffer as unknown as FloatArray;
    const meterTexture = this.meter.texture;
    this.compute = Fn(() => {
      const partial = workgroupArray('float', THREADS) as unknown as FloatArray;
      const t = localId.x;
      let sum: F = float(0);
      for (let k = 0; k < (METER_W * METER_H) / THREADS; k++) {
        const index = t.add(k * THREADS);
        const px = ivec2(int(index.mod(METER_W)), int(index.div(METER_W)));
        const c = textureLoad(meterTexture, px).rgb;
        const luminance = c.dot(vec3(0.2126, 0.7152, 0.0722));
        // Clamped log luminance: a sun disc or a black trough cannot drag the average.
        sum = sum.add(clamp(log2(max(luminance, 1e-6)), -14, 4)) as F;
      }
      partial.element(t).assign(sum);
      workgroupBarrier();
      If(t.equal(0), () => {
        let total: F = float(0);
        for (let k = 0; k < THREADS; k++) total = total.add(partial.element(k)) as F;
        const meanLog = total.div(METER_W * METER_H);
        // Partial correction toward middle grey: dark scenes stay darker than grey, bright ones brighter.
        const target = clamp(log2(float(0.13)).sub(meanLog).mul(0.55), -2.5, 3);
        const current = exposure.element(0);
        const rate = float(1).sub(exp(this.dt.mul(-1.4)));
        const next = mix(current, target, max(rate, this.snap));
        current.assign(mix(next, current, this.hold));
      });
    })().compute(THREADS, [THREADS]);
  }

  /** Exposure multiplier node for the final pass. */
  get multiplier(): F {
    return (this.buffer as unknown as FloatArray).element(0).exp2() as F;
  }

  /** Meters last frame's image and adapts. Call once per frame after rendering. */
  update(renderer: THREE.WebGPURenderer, dt: number, snap: boolean, hold: boolean): void {
    renderer.setRenderTarget(this.meter);
    this.downsample.render(renderer);
    renderer.setRenderTarget(null);
    this.dt.value = dt;
    this.snap.value = snap ? 1 : 0;
    this.hold.value = hold ? 1 : 0;
    renderer.compute(this.compute);
  }
}
