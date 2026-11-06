import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { makeDemo, makeSim, DEMO_PEOPLE } from '../collector/demo.js';

test('demo team: separate database with every person and their way of working', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-demo-'));
  const now = Date.parse('2026-10-14T13:00:00Z');
  const demo = makeDemo(path.join(dir, 'demo.db'), { now: () => now });
  try {
    const q = demo.queries();
    const team = (await q.team({ from: now - 7 * 86400_000, to: now + 60_000 }, 60));
    assert.equal(team.people.length, DEMO_PEOPLE.length);
    const by = Object.fromEntries(team.people.map((p) => [p.name, p]));
    assert.ok(by['Jonas Weber'].mix.run > by['Jonas Weber'].mix.edit, 'Jonas mostly runs commands');
    assert.ok(by['Jonas Weber'].flags.some((f) => f.kind === 'failures'));
    assert.ok(by['Amara Okafor'].autonomy > by['Lena Fischer'].autonomy, 'Amara delegates more');
    assert.ok(by['Sofia Rossi'].flags.some((f) => f.kind === 'quiet' && f.level === 'warn'), 'Sofia stopped');
    assert.ok(by['Yuki Tanaka'].flags.some((f) => f.kind === 'broken'), 'broken connector');
    assert.ok(!by['Ava Martin'].flags.length, 'occasional user is not flagged');
    assert.ok(!by['Lena Fischer'].flags.length, 'steady person is not flagged');
    assert.equal(by['Lena Fischer'].lane.length, 48);
    assert.ok(by['Lena Fischer'].lane.some(Boolean));
    const leaks = (await q.exportEvents({ from: 0, to: now + 60_000 })).filter((e) => e.error && !/^(exit_code|tool_error|overloaded|ShellError|rate_limit_error)$/.test(e.error));
    assert.equal(leaks.length, 0);
  } finally {
    demo.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('demo simulator emits events in real time for people at work', async () => {
  const sim = makeSim(3);
  const t0 = Date.now();
  let n = 0;
  for (let t = t0; t < t0 + 120_000; t += 1000) n += sim.step(t).ev.length;
  assert.ok(n > 20, `expected live events, got ${n}`);
});
