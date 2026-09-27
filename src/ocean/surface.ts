// Ocean surface material and geometry.
import * as THREE from 'three/webgpu';
import { Fn, abs, cameraPosition, dot, float, max, mix, pow, reflect, varying, vec3, vec4 } from 'three/tsl';
import type { LookUniforms } from '../render/look';
import { makeSkyRadiance } from '../sky/skyFunction';
import type { Ocean } from './ocean';

type V3 = THREE.Node<'vec3'>;

/**
 * Builds the sea surface material for one clipmap level.
 * @param basePosition node giving the vertex's undisplaced world position (y = 0)
 */
export function createOceanMaterial(
  ocean: Ocean,
  look: LookUniforms,
  basePosition: V3,
): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const sky = makeSkyRadiance(look);

  // Vertex: undisplaced world XZ -> displaced world position. Meshes keep an identity transform.
  const baseXZ = basePosition.xz;
  const vertexDistance = baseXZ.sub(cameraPosition.xz).length();
  const displaced = basePosition.add(ocean.displacement(baseXZ, vertexDistance));
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
