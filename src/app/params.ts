// URL parameters. Parsed once at boot; everything else reads this object.
//   ?shot=<bookmark>&preset=<dusk|night>&seed=<n>&flash=<t>   capture shot mode
//   ?q=low|med|high  ?qset=key:value,key:value               quality overrides
//   ?dev  ?nossr ?noclouds ?norain ?nofoam ...                dev and A/B flags

export type PresetName = 'dusk' | 'night';

export interface Params {
  shot: string | null;
  preset: PresetName | null;
  seed: number;
  /** Seconds into the next lightning strike to freeze at, for captures. */
  flash: number | null;
  quality: 'low' | 'med' | 'high' | null;
  qualityOverrides: Record<string, number>;
  dev: boolean;
  /** Boolean flags present in the query without a value, e.g. `nossr`. */
  flags: ReadonlySet<string>;
  has(flag: string): boolean;
}

const DEFAULT_SEED = 1;

export function parseParams(search: string): Params {
  const q = new URLSearchParams(search);
  const preset = q.get('preset');
  const quality = q.get('q');
  const seed = Number.parseInt(q.get('seed') ?? '', 10);
  const flash = Number.parseFloat(q.get('flash') ?? '');

  const qualityOverrides: Record<string, number> = {};
  for (const pair of (q.get('qset') ?? '').split(',')) {
    const [k, v] = pair.split(':');
    const n = Number.parseFloat(v ?? '');
    if (k && Number.isFinite(n)) qualityOverrides[k] = n;
  }

  const flags = new Set<string>();
  for (const [k, v] of q.entries()) if (v === '') flags.add(k);

  return {
    shot: q.get('shot'),
    preset: preset === 'dusk' || preset === 'night' ? preset : null,
    seed: Number.isFinite(seed) ? seed : DEFAULT_SEED,
    flash: Number.isFinite(flash) ? flash : null,
    quality: quality === 'low' || quality === 'med' || quality === 'high' ? quality : null,
    qualityOverrides,
    dev: flags.has('dev') || q.has('shot'),
    flags,
    has: (flag: string) => flags.has(flag),
  };
}
