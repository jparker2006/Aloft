// Runtime performance control (SPEC section 3, step 11): startup benchmark tier selection, the frame-time
// degradation ladder, and the numbers the F3 overlay shows.
import type { App } from '../app/app';
import {
  MAX_RUNG,
  QualityLadder,
  TIERS,
  applyRung,
  tierFromBenchmark,
  type QualityLevel,
  type Tier,
} from './quality';

export interface QualityTargets {
  /** Applies a quality level to every system that scales. */
  apply(level: QualityLevel): void;
}

const BENCHMARK_SECONDS = 2;

export class PerformanceController {
  readonly name = 'performance';
  readonly ladder = new QualityLadder();
  tier: Tier;
  /** GPU time of the last resolved frame in ms, or null when timestamp queries are unavailable. */
  gpuMs: number | null = null;
  /** Wall time between frames, ms (smoothed). */
  frameMs = 16.7;
  readonly systemMs = new Map<string, number>();
  private benchmark: { elapsed: number; samples: number[] } | null;
  private readonly forcedTier: boolean;
  private resolving = false;
  private level: QualityLevel;

  constructor(
    private readonly app: App,
    private readonly targets: QualityTargets,
  ) {
    const p = app.params;
    const setting = app.settings.quality;
    const forced = p.quality ?? (setting !== 'auto' ? setting : null);
    this.forcedTier = forced !== null || p.shot !== null;
    this.tier = forced ?? 'high';
    this.benchmark = this.forcedTier ? null : { elapsed: 0, samples: [] };
    this.level = this.withOverrides(TIERS[this.tier]);
    targets.apply(this.level);
  }

  get rung(): number {
    return this.ladder.rung;
  }

  get quality(): QualityLevel {
    return this.level;
  }

  private withOverrides(level: QualityLevel): QualityLevel {
    const out = { ...level } as Record<string, number | boolean>;
    for (const [k, v] of Object.entries(this.app.params.qualityOverrides)) {
      if (k in out) out[k] = typeof out[k] === 'boolean' ? v !== 0 : v;
    }
    return out as unknown as QualityLevel;
  }

  /** Call once per rendered frame with the real frame time. */
  frame(realDt: number): void {
    if (realDt <= 0) return;
    const ms = realDt * 1000;
    this.frameMs += (ms - this.frameMs) * 0.1;
    this.pollGpu();
    const measured = this.gpuMs ?? ms;

    if (this.benchmark) {
      this.benchmark.elapsed += realDt;
      this.benchmark.samples.push(measured);
      if (this.benchmark.elapsed >= BENCHMARK_SECONDS) {
        const samples = this.benchmark.samples.slice(Math.floor(this.benchmark.samples.length / 4));
        const mean = samples.reduce((a, b) => a + b, 0) / Math.max(samples.length, 1);
        this.tier = tierFromBenchmark(mean, this.gpuMs !== null);
        this.benchmark = null;
        this.level = this.withOverrides(TIERS[this.tier]);
        this.targets.apply(this.level);
        console.info(`[quality] benchmark ${mean.toFixed(1)} ms -> tier ${this.tier}`);
      }
      return;
    }
    if (this.app.params.shot) return;
    if (this.ladder.sample(measured, realDt)) {
      this.level = this.withOverrides(applyRung(TIERS[this.tier], this.ladder.rung));
      this.targets.apply(this.level);
      console.info(`[quality] rung ${this.ladder.rung}/${MAX_RUNG}`);
    }
  }

  private pollGpu(): void {
    const renderer = this.app.renderer;
    if (!(renderer as unknown as { trackTimestamp?: boolean }).trackTimestamp || this.resolving) return;
    this.resolving = true;
    void Promise.all([renderer.resolveTimestampsAsync('render'), renderer.resolveTimestampsAsync('compute')])
      .then(() => {
        const info = renderer.info as unknown as {
          render: { timestamp: number };
          compute: { timestamp: number };
        };
        const total = (info.render.timestamp || 0) + (info.compute.timestamp || 0);
        if (total > 0) this.gpuMs = this.gpuMs === null ? total : this.gpuMs + (total - this.gpuMs) * 0.2;
      })
      .catch(() => undefined)
      .finally(() => {
        this.resolving = false;
      });
  }
}
