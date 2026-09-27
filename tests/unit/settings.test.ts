import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type KeyValueStore } from '../../src/app/settings';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('settings storage', () => {
  it('round-trips through a working store', () => {
    const store = memoryStore();
    const s = { ...DEFAULT_SETTINGS, reduceFlashing: true, fov: 70 };
    expect(saveSettings(s, store)).toBe(true);
    expect(loadSettings(store)).toEqual(s);
  });

  it('falls back to defaults when storage throws or is missing', () => {
    expect(loadSettings(throwingStore)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings({ ...DEFAULT_SETTINGS }, throwingStore)).toBe(false);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings({ ...DEFAULT_SETTINGS }, null)).toBe(false);
  });

  it('ignores corrupt and mistyped values', () => {
    const store = memoryStore();
    store.data.set('aloft.settings.v1', '{"fov":"wide","cameraShake":0.5,"extra":1}');
    const s = loadSettings(store);
    expect(s.fov).toBe(DEFAULT_SETTINGS.fov);
    expect(s.cameraShake).toBe(0.5);
    expect('extra' in s).toBe(false);
    store.data.set('aloft.settings.v1', '{not json');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });
});
