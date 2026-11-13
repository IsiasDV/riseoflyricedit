// Dynamic motion blur: the world is rendered to a target, then a fullscreen pass blurs it along the
// camera's screen-space turn (dx, dy as fractions of the screen) plus a radial zoom blur for forward
// speed. When the strength is ~0 the world is rendered straight to the screen (no extra cost).
import * as THREE from '../../vendor/three.module.min.js';

const TAPS = 10;
const MAX_SHIFT = 0.05;
const MAX_ZOOM = 0.06;

export class MotionBlur {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = null;
    this.dx = 0; this.dy = 0; this.zoom = 0;
    this.enabled = true;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, uShift: { value: new THREE.Vector2() }, uZoom: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tScene; uniform vec2 uShift; uniform float uZoom; varying vec2 vUv;
        void main() {
          vec4 sum = vec4(0.0);
          for (int i = 0; i < ${TAPS}; i++) {
            float t = float(i) / float(${TAPS - 1}) - 0.5;
            vec2 uv = vUv + uShift * t + (vUv - 0.5) * uZoom * t;
            sum += texture2D(tScene, clamp(uv, 0.001, 0.999));
          }
          gl_FragColor = linearToOutputTexel(sum / float(${TAPS})); // target holds linear colour
        }`,
      depthTest: false, depthWrite: false
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _ensureTarget() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.target && this.target.width === size.x && this.target.height === size.y) return;
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType, stencilBuffer: true });
  }

  // params: { dx, dy, zoom } raw per-frame strengths (0 when not in gameplay).
  render(scene, camera, params = null, dt = 1 / 60) {
    const p = this.enabled && params ? params : { dx: 0, dy: 0, zoom: 0 };
    const k = 1 - Math.exp(-18 * dt);
    this.dx += (p.dx - this.dx) * k;
    this.dy += (p.dy - this.dy) * k;
    this.zoom += (p.zoom - this.zoom) * k;
    const dx = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, this.dx));
    const dy = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, this.dy));
    const zoom = Math.min(MAX_ZOOM, this.zoom);
    if (Math.abs(dx) + Math.abs(dy) + zoom < 0.0015) {
      this.renderer.render(scene, camera);
      return;
    }
    this._ensureTarget();
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.mat.uniforms.tScene.value = this.target.texture;
    this.mat.uniforms.uShift.value.set(dx, dy);
    this.mat.uniforms.uZoom.value = zoom;
    r.render(this.scene, this.cam);
  }
}
