import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { setInterval: () => 0, localStorage: { getItem: () => null }, document: { body: { classList: { contains: () => false } } } };
vm.runInNewContext(fs.readFileSync(new URL('../collector/public/prompts.js', import.meta.url), 'utf8'), ctx);
const { promptSlots } = ctx;
const MIN = 60_000, NOW = Date.parse('2026-11-03T12:42:37Z');

const off = -new Date(NOW).getTimezoneOffset() * MIN;
const onClock = (t, step) => (t + off) % step === 0;

test('15 minutes: 15 one-minute slots on whole minutes, the last one holding now', () => {
  const { from, to, slots } = promptSlots([], NOW, 15 * MIN, 15);
  assert.ok(onClock(from, MIN) && onClock(to, MIN), 'starts and ends on a whole minute');
  assert.ok(to > NOW && to - NOW <= MIN, 'the last slot is the current minute');
  assert.equal(to - from, 15 * MIN);
  assert.equal(slots.length, 15);
  for (const [i, sl] of slots.entries()) { assert.equal(sl.to - sl.from, MIN, `slot ${i} is one minute`); if (i) assert.equal(sl.from, slots[i - 1].to, 'no gaps'); }
});

test('every prompt in the span counts once, nothing outside it does', () => {
  const { from, to } = promptSlots([], NOW, 15 * MIN, 15);
  const at = (t, tokens, context = null) => ({ ts: t, tokens, context });
  const ps = [at(from - 1, 99), at(from, 1, 20), at(from + 30_000, 2), at(NOW - 1000, 4, 50), at(NOW, 8, 70), at(to + 1, 99)];
  const { slots } = promptSlots(ps, NOW, 15 * MIN, 15);
  assert.equal(slots.reduce((a, sl) => a + sl.tokens, 0), 1 + 2 + 4 + 8, 'the ones outside the span are left out');
  assert.equal(slots[0].tokens, 3, 'the first minute: the prompt at its start and the one inside');
  assert.equal(slots[14].tokens, 12, 'the last minute holds now itself');
  assert.equal(slots[14].context, 70, 'the fullest conversation of the minute');
});

test('24 hours: 24 slots on whole hours, whatever the minute now is', () => {
  const { from, to, slots } = promptSlots([], NOW, 24 * 60 * MIN, 24);
  assert.equal(slots.length, 24);
  assert.ok(onClock(from, 60 * MIN) && onClock(to, 60 * MIN), 'on whole hours');
  assert.ok(to > NOW && to - NOW <= 60 * MIN);
  for (const sl of slots) assert.equal(sl.to - sl.from, 60 * MIN);
});
