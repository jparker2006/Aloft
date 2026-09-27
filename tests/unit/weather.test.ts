import { describe, expect, it } from 'vitest';
import {
  WEATHER,
  WeatherController,
  lerpWeather,
  spectrumNeedsRebuild,
  type WeatherState,
} from '../../src/render/weather';

describe('weather', () => {
  it('orders the act states by severity', () => {
    expect(WEATHER.rising.hs).toBeLessThan(WEATHER.gale.hs);
    expect(WEATHER.gale.hs).toBeLessThan(WEATHER.worst.hs);
    expect(WEATHER.worst.windSpeed).toBe(30);
  });

  it('interpolates angles along the shortest arc', () => {
    const a: WeatherState = { ...WEATHER.gale, windFrom: 350 };
    const b: WeatherState = { ...WEATHER.gale, windFrom: 20 };
    expect(lerpWeather(a, b, 0.5).windFrom).toBeCloseTo(365);
  });

  it('ignores small drift and rebuilds on real change', () => {
    const g = WEATHER.gale;
    expect(spectrumNeedsRebuild(g, { ...g, hs: g.hs + 0.1 })).toBe(false);
    expect(spectrumNeedsRebuild(g, { ...g, hs: g.hs + 0.3 })).toBe(true);
    expect(spectrumNeedsRebuild(g, { ...g, windFrom: g.windFrom + 359 })).toBe(false);
    expect(spectrumNeedsRebuild(g, { ...g, rainRate: 0 })).toBe(false);
  });

  it('notifies spectrum rebuilds during a blend, not every step', () => {
    const c = new WeatherController(WEATHER.rising);
    const events: boolean[] = [];
    c.onSpectrumRebuild((_s, instant) => events.push(instant));
    expect(events).toEqual([true]);
    c.setTarget(WEATHER.worst, 10);
    for (let i = 0; i < 1200; i++) c.step(1 / 120, i / 120);
    expect(c.state.hs).toBeCloseTo(WEATHER.worst.hs);
    const rebuilds = events.length - 1;
    expect(rebuilds).toBeGreaterThan(3);
    expect(rebuilds).toBeLessThan(80);
    c.setTarget(WEATHER.gale);
    expect(events.at(-1)).toBe(true);
    expect(c.state).toEqual(WEATHER.gale);
  });

  it('keeps gusts deterministic and non-negative', () => {
    const c = new WeatherController(WEATHER.gale);
    for (let t = 0; t < 60; t += 0.37) {
      expect(c.gustAt(t)).toBeGreaterThanOrEqual(0);
      expect(c.gustAt(t)).toBe(c.gustAt(t));
    }
  });
});
