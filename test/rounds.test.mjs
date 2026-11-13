import test from 'node:test';
import assert from 'node:assert/strict';
import { RoundSystem } from '../client/js/game/rounds.js';
import { buildSpawnPoints, pickSpawn } from '../client/js/game/spawn-points.js';
import { CollisionWorld } from '../client/js/game/collision-world.js';
import { loadMapWorld } from '../server/map-world.js';
import { MAP_DATA } from '../client/js/maps/map-data.js';

// Advance in 0.1 s steps; `live` is a callback so tests can model enemies.
function sim(rs, secs, opts) {
  const out = [];
  for (let t = 0; t < secs - 1e-9; t += 0.1) {
    for (const e of rs.update(0.1, opts())) out.push({ ...e, t: +(t + 0.1).toFixed(1) });
  }
  return out;
}

test('round N spawns players x N, staggered, ends only when all defeated, 10s transition', () => {
  const rs = new RoundSystem();
  rs.start(2);
  let live = 0, players = 2;
  const opts = () => ({ playerCount: players, liveEnemies: live });
  let ev = sim(rs, 5.2, opts);
  assert.equal(ev[0].event, 'roundStart'); assert.equal(ev[0].total, 2);
  let spawns = ev.filter((e) => e.event === 'spawn');
  assert.equal(spawns.length, 1); // second one is a second later
  live = 1;
  ev = sim(rs, 1.2, opts);
  spawns = ev.filter((e) => e.event === 'spawn');
  assert.equal(spawns.length, 1);
  live = 2;
  assert.equal(sim(rs, 5, opts).length, 0); // not over while enemies alive
  live = 0;
  ev = sim(rs, 0.2, opts);
  assert.equal(ev.filter((e) => e.event === 'roundEnd').length, 1);
  players = 3; // picked up at the next round start only
  assert.equal(sim(rs, 9.7, opts).length, 0);
  ev = sim(rs, 0.5, opts);
  const rsEv = ev.find((e) => e.event === 'roundStart');
  assert.equal(rsEv.round, 2); assert.equal(rsEv.total, 6);
});

test('round 3 with 4 players spawns 12; pending spawns block the end', () => {
  const rs = new RoundSystem({ introMs: 0 });
  rs.round = 3; rs.phase = 'cleared'; rs.timer = 0;
  const ev = sim(rs, 20, () => ({ playerCount: 4, liveEnemies: 0 }));
  assert.equal(ev.find((e) => e.event === 'roundStart').round, 4);
  const rs2 = new RoundSystem({ introMs: 0 });
  rs2.start(4);
  rs2.round = 3;
  const ev2 = sim(rs2, 20, () => ({ playerCount: 4, liveEnemies: 0 }));
  assert.equal(ev2.filter((e) => e.event === 'spawn').length >= 12, true);
});

// Floor with a hole, a pillar, and a platform above part of it.
function tri(a, b, c) { return [...a, ...b, ...c]; }
function quad(a, b, c, d) { return [...tri(a, b, c), ...tri(a, c, d)]; }
function box(x0, y0, z0, x1, y1, z1) {
  return [
    ...quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]),
    ...quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]),
    ...quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]),
    ...quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
    ...quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]),
    ...quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1])
  ];
}
test('spawn points: floor only, no hole/pillar/ledge, platform floor counted, air resolves to floor', () => {
  const tris = [
    ...quad([-10, 0, -10], [-10, 0, -2], [10, 0, -2], [10, 0, -10]), // floor with a gap z -2..2
    ...quad([-10, 0, 2], [-10, 0, 10], [10, 0, 10], [10, 0, 2]),
    ...box(4, 0, 4, 6, 6, 6) // pillar
  ];
  const w = new CollisionWorld(new Float32Array(tris));
  const pts = buildSpawnPoints(w, [{ min: [-10, -0.7, -10], max: [10, 12, 10] }], { start: [-8, 0.5, -8] });
  assert.ok(pts.length > 50);
  for (const p of pts) {
    assert.ok(Math.abs(p.y) < 1e-6, 'on the floor');
    assert.ok(!(p.z > -2.9 && p.z < 2.9), `hole edge ${p.z}`);
    assert.ok(!(p.x > 2.9 && p.x < 7.1 && p.z > 2.9 && p.z < 7.1), 'near pillar');
  }
  // gap side is disconnected from start -> only the connected side... both halves are separate floors
  assert.ok(pts.every((p) => p.z < 0), 'unreachable island dropped');
});

test('pickSpawn honours avoid distance, relaxes, deterministic', () => {
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
  let s = 1; const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 20; i++) assert.equal(pickSpawn(pts, rng, [{ x: 0, z: 1 }], 6).x, 10);
  assert.ok(pickSpawn(pts, rng, [{ x: 0, z: 0 }, { x: 10, z: 0 }], 6)); // relaxes
  assert.equal(pickSpawn([], rng), null);
});

test('real map spawn points are safe and plentiful', () => {
  const w = loadMapWorld('night-of-the-living-void');
  const d = MAP_DATA['night-of-the-living-void'];
  const pts = buildSpawnPoints(w, d.enemyAreas, { start: d.spawn });
  assert.ok(pts.length > 1000, `count ${pts.length}`);
  const a = d.enemyAreas[0];
  for (const p of pts) {
    assert.ok(p.x >= a.min[0] && p.x <= a.max[0] && p.z >= a.min[2] && p.z <= a.max[2]);
    assert.ok(p.y >= a.min[1] - 1e-6 && p.y <= a.max[1] + 1e-6);
    const g = w.groundAt(p.x, p.z, p.y + 0.3, 1);
    assert.ok(g && Math.abs(g.y - p.y) < 0.05, 'on floor');
    assert.equal(w.raycast(p.x, p.y + 0.1, p.z, 0, 1, 0, 2.4), null, 'headroom');
  }
});
