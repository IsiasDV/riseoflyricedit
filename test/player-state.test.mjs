import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerState } from '../client/js/game/player-state.js';
import { EventBus } from '../client/js/core/events.js';

test('starting health, hand weapon, infinite ammo, round 1', () => {
  const s = new PlayerState(new EventBus());
  s.reset('void'); assert.equal(s.health, 100); assert.equal(s.charName, 'Void');
  s.reset('dave'); assert.equal(s.health, 100); assert.equal(s.charName, 'Dave the Manager');
  s.reset('boss'); assert.equal(s.health, 50); assert.equal(s.charName, 'Boss Baby');
  const snap = s.snapshot();
  assert.equal(snap.weaponName, 'Hand'); assert.equal(snap.ammo, Infinity); assert.equal(snap.round, 1);
});
test('damage/heal clamp and emit', () => {
  const bus = new EventBus(); let n = 0; bus.on('player:state', () => n++);
  const s = new PlayerState(bus); s.reset('boss');
  s.damage(999); assert.equal(s.health, 0);
  s.heal(999); assert.equal(s.health, 50);
  assert.equal(n, 3);
});
