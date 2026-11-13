import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
const { settings, SETTING_DEFS, gameVolume } = await import('../client/js/state/settings.js');

test('volume setting: options, default, mapping', () => {
  const o = SETTING_DEFS.volume.options;
  assert.equal(o[0], '0%'); assert.equal(o.at(-1), '100%'); assert.equal(o.length, 11);
  assert.equal(settings.get('volume'), '100%');
  assert.equal(gameVolume(), 1);
  settings.set('volume', '0%'); assert.equal(gameVolume(), 0);
  settings.set('volume', '50%'); assert.equal(gameVolume(), 0.5);
  settings.values.volume = 'bad'; assert.equal(gameVolume(), 1);
  settings.set('volume', '100%');
});
