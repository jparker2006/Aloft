// Boot: WebGPU gate, then the app, then either the real-time loop or a capture shot.
import { App } from './app/app';
import { checkWebGPU } from './app/gate';
import { parseParams } from './app/params';
import { loadSettings } from './app/settings';
import { runShot } from './app/shot';
import { FreeCamera } from './app/freeCamera';
import { PerformanceController } from './render/performance';
import { buildStage } from './stage';
import { showLoading } from './ui/loading';
import { ProfilerOverlay } from './ui/profiler';
import { showPhotosensitivityNotice } from './ui/photosensitivity';
import { showUnsupported } from './ui/unsupported';

async function boot(): Promise<void> {
  const params = parseParams(location.search);
  const settings = loadSettings();

  const gate = await checkWebGPU();
  if (!gate.ok) {
    showUnsupported(gate.reason);
    return;
  }

  let app: App;
  try {
    app = await App.create(
      { params, settings, adapterDescription: gate.description },
      document.getElementById('app') ?? document.body,
    );
  } catch (e) {
    showUnsupported(e instanceof Error ? e.message : String(e));
    return;
  }
  (window as unknown as { __app?: App }).__app = app;

  const hideLoading = params.shot ? () => undefined : showLoading();
  const stage = buildStage(app);
  const perf = new PerformanceController(app, { apply: (level) => stage.applyQuality(level) });
  const profiler = new ProfilerOverlay(app, perf);
  app.addSystem({
    name: 'performance',
    update: (frame) => {
      perf.frame(frame.realDt);
      for (const [name, ms] of app.systemMs) perf.systemMs.set(name, ms);
      profiler.update();
    },
  });

  if (params.shot) {
    await runShot(app, { shot: stage.shotHooks, prewarm: stage.prewarmHooks });
  } else {
    const freeCamera = app.addSystem(new FreeCamera(app, stage));
    freeCamera.jumpTo(0);
    // Warm up: compile every pipeline before the first frame so nothing hitches on first sight.
    await app.renderer.compileAsync(app.scene, app.camera);
    app.frame(0);
    hideLoading();
    app.start();
    await showPhotosensitivityNotice(settings, (reduce) => {
      stage.lightning.reduced = reduce;
    });
  }
}

void boot();
