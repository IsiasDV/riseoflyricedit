// Enemy spawn points (pure; uses a CollisionWorld). Precomputed once per map:
// every floor inside the spawn areas that is flat, has headroom, is clear of
// walls, is not a ledge edge, and is reachable from the player spawn.
const HEADROOM = 2.4;
const WALL_CLEAR = 0.9;
const DIRS8 = [...Array(8)].map((_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);
const DIRS4 = DIRS8.filter((_, i) => i % 2 === 0);

function validFloor(world, x, z, g) {
  if (g.ny < 0.8) return false;
  if (world.raycast(x, g.y + 0.1, z, 0, 1, 0, HEADROOM) !== null) return false;
  for (const [dx, dz] of DIRS8) {
    if (world.raycast(x, g.y + 0.8, z, dx, 0, dz, WALL_CLEAR) !== null) return false;
  }
  for (const [dx, dz] of DIRS4) { // support: no ledge / hole edges
    if (!world.groundAt(x + dx * 0.8, z + dz * 0.8, g.y + 0.5, 1.0)) return false;
  }
  return true;
}

// areas: [{ min: [x,y,z], max: [x,y,z] }]; start: [x,y,z] player spawn for reachability.
export function buildSpawnPoints(world, areas, { start = null, grid = 1 } = {}) {
  const pts = [];
  for (const a of areas) {
    const [x0, y0, z0] = a.min, [x1, y1, z1] = a.max;
    for (let x = x0; x <= x1 + 1e-9; x += grid) {
      for (let z = z0; z <= z1 + 1e-9; z += grid) {
        let from = y1 + 30;
        for (let k = 0; k < 8; k++) {
          const g = world.groundAt(x, z, from, 400);
          if (!g) break;
          from = g.y - 0.3;
          if (g.y < y0 - 1e-6 || g.y > y1 + 1e-6) continue; // outside the box: not a spawn floor
          if (validFloor(world, x, z, g)) pts.push({ x, y: g.y, z });
        }
      }
    }
  }
  if (!start || !pts.length) return pts;

  // Keep only floors connected to the player spawn (steps/jumps up to 1 m).
  const key = (x, z) => `${Math.round(x / grid)},${Math.round(z / grid)}`;
  const cells = new Map();
  pts.forEach((p, i) => { const k = key(p.x, p.z); (cells.get(k) || cells.set(k, []).get(k)).push(i); });
  let seed = 0, best = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - start[0], p.y - start[1], p.z - start[2]);
    if (d < best) { best = d; seed = i; }
  });
  const seen = new Uint8Array(pts.length);
  const stack = [seed];
  seen[seed] = 1;
  while (stack.length) {
    const p = pts[stack.pop()];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of cells.get(key(p.x + dx * grid, p.z + dz * grid)) || []) {
        if (!seen[j] && Math.abs(pts[j].y - p.y) <= 1.0) { seen[j] = 1; stack.push(j); }
      }
    }
  }
  const reach = pts.filter((_, i) => seen[i]);
  return reach.length >= 20 ? reach : pts;
}

// Random spawn at least minDist (horizontal) from every avoid {x,z}; relaxes 6 -> 3 -> 0.
export function pickSpawn(points, rng, avoid = [], minDist = 6) {
  if (!points.length) return null;
  for (const m of [minDist, minDist / 2, 0]) {
    const ok = m > 0 ? points.filter((p) => avoid.every((a) => Math.hypot(p.x - a.x, p.z - a.z) >= m)) : points;
    if (ok.length) return ok[Math.floor(rng() * ok.length)];
  }
  return null;
}
