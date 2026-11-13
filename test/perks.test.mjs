import test from 'node:test';
import assert from 'node:assert/strict';
import { PERKS, PERK_IDS, isPerk, effectivePerk, MEDIC_REVIVE_MS, SPEED_PERK_MULT } from '../client/js/game/perks.js';
import { LobbyManager } from '../server/lobby-manager.js';

test('perk table: five perks with the specified colors', () => {
  assert.deepEqual(PERK_IDS, ['speed', 'medic', 'vulture', 'oneman', 'classic']);
  assert.equal(new Set(PERK_IDS.map((i) => PERKS[i].color)).size, 5);
  assert.equal(PERKS.speed.color, 0xffd23a);
  assert.equal(SPEED_PERK_MULT, 1.25);
  assert.equal(MEDIC_REVIVE_MS, 2000);
  assert.ok(isPerk('medic') && !isPerk('nope') && !isPerk('__proto__'));
});

test('medic falls back to classic in singleplayer', () => {
  assert.equal(effectivePerk('medic', 'single'), 'classic');
  assert.equal(effectivePerk('medic', 'multi'), 'medic');
  assert.equal(effectivePerk('speed', 'single'), 'speed');
});

function setup() {
  const lm = new LobbyManager();
  const as = [], bs = [];
  const mk = (id, sent) => ({ id, name: `P${id}`, connection: { send: (m) => sent.push(m), close() {} } });
  const a = mk(1, as), b = mk(2, bs);
  lm.createLobby(a, 'A');
  const lobby = [...lm.lobbies.values()][0];
  lm.joinLobby(b, 'B', lobby.code);
  return { lm, lobby, a, b, as, bs };
}
const play = ({ lm, lobby, a, b }) => {
  lm._beginLoading(lobby);
  lm.markLoaded(a); lm.markLoaded(b);
  for (const p of [a, b]) p.matchState = { x: 1.5, y: 0.5, z: 1.5, yaw: 0 };
};

test('setPerk validates, relays in lobbyState, and locks during a match', () => {
  const t = setup();
  t.lm.setPerk(t.a, 'vulture');
  t.lm.setPerk(t.b, 'bogus');
  const st = t.bs.filter((m) => m.type === 'lobbyState').at(-1);
  assert.equal(st.players.find((p) => p.id === 1).perk, 'vulture');
  assert.equal(st.players.find((p) => p.id === 2).perk, 'classic');
  t.lm.setPerk(t.b, 'medic');
  t.lm._beginLoading(t.lobby);
  assert.equal(t.as.find((m) => m.type === 'loadMap').perks[2], 'medic');
  t.lm.setPerk(t.b, 'speed');
  assert.equal(t.b.perk, 'medic', 'locked once the match starts');
});

test('medic revives in 2 s, others need 5 s', () => {
  const t = setup();
  t.lm.setPerk(t.a, 'medic');
  play(t);
  t.lobby.bleed.down(2, 0);
  const real = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 25; i++) { t.lm.revive(t.a, 2); now += 100; }
  } finally { Date.now = real; }
  assert.ok(!t.lobby.bleed.isDown(2), 'medic done within ~2.5 s');
});

test('non-medic needs the full 5 s', () => {
  const t = setup();
  play(t);
  t.lobby.bleed.down(2, 0);
  const real = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 25; i++) { t.lm.revive(t.a, 2); now += 100; }
    assert.ok(t.lobby.bleed.isDown(2));
  } finally { Date.now = real; }
});

test('One Man Show: self-revive once per round, only with the perk', () => {
  const t = setup();
  t.lm.setPerk(t.a, 'oneman');
  play(t);
  t.lobby.bleed.down(1, Date.now());
  t.lobby.bleed.down(2, Date.now());
  t.lm.selfRevive(t.b);
  assert.ok(t.lobby.bleed.isDown(2), 'classic cannot self-revive');
  t.lm.selfRevive(t.a);
  assert.ok(!t.lobby.bleed.isDown(1));
  assert.ok(t.as.some((m) => m.type === 'playerEvent' && m.event === 'revived' && m.id === 1 && m.self === true));
  t.lobby.bleed.down(1, Date.now());
  t.lm.selfRevive(t.a);
  assert.ok(t.lobby.bleed.isDown(1), 'once per round');
  t.lobby.selfRevived.clear(); // a new round
  t.lm.selfRevive(t.a);
  assert.ok(!t.lobby.bleed.isDown(1));
});
