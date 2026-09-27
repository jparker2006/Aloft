// Boot: WebGPU gate, then the app, then either the real-time loop or a capture shot.
import { App } from './app/app';
import { checkWebGPU } from './app/gate';
import { parseParams } from './app/params';
import { loadSettings } from './app/settings';
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
  app.start();
}

void boot();
