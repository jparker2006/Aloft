// Quality tiers and the degradation ladder (SPEC section 3).
//
// Tier: chosen at startup from a short benchmark (adapter info is not used; Safari reports little), or
// forced with ?q=low|med|high, or by the player's setting. ?qset=key:value overrides single fields.
//
// Ladder: when GPU frame time stays over budget the controller steps down one rung at a time, with
// hysteresis, and steps back up when there is headroom. The ocean is protected: its cascades are the last
// thing touched. Every rung is a uniform or a draw count, so stepping never recompiles a shader.
//   rung 0  full tier
//   rung 1  cloud raymarch steps reduced
//   rung 2  particle counts reduced
//   rung 3  volumetric in-scatter at quarter resolution
//   rung 4  internal resolution 85%
//   rung 5  internal resolution 65%
//   rung 6  fine ocean cascade updated every other frame (last resort)

export type Tier = 'low' | 'med' | 'high';

export interface QualityLevel {
  cloudDeckSteps: number;
  cloudScudSteps: number;
  rain: number;
  spindrift: number;
  volumetricScale: number;
  renderScale: number;
  fineCascadeEveryOtherFrame: boolean;
}

export const TIERS: Readonly<Record<Tier, QualityLevel>> = {
  low: {
    cloudDeckSteps: 14,
    cloudScudSteps: 5,
    rain: 40000,
    spindrift: 12000,
    volumetricScale: 0.25,
    renderScale: 0.85,
    fineCascadeEveryOtherFrame: false,
  },
  med: {
    cloudDeckSteps: 20,
    cloudScudSteps: 6,
    rain: 60000,
    spindrift: 18000,
    volumetricScale: 0.5,
    renderScale: 1,
    fineCascadeEveryOtherFrame: false,
  },
  high: {
    cloudDeckSteps: 28,
    cloudScudSteps: 8,
    rain: 80000,
    spindrift: 24000,
    volumetricScale: 0.5,
    renderScale: 1,
    fineCascadeEveryOtherFrame: false,
  },
};

export const MAX_RUNG = 6;

/** The quality level after applying `rung` steps of the ladder to a tier. */
export function applyRung(tier: QualityLevel, rung: number): QualityLevel {
  const q = { ...tier };
  if (rung >= 1) {
    q.cloudDeckSteps = Math.max(10, Math.round(q.cloudDeckSteps * 0.65));
    q.cloudScudSteps = Math.max(4, Math.round(q.cloudScudSteps * 0.65));
  }
  if (rung >= 2) {
    q.rain = Math.round(q.rain * 0.5);
    q.spindrift = Math.round(q.spindrift * 0.5);
  }
  if (rung >= 3) q.volumetricScale = Math.min(q.volumetricScale, 0.25);
  if (rung >= 4) q.renderScale = Math.min(q.renderScale, 0.85);
  if (rung >= 5) q.renderScale = Math.min(q.renderScale, 0.65);
  if (rung >= 6) q.fineCascadeEveryOtherFrame = true;
  return q;
}

/** Tier from a benchmark's mean GPU (or frame) time in milliseconds. */
export function tierFromBenchmark(meanMs: number): Tier {
  if (meanMs < 9) return 'high';
  if (meanMs < 14) return 'med';
  return 'low';
}

export interface LadderOptions {
  /** Frame budget, ms. */
  budget: number;
  /** Step down when the smoothed frame time exceeds budget * this. */
  downFactor: number;
  /** Step up when the smoothed frame time stays under budget * this. */
  upFactor: number;
  /** Seconds to wait after any change before another. */
  settle: number;
  /** Seconds of headroom required before stepping up. */
  upAfter: number;
}

export const DEFAULT_LADDER: LadderOptions = {
  budget: 16.6,
  downFactor: 1.06,
  upFactor: 0.78,
  settle: 2,
  upAfter: 4,
};

/** Frame-time controller with hysteresis. Pure logic, unit tested. */
export class QualityLadder {
  rung = 0;
  private smoothed: number;
  private sinceChange = 0;
  private headroomFor = 0;

  constructor(private readonly options: LadderOptions = DEFAULT_LADDER) {
    this.smoothed = options.budget;
  }

  get frameTime(): number {
    return this.smoothed;
  }

  /** Feeds one frame's time (ms) and real dt (s). Returns true if the rung changed. */
  sample(frameMs: number, dt: number): boolean {
    const o = this.options;
    const k = 1 - Math.exp(-dt / 0.5);
    this.smoothed += (frameMs - this.smoothed) * k;
    this.sinceChange += dt;
    if (this.sinceChange < o.settle) return false;
    if (this.smoothed > o.budget * o.downFactor && this.rung < MAX_RUNG) {
      this.rung++;
      this.sinceChange = 0;
      this.headroomFor = 0;
      return true;
    }
    if (this.smoothed < o.budget * o.upFactor) {
      this.headroomFor += dt;
      if (this.headroomFor >= o.upAfter && this.rung > 0) {
        this.rung--;
        this.sinceChange = 0;
        this.headroomFor = 0;
        return true;
      }
    } else {
      this.headroomFor = 0;
    }
    return false;
  }
}
