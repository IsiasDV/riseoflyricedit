import test from 'node:test';
import assert from 'node:assert/strict';
import { findSlapTarget } from '../server/combat.js';
import { WeaponController } from '../client/js/game/weapon-controller.js';
import { PlayerController } from '../client/js/game/player-controller.js';
import { CollisionWorld } from '../client/js/game/collision-world.js';

const cfg = { range: 2.2, arcDeg: 70, maxDy: 1.8 };
const me = { x: 0, y: 0, z: 0, yaw: 0 }; // facing -Z

test('slap target: in front, nearest wins', () => {
  const r = findSlapTarget(me, [{ id: 'a', x: 0, y: 0, z: -2 }, { id: 'b', x: 0, y: 0, z: -1 }], cfg);
  assert.equal(r.target.id, 'b');
  assert.ok(Math.abs(r.dx) < 1e-9 && Math.abs(r.dz + 1) < 1e-9);
});
test('slap target: out of range, behind, other height rejected', () => {
  assert.equal(findSlapTarget(me, [{ id: 'a', x: 0, y: 0, z: -3 }], cfg), null);
  assert.equal(findSlapTarget(me, [{ id: 'a', x: 0, y: 0, z: 1 }], cfg), null);
  assert.equal(findSlapTarget(me, [{ id: 'a', x: 0, y: 3, z: -1 }], cfg), null);
});
test('weapon controller: cooldown and delayed hit', () => {
  const w = new WeaponController(); const m = { cooldown: 0.5, hitDelay: 0.18 };
  assert.equal(w.update(0.016, true, m).started, true);
  assert.equal(w.update(0.016, true, m).started, false);
  let hits = 0; for (let i = 0; i < 20; i++) if (w.update(0.016, false, m).hit) hits++;
  assert.equal(hits, 1);
  for (let i = 0; i < 30; i++) w.update(0.016, false, m);
  assert.equal(w.update(0.016, true, m).started, true);
});

const floor = [-50, 0, -50, -50, 0, 50, 50, 0, -50, 50, 0, -50, -50, 0, 50, 50, 0, 50];
const wallZ = [-20, 0, -6, 20, 0, -6, -20, 5, -6, 20, 0, -6, 20, 5, -6, -20, 5, -6];
const mk = (...p) => { const c = new PlayerController(); c.world = new CollisionWorld(new Float32Array(p.flat())); c.reset({ x: 0, y: 0, z: 0 }); return c; };
const run = (c, s) => { for (let i = 0; i < s * 60; i++) c.update(1 / 60, { yaw: 0 }); };

test('knockback slides a few metres then stops', () => {
  const c = mk(floor); c.applyKnockback(0, -1, 13, 1.5); run(c, 4);
  assert.ok(c.z < -2.5 && c.z > -8, c.z); assert.equal(c.stun, 0);
  assert.ok(Math.hypot(c.vx, c.vz) < 0.5);
});
test('knockback stops at wall; ignored when flying', () => {
  const c = mk(floor, wallZ); c.applyKnockback(0, -1, 25, 1.5); run(c, 4);
  assert.ok(c.z > -6, c.z);
  const f = mk(floor); f.setFlying(true); f.applyKnockback(0, -1, 13); assert.equal(f.vz, 0);
});
