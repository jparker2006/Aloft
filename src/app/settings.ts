// Player settings, saved locally. Storage can be missing or throw (private windows, blocked site data),
// so every read and write is guarded and the game always runs on defaults.

export interface Settings {
  quality: 'auto' | 'low' | 'med' | 'high';
  renderScale: number;
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  cameraShake: number;
  motionBlur: boolean;
  reduceFlashing: boolean;
  photosensitivityAcknowledged: boolean;
  volumeMaster: number;
  volumeMusic: number;
  volumeEffects: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  quality: 'auto',
  renderScale: 1,
  mouseSensitivity: 1,
  invertY: false,
  fov: 60,
  cameraShake: 1,
  motionBlur: true,
  reduceFlashing: false,
  photosensitivityAcknowledged: false,
  volumeMaster: 0.8,
  volumeMusic: 0.6,
  volumeEffects: 0.8,
});

const KEY = 'aloft.settings.v1';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Keeps only known keys whose type matches the default. */
function sanitize(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === typeof def && (typeof v !== 'number' || Number.isFinite(v))) out[k] = v;
  }
  return out as Partial<Settings>;
}

export function loadSettings(store: KeyValueStore | null = defaultStore()): Settings {
  try {
    const text = store?.getItem(KEY);
    return { ...DEFAULT_SETTINGS, ...(text ? sanitize(JSON.parse(text)) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Returns false if the settings could not be saved. The game keeps running either way. */
export function saveSettings(settings: Settings, store: KeyValueStore | null = defaultStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
