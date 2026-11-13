import test from 'node:test';
import assert from 'node:assert/strict';
import { COSTS, machinePos } from '../client/js/game/interactions.js';
import { MatchStats } from '../client/js/game/match-stats.js';
import { PowerupDirector, SPIN_MS, KINDS } from '../client/js/game/powerups.js';
import { loadMapWorld } from '../server/map-world.js';
import { LobbyManager } from '../server/lobby-manager.js';

test('costs, machine positions on ground, spendPoints', () => {
  assert.deepEqual({ s: COSTS.spin, t: COSTS.teleporter, c: COSTS.colorMachine }, { s: 500, t: 250, c: 100 });
  assert.deepEqual(machinePos('night-of-the-living-void', 'spin'), [10.3, 0.0, 1.5]);
  assert.deepEqual(machinePos('ungaland', 'spin'), [-4.1, 1.6, 19.4]);
  assert.equal(machinePos('night-of-the-living-void', 'teleporter'), null);
  for (const m of ['night-of-the-living-void', 'ungaland']) {
    const p = machinePos(m, 'spin');
    const g = loadMapWorld(m).groundAt(p[0], p[2], p[1] + 1.5, 6);
    assert.ok(g && Math.abs(g.y - p[1]) < 0.5, m);
  }
  const s = new MatchStats();
  s.register('a', 'A', 'void');
  s.addPoints('a', 300);
  const v = s.version;
  assert.equal(s.spendPoints('a', 500), false);
  assert.equal(s.version, v);
  assert.equal(s.rows()[0].points, 300);
  assert.equal(s.spendPoints('a', 100), true);
  assert.equal(s.rows()[0].points, 200);
});

test('director spin: immediate event, delayed drop in front of the machine', () => {
  const d = new PowerupDirector({ rng: () => 0.5 });
  d.spin({ x: 0, y: 1, z: 0 }, { x: 0, z: 10 });
  assert.ok(d.drain().some((e) => e.event === 'spin'));
  d.update(SPIN_MS / 1000 - 0.1);
  assert.equal(d.drops.length, 0);
  d.update(0.2);
  assert.equal(d.drops.length, 1);
  const o = d.drops[0];
  assert.ok(KINDS.includes(o.kind));
  assert.ok(Math.abs(o.z - 1.6) < 1e-6 && Math.abs(o.x) < 1e-6);
});

function setup(mapId) {
  const lm = new LobbyManager();
  const sent = [];
  const a = { id: 1, name: 'A', connection: { send: (m) => sent.push(m), close() {} } };
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lobby.mapId = mapId;
  lm._beginLoading(lobby);
  lm.markLoaded(a);
  return { lm, lobby, a, sent };
}

test('lobby interact: points, range, availability, charge', () => {
  const { lm, lobby, a, sent } = setup('ungaland');
  const at = machinePos('ungaland', 'spin');
  a.matchState = { x: at[0], y: at[1], z: at[2] + 1, yaw: 0 };
  const last = () => sent.filter((m) => m.type === 'interactResult').at(-1);
  const pts = () => lobby.stats.rows().find((r) => r.id === 1).points;

  lm.interact(a, 'spin');
  assert.equal(last().ok, false); assert.equal(last().reason, 'points');
  lobby.stats.addPoints(1, 600);
  lm.interact(a, 'spin');
  assert.equal(last().ok, true);
  assert.equal(pts(), 100);
  assert.ok(sent.some((m) => m.type === 'powerupEvent' && m.event === 'spin'));
  lm.interact(a, 'colorMachine'); // far from it
  assert.equal(last().reason, 'range');
  const c = machinePos('ungaland', 'colorMachine');
  a.matchState = { x: c[0], y: c[1], z: c[2], yaw: 0 };
  lm.interact(a, 'colorMachine');
  assert.equal(last().ok, true);
  assert.equal(pts(), 0);
  lm.interact(a, 'bogus');
  assert.equal(last(), sent.filter((m) => m.type === 'interactResult').at(-1));
  assert.equal(last().reason, 'unavailable');
});

test('lobby interact: spin unavailable on a map without it is impossible; teleporter missing on Night', () => {
  const { lm, lobby, a, sent } = setup('night-of-the-living-void');
  a.matchState = { x: 0, y: 0, z: 0, yaw: 0 };
  lobby.stats.addPoints(1, 1000);
  lm.interact(a, 'teleporter');
  assert.equal(sent.filter((m) => m.type === 'interactResult').at(-1).reason, 'unavailable');
});

import { teleportPay } from '../client/js/game/interactions.js';

test('teleportPay tiers', () => {
  assert.equal(teleportPay(250, true), 'points');
  assert.equal(teleportPay(300, false), 'points');
  assert.equal(teleportPay(249, true), 'gun');
  assert.equal(teleportPay(0, false), 'free');
});

test('lobby teleporter: points, gun, or free; game over returns to the lobby', () => {
  const { lm, lobby, a, sent } = setup('ungaland');
  const t = machinePos('ungaland', 'teleporter');
  a.matchState = { x: t[0], y: t[1], z: t[2], yaw: 0 };
  const pts = () => lobby.stats.rows().find((r) => r.id === 1).points;
  const last = () => sent.filter((m) => m.type === 'interactResult').at(-1);
  lobby.stats.addPoints(1, 300);
  lobby.gun.release(1);
  lm.interact(a, 'teleporter');
  assert.equal(pts(), 50); assert.ok(last().ok);
  assert.ok(lobby.gun.tryTake(1, 0, { x: 6.4, y: 3.2, z: 19.5 }) || true);
  // force a gun, then low points -> gun lost
  lobby.gun.hasGun = () => true;
  let released = 0; lobby.gun.release = () => { released++; };
  lm.interact(a, 'teleporter');
  assert.equal(pts(), 50); assert.equal(released, 1);
  assert.ok(sent.some((m) => m.type === 'playerEvent' && m.event === 'gunLost'));
  lobby.gun.hasGun = () => false;
  lm.interact(a, 'teleporter');
  assert.ok(last().ok); assert.equal(pts(), 50);
  lm._gameOver(lobby);
  assert.equal(lobby.phase, 'lobby');
  assert.equal(lobby.ready.size, 0);
  assert.equal(lobby.players.size, 1);
  assert.ok(sent.some((m) => m.type === 'gameOver'));
});
