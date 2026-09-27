// Ocean surface material and geometry.
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  cameraPosition,
  dot,
  float,
  max,
  mix,
  pow,
  positionLocal,
  reflect,
  varying,
  vec3,
  vec4,
} from 'three/tsl';
import type { LookUniforms } from '../render/look';
import { makeSkyRadiance } from '../sky/skyFunction';
import type { Ocean } from './ocean';

type V3 = THREE.Node<'vec3'>;

export function createOceanMaterial(ocean: Ocean, look: LookUniforms): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const sky = makeSkyRadiance(look);

  // Vertex: undisplaced world XZ -> displaced world position.
  const baseXZ = positionLocal.xz;
  const vertexDistance = baseXZ.sub(cameraPosition.xz).length();
  const displaced = positionLocal.add(ocean.displacement(baseXZ, vertexDistance));
  material.positionNode = displaced;

  const gridXZ = varying(baseXZ, 'vGridXZ');
  const worldPos = varying(displaced, 'vWorldPos');

  material.colorNode = Fn(() => {
    const toCamera = cameraPosition.sub(worldPos);
    const distance = toCamera.length();
    const v = toCamera.div(distance);
    const n = ocean.normalFromSlopes(ocean.slopes(gridXZ, distance));
    const nDotV = max(dot(n, v), 0.001);
    const fresnel = float(0.02).add(float(0.98).mul(pow(float(1).sub(nDotV), 5)));
    const r = reflect(v.negate(), n) as V3;
    const rUp = vec3(r.x, abs(r.y), r.z);
    const reflection = sky(rUp);
    const sunSpec = pow(max(dot(rUp, look.keyDirection), 0), 600)
      .mul(look.u.keyIntensity)
      .mul(40);
    const water = look.u.waterDeep.add(look.u.waterScatter.mul(0.08));
    const color = mix(water, reflection, fresnel).add(look.u.keyColor.mul(sunSpec).mul(fresnel));
    return vec4(color, 1);
  })();
  return material;
}

/** Temporary single-level grid for step 5b; replaced by the clipmap. */
export function createTestGrid(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(2048, 2048, 512, 512);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
