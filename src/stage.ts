// Scene composition for the hero still (milestone 1): look, weather, ocean, clouds, lightning, and later
// particles and atmosphere. Returns the shot and prewarm hooks the shot runner calls.
// A/B flags: ?nolightning ?nofoam ?noclouds
import * as THREE from 'three/webgpu';
import { cameraPosition, dot, max, normalize, pow } from 'three/tsl';
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
import { CLOUD_QUALITY, StormClouds } from './sky/clouds';
import { makeSkyRadiance } from './sky/skyFunction';
import { BoltMesh } from './fx/bolt';
import { LightningSystem } from './fx/lightning';
import { Rain, Spindrift } from './fx/particles';
import { TIERS, type QualityLevel } from './render/quality';

type V3 = THREE.Node<'vec3'>;

export interface Stage {
  /** Applies a quality level to everything that scales (quality ladder target). */
  applyQuality(level: QualityLevel): void;
  togglePreset(): void;
  strike(): void;
  lightning: LightningSystem;
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
  const ocean = app.addSystem(new Ocean(app, weather));
  const frameUniforms = app.addSystem(new FrameUniforms());
  const foamUrl = '/assets/tex/foam.png';
  const foamTexture = loadDataTexture(foamUrl, {
    script: 'tools/blender/foam_texture.py',
    fallback: [60, 10, 30, 128],
    repeat: true,
  });
  // Lightning: scheduled from the weather, evaluated at simulation time.
  const lightningEnabled = !app.params.has('nolightning');
  const lightning = new LightningSystem(app.rng.stream('lightning'), () => app.camera.position);
  lightning.reduced = app.settings.reduceFlashing;
  const bolt = new BoltMesh(lightning.uniforms);
  lightning.onStrike((strike) => bolt.rebuild(strike));
  if (lightningEnabled) {
    app.scene.add(bolt.mesh);
    app.addSystem({
      name: 'lightning',
      step: (dt, t) => {
        const w = weather.state;
        lightning.rate = w.lightningRate;
        lightning.minDistance = w.lightningMinDistance;
        lightning.maxDistance = w.lightningMaxDistance;
        lightning.cloudBase = w.cloudBase;
        lightning.step(dt, t);
      },
      update: (frame) => lightning.update(frame.time),
    });
  }
  const lightningUniforms = lightningEnabled ? lightning.uniforms : null;

  const baseSky = makeSkyRadiance(look);
  // The flash lights the sky around the strike and, faintly, everywhere.
  const sky = (dir: V3): V3 => {
    if (!lightningUniforms) return baseSky(dir);
    const toStrike = normalize(lightningUniforms.cloudPos.sub(cameraPosition));
    const glow = pow(max(dot(normalize(dir), toStrike), 0), 5)
      .mul(0.9)
      .add(0.04);
    return baseSky(dir).add(lightningUniforms.color.mul(lightningUniforms.flash.mul(glow))) as V3;
  };
  const clouds = app.addSystem(
    new StormClouds(app, look, weather.uniforms, frameUniforms, CLOUD_QUALITY.high, lightningUniforms),
  );
  if (app.params.shot) clouds.maxAccumulatedFrames = 12;
  app.scene.backgroundNode = clouds.background(sky);
  const reflectedSky = clouds.reflection(sky);
  const clipmap = new Clipmap((base) =>
    createOceanMaterial(
      ocean,
      look,
      weather.uniforms,
      frameUniforms,
      foamTexture,
      reflectedSky,
      lightningUniforms,
      base,
    ),
  );
  app.scene.add(clipmap.group);
  app.addSystem({ name: 'clipmap', update: () => clipmap.update(app.camera) });

  // Particles: rain and spindrift (?norain, ?nospray to disable).
  const lit = { look, weather: weather.uniforms, lightning: lightningUniforms };
  const rain = app.params.has('norain') ? null : new Rain(TIERS.high.rain, lit, ocean);
  const spindrift = app.params.has('nospray') ? null : new Spindrift(TIERS.high.spindrift, lit, ocean);
  if (rain) app.scene.add(rain.mesh);
  if (spindrift) app.scene.add(spindrift.sprite);
  app.addSystem({
    name: 'particles',
    update: (frame) => {
      rain?.step(app.renderer, app.camera, frame.realDt);
      spindrift?.step(app.renderer, app.camera, frame.realDt, frame.frame);
    },
  });
  const pipeline = new FramePipeline(app, {
    look,
    weather: weather.uniforms,
    frame: frameUniforms,
    clouds,
    lightning: lightningUniforms,
  });

  const applyQuality = (level: QualityLevel) => {
    clouds.deckSteps.value = level.cloudDeckSteps;
    clouds.scudSteps.value = level.cloudScudSteps;
    if (rain)
      (rain.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.min(level.rain, rain.count);
    if (spindrift) spindrift.sprite.count = Math.min(level.spindrift, spindrift.count);
    pipeline.setVolumetricScale(level.volumetricScale);
    ocean.fineCascadeEveryOtherFrame = level.fineCascadeEveryOtherFrame;
    if (app.renderer.getPixelRatio() !== level.renderScale) {
      app.renderer.setPixelRatio(level.renderScale);
      app.resize();
    }
  };
  let presetName = app.params.preset ?? 'dusk';
  const togglePreset = () => {
    presetName = presetName === 'dusk' ? 'night' : 'dusk';
    lookBlender.setTarget(resolvePreset(presetName));
  };
  const strike = () => {
    if (!lightningEnabled) return;
    // A strike just off the camera's view direction (bearing from the forward vector: b = atan2(-x, z)).
    const f = app.camera.getWorldDirection(new THREE.Vector3());
    const bearing = (Math.atan2(-f.x, f.z) * 180) / Math.PI + 15;
    lightning.force(app.clock.simTime, { bearing, distance: 5000 }, null);
  };

  const shotHooks: ShotHook[] = [
    (shot) => {
      lookBlender.setTarget(resolvePreset(shot.preset), true);
      weather.setTarget(WEATHER[shot.bookmark.weather]);
    },
    (shot) => {
      if (!lightningEnabled) return;
      // A bookmark's own strike, or for mid-flash frames a strike just off the camera's bearing.
      const request = shot.bookmark.strike ?? { bearing: shot.bookmark.camera.bearing + 18, distance: 5200 };
      if (shot.flash !== null) lightning.force(app.clock.simTime, request, shot.flash);
      else lightning.clear();
    },
  ];
  const prewarmHooks: PrewarmHook[] = [
    async (seconds) => {
      await whenLoaded([foamUrl]);
      let step = 0;
      ocean.prewarm(seconds, app.clock.simTime, (_t, dt) => {
        spindrift?.step(app.renderer, app.camera, dt, step++);
        rain?.step(app.renderer, app.camera, dt);
      });
    },
  ];
  return {
    applyQuality,
    togglePreset,
    strike,
    lightning,
    look,
    lookBlender,
    weather,
    shotHooks,
    prewarmHooks,
  };
}
