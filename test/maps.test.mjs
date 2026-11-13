import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS as CLIENT_MAPS, getMap } from '../client/js/maps/maps.js';
import { MAPS as SERVER_MAPS, isValidMapId, isMapReady, INTRO_MAPS, SECRET_MAPS, GUN_SPAWNS, AMMO_SPAWNS } from '../server/maps.js';
import { MAP_DATA } from '../client/js/maps/map-data.js';
import { loadMapWorld, loadSpawnPoints } from '../server/map-world.js';
import fs from 'node:fs';
import { LobbyManager } from '../server/lobby-manager.js';

test('client and server registries match; Ungaland is registered', () => {
  assert.deepEqual(CLIENT_MAPS.map((m) => [m.id, m.name]), SERVER_MAPS.map((m) => [m.id, m.name]));
  const u = getMap('ungaland');
  assert.equal(u.name, 'Ungaland');
  assert.equal(u.description, 'A stronghold village in Western Africa invaded by the Behs. This is the continuation of the Alternative Canon.');
  assert.ok(isValidMapId('ungaland'));
  assert.equal(isMapReady('ungaland'), MAP_DATA.ungaland.ready !== false);
  assert.equal(isMapReady('night-of-the-living-void'), true);
});

test('lobby: a not-ready map refuses READY UP', () => {
  const lm = new LobbyManager();
  const sent = [];
  const a = { id: 1, name: 'A', connection: { send: (m) => sent.push(m), close() {} } };
  lm.createLobby(a, 'A');
  lm.setMap(a, 'ungaland');
  lm.setReady(a, true);
  const lobby = [...lm.lobbies.values()][0];
  if (!isMapReady('ungaland')) {
    assert.equal(lobby.phase, 'lobby');
    assert.ok(sent.some((m) => m.type === 'lobbyError' && /Ungaland/.test(m.message)));
    assert.ok(!lobby.ready.has(1));
  }
  lm.setMap(a, 'night-of-the-living-void');
  lm.setReady(a, true);
  assert.equal(lobby.phase, 'countdown');
  lm._clearTimers(lobby);
});

test('Ungaland is live: assets exist, world has sane bounds, spawn points found', () => {
  const u = getMap('ungaland');
  assert.equal(isMapReady('ungaland'), true);
  for (const f of [u.banner, u.loadingBackground, u.loadingAudio, MAP_DATA.ungaland.model]) assert.ok(fs.existsSync(new URL(`../client/${f}`, import.meta.url)), f);
  const w = loadMapWorld('ungaland');
  assert.ok(w && w.bounds.minY > -50, 'giant Beh excluded from collision');
  assert.ok(loadSpawnPoints('ungaland').length > 0);
});

test('Ungaland is 2x scale with a spawn above the ground', () => {
  assert.equal(MAP_DATA.ungaland.scale, 2);
  const w = loadMapWorld('ungaland');
  assert.ok(w.bounds.maxX > 60);
  const g = w.groundAt(MAP_DATA.ungaland.spawn[0], MAP_DATA.ungaland.spawn[2], 50, 100);
  assert.ok(g && MAP_DATA.ungaland.spawn[1] > g.y);
});

test('god mode: enemies cannot down a god player', () => {
  const lm = new LobbyManager();
  const mk = (id) => ({ id, name: `P${id}`, connection: { send() {}, close() {} } });
  const a = mk(1), b = mk(2);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lm.joinLobby(b, 'B', lobby.code);
  lm._beginLoading(lobby);
  lm.markLoaded(a); lm.markLoaded(b);
  for (const p of [a, b]) p.matchState = { x: 1.5, y: 0.5, z: 1.5, yaw: 0 };
  lm.devGod(a, true);
  lm.devGod(b, true);
  lobby.enemies.spawn(1.5, 0.5, 1.5, 0, 'meh');
  for (let i = 0; i < 5; i++) lm.broadcastMatchStates(1);
  assert.ok(!lobby.bleed.isDown(1) && !lobby.bleed.isDown(2));
});

test('Ungaland pickups mirror client/server and sit near ground; teleport destination is clear', async () => {
  const { GUN_SPAWNS: G, AMMO_SPAWNS: A } = await import('../server/maps.js');
  const cm = await import('../client/js/maps/ungaland.js');
  assert.deepEqual(cm.GUN_SPAWNS, G.ungaland.map((p) => [p.x, p.y, p.z]));
  assert.deepEqual(cm.AMMO_SPAWNS, A.ungaland.map((p) => [p.x, p.y, p.z]));
  assert.equal(G.ungaland.length, 3);
  assert.equal(A.ungaland.length, 6);
  const w = loadMapWorld('ungaland');
  const d = MAP_DATA.ungaland;
  for (const p of [...G.ungaland, ...A.ungaland]) {
    const g = w.groundAt(p.x, p.z, p.y + 1.5, 4);
    assert.ok(g && Math.abs(g.y - p.y) < 1.5, `spawn ${p.x},${p.y},${p.z} ground ${g?.y}`);
  }
  const [tx, ty, tz] = d.teleporter.to;
  const g = w.groundAt(tx, tz, ty + 1, 6);
  assert.ok(g && ty >= g.y - 0.5, `teleport dest ground ${g?.y}`);
});

test('bullet color: projectiles keep it, server sanitizes it, machine cycles', async () => {
  const { ProjectileSystem } = await import('../client/js/game/projectiles.js');
  const ps = new ProjectileSystem();
  assert.equal(ps.spawn({ origin: [0, 0, 0], dir: [1, 0, 0], speed: 1, range: 1, color: 0x123456 }).color, 0x123456);
  assert.equal(ps.spawn({ origin: [0, 0, 0], dir: [1, 0, 0], speed: 1, range: 1 }).color, null);
  const { nextBulletColor, FIRST_BULLET_COLOR } = await import('../client/js/maps/props.js');
  assert.equal(nextBulletColor(null), FIRST_BULLET_COLOR);
  let prev = FIRST_BULLET_COLOR;
  for (let i = 0; i < 20; i++) { const c = nextBulletColor(prev); assert.notEqual(c, prev); prev = c; }
});

test('Ungaland enemy spawn points fill both zones', () => {
  const areas = MAP_DATA.ungaland.enemyAreas;
  assert.equal(areas.length, 2);
  const pts = loadSpawnPoints('ungaland');
  assert.ok(pts.length > 50);
  const inside = (p, a) => p.x >= a.min[0] && p.x <= a.max[0] && p.z >= a.min[2] && p.z <= a.max[2] && p.y >= a.min[1] && p.y <= a.max[1];
  assert.ok(pts.every((p) => areas.some((a) => inside(p, a))));
  for (const a of areas) assert.ok(pts.some((p) => inside(p, a)));
});

test('lobby scoring: slap 50 (x2 with double), insta touch 25 and no down from a meh', () => {
  const lm = new LobbyManager();
  const mk = (id) => ({ id, name: `P${id}`, connection: { send() {}, close() {} } });
  const a = mk(1), b = mk(2);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lm.joinLobby(b, 'B', lobby.code);
  lm._beginLoading(lobby);
  lm.markLoaded(a); lm.markLoaded(b);
  a.matchState = { x: 0, y: 0.5, z: 0, yaw: 0 };
  b.matchState = { x: 40, y: 0.5, z: 40, yaw: 0 };
  const pts = () => lobby.stats.rows().find((r) => r.id === 1).points;
  lobby.enemies.spawn(0, 0.5, -1, 0, 'beh');
  lm.slap(a);
  assert.equal(pts(), 50);
  lobby.powerups.dbl = 30;
  lobby.enemies.spawn(0, 0.5, -1, 0, 'beh');
  a.lastSlapAt = 0;
  lm.slap(a);
  assert.equal(pts(), 150);
  lobby.powerups.dbl = 0;
  lobby.powerups.insta.set(1, 30);
  lobby.enemies.spawn(0, 0.5, -1.2, 0, 'meh');
  lm.broadcastMatchStates(1);
  assert.equal(pts(), 175);
  assert.ok(!lobby.bleed.isDown(1));
});

test('Choco-rocklate Gladiator Arena is live with its loading assets', () => {
  const id = 'choco-rocklate-gladiator-arena';
  const m = getMap(id);
  assert.equal(m.name, 'Choco-rocklate Gladiator Arena');
  assert.match(m.description, /^As the false prophecy foretold its founders.*Behs that aren.t fair\.$/);
  assert.ok(isValidMapId(id));
  assert.equal(isMapReady(id), true);
  assert.equal(m.minLoadingMs, 7000);
  assert.ok(fs.existsSync('client/' + m.intro.video));
  assert.ok(INTRO_MAPS.has(id));
  assert.ok(SECRET_MAPS.has('ungaland'));
  assert.ok(fs.existsSync('client/' + getMap('ungaland').secret.audio));
  assert.ok(loadMapWorld(id));
});

test('every ready map has its assets on disk', () => {
  for (const m of CLIENT_MAPS.filter((x) => x.ready !== false)) {
    for (const p of [m.banner, m.loadingBackground, m.loadingAudio, ...m.assets.models, ...(m.assets.images ?? [])]) {
      assert.ok(fs.existsSync('client/' + p), m.id + ': missing ' + p);
    }
  }
});

test('Choco: 35% scale, in-game BGM + greeting, storm helpers', async () => {
  const m = getMap('choco-rocklate-gladiator-arena');
  assert.equal(MAP_DATA['choco-rocklate-gladiator-arena'].scale, 0.35);
  assert.equal(m.bgmInGame, true);
  assert.equal(m.greeting.from, 'Grandmaster Beh');
  assert.equal(m.greeting.text('Alex'), 'Welcome Alex to the ultimate Choco-rocklate Gladiator Arena! Prepare yourselves!');
  const w = loadMapWorld('choco-rocklate-gladiator-arena');
  assert.ok(w.bounds.maxX - w.bounds.minX < 330);
  const g = w.groundAt(0, 0, 50, 100);
  assert.ok(Math.abs(g.y - MAP_DATA['choco-rocklate-gladiator-arena'].spawn[1]) < 0.5);
  const { flashEnvelope, nextStrikeDelay } = await import('../client/js/maps/storm.js');
  assert.equal(flashEnvelope(-1), 0);
  assert.equal(flashEnvelope(1), 0);
  assert.ok(flashEnvelope(0.04) > 0.9 && flashEnvelope(0.1) <= 1);
  for (const r of [0, 0.5, 0.999]) { const d = nextStrikeDelay(() => r); assert.ok(d >= 9 && d <= 22); }
});

test('Endless Shot scaffold + Choco secret + sky timeline', async () => {
  const e = getMap('endless-shot');
  assert.equal(e.name, 'Endless Shot');
  assert.equal(e.description, 'Perhaps a detour back into the past. Perhaps the home of the Behs. How far do we have to go across time and space to uncover the core of the Alternative Core?');
  assert.ok(isValidMapId('endless-shot'));
  assert.equal(isMapReady('endless-shot'), false);
  assert.deepEqual(GUN_SPAWNS['endless-shot'], []);
  assert.deepEqual(AMMO_SPAWNS['endless-shot'], []);
  assert.equal(loadMapWorld('endless-shot'), null);
  const c = getMap('choco-rocklate-gladiator-arena');
  assert.ok(SECRET_MAPS.has(c.id));
  assert.ok(fs.existsSync('client/' + c.secret.audio));
  const { skyBlendAt, SKY_MS } = await import('../client/js/maps/choco-rocklate-gladiator-arena.js');
  assert.equal(skyBlendAt(0), 0);
  assert.equal(skyBlendAt(SKY_MS), 1);
  assert.equal(skyBlendAt(SKY_MS * 2), 1);
  let prev = -1;
  for (let ms = 0; ms <= SKY_MS; ms += 1000) { const b = skyBlendAt(ms); assert.ok(b >= prev); prev = b; }
});

test('Fearvelations scaffold', () => {
  const f = getMap('fearvelations');
  assert.equal(f.name, 'Fearvelations');
  assert.match(f.description, /Journey into Imagination\.$/);
  assert.ok(isValidMapId('fearvelations'));
  assert.equal(isMapReady('fearvelations'), false);
  assert.deepEqual(GUN_SPAWNS['fearvelations'], []);
  assert.deepEqual(AMMO_SPAWNS['fearvelations'], []);
  assert.equal(loadMapWorld('fearvelations'), null);
});
