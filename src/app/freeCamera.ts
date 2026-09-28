// Dev free camera (step 12): fly around the hero scene between bookmarks. Not gameplay.
//   Click to capture the mouse, WASD to move, Q/E down/up, Shift for speed, Esc to release.
//   1-4 jump to the milestone 1 bookmarks, P blends dusk <-> night, L forces a lightning strike.
import * as THREE from 'three/webgpu';
import type { App } from './app';
import { applyBookmarkCamera } from './shot';
import { MILESTONE_1_BOOKMARKS } from '../shots';

export interface FreeCameraActions {
  togglePreset(): void;
  strike(): void;
}

export class FreeCamera {
  readonly name = 'free-camera';
  private readonly keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;

  constructor(
    private readonly app: App,
    actions: FreeCameraActions,
  ) {
    const canvas = app.renderer.domElement;
    // Pointer lock is optional: some embedded or mobile views refuse it, and newer browsers reject a
    // promise instead of throwing.
    canvas.addEventListener('click', () => {
      const request = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      request?.catch?.(() => undefined);
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const s = 0.0022 * app.settings.mouseSensitivity;
      this.yaw -= e.movementX * s;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * s * (app.settings.invertY ? -1 : 1),
        -1.5,
        1.5,
      );
    });
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      const digit = Number.parseInt(e.key, 10);
      if (digit >= 1 && digit <= MILESTONE_1_BOOKMARKS.length) this.jumpTo(digit - 1);
      if (e.code === 'KeyP') actions.togglePreset();
      if (e.code === 'KeyL') actions.strike();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.syncFromCamera();
  }

  private syncFromCamera(): void {
    const euler = new THREE.Euler().setFromQuaternion(this.app.camera.quaternion, 'YXZ');
    this.yaw = euler.y;
    this.pitch = euler.x;
  }

  jumpTo(index: number): void {
    const bookmark = MILESTONE_1_BOOKMARKS[index];
    if (!bookmark) return;
    applyBookmarkCamera(this.app, bookmark);
    this.syncFromCamera();
  }

  update(frame: { realDt: number }): void {
    const cam = this.app.camera;
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 60 : 12) * frame.realDt;
    const move = new THREE.Vector3(
      (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0),
      (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0),
    );
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed).applyQuaternion(cam.quaternion);
      cam.position.add(move);
      cam.position.y = Math.max(cam.position.y, 0.5);
    }
  }
}
