// Pure combat helpers (no I/O) shared by client and server.

// attacker: { x, y, z, yaw }; others: [{ id, x, y, z }].
// Returns { target, dx, dz } (dx/dz = attacker facing unit vector) for the nearest
// player within `range` (horizontal), inside the forward arc, and within `maxDy`.
export function findSlapTarget(attacker, others, { range, arcDeg, maxDy }) {
  const fx = -Math.sin(attacker.yaw), fz = -Math.cos(attacker.yaw);
  const minDot = Math.cos((arcDeg * Math.PI) / 180);
  let best = null, bestD = Infinity;
  for (const o of others) {
    const ox = o.x - attacker.x, oz = o.z - attacker.z;
    const d = Math.hypot(ox, oz);
    if (d > range || Math.abs(o.y - attacker.y) > maxDy) continue;
    if (d > 1e-6 && (ox * fx + oz * fz) / d < minDot) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best ? { target: best, dx: fx, dz: fz } : null;
}

// All enemy hit spheres ({id,x,y,z,r}) the slap reaches (range counts from the sphere edge).
export function findSlapEnemies(attacker, targets, { range, arcDeg }) {
  const fx = -Math.sin(attacker.yaw), fz = -Math.cos(attacker.yaw);
  const minDot = Math.cos((arcDeg * Math.PI) / 180);
  return targets.filter((t) => {
    const ox = t.x - attacker.x, oz = t.z - attacker.z;
    const d = Math.hypot(ox, oz);
    if (d - t.r > range) return false;
    if (Math.abs(t.y - (attacker.y + 1)) > t.r + 1.5) return false;
    return d <= t.r || (ox * fx + oz * fz) / d >= minDot;
  });
}

// Insta-Beh: ids of enemy hit spheres ({id,x,y,z,r}) the player (feet pos) is touching.
export const INSTA_PAD = 1.1; // horizontal reach beyond the sphere edge (must exceed any chaser's touchRadius)
export function instaTouches(p, targets) {
  return targets.filter((t) => Math.hypot(t.x - p.x, t.z - p.z) - t.r <= INSTA_PAD && Math.abs(t.y - (p.y + 1)) <= t.r + 1.5).map((t) => t.id);
}
