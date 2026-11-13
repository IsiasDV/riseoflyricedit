import test from 'node:test';
import assert from 'node:assert/strict';
import { LobbyManager } from '../server/lobby-manager.js';

function setup(mapId, n = 2) {
  const lm = new LobbyManager();
  const sent = [];
  const mk = (id) => ({ id, name: 'P' + id, connection: { send: (m) => sent.push({ to: id, ...m }), close() {} } });
  const players = [];
  const host = mk(1);
  players.push(host);
  lm.createLobby(host, 'P1');
  const lobby = [...lm.lobbies.values()][0];
  for (let i = 2; i <= n; i++) { const p = mk(i); players.push(p); lm.joinLobby(p, 'P' + i, lobby.code); }
  lobby.mapId = mapId;
  return { lm, lobby, players, sent };
}
const count = (sent, type, to = 1) => sent.filter((m) => m.type === type && m.to === to).length;

test('intro vote: only during loading on intro maps; unanimous vote skips', () => {
  const { lm, lobby, players, sent } = setup('choco-rocklate-gladiator-arena', 2);
  lm.introVote(players[0]);
  assert.equal(count(sent, 'introVotes'), 0); // not loading yet
  lm._beginLoading(lobby);
  lm.introVote(players[0]);
  lm.introVote(players[0]); // duplicates count once
  const v = sent.filter((m) => m.type === 'introVotes' && m.to === 1).pop();
  assert.deepEqual([v.votes, v.total], [1, 2]);
  assert.equal(count(sent, 'introSkip'), 0);
  lm.introVote(players[1]);
  assert.equal(count(sent, 'introSkip'), 1);
  lm._clearTimers(lobby);
});

test('intro vote: a leaving player re-evaluates, votes reset on next load, other maps ignore', () => {
  const { lm, lobby, players, sent } = setup('choco-rocklate-gladiator-arena', 2);
  lm._beginLoading(lobby);
  lm.introVote(players[0]);
  lm.leaveLobby(2);
  assert.equal(count(sent, 'introSkip'), 1);
  lm._clearTimers(lobby);
  lm._beginLoading(lobby);
  assert.equal(lobby.introVotes.size, 0);
  lm._clearTimers(lobby);

  const o = setup('night-of-the-living-void', 2);
  o.lm._beginLoading(o.lobby);
  o.lm.introVote(o.players[0]);
  assert.equal(o.sent.filter((m) => m.type === 'introVotes').length, 0);
  o.lm._clearTimers(o.lobby);
});
