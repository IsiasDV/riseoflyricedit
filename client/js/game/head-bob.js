// Head / weapon bobbing (pure math). update() returns camera offsets for this frame:
//   y: vertical bob (m), x: sideways sway (m, along camera right), roll: radians,
//   vmX / vmY: weapon viewmodel offsets, step: true once per footfall.
const WALK_STRIDE = 1.8;     // strides per second at walking speed (4 m/s)
const BASE_SPEED = 4;
const LAND_DECAY = 9;        // 1/s
const EASE = 10;             // 1/s amplitude easing

export class HeadBob {
  constructor() { this.reset(); }

  reset() {
    this.phase = 0;
    this.amp = 0;
    this.land = 0;
    this._lastHalf = 0;
  }

  // speed: horizontal m/s. landSpeed: downward speed (m/s, >0) on the frame we touch ground, else 0.
  update(dt, { speed = 0, onGround = true, running = false, crouching = false, landSpeed = 0 } = {}) {
    const moving = onGround && speed > 0.3;
    const target = moving ? Math.min(1.6, speed / BASE_SPEED) * (crouching ? 0.45 : 1) : 0;
    this.amp += (target - this.amp) * (1 - Math.exp(-EASE * dt));
    if (moving) this.phase += dt * WALK_STRIDE * Math.PI * 2 * Math.min(1.6, speed / BASE_SPEED) * (crouching ? 0.7 : 1);

    if (landSpeed > 2) this.land = Math.min(0.14, landSpeed * 0.012);
    this.land *= Math.exp(-LAND_DECAY * dt);

    // One footfall per half cycle (each foot).
    const half = Math.floor(this.phase / Math.PI);
    const step = moving && half !== this._lastHalf;
    this._lastHalf = half;

    const s = Math.sin(this.phase);
    const a = this.amp * (running ? 1.25 : 1);
    return {
      y: -Math.abs(s) * 0.045 * a - this.land,
      x: Math.sin(this.phase * 0.5) * 0.03 * a,
      roll: Math.sin(this.phase * 0.5) * 0.004 * a,
      vmX: Math.sin(this.phase * 0.5) * 0.012 * a,
      vmY: -Math.abs(s) * 0.014 * a - this.land * 0.35,
      step
    };
  }
}
