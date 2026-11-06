import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { setInterval: () => 0, localStorage: { getItem: () => null }, document: { body: { classList: { contains: () => false } } } };
vm.runInNewContext(fs.readFileSync(new URL('../collector/public/prompts.js', import.meta.url), 'utf8'), ctx);
const { promptSlots } = ctx;
const MIN = 60_000, NOW = Date.parse('2026-11-03T12:42:37Z');

test('15 minutes: 15 one-minute slots, the last ending exactly at now', () => {
  const { from, to, slots } = promptSlots([], NOW, 15 * MIN, 15);
  assert.equal(to, NOW); assert.equal(from, NOW - 15 * MIN);
  assert.equal(slots.length, 15);
  assert.equal(slots[0].from, from); assert.equal(slots.at(-1).to, NOW);
  for (const [i, sl] of slots.entries()) { assert.equal(sl.to - sl.from, MIN, `slot ${i} is one minute`); if (i) assert.equal(sl.from, slots[i - 1].to, 'no gaps'); }
});

test('every prompt in the span counts once, nothing outside it does', () => {
  const at = (ago, tokens, context = null) => ({ ts: NOW - ago, tokens, context });
  const ps = [at(15 * MIN + 1, 99), at(15 * MIN, 1, 20), at(14 * MIN + 30_000, 2), at(30_000, 4, 50), at(0, 8, 70), at(-1, 99)];
  const { slots } = promptSlots(ps, NOW, 15 * MIN, 15);
  assert.equal(slots.reduce((a, sl) => a + sl.tokens, 0), 1 + 2 + 4 + 8, 'the one just before and the one after now are left out');
  assert.equal(slots[0].tokens, 3, 'the first minute: the prompt at its start and the one inside');
  assert.equal(slots[14].tokens, 12, 'the last minute holds now itself');
  assert.equal(slots[14].context, 70, 'the fullest conversation of the minute');
});

test('24 hours in hourly slots: exactly 24, whatever the minute now is', () => {
  const { from, slots } = promptSlots([], NOW, 24 * 60 * MIN, 24);
  assert.equal(slots.length, 24); assert.equal(from, NOW - 24 * 60 * MIN); assert.equal(slots.at(-1).to, NOW);
});
