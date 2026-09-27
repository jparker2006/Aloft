// Placeholder sky: a vertical gradient per preset. Replaced by the volumetric storm sky in step 6.
import * as THREE from 'three/webgpu';
import { mix, normalize, positionLocal, pow, uniform, max } from 'three/tsl';
import type { PresetName } from '../app/params';

const LOOKS: Record<PresetName, { horizon: number; zenith: number }> = {
  dusk: { horizon: 0xc0643a, zenith: 0x1b1f27 },
  night: { horizon: 0x10141b, zenith: 0x030406 },
};

export class GradientSky {
  readonly name = 'gradient-sky';
  private readonly horizon = uniform(new THREE.Color());
  private readonly zenith = uniform(new THREE.Color());

  constructor(scene: THREE.Scene) {
    const dir = normalize(positionLocal);
    const t = pow(max(dir.y, 0), 0.45);
    scene.backgroundNode = mix(this.horizon, this.zenith, t);
    this.setPreset('dusk');
  }

  setPreset(preset: PresetName): void {
    this.horizon.value.setHex(LOOKS[preset].horizon);
    this.zenith.value.setHex(LOOKS[preset].zenith);
  }
}
