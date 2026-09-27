// GPU FFT ocean cascade (SPEC section 7), all in TSL compute.
//
// Per cascade and frame:
//   evolve     h0 -> h(k, t) for eight real fields packed as four complex spectra in two vec4 buffers
//                A = Dx + i Dz,  B = Dy + i Dxdz,  C = Dydx + i Dydz,  D = Dxdx + i Dzdz
//              buffer0 = (A, B), buffer1 = (C, D). Cross-fades between the previous and new spectrum.
//   fft rows   in place, one workgroup per row, the whole 256-point transform in workgroup memory
//   fft cols   same, per column
//   assemble   displacement (Dx, Dy, Dz, Jacobian) and slopes (Dydx, Dydz, Dxdx, Dzdz) into rgba16float
//              storage textures (filterable everywhere), with mipmaps generated after the write.
//
// The inverse transform uses no normalization: h(x) = sum_k h(k) e^{i k.x}, matching the spectrum's
// amplitude convention in spectrum.ts.

import * as THREE from 'three/webgpu';
import {
  Fn,
  cos,
  float,
  instanceIndex,
  instancedArray,
  int,
  ivec2,
  localId,
  mix,
  select,
  sin,
  sqrt,
  textureLoad,
  textureStore,
  uint,
  uniform,
  uvec2,
  vec2,
  vec4,
  workgroupArray,
  workgroupBarrier,
  workgroupId,
} from 'three/tsl';
import { GRAVITY } from './spectrum';

/** Dispersion is quantized so the sea repeats every REPEAT_PERIOD seconds and phases stay precise. */
export const REPEAT_PERIOD = 2048;
const OMEGA_0 = (2 * Math.PI) / REPEAT_PERIOD;

type Vec4Node = THREE.Node<'vec4'>;
type Vec2Node = THREE.Node<'vec2'>;
type UintNode = THREE.Node<'uint'>;
/** Typed view of a workgroup or storage array (the published TSL types omit `element`). */
interface ArrayView {
  element(index: UintNode): Vec4Node;
}

function cmul(a: Vec2Node, b: Vec2Node): Vec2Node {
  return vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));
}

/** i * z */
function mulI(z: Vec2Node): Vec2Node {
  return vec2(z.y.negate(), z.x);
}

export interface CascadeGpuOptions {
  size: number;
  patchSize: number;
}

export class CascadeGpu {
  readonly size: number;
  readonly patchSize: number;
  /** Initial spectra: current and previous (for the rebuild cross-fade). */
  readonly spectrumNew: THREE.DataTexture;
  readonly spectrumOld: THREE.DataTexture;
  /** 0 shows the old spectrum, 1 the new one. */
  readonly crossfade = uniform(1);
  /** Simulation time modulo REPEAT_PERIOD. */
  readonly time = uniform(0);
  readonly choppiness = uniform(1);

  /** (lambda * Dx, Dy, lambda * Dz, Jacobian) */
  readonly displacement: THREE.StorageTexture;
  /** (dDy/dx, dDy/dz, lambda * dDx/dx, lambda * dDz/dz) */
  readonly slopes: THREE.StorageTexture;

  readonly evolve: THREE.ComputeNode;
  readonly fftPasses: THREE.ComputeNode[];
  readonly assemble: THREE.ComputeNode;

  /** Packed complex fields after the FFT (exposed for GPU tests). */
  readonly buffer0;
  readonly buffer1;

  constructor(options: CascadeGpuOptions) {
    const N = options.size;
    if ((N & (N - 1)) !== 0 || N > 256) throw new Error('cascade size must be a power of two <= 256');
    this.size = N;
    this.patchSize = options.patchSize;

    const makeSpectrum = () => {
      const t = new THREE.DataTexture(new Float32Array(N * N * 4), N, N, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    this.spectrumNew = makeSpectrum();
    this.spectrumOld = makeSpectrum();

    const makeOutput = (mips: boolean) => {
      const t = new THREE.StorageTexture(N, N);
      t.type = THREE.HalfFloatType;
      t.format = THREE.RGBAFormat;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      t.generateMipmaps = mips;
      t.anisotropy = mips ? 8 : 1;
      return t;
    };
    this.displacement = makeOutput(true);
    this.slopes = makeOutput(true);

    this.buffer0 = instancedArray(N * N, 'vec4');
    this.buffer1 = instancedArray(N * N, 'vec4');

    this.evolve = this.buildEvolve();
    this.fftPasses = [
      this.buildFft(this.buffer0, true),
      this.buildFft(this.buffer1, true),
      this.buildFft(this.buffer0, false),
      this.buildFft(this.buffer1, false),
    ];
    this.assemble = this.buildAssemble();
  }

  /** Uploads a new initial spectrum; the previous one is kept for the cross-fade. */
  setSpectrum(data: Float32Array, instant: boolean): void {
    const oldData = this.spectrumOld.image.data as Float32Array;
    const newData = this.spectrumNew.image.data as Float32Array;
    oldData.set(instant ? data : newData);
    newData.set(data);
    this.spectrumOld.needsUpdate = true;
    this.spectrumNew.needsUpdate = true;
    this.crossfade.value = instant ? 1 : 0;
    this.spectrumVersion++;
  }

  private spectrumVersion = 0;

  private buildEvolve(): THREE.ComputeNode {
    const N = this.size;
    const dk = (2 * Math.PI) / this.patchSize;
    return Fn(() => {
      const i = instanceIndex.mod(N);
      const j = instanceIndex.div(N);
      // Signed mode index from the wrap-around layout.
      const n = select(i.lessThan(N / 2), int(i), int(i).sub(N));
      const m = select(j.lessThan(N / 2), int(j), int(j).sub(N));
      const kx = float(n).mul(dk);
      const kz = float(m).mul(dk);
      const k = sqrt(kx.mul(kx).add(kz.mul(kz))).max(1e-6);
      // Quantized deep-water dispersion.
      const omega = sqrt(k.mul(GRAVITY)).div(OMEGA_0).floor().mul(OMEGA_0);
      const phase = omega.mul(this.time);
      const e = vec2(cos(phase), sin(phase));
      const eConj = vec2(e.x, e.y.negate());

      const coord = ivec2(int(i), int(j));
      const h0 = mix(
        textureLoad(this.spectrumOld, coord),
        textureLoad(this.spectrumNew, coord),
        this.crossfade,
      );
      // h(k, t) = h0(k) e^{i w t} + conj(h0(-k)) e^{-i w t}
      const h = cmul(h0.xy, e).add(cmul(h0.zw, eConj));

      const kxN = kx.div(k);
      const kzN = kz.div(k);
      // Horizontal displacement: D = -i k/|k| h
      const dx = mulI(h).mul(kxN).negate();
      const dz = mulI(h).mul(kzN).negate();
      const dydx = mulI(h).mul(kx);
      const dydz = mulI(h).mul(kz);
      const dxdx = h.mul(kx.mul(kxN));
      const dzdz = h.mul(kz.mul(kzN));
      const dxdz = h.mul(kx.mul(kzN));

      // Pack two real fields per complex spectrum: F + iG.
      const pack = (f: Vec2Node, g: Vec2Node) => f.add(mulI(g));
      const A = pack(dx, dz);
      const B = pack(h, dxdz);
      const C = pack(dydx, dydz);
      const D = pack(dxdx, dzdz);
      this.buffer0.element(instanceIndex).assign(vec4(A, B));
      this.buffer1.element(instanceIndex).assign(vec4(C, D));
    })().compute(N * N, [64]);
  }

  /** In-place inverse FFT of every row (or column) of a vec4 buffer holding two complex numbers per element. */
  private buildFft(buffer: unknown, rows: boolean): THREE.ComputeNode {
    const N = this.size;
    const log2N = Math.log2(N);
    return Fn(() => {
      const line = workgroupId.x;
      const t = localId.x;
      const index = rows ? line.mul(N).add(t) : t.mul(N).add(line);

      const ping = workgroupArray('vec4', N) as unknown as ArrayView;
      const pong = workgroupArray('vec4', N) as unknown as ArrayView;
      const data = buffer as unknown as ArrayView;

      // Bit-reversed load for the decimation-in-time butterflies.
      let rev: UintNode = uint(0);
      for (let b = 0; b < log2N; b++) {
        rev = rev.bitOr(
          t
            .shiftRight(b)
            .bitAnd(1)
            .shiftLeft(log2N - 1 - b),
        );
      }
      ping.element(rev).assign(data.element(index));
      workgroupBarrier();

      let src = ping;
      let dst = pong;
      for (let s = 0; s < log2N; s++) {
        const span = 1 << s;
        const k = t.bitAnd(2 * span - 1);
        const jj = k.bitAnd(span - 1);
        const a = t.sub(k).add(jj);
        const b = a.add(span);
        const angle = float(jj).mul((2 * Math.PI) / (2 * span));
        const w = vec2(cos(angle), sin(angle));
        const xa = src.element(a).toVar();
        const xb = src.element(b).toVar();
        const wb = vec4(cmul(w, xb.xy), cmul(w, xb.zw));
        const sign = select(k.lessThan(span), float(1), float(-1));
        dst.element(t).assign(xa.add(wb.mul(sign)));
        workgroupBarrier();
        [src, dst] = [dst, src];
      }
      data.element(index).assign(src.element(t));
    })().compute(N * N, [N]);
  }

  private buildAssemble(): THREE.ComputeNode {
    const N = this.size;
    return Fn(() => {
      const i = instanceIndex.mod(N);
      const j = instanceIndex.div(N);
      const a = this.buffer0.element(instanceIndex) as unknown as Vec4Node;
      const c = this.buffer1.element(instanceIndex) as unknown as Vec4Node;
      const lambda = this.choppiness;
      const dx = a.x.mul(lambda);
      const dz = a.y.mul(lambda);
      const dy = a.z;
      const dxdz = a.w.mul(lambda);
      const dxdx = c.z.mul(lambda);
      const dzdz = c.w.mul(lambda);
      const jacobian = dxdx.add(1).mul(dzdz.add(1)).sub(dxdz.mul(dxdz));
      const coord = uvec2(i, j);
      textureStore(this.displacement, coord, vec4(dx, dy, dz, jacobian)).toWriteOnly();
      textureStore(this.slopes, coord, vec4(c.x, c.y, dxdx, dzdz)).toWriteOnly();
    })().compute(N * N, [64]);
  }

  private lastKey = '';

  /** Dispatches the full cascade update for time `t` (seconds). Skipped when nothing changed. */
  update(renderer: THREE.WebGPURenderer, t: number, choppiness: number, crossfadeStep = 0): void {
    if (this.crossfade.value < 1) this.crossfade.value = Math.min(1, this.crossfade.value + crossfadeStep);
    const key = `${t}|${choppiness}|${this.crossfade.value}|${this.spectrumVersion}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.time.value = t % REPEAT_PERIOD;
    this.choppiness.value = choppiness;
    renderer.compute(this.evolve);
    for (const pass of this.fftPasses) renderer.compute(pass);
    renderer.compute(this.assemble);
  }
}
