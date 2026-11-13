import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchStats } from '../client/js/game/match-stats.js';
import { LobbyManager } from '../server/lobby-manager.js';

function fakePlayer(id, sent) {
  return { id, name: `P${id}`, connection: { send: (m) => sent.push(m), close() {} } };
}

test('match stats: deaths count once per transition to dead; version bumps on change', () => {
  const m = new MatchStats();
  m.register(1, 'A', 'void');
  const v0 = m.version;
  m.down(1);
  assert.ok(m.version > v0);
  m.setStatus(1, 'dead'); m.setStatus(1, 'dead');
  assert.equal(m.rows()[0].deaths, 1);
  const v1 = m.version;
  m.setStatus(1, 'dead'); // no change
  assert.equal(m.version, v1);
  m.setStatus(1, 'alive'); m.setStatus(1, 'dead');
  assert.equal(m.rows()[0].deaths, 2);
});

test('setStats sanitizes and is relayed to lobby mates in lobbyState', () => {
  const lm = new LobbyManager();
  const aSent = [], bSent = [];
  const a = fakePlayer(1, aSent), b = fakePlayer(2, bSent);
  lm.createLobby(a, 'A');
  const code = [...lm.lobbies.keys()][0];
  lm.joinLobby(b, 'B', code);

  lm.setStats(a, { gamesPlayed: 3, kills: 12.9, deaths: -5, downs: NaN, revives: '4', bestRound: 1e12, evil: 1 });
  const last = bSent.filter((m) => m.type === 'lobbyState').at(-1);
  const pa = last.players.find((p) => p.id === 1);
  assert.deepEqual(pa.stats, { gamesPlayed: 3, kills: 12, deaths: 0, downs: 0, revives: 4, bestRound: 1e9 });
  assert.equal(last.players.find((p) => p.id === 2).stats, null);
});

test('setStats ignores non-object input', () => {
  const lm = new LobbyManager();
  const p = fakePlayer(1, []);
  for (const bad of [null, undefined, 5, 'x', [1, 2]]) lm.setStats(p, bad);
  assert.equal(p.stats, undefined);
});

test('matchState carries stats only when they changed', () => {
  const lm = new LobbyManager();
  const sent = [];
  const a = fakePlayer(1, sent);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lm._beginLoading(lobby);
  lm.markLoaded(a);
  const states = () => sent.filter((m) => m.type === 'matchState');
  lm.broadcastMatchStates(1);
  assert.ok(states().at(-1).stats, 'first state includes stats');
  lm.broadcastMatchStates(2);
  assert.equal(states().at(-1).stats, undefined, 'unchanged -> omitted');
  lobby.stats.kill(1);
  lm.broadcastMatchStates(3);
  assert.equal(states().at(-1).stats[0].kills, 1);
});
