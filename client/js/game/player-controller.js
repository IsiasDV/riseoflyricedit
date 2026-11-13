// First-person locomotion: walk / run / crouch / jump on a flat ground plane.
// Pure math (no Three.js, no DOM) so it can be unit-tested under Node.
export const MOVE = {
  WALK: 4.0,
  RUN: 7.0,
  CROUCH: 2.0,
  GROUND_ACCEL: 12,   // 1/s, how fast velocity eases to target on the ground
  AIR_ACCEL: 3,
  GRAVITY: 22,
  JUMP_VELOCITY: 7.5,
  EYE_STAND: 1.7,
  EYE_CROUCH: 1.1,
  EYE_DOWN: 0.55,
  EYE_LERP: 12,
  MAX_DT: 0.05,
  TERMINAL: 40,
  RADIUS: 0.35,
  STEP_HEIGHT: 0.4,
  OFFS_STAND: [0.35, 0.9, 1.45],
  OFFS_CROUCH: [0.35, 0.85],
  KNOCK_FRICTION: 3,      // 1/s horizontal decay while sliding on the ground
  KNOCK_AIR_FRICTION: 0.8,
  KNOCK_STUN: 1.2,        // max seconds of reduced control
  KNOCK_END_SPEED: 2.5,
  FLY: 12,
  FLY_FAST: 30
};

export class PlayerController {
  constructor(groundY = 0) {
    this.groundY = groundY;
    this.world = null;     // optional CollisionWorld; null = flat groundY
    this.flying = false;
    this.reset({ x: 0, y: groundY, z: 0 });
  }

  reset({ x, y, z }) {
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.onGround = true;
    this.flying = false;
    this.down = false;       // bleeding out: no movement/jumping, low eye
    this.stun = 0;
    this.crouching = false;
    this.runLatched = false;   // controller L3 toggle
    this.running = false;
    this.eye = MOVE.EYE_STAND;
  }

  // input: { moveX, moveY (-1..1, +Y = forward), yaw, jumpHeld, crouchPressed,
  //          runHeld, runTogglePressed }
  update(dt, input) {
    dt = Math.min(dt, MOVE.MAX_DT);
    if (this.down) {
      input = { ...input, moveX: 0, moveY: 0, jumpHeld: false, crouchPressed: false, runTogglePressed: false, runHeld: false };
      this.crouching = true;
      this.runLatched = false;
    }

    if (input.crouchPressed) {
      this.crouching = !this.crouching;
      if (this.crouching) this.runLatched = false; // cannot run while crouched
    }
    if (input.runTogglePressed && !this.crouching) this.runLatched = !this.runLatched;

    // Desired movement in world space (forward = -Z at yaw 0).
    let mx = input.moveX || 0;
    let my = input.moveY || 0;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
    const wishX = mx * cos - my * sin;
    const wishZ = -mx * sin - my * cos;

    const moving = Math.hypot(mx, my) > 0;
    if (!moving) this.runLatched = false;
    this.running = !this.crouching && moving && (input.runHeld || this.runLatched);

    const speed = (this.crouching ? MOVE.CROUCH : this.running ? MOVE.RUN : MOVE.WALK) * (input.speedMult || 1);
    const accel = this.onGround ? MOVE.GROUND_ACCEL : MOVE.AIR_ACCEL;
    if (this.stun > 0) {
      // Knocked back: slide with friction, only slight steering.
      this.stun -= dt;
      const fr = Math.exp(-(this.onGround ? MOVE.KNOCK_FRICTION : MOVE.KNOCK_AIR_FRICTION) * dt);
      this.vx = this.vx * fr + wishX * speed * dt * 2;
      this.vz = this.vz * fr + wishZ * speed * dt * 2;
      if (Math.hypot(this.vx, this.vz) < MOVE.KNOCK_END_SPEED) this.stun = 0;
    } else {
      const k = 1 - Math.exp(-accel * dt);
      this.vx += (wishX * speed - this.vx) * k;
      this.vz += (wishZ * speed - this.vz) * k;
    }

    if (input.jumpHeld && this.onGround) {
      this.vy = MOVE.JUMP_VELOCITY;
      this.onGround = false;
    }

    this.vy = Math.max(this.vy - MOVE.GRAVITY * dt, -MOVE.TERMINAL);
    if (this.world) {
      this._moveWorld(dt);
    } else {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.y += this.vy * dt;
      if (this.y <= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.onGround = true;
      }
    }

    this._eyeStep(dt);
  }

  _eyeStep(dt) {
    const targetEye = this.down ? MOVE.EYE_DOWN : this.crouching ? MOVE.EYE_CROUCH : MOVE.EYE_STAND;
    this.eye += (targetEye - this.eye) * (1 - Math.exp(-MOVE.EYE_LERP * dt));
  }

  // Collide-and-slide against the world in small sub-steps (no tunnelling).
  _moveWorld(dt) {
    const offs = this.crouching ? MOVE.OFFS_CROUCH : MOVE.OFFS_STAND;
    const r = MOVE.RADIUS;
    const speed = Math.hypot(this.vx, this.vy, this.vz);
    const steps = Math.min(24, Math.max(1, Math.ceil((speed * dt) / 0.15)));
    const h = dt / steps;
    const wasGrounded = this.onGround;
    let grounded = false;
    for (let i = 0; i < steps; i++) {
      // Horizontal move (with step-up).
      const sx = this.x, sy = this.y, sz = this.z;
      const ovx = this.vx, ovz = this.vz;
      this.x += this.vx * h; this.z += this.vz * h;
      const hr = this.world.pushOut(this, this, offs, r);
      if (hr.ground) grounded = true;
      if (hr.wall && (wasGrounded || grounded) && Math.hypot(ovx, ovz) > 0.1) {
        const blocked = Math.hypot(this.x - sx, this.z - sz);
        const bx = this.x, by = this.y, bz = this.z, bvx = ovx, bvy = this.vy, bvz = ovz;
        this.x = sx; this.y = sy + MOVE.STEP_HEIGHT; this.z = sz;
        this.x += bvx * h; this.z += bvz * h;
        const tmp = { vx: bvx, vy: 0, vz: bvz };
        this.world.pushOut(this, tmp, offs, r);
        const progress = Math.hypot(this.x - sx, this.z - sz);
        if (progress > blocked + 0.01) {
          // Stay raised; gravity settles us onto the step once we clear its edge.
          this.vx = tmp.vx; this.vz = tmp.vz; this.vy = Math.min(bvy, 0);
          grounded = true;
        } else {
          this.x = bx; this.y = by; this.z = bz;
        }
      }
      // Vertical move.
      this.y += this.vy * h;
      const vr = this.world.pushOut(this, this, offs, r);
      if (vr.ground) grounded = true;
    }
    // Stick to ground when walking down slopes.
    if (!grounded && wasGrounded && this.vy <= 0) {
      const g = this.world.groundAt(this.x, this.z, this.y + 0.05, 0.4);
      if (g && g.ny >= 0.6) { this.y = g.y; this.vy = 0; grounded = true; }
    }
    this.onGround = grounded;
  }

  // Noclip flight along the camera direction. Called instead of update() while flying.
  flyUpdate(dt, input) {
    dt = Math.min(dt, MOVE.MAX_DT);
    const yaw = input.yaw, pitch = input.pitch || 0;
    const cp = Math.cos(pitch);
    const fx = -Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = -Math.cos(yaw) * cp;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = input.moveX || 0, my = input.moveY || 0;
    const up = (input.jumpHeld ? 1 : 0) - (input.crouchHeld ? 1 : 0);
    const speed = input.runHeld ? MOVE.FLY_FAST : MOVE.FLY;
    const k = 1 - Math.exp(-MOVE.GROUND_ACCEL * dt);
    this.vx += ((fx * my + rx * mx) * speed - this.vx) * k;
    this.vy += ((fy * my + up) * speed - this.vy) * k;
    this.vz += ((fz * my + rz * mx) * speed - this.vz) * k;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.onGround = false;
    this._eyeStep(dt);
  }

  // Slap impact: slide along (dirX, dirZ) with a small hop. Ignored while flying.
  applyKnockback(dirX, dirZ, speed, hop = 0) {
    if (this.flying) return;
    const l = Math.hypot(dirX, dirZ) || 1;
    this.vx = (dirX / l) * speed;
    this.vz = (dirZ / l) * speed;
    this.vy = hop;
    this.onGround = false;
    this.stun = MOVE.KNOCK_STUN;
  }

  setFlying(on) {
    this.flying = on;
    this.vx = this.vy = this.vz = 0;
  }
}
