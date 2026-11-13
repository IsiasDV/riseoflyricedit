// Game-over fly-around camera (pure math): glides between random, unobstructed
// waypoints above the map, looking along its heading.
const SPEED = 6;
const lerp = (a, b, t) => a + (b - a) * t;

export class CinematicCamera {
  constructor({ bounds, world = null, rng = Math.random }) {
    this.b = bounds;
    this.world = world;
    this.rng = rng;
    this.t = 0;
    this.pos = this._pick(null);
    this.next = this._pick(this.pos);
    this.dir = [0, 0, -1];
    this.pos = { ...this.pos };
    this.sway = rng() * 6;
  }

  _pick(from) {
    const { minX, maxX, minY, maxY, minZ, maxZ } = this.b;
    const w = this.world;
    for (let i = 0; i < 40; i++) {
      const x = lerp(minX, maxX, 0.1 + this.rng() * 0.8);
      const z = lerp(minZ, maxZ, 0.1 + this.rng() * 0.8);
      let y;
      if (w) {
        const g = w.groundAt(x, z, maxY + 50, 200);
        if (!g) continue;
        y = g.y + 3 + this.rng() * 5;
      } else {
        y = lerp(minY, maxY, 0.5) + 3 + this.rng() * 5;
      }
      if (from && w) {
        const dx = x - from.x, dy = y - from.y, dz = z - from.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 8 || w.raycast(from.x, from.y, from.z, dx / d, dy / d, dz / d, d) !== null) continue;
      }
      return { x, y, z };
    }
    return from ? { ...from } : { x: (minX + maxX) / 2, y: maxY + 5, z: (minZ + maxZ) / 2 };
  }

  // Returns { position: [x,y,z], target: [x,y,z] }.
  update(dt) {
    this.t += dt;
    const p = this.pos, n = this.next;
    const dx = n.x - p.x, dy = n.y - p.y, dz = n.z - p.z;
    const d = Math.hypot(dx, dy, dz);
    const step = SPEED * dt;
    if (d <= step) {
      this.pos = { ...n };
      this.next = this._pick(this.pos);
    } else if (d > 1e-6) {
      p.x += (dx / d) * step; p.y += (dy / d) * step; p.z += (dz / d) * step; // straight, so the checked segment stays clear
      const k = 1 - Math.exp(-3 * dt); // only the look direction is eased
      this.dir = this.dir.map((v, i) => v + ([dx, dy, dz][i] / d - v) * k);
      const l = Math.hypot(...this.dir) || 1;
      this.dir = this.dir.map((v) => v / l);
    }
    const s = Math.sin(this.t * 0.7 + this.sway) * 0.6;
    const q = this.pos;
    return {
      position: [q.x, q.y, q.z],
      target: [q.x + this.dir[0] * 10 + s, q.y + this.dir[1] * 10 - 1.5, q.z + this.dir[2] * 10 + s]
    };
  }
}
