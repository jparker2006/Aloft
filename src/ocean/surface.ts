// Ocean surface material and geometry.
import * as THREE from 'three/webgpu';
import { Fn, cameraPosition, float, max, mix, varying, vec4 } from 'three/tsl';
import type { FrameUniforms } from '../render/frameUniforms';
import type { LookUniforms } from '../render/look';
import type { WeatherUniforms } from '../render/weather';
import type { Ocean } from './ocean';
import type { LightningUniforms } from '../fx/lightning';
import { flashLightAt, foamRadiance, makeFoamCoverage, makeSeaShading } from './shading';
import { shaderPosition } from '../render/velocity';

type V3 = THREE.Node<'vec3'>;

/**
 * Builds the sea surface material for one clipmap level.
 * @param basePosition node giving the vertex's undisplaced world position (y = 0)
 */
export function createOceanMaterial(
  ocean: Ocean,
  look: LookUniforms,
  weather: WeatherUniforms,
  frame: FrameUniforms,
  foamTexture: THREE.Texture,
  reflectedSky: (dir: V3) => V3,
  lightning: LightningUniforms | null,
  basePosition: V3,
): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const shade = makeSeaShading(look, weather, reflectedSky);
  const foamCoverage = makeFoamCoverage(foamTexture, weather);

  // Vertex: undisplaced world XZ -> displaced world position. Meshes keep an identity transform.
  const baseXZ = basePosition.xz;
  const vertexDistance = baseXZ.sub(cameraPosition.xz).length();
  const displaced = basePosition.add(ocean.displacement(baseXZ, vertexDistance));
  material.positionNode = shaderPosition(displaced as V3);

  const gridXZ = varying(baseXZ, 'vGridXZ');
  const worldPos = varying(displaced, 'vWorldPos');

  material.colorNode = Fn(() => {
    const toCamera = cameraPosition.sub(worldPos);
    const distance = toCamera.length();
    const view = toCamera.div(distance) as V3;
    const normal = ocean.normalFromSlopes(ocean.slopes(gridXZ, distance));
    const flash = flashLightAt(lightning, worldPos as V3);
    const sea = shade({ normal, view, distance, height: worldPos.y, gridXZ, time: frame.time }, flash);
    const coverage = foamCoverage({ amount: ocean.foamAmount(gridXZ), gridXZ, normal, view });
    // Foam also sits on the crest glow: it is lit from behind like the water it rides on.
    const foam = foamRadiance(look, normal, view, flash);
    const color = mix(sea, foam, coverage.mul(float(0.92)));
    return vec4(max(color, float(0)), 1);
  })();
  return material;
}
