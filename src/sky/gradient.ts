// Placeholder sky: a vertical gradient from the look's horizon and zenith colors.
// Replaced by the volumetric storm sky in step 6.
import type * as THREE from 'three/webgpu';
import { max, mix, normalize, positionLocal, pow } from 'three/tsl';
import type { LookUniforms } from '../render/look';

export class GradientSky {
  readonly name = 'gradient-sky';

  constructor(scene: THREE.Scene, look: LookUniforms) {
    const dir = normalize(positionLocal);
    const t = pow(max(dir.y, 0), 0.45);
    scene.backgroundNode = mix(look.u.skyHorizon, look.u.skyZenith, t);
  }
}
