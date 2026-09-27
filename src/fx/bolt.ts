// Lightning bolt geometry: a seeded, branching path from the cloud to the sea, rendered as camera-facing
// emissive ribbons that bloom. Rebuilt on each strike (a few hundred segments, cheap).
import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cross,
  float,
  mix,
  normalize,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { Rng } from '../app/rng';
import type { LightningUniforms, Strike } from './lightning';

type V3 = THREE.Node<'vec3'>;

interface Segment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  width: number;
  brightness: number;
}

/** Midpoint displacement between two points, `depth` subdivisions, roughness relative to length. */
function jaggedPath(
  rng: Rng,
  a: THREE.Vector3,
  b: THREE.Vector3,
  depth: number,
  roughness: number,
): THREE.Vector3[] {
  let points = [a.clone(), b.clone()];
  let amount = a.distanceTo(b) * roughness;
  for (let d = 0; d < depth; d++) {
    const next: THREE.Vector3[] = [points[0]!];
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i]!;
      const q = points[i + 1]!;
      const mid = p.clone().add(q).multiplyScalar(0.5);
      mid.x += rng.range(-amount, amount);
      mid.z += rng.range(-amount, amount);
      mid.y += rng.range(-amount, amount) * 0.3;
      next.push(mid, q);
    }
    points = next;
    amount *= 0.55;
  }
  return points;
}

export function boltSegments(strike: Strike): Segment[] {
  const rng = new Rng(strike.seed);
  const segments: Segment[] = [];
  const addPath = (points: THREE.Vector3[], width: number, brightness: number) => {
    for (let i = 0; i < points.length - 1; i++) {
      segments.push({ a: points[i]!, b: points[i + 1]!, width, brightness });
    }
  };
  const trunk = jaggedPath(rng, strike.cloud, strike.ground, 7, 0.12);
  addPath(trunk, 6, 1);
  // Branches leave the upper two thirds of the trunk and die out before reaching the sea.
  const branches = rng.int(3, 7);
  for (let k = 0; k < branches; k++) {
    const i = rng.int(2, Math.floor(trunk.length * 0.66));
    const from = trunk[i]!;
    const length = rng.range(150, 700);
    const to = from
      .clone()
      .add(
        new THREE.Vector3(rng.range(-1, 1) * length, -rng.range(0.4, 1) * length, rng.range(-1, 1) * length),
      );
    to.y = Math.max(to.y, 40);
    addPath(jaggedPath(rng, from, to, 5, 0.18), 2.5, rng.range(0.35, 0.7));
  }
  return segments;
}

/** A mesh of ribbons; each quad's corners are pushed sideways in the vertex shader to face the camera. */
export class BoltMesh {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly scale = uniform(1);

  constructor(lightning: LightningUniforms) {
    const material = new THREE.MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.AdditiveBlending;
    const start = attribute<'vec3'>('aStart', 'vec3') as unknown as V3;
    const end = attribute<'vec3'>('aEnd', 'vec3') as unknown as V3;
    const side = attribute<'float'>('aSide', 'float');
    const along = attribute<'float'>('aAlong', 'float');
    const width = attribute<'float'>('aWidth', 'float');
    const brightness = attribute<'float'>('aBrightness', 'float');
    const center = mix(start, end, along);
    const tangent = normalize(end.sub(start));
    const toCamera = normalize(cameraPosition.sub(center));
    const sideways = normalize(cross(tangent, toCamera));
    // Keep bolts at least ~2 px wide however far away they are.
    const distance = cameraPosition.sub(center).length();
    const w = width.max(distance.mul(0.0012)).mul(this.scale);
    material.positionNode = center.add(sideways.mul(side.mul(w)));
    const core = float(1).sub(smoothstep(0.3, 1, side.abs()));
    material.colorNode = vec4(vec3(lightning.color).mul(lightning.bolt).mul(brightness).mul(core).mul(60), 1);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  rebuild(strike: Strike): void {
    const segments = boltSegments(strike);
    const n = segments.length;
    const start = new Float32Array(n * 4 * 3);
    const end = new Float32Array(n * 4 * 3);
    const side = new Float32Array(n * 4);
    const along = new Float32Array(n * 4);
    const width = new Float32Array(n * 4);
    const brightness = new Float32Array(n * 4);
    const index: number[] = [];
    segments.forEach((s, i) => {
      for (let c = 0; c < 4; c++) {
        const v = i * 4 + c;
        start.set([s.a.x, s.a.y, s.a.z], v * 3);
        end.set([s.b.x, s.b.y, s.b.z], v * 3);
        side[v] = c % 2 === 0 ? -1 : 1;
        along[v] = c < 2 ? 0 : 1;
        width[v] = s.width;
        brightness[v] = s.brightness;
      }
      const o = i * 4;
      index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    });
    const g = this.geometry;
    // A position attribute is required for draw counts; the shader ignores it.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    g.setAttribute('aWidth', new THREE.BufferAttribute(width, 1));
    g.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
    g.setIndex(index);
    this.mesh.visible = true;
  }
}
