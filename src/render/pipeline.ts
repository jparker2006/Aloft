// Frame pipeline (SPEC section 7), in order:
//   scene pass (MRT: color, velocity)   ocean, sky and clouds as background, bolt, particles
//   atmosphere                          analytic height fog + half-res volumetric in-scatter
//   TRAA                                temporal anti-aliasing with jitter and velocity
//   motion blur                         from the velocity buffer, off in still captures
//   bloom                               soft glow on highlights and lightning
//   exposure                            the look's exposure times auto exposure (flash-excluded)
//   lens rain                           drops on the lens when the camera faces the wind
//   tone map                            ACES-fitted (default) or AgX (?tonemap=agx), see SPEC section 19
//   grade                               lift, gamma, gain, split tone, saturation, contrast
//   vignette, grain, dither, sRGB encode
// SSR and GTAO are not in the milestone 1 graph: the sea reflects the sky and clouds analytically (and
// the bolt through the reflected sky), and there is no geometry for ambient occlusion until the ship.
import * as THREE from 'three/webgpu';
import {
  Fn,
  acesFilmicToneMapping,
  agxToneMapping,
  clamp,
  convertToTexture,
  dot,
  float,
  fract,
  getViewPosition,
  hash,
  int,
  max,
  mix,
  mrt,
  output,
  pass,
  pow,
  rtt,
  sRGBTransferOETF,
  saturate,
  screenCoordinate,
  screenUV,
  smoothstep,
  uint,
  uniform,
  vec2,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import type { App } from '../app/app';
import type { LightningUniforms } from '../fx/lightning';
import type { StormClouds } from '../sky/clouds';
import { Atmosphere, FOG_MAX_DISTANCE } from './atmosphere';
import { AutoExposure } from './exposure';
import type { FrameUniforms } from './frameUniforms';
import type { LookUniforms } from './look';
import type { WeatherUniforms } from './weather';

type F = THREE.Node<'float'>;
type V2 = THREE.Node<'vec2'>;
type V3 = THREE.Node<'vec3'>;

/**
 * Per-pixel hash in [0, 1), decorrelated per frame and per use. TSL's hash takes a scalar seed (given a
 * vec2 it keeps only x, which draws vertical lines), so the pixel is flattened to one integer first.
 */
function pixelHash(frame: THREE.Node<'float'>, salt: number): F {
  const pixel = uint(screenCoordinate.x).add(uint(screenCoordinate.y).mul(uint(8192)));
  return hash(pixel.add(uint(frame).mul(uint(2654435761))).add(uint(salt * 97531))) as unknown as F;
}

export interface PipelineOptions {
  look: LookUniforms;
  weather: WeatherUniforms;
  frame: FrameUniforms;
  clouds: StormClouds;
  lightning: LightningUniforms | null;
}

export class FramePipeline {
  readonly name = 'pipeline';
  readonly atmosphere: Atmosphere;
  readonly exposure: AutoExposure;
  private readonly pipeline: THREE.RenderPipeline;
  private readonly app: App;
  private readonly lightning: LightningUniforms | null;
  private readonly invProj = uniform(new THREE.Matrix4());
  private readonly camWorld = uniform(new THREE.Matrix4());
  private readonly camPos = uniform(new THREE.Vector3());
  private readonly camForward = uniform(new THREE.Vector3(0, 0, -1));
  private readonly motionBlurScale = uniform(1);
  private readonly frameIndex = uniform(0);
  private framesSinceCut = 0;
  private volumetricNode: { setResolutionScale(scale: number): void } | null = null;

  /** Quality ladder hook: resolution of the volumetric in-scatter pass. */
  setVolumetricScale(scale: number): void {
    this.volumetricNode?.setResolutionScale(scale);
  }

  constructor(app: App, options: PipelineOptions) {
    this.app = app;
    this.lightning = options.lightning;
    const { look, weather, frame } = options;
    const p = app.params;

    const scenePass = pass(app.scene, app.camera);
    scenePass.setMRT(mrt({ output, velocity }));
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const motion = scenePass.getTextureNode('velocity');

    // View ray and distance for a screen UV, from the scene camera (the pipeline quad has its own).
    const viewRay = (u: V2) => {
      const d = depth.sample(u).r;
      const viewPos = getViewPosition(u, d, this.invProj);
      const sky = d.lessThanEqual(1e-7).or(d.greaterThanEqual(0.9999999));
      const dirView = getViewPosition(u, float(0.5), this.invProj).normalize();
      const dir = this.camWorld.mul(vec4(dirView, 0)).xyz.normalize() as V3;
      const distance = sky.select(float(FOG_MAX_DISTANCE), viewPos.length()) as F;
      return { dir, distance };
    };

    this.atmosphere = new Atmosphere(look, weather, options.lightning);
    const atmosphere = this.atmosphere;
    let hdr: V3 = color.rgb as unknown as V3;
    if (!p.has('nofog')) {
      const ray = viewRay(screenUV);
      hdr = atmosphere.apply(hdr, this.camPos.y, ray.dir, ray.distance);
      if (!p.has('novolume')) {
        const volumetric = rtt(
          Fn(() => {
            const r = viewRay(screenUV);
            const jitter = fract(pixelHash(float(0), 1).add(this.frameIndex.mul(0.618034)));
            return atmosphere.volumetric(
              this.camPos,
              r.dir,
              r.distance,
              options.clouds.noise.shape,
              options.clouds.noise.detail,
              frame,
              jitter,
            );
          })(),
          null,
          null,
          { type: THREE.HalfFloatType, resolutionScale: 0.5 },
        );
        this.volumetricNode = volumetric as unknown as { setResolutionScale(scale: number): void };
        const curtains = volumetric.sample(screenUV);
        hdr = hdr.mul(curtains.a).add(curtains.rgb) as V3;
      }
    }

    let image: V3 = hdr;
    if (!p.has('notaa')) image = traa(vec4(image, 1), depth, motion, app.camera).rgb as unknown as V3;
    if (!p.has('nomotionblur')) {
      image = motionBlur(convertToTexture(vec4(image, 1)), motion.mul(this.motionBlurScale), int(8))
        .rgb as unknown as V3;
    }
    if (!p.has('nobloom')) {
      // Threshold above the clamped sea glint, so glitter sparkles instead of blooming into discs.
      const glow = bloom(vec4(image, 1), 1, 0.55, 1.4);
      image = image.add(glow.rgb.mul(look.u.bloomStrength.mul(4))) as V3;
    }

    this.exposure = new AutoExposure(color);
    const autoExposure = p.has('noexposure') ? float(1) : this.exposure.multiplier;
    const exposed = image.mul(look.u.exposure).mul(autoExposure) as V3;

    // Lens rain: static drops refract a blurred, inverted view; only when facing into the wind.
    let lensed: V3 = exposed;
    if (!p.has('nolensrain')) {
      const exposedTexture = rtt(vec4(exposed, 1), null, null, { type: THREE.HalfFloatType });
      const facing = saturate(dot(this.camForward.xz.normalize(), weather.windDir.negate()));
      const cells = vec2(26, 17);
      const cell = screenUV.mul(cells).floor();
      const local = screenUV.mul(cells).fract().sub(0.5);
      const h = hash(cell.x.add(cell.y.mul(131)));
      const center = vec2(
        hash(cell.x.add(cell.y.mul(131)).add(17)),
        hash(cell.x.add(cell.y.mul(131)).add(29)),
      )
        .sub(0.5)
        .mul(0.6);
      const radius = hash(cell.x.add(cell.y.mul(131)).add(41))
        .mul(0.18)
        .add(0.06);
      const offset = local.sub(center);
      const inDrop = float(1).sub(smoothstep(radius.mul(0.8), radius, offset.length()));
      const present = h.lessThan(weather.rainRate.mul(facing).mul(0.35)).select(float(1), float(0));
      const drop = inDrop.mul(present);
      const refracted = exposedTexture.sample(screenUV.sub(offset.div(cells).mul(2.5))).rgb;
      lensed = mix(exposed, refracted.mul(0.9), drop.mul(0.85)) as V3;
    }

    // ACES-fitted won the capture comparison (critique 0013): deeper blacks, more saturated gap light and
    // a darker deck, all closer to the references than AgX's flatter, milkier rendering.
    const useAgx = new URLSearchParams(location.search).get('tonemap') === 'agx';
    const mapped = (useAgx
      ? agxToneMapping(lensed, float(1))
      : acesFilmicToneMapping(lensed, float(1))) as unknown as V3;

    // Grade in display-linear space.
    const lifted = mapped.add(look.u.lift.mul(float(1).sub(mapped))).mul(look.u.gain);
    const gammaed = pow(max(lifted, vec3(0, 0, 0)), float(1).div(look.u.gamma));
    const luma = dot(gammaed, vec3(0.2126, 0.7152, 0.0722));
    const split = mix(look.u.splitShadows, look.u.splitHighlights, smoothstep(0.05, 0.6, luma));
    const toned = gammaed.add(split.mul(0.5));
    const saturated = mix(vec3(luma, luma, luma), toned, look.u.saturation);
    const contrasted = pow(max(saturated, vec3(0, 0, 0)).div(0.18), look.u.contrast).mul(0.18);

    // Vignette, grain and dither.
    const centered = screenUV.sub(0.5).mul(vec2(1.25, 1));
    const vignette = float(1).sub(look.u.vignette.mul(pow(centered.length().mul(1.3), 2.4)));
    const noise = pixelHash(this.frameIndex, 2);
    const grain = noise
      .sub(0.5)
      .mul(look.u.grain)
      .mul(float(1).sub(luma.mul(0.7)));
    const graded = clamp(contrasted.mul(vignette).add(grain), 0, 1);
    const encoded = sRGBTransferOETF(
      (p.has('nograde') ? clamp(mapped, 0, 1) : graded) as V3,
    ) as unknown as V3;
    const dither = pixelHash(this.frameIndex, 3).sub(0.5).div(255);

    this.pipeline = new THREE.RenderPipeline(app.renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = vec4(encoded.add(dither), 1);

    app.renderFrame = (info) => this.render(info.realDt);
  }

  private render(dt: number): void {
    const camera = this.app.camera;
    camera.updateMatrixWorld();
    this.invProj.value.copy(camera.projectionMatrixInverse);
    this.camWorld.value.copy(camera.matrixWorld);
    this.camPos.value.copy(camera.position);
    camera.getWorldDirection(this.camForward.value);
    this.frameIndex.value = (this.frameIndex.value + 1) % 4096;
    this.atmosphere.update(camera.position);
    // Still captures and the first frames after a cut have no meaningful motion to blur.
    this.motionBlurScale.value = dt > 0 && this.framesSinceCut > 2 ? 1 : 0;
    this.pipeline.render();
    const flashing = (this.lightning?.flash.value ?? 0) > 0.03;
    this.exposure.update(this.app.renderer, dt, dt === 0 || this.framesSinceCut < 2, flashing);
    this.framesSinceCut++;
  }
}
