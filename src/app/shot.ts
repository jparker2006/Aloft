// Shot mode: a deterministic capture of one bookmark at one preset (SPEC section 15).
//   ?shot=<bookmark>&preset=<dusk|night>&seed=<n>[&flash=<t>]
// Fixes the camera, simulation time, weather and RNG, prewarms systems that need simulated history
// (foam), then renders a fixed number of frames with simulation time frozen, like a photograph, so TAA
// and exposure converge on one still moment. Then sets window.__shotReady.

import type { App } from './app';
import { directionFromAngles } from './world';
import type { PresetName } from './params';
import { BOOKMARKS, type Bookmark } from '../shots';

export interface ShotRequest {
  bookmark: Bookmark;
  preset: PresetName;
  /** Seconds into the forced lightning strike to freeze at, or null for no flash. */
  flash: number | null;
}

/** Systems that must be configured for a shot register here (presets, weather, lightning...). */
export type ShotHook = (shot: ShotRequest) => void | Promise<void>;
/** Systems that need simulated history before the first frame (foam, clouds) register here. */
export type PrewarmHook = (seconds: number) => void | Promise<void>;

export const SHOT_SETTLE_FRAMES = 24;
export const SHOT_PREWARM_SECONDS = 12;

declare global {
  interface Window {
    __shotReady?: boolean;
    __shotInfo?: Record<string, unknown>;
    __shotError?: string;
  }
}

export function applyBookmarkCamera(app: App, bookmark: Bookmark): void {
  const c = bookmark.camera;
  app.camera.position.set(...c.position);
  const dir = directionFromAngles(c.bearing, c.pitch);
  app.camera.up.set(0, 1, 0);
  app.camera.lookAt(app.camera.position.clone().add(dir));
  if (c.fov !== undefined) app.camera.fov = c.fov;
  app.camera.updateProjectionMatrix();
}

export async function runShot(app: App, hooks: { shot: ShotHook[]; prewarm: PrewarmHook[] }): Promise<void> {
  const started = performance.now();
  try {
    const name = app.params.shot ?? '';
    const bookmark = BOOKMARKS[name];
    if (!bookmark) throw new Error(`unknown bookmark "${name}"`);
    const request: ShotRequest = {
      bookmark,
      preset: app.params.preset ?? 'dusk',
      flash: app.params.flash,
    };

    app.clock.reset(Math.round(bookmark.time * app.clock.hz));
    applyBookmarkCamera(app, bookmark);
    for (const h of hooks.shot) await h(request);
    for (const h of hooks.prewarm) await h(SHOT_PREWARM_SECONDS);

    for (let i = 0; i < SHOT_SETTLE_FRAMES; i++) {
      app.frame(0);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const device = (app.renderer.backend as { device?: GPUDevice }).device;
    await device?.queue.onSubmittedWorkDone();

    window.__shotInfo = {
      bookmark: bookmark.name,
      preset: request.preset,
      flash: request.flash,
      seed: app.params.seed,
      simTime: app.clock.simTime,
      adapter: app.adapterDescription,
      ms: Math.round(performance.now() - started),
    };
    window.__shotReady = true;
  } catch (e) {
    window.__shotError = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    throw e;
  }
}
