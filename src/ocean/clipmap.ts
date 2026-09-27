// Camera-centred geometry clipmap for the sea surface (SPEC section 7).
//
// Level l has cell size s_l = BASE_CELL * 2^l and covers GRID x GRID cells around its own centre, which is
// snapped to a multiple of 2 * s_l so its vertices always sit on the next coarser lattice. Level 0 is a
// full grid; levels 1..7 are rings whose hole is exactly the finer level's footprint. Because the finer
// centre is snapped to s_l, the hole is always aligned to the ring's own lattice and can only sit at one
// of nine offsets (-1, 0, +1 cells per axis): one shared vertex buffer and nine index buffers cover every
// case, so the rings are watertight with no L-shaped fix-up strips.
//
// Near its outer edge each level morphs odd vertices onto the coarser lattice, so there are no T-junction
// cracks against the next level. A flat skirt carries the sea from the last ring to the horizon.

import * as THREE from 'three/webgpu';
import { abs, float, max, positionLocal, smoothstep, uniform, vec3 } from 'three/tsl';

type Vec2Uniform = THREE.UniformNode<'vec2', THREE.Vector2>;
type FloatUniform = THREE.UniformNode<'float', number>;

export const LEVELS = 8;
/** Cells per side of each level. Must be a multiple of 4. */
export const GRID = 128;
export const BASE_CELL = 0.25;
/** Width of the morph band at a level's outer edge, in that level's cells. */
const MORPH_CELLS = 16;
/** Outer half-size of the far skirt, meters. */
export const SKIRT_EXTENT = 40000;

export interface LevelInfo {
  level: number;
  cell: number;
  /** Snapped centre, world XZ. */
  centerX: number;
  centerZ: number;
  /** Offset of the finer level's hole relative to this level's centre, in cells (-1, 0, +1). */
  holeX: number;
  holeZ: number;
}

/** Snapped centres and hole offsets for every level, for a camera at (x, z). Pure, for tests. */
export function computeLevels(cameraX: number, cameraZ: number): LevelInfo[] {
  const out: LevelInfo[] = [];
  for (let l = 0; l < LEVELS; l++) {
    const cell = BASE_CELL * 2 ** l;
    const snap = 2 * cell;
    out.push({
      level: l,
      cell,
      centerX: Math.round(cameraX / snap) * snap,
      centerZ: Math.round(cameraZ / snap) * snap,
      holeX: 0,
      holeZ: 0,
    });
  }
  for (let l = 1; l < LEVELS; l++) {
    const fine = out[l - 1]!;
    const here = out[l]!;
    here.holeX = Math.round((fine.centerX - here.centerX) / here.cell);
    here.holeZ = Math.round((fine.centerZ - here.centerZ) / here.cell);
  }
  return out;
}

/** Shared vertex positions of one level in cell units, centred on the origin: (GRID + 1)^2 vertices. */
function levelPositions(): Float32Array {
  const n = GRID + 1;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 3;
      pos[o] = i - GRID / 2;
      pos[o + 1] = 0;
      pos[o + 2] = j - GRID / 2;
    }
  }
  return pos;
}

/** Triangle indices for a level, skipping cells inside the hole (null hole = full grid). */
function levelIndices(hole: { x: number; z: number } | null): Uint32Array {
  const n = GRID + 1;
  const quarter = GRID / 4;
  const idx: number[] = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      if (hole) {
        const ci = i - GRID / 2 - hole.x;
        const cj = j - GRID / 2 - hole.z;
        if (ci >= -quarter && ci < quarter && cj >= -quarter && cj < quarter) continue;
      }
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // Alternate the diagonal in a checkerboard so the mesh has no directional bias.
      if ((i + j) % 2 === 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  }
  return Uint32Array.from(idx);
}

export class Clipmap {
  readonly group = new THREE.Group();
  private readonly levelMeshes: THREE.Mesh[] = [];
  private readonly holeGeometries = new Map<string, THREE.BufferGeometry>();
  private readonly levelUniforms: { center: Vec2Uniform; cell: FloatUniform }[] = [];

  /**
   * @param makeMaterial builds a material for a level given a node computing that vertex's undisplaced
   *   world position (y = 0). Levels share one material shape but need their own uniforms.
   */
  constructor(makeMaterial: (worldPosition: THREE.Node<'vec3'>) => THREE.Material) {
    const positions = new THREE.BufferAttribute(levelPositions(), 3);
    const full = new THREE.BufferGeometry();
    full.setAttribute('position', positions);
    full.setIndex(new THREE.BufferAttribute(levelIndices(null), 1));
    for (let hx = -1; hx <= 1; hx++) {
      for (let hz = -1; hz <= 1; hz++) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', positions);
        g.setIndex(new THREE.BufferAttribute(levelIndices({ x: hx, z: hz }), 1));
        this.holeGeometries.set(`${hx},${hz}`, g);
      }
    }

    for (let l = 0; l < LEVELS; l++) {
      const center = uniform(new THREE.Vector2());
      const cell = uniform(BASE_CELL * 2 ** l);
      this.levelUniforms.push({ center, cell });
      const mesh = new THREE.Mesh(
        l === 0 ? full : this.holeGeometries.get('0,0')!,
        makeMaterial(levelWorld(center, cell)),
      );
      mesh.frustumCulled = false;
      mesh.name = `ocean-level-${l}`;
      this.levelMeshes.push(mesh);
      this.group.add(mesh);
    }

    // Far skirt: a square annulus from the last level's edge out to the horizon.
    const skirtCenter = uniform(new THREE.Vector2());
    const skirt = new THREE.Mesh(skirtGeometry(), makeMaterial(skirtWorld(skirtCenter)));
    skirt.frustumCulled = false;
    skirt.name = 'ocean-skirt';
    this.skirtCenter = skirtCenter;
    this.group.add(skirt);
  }

  private readonly skirtCenter: Vec2Uniform;

  /** Re-centres every level on the camera. Call once per frame before rendering. */
  update(camera: THREE.Camera): void {
    const levels = computeLevels(camera.position.x, camera.position.z);
    levels.forEach((info, l) => {
      this.levelUniforms[l]!.center.value.set(info.centerX, info.centerZ);
      if (l > 0) this.levelMeshes[l]!.geometry = this.holeGeometries.get(`${info.holeX},${info.holeZ}`)!;
    });
    const last = levels[LEVELS - 1]!;
    this.skirtCenter.value.set(last.centerX, last.centerZ);
  }
}

/** World position of a level vertex, with outer-edge morphing onto the coarser lattice. */
function levelWorld(center: Vec2Uniform, cell: FloatUniform): THREE.Node<'vec3'> {
  const gridPos = positionLocal.xz; // integer cell coordinates, centred on 0
  const half = GRID / 2;
  const edge = max(abs(gridPos.x), abs(gridPos.y));
  const morph = smoothstep(float(half - MORPH_CELLS), float(half - 2), edge);
  // Odd vertices slide to the even neighbour on the coarser lattice (index parity relative to the snapped
  // centre, which sits on an even lattice point).
  const odd = gridPos.mod(2);
  const morphed = gridPos.sub(odd.mul(morph));
  const world = center.add(morphed.mul(cell));
  return vec3(world.x, 0, world.y);
}

/** Skirt geometry in normalized coordinates: inner square |x| = 1 (last level edge), outer = extent. */
function skirtGeometry(): THREE.BufferGeometry {
  const lastHalf = (GRID / 2) * BASE_CELL * 2 ** (LEVELS - 1);
  const rings = [
    lastHalf,
    lastHalf * 1.25,
    lastHalf * 1.7,
    lastHalf * 2.6,
    lastHalf * 4.5,
    lastHalf * 9,
    SKIRT_EXTENT,
  ];
  const perSide = GRID / 2; // vertices along the inner edge match the last level's morphed (2-cell) lattice
  const ring = (r: number) => {
    const pts: [number, number][] = [];
    for (let s = 0; s < 4; s++) {
      for (let k = 0; k < perSide; k++) {
        const t = -1 + (2 * k) / perSide;
        const [x, z] = s === 0 ? [t, -1] : s === 1 ? [1, t] : s === 2 ? [-t, 1] : [-1, -t];
        pts.push([x * r, z * r]);
      }
    }
    return pts;
  };
  const pos: number[] = [];
  const idx: number[] = [];
  const count = perSide * 4;
  rings.forEach((r, ri) => {
    for (const [x, z] of ring(r)) pos.push(x, 0, z);
    if (ri === 0) return;
    const a0 = (ri - 1) * count;
    const b0 = ri * count;
    for (let k = 0; k < count; k++) {
      const k1 = (k + 1) % count;
      idx.push(a0 + k, a0 + k1, b0 + k, a0 + k1, b0 + k1, b0 + k);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function skirtWorld(center: Vec2Uniform): THREE.Node<'vec3'> {
  const world = center.add(positionLocal.xz);
  return vec3(world.x, 0, world.y);
}
