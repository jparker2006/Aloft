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

const SHAPE_SCALE = 9000;
const SHAPE_SCALE_Y = 5000;
const DETAIL_SCALE = 1300;
const SCUD_BASE = 160;
const SCUD_TOP = 390;
const DECK_SPEED = 16;
const SCUD_SPEED = 28;
const MAX_DISTANCE = 45000;
/** Distance over which clouds dissolve into the horizon sky. */
const AERIAL_DISTANCE = 32000;

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

  private readonly invViewProj = uniform(new THREE.Matrix4());
  private readonly viewProj = uniform(new THREE.Matrix4());
  private readonly prevViewProj = uniform(new THREE.Matrix4());
  private readonly cameraPos = uniform(new THREE.Vector3());
  private readonly jitter = uniform(0);
  private readonly blend = uniform(1);
  private readonly accumulated = { frames: 0 };
  private lastViewProj = new THREE.Matrix4();

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

  constructor(
    app: App,
    look: LookUniforms,
    weather: WeatherUniforms,
    frame: FrameUniforms,
    quality: CloudQuality,
  ) {
    this.app = app;
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
    this.raw = make();
    this.history = [make(), make()];

    const march = new THREE.NodeMaterial();
    march.fragmentNode = this.buildMarch(quality);
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
    return this.look.u.cloudCoverage.mul(
      float(1).sub(inGap.mul(this.look.u.cloudGapStrength).mul(0.85)),
    ) as F;
  }

  private deckDensity(p: V3, withDetail: boolean): F {
    const base = this.weather.cloudBase;
    const thickness = this.look.u.cloudThickness;
    const h = saturate(p.y.sub(base).div(thickness));
    const profile = smoothstep(0, 0.1, h).mul(smoothstep(1, 0.45, h));
    const offset = this.weather.windDir.mul(this.frame.time.mul(DECK_SPEED));
    const q = vec3(
      p.x.sub(offset.x).div(SHAPE_SCALE),
      p.y.div(SHAPE_SCALE_Y),
      p.z.sub(offset.y).div(SHAPE_SCALE),
    );
    const s = texture3D(this.noise.shape, q).level(float(0));
    const fbm = s.r.mul(0.62).add(s.g.mul(0.25)).add(s.b.mul(0.13));
    const cov = this.coverageAt(p);
    let d = saturate(fbm.mul(profile).sub(cov.oneMinus()).div(cov.max(0.05))) as F;
    if (withDetail) {
      const dq = p.div(DETAIL_SCALE).add(vec3(0, this.frame.time.mul(0.004), 0));
      const det = texture3D(this.noise.detail, dq).level(float(0));
      const erosion = det.r.mul(0.6).add(det.g.mul(0.3)).add(det.b.mul(0.1));
      d = saturate(d.sub(erosion.mul(0.28).mul(float(1).sub(d)))) as F;
    }
    return d.mul(this.look.u.cloudDensity) as F;
  }

  private scudDensity(p: V3): F {
    const h = saturate(p.y.sub(SCUD_BASE).div(SCUD_TOP - SCUD_BASE));
    const profile = smoothstep(0, 0.35, h).mul(smoothstep(1, 0.4, h));
    const offset = this.weather.windDir.mul(this.frame.time.mul(SCUD_SPEED));
    const q = vec3(p.x.sub(offset.x).div(2600), p.y.div(1500), p.z.sub(offset.y).div(1800));
    const s = texture3D(this.noise.shape, q).level(float(0));
    const fbm = s.r.mul(0.55).add(s.g.mul(0.3)).add(s.a.mul(0.15));
    const cov = this.look.u.cloudCoverage.mul(0.62);
    const d = saturate(fbm.mul(profile).sub(cov.oneMinus()).div(cov));
    return d.mul(this.look.u.cloudDensity).mul(0.7) as F;
  }

  /** Light reaching a point from the key light through the deck (three samples toward the light). */
  private lightTransmittance(p: V3): F {
    const L = this.look.keyDirection;
    const od = this.deckDensity(p.add(L.mul(70)), false)
      .mul(140)
      .add(this.deckDensity(p.add(L.mul(260)), false).mul(260))
      .add(this.deckDensity(p.add(L.mul(700)), false).mul(640));
    return od as F;
  }

  /** In-scattered radiance at a sample from the key light and the ambient sky. */
  private sampleLight(p: V3, density: F, dir: V3, isDeck: boolean): V3 {
    const L = this.look.keyDirection;
    const cosTheta = dot(dir, L);
    const od = this.lightTransmittance(p);
    // Multiple-scattering approximation: three octaves with weaker extinction and flatter phase.
    let direct: F = float(0);
    const octaves = [
      [1, 1, 1],
      [0.5, 0.5, 0.5],
      [0.25, 0.25, 0.25],
    ] as const;
    for (const [a, b, c] of octaves) {
      const phase = mix(hg(cosTheta, 0.6 * c), hg(cosTheta, -0.25 * c), 0.3);
      direct = direct.add(exp(od.mul(-b)).mul(phase).mul(a)) as F;
    }
    const powder = float(1).sub(exp(density.mul(-2 * 60)));
    const key = this.look.u.keyColor
      .mul(this.look.u.keyIntensity)
      .mul(this.look.u.cloudLight)
      .mul(direct.mul(powder.mul(0.6).add(0.4)).mul(4 * Math.PI * 0.25));
    const height = isDeck
      ? saturate(p.y.sub(this.weather.cloudBase).div(this.look.u.cloudThickness))
      : float(0.2);
    const ambient = mix(this.look.u.cloudShadow, this.look.u.ambient.mul(6), height.mul(0.7));
    return key.add(ambient) as V3;
  }

  private buildMarch(quality: CloudQuality): V4 {
    return Fn(() => {
      const dir = this.rayFromUv(uv());
      const radiance = vec3(0, 0, 0).toVar();
      const transmittance = float(1).toVar();
      const firstHit = float(MAX_DISTANCE).toVar();

      If(dir.y.greaterThan(0.003), () => {
        // Interleaved-gradient-noise jitter per pixel and frame.
        const px = uv().mul(vec2(1024, 768));
        const jitter = fract(fract(dot(px, vec2(0.06711056, 0.00583715)).add(this.jitter)).mul(52.9829189));

        const march = (bottom: number | F, top: number | F, steps: number, deck: boolean) => {
          const toF = (x: number | F): F => (typeof x === 'number' ? (float(x) as F) : x);
          const t0 = max(toF(bottom).sub(this.cameraPos.y).div(dir.y), 0);
          const t1 = min(toF(top).sub(this.cameraPos.y).div(dir.y), MAX_DISTANCE);
          If(t1.greaterThan(t0), () => {
            const dt = t1.sub(t0).div(steps);
            Loop(steps, ({ i }: { i: THREE.Node<'int'> }) => {
              If(transmittance.lessThan(0.02), () => {
                Break();
              });
              const t = t0.add(float(i).add(jitter).mul(dt));
              const p = this.cameraPos.add(dir.mul(t));
              const density = deck ? this.deckDensity(p, true) : this.scudDensity(p);
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
        march(SCUD_BASE, SCUD_TOP, quality.scudSteps, false);
        march(
          this.weather.cloudBase,
          this.weather.cloudBase.add(this.look.u.cloudThickness),
          quality.deckSteps,
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
      const lightThrough = exp(this.lightTransmittance(p).negate());
      const cloudColor = this.look.u.cloudShadow.add(
        this.look.u.keyColor
          .mul(this.look.u.keyIntensity)
          .mul(this.look.u.cloudLight)
          .mul(lightThrough)
          .mul(0.12),
      );
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
    if (!still) this.accumulated.frames = 0;
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
