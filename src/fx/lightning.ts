// Lightning (SPEC section 6, step 7). Strikes are seeded events scheduled from the weather's strike rate.
//
// Photosensitivity: the bolt itself flickers with 3 to 5 return strokes, but it covers little of the
// screen. Full-screen light (sky, clouds, sea) follows one smooth attack, hold and decay envelope per
// strike with only small ripples, so each strike is a single flash; strike onsets are spaced at least
// MIN_ONSET_SPACING apart, which keeps full-screen flashes at 3 or fewer in any one-second window.
// "Reduce flashing" lowers full-screen peaks by 70% and removes the ripples.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { Rng } from '../app/rng';
import { bearingToDir } from '../app/world';

export const MIN_ONSET_SPACING = 0.34;
export const MAX_FLASHES_PER_SECOND = 3;
const REDUCED_PEAK = 0.3;

export interface Strike {
  start: number;
  /** Ground point of the bolt, world XZ, and the cloud point it leaves from. */
  ground: THREE.Vector3;
  cloud: THREE.Vector3;
  /** Return stroke start times relative to `start`, and their relative strengths. */
  strokes: { t: number; strength: number }[];
  /** Seconds the full-screen envelope holds before decaying. */
  hold: number;
  seed: number;
}

export interface StrikeRequest {
  bearing: number;
  distance: number;
}

/** Full-screen envelope of one strike at time `t` since its start, in [0, 1]. */
export function strikeEnvelope(strike: Strike, t: number, reduced: boolean): number {
  if (t < 0) return 0;
  const attack = reduced ? 0.12 : 0.025;
  const decay = reduced ? 0.6 : 0.35;
  let e: number;
  if (t < attack) e = t / attack;
  else if (t < attack + strike.hold) e = 1;
  else e = Math.exp(-(t - attack - strike.hold) / decay);
  if (!reduced) {
    // Small ripples on return strokes; never deep enough to count as separate flashes.
    let ripple = 0;
    for (const s of strike.strokes) {
      const d = t - s.t;
      if (d >= 0) ripple += s.strength * Math.exp(-d / 0.03) * (d < 0.004 ? d / 0.004 : 1);
    }
    e = e * (0.9 + 0.1 * Math.min(ripple, 1));
  }
  return (reduced ? REDUCED_PEAK : 1) * e;
}

/** Bolt brightness at time `t` since strike start: the strokes themselves, sharp. */
export function boltIntensity(strike: Strike, t: number, reduced: boolean): number {
  if (t < 0) return 0;
  if (reduced) return strikeEnvelope(strike, t, true) / REDUCED_PEAK;
  let v = 0;
  for (const s of strike.strokes) {
    const d = t - s.t;
    if (d >= 0) v = Math.max(v, s.strength * Math.exp(-d / 0.06));
  }
  return v;
}

export function makeStrike(
  rng: Rng,
  start: number,
  origin: THREE.Vector3,
  request: StrikeRequest,
  cloudBase: number,
): Strike {
  const dir = bearingToDir(request.bearing);
  const ground = origin.clone().addScaledVector(dir, request.distance);
  ground.y = 0;
  const cloud = ground
    .clone()
    .add(new THREE.Vector3(rng.range(-250, 250), cloudBase + rng.range(150, 450), rng.range(-250, 250)));
  const count = rng.int(3, 6);
  const strokes: Strike['strokes'] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    strokes.push({ t, strength: i === 0 ? 1 : rng.range(0.55, 0.95) });
    t += rng.range(0.05, 0.14);
  }
  return { start, ground, cloud, strokes, hold: t + 0.05, seed: rng.nextU32() };
}

/** Shared uniforms the sky, clouds and sea read. */
export class LightningUniforms {
  /** Full-screen flash envelope, already reduced if requested. */
  readonly flash = uniform(0);
  /** Bolt emission brightness (flickers). */
  readonly bolt = uniform(0);
  readonly cloudPos = uniform(new THREE.Vector3(0, 800, -4000));
  readonly groundPos = uniform(new THREE.Vector3(0, 0, -4000));
  readonly color = uniform(new THREE.Vector3(0.75, 0.82, 1.0));
}

/**
 * Schedules strikes from the weather rate and evaluates the active one. Deterministic: strikes come from
 * a seeded stream and are evaluated at simulation time.
 */
export class LightningSystem {
  readonly name = 'lightning';
  readonly uniforms = new LightningUniforms();
  reduced = false;
  /** Strikes per minute, from the weather. */
  rate = 2;
  minDistance = 3000;
  maxDistance = 12000;
  cloudBase = 500;
  /** Shot mode: time is frozen at this offset into the forced strike. */
  private frozen: { strike: Strike; offset: number } | null = null;
  private active: Strike | null = null;
  private nextStart: number | null = null;
  private lastOnset = -Infinity;
  private readonly listeners: ((strike: Strike) => void)[] = [];

  constructor(
    private readonly rng: Rng,
    private readonly origin: () => THREE.Vector3,
  ) {}

  onStrike(listener: (strike: Strike) => void): void {
    this.listeners.push(listener);
  }

  /** Forces a strike (shot mode); with `freezeAt`, holds the flash at that many seconds into it. */
  force(simTime: number, request: StrikeRequest, freezeAt: number | null): Strike {
    const strike = makeStrike(this.rng, simTime, this.origin(), request, this.cloudBase);
    this.begin(strike);
    this.frozen = freezeAt === null ? null : { strike, offset: freezeAt };
    return strike;
  }

  /** Clears any active or frozen strike (a shot without a flash). */
  clear(): void {
    this.active = null;
    this.frozen = null;
    this.uniforms.flash.value = 0;
    this.uniforms.bolt.value = 0;
  }

  private begin(strike: Strike): void {
    this.active = strike;
    this.lastOnset = strike.start;
    this.uniforms.cloudPos.value.copy(strike.cloud);
    this.uniforms.groundPos.value.copy(strike.ground);
    for (const l of this.listeners) l(strike);
  }

  step(_dt: number, simTime: number): void {
    if (this.frozen) return;
    if (this.nextStart === null) this.nextStart = simTime + this.interval();
    if (simTime >= this.nextStart) {
      // Enforce onset spacing (flash-rate limit) by delaying, never by dropping the strike.
      const start = Math.max(simTime, this.lastOnset + MIN_ONSET_SPACING);
      if (start <= simTime) {
        const request = {
          bearing: this.rng.range(0, 360),
          distance: this.rng.range(this.minDistance, this.maxDistance),
        };
        this.begin(makeStrike(this.rng, start, this.origin(), request, this.cloudBase));
        this.nextStart = simTime + this.interval();
      }
    }
  }

  private interval(): number {
    const mean = 60 / Math.max(this.rate, 0.01);
    return MIN_ONSET_SPACING - Math.log(1 - this.rng.next()) * mean;
  }

  update(time: number): void {
    const strike = this.frozen?.strike ?? this.active;
    if (!strike) return;
    const t = this.frozen ? this.frozen.offset : time - strike.start;
    this.uniforms.flash.value = strikeEnvelope(strike, t, this.reduced);
    this.uniforms.bolt.value = boltIntensity(strike, t, this.reduced);
    if (!this.frozen && t > strike.hold + 3) this.active = null;
  }
}

/**
 * Indices where a full-screen envelope rises through `threshold` of its peak, with hysteresis: it must
 * fall below 80% of the threshold before another rise counts. For tests.
 */
export function countOnsets(samples: number[], threshold = 0.5): number[] {
  const onsets: number[] = [];
  let above = false;
  samples.forEach((v, i) => {
    if (!above && v >= threshold) {
      onsets.push(i);
      above = true;
    } else if (above && v < threshold * 0.8) {
      above = false;
    }
  });
  return onsets;
}
