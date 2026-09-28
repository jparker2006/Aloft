// Volumetric storm sky (SPEC section 7, step 6): a raymarched deck of storm cloud with low scud beneath,
// rendered at half resolution with per-frame jitter and temporal accumulation, then composited as the
// scene background: sky * transmittance + in-scattered cloud light.
//
// The raymarch runs in a full-screen pass whose pixels are mapped to view rays with the scene camera's
// inverse view-projection; the background maps each view ray back through the same matrices, so the
// two stay consistent whatever the render target's texel origin is.
import * as THREE from 'three/webgpu';
import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  atan,
  dot,
  exp,
  float,
  fract,
  max,
  min,
  mix,
  normalize,
  positionLocal,
  pow,
  saturate,
  select,
  smoothstep,
  texture,
  texture3D,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { App, FrameInfo } from '../app/app';
import type { FrameUniforms } from '../render/frameUniforms';
import type { LookUniforms } from '../render/look';
import type { WeatherUniforms } from '../render/weather';
import type { LightningUniforms } from '../fx/lightning';
import { CloudNoise } from './cloudNoise';

type F = THREE.Node<'float'>;
type V2 = THREE.Node<'vec2'>;
type V3 = THREE.Node<'vec3'>;
type V4 = THREE.Node<'vec4'>;

export interface CloudQuality {
  deckSteps: number;
  scudSteps: number;
}

export const CLOUD_QUALITY: Record<'low' | 'med' | 'high', CloudQuality> = {
  low: { deckSteps: 14, scudSteps: 5 },
  med: { deckSteps: 20, scudSteps: 6 },
  high: { deckSteps: 28, scudSteps: 8 },
};

const SHAPE_SCALE = 7000;
const SHAPE_SCALE_Y = 3000;
const DETAIL_SCALE = 620;
/** Fraction of the deck thickness over which density ramps in above the local base. */
const UNDERSIDE = 0.12;
/** Billows and pouches of the underside: a Worley height field this deep, with cells this wide / 8. */
const LUMP_DEPTH = 480;
const LUMP_SCALE = 6400;
const SCUD_BASE = 160;
const SCUD_TOP = 390;
const DECK_SPEED = 16;
const SCUD_SPEED = 28;
const MAX_DISTANCE = 45000;
/** Distance over which clouds dissolve into the horizon sky. */
const AERIAL_DISTANCE = 32000;
/** Two-stream diffusion through a thick, forward-scattering slab: T = 1 / (1 + k * opticalDepth). */
const DIFFUSION_K = 0.12;
/** Sky and sun irradiance on the deck top that diffuses down to the base, relative to the look's ambient. */
const TOP_AMBIENT = 1.35;
const TOP_KEY = 0.004;
/** Low sunlight entering under the deck through the gap and lighting the base from below. */
const UNDERLIGHT = 0.2;
/** Optical depth of the deck between a sample and the gap, per unit of blocking coverage (two probes). */
const FAR_OCCLUSION = 10;
/** Lightning inside the deck: radiance scale and the radius of its bright core, metres. */
const FLASH_POWER = 1.6;
const FLASH_CORE = 450;
const FLASH_REACH = 1800;

const toF = (x: number | F): F => (typeof x === 'number' ? (float(x) as F) : x);

function remap(v: F, a: number | F, b: number | F, c: number, d: number): F {
  return float(c).add(
    v
      .sub(a)
      .div(toF(b).sub(a))
      .mul(d - c),
  ) as F;
}

/** Henyey-Greenstein phase function. */
function hg(cosTheta: F, g: number): F {
  const g2 = g * g;
  return float((1 - g2) / (4 * Math.PI)).div(pow(float(1 + g2).sub(cosTheta.mul(2 * g)), 1.5)) as F;
}

export class StormClouds {
  readonly name = 'clouds';
  readonly noise = new CloudNoise();
  private readonly app: App;
  private readonly look: LookUniforms;
  private readonly weather: WeatherUniforms;
  private readonly frame: FrameUniforms;
  private readonly lightning: LightningUniforms | null;

  private readonly invViewProj = uniform(new THREE.Matrix4());
  private readonly viewProj = uniform(new THREE.Matrix4());
  private readonly prevViewProj = uniform(new THREE.Matrix4());
  private readonly cameraPos = uniform(new THREE.Vector3());
  private readonly jitter = uniform(0);
  private readonly rawSize = uniform(new THREE.Vector2(1, 1));
  private readonly blend = uniform(1);
  private readonly accumulated = { frames: 0 };
  private lastViewProj = new THREE.Matrix4();
  private lastFlash = 0;

  private raw: THREE.RenderTarget;
  private history: [THREE.RenderTarget, THREE.RenderTarget];
  private current = 0;
  private readonly marchQuad: THREE.QuadMesh;
  private readonly resolveQuad: THREE.QuadMesh;
  private readonly resolveMaterial: THREE.NodeMaterial;
  private readonly historyNode: THREE.TextureNode;
  private readonly resolvedNode: THREE.TextureNode;
  /** Shot mode stops re-marching once accumulation has converged. */
  maxAccumulatedFrames = Infinity;
  /** Raymarch step counts; uniforms so the quality ladder can change them without recompiling. */
  readonly deckSteps = uniform(28, 'int');
  readonly scudSteps = uniform(8, 'int');

  constructor(
    app: App,
    look: LookUniforms,
    weather: WeatherUniforms,
    frame: FrameUniforms,
    quality: CloudQuality,
    lightning: LightningUniforms | null = null,
  ) {
    this.app = app;
    this.lightning = lightning;
    this.look = look;
    this.weather = weather;
    this.frame = frame;
    const make = () =>
      new THREE.RenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        depthBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    this.deckSteps.value = quality.deckSteps;
    this.scudSteps.value = quality.scudSteps;
    this.raw = make();
    this.history = [make(), make()];

    const march = new THREE.NodeMaterial();
    march.fragmentNode = this.buildMarch();
    this.marchQuad = new THREE.QuadMesh(march);

    this.historyNode = texture(this.history[1].texture);
    this.resolveMaterial = new THREE.NodeMaterial();
    this.resolveMaterial.fragmentNode = this.buildResolve();
    this.resolveQuad = new THREE.QuadMesh(this.resolveMaterial);

    this.resolvedNode = texture(this.history[0].texture);
    app.onResize((w, h) => this.resize(w, h));
    this.resize(app.renderer.domElement.width, app.renderer.domElement.height);
  }

  private resize(width: number, height: number): void {
    const w = Math.max(1, Math.ceil(width / 2));
    const h = Math.max(1, Math.ceil(height / 2));
    this.raw.setSize(w, h);
    this.rawSize.value.set(w, h);
    this.history[0].setSize(w, h);
    this.history[1].setSize(w, h);
    this.accumulated.frames = 0;
  }

  /** View ray for a full-screen pass UV. */
  private rayFromUv(u: V2): V3 {
    const ndc = u.mul(2).sub(1);
    const p = this.invViewProj.mul(vec4(ndc.x, ndc.y, 0.5, 1));
    return normalize(p.xyz.div(p.w).sub(this.cameraPos)) as V3;
  }

  /** Full-screen pass UV for a view ray, through a view-projection matrix. */
  private uvFromRay(dir: V3, viewProj: THREE.UniformNode<'mat4', THREE.Matrix4>): V2 {
    const clip = viewProj.mul(vec4(dir, 0));
    return clip.xy.div(clip.w).mul(0.5).add(0.5) as V2;
  }

  /** Coverage after the dusk gap: a break in the deck near the horizon on the gap bearing. */
  private coverageAt(p: V3): F {
    const rel = p.xz.sub(this.cameraPos.xz);
    const dist = rel.length();
    // Bearing of the sample from the camera (clockwise from north, +Z north, +X west).
    const bearing = atan(rel.x.negate(), rel.y).mul(180 / Math.PI);
    const dBearing = abs(fract(bearing.sub(this.look.u.cloudGapBearing).div(360).add(0.5)).sub(0.5)).mul(360);
    const inGap = float(1)
      .sub(smoothstep(this.look.u.cloudGapWidth.mul(0.35), this.look.u.cloudGapWidth, dBearing))
      .mul(smoothstep(6000, 14000, dist));
    return this.look.u.cloudCoverage.mul(float(1).sub(inGap.mul(this.look.u.cloudGapStrength).mul(0.7))) as F;
  }

  /** Height fraction through the deck, 0 at the lowest pouches and 1 at the top. */
  private deckHeight(p: V3): F {
    return saturate(p.y.sub(this.weather.cloudBase).div(this.look.u.cloudThickness)) as F;
  }

  /**
   * Local base height: inverted Worley cells hang pouches and rolls below the deck (lowest at cell
   * centres), two octaves so large rolls carry smaller pouches.
   */
  private localBase(p: V3, offset: V2): F {
    const q = vec3(p.x.sub(offset.x).div(LUMP_SCALE), 0.37, p.z.sub(offset.y).div(LUMP_SCALE));
    const n = texture3D(this.noise.shape, q).level(float(0));
    const cells = n.g.mul(0.65).add(n.b.mul(0.35));
    return this.weather.cloudBase.add(float(1).sub(cells).mul(LUMP_DEPTH)) as F;
  }

  /**
   * Deck density (after Schneider 2015): Perlin-Worley dilated by Worley fBm, a height profile that
   * starts at the lumpy local base, then coverage, then detail erosion that is wispy at the base and
   * billowy above.
   */
  private deckDensity(p: V3, withDetail: boolean): F {
    const h = this.deckHeight(p);
    const offset = this.weather.windDir.mul(this.frame.time.mul(DECK_SPEED)) as V2;
    const above = p.y.sub(this.localBase(p, offset)).div(this.look.u.cloudThickness);
    const profile = smoothstep(0, UNDERSIDE, above).mul(smoothstep(1, 0.62, h));
    const q = vec3(
      p.x.sub(offset.x).div(SHAPE_SCALE),
      p.y.div(SHAPE_SCALE_Y),
      p.z.sub(offset.y).div(SHAPE_SCALE),
    );
    const s = texture3D(this.noise.shape, q).level(float(0));
    const worleyFbm = s.g.mul(0.625).add(s.b.mul(0.25)).add(s.a.mul(0.125));
    const shape = saturate(remap(s.r as F, worleyFbm.sub(1) as F, 1, 0, 1));
    const cov = this.coverageAt(p);
    let d = saturate(remap(shape.mul(profile) as F, cov.oneMinus() as F, 1, 0, 1)).mul(cov) as F;
    if (withDetail) {
      const dq = vec3(p.x.sub(offset.x), p.y.add(this.frame.time.mul(3)), p.z.sub(offset.y)).div(
        DETAIL_SCALE,
      );
      const det = texture3D(this.noise.detail, dq).level(float(0));
      const hf = det.r.mul(0.625).add(det.g.mul(0.25)).add(det.b.mul(0.125));
      const erosion = mix(hf, hf.oneMinus(), saturate(h.mul(5)));
      d = saturate(remap(d, erosion.mul(0.5) as F, 1, 0, 1)) as F;
    }
    return d.mul(this.look.u.cloudDensity) as F;
  }

  /** Ragged scud beneath the deck, torn by the wind (stretched downwind) and eroded by detail noise. */
  private scudDensity(p: V3, withDetail: boolean): F {
    const h = saturate(p.y.sub(SCUD_BASE).div(SCUD_TOP - SCUD_BASE));
    const profile = smoothstep(0, 0.35, h).mul(smoothstep(1, 0.4, h));
    const offset = this.weather.windDir.mul(this.frame.time.mul(SCUD_SPEED));
    const q = vec3(p.x.sub(offset.x).div(2600), p.y.div(1500), p.z.sub(offset.y).div(1800));
    const s = texture3D(this.noise.shape, q).level(float(0));
    const fbm = s.r.mul(0.55).add(s.g.mul(0.3)).add(s.a.mul(0.15));
    const cov = this.look.u.cloudCoverage.mul(0.7);
    let d = saturate(fbm.mul(profile).sub(cov.oneMinus()).div(cov)) as F;
    if (withDetail) {
      const dq = vec3(p.x.sub(offset.x), p.y, p.z.sub(offset.y)).div(DETAIL_SCALE * 0.45);
      const det = texture3D(this.noise.detail, dq).level(float(0));
      const hf = det.r.mul(0.625).add(det.g.mul(0.25)).add(det.b.mul(0.125));
      d = saturate(remap(d, hf.mul(0.6) as F, 1, 0, 1)) as F;
    }
    return d.mul(this.look.u.cloudDensity).mul(0.7) as F;
  }

  /** Scud self-shadowing toward the key light, plus the deck above it. */
  private scudKeyOpticalDepth(p: V3): F {
    const L = this.look.keyDirection;
    return this.scudDensity(p.add(L.mul(40)), false)
      .mul(80)
      .add(this.scudDensity(p.add(L.mul(160)), false).mul(240))
      .add(this.keyOpticalDepth(p)) as F;
  }

  /** Optical depth from a point toward the key light (two samples, no detail). */
  private keyOpticalDepth(p: V3): F {
    const L = this.look.keyDirection;
    return this.deckDensity(p.add(L.mul(120)), false)
      .mul(200)
      .add(this.deckDensity(p.add(L.mul(520)), false).mul(600)) as F;
  }

  /** Optical depth from a point straight up through the deck (two samples, no detail). */
  private upOpticalDepth(p: V3): F {
    return this.deckDensity(p.add(vec3(0, 70, 0)), false)
      .mul(140)
      .add(this.deckDensity(p.add(vec3(0, 300, 0)), false).mul(400)) as F;
  }

  /**
   * The low sun crosses kilometres of deck before reaching most samples: probe the coverage field
   * (cheap, no texture reads) along the key direction and treat covered stretches as opaque. Only cloud
   * near the gap sees the sun directly.
   */
  private farOcclusion(p: V3): F {
    const L = this.look.keyDirection;
    const flat = vec3(L.x, 0, L.z).normalize();
    const block = (distance: number) =>
      smoothstep(0.35, 0.8, this.coverageAt(p.add(flat.mul(distance)) as V3)) as F;
    return block(2500).add(block(7000)).mul(FAR_OCCLUSION) as F;
  }

  /** Irradiance on the deck top that diffuses down through it. */
  private topLight(): V3 {
    const u = this.look.u;
    return u.ambient
      .mul(TOP_AMBIENT)
      .add(u.keyColor.mul(u.keyIntensity).mul(u.cloudLight).mul(TOP_KEY)) as V3;
  }

  /**
   * Low sunlight under the deck: brightest on bases toward the key light and toward the gap, fading
   * with height into the cloud. Zero without a gap (night).
   */
  private underLight(p: V3, lowness: F): V3 {
    const u = this.look.u;
    const rel = p.xz.sub(this.cameraPos.xz);
    const dist = rel.length();
    const keyFlat = this.look.keyDirection.xz.div(max(this.look.keyDirection.xz.length(), 1e-4));
    const sunward = pow(saturate(dot(rel.div(max(dist, 1)), keyFlat)), 8);
    const reach = smoothstep(3500, 12000, dist);
    return u.keyColor
      .mul(u.keyIntensity)
      .mul(u.cloudLight)
      .mul(sunward.mul(reach).mul(lowness).mul(u.cloudGapStrength).mul(UNDERLIGHT)) as V3;
  }

  /** In-scattered radiance at a sample: direct key light, diffuse light through the deck, light from below. */
  private sampleLight(p: V3, density: F, dir: V3, isDeck: boolean): V3 {
    const u = this.look.u;
    const L = this.look.keyDirection;
    const cosTheta = dot(dir, L);
    const odKey = (isDeck ? this.keyOpticalDepth(p) : this.scudKeyOpticalDepth(p)).add(this.farOcclusion(p));
    // Multiple-scattering approximation (Wrenninge): octaves with weaker extinction and flatter phase.
    let direct: F = float(0);
    const octaves = [
      [1, 1, 1],
      [0.5, 0.5, 0.5],
      [0.25, 0.25, 0.25],
    ] as const;
    for (const [a, b, c] of octaves) {
      const phase = mix(hg(cosTheta, 0.6 * c), hg(cosTheta, -0.25 * c), 0.3);
      direct = direct.add(exp(odKey.mul(-b)).mul(phase).mul(a)) as F;
    }
    const powder = float(1).sub(exp(density.mul(-120)));
    const key = u.keyColor
      .mul(u.keyIntensity)
      .mul(u.cloudLight)
      .mul(direct.mul(powder.mul(0.6).add(0.4)).mul(Math.PI));
    const h = isDeck ? this.deckHeight(p) : (float(0) as F);
    const odUp = isDeck
      ? this.upOpticalDepth(p)
      : this.upOpticalDepth(vec3(p.x, this.weather.cloudBase, p.z) as V3);
    // Lumps hanging low under the deck sit in its shadow; the base between them, higher up, is lighter.
    const depthShade = isDeck ? mix(float(0.16), float(1), smoothstep(0, 0.4, h)) : float(0.35);
    const diffuse = this.topLight()
      .div(float(1).add(odUp.mul(DIFFUSION_K)))
      .mul(depthShade);
    const lowness = isDeck ? (float(1).sub(h).pow(3) as F) : (float(0.2) as F);
    const below = u.cloudShadow.add(this.underLight(p, lowness));
    return key.add(diffuse).add(below).add(this.flashLight(p)) as V3;
  }

  /** Unoccluded flash radiance at a point: a point source inside the deck with a soft core. */
  private flashFalloff(p: V3): F {
    if (!this.lightning) return float(0) as F;
    const d = p.sub(this.lightning.cloudPos).length();
    // Inverse square around a soft core, and extinction through kilometres of deck beyond it.
    return float(1)
      .div(float(1).add(d.div(FLASH_CORE).pow(2)))
      .mul(exp(d.div(-FLASH_REACH))) as F;
  }

  /**
   * Light from a lightning strike inside the deck, diffused through the cloud between the sample and the
   * channel (two density probes, two-stream transmittance). Evaluated only while a flash is live.
   */
  private flashLight(p: V3): V3 {
    const lightning = this.lightning;
    if (!lightning) return vec3(0, 0, 0) as V3;
    const out = vec3(0, 0, 0).toVar();
    If(lightning.flash.greaterThan(0.0005), () => {
      const toStrike = lightning.cloudPos.sub(p);
      const d = toStrike.length();
      const dir = toStrike.div(max(d, 1));
      const near = min(d.mul(0.25), 400);
      const far = min(d.mul(0.6), 1600);
      const od = this.deckDensity(p.add(dir.mul(near)), false)
        .mul(near.mul(2))
        .add(this.deckDensity(p.add(dir.mul(far)), false).mul(far.sub(near).mul(1.5)));
      const transmittance = float(1).div(float(1).add(od.mul(0.18)));
      out.assign(
        lightning.color.mul(lightning.flash.mul(this.flashFalloff(p)).mul(transmittance).mul(FLASH_POWER)),
      );
    });
    return out as unknown as V3;
  }

  private buildMarch(): V4 {
    return Fn(() => {
      const dir = this.rayFromUv(uv());
      const radiance = vec3(0, 0, 0).toVar();
      const transmittance = float(1).toVar();
      const firstHit = float(MAX_DISTANCE).toVar();

      If(dir.y.greaterThan(0.003), () => {
        // Interleaved-gradient-noise jitter per pixel and frame.
        const px = uv().mul(this.rawSize).floor();
        // Interleaved gradient noise per pixel, shifted by a golden-ratio sequence per frame so the
        // accumulated frames stratify each pixel's sample offsets.
        const ign = fract(fract(dot(px, vec2(0.06711056, 0.00583715))).mul(52.9829189));
        const jitter = fract(ign.add(this.jitter));

        const march = (bottom: number | F, top: number | F, steps: THREE.Node<'int'>, deck: boolean) => {
          const toF = (x: number | F): F => (typeof x === 'number' ? (float(x) as F) : x);
          const t0 = max(toF(bottom).sub(this.cameraPos.y).div(dir.y), 0);
          const t1 = min(toF(top).sub(this.cameraPos.y).div(dir.y), MAX_DISTANCE);
          If(t1.greaterThan(t0), () => {
            // Quadratic step distribution: short steps where the ray enters the layer (the base is what
            // the camera sees), longer ones deeper in, where little light gets back out.
            const span = t1.sub(t0);
            const n = float(steps);
            Loop({ start: 0, end: steps, type: 'int', condition: '<' }, ({ i }: { i: THREE.Node<'int'> }) => {
              If(transmittance.lessThan(0.02), () => {
                Break();
              });
              const s = float(i).add(jitter).div(n);
              const t = t0.add(span.mul(s.mul(s)));
              const dt = span.mul(s.mul(2).add(1 / 64)).div(n);
              const p = this.cameraPos.add(dir.mul(t));
              const density = deck ? this.deckDensity(p, true) : this.scudDensity(p, true);
              If(density.greaterThan(0.0001), () => {
                firstHit.assign(min(firstHit, t));
                const scatter = this.sampleLight(p, density, dir, deck).mul(density);
                const stepT = exp(density.mul(dt).negate());
                // Energy-conserving integration over the step (Hillaire 2015).
                const integrated = scatter.sub(scatter.mul(stepT)).div(density);
                const aerial = exp(t.div(-AERIAL_DISTANCE));
                radiance.addAssign(integrated.mul(transmittance).mul(aerial));
                transmittance.mulAssign(mix(float(1), stepT, aerial));
              });
            });
          });
        };
        march(SCUD_BASE, SCUD_TOP, this.scudSteps, false);
        march(
          this.weather.cloudBase,
          this.weather.cloudBase.add(this.look.u.cloudThickness),
          this.deckSteps,
          true,
        );
      });
      return vec4(radiance, transmittance);
    })() as unknown as V4;
  }

  private buildResolve(): V4 {
    return Fn(() => {
      const u = uv();
      const current = texture(this.raw.texture, u);
      const dir = this.rayFromUv(u);
      const prevUv = this.uvFromRay(dir, this.prevViewProj);
      const inside = prevUv.x
        .greaterThanEqual(0)
        .and(prevUv.x.lessThanEqual(1))
        .and(prevUv.y.greaterThanEqual(0))
        .and(prevUv.y.lessThanEqual(1));
      const history = this.historyNode.sample(prevUv);
      return select(inside, mix(history, current, this.blend), current);
    })() as unknown as V4;
  }

  /** Background radiance for a view direction: sky seen through the clouds plus cloud light. */
  background(sky: (dir: V3) => V3): V3 {
    const dir = normalize(positionLocal) as V3;
    const clouds = this.resolvedNode.sample(this.uvFromRay(dir, this.viewProj));
    const below = smoothstep(0.004, -0.02, dir.y);
    const lit = sky(dir).mul(clouds.a).add(clouds.rgb);
    return mix(lit, sky(dir), below) as V3;
  }

  /**
   * Cheap sky-with-clouds for reflections: one density sample on a plane inside the deck, lit with the
   * deck's shadow and light colors. Reflections are blurred by waves, so this is enough.
   */
  reflection(sky: (dir: V3) => V3): (dir: V3) => V3 {
    return (dirIn: V3) => {
      const dir = normalize(dirIn) as V3;
      const planeY = this.weather.cloudBase.add(this.look.u.cloudThickness.mul(0.25));
      const t = min(planeY.sub(this.cameraPos.y).div(dir.y.max(0.01)), MAX_DISTANCE);
      const p = this.cameraPos.add(dir.mul(t));
      const density = this.deckDensity(p, false);
      const slant = float(1).div(dir.y.max(0.06));
      const od = density.mul(this.look.u.cloudThickness).mul(0.35).mul(slant);
      const aerial = exp(t.div(-AERIAL_DISTANCE));
      const cover = float(1).sub(exp(od.negate())).mul(aerial);
      const u = this.look.u;
      const diffuse = this.topLight().div(float(1).add(od.mul(2).mul(DIFFUSION_K)));
      let cloudColor = u.cloudShadow.add(diffuse).add(this.underLight(p, float(0.6) as F)) as V3;
      if (this.lightning) {
        const flash = this.lightning.color.mul(
          this.lightning.flash.mul(this.flashFalloff(p)).mul(FLASH_POWER * 0.35),
        );
        cloudColor = cloudColor.add(flash) as V3;
      }
      return mix(sky(dir), cloudColor, cover) as V3;
    };
  }

  update(frame: FrameInfo): void {
    const renderer = this.app.renderer;
    this.noise.generate(renderer);
    const camera = this.app.camera;
    camera.updateMatrixWorld();
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.viewProj.value.copy(vp);
    this.invViewProj.value.copy(vp).invert();
    this.cameraPos.value.copy(camera.position);

    const still = vp.equals(this.lastViewProj) && frame.realDt === 0;
    // A still frame whose lighting changed (a shot's flash coming on) starts accumulating afresh; in play
    // the 0.2 history blend already follows the flash within a few frames.
    const flash = this.lightning?.flash.value ?? 0;
    if (!still || (still && Math.abs(flash - this.lastFlash) > 1e-4)) this.accumulated.frames = 0;
    this.lastFlash = flash;
    if (this.accumulated.frames >= this.maxAccumulatedFrames) return;

    this.prevViewProj.value.copy(this.accumulated.frames === 0 ? vp : this.lastViewProj);
    this.lastViewProj.copy(vp);
    this.jitter.value = (frame.frame * 0.61803398875) % 1;
    this.blend.value = this.accumulated.frames === 0 ? 1 : still ? 1 / (this.accumulated.frames + 1) : 0.2;
    this.accumulated.frames++;

    renderer.setRenderTarget(this.raw);
    this.marchQuad.render(renderer);

    const read = this.history[this.current];
    const write = this.history[1 - this.current];
    this.historyNode.value = read.texture;
    renderer.setRenderTarget(write);
    this.resolveQuad.render(renderer);
    renderer.setRenderTarget(null);
    this.resolvedNode.value = write.texture;
    this.current = 1 - this.current;
  }
}
