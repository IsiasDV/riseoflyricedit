import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../client/js/game/collision-world.js';
import { ProjectileSystem } from '../client/js/game/projectiles.js';
import { PlayerState } from '../client/js/game/player-state.js';
import { PickupState } from '../client/js/game/pickups.js';
import { GunSpawnState } from '../server/pickups.js';
import { EventBus } from '../client/js/core/events.js';

const wall = [-20, 0, -10, 20, 0, -10, -20, 5, -10, 20, 0, -10, 20, 5, -10, -20, 5, -10];
const world = () => new CollisionWorld(new Float32Array(wall));

test('raycast hit, miss, range, double-sided', () => {
  const w = world();
  assert.ok(Math.abs(w.raycast(0, 1, 0, 0, 0, -1, 50) - 10) < 1e-6);
  assert.equal(w.raycast(0, 1, 0, 0, 0, -1, 5), null);
  assert.equal(w.raycast(0, 1, 0, 0, 0, 1, 50), null);
  assert.ok(Math.abs(w.raycast(0, 1, -20, 0, 0, 1, 50) - 10) < 1e-6);
  assert.equal(w.raycast(0, 9, 0, 0, 0, -1, 50), null);
});
test('bullet flies, stops at wall, expires at range', () => {
  const p = new ProjectileSystem();
  p.spawn({ origin: [0, 1, 0], dir: [0, 0, -1], speed: 70, range: 150 });
  p.step(0.1, world()); assert.ok(Math.abs(p.list[0].z + 7) < 1e-6);
  const hits = p.step(0.1, world()); assert.equal(p.list.length, 0); assert.ok(Math.abs(hits[0].z + 10) < 1e-6);
  p.spawn({ origin: [0, 1, 0], dir: [0, 0, 1], speed: 70, range: 100 });
  for (let i = 0; i < 20; i++) p.step(0.1, null);
  assert.equal(p.list.length, 0);
});
test('gun ammo: 8, decrements, stops at 0', () => {
  const s = new PlayerState(new EventBus()); s.reset('void');
  s.giveWeapon('gun'); assert.equal(s.snapshot().ammo, 8); assert.equal(s.hasGun, true);
  for (let i = 0; i < 8; i++) assert.equal(s.useAmmo(), true);
  assert.equal(s.useAmmo(), false); assert.equal(s.snapshot().ammo, 0);
});
test('singleplayer pickup respawns after 30s', () => {
  let t = 0; const p = new PickupState(2, 30000, () => t);
  assert.equal(p.take(0), true); assert.equal(p.take(0), false);
  t = 29999; assert.equal(p.isAvailable(0), false);
  t = 30000; assert.equal(p.isAvailable(0), true); assert.equal(p.isAvailable(1), true);
});
test('server gun spawns: range, holder, one winner', () => {
  let t = 0; const g = new GunSpawnState([{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }], { radius: 2.5, respawnMs: 30000 }, () => t);
  assert.equal(g.tryTake('a', 0, { x: 10, y: 0, z: 0 }), false);
  assert.equal(g.tryTake('a', 0, { x: 1, y: 0, z: 0 }), true);
  assert.equal(g.tryTake('b', 0, { x: 1, y: 0, z: 0 }), false);   // taken
  assert.equal(g.tryTake('a', 1, { x: 50, y: 0, z: 0 }), false);  // already holds the gun
  assert.equal(g.tryTake('b', 1, { x: 50, y: 0, z: 0 }), true);
  t = 30000; g.release('a');
  assert.equal(g.tryTake('a', 0, { x: 0, y: 0, z: 0 }), true);
});

import { SpawnPoints } from '../server/pickups.js';
test('ammo spawn points: range, taken, respawn after 20s', () => {
  let t = 0; const a = new SpawnPoints([{ x: 0, y: 0, z: 0 }], { radius: 2.5, respawnMs: 20000 }, () => t);
  assert.equal(a.tryTake(0, { x: 9, y: 0, z: 0 }), false);
  assert.equal(a.tryTake(0, { x: 1, y: 0, z: 0 }), true);
  assert.equal(a.tryTake(0, { x: 1, y: 0, z: 0 }), false);
  t = 20000; assert.equal(a.tryTake(0, { x: 1, y: 0, z: 0 }), true);
});
test('addAmmo adds to gun, no-op for hand', () => {
  const s = new PlayerState(new EventBus()); s.reset('void');
  s.addAmmo(10); assert.equal(s.snapshot().ammo, Infinity);
  s.giveWeapon('gun'); s.addAmmo(10); assert.equal(s.snapshot().ammo, 18);
});
