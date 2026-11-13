import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHARACTERS, CHARACTER_IDS, pickSfx, characterManifest } from '../client/js/game/characters.js';
import { balancedCharacters, CHARACTER_IDS as SERVER_IDS } from '../server/characters.js';

test('character ids match between client and server; every asset exists', () => {
  assert.deepEqual([...SERVER_IDS].sort(), [...CHARACTER_IDS].sort());
  assert.ok(CHARACTERS.dave);
  for (const c of Object.values(CHARACTERS)) {
    for (const url of [c.model, ...[c.sfx, c.reload, c.down].flat()]) {
      assert.ok(url && fs.existsSync(new URL(`../client/${url}`, import.meta.url)), `${c.id}: ${url}`);
    }
  }
});

test('pickSfx handles lists and single strings', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(pickSfx('dave', 'reload'));
  assert.deepEqual([...seen].sort(), [...CHARACTERS.dave.reload].sort());
  assert.equal(pickSfx('void', 'down'), CHARACTERS.void.down);
  assert.equal(pickSfx('nobody', 'down'), null);
});

test('manifest preloads all of Dave\'s lines and every model', () => {
  const m = characterManifest('dave');
  assert.equal(m.audio.length, 6);
  assert.equal(m.models.length, CHARACTER_IDS.length);
});

test('balancedCharacters: valid, even, and uses all three for 3+ players', () => {
  const seen = new Set();
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i < 50; i++) {
      const l = balancedCharacters(n);
      assert.equal(l.length, n);
      const counts = SERVER_IDS.map((id) => l.filter((x) => x === id).length);
      assert.ok(l.every((x) => SERVER_IDS.includes(x)));
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
      if (n === 3) l.forEach((x) => seen.add(x));
    }
  }
  assert.equal(seen.size, 3);
});

test('characterManifest lists every in-match voice line as spatial sounds', () => {
  const m = characterManifest('void', { a: 'boss', b: 'dave' });
  for (const id of ['void', 'boss', 'dave']) {
    for (const url of [CHARACTERS[id].sfx, CHARACTERS[id].reload, CHARACTERS[id].down].flat()) {
      assert.ok(m.sounds.includes(url), url);
      assert.ok(fs.existsSync(new URL(`../client/${url}`, import.meta.url)), url);
    }
  }
  assert.equal(new Set(m.sounds).size, m.sounds.length);
  assert.ok(characterManifest('void').sounds.length > 0);
});

import { pickLobbyCharacter } from '../server/characters.js';
import { LobbyManager } from '../server/lobby-manager.js';

const mkp = (id, sent = []) => ({ id, name: `P${id}`, connection: { send: (m) => sent.push(m), close() {} } });

test('pickLobbyCharacter prefers the least-used character', () => {
  for (let i = 0; i < 30; i++) assert.equal(pickLobbyCharacter(['void', 'void', 'boss', 'boss']), 'dave');
});

test('lobby characters: assigned, selectable in lobby phase only, used for the match, 8 players max', () => {
  const lm = new LobbyManager();
  const sent = [];
  const a = mkp(1, sent);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  assert.ok(CHARACTER_IDS.includes(a.char));
  const st = () => sent.filter((m) => m.type === 'lobbyState').at(-1);
  assert.equal(st().players[0].char, a.char);
  lm.setCharacter(a, 'bogus');
  assert.ok(CHARACTER_IDS.includes(a.char));
  lm.setCharacter(a, 'dave');
  assert.equal(st().players[0].char, 'dave');
  for (let i = 2; i <= 8; i++) lm.joinLobby(mkp(i), `B${i}`, lobby.code);
  assert.equal(lobby.players.size, 8);
  const extra = mkp(9, []);
  lm.joinLobby(extra, 'X', lobby.code);
  assert.equal(lobby.players.size, 8);
  lm._beginLoading(lobby);
  assert.equal(lobby.characters[1], 'dave');
  lm.setCharacter(a, 'void');
  assert.equal(a.char, 'dave');
});
