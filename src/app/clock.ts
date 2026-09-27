// Fixed-step simulation clock with render interpolation.
// Simulation advances in whole steps of 1/hz seconds, so every system that reads `simTime` sees the
// same deterministic value for a given step index. Rendering uses `renderTime`, which sits between the
// last two steps by `alpha`.

export interface FixedStepOptions {
  /** Simulation rate in steps per second. */
  hz: number;
  /** Most steps taken in one frame. Past this the clock drops time (slows down) instead of spiralling. */
  maxStepsPerFrame: number;
}

export class FixedStepClock {
  readonly hz: number;
  readonly dt: number;
  readonly maxStepsPerFrame: number;

  /** Number of completed simulation steps. */
  step = 0;
  /** Fraction of a step accumulated beyond `step`, in [0, 1). */
  alpha = 0;
  /** Real time dropped because the per-frame step cap was hit. */
  droppedTime = 0;

  private accumulator = 0;

  constructor(options: FixedStepOptions) {
    this.hz = options.hz;
    this.dt = 1 / options.hz;
    this.maxStepsPerFrame = options.maxStepsPerFrame;
  }

  /** Simulation time of the last completed step, in seconds. */
  get simTime(): number {
    return this.step * this.dt;
  }

  /** Interpolated time for rendering the current frame, in seconds. */
  get renderTime(): number {
    return (this.step + this.alpha) * this.dt;
  }

  /**
   * Adds real elapsed time and returns how many simulation steps to run now.
   * The caller runs exactly that many steps; `step` is already advanced on return.
   */
  advance(realDt: number): number {
    this.accumulator += Math.max(0, realDt);
    let steps = Math.floor(this.accumulator / this.dt + 1e-9);
    if (steps > this.maxStepsPerFrame) {
      const excess = (steps - this.maxStepsPerFrame) * this.dt;
      this.droppedTime += excess;
      this.accumulator -= excess;
      steps = this.maxStepsPerFrame;
    }
    this.accumulator -= steps * this.dt;
    if (this.accumulator < 0) this.accumulator = 0;
    this.step += steps;
    this.alpha = Math.min(this.accumulator / this.dt, 1 - 1e-9);
    return steps;
  }

  /** Jumps to an exact step with no fractional remainder (shot mode, checkpoints). */
  reset(step = 0): void {
    this.step = step;
    this.accumulator = 0;
    this.alpha = 0;
    this.droppedTime = 0;
  }
}
