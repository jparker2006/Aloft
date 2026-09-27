// Tileable 3D noise volumes for the storm clouds, generated once on the GPU in compute.
//   shape  (128^3, rgba8unorm)  r: Perlin-Worley (billowy base shape), g/b/a: Worley fBm at 2x/4x/8x
//   detail (32^3,  rgba8unorm)  r/g/b: Worley fBm for eroding edges
// Every noise is periodic over the volume so clouds tile seamlessly across the sky.
import * as THREE from 'three/webgpu';
import {
  Fn,
  NodeAccess,
  float,
  floor,
  fract,
  instanceIndex,
  int,
  ivec3,
  max,
  min,
  mix,
  mod,
  saturate,
  storageTexture3D,
  textureStore,
  uint,
  uvec3,
  vec3,
  vec4,
} from 'three/tsl';

type F = THREE.Node<'float'>;
type V3 = THREE.Node<'vec3'>;
type U3 = THREE.Node<'uvec3'>;

/** PCG3D hash: uvec3 -> uvec3 (Jarzynski and Olano). */
function pcg3d(vIn: U3): U3 {
  const v = vIn.mul(uint(1664525)).add(uint(1013904223)).toVar();
  v.x.addAssign(v.y.mul(v.z));
  v.y.addAssign(v.z.mul(v.x));
  v.z.addAssign(v.x.mul(v.y));
  // The published TSL types omit bit operators on vector vars.
  const bits = v as unknown as {
    assign(x: unknown): void;
    bitXor(x: unknown): unknown;
    shiftRight(x: unknown): unknown;
  };
  bits.assign(bits.bitXor(bits.shiftRight(uint(16))));
  v.x.addAssign(v.y.mul(v.z));
  v.y.addAssign(v.z.mul(v.x));
  v.z.addAssign(v.x.mul(v.y));
  return v as unknown as U3;
}

/** Random vec3 in [0, 1) for an integer lattice cell wrapped to `period`. */
function cellRandom(cell: V3, period: number, seed: number): V3 {
  const wrapped = mod(cell.add(period * 64), period);
  const h = pcg3d(uvec3(wrapped).add(uint(seed * 7919)));
  return vec3(h).div(4294967296.0) as unknown as V3;
}

/** Periodic Worley F1 distance at frequency `period` for p in [0, 1)^3, inverted so cells are bright. */
function worley(p: V3, period: number, seed: number): F {
  const q = p.mul(period);
  const cell = floor(q);
  const f = fract(q);
  let dmin: F = float(10);
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const o = vec3(x, y, z);
        const point = o.add(cellRandom(cell.add(o), period, seed));
        dmin = min(dmin, point.sub(f).length()) as F;
      }
    }
  }
  return saturate(float(1).sub(dmin)) as F;
}

/** Periodic gradient (Perlin) noise in [-1, 1]. */
function perlin(p: V3, period: number, seed: number): F {
  const q = p.mul(period);
  const cell = floor(q);
  const f = fract(q);
  const u = f
    .mul(f)
    .mul(f)
    .mul(f.mul(f.mul(6).sub(15)).add(10));
  const corner = (x: number, y: number, z: number) => {
    const o = vec3(x, y, z);
    const g = cellRandom(cell.add(o), period, seed).mul(2).sub(1).normalize();
    return g.dot(f.sub(o));
  };
  const x00 = mix(corner(0, 0, 0), corner(1, 0, 0), u.x);
  const x10 = mix(corner(0, 1, 0), corner(1, 1, 0), u.x);
  const x01 = mix(corner(0, 0, 1), corner(1, 0, 1), u.x);
  const x11 = mix(corner(0, 1, 1), corner(1, 1, 1), u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) as unknown as F;
}

function worleyFbm(p: V3, period: number, seed: number): F {
  return worley(p, period, seed)
    .mul(0.625)
    .add(worley(p, period * 2, seed + 1).mul(0.25))
    .add(worley(p, period * 4, seed + 2).mul(0.125)) as F;
}

const toF = (x: number | F): F => (typeof x === 'number' ? (float(x) as F) : x);

function remap(v: F, a: number | F, b: number | F, c: number, d: number): F {
  return float(c).add(
    v
      .sub(a)
      .div(toF(b).sub(a))
      .mul(d - c),
  ) as F;
}

function makeVolume(size: number): THREE.Storage3DTexture {
  const t = new THREE.Storage3DTexture(size, size, size);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export class CloudNoise {
  readonly shape = makeVolume(128);
  readonly detail = makeVolume(32);
  private generated = false;

  generate(renderer: THREE.WebGPURenderer): void {
    if (this.generated) return;
    this.generated = true;
    renderer.compute(this.buildShape());
    renderer.compute(this.buildDetail());
  }

  private buildShape(): THREE.ComputeNode {
    const N = 128;
    const target = storageTexture3D(this.shape).setAccess(NodeAccess.WRITE_ONLY);
    return Fn(() => {
      const x = instanceIndex.mod(N);
      const y = instanceIndex.div(N).mod(N);
      const z = instanceIndex.div(N * N);
      const p = vec3(x, y, z).add(0.5).div(N) as unknown as V3;
      const perlinFbm = perlin(p, 4, 1)
        .mul(0.5)
        .add(perlin(p, 8, 2).mul(0.25))
        .add(perlin(p, 16, 3).mul(0.125))
        .mul(0.5)
        .add(0.5);
      const w = worleyFbm(p, 4, 10);
      // Perlin-Worley: Perlin's continuity dilated by Worley's billows.
      const perlinWorley = saturate(remap(perlinFbm as F, w.oneMinus(), 1, 0, 1));
      const g = worleyFbm(p, 8, 20);
      const b = worleyFbm(p, 16, 30);
      const a = worleyFbm(p, 32, 40);
      textureStore(target, ivec3(int(x), int(y), int(z)), vec4(max(perlinWorley, 0), g, b, a));
    })().compute(N * N * N, [64]);
  }

  private buildDetail(): THREE.ComputeNode {
    const N = 32;
    const target = storageTexture3D(this.detail).setAccess(NodeAccess.WRITE_ONLY);
    return Fn(() => {
      const x = instanceIndex.mod(N);
      const y = instanceIndex.div(N).mod(N);
      const z = instanceIndex.div(N * N);
      const p = vec3(x, y, z).add(0.5).div(N) as unknown as V3;
      textureStore(
        target,
        ivec3(int(x), int(y), int(z)),
        vec4(worleyFbm(p, 2, 50), worleyFbm(p, 4, 60), worleyFbm(p, 8, 70), 1),
      );
    })().compute(N * N * N, [64]);
  }
}
