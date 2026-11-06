import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPgStore } from '../collector/db.js';
import { makeQueries } from '../collector/queries.js';
import { demoHistory } from '../collector/demo.js';
import { pglite } from './pglite.js';

const norm = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'now' ? undefined : v)));

test('the team core plus its cards is the whole team answer, for a team and for one person', async () => {
  const now = Date.now(), { rows } = demoHistory({ seed: 5, now: now - 60_000 });
  const pg = pglite(), store = await openPgStore(pg);
  try {
    await store.insertEvents(rows);
    const q = makeQueries(store.sql, { now: () => now });
    const members = [...new Set(rows.map((r) => r.identity.key))];
    const f = { from: now - 7 * 864e5, to: now + 60_000, members, scope: members.map((k) => ({ account_id: k, all: true, since: 0 })), user: null };
    const whole = norm(await q.team(f, 120)), core = norm(await q.team(f, 120, { parts: 'core' }));
    const cal = norm(await q.teamCalendar(f, 120)), lines = norm(await q.teamLines(f, 120));
    assert.deepEqual({ ...core, ...cal, ...lines }, whole, 'team: core + calendar + code changes = the whole answer');
    assert.ok(!('daily' in core) && !('codeLines' in core), 'the core leaves the cards out');
    assert.ok(cal.daily.length && cal.dailyByUser.length, 'the calendar has days, and each person on them');

    const p = members[0], one = { ...f, members: [p], user: null };
    const pWhole = norm(await q.person(f, 120, p)), pCore = norm(await q.person(f, 120, p, { parts: 'core' }));
    const pCal = norm(await q.teamCalendar(one, 120, { byUser: false })), pLines = norm(await q.teamLines(one, 120));
    assert.deepEqual({ ...pCore, daily: pCal.daily, codeLines: pLines.codeLines }, pWhole, 'one person: core + cards = the whole answer');
  } finally { await pg.close(); }
});
