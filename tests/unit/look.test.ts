import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOK,
  LookBlender,
  LookUniforms,
  PRESETS,
  lerpLook,
  resolvePreset,
} from '../../src/render/look';

describe('lighting presets', () => {
  it('merges defaults, preset and overrides in that order', () => {
    const dusk = resolvePreset('dusk', { exposure: 2 });
    expect(dusk.keyElevation).toBe(PRESETS.dusk.keyElevation);
    expect(dusk.exposure).toBe(2);
    expect(dusk.vignette).toBe(DEFAULT_LOOK.vignette);
  });

  it('defines every key for both presets', () => {
    for (const name of ['dusk', 'night'] as const) {
      const look = resolvePreset(name);
      expect(Object.keys(look).sort()).toEqual(Object.keys(DEFAULT_LOOK).sort());
    }
  });

  it('interpolates numbers, colors and bearings (shortest arc)', () => {
    const a = { ...resolvePreset('dusk'), keyBearing: 350, exposure: 1 };
    const b = { ...resolvePreset('night'), keyBearing: 10, exposure: 3 };
    const mid = lerpLook(a, b, 0.5);
    expect(mid.exposure).toBeCloseTo(2);
    expect(((mid.keyBearing % 360) + 360) % 360).toBeCloseTo(0);
    expect(mid.skyHorizon[0]).toBeCloseTo((a.skyHorizon[0] + b.skyHorizon[0]) / 2);
  });

  it('blends over 2.5 s with smoothstep and snaps when instant', () => {
    const uniforms = new LookUniforms(resolvePreset('dusk'));
    const blender = new LookBlender(uniforms);
    const night = resolvePreset('night');
    blender.setTarget(night);
    blender.step(1.25);
    const halfway = (resolvePreset('dusk').exposure + night.exposure) / 2;
    expect(uniforms.u.exposure.value).toBeCloseTo(halfway, 5);
    blender.step(2);
    expect(uniforms.u.exposure.value).toBe(night.exposure);
    expect(blender.blending).toBe(false);

    blender.setTarget(resolvePreset('dusk'), true);
    expect(uniforms.u.exposure.value).toBe(resolvePreset('dusk').exposure);
  });

  it('derives a unit key direction from bearing and elevation', () => {
    const uniforms = new LookUniforms({ ...resolvePreset('dusk'), keyBearing: 90, keyElevation: 0 });
    const d = uniforms.keyDirection.value;
    expect(d.length()).toBeCloseTo(1);
    expect(d.x).toBeCloseTo(-1); // east is -X
    expect(d.y).toBeCloseTo(0);
  });
});
