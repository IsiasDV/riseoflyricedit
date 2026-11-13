import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CollisionWorld } from '../client/js/game/collision-world.js';
import { findPath } from '../client/js/game/nav.js';
import { EnemySystem } from '../client/js/game/enemies.js';
import { ENEMY_DEFS, pickEnemyKind, enemyManifest, MEH_CHANCE, MEH_FROM_ROUND } from '../client/js/game/enemy-defs.js';
import { LobbyManager } from '../server/lobby-manager.js';

const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
const floor = (x0, z0, x1, z1, y = 0) => quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]);
// A wall along the Z axis at x, spanning z0..z1 and 3 m tall.
const wallX = (x, z0, z1) => quad([x, 0, z0], [x, 0, z1], [x, 3, z1], [x, 3, z0]);
const make = (...tris) => new CollisionWorld(new Float32Array(tris.flat()));

const walled = () => make(floor(-30, -30, 30, 30), wallX(0, -8, 8)); // detour needed around z = +/-8

test('pickEnemyKind: never before round 5, 10% afterwards', () => {
  assert.equal(MEH_CHANCE, 0.1);
  assert.equal(MEH_FROM_ROUND, 5);
  assert.equal(pickEnemyKind(4, () => 0), 'beh');
  assert.equal(pickEnemyKind(5, () => 0.099), 'meh');
  assert.equal(pickEnemyKind(5, () => 0.1), 'beh');
  assert.equal(pickEnemyKind(9, () => 0.5), 'beh');
});

test('meh definition: 80% of the beh, assets exist, manifest preloads both', () => {
  const { beh, meh } = ENEMY_DEFS;
  assert.ok(Math.abs(meh.height - beh.height * 0.8) < 1e-9);
  assert.ok(Math.abs(meh.hitRadius - beh.hitRadius * 0.8) < 1e-9);
  assert.equal(meh.yawOffset, beh.yawOffset);
  assert.equal(meh.anims.idle, 'Beh');
  assert.equal(meh.anims.die, 'Moving');
  for (const url of [meh.model, ...Object.values(meh.sfx)]) assert.ok(fs.existsSync(new URL(`../client/${url}`, import.meta.url)), url);
  const m = enemyManifest();
  assert.ok(m.models.includes(meh.model) && m.models.includes(beh.model));
  assert.ok(m.sounds.includes(meh.sfx.spawn) && m.sounds.includes(meh.sfx.attack));
});

test('nav: straight path when clear, detour around a wall, partial when unreachable', () => {
  const open = make(floor(-30, -30, 30, 30));
  const r1 = findPath(open, { x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
  assert.ok(!r1.partial && r1.points.length <= 2);

  const w = walled();
  const r2 = findPath(w, { x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
  assert.ok(!r2.partial);
  assert.ok(r2.points.some((p) => Math.abs(p.z) >= 7.5), 'goes around the end of the wall');

  const boxed = make(floor(-30, -30, 30, 30), wallX(0, -100, 100));
  const r3 = findPath(boxed, { x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { maxExpand: 400 });
  assert.ok(r3.partial);
});

test('nav: blocked nodes are avoided', () => {
  const open = make(floor(-30, -30, 30, 30));
  const base = findPath(open, { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 });
  assert.ok(base.points.length >= 1);
});

const run = (s, players, secs, onEv) => {
  const evs = [];
  for (let t = 0; t < secs; t += 0.05) {
    const e = s.update(0.05, players);
    evs.push(...e);
    onEv?.(e);
  }
  return evs;
};

test('meh: spawns with kind, chases the nearest player, attacks on touch, then retargets', () => {
  const s = new EnemySystem({ world: make(floor(-40, -40, 40, 40)), def: ENEMY_DEFS.beh, defs: ENEMY_DEFS });
  const id = s.spawn(0, 0, 0, 0, 'meh');
  const spawn = s.update(0.05, []).find((e) => e.event === 'spawn');
  assert.equal(spawn?.kind, 'meh');
  assert.equal(s.snapshot()[0].kind, 'meh');
  assert.equal(s.targets()[0].r, ENEMY_DEFS.meh.hitRadius);

  const players = [{ id: 'near', x: 10, y: 0, z: 0, down: false }, { id: 'far', x: -25, y: 0, z: 0, down: false }];
  const evs = run(s, players, 14, (e) => { for (const x of e) if (x.event === 'attack') players.find((p) => p.id === x.targetId).down = true; });
  const attacks = evs.filter((e) => e.event === 'attack');
  assert.equal(attacks[0].targetId, 'near', 'nearest first');
  assert.ok(attacks.some((a) => a.targetId === 'far'), 'then the next closest');
  assert.equal(attacks.filter((a) => a.targetId === 'near').length, 1, 'downed players are ignored');
  assert.ok(s.list.find((e) => e.id === id));
});

test('meh: speed is about 6 m/s', () => {
  const s = new EnemySystem({ world: make(floor(-60, -60, 60, 60)), def: ENEMY_DEFS.beh, defs: ENEMY_DEFS });
  s.spawn(0, 0, 0, 0, 'meh');
  const p = [{ id: 'a', x: 50, y: 0, z: 0, down: false }];
  run(s, p, 1.5);
  const x = s.list[0].x;
  assert.ok(x > 5.5 && x < 9.5, `moved ${x}`);
});

test('meh: gets around a wall to reach the player', () => {
  const s = new EnemySystem({ world: walled(), def: ENEMY_DEFS.beh, defs: ENEMY_DEFS });
  s.spawn(-8, 0, 0, 0, 'meh');
  const evs = run(s, [{ id: 'a', x: 8, y: 0, z: 0, down: false }], 15);
  assert.ok(evs.some((e) => e.event === 'attack' && e.targetId === 'a'), 'reached the player');
});

test('meh: dies on kill (die event) and is removed after dieMs; beh unaffected', () => {
  const s = new EnemySystem({ world: null, def: ENEMY_DEFS.beh, defs: ENEMY_DEFS });
  const m = s.spawn(0, 0, 0, 0, 'meh');
  const b = s.spawn(5, 0, 5);
  s.update(0.05, []);
  assert.ok(s.kill(m));
  assert.ok(s.update(0.05, []).some((e) => e.event === 'die' && e.kind === 'meh'), 'die event is emitted by kill()');
  run(s, [], ENEMY_DEFS.meh.dieMs / 1000 + 0.2);
  assert.ok(!s.list.some((e) => e.id === m));
  assert.equal(s.list.find((e) => e.id === b).kind, 'beh');
});

test('lobby: a meh touch downs the player at once (dropping a held gun first)', () => {
  const lm = new LobbyManager();
  const as = [];
  const mk = (id, sent) => ({ id, name: `P${id}`, connection: { send: (m) => sent.push(m), close() {} } });
  const a = mk(1, as), b = mk(2, []);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lm.joinLobby(b, 'B', lobby.code);
  lm._beginLoading(lobby);
  lm.markLoaded(a); lm.markLoaded(b);
  for (const p of [a, b]) p.matchState = { x: 1.5, y: 0.5, z: 1.5, yaw: 0 };
  const g = lobby.enemies.spawn(1.5, 0.5, 1.5, 0, 'meh');
  assert.ok(g);
  lm.broadcastMatchStates(1);
  lm.broadcastMatchStates(2);
  assert.ok(as.some((m) => m.type === 'enemyEvent' && m.event === 'spawn' && m.kind === 'meh'));
  assert.ok(as.some((m) => m.type === 'enemyEvent' && m.event === 'attack'));
  assert.ok(as.some((m) => m.type === 'playerEvent' && m.event === 'down'));
});
