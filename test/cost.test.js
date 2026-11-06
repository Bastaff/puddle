import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { makeCost } from '../companion/cost.js';
import { setupReport } from '../companion/report.js';

test('the helper counts its own cost: reads of session logs, status line runs, an hourly row kept on the Mac', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-cost-'));
  let t = Date.parse('2026-10-30T10:00:00Z'), st = null;
  const cost = makeCost({ dir, reads: () => st, now: () => t, timers: false });
  try {
    st = { lastRun: t, lastDurationMs: 1200, bytesRead: 40e6, historyBytes: 100e6 };
    cost.sample(); cost.sample();
    st = { ...st, lastRun: t + 30_000, lastDurationMs: 300, bytesRead: 2e6 };
    cost.sample();
    cost.statusLine(); cost.statusLine();
    let s = cost.summary();
    assert.equal(s.reads, 2);
    assert.equal(s.readMb, 42);
    assert.equal(s.worstReadMs, 1200);
    assert.equal(s.historyMb, 100);
    assert.equal(s.statusRuns, 2);
    assert.ok(s.rssMb > 0 && s.cpuPct >= 0);

    t += 3600_000; cost.sample();
    const rows = fs.readFileSync(path.join(dir, 'logs', 'cost.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reads, 2);
    assert.equal(rows[0].statusRuns, 2);
    for (const v of Object.values(rows[0])) assert.equal(typeof v, 'number');

    t += 26 * 3600_000; cost.sample();
    s = cost.summary();
    assert.equal(s.reads, 0);
    assert.equal(s.statusRuns, 0);

    assert.deepEqual(setupReport({ scan: {}, errors: [], cost: s }).cost, s);
  } finally { cost.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a freeze counts only as long as Puddle worked: a sleeping or paused Mac is not a slow one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-cost-'));
  let delayMs = 0, usedMs = 0, slow = 0;
  const loop = { enable() {}, disable() {}, reset() {}, get max() { return delayMs * 1e6; } };
  const cpuUsage = (since) => (since ? { user: usedMs * 1e3, system: 0 } : { user: 0, system: 0 });
  const cost = makeCost({ dir, now: () => Date.parse('2026-11-01T03:00:00Z'), timers: false, loop, cpuUsage, errors: { note: () => slow++ } });
  try {
    delayMs = 1_073_742; usedMs = 500; cost.sample();
    assert.equal(cost.summary().blocks, 0);
    assert.equal(slow, 0);
    delayMs = 3000; usedMs = 3200; cost.sample();
    assert.equal(cost.summary().blocks, 1);
    assert.equal(cost.summary().worstBlockMs, 3000);
    assert.equal(slow, 1);
  } finally { cost.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
