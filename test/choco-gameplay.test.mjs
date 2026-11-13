import test from 'node:test';
import assert from 'node:assert/strict';
import { costOf, machinePos } from '../client/js/game/interactions.js';
import { CollisionWorld, gatedWorld, boxTriangles } from '../client/js/game/collision-world.js';
import { loadMapWorld, loadSpawnPoints } from '../server/map-world.js';
import { LobbyManager } from '../server/lobby-manager.js';
import { GUN_SPAWNS, AMMO_SPAWNS } from '../server/maps.js';
import { GUN_SPAWNS as CG, AMMO_SPAWNS as CA } from '../client/js/maps/choco-rocklate-gladiator-arena.js';
import { MAP_DATA } from '../client/js/maps/map-data.js';

const ID = 'choco-rocklate-gladiator-arena';

function setup(n = 1) {
  const lm = new LobbyManager();
  const sent = [];
  const mk = (id) => ({ id, name: 'P' + id, connection: { send: (m) => sent.push({ to: id, ...m }), close() {} } });
  const a = mk(1);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  const ps = [a];
  for (let i = 2; i <= n; i++) { const p = mk(i); ps.push(p); lm.joinLobby(p, 'P' + i, lobby.code); }
  lobby.mapId = ID;
  lm._beginLoading(lobby);
  for (const p of ps) lm.markLoaded(p);
  return { lm, lobby, a, ps, sent };
}
const last = (sent, id = 1) => sent.filter((m) => m.type === 'interactResult' && m.to === id).at(-1);
const stand = (p, at) => { p.matchState = { x: at[0], y: at[1], z: at[2] + 0.5, yaw: 0 }; };
const pts = (lobby, id = 1) => lobby.stats.rows().find((r) => r.id === id).points;

test('per-map costs', () => {
  assert.equal(costOf(ID, 'spin'), 350);
  assert.equal(costOf(ID, 'barrier'), 500);
  assert.equal(costOf(ID, 'lyricMachine'), 650);
  assert.equal(costOf(ID, 'tpA'), 50);
  assert.equal(costOf(ID, 'colorMachine'), 100);
  assert.equal(costOf('ungaland', 'spin'), 500);
  assert.equal(costOf('night-of-the-living-void', 'spin'), 500);
});

test('gate triangles block until opened', () => {
  const w = gatedWorld(new Float32Array(0), { min: [-1, 0, -1], max: [1, 3, 1] });
  assert.notEqual(w.raycast(-5, 1, 0, 1, 0, 0, 10), null);
  w.setGateOpen(true);
  assert.equal(w.raycast(-5, 1, 0, 1, 0, 0, 10), null);
  w.setGateOpen(false);
  assert.notEqual(w.raycast(-5, 1, 0, 1, 0, 0, 10), null);
  assert.equal(boxTriangles([0, 0, 0], [1, 1, 1]).length, 12 * 9);
  assert.ok(CollisionWorld);
});

test('barrier: charged once, opens the lobby world + spawn zone, other lobbies unaffected', () => {
  const { lm, lobby, a, sent } = setup();
  const b = machinePos(ID, 'barrier');
  stand(a, b);
  lm.interact(a, 'barrier');
  assert.equal(last(sent).reason, 'points');
  lobby.stats.addPoints(1, 600);
  const closed = lobby.spawnPoints;
  assert.ok(!lobby.world.gateOpen);
  lm.interact(a, 'barrier');
  assert.equal(last(sent).ok, true);
  assert.equal(pts(lobby), 100);
  assert.ok(lobby.world.gateOpen);
  assert.notEqual(lobby.spawnPoints, closed);
  assert.ok(sent.some((m) => m.type === 'mapEvent' && m.event === 'barrier'));
  lm.interact(a, 'barrier');
  assert.equal(last(sent).reason, 'already');
  assert.equal(pts(lobby), 100);
  assert.equal(loadMapWorld(ID).gateOpen, false);
  assert.notEqual(lobby.world, loadMapWorld(ID, { own: true }));
});

test('spawn zones: closed list stays near the start, open list reaches far', () => {
  const closed = loadSpawnPoints(ID, 'closed'), open = loadSpawnPoints(ID, 'open');
  assert.ok(closed.length > 20, 'closed ' + closed.length);
  assert.ok(open.length > 20, 'open ' + open.length);
  assert.ok(closed.every((p) => p.z <= 5.6));
  assert.ok(open.some((p) => p.z > 60), 'open list never reaches past z=60');
});

test('teleporters: A refuses until B links (free), then 50 pts per trip', () => {
  const { lm, lobby, a, sent } = setup();
  const A = machinePos(ID, 'tpA'), B = machinePos(ID, 'tpB');
  lobby.stats.addPoints(1, 120);
  stand(a, A);
  lm.interact(a, 'tpA');
  assert.equal(last(sent).reason, 'notLinked');
  stand(a, B);
  lm.interact(a, 'tpB');
  assert.equal(last(sent).ok, true);
  assert.equal(last(sent).reason, 'linked');
  assert.equal(pts(lobby), 120);
  assert.ok(sent.some((m) => m.type === 'mapEvent' && m.event === 'linked'));
  lm.interact(a, 'tpB');
  assert.equal(pts(lobby), 70);
  stand(a, A);
  lm.interact(a, 'tpA');
  assert.equal(pts(lobby), 20);
  lm.interact(a, 'tpA');
  assert.equal(last(sent).reason, 'points');
});

test('lyric machine charges 650 and lands a Rise of Lyric orb; powerup machine costs 350', () => {
  const { lm, lobby, a, sent } = setup();
  const L = machinePos(ID, 'lyricMachine');
  stand(a, L);
  lobby.stats.addPoints(1, 1000);
  lm.interact(a, 'lyricMachine');
  assert.equal(last(sent).ok, true);
  assert.equal(pts(lobby), 350);
  lobby.powerups.update(2);
  assert.ok(lobby.powerups.drops.some((d) => d.kind === 'lyric'));
  stand(a, machinePos(ID, 'spin'));
  lm.interact(a, 'spin');
  assert.equal(pts(lobby), 0);
});

test('pickup tables mirror client/server and sit on the floor', () => {
  const norm = (arr) => arr.map((p) => [p.x, p.y, p.z]);
  assert.deepEqual(norm(GUN_SPAWNS[ID]), CG);
  assert.deepEqual(norm(AMMO_SPAWNS[ID]), CA);
  const w = loadMapWorld(ID);
  const off = [];
  for (const [x, y, z] of [...CG, ...CA]) {
    const g = w.groundAt(x, z, y + 1.5, 6);
    if (!g || Math.abs(g.y - y) > 0.6) off.push([x, y, z, g?.y]);
  }
  assert.deepEqual(off, [], 'pickups not on a floor');
  assert.ok(MAP_DATA[ID].barrier);
});
