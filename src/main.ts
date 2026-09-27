// Boot: WebGPU gate, then the app, then either the real-time loop or a capture shot.
import { App } from './app/app';
import { checkWebGPU } from './app/gate';
import { parseParams } from './app/params';
import { loadSettings } from './app/settings';
import { runShot, type PrewarmHook, type ShotHook } from './app/shot';
import { GradientSky } from './sky/gradient';
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

  const shotHooks: ShotHook[] = [];
  const prewarmHooks: PrewarmHook[] = [];

  const sky = new GradientSky(app.scene);
  sky.setPreset(params.preset ?? 'dusk');
  shotHooks.push((shot) => sky.setPreset(shot.preset));

  if (params.shot) {
    await runShot(app, { shot: shotHooks, prewarm: prewarmHooks });
  } else {
    app.camera.position.set(0, 4, 0);
    app.camera.lookAt(0, 4, -1);
    app.start();
  }
}

void boot();
