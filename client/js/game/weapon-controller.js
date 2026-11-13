// Attack timing for the equipped weapon: cooldown, then a delayed "hit" moment
// inside the swing. Pure logic (no DOM/THREE) so it can be unit-tested.
export class WeaponController {
  constructor() { this.reset(); }

  reset() {
    this.cooldown = 0;   // seconds until another attack may start
    this.hitIn = -1;     // seconds until the pending hit fires (-1 = none)
  }

  // melee: { cooldown, hitDelay }. Returns { started, hit } for this frame.
  update(dt, attackPressed, melee) {
    const out = { started: false, hit: false };
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.hitIn >= 0) {
      this.hitIn -= dt;
      if (this.hitIn < 0) out.hit = true;
    }
    if (attackPressed && this.cooldown <= 0 && melee) {
      this.cooldown = melee.cooldown;
      this.hitIn = melee.hitDelay;
      out.started = true;
    }
    return out;
  }
}
