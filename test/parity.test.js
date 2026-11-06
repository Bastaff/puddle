import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { pglite } from './pglite.js';
import { openDb, openPgStore } from '../collector/db.js';
import { makeQueries } from '../collector/queries.js';
import { demoHistory } from '../collector/demo.js';


const norm = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'now' ? undefined : v)));
function same(a, b, where = '') {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))) return;
    throw new assert.AssertionError({ message: `${where}: ${b} (Postgres) vs ${a} (SQLite)`, actual: b, expected: a });
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== b.length)) assert.deepStrictEqual(b, a, where);
    for (const k of keys) same(a[k], b[k], `${where}.${k}`);
    return;
  }
  assert.deepStrictEqual(b, a, where);
}

test('SQLite and Postgres return the same dashboard for the same data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joule-parity-'));
  const now = Date.now();
  const { rows, points } = demoHistory({ seed: 7, now: now - 60_000 });
  const lite = openDb(path.join(dir, 'p.db'));
  const pg = pglite();
  const pgs = await openPgStore(pg);
  try {
    assert.equal(lite.insertEvents(structuredClone(rows)), await pgs.insertEvents(structuredClone(rows)), 'same number of events stored');
    assert.equal(lite.insertPoints(structuredClone(points)), await pgs.insertPoints(structuredClone(points)), 'same number of metric points');
    assert.equal(lite.insertEvents(structuredClone(rows.slice(0, 50))), await pgs.insertEvents(structuredClone(rows.slice(0, 50))), 'resent batch ignored in both');
    const a = makeQueries(lite, { now: () => now }), b = makeQueries(pgs.sql, { now: () => now });
    const week = { from: now - 7 * 86400_000, to: now + 60_000 };
    const day = { from: now - 86400_000, to: now + 60_000 };
    const cases = {
      'summary 7d': (q) => q.summary(week),
      'summary 1d': (q) => q.summary(day),
      timeseries: (q) => q.timeseries(week),
      'timeseries hourly': (q) => q.timeseries(day),
      models: (q) => q.models(week),
      tools: (q) => q.tools(week),
      users: (q) => q.users(week),
      feed: (q) => q.feed(week, 200),
      insights: (q) => q.insights(week),
      'timeline 15 min, UTC+1': (q) => q.timeline(day, 15, 60),
      'timeline auto, fitted': (q) => q.timeline(week, 0, -300, true),
      'days, UTC+2': (q) => q.days(week, 120),
      'team 7d, UTC+1': (q) => q.team(week, 60),
      'team 1d': (q) => q.team(day, 0),
      'team, two members only': async (q) => q.team({ ...week, members: (await q.filters()).users.slice(0, 2).map((u) => u.user_key) }, 0),
      filters: (q) => q.filters(),
      health: (q) => q.health(),
      export: (q) => q.exportEvents(day),
    };
    for (const [name, run] of Object.entries(cases)) {
      same(norm(await run(a)), norm(await run(b)), name);
    }
    const team = await b.team(week, 60);
    assert.ok(team.people.length >= 8 && team.people.some((p) => p.flags.length), 'demo team with flags');
  } finally {
    lite.close(); await pg.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
