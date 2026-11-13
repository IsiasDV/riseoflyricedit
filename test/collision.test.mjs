import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../client/js/game/collision-world.js';
import { PlayerController } from '../client/js/game/player-controller.js';

const quad = (x0, z0, x1, z1, y) => [x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1];
// vertical wall at z=zw spanning x, y 0..h
const wall = (x0, x1, zw, h) => [x0, 0, zw, x1, 0, zw, x0, h, zw, x1, 0, zw, x1, h, zw, x0, h, zw];
const mk = (...parts) => { const c = new PlayerController(); c.world = new CollisionWorld(new Float32Array(parts.flat())); return c; };
const run = (c, secs, inp = {}) => { for (let i = 0; i < secs * 60; i++) c.update(1 / 60, { yaw: 0, ...inp }); };

test('lands on floor', () => {
  const c = mk(quad(-20, -20, 20, 20, 0)); c.reset({ x: 0, y: 3, z: 0 }); run(c, 2);
  assert.ok(c.onGround); assert.ok(Math.abs(c.y) < 0.02, c.y);
});
test('wall blocks forward movement', () => {
  const c = mk(quad(-20, -20, 20, 20, 0), wall(-20, 20, -5, 4)); c.reset({ x: 0, y: 0, z: 0 });
  run(c, 4, { moveY: 1, runHeld: true });
  assert.ok(c.z > -5 && c.z < -4.6, c.z);
});
test('no tunnelling through thin floor at fall speed', () => {
  const c = mk(quad(-20, -20, 20, 20, 0)); c.reset({ x: 0, y: 200, z: 0 }); run(c, 8);
  assert.ok(c.y > -0.1, c.y);
});
test('climbs 0.3 step, blocked by 0.8 step', () => {
  const step = (h) => [...quad(-20, -20, 20, 20, 0), ...quad(-20, -5, 20, -4.99, 0).slice(0, 0),
    ...quad(-20, -20, 20, -5, h), ...wall(-20, 20, -5, h)];
  const a = mk(step(0.3)); a.reset({ x: 0, y: 0, z: 0 }); run(a, 3, { moveY: 1 });
  assert.ok(a.z < -6 && Math.abs(a.y - 0.3) < 0.05, `${a.z} ${a.y}`);
  const b = mk(step(0.8)); b.reset({ x: 0, y: 0, z: 0 }); run(b, 3, { moveY: 1 });
  assert.ok(b.z > -5, b.z);
});
test('groundAt hit/miss', () => {
  const w = new CollisionWorld(new Float32Array(quad(-5, -5, 5, 5, 2)));
  assert.equal(w.groundAt(0, 0, 10, 20).y, 2);
  assert.equal(w.groundAt(50, 0, 10, 20), null);
});
test('fly ignores collision and follows camera pitch', () => {
  const c = mk(quad(-20, -20, 20, 20, 0), wall(-20, 20, -5, 4)); c.reset({ x: 0, y: 1, z: 0 });
  c.setFlying(true);
  for (let i = 0; i < 180; i++) c.flyUpdate(1 / 60, { yaw: 0, pitch: Math.PI / 4, moveY: 1 });
  assert.ok(c.z < -5 && c.y > 5, `${c.y} ${c.z}`);
});
