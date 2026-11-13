// Bullet simulation (pure math): straight-line flight, stops on world/enemy hit or at range.

// Distance along the unit ray (o,d) to a sphere within maxDist, or null.
function raySphere(ox, oy, oz, dx, dy, dz, s, maxDist) {
  const mx = s.x - ox, my = s.y - oy, mz = s.z - oz;
  const r2 = s.r * s.r;
  const m2 = mx * mx + my * my + mz * mz;
  if (m2 <= r2) return 0;
  const t = mx * dx + my * dy + mz * dz;
  const d2 = m2 - t * t;
  if (d2 > r2) return null;
  const hit = t - Math.sqrt(r2 - d2);
  return hit >= 0 && hit <= maxDist ? hit : null;
}

export class ProjectileSystem {
  constructor() { this.list = []; }

  // dir must be unit length.
  spawn({ origin, dir, speed, range, owner = null, color = null }) {
    const b = { x: origin[0], y: origin[1], z: origin[2], dx: dir[0], dy: dir[1], dz: dir[2], speed, left: range, owner, color };
    this.list.push(b);
    return b;
  }

  // Returns [{ kind: 'world'|'enemy', id?, x, y, z }] for bullets that struck something this step.
  // targets (optional): [{ id, x, y, z, r }] enemy hit spheres.
  step(dt, world, targets = null) {
    const hits = [];
    this.list = this.list.filter((b) => {
      const dist = Math.min(b.speed * dt, b.left);
      let d = world ? world.raycast(b.x, b.y, b.z, b.dx, b.dy, b.dz, dist) : null;
      let kind = 'world', id;
      for (const t of targets || []) {
        const td = raySphere(b.x, b.y, b.z, b.dx, b.dy, b.dz, t, d ?? dist);
        if (td !== null && (d === null || td < d)) { d = td; kind = 'enemy'; id = t.id; }
      }
      if (d !== null) { hits.push({ kind, id, owner: b.owner, x: b.x + b.dx * d, y: b.y + b.dy * d, z: b.z + b.dz * d }); return false; }
      b.x += b.dx * dist; b.y += b.dy * dist; b.z += b.dz * dist;
      b.left -= dist;
      return b.left > 1e-6;
    });
    return hits;
  }

  clear() { this.list = []; }
}
