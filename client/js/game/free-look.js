// Camera look control: mouse (pointer lock) and right stick. Movement is handled
// by PlayerController; this only owns yaw/pitch and applies them to the camera.
import { lookScale } from '../state/settings.js';

const MOUSE_SENSITIVITY = 0.0022;   // radians per pixel at scale 1
const STICK_SPEED = 2.8;            // radians per second at full deflection
const MAX_PITCH = Math.PI / 2 - 0.01;

export class FreeLook {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.yaw = 0;
    this.pitch = 0;
  }

  setView(yaw = 0, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
    this._apply();
  }

  // `stick` is the right-stick vector {x,y} (or null); always drains mouse deltas.
  update(enabled, dt = 0, stick = null) {
    const d = this.input.consumeMouseDelta();
    if (!enabled) return;
    const s = MOUSE_SENSITIVITY * lookScale();
    this.yaw -= d.x * s;
    this.pitch -= d.y * s;
    if (stick) {
      const k = STICK_SPEED * lookScale() * dt;
      this.yaw -= stick.x * k;
      this.pitch -= stick.y * k;
    }
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    this._apply();
  }

  _apply() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
