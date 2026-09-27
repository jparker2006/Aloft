// Scene composition for the hero still (milestone 1): look, weather, sky, and later ocean, lightning,
// particles and atmosphere. Returns the shot and prewarm hooks the shot runner calls.
import type { App } from './app/app';
import type { PrewarmHook, ShotHook } from './app/shot';
import { LookBlender, LookUniforms, resolvePreset } from './render/look';
import { WEATHER, WeatherController } from './render/weather';
import { Ocean } from './ocean/ocean';
import { createOceanMaterial, createTestGrid } from './ocean/surface';
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
  app.scene.add(createTestGrid(createOceanMaterial(ocean, look)));
  new FramePipeline(app, look);

  const shotHooks: ShotHook[] = [
    (shot) => {
      lookBlender.setTarget(resolvePreset(shot.preset), true);
      weather.setTarget(WEATHER[shot.bookmark.weather]);
    },
  ];
  const prewarmHooks: PrewarmHook[] = [];
  return { look, lookBlender, weather, shotHooks, prewarmHooks };
}
