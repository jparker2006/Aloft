// Lighting presets (SPEC section 6). A preset is a flat dictionary of numeric look keys.
// resolvePreset() merges defaults with overrides; LookUniforms fans a look out to shared TSL uniform
// nodes that every material and pass reads; LookBlender blends between looks over 2.5 s.
// Colors are linear RGB triples. No scene traversal and no material patching.

import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { UniformNode } from 'three/webgpu';
import type { PresetName } from '../app/params';
import { HERO_BEARING } from '../shots';

export type Vec3 = readonly [number, number, number];

export interface Look {
  // Key light: the sun at dusk, the moon behind cloud at night.
  keyBearing: number;
  keyElevation: number;
  keyColor: Vec3;
  keyIntensity: number;
  /** Size of the visible sun or moon disc, as an angular radius in degrees. */
  keyDiscRadius: number;
  keyDiscIntensity: number;

  // Sky dome under and around the clouds.
  skyHorizon: Vec3;
  /** Horizon color facing away from the key light (under an overcast, only the sunward side glows). */
  skyHorizonAway: Vec3;
  skyZenith: Vec3;
  /** Diffuse fill from the overcast sky, linear irradiance. */
  ambient: Vec3;

  // Storm cloud deck.
  cloudCoverage: number;
  cloudDensity: number;
  cloudBase: number;
  cloudThickness: number;
  /** A break in the deck near the horizon that lets the key light through (dusk). */
  cloudGapBearing: number;
  cloudGapWidth: number;
  cloudGapStrength: number;
  cloudLight: Vec3;
  cloudShadow: Vec3;

  // Atmosphere.
  fogDensity: number;
  fogHeightFalloff: number;
  fogColor: Vec3;

  // Water optics.
  waterScatter: Vec3;
  waterDeep: Vec3;
  subsurface: number;
  foamBrightness: number;

  // Camera and grade.
  exposure: number;
  bloomStrength: number;
  saturation: number;
  contrast: number;
  lift: Vec3;
  gamma: Vec3;
  gain: Vec3;
  splitShadows: Vec3;
  splitHighlights: Vec3;
  vignette: number;
  grain: number;

  lanternGain: number;
}

export type LookKey = keyof Look;

/** sRGB hex to a linear RGB triple. */
export function srgbHex(hex: number): Vec3 {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}

export const DEFAULT_LOOK: Readonly<Look> = Object.freeze<Look>({
  keyBearing: HERO_BEARING,
  keyElevation: 10,
  keyColor: [1, 0.95, 0.9],
  keyIntensity: 3,
  keyDiscRadius: 0.27,
  keyDiscIntensity: 40,

  skyHorizon: srgbHex(0x6d7680),
  skyHorizonAway: srgbHex(0x6d7680),
  skyZenith: srgbHex(0x2a3038),
  ambient: [0.06, 0.07, 0.08],

  cloudCoverage: 0.8,
  cloudDensity: 0.06,
  cloudBase: 600,
  cloudThickness: 1600,
  cloudGapBearing: HERO_BEARING,
  cloudGapWidth: 0,
  cloudGapStrength: 0,
  cloudLight: [1, 1, 1],
  cloudShadow: [0.1, 0.11, 0.13],

  fogDensity: 0.00018,
  fogHeightFalloff: 1 / 350,
  fogColor: srgbHex(0x5a626b),

  waterScatter: srgbHex(0x1e5a4c),
  waterDeep: srgbHex(0x03100f),
  subsurface: 1,
  foamBrightness: 1,

  exposure: 1,
  bloomStrength: 0.06,
  saturation: 1,
  contrast: 1,
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  splitShadows: [0, 0, 0],
  splitHighlights: [0, 0, 0],
  vignette: 0.25,
  grain: 0.02,

  lanternGain: 1,
});

export const PRESETS: Readonly<Record<PresetName, Partial<Look>>> = {
  dusk: {
    keyBearing: HERO_BEARING,
    keyElevation: 2.5,
    keyColor: [1, 0.52, 0.24],
    keyIntensity: 4,
    keyDiscIntensity: 60,
    skyHorizon: srgbHex(0xc0643a),
    skyHorizonAway: srgbHex(0x4c4846),
    skyZenith: srgbHex(0x1b1f27),
    ambient: [0.05, 0.055, 0.065],
    cloudCoverage: 0.94,
    cloudGapWidth: 38,
    cloudGapStrength: 1,
    cloudLight: [1, 0.62, 0.36],
    cloudShadow: [0.016, 0.017, 0.02],
    fogColor: srgbHex(0x6b5a50),
    // Grade targets measured from the dusk references: teal-blue shadows (about 16, 26, 32 sRGB),
    // neutral midtones near 70, orange highlights (red/blue about 1.8).
    exposure: 0.8,
    saturation: 1.18,
    contrast: 1.1,
    splitShadows: [0, 0.014, 0.022],
    splitHighlights: [0.035, 0.008, -0.03],
  },
  night: {
    keyBearing: 150,
    keyElevation: 35,
    keyColor: [0.55, 0.65, 0.85],
    keyIntensity: 0.04,
    keyDiscIntensity: 0,
    skyHorizon: srgbHex(0x10141b),
    skyHorizonAway: srgbHex(0x10141b),
    skyZenith: srgbHex(0x030406),
    ambient: [0.004, 0.005, 0.007],
    cloudCoverage: 0.96,
    cloudLight: [0.6, 0.7, 0.9],
    cloudShadow: [0.0015, 0.0018, 0.0025],
    fogColor: srgbHex(0x0c1016),
    fogDensity: 0.00024,
    exposure: 1.6,
    subsurface: 0.6,
    saturation: 0.94,
    contrast: 1.05,
    splitShadows: [0, 0.004, 0.012],
  },
};

export function resolvePreset(name: PresetName, overrides: Partial<Look> = {}): Look {
  return { ...DEFAULT_LOOK, ...PRESETS[name], ...overrides };
}

function isVec3(v: number | Vec3): v is Vec3 {
  return Array.isArray(v);
}

/** Component-wise interpolation of every look key. */
export function lerpLook(a: Look, b: Look, t: number): Look {
  const out: Record<string, number | Vec3> = {};
  for (const key of Object.keys(a) as LookKey[]) {
    const va = a[key];
    const vb = b[key];
    if (isVec3(va) && isVec3(vb)) {
      out[key] = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t];
    } else if (key === 'keyBearing' || key === 'cloudGapBearing') {
      // Shortest arc around the compass.
      const d = (((((vb as number) - (va as number)) % 360) + 540) % 360) - 180;
      out[key] = (va as number) + d * t;
    } else {
      out[key] = (va as number) + ((vb as number) - (va as number)) * t;
    }
  }
  return out as unknown as Look;
}

type LookUniformMap = {
  [K in LookKey]: Look[K] extends number ? UniformNode<'float', number> : UniformNode<'vec3', THREE.Vector3>;
};

/** Shared TSL uniforms for every look key, plus derived values. */
export class LookUniforms {
  readonly u: LookUniformMap;
  /** Unit vector toward the key light, derived from bearing and elevation. */
  readonly keyDirection = uniform(new THREE.Vector3(0, 1, 0));
  private current: Look;

  constructor(initial: Look) {
    const u: Record<string, UniformNode<'float', number> | UniformNode<'vec3', THREE.Vector3>> = {};
    for (const [key, value] of Object.entries(initial) as [LookKey, number | Vec3][]) {
      u[key] = isVec3(value) ? uniform(new THREE.Vector3(...value)) : uniform(value);
    }
    this.u = u as LookUniformMap;
    this.current = initial;
    this.apply(initial);
  }

  get look(): Look {
    return this.current;
  }

  apply(look: Look): void {
    this.current = look;
    for (const [key, value] of Object.entries(look) as [LookKey, number | Vec3][]) {
      const node = this.u[key];
      if (isVec3(value)) (node.value as THREE.Vector3).set(value[0], value[1], value[2]);
      else (node as UniformNode<'float', number>).value = value;
    }
    const b = (look.keyBearing * Math.PI) / 180;
    const e = (look.keyElevation * Math.PI) / 180;
    this.keyDirection.value.set(-Math.sin(b) * Math.cos(e), Math.sin(e), Math.cos(b) * Math.cos(e));
  }
}

export const LOOK_BLEND_SECONDS = 2.5;

/** Blends from the current look to a target preset with smoothstep easing. */
export class LookBlender {
  readonly name = 'look-blender';
  private from: Look;
  private to: Look;
  private t = 1;

  constructor(
    private readonly uniforms: LookUniforms,
    private readonly seconds = LOOK_BLEND_SECONDS,
  ) {
    this.from = uniforms.look;
    this.to = uniforms.look;
  }

  get target(): Look {
    return this.to;
  }

  get blending(): boolean {
    return this.t < 1;
  }

  /** Starts a blend, or snaps immediately when `instant` (captures pin presets with no blend). */
  setTarget(look: Look, instant = false): void {
    this.from = instant ? look : this.uniforms.look;
    this.to = look;
    this.t = instant ? 1 : 0;
    this.uniforms.apply(instant ? look : this.from);
  }

  step(dt: number): void {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.seconds);
    const s = this.t * this.t * (3 - 2 * this.t);
    this.uniforms.apply(this.t >= 1 ? this.to : lerpLook(this.from, this.to, s));
  }
}
