// Walkable-surface path finding on a CollisionWorld (pure; no THREE, no DOM).
// A* over a lazily-expanded 0.75 m grid: nodes are (ix, iz, floor level), edges need ground within step
// reach, a walkable slope, headroom, and no wall along the segment (probed at knee and waist height,
// centre line and +/- body radius). Used by the chasing Meh enemy.
export const NAV = {
  CELL: 0.75,
  STEP_UP: 1.0,      // highest step between neighbouring cells (the walker hops up anything over 0.45 m)
  DROP: 1.2,         // longest drop
  HEADROOM: 1.7,
  RADIUS: 0.35,
  MAX_EXPAND: 3500,
  WALKABLE_NY: 0.7
};

const HW = 1.3; // weighted A*: much faster on big maps, paths stay near-optimal
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const nodeKey = (x, y, z) => `${Math.round(x / NAV.CELL)},${Math.round(z / NAV.CELL)},${Math.round(y * 2)}`;

// True when the straight segment a->b can be walked: no wall in the way and a continuous floor underneath.
export function segmentClear(world, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  const ux = dx / len, uz = dz / len;
  const px = -uz * NAV.RADIUS, pz = ux * NAV.RADIUS; // sideways offset
  for (const h of [0.45, 1.1]) {
    for (const s of [0, 1, -1]) {
      const oy = Math.max(ay, by) + h; // probe above the higher of the two floors (a ledge face isn't a wall)
      if (world.raycast(ax + px * s, oy, az + pz * s, ux, 0, uz, len) !== null) return false;
    }
  }
  let y = ay;
  const n = Math.ceil(len / NAV.CELL);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const g = world.groundAt(ax + dx * t, az + dz * t, y + NAV.STEP_UP, NAV.STEP_UP + NAV.DROP);
    if (!g || g.ny < NAV.WALKABLE_NY) return false;
    y = g.y;
  }
  return true;
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// from / to: {x,y,z} feet positions. blocked: optional Set of nodeKey strings to avoid.
// Returns { points: [{x,y,z}...], partial } (the last point is `to` unless partial), or null if even the
// start is unusable. A partial path leads to the explored node closest to the target.
export function findPath(world, from, to, { blocked = null, maxExpand = NAV.MAX_EXPAND } = {}) {
  const C = NAV.CELL;
  const start = { x: Math.round(from.x / C) * C, z: Math.round(from.z / C) * C, y: from.y, g: 0, f: 0, parent: null };
  start.x = from.x; start.z = from.z; // the real start keeps its exact position
  const h = (x, z) => Math.hypot(to.x - x, to.z - z);
  start.f = HW * h(start.x, start.z);
  const open = new Heap();
  const best = new Map(); // key -> node with the lowest g
  open.push(start);
  best.set(nodeKey(start.x, start.y, start.z), start);
  let closest = start, closestH = start.f, expanded = 0, goal = null;
  const closed = new Set();

  while (open.size && expanded < maxExpand) {
    const cur = open.pop();
    const ck = nodeKey(cur.x, cur.y, cur.z);
    if (closed.has(ck)) continue;
    closed.add(ck);
    expanded++;
    const ch = h(cur.x, cur.z);
    if (ch < closestH) { closestH = ch; closest = cur; }
    if (ch <= C * 1.1 && Math.abs(to.y - cur.y) < 2.2) { goal = cur; break; }

    for (const [dx, dz] of DIRS) {
      const nx = Math.round(cur.x / C) * C + dx * C, nz = Math.round(cur.z / C) * C + dz * C;
      const g = world.groundAt(nx, nz, cur.y + NAV.STEP_UP, NAV.STEP_UP + NAV.DROP);
      if (!g || g.ny < NAV.WALKABLE_NY) continue;
      const k = nodeKey(nx, g.y, nz);
      if (closed.has(k) || (blocked && blocked.has(k))) continue;
      if (world.raycast(nx, g.y + 0.1, nz, 0, 1, 0, NAV.HEADROOM) !== null) continue;
      if (!segmentClear(world, cur.x, cur.y, cur.z, nx, g.y, nz)) continue;
      const cost = cur.g + Math.hypot(dx * C, dz * C) + Math.abs(g.y - cur.y) * 0.5;
      const old = best.get(k);
      if (old && old.g <= cost) continue;
      const node = { x: nx, y: g.y, z: nz, g: cost, f: cost + HW * h(nx, nz), parent: cur };
      best.set(k, node);
      open.push(node);
    }
  }

  const end = goal ?? closest;
  const chain = [];
  for (let n = end; n; n = n.parent) chain.push({ x: n.x, y: n.y, z: n.z });
  chain.reverse();
  if (goal) chain.push({ x: to.x, y: to.y, z: to.z });
  return { points: smooth(world, chain), partial: !goal };
}

// String pulling: drop waypoints that can be skipped with a clear straight walk.
function smooth(world, pts) {
  if (pts.length <= 2) return pts.slice(1);
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !segmentClear(world, pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}
