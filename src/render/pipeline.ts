// Frame pipeline. For now: scene pass, exposure and a display transform. The full post stack (SPEC
// section 7) replaces the output node in step 10.
import * as THREE from 'three/webgpu';
import { agxToneMapping, pass, sRGBTransferOETF, vec4 } from 'three/tsl';
import type { App } from '../app/app';
import type { LookUniforms } from './look';

export class FramePipeline {
  readonly name = 'pipeline';
  private readonly pipeline: THREE.RenderPipeline;

  constructor(app: App, look: LookUniforms) {
    const scenePass = pass(app.scene, app.camera);
    const hdr = scenePass.getTextureNode('output');
    const mapped = agxToneMapping(hdr.rgb, look.u.exposure) as unknown as THREE.Node<'vec3'>;
    this.pipeline = new THREE.RenderPipeline(app.renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = vec4(sRGBTransferOETF(mapped) as THREE.Node<'vec3'>, 1);
    app.renderFrame = () => this.pipeline.render();
  }
}
