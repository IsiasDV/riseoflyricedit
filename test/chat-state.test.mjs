import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAway } from '../client/js/game/away.js';
import { LobbyManager } from '../server/lobby-manager.js';

test('computeAway', () => {
  const base = { chatOpen: false, pauseOpen: false, hidden: false, focused: true };
  assert.equal(computeAway(base), false);
  assert.equal(computeAway({ ...base, chatOpen: true }), true);
  assert.equal(computeAway({ ...base, pauseOpen: true }), true);
  assert.equal(computeAway({ ...base, hidden: true }), true);
  assert.equal(computeAway({ ...base, focused: false }), true);
});
test('server keeps away as a strict boolean in matchState', () => {
  const m = new LobbyManager();
  const player = { id: 1 };
  m.lobbies.set('AAAA', { code: 'AAAA', phase: 'playing', players: new Map([[1, player]]) });
  m.memberOf.set(1, 'AAAA');
  m.updatePlayerState(player, { x: 1, y: 0, z: 2, yaw: 0, away: true });
  assert.equal(player.matchState.away, true);
  m.updatePlayerState(player, { x: 1, y: 0, z: 2, yaw: 0, away: 'yes' });
  assert.equal(player.matchState.away, false);
});
