import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { profile, commonFacts } from '../collector/insights-text.js';
import { makeDemo } from '../collector/demo.js';

const person = (o = {}) => ({
  name: 'Alex Morgan', prompts: 200, mix: { run: 55, mcp: 24, web: 10, edit: 6, read: 3, agent: 2 },
  hours: { total: 770, day: 170, evening: 310, night: 90, weekend: 200, outside: 600 },
  runs: { prompts: 200, long: 38, chat: 43, smooth: 170, longest: 110 }, toolsPerPrompt: 11,
  decisions: 2300, rejects: 16, autoApproved: 1 - 16 / 2300, asks: 0, five_pct: null, week_pct: null, flags: [], activeMinutes: 770, ...o,
});

test('a profile reads like a sentence, with the numbers behind every part', () => {
  const p = profile(person());
  assert.equal(p.line, 'evening & weekend operator · long hands-off runs · 99% auto-approved');
  assert.match(p.facts.find((f) => f.key === 'style').evidence, /78% of active time outside 08–19/);
  assert.match(p.facts.find((f) => f.key === 'delegates').evidence, /38 of 200 prompts ran 20\+ steps/);
  const q = profile(person({ hours: { total: 600, day: 560, evening: 30, night: 0, weekend: 10, outside: 40 }, mix: { edit: 70, read: 30 },
    runs: { prompts: 50, long: 1, chat: 30, smooth: 50, longest: 21 }, week_pct: 91, flags: [{ kind: 'stuck', level: 'warn', text: 'Stuck retrying Bash' }] }));
  assert.equal(q.line, 'daytime builder · mostly asks questions · 99% auto-approved · near weekly limit · stuck on a tool');
  assert.equal(profile(person({ prompts: 2 })).line, 'light use this period');
});

test('a trait most of the team shares is said once for the team, not on every line', () => {
  const people = ['Ann', 'Ben', 'Cem'].map((name) => { const p = person({ name }); p.profile = profile(p); return p; });
  const common = commonFacts(people);
  assert.ok(common.has('autoapprove'));
  assert.doesNotMatch(profile(people[0], { common }).line, /auto-approved/);
});


test('demo personas come out as the people they were written to be', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-insights-'));
  const now = Date.parse('2026-10-14T13:00:00Z');
  const demo = makeDemo(path.join(dir, 'demo.db'), { now: () => now });
  try {
    const t = await demo.queries().team({ from: now - 7 * 86400_000, to: now + 60_000 }, 60);
    const line = Object.fromEntries(t.people.map((p) => [p.name, p.profile.line]));
    assert.match(line['Amara Okafor'], /long hands-off runs/, 'Amara delegates big tasks');
    assert.match(line['Jonas Weber'], /operator/, 'Jonas mostly runs commands');
    assert.match(line['Jonas Weber'], /failed steps|stuck|failing/);
    assert.match(line['Tom Becker'], /approves step by step/);
    assert.doesNotMatch(line['Lena Fischer'], /fail|stuck|stopped|limit/, 'steady person: nothing alarming');
    assert.ok(t.headline.activeMinutes > 0 && t.headline.runPrompts > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
