import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FlybySchedule } from '../client/js/game/flyby-schedule.js';
import { listMaps } from '../client/js/maps/maps.js';

test('schedule preloads at 20s, switches at 30s, waits for ready, wraps', () => {
  const s = new FlybySchedule(2, 1);
  assert.equal(s.index, 1);
  assert.equal(s.next, 0);
  s.tick(19);
  assert.equal(s.shouldPreload, false);
  s.tick(1);
  assert.equal(s.shouldPreload, true);
  s.tick(9);
  assert.equal(s.canSwitch(true), false);
  s.tick(1);
  assert.equal(s.canSwitch(false), false);
  assert.equal(s.canSwitch(true), true);
  s.advance();
  assert.equal(s.index, 0);
  assert.equal(s.t, 0);
});

test('single-map schedule never switches', () => {
  const s = new FlybySchedule(1);
  s.tick(100);
  assert.equal(s.canSwitch(true), false);
});

test('menu music is lyric.opus and every map can be flown through', () => {
  assert.match(fs.readFileSync('client/js/ui/bgm.js', 'utf8'), /lyric\.opus/);
  assert.ok(fs.existsSync('client/assets/menu_bgm/lyric.opus'));
  for (const m of listMaps()) assert.equal(typeof m.createLevel, 'function');
});
