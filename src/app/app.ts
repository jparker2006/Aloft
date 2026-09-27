// Application core: renderer, camera, fixed-step clock, seeded streams and the system list.
// Systems plug in through two hooks:
//   step(dt, simTime)  fixed-step CPU simulation (deterministic)
//   update(frame)      once per rendered frame: GPU compute dispatch, uniform updates
// A single `renderFrame` callback (the post pipeline) draws the frame.

import * as THREE from 'three/webgpu';
import { FixedStepClock } from './clock';
import type { Params } from './params';
import { RngStreams } from './rng';
import type { Settings } from './settings';

export const SIM_HZ = 120;
export const MAX_STEPS_PER_FRAME = 4;
/** Longest real frame time fed to the clock; longer stalls are dropped, not simulated. */
export const MAX_FRAME_DT = 0.1;

export interface FrameInfo {
  /** Real frame time in seconds, clamped. */
  realDt: number;
  /** Interpolated simulation time for rendering. */
  time: number;
  /** Frames rendered so far. */
  frame: number;
}

export interface System {
  readonly name: string;
  step?(dt: number, simTime: number): void;
  update?(frame: FrameInfo): void;
}

export interface AppOptions {
  params: Params;
  settings: Settings;
  adapterDescription: string;
}

export class App {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly clock = new FixedStepClock({ hz: SIM_HZ, maxStepsPerFrame: MAX_STEPS_PER_FRAME });
  readonly rng: RngStreams;
  readonly params: Params;
  readonly settings: Settings;
  readonly adapterDescription: string;
  readonly systems: System[] = [];
  /** Smoothed CPU milliseconds spent in each system per frame (step + update). */
  readonly systemMs = new Map<string, number>();

  /** Draws the frame. Replaced by the post pipeline; defaults to a plain scene render. */
  renderFrame: (frame: FrameInfo) => void;

  private frameCount = 0;
  private lastTimestamp: number | null = null;
  private readonly resizeListeners: Array<(w: number, h: number) => void> = [];

  private constructor(renderer: THREE.WebGPURenderer, options: AppOptions) {
    this.renderer = renderer;
    this.params = options.params;
    this.settings = options.settings;
    this.adapterDescription = options.adapterDescription;
    this.rng = new RngStreams(options.params.seed);
    this.camera = new THREE.PerspectiveCamera(options.settings.fov, 1, 0.2, 40000);
    this.renderFrame = () => this.renderer.render(this.scene, this.camera);
  }

  static async create(options: AppOptions, container: HTMLElement): Promise<App> {
    const renderer = new THREE.WebGPURenderer({
      antialias: false,
      powerPreference: 'high-performance',
      reversedDepthBuffer: true,
      // GPU timing for the F3 overlay and the quality ladder; three enables it only if supported.
      trackTimestamp: !options.params.shot,
    });
    await renderer.init();
    if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
      renderer.dispose();
      throw new Error('three.js selected a non-WebGPU backend');
    }
    // Internal resolution is based on CSS pixels, not Retina pixels (SPEC section 3).
    renderer.setPixelRatio(1);
    // Tone mapping and grading happen in our own final pass.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const app = new App(renderer, options);
    app.resize();
    addEventListener('resize', () => app.resize());
    return app;
  }

  addSystem<T extends System>(system: T): T {
    this.systems.push(system);
    return system;
  }

  onResize(listener: (w: number, h: number) => void): void {
    this.resizeListeners.push(listener);
  }

  resize(width = innerWidth, height = innerHeight): void {
    this.renderer.setSize(width, height, true);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    for (const l of this.resizeListeners) l(width, height);
  }

  /** Advances simulation by real time and renders one frame. */
  frame(realDt: number): void {
    const dt = Math.min(Math.max(realDt, 0), MAX_FRAME_DT);
    const steps = this.clock.advance(dt);
    const spent = new Map<string, number>();
    const timed = (name: string, fn: () => void) => {
      const t0 = performance.now();
      fn();
      spent.set(name, (spent.get(name) ?? 0) + performance.now() - t0);
    };
    for (let i = 0; i < steps; i++) {
      // Each step sees the time at the start of that step.
      const simTime = (this.clock.step - steps + i) * this.clock.dt;
      for (const s of this.systems) if (s.step) timed(s.name, () => s.step!(this.clock.dt, simTime));
    }
    const info: FrameInfo = { realDt: dt, time: this.clock.renderTime, frame: this.frameCount++ };
    for (const s of this.systems) if (s.update) timed(s.name, () => s.update!(info));
    timed('render', () => this.renderFrame(info));
    for (const [name, ms] of spent) {
      const prev = this.systemMs.get(name) ?? ms;
      this.systemMs.set(name, prev + (ms - prev) * 0.1);
    }
  }

  /** Starts the real-time loop. */
  start(): void {
    this.renderer.setAnimationLoop((timestamp: number) => {
      const realDt = this.lastTimestamp === null ? 0 : (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;
      this.frame(realDt);
    });
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
    this.lastTimestamp = null;
  }
}
