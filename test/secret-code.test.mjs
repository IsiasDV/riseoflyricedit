import test from 'node:test';
import assert from 'node:assert/strict';
import { CodeDetector, KEY_CODE, PAD_CODE } from '../client/js/game/secret-code.js';

const feedAll = (d, seq) => seq.map((i) => d.feed(i)).pop();

test('keyboard code completes', () => {
  assert.equal(feedAll(new CodeDetector(KEY_CODE), KEY_CODE), true);
});
test('pad code completes and expects() reports stage', () => {
  const d = new CodeDetector(PAD_CODE);
  PAD_CODE.slice(0, 8).forEach((i) => d.feed(i));
  assert.equal(d.expects(), 1);
  assert.equal(PAD_CODE.slice(8).map((i) => d.feed(i)).pop(), true);
});
test('wrong input resets, first key restarts', () => {
  const d = new CodeDetector(KEY_CODE);
  d.feed('ArrowUp'); d.feed('ArrowUp'); d.feed('ArrowLeft');
  assert.equal(d.progress, 0);
  d.feed('ArrowUp'); d.feed('ArrowUp'); d.feed('ArrowUp');
  assert.equal(d.progress, 1);
});
test('timeout resets', () => {
  let t = 0;
  const d = new CodeDetector(KEY_CODE, { now: () => t });
  d.feed('ArrowUp'); t = 5000;
  assert.equal(d.feed('ArrowUp'), false);
  assert.equal(d.progress, 1);
});
