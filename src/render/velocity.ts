// Motion vectors for vertices placed in the shader.
//
// three.js derives each vertex's previous-frame position from the raw geometry attribute. That is right for
// rigid meshes, but wrong for any vertex positioned in the shader: the ocean's displacement, particle quads
// expanded from storage buffers, bolt ribbons. Their motion vector came out as the whole displacement, and
// motion blur smeared it into streaks across the frame. This wrapper assigns the previous position as well,
// so motion vectors carry camera and object motion only (the per-vertex animation itself is not blurred;
// rain streaks already encode their own exposure).
import type * as THREE from 'three/webgpu';
import { Fn, positionPrevious } from 'three/tsl';

type V3 = THREE.Node<'vec3'>;

/** Use for every `positionNode` computed in the shader (meshes with an identity or rigid transform). */
export function shaderPosition(position: V3): V3 {
  return Fn(() => {
    (positionPrevious as unknown as { assign(value: V3): void }).assign(position);
    return position;
  })() as unknown as V3;
}
