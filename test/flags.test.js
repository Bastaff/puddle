import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../collector/flags.js';
import { evaluate } from '../scripts/flag-eval.js';

const DAY = 86400_000;
const at = (now, daysAgo) => daysAgo.map((d) => now - d * DAY);
const NOW = Date.parse('2026-10-15T15:00:00Z');

test('quiet: regular user who stopped is flagged; weekends, short breaks and occasional users are not', () => {
  const weekdaysBack = (from, to) => { const out = []; for (let d = from; d <= to; d++) { const dow = new Date(NOW - d * DAY).getUTCDay(); if (dow && dow !== 6) out.push(d); } return out; };
  assert.equal(R.quietRule(at(NOW, weekdaysBack(8, 36)), 'Europe/Berlin', NOW)?.kind, 'quiet');
  const MON = Date.parse('2026-10-12T07:00:00Z');
  const friBack = []; for (let d = 3; d <= 31; d++) { const dow = new Date(MON - d * DAY).getUTCDay(); if (dow && dow !== 6) friBack.push(d); }
  assert.equal(R.quietRule(at(MON, friBack), 'Europe/Berlin', MON), null);
  assert.equal(R.quietRule(at(NOW, [9, 16, 17, 23, 30, 31, 37, 44, 45, 51]), 'Europe/Berlin', NOW), null);
  assert.equal(R.quietRule(at(NOW, weekdaysBack(3, 36)), 'Europe/Berlin', NOW), null);
});

test('failures are judged against what is normal for the same tools', () => {
  const ref = (t) => ({ Bash: 0.08, Read: 0.02 }[t] ?? 0.05);
  assert.deepEqual(R.failureRules([{ tool: 'Bash', calls: 100, fails: 12 }], ref), []);
  assert.equal(R.failureRules([{ tool: 'Bash', calls: 100, fails: 30 }], ref)[0].kind, 'failures');
  assert.deepEqual(R.failureRules([{ tool: 'Bash', calls: 10, fails: 4 }], ref), []);
  const out = R.failureRules([{ tool: 'mcp__slack__search', calls: 10, fails: 8 }, { tool: 'mcp__slack__post', calls: 6, fails: 5 }, { tool: 'Read', calls: 80, fails: 1 }], ref);
  assert.deepEqual(out.map((f) => f.kind), ['broken']);
  assert.match(out[0].text, /slack connector failed 13 of 16 tries: probably a setup problem/);
});

test('other rules need clear evidence', () => {
  assert.equal(R.stuckRule([{ tool: 'Bash', length: 5 }]), null, 'one stuck prompt is not a pattern');
  assert.equal(R.stuckRule([{ tool: 'Bash', length: 5 }, { tool: 'Bash', length: 4 }]).kind, 'stuck');
  assert.equal(R.hookRule([{ name: 'SessionStart:startup', runs: 2, errors: 2 }]), null);
  assert.equal(R.hookRule([{ name: 'SessionStart:startup', runs: 4, errors: 4 }]).kind, 'hook');
  assert.deepEqual(R.apiErrorRule({ 529: 40 }, 500), [], 'overloaded errors are on Anthropic’s side');
  assert.equal(R.apiErrorRule({ 429: 6 }, 2000)[0].kind, 'ratelimit');
  assert.equal(R.contextRule(3, 20), null, 'occasional compaction is normal');
  assert.equal(R.contextRule(12, 10).kind, 'context');
  assert.equal(R.frictionRule(20, [{ tool: 'Bash', n: 30 }]), null);
  assert.equal(R.frictionRule(20, [{ tool: 'Bash', n: 60 }]).kind, 'friction');
  assert.equal(R.rejectRule(40, 5), null);
  assert.equal(R.versionRule('2.1.290', '2.1.295', 3), null, 'a few patches behind is fine');
  assert.equal(R.versionRule('2.1.271', '2.1.295', 3).kind, 'version');
  assert.equal(R.versionRule('2.1.271', '2.1.295', 1), null, 'needs a team to compare with');
  assert.equal(R.heavyRule({ prompts: 20, tokens: 2e6 }, { prompts: 100, tokens: 6e6 }), null);
});

test('precision on synthetic teams with planted problems and decoys is at least 90%', async () => {
  const r = await evaluate(1, [7]);
  assert.ok(r.precision >= 0.9, `precision ${r.precision}: ${r.falseAlarms.join('; ')}`);
  assert.ok(r.recall >= 0.9, `recall ${r.recall}`);
});

test('"Needs a look" reads plainly: no symbols, no "their", works on Me and for a teammate', async () => {
  const R = await import('../collector/flags.js');
  const texts = [
    R.heavyRule({ prompts: 20, tokens: 20 * 420_000 }, { prompts: 40, tokens: 40 * 71_000 })?.text,
    R.limitRule(97, 40, { five_reset: Date.now() + 3600_000 }, 120)?.text,
    R.limitRule(85, 90)?.text,
    R.rejectRule(20, 8)?.text, R.contextRule(5, 3)?.text, R.versionRule('2.1.0', '2.2.4', 3)?.text,
    ...R.apiErrorRule({ 429: 7, 401: 2, 403: 1 }, 100).map((x) => x.text),
    R.frictionRule(20, [{ tool: 'Bash', n: 60 }])?.text,
  ].filter(Boolean);
  assert.equal(texts.length, 9);
  for (const t of texts) { assert.doesNotMatch(t, /×|\btheir\b|—/, t); }
  assert.match(texts[0], /^Prompts got much bigger: 5\.9 times the usual tokens each \(420K vs 71K\)$/);
  assert.match(texts[1], /^Plan almost used up: 97% \(resets (tomorrow )?\d\d:\d\d\)$/);
  assert.equal(texts[2], 'Plan almost used up: 90%');
});
