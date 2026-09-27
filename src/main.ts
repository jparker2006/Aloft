// Boot: WebGPU gate, then the app, then either the real-time loop or a capture shot.
import { App } from './app/app';
import { checkWebGPU } from './app/gate';
import { parseParams } from './app/params';
import { loadSettings } from './app/settings';
import { runShot } from './app/shot';
import { buildStage } from './stage';
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

  const stage = buildStage(app);

  if (params.shot) {
    await runShot(app, { shot: stage.shotHooks, prewarm: stage.prewarmHooks });
  } else {
    app.camera.position.set(0, 4, 0);
    app.camera.lookAt(0, 4, -1);
    app.start();
  }
}

void boot();
