import test from 'node:test';
import assert from 'node:assert/strict';
import { Taunter, LINES, BEH_NAME } from '../client/js/game/grandmaster-beh.js';
import { TAUNT_MAPS } from '../server/maps.js';
import { getMap } from '../client/js/maps/maps.js';
import { LobbyManager } from '../server/lobby-manager.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('pools: lots of lines, many say gladiators', () => {
  assert.ok(LINES.idle.length >= 10);
  assert.ok(LINES.idle.filter((l) => /gladiator/i.test(l)).length >= 6);
  assert.ok(LINES.round.every((l) => l.includes('{round}')));
  assert.ok(LINES.down.every((l) => l.includes('{name}')));
});

test('idle timing, substitution and no immediate repeats', () => {
  const t = new Taunter({ rng: seq([0, 0.3, 0.6, 0.9]) });
  assert.equal(t.update(29), null);
  const first = t.update(2);
  assert.ok(first);
  assert.equal(t.update(39), null); // next one is 40-80 s away
  const seen = [first];
  for (let i = 0; i < 12; i++) seen.push(t.update(100));
  for (let i = 4; i < seen.length; i++) assert.ok(!seen.slice(i - 4, i).includes(seen[i]));
  const t2 = new Taunter({ rng: () => 0 });
  assert.match(t2.onDown('Zed'), /Zed/);
  assert.equal(t2.onDown('Zed'), null); // cooldown
  const t3 = new Taunter({ rng: () => 0 });
  assert.equal(t3.onRound(1), null);
  assert.match(t3.onRound(4), /4/);
  assert.ok(t3.onGameOver());
});

test('Choco taunts on both sides; server lobby sends beh chat', () => {
  assert.ok(TAUNT_MAPS.has('choco-rocklate-gladiator-arena'));
  assert.equal(getMap('choco-rocklate-gladiator-arena').taunts, true);
  const lm = new LobbyManager();
  const sent = [];
  const a = { id: 1, name: 'A', connection: { send: (m) => sent.push(m), close() {} } };
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lobby.mapId = 'choco-rocklate-gladiator-arena';
  lm._beginLoading(lobby);
  lm.markLoaded(a);
  assert.ok(lobby.taunter);
  lm._beh(lobby, 'tick', 1000);
  assert.ok(sent.some((m) => m.type === 'lobbyChat' && m.id === 'beh' && m.name === BEH_NAME));
  lm._clearTimers(lobby);
  const o = [...[new LobbyManager()]][0];
  const b = { id: 2, name: 'B', connection: { send() {}, close() {} } };
  o.createLobby(b, 'B');
  const l2 = [...o.lobbies.values()][0];
  l2.mapId = 'night-of-the-living-void';
  o._beginLoading(l2); o.markLoaded(b);
  assert.equal(l2.taunter, null);
  o._clearTimers(l2);
});
