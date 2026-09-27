// Compute particles (SPEC section 7, step 8).
//   Rain: a camera-local box of streaks that wraps as the camera moves, falling at terminal speed and
//         carried by the wind (the gale's rain is strongly slanted). Drops that meet the sea respawn at
//         the top of the box.
//   Spindrift: spray torn off breaking crests. Dead particles scout random points around the camera and
//         are born only where the ocean's Jacobian says a crest is breaking under strong wind, so spray
//         concentrates on the crests. They are carried downwind, sink, and fade.
// Both are simulated in compute from storage buffers and drawn instanced.
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  attribute,
  cameraPosition,
  cross,
  dot,
  exp,
  float,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  mod,
  normalize,
  pow,
  saturate,
  smoothstep,
  uint,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { LightningUniforms } from './lightning';
import type { LookUniforms } from '../render/look';
import type { WeatherUniforms } from '../render/weather';
import type { Ocean } from '../ocean/ocean';

type F = THREE.Node<'float'>;
type V3 = THREE.Node<'vec3'>;
type V4 = THREE.Node<'vec4'>;
interface ArrayView {
  element(index: unknown): V4;
}

const RAIN_BOX = 70;
const RAIN_BELOW = 20;
const RAIN_ABOVE = 45;

export interface ParticleLighting {
  look: LookUniforms;
  weather: WeatherUniforms;
  lightning: LightningUniforms | null;
}

/** Light arriving at a particle: ambient, the key light (strong forward scattering), the flash. */
function particleLight(lit: ParticleLighting, view: V3, forward: number, ambientGain: number): V3 {
  const L = lit.look.keyDirection;
  const key = lit.look.u.keyColor.mul(lit.look.u.keyIntensity);
  const scatter = pow(saturate(dot(view.negate(), L)), 7)
    .mul(forward)
    .add(0.25);
  let light = lit.look.u.ambient.mul(ambientGain).add(key.mul(scatter)) as unknown as V3;
  if (lit.lightning) light = light.add(lit.lightning.color.mul(lit.lightning.flash.mul(1.4))) as V3;
  return light;
}

export class Rain {
  readonly mesh: THREE.Mesh;
  private readonly positions: ArrayView;
  private readonly dt = uniform(0);
  private readonly camera = uniform(new THREE.Vector3());
  private readonly simulate: THREE.ComputeNode;
  private readonly init: THREE.ComputeNode;
  private initialized = false;

  constructor(
    readonly count: number,
    lit: ParticleLighting,
    ocean: Ocean,
  ) {
    const positions = instancedArray(count, 'vec4');
    this.positions = positions as unknown as ArrayView;
    const w = lit.weather;
    const velocityOf = (seed: F): V3 =>
      vec3(
        w.windDir.x.mul(w.windSpeed).mul(0.8),
        float(-8.5).sub(seed.mul(2.5)),
        w.windDir.y.mul(w.windSpeed).mul(0.8),
      ) as V3;

    this.init = Fn(() => {
      const r = vec3(hash(instanceIndex), hash(instanceIndex.add(count)), hash(instanceIndex.add(count * 2)));
      const p = this.camera.add(r.sub(0.5).mul(vec3(RAIN_BOX, RAIN_BELOW + RAIN_ABOVE, RAIN_BOX)));
      this.positions.element(instanceIndex).assign(vec4(p, hash(instanceIndex.add(count * 3))));
    })().compute(count, [64]);

    this.simulate = Fn(() => {
      const state = this.positions.element(instanceIndex);
      const seed = state.w;
      const p = state.xyz.add(velocityOf(seed).mul(this.dt)).toVar();
      // Wrap horizontally into the box around the camera.
      const rel = p.xz.sub(this.camera.xz).add(RAIN_BOX / 2);
      p.x.assign(
        mod(rel.x, RAIN_BOX)
          .sub(RAIN_BOX / 2)
          .add(this.camera.x),
      );
      p.z.assign(
        mod(rel.y, RAIN_BOX)
          .sub(RAIN_BOX / 2)
          .add(this.camera.z),
      );
      // Drops that reach the sea (or fall below the box) start again at the top.
      const sea = ocean.displacement(p.xz, p.xz.sub(this.camera.xz).length()).y;
      If(p.y.lessThan(max(sea, this.camera.y.sub(RAIN_BELOW))), () => {
        p.y.addAssign(
          float(RAIN_BELOW + RAIN_ABOVE)
            .mul(0.6)
            .add(seed.mul(RAIN_ABOVE * 0.4)),
        );
      });
      state.assign(vec4(p, seed));
    })().compute(count, [64]);

    // A unit quad per drop; corners expand along the drop's motion and sideways toward the camera.
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    quad.setAttribute('corner', new THREE.Float32BufferAttribute([-1, 0, 1, 0, -1, 1, 1, 1], 2));
    quad.setIndex([0, 1, 2, 1, 3, 2]);
    quad.instanceCount = count;

    const material = new THREE.MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    const state = this.positions.element(instanceIndex);
    const center = state.xyz as unknown as V3;
    const velocity = velocityOf(state.w as unknown as F);
    const dir = normalize(velocity);
    const toCamera = cameraPosition.sub(center);
    const distance = toCamera.length();
    const view = toCamera.div(distance) as V3;
    const side = normalize(cross(dir, view));
    // A 1/45 s exposure streak; never thinner than about a pixel, with alpha keeping the drop's energy.
    const length = velocity.length().mul(1 / 45);
    const minWidth = distance.mul(0.0008);
    const width = max(float(0.0016), minWidth);
    const corner = attribute<'vec2'>('corner', 'vec2');
    material.positionNode = center
      .add(side.mul(corner.x.mul(width)))
      .add(dir.mul(corner.y.sub(0.5).mul(length)));
    const visible = hash(instanceIndex.add(count * 5)).lessThan(w.rainRate);
    const fade = smoothstep(0.6, 2.5, distance).mul(
      float(1).sub(smoothstep(RAIN_BOX * 0.3, RAIN_BOX * 0.5, distance)),
    );
    const edge = float(1).sub(corner.x.abs());
    const energy = float(0.0016).div(width);
    const alpha = visible.select(fade.mul(edge).mul(energy).mul(0.32), float(0));
    material.colorNode = vec4(particleLight(lit, view, 3.5, 5), alpha);
    this.mesh = new THREE.Mesh(quad, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  step(renderer: THREE.WebGPURenderer, camera: THREE.Camera, dt: number): void {
    this.camera.value.copy(camera.position);
    if (!this.initialized) {
      renderer.compute(this.init);
      this.initialized = true;
    }
    if (dt <= 0) return;
    this.dt.value = Math.min(dt, 0.1);
    renderer.compute(this.simulate);
  }
}

export class Spindrift {
  readonly sprite: THREE.Sprite;
  private readonly state: ArrayView;
  private readonly motion: ArrayView;
  private readonly dt = uniform(0);
  private readonly camera = uniform(new THREE.Vector3());
  private readonly frame = uniform(0, 'uint');
  private readonly simulate: THREE.ComputeNode;

  constructor(
    readonly count: number,
    lit: ParticleLighting,
    ocean: Ocean,
  ) {
    const state = instancedArray(count, 'vec4'); // xyz position, w age
    const motion = instancedArray(count, 'vec4'); // xyz velocity, w lifetime
    this.state = state as unknown as ArrayView;
    this.motion = motion as unknown as ArrayView;
    const w = lit.weather;
    const windVelocity = vec3(w.windDir.x, 0, w.windDir.y).mul(w.windSpeed);

    this.simulate = Fn(() => {
      const s = this.state.element(instanceIndex);
      const m = this.motion.element(instanceIndex);
      const p = s.xyz.toVar();
      const v = m.xyz.toVar();
      const age = s.w.add(this.dt).toVar();
      const life = m.w.toVar();
      If(age.greaterThanEqual(life), () => {
        // Scout a random point near the camera; spawn only on a breaking crest in a strong wind.
        const seed = instanceIndex.add(this.frame.mul(uint(7919)));
        const angle = hash(seed).mul(Math.PI * 2);
        const radius = pow(hash(seed.add(1)), 0.6).mul(170);
        const xz = this.camera.xz.add(vec2(angle.cos(), angle.sin()).mul(radius));
        const surface = ocean.surfaceLevel0(xz);
        const breaking = surface.jacobian.lessThan(0.55).and(w.windSpeed.greaterThan(14));
        If(breaking, () => {
          p.assign(vec3(xz.x, surface.height.add(0.2), xz.y));
          const up = hash(seed.add(2)).mul(3).add(1.5);
          v.assign(windVelocity.mul(hash(seed.add(3)).mul(0.3).add(0.35)).add(vec3(0, up, 0)));
          age.assign(0);
          life.assign(hash(seed.add(4)).mul(1.8).add(1.2));
        });
      }).Else(() => {
        // Drag toward the wind, gravity partly offset by turbulence.
        v.assign(mix(windVelocity, v, exp(this.dt.mul(-1.6))).add(vec3(0, -4.5, 0).mul(this.dt)));
        p.addAssign(v.mul(this.dt));
      });
      s.assign(vec4(p, age));
      m.assign(vec4(v, life));
    })().compute(count, [64]);

    const material = new THREE.SpriteNodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    const s = this.state.element(instanceIndex);
    const m = this.motion.element(instanceIndex);
    const t = saturate(s.w.div(m.w.max(0.01)));
    const alive = s.w.lessThan(m.w);
    material.positionNode = s.xyz;
    material.scaleNode = alive.select(float(0.25).add(t.mul(1.6)), float(0));
    const toCamera = cameraPosition.sub(s.xyz);
    const view = normalize(toCamera) as V3;
    const r = uv().sub(0.5).length().mul(2);
    const puff = float(1).sub(smoothstep(0.2, 1, r));
    const alpha = puff
      .mul(smoothstep(0, 0.15, t))
      .mul(float(1).sub(smoothstep(0.55, 1, t)))
      .mul(0.3);
    material.colorNode = vec4(particleLight(lit, view, 5, 4), alive.select(alpha, float(0)));
    this.sprite = new THREE.Sprite(material);
    this.sprite.count = count;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 1;
  }

  step(renderer: THREE.WebGPURenderer, camera: THREE.Camera, dt: number, frame: number): void {
    this.camera.value.copy(camera.position);
    if (dt <= 0) return;
    this.dt.value = Math.min(dt, 0.25);
    this.frame.value = frame % 100000;
    renderer.compute(this.simulate);
  }
}
