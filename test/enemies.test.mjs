import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../client/js/game/collision-world.js';
import { EnemySystem } from '../client/js/game/enemies.js';
import { ENEMY_DEFS } from '../client/js/game/enemy-defs.js';
import { ProjectileSystem } from '../client/js/game/projectiles.js';
import { findSlapEnemies } from '../client/js/game/combat.js';
import { BleedoutState } from '../server/bleedout.js';
import { loadMapWorld } from '../server/map-world.js';

const def = ENEMY_DEFS.beh;
// Wall across z=-10 (x -20..20, y 0..5).
const wallTris = [-20, 0, -10, 20, 0, -10, -20, 5, -10, 20, 0, -10, 20, 5, -10, -20, 5, -10];
const wall = () => new CollisionWorld(new Float32Array(wallTris));
const run = (sys, players, secs, step = 0.05) => {
  const ev = [];
  for (let t = 0; t < secs - 1e-9; t += step) ev.push(...sys.update(step, players));
  return ev;
};

test('enemy tracks visible player, laughs at 3s, dehd after laugh', () => {
  const s = new EnemySystem({ world: null, def });
  s.spawn(0, 0, 0);
  s.update(0.01, []);
  const p = [{ id: 1, x: 0, y: 0, z: 5 }];
  const ev = run(s, p, 2.9);
  assert.equal(ev.length, 0);
  const ev2 = run(s, p, 0.3);
  assert.deepEqual(ev2.map((e) => e.event), ['laugh']);
  assert.equal(ev2[0].targetId, 1);
  assert.equal(run(s, p, 1.6).length, 0);
  const ev3 = run(s, p, 0.5);
  assert.deepEqual(ev3.map((e) => e.event), ['dehd']);
  assert.equal(ev3[0].targetId, 1);
});

test('wall blocks sight: no tracking, no laugh', () => {
  const s = new EnemySystem({ world: wall(), def });
  s.spawn(0, 0, 0);
  const ev = run(s, [{ id: 1, x: 0, y: 0, z: -20 }], 6);
  assert.equal(ev.filter((e) => e.event === 'laugh').length, 0);
  assert.equal(s.list[0].state, 'idle');
});

test('closest visible wins; losing sight resets the timer; downed ignored', () => {
  const s = new EnemySystem({ world: null, def });
  s.spawn(0, 0, 0);
  run(s, [{ id: 1, x: 0, y: 0, z: 10 }, { id: 2, x: 0, y: 0, z: 4 }], 1);
  assert.equal(s.list[0].targetId, 2);
  run(s, [{ id: 2, x: 0, y: 0, z: 4, down: true }, { id: 1, x: 0, y: 0, z: 10 }], 0.1);
  assert.equal(s.list[0].targetId, 1);
  assert.ok(s.list[0].trackT < 0.2);
  run(s, [], 0.1);
  assert.equal(s.list[0].trackT, 0);
});

test('enemy faces the player', () => {
  const s = new EnemySystem({ world: null, def });
  s.spawn(0, 0, 0);
  run(s, [{ id: 1, x: 5, y: 0, z: 0 }], 1);
  assert.ok(Math.abs(s.list[0].yaw - Math.atan2(-5, 0)) < 0.05);
});

test('kill cancels the sequence and removes the enemy after dieMs', () => {
  const s = new EnemySystem({ world: null, def });
  const id = s.spawn(0, 0, 0);
  const p = [{ id: 1, x: 0, y: 0, z: 5 }];
  run(s, p, 3.2);
  assert.ok(s.kill(id));
  assert.equal(s.kill(id), false);
  const ev = run(s, p, 5);
  assert.deepEqual(ev.map((e) => e.event), ['die']);
  assert.equal(s.count, 0);
  assert.equal(s.targets().length, 0);
});

test('bullet hits enemy sphere before a farther wall, wall before a farther enemy', () => {
  const s = new EnemySystem({ world: null, def });
  s.spawn(0, 0, -5);
  const pr = new ProjectileSystem();
  pr.spawn({ origin: [0, 1.1, 0], dir: [0, 0, -1], speed: 70, range: 150 });
  const h = pr.step(0.2, wall(), s.targets());
  assert.equal(h[0].kind, 'enemy');
  assert.equal(h[0].id, 1);
  const s2 = new EnemySystem({ world: null, def });
  s2.spawn(0, 0, -15);
  pr.spawn({ origin: [0, 1.1, 0], dir: [0, 0, -1], speed: 70, range: 150 });
  const h2 = pr.step(0.3, wall(), s2.targets());
  assert.equal(h2[0].kind, 'world');
});

test('findSlapEnemies range and arc', () => {
  const t = [{ id: 1, x: 0, y: 1.1, z: -2.5, r: 1 }, { id: 2, x: 0, y: 1.1, z: 6, r: 1 }, { id: 3, x: 3, y: 1.1, z: 0, r: 1 }];
  const hit = findSlapEnemies({ x: 0, y: 0, z: 0, yaw: 0 }, t, { range: 2.2, arcDeg: 70 });
  assert.deepEqual(hit.map((h) => h.id), [1]);
});

test('bleedout: expires after 30s; revive needs 5s continuous in range', () => {
  const b = new BleedoutState();
  b.down(1, 0);
  assert.ok(b.isDown(1));
  assert.deepEqual(b.expired(29999), []);
  assert.deepEqual(b.expired(30000), [1]);
  b.down(1, 0);
  let done = false;
  for (let t = 0; t <= 5000 && !done; t += 100) done = b.revive(2, 1, t, true);
  assert.ok(done);
  assert.equal(b.isDown(1), false);
  b.down(1, 0);
  for (let t = 0; t < 3000; t += 100) b.revive(2, 1, t, true);
  assert.equal(b.revive(2, 1, 4000, true), false); // gap resets
  assert.equal(b.revive(2, 1, 8900, true), false);
  assert.equal(b.revive(2, 1, 9000, false), false); // out of range resets
  assert.equal(b.revive(1, 1, 9000, true), false);
});

test('server loads the map collision from the GLB', () => {
  const w = loadMapWorld('night-of-the-living-void');
  assert.ok(w, 'world loaded');
  assert.ok(w.triCount > 100);
  const g = w.groundAt(0, 0, 3, 10);
  assert.ok(g && Math.abs(g.y) < 1.5, `ground near 0, got ${g && g.y}`);
});
