import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPlayerIds, pointsEntries } from '../client/js/game/scoring.js';
import { LobbyManager } from '../server/lobby-manager.js';

test('matchPlayerIds / pointsEntries handle string-keyed characters and numeric rows', () => {
  assert.deepEqual(matchPlayerIds({ 1: 'void', 2: 'dave' }), [1, 2]);
  assert.deepEqual(matchPlayerIds({ local: 'void' }), ['local']);
  const rows = [{ id: 1, points: 75, status: 'alive' }, { id: 2, points: 10, status: 'left' }, { id: 3, points: 5, status: 'alive' }];
  const e = pointsEntries({ rows, ids: [1, 2, 3], meId: 1, perks: { 3: 'speed' }, myPerk: 'medic' });
  assert.deepEqual(e, [{ id: 1, me: true, points: 75, perk: 'medic' }, { id: 3, me: false, points: 5, perk: 'speed' }]);
  assert.equal(pointsEntries({ rows: [], ids: ['local'], meId: 'local', myPerk: 'classic' })[0].points, 0);
});

test('multiplayer: slap + gun kill points arrive on the wire and show in the points list', () => {
  const lm = new LobbyManager();
  const sent = [];
  const a = { id: 1, name: 'A', connection: { send: (m) => sent.push(m), close() {} } };
  const b = { id: 2, name: 'B', connection: { send() {}, close() {} } };
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lm.joinLobby(b, 'B', lobby.code);
  lm._beginLoading(lobby);
  lm.markLoaded(a); lm.markLoaded(b);
  a.matchState = { x: 0, y: 0.5, z: 0, yaw: 0 };
  b.matchState = { x: 40, y: 0.5, z: 40, yaw: 0 };
  lobby.enemies.spawn(0, 0.5, -1, 0, 'beh');
  lm.slap(a);
  lobby.stats.kill(1); lobby.stats.addPoints(1, 25); // a gun kill's worth
  lm.broadcastMatchStates(1);
  const msg = JSON.parse(JSON.stringify(sent.filter((m) => m.type === 'matchState').at(-1)));
  assert.equal(msg.stats.find((r) => r.id === 1).points, 75);
  const chars = JSON.parse(JSON.stringify(lobby.characters));
  const e = pointsEntries({ rows: msg.stats, ids: matchPlayerIds(chars), meId: 1, myPerk: 'classic' });
  assert.equal(e.find((x) => x.me).points, 75);
  assert.equal(e.length, 2);
});
