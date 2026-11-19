import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeSaved } from '../companion/saved-answers.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test('saved answers: the first ask waits, later asks get the saved one at once and one rebuild at a time', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-answers-'));
  let v = 0, runs = 0, fresh = 0, release;
  const compute = async (job) => { runs++; if (job.slow) await new Promise((r) => { release = r; }); return { n: runs, v }; };
  const opts = { dir, compute, version: () => v, onFresh: () => { fresh++; }, settleMs: 1, gapMs: 0 };
  const s = makeSaved(opts);
  try {
    const a = await s.get('k', { kind: 'person' });
    assert.equal(JSON.parse(a.body).n, 1);
    assert.equal(a.stale, false);
    assert.equal((await s.get('k', { kind: 'person' })).stale, false, 'nothing changed: the saved answer is current');
    assert.equal(runs, 1);

    v++;
    const b = await s.get('k', { kind: 'person', slow: true });
    assert.equal(b.stale, true, 'after a change the old answer comes back at once');
    assert.equal(JSON.parse(b.body).n, 1);
    await s.get('k', { kind: 'person', slow: true }); await s.get('k', { kind: 'person', slow: true });
    assert.equal(runs, 2, 'three asks while it rebuilds: one rebuild');
    release(); await tick();
    assert.equal(fresh, 1, 'the page is told once the new answer is ready');
    const c = await s.get('k', { kind: 'person' });
    assert.equal(c.stale, false); assert.equal(JSON.parse(c.body).n, 2);

    v++; s.changed(); s.changed(); s.changed(); await tick(30);
    assert.equal(runs, 3, 'new work: the answer someone looked at is rebuilt once, not once per change');
    s.close();

    const again = makeSaved({ ...opts, version: () => 0 });
    const d = await again.get('k', { kind: 'person', slow: true });
    assert.equal(d.stale, true, 'after a restart the saved answer is served from disk at once');
    assert.equal(JSON.parse(d.body).n, 3);
    release(); await tick();
    again.close();
    for (const f of fs.readdirSync(dir)) assert.equal(fs.statSync(path.join(dir, f)).mode & 0o777, 0o600);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('saved answers: an answer older than a week is not shown; it is worked out again first', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-answers-'));
  let t = 0, runs = 0;
  const s = makeSaved({ dir, compute: async () => ({ n: ++runs }), now: () => t });
  try {
    await s.get('k', { kind: 'person' });
    t += 8 * 864e5;
    const e = await s.get('k', { kind: 'person' });
    assert.equal(e.stale, false); assert.equal(JSON.parse(e.body).n, 2);
  } finally { s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
