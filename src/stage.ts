// Scene composition for the hero still (milestone 1): look, weather, sky, and later ocean, lightning,
// particles and atmosphere. Returns the shot and prewarm hooks the shot runner calls.
import type { App } from './app/app';
import type { PrewarmHook, ShotHook } from './app/shot';
import { LookBlender, LookUniforms, resolvePreset } from './render/look';
import { WEATHER, WeatherController } from './render/weather';
import { Ocean } from './ocean/ocean';
import { Clipmap } from './ocean/clipmap';
import { createOceanMaterial } from './ocean/surface';
import { loadDataTexture, whenLoaded } from './render/assets';
import { FrameUniforms } from './render/frameUniforms';
import { FramePipeline } from './render/pipeline';
import { GradientSky } from './sky/gradient';

export interface Stage {
  look: LookUniforms;
  lookBlender: LookBlender;
  weather: WeatherController;
  shotHooks: ShotHook[];
  prewarmHooks: PrewarmHook[];
}

export function buildStage(app: App): Stage {
  const look = new LookUniforms(resolvePreset(app.params.preset ?? 'dusk'));
  const lookBlender = app.addSystem(new LookBlender(look));
  const weather = app.addSystem(new WeatherController(WEATHER.gale));
  new GradientSky(app.scene, look);
  const ocean = app.addSystem(new Ocean(app, weather));
  const frameUniforms = app.addSystem(new FrameUniforms());
  const foamUrl = '/assets/tex/foam.png';
  const foamTexture = loadDataTexture(foamUrl, {
    script: 'tools/blender/foam_texture.py',
    fallback: [60, 10, 30, 128],
    repeat: true,
  });
  const clipmap = new Clipmap((base) =>
    createOceanMaterial(ocean, look, weather.uniforms, frameUniforms, foamTexture, base),
  );
  app.scene.add(clipmap.group);
  app.addSystem({ name: 'clipmap', update: () => clipmap.update(app.camera) });
  new FramePipeline(app, look);

  const shotHooks: ShotHook[] = [
    (shot) => {
      lookBlender.setTarget(resolvePreset(shot.preset), true);
      weather.setTarget(WEATHER[shot.bookmark.weather]);
    },
  ];
  const prewarmHooks: PrewarmHook[] = [
    async (seconds) => {
      await whenLoaded([foamUrl]);
      ocean.prewarm(seconds, app.clock.simTime);
    },
  ];
  return { look, lookBlender, weather, shotHooks, prewarmHooks };
}
