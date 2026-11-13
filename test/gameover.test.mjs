import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchStats } from '../client/js/game/match-stats.js';
import { CinematicCamera } from '../client/js/game/cinematic.js';
import { ProjectileSystem } from '../client/js/game/projectiles.js';
import { loadMapWorld } from '../server/map-world.js';

function seeded(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

test('match stats counters, status and ordering', () => {
  const m = new MatchStats();
  m.register(1, 'A', 'void'); m.register(2, 'B', 'boss');
  m.kill(2); m.kill(2); m.kill(1); m.down(1); m.revive(2); m.kill(99);
  const r = m.rows();
  assert.deepEqual(r.map((x) => x.id), [2, 1]);
  assert.equal(r[0].kills, 2); assert.equal(r[0].revives, 1);
  assert.equal(r[1].downs, 1); assert.equal(r[1].status, 'down');
  m.setStatus(1, 'dead');
  assert.equal(m.rows()[1].status, 'dead');
});

test('bullet hit carries owner', () => {
  const p = new ProjectileSystem();
  p.spawn({ origin: [0, 0, 0], dir: [0, 0, -1], speed: 70, range: 50, owner: 7 });
  const h = p.step(0.2, null, [{ id: 1, x: 0, y: 0, z: -5, r: 1 }]);
  assert.equal(h[0].owner, 7);
});

test('cinematic camera: deterministic, in bounds, never through walls, keeps moving', () => {
  const world = loadMapWorld('night-of-the-living-void');
  const run = () => {
    const c = new CinematicCamera({ bounds: world.bounds, world, rng: seeded(5) });
    const pts = [];
    for (let i = 0; i < 600; i++) pts.push(c.update(1 / 60).position);
    return pts;
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  const bd = world.bounds;
  let dist = 0;
  for (let i = 1; i < a.length; i++) {
    const [x, y, z] = a[i];
    assert.ok(x >= bd.minX && x <= bd.maxX && z >= bd.minZ && z <= bd.maxZ);
    const [px, py, pz] = a[i - 1];
    const d = Math.hypot(x - px, y - py, z - pz);
    dist += d;
    if (d > 1e-6) assert.equal(world.raycast(px, py, pz, (x - px) / d, (y - py) / d, (z - pz) / d, d), null);
  }
  assert.ok(dist > 30, `moved ${dist}`);
});

test('cinematic camera works without a world', () => {
  const c = new CinematicCamera({ bounds: { minX: -10, maxX: 10, minY: 0, maxY: 3, minZ: -10, maxZ: 10 }, rng: seeded(1) });
  for (let i = 0; i < 100; i++) c.update(0.1);
  assert.ok(c.update(0.1).position.every(Number.isFinite));
});
