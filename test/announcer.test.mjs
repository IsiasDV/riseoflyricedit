import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ANNOUNCER, announcerManifest, Announcer } from '../client/js/game/announcer.js';

const fake = () => {
  const log = [];
  const get = (url) => {
    const h = {};
    return { url, currentTime: 0, paused: false,
      addEventListener: (e, f) => { h[e] = f; }, pause() { this.paused = true; },
      play() { log.push(url); return Promise.resolve(); }, end() { h.ended?.(); } };
  };
  const made = [];
  return { log, made, get: (u) => { const a = get(u); made.push(a); return a; } };
};

test('announcer assets exist and are preloaded', () => {
  for (const u of Object.values(ANNOUNCER)) assert.ok(fs.existsSync(new URL(`../client/${u}`, import.meta.url)), u);
  assert.equal(announcerManifest().audio.length, 3);
});

test('announcer plays one clip at a time, queues at most two, stop clears', () => {
  const f = fake();
  const a = new Announcer(f.get);
  a.say('nuke'); a.say('lyric'); a.say('dead'); a.say('nuke');
  assert.deepEqual(f.log, [ANNOUNCER.nuke]);
  f.made[0].end();
  assert.deepEqual(f.log, [ANNOUNCER.nuke, ANNOUNCER.lyric]);
  f.made[1].end();
  assert.deepEqual(f.log, [ANNOUNCER.nuke, ANNOUNCER.lyric, ANNOUNCER.dead]);
  f.made[2].end();
  assert.equal(f.log.length, 3, 'the 4th was dropped');
  a.say('dead'); a.stop();
  assert.ok(f.made[3].paused);
  a.say('lyric');
  assert.equal(f.log.at(-1), ANNOUNCER.lyric);
});
