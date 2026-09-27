// Placeholder sky background from the shared analytic sky function. Replaced by the volumetric storm sky
// in step 6.
import type * as THREE from 'three/webgpu';
import { positionLocal } from 'three/tsl';
import type { LookUniforms } from '../render/look';
import { makeSkyRadiance } from './skyFunction';

export class GradientSky {
  readonly name = 'gradient-sky';

  constructor(scene: THREE.Scene, look: LookUniforms) {
    scene.backgroundNode = makeSkyRadiance(look)(positionLocal);
  }
}
