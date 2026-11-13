import test from 'node:test';
import assert from 'node:assert/strict';
import { isGetMovingPhrase, SFX } from '../client/js/game/sfx.js';
import { LobbyManager } from '../server/lobby-manager.js';
import { existsSync } from 'node:fs';

const fp = (id, sent) => ({ id, name: `P${id}`, connection: { send: (m) => sent.push(m), close() {} } });

test('get-moving phrase matcher', () => {
  for (const t of ['I should get moving', 'i SHOULD get moving!!', '  I-should...get   moving ', 'ok so I should get moving now'])
    assert.ok(isGetMovingPhrase(t), t);
  for (const t of ['I should move', 'get moving', '', null]) assert.ok(!isGetMovingPhrase(t), String(t));
});

test('sfx files exist', () => {
  for (const url of Object.values(SFX)) assert.ok(existsSync(new URL(`../client/${url}`, import.meta.url)), url);
});

test('chat phrase broadcasts chatSfx to every lobby member only for the phrase', () => {
  const lm = new LobbyManager();
  const as = [], bs = [];
  const a = fp(1, as), b = fp(2, bs);
  lm.createLobby(a, 'A');
  lm.joinLobby(b, 'B', [...lm.lobbies.keys()][0]);
  lm.chat(a, 'hello');
  assert.equal(bs.filter((m) => m.type === 'chatSfx').length, 0);
  lm.chat(b, 'I Should Get Moving');
  for (const s of [as, bs]) assert.equal(s.filter((m) => m.type === 'chatSfx').length, 1);
});

test('slap broadcasts slapFx even on a miss', () => {
  const lm = new LobbyManager();
  const sent = [];
  const a = fp(1, sent);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lm._beginLoading(lobby);
  lm.markLoaded(a);
  a.matchState = { x: 0, y: 0, z: 0, yaw: 0 };
  lm.slap(a);
  assert.equal(sent.filter((m) => m.type === 'slapFx').length, 1);
});
