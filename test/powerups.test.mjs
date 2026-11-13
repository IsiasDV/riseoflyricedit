import test from 'node:test';
import assert from 'node:assert/strict';
import { PowerupDirector, DROP_CHANCE, DROP_TTL, BUFF_MS, KINDS, POWERUPS } from '../client/js/game/powerups.js';
import { LyricNpc, LYRIC_MS } from '../client/js/game/lyric.js';
import { RoundSystem } from '../client/js/game/rounds.js';
import { EnemySystem } from '../client/js/game/enemies.js';
import { ENEMY_DEFS } from '../client/js/game/enemy-defs.js';
import { BleedoutState } from '../server/bleedout.js';
import { LobbyManager } from '../server/lobby-manager.js';

const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const at = { x: 1, y: 0, z: 1 };

test('drop chance is 8% and honors the roll', () => {
  assert.equal(DROP_CHANCE, 0.08);
  assert.equal(new PowerupDirector({ rng: seq(0.079, 0) }).onEnemyDown(at)?.kind, KINDS[0]);
  assert.equal(new PowerupDirector({ rng: seq(0.08) }).onEnemyDown(at), null);
  assert.equal(new PowerupDirector({ rng: seq(0.5) }).onEnemyDown(at), null);
});

test('every kind can drop (even spread over the rng range)', () => {
  const seen = new Set();
  for (let i = 0; i < KINDS.length; i++) {
    const d = new PowerupDirector({ rng: seq(0, (i + 0.5) / KINDS.length) });
    seen.add(d.onEnemyDown(at).kind);
  }
  assert.equal(seen.size, KINDS.length);
});

test('orbs expire after 15 s', () => {
  const d = new PowerupDirector({ rng: seq(0, 0) });
  d.onEnemyDown(at); d.drain();
  d.update(DROP_TTL - 0.1);
  assert.equal(d.drops.length, 1);
  d.update(0.2);
  assert.equal(d.drops.length, 0);
  assert.ok(d.drain().some((e) => e.event === 'gone' && e.reason === 'expired'));
});

test('pickup: range check, no round lock, team-wide automation timer', () => {
  const auto = KINDS.indexOf('automation');
  const d = new PowerupDirector({ rng: seq(0, (auto + 0.5) / KINDS.length) });
  const drop = d.onEnemyDown(at);
  assert.equal(d.pickup('a', drop.id, { x: 50, y: 0, z: 50 }), null, 'too far');
  assert.equal(d.pickup('a', drop.id, at), 'automation');
  assert.ok(d.auto > 0);
  d.rng = seq(0, 0);
  assert.ok(d.onEnemyDown(at), 'no round lock: drops keep coming');
  d.update(BUFF_MS / 1000 + 0.1);
  assert.equal(d.auto, 0);
  assert.ok(d.drain().some((e) => e.event === 'buffEnd' && e.playerId === null && e.kind === 'automation'));
});

test('taking one orb leaves the others', () => {
  const d = new PowerupDirector({ rng: seq(0, 0) });
  const a = d.onEnemyDown(at); d.onEnemyDown({ x: 5, y: 0, z: 5 });
  d.drain();
  d.pickup('p', a.id, at);
  assert.equal(d.drain().filter((e) => e.event === 'gone' && e.reason === 'taken').length, 1);
  assert.equal(d.drops.length, 1);
});

test('Lyric joins on pickup, shoots visible enemies, chats, and leaves after 90 s', () => {
  const lyric = KINDS.indexOf('lyric');
  const d = new PowerupDirector({ rng: seq(0, (lyric + 0.5) / KINDS.length, 0.5) });
  const drop = d.onEnemyDown(at);
  d.pickup('p', drop.id, at);
  const first = d.drain();
  assert.ok(first.some((e) => e.event === 'lyricJoin'));
  assert.ok(first.some((e) => e.event === 'chat' && e.name === 'Lyric'));
  const players = [{ id: 'p', x: 1, y: 0, z: 1, down: false }];
  const targets = [{ id: 7, x: 1, y: 1.1, z: -10, r: 1 }];
  let fired = 0, chats = 0, left = false;
  for (let t = 0; t < LYRIC_MS / 1000 + 1; t += 0.1) {
    d.update(0.1, players, targets);
    for (const e of d.drain()) {
      if (e.event === 'lyricFire') { fired++; assert.ok(Math.abs(Math.hypot(...e.dir) - 1) < 1e-6); }
      if (e.event === 'chat') chats++;
      if (e.event === 'lyricLeave') left = true;
    }
  }
  assert.ok(fired > 20, `fired ${fired}`);
  assert.ok(chats >= 2);
  assert.ok(left && !d.lyric);
});

test('Lyric does not fire without enemies and follows the player', () => {
  const n = new LyricNpc({ x: 0, y: 0, z: 0, rng: () => 0.5 });
  let fired = 0;
  for (let i = 0; i < 100; i++) fired += n.update(0.1, [{ id: 1, x: 30, y: 0, z: 0, down: false }], []).fire.length;
  assert.equal(fired, 0);
  assert.ok(n.x > 20, `followed to ${n.x}`);
});

test('nuke helpers: killAll without drops, rounds.skip advances the round', () => {
  const es = new EnemySystem({ def: ENEMY_DEFS.beh });
  es.spawn(0, 0, 0); es.spawn(3, 0, 3); es.update(0.1, []);
  es.killAll({ drops: false });
  const dies = es.update(0.1, []).filter((e) => e.event === 'die');
  assert.equal(dies.length, 2);
  assert.ok(dies.every((e) => e.drop === false));
  es.spawn(1, 0, 1); es.update(0.1, []);
  es.kill(es.list[es.list.length - 1].id);
  assert.equal(es.update(0.1, []).find((e) => e.event === 'die').drop, true);

  const r = new RoundSystem({ introMs: 0, transitionMs: 10000 });
  r.start(1); r.update(0.1, { playerCount: 1, liveEnemies: 0 });
  assert.equal(r.round, 1);
  assert.equal(r.skip(2000)[0].event, 'roundEnd');
  r.update(2.1, { playerCount: 1, liveEnemies: 0 });
  assert.equal(r.round, 2);
});

test('bleedout revive time is configurable (medic 2 s)', () => {
  const hold = (b, ms, need) => { let done = false; for (let t = 0; t <= ms && !done; t += 100) done = b.revive('r', 't', 1000 + t, true, need); return done; };
  const b = new BleedoutState();
  b.down('t', 0);
  assert.equal(hold(b, 1500), false);
  assert.equal(hold(b, 2100, 2000), true);
  b.down('t', 0);
  assert.equal(hold(b, 3000), false, 'default still takes 5 s');
  assert.equal(hold(b, 5200), true);
});

test('lobby: drop -> pickup announces to everyone, nuke clears enemies, Lyric appears in matchState', () => {
  const lm = new LobbyManager();
  const as = [], bs = [];
  const mk = (id, sent) => ({ id, name: `P${id}`, connection: { send: (m) => sent.push(m), close() {} } });
  const a = mk(1, as), b = mk(2, bs);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lm.joinLobby(b, 'B', lobby.code);
  lm._beginLoading(lobby);
  lm.markLoaded(a); lm.markLoaded(b);
  for (const p of [a, b]) p.matchState = { x: 1.5, y: 0.5, z: 1.5, yaw: 0 };
  const nuke = KINDS.indexOf('nuke');
  lobby.powerups.rng = seq(0, (nuke + 0.5) / KINDS.length);
  const id = lobby.enemies.spawn(2, 0.5, 2);
  lobby.enemies.kill(id);
  lm.broadcastMatchStates(1);
  const drop = as.find((m) => m.type === 'powerupEvent' && m.event === 'drop');
  assert.ok(drop && bs.some((m) => m.type === 'powerupEvent' && m.event === 'drop'));
  lobby.enemies.spawn(3, 0.5, 3);
  lobby.rounds.phase = 'active';
  lm.powerupPickup(a, drop.id);
  const picked = bs.find((m) => m.type === 'powerupEvent' && m.event === 'picked');
  assert.equal(picked.kind, 'nuke');
  assert.equal(picked.name, 'A');
  assert.equal(lobby.enemies.liveCount, 0);
  assert.equal(lobby.rounds.phase, 'cleared');
  assert.ok(POWERUPS.nuke);

  // Lyric
  const ly = KINDS.indexOf('lyric');
  lobby.powerups.rng = seq(0, (ly + 0.5) / KINDS.length, 0.5);
  const d2 = lobby.powerups.onEnemyDown({ x: 1, y: 0.5, z: 1 });
  lm.powerupPickup(b, d2.id);
  lm.broadcastMatchStates(2);
  const st = as.filter((m) => m.type === 'matchState').at(-1);
  assert.ok(st.npc && Number.isFinite(st.npc.x));
  assert.ok(as.some((m) => m.type === 'lobbyChat' && m.name === 'Lyric'));
});

test('Lyric: 90 s, no repeated lines in a row, timed lines, pickup extends', () => {
  assert.equal(LYRIC_MS, 90000);
  const l = new LyricNpc({ x: 0, y: 0, z: 0 });
  const lines = [];
  for (let t = 0; t < 88; t += 0.1) lines.push(...l.update(0.1, [{ id: 'p', x: 0, y: 0, z: 0, down: false }], []).chat);
  assert.ok(lines.length >= 9);
  for (let i = 1; i < lines.length; i++) assert.notEqual(lines[i], lines[i - 1]);
  assert.ok(lines.some((t) => /One minute left/.test(t)) && lines.some((t) => /Ten seconds/.test(t)));
  const d = new PowerupDirector({ rng: seq(0, (KINDS.indexOf('lyric') + 0.5) / KINDS.length, 0.5) });
  d.pickup('p', d.onEnemyDown(at).id, at);
  d.lyric.ttl = 10;
  d.rng = seq(0, (KINDS.indexOf('lyric') + 0.5) / KINDS.length);
  d.pickup('p', d.onEnemyDown(at).id, at);
  assert.equal(d.lyric.ttl, LYRIC_MS / 1000);
});

import { POWERUPS as PU2, KINDS as K2, PowerupDirector as PD2 } from '../client/js/game/powerups.js';
import { instaTouches } from '../client/js/game/combat.js';
import { MatchStats as MS2 } from '../client/js/game/match-stats.js';
import { scoreKill, killPoints } from '../client/js/game/scoring.js';
import { ENEMY_DEFS as ED2 } from '../client/js/game/enemy-defs.js';

const pickKind = (d, kind, id = 'a') => {
  const rng = ((i) => () => (i++ === 0 ? 0 : (K2.indexOf(kind) + 0.5) / K2.length))(0);
  const dd = new PD2({ rng }); void d;
  const drop = dd.onEnemyDown({ x: 0, y: 0, z: 0 });
  dd.pickup(id, drop.id, { x: 0, y: 0, z: 0 });
  return dd;
};

test('double points: team-wide timer; insta: per-player timer', () => {
  assert.ok(K2.includes('double') && K2.includes('insta') && PU2.double.team && !PU2.insta.team);
  const d = pickKind(null, 'double');
  assert.ok(d.dbl > 0);
  d.drain();
  d.update(31);
  assert.ok(d.drain().some((e) => e.event === 'buffEnd' && e.kind === 'double' && e.playerId === null));
  const i = pickKind(null, 'insta', 'p1');
  assert.ok(i.insta.get('p1') > 0 && i.dbl === 0);
  i.drain();
  i.update(31);
  assert.ok(i.drain().some((e) => e.event === 'buffEnd' && e.kind === 'insta' && e.playerId === 'p1'));
  i.clear();
  assert.equal(i.insta.size, 0);
});

test('scoring: slap 50, gun 25, double doubles, unknown ids ignored', () => {
  const s = new MS2();
  s.register('a', 'A', 'void');
  assert.equal(s.rows()[0].points, 0);
  scoreKill(s, 'a', 'slap'); scoreKill(s, 'a', 'gun'); scoreKill(s, 'a', 'slap', true);
  scoreKill(s, 'lyric', 'gun');
  assert.equal(s.rows()[0].points, 50 + 25 + 100);
  assert.equal(killPoints('insta', true), 50);
});

test('instaTouches: reach exceeds the meh touch radius, respects distance and height', () => {
  const t = [{ id: 1, x: 1.5, y: 0.8, z: 0, r: 0.5 }, { id: 2, x: 9, y: 0.8, z: 0, r: 0.5 }, { id: 3, x: 1, y: 8, z: 0, r: 0.5 }];
  assert.deepEqual(instaTouches({ x: 0, y: 0, z: 0 }, t), [1]);
  assert.ok(ED2.meh.touchRadius < 0.5 + 1.1);
});
