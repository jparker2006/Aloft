// World conventions (SPEC section 4): meters, +Y up, sea level at Y = 0, +Z north, +X west.
// Compass bearings run clockwise from north.

import * as THREE from 'three/webgpu';

const DEG = Math.PI / 180;

/** Horizontal unit vector pointing along a compass bearing in degrees. */
export function bearingToDir(bearingDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const b = bearingDeg * DEG;
  return out.set(-Math.sin(b), 0, Math.cos(b));
}

/** Unit vector for a bearing and an elevation angle above the horizon, both in degrees. */
export function directionFromAngles(bearingDeg: number, elevationDeg: number, out = new THREE.Vector3()) {
  const b = bearingDeg * DEG;
  const e = elevationDeg * DEG;
  return out.set(-Math.sin(b) * Math.cos(e), Math.sin(e), Math.cos(b) * Math.cos(e));
}
