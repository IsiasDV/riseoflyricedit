import test from 'node:test';
import assert from 'node:assert/strict';
import { HeadBob } from '../client/js/game/head-bob.js';
import { Haptics } from '../client/js/input/haptics.js';
import { SETTING_DEFS, VIBRATION_SCALE, lookScale } from '../client/js/state/settings.js';
import { isSenseBehPhrase, BEH_REPLY } from '../client/js/game/sfx.js';
import { LobbyManager } from '../server/lobby-manager.js';

const run = (bob, secs, input, dt = 1 / 60) => {
  let peak = 0, steps = 0, last;
  for (let t = 0; t < secs; t += dt) { last = bob.update(dt, input); peak = Math.max(peak, Math.abs(last.y)); if (last.step) steps++; }
  return { peak, steps, last };
};

test('head bob: none when still or airborne, grows with speed, one step per footfall', () => {
  assert.ok(run(new HeadBob(), 1, { speed: 0 }).peak < 1e-9);
  assert.ok(run(new HeadBob(), 1, { speed: 7, onGround: false }).peak < 1e-9);
  const walk = run(new HeadBob(), 3, { speed: 4 });
  const sprint = run(new HeadBob(), 3, { speed: 7, running: true });
  assert.ok(sprint.peak > walk.peak && walk.peak > 0);
  assert.ok(walk.steps >= 8 && walk.steps <= 14, `steps ${walk.steps}`);
  const crouch = run(new HeadBob(), 3, { speed: 2, crouching: true });
  assert.ok(crouch.peak < walk.peak);
});

test('head bob: landing dips the view and recovers', () => {
  const b = new HeadBob();
  const hit = b.update(1 / 60, { speed: 0, landSpeed: 10 });
  assert.ok(hit.y < -0.05);
  const after = run(b, 1, { speed: 0 });
  assert.ok(Math.abs(after.last.y) < 0.005);
});

test('settings: new options exist with valid defaults and scaling', () => {
  assert.equal(SETTING_DEFS.vibration.label, 'CONTROLLER VIBRATION');
  assert.equal(SETTING_DEFS.cameraSensitivity.label, 'CAMERA SENSITIVITY');
  assert.deepEqual(Object.keys(VIBRATION_SCALE), SETTING_DEFS.vibration.options);
  assert.ok(SETTING_DEFS.cameraSensitivity.options.includes('5'));
  assert.ok(Math.abs(lookScale() - 1) < 1e-9, 'default look scale is 1x');
  assert.equal(SETTING_DEFS.sensitivity, undefined, 'mouse sensitivity option removed');
  assert.deepEqual(SETTING_DEFS.motionBlur.options, ['OFF', 'ON']);
});

test('haptics: scales by setting, silent when OFF or no pad', () => {
  const calls = [];
  const pad = { vibrationActuator: { playEffect: (type, p) => calls.push([type, p]) } };
  assert.ok(new Haptics(() => pad, () => 0.5).pulse({ weak: 1, strong: 0.5, ms: 50 }));
  assert.equal(calls[0][0], 'dual-rumble');
  assert.equal(calls[0][1].weakMagnitude, 0.5);
  assert.equal(calls[0][1].strongMagnitude, 0.25);
  assert.equal(new Haptics(() => pad, () => 0).pulse({ weak: 1 }), false);
  assert.equal(new Haptics(() => null, () => 1).pulse({ weak: 1 }), false);
  assert.equal(calls.length, 1);
});

test('"I sense a beh nearby" matcher and Beh reply to the whole lobby', () => {
  for (const t of ['I sense a beh nearby', 'hmm, i SENSE a Beh nearby!!', 'ok i sense a beh nearby... run'])
    assert.ok(isSenseBehPhrase(t), t);
  for (const t of ['I sense a beh', 'beh nearby', '']) assert.ok(!isSenseBehPhrase(t), t);

  const lm = new LobbyManager();
  const as = [], bs = [];
  const mk = (id, s) => ({ id, name: `P${id}`, connection: { send: (m) => s.push(m), close() {} } });
  const a = mk(1, as), b = mk(2, bs);
  lm.createLobby(a, 'A');
  lm.joinLobby(b, 'B', [...lm.lobbies.keys()][0]);
  lm.chat(a, 'hello');
  assert.equal(bs.filter((m) => m.name === 'Beh').length, 0);
  lm.chat(b, 'i sense a beh nearby');
  for (const s of [as, bs]) {
    const r = s.filter((m) => m.type === 'lobbyChat' && m.name === 'Beh');
    assert.equal(r.length, 1);
    assert.equal(r[0].text, BEH_REPLY);
  }
});
