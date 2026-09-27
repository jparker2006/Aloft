// F3 profiler overlay (SPEC section 7): frame and GPU time, CPU time per system, draw calls, internal
// resolution, tier and ladder rung. Available in dev builds, with ?dev, or by pressing F3 anywhere.
import type { App } from '../app/app';
import type { PerformanceController } from '../render/performance';

export class ProfilerOverlay {
  private readonly root = document.createElement('pre');
  private visible: boolean;
  private last = 0;

  constructor(
    private readonly app: App,
    private readonly perf: PerformanceController,
  ) {
    this.root.className = 'profiler';
    this.visible = app.params.has('prof');
    this.root.hidden = !this.visible;
    document.body.appendChild(this.root);
    addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.visible = !this.visible;
        this.root.hidden = !this.visible;
      }
    });
  }

  update(now = performance.now()): void {
    if (!this.visible || now - this.last < 250) return;
    this.last = now;
    const r = this.app.renderer;
    const canvas = r.domElement;
    const info = r.info as unknown as { render: { drawCalls?: number; calls?: number; triangles: number } };
    const systems = [...this.perf.systemMs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, ms]) => `  ${name.padEnd(16)} ${ms.toFixed(2)} ms`)
      .join('\n');
    const q = this.perf.quality;
    this.root.textContent = [
      `frame   ${this.perf.frameMs.toFixed(1)} ms  (${(1000 / this.perf.frameMs).toFixed(0)} fps)`,
      `gpu     ${this.perf.gpuMs === null ? 'n/a (no timestamp queries; using frame time)' : `${this.perf.gpuMs.toFixed(2)} ms`}`,
      `draws   ${info.render.drawCalls ?? info.render.calls ?? 0}   tris ${(info.render.triangles / 1000).toFixed(0)}k`,
      `res     ${canvas.width}x${canvas.height}  (scale ${q.renderScale})`,
      `tier    ${this.perf.tier}   rung ${this.perf.rung}`,
      `clouds  ${q.cloudDeckSteps}+${q.cloudScudSteps} steps   rain ${q.rain}   spray ${q.spindrift}`,
      `adapter ${this.app.adapterDescription}`,
      'cpu per system:',
      systems,
    ].join('\n');
  }
}
