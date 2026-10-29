// The summary table (collector/rollup.js) must never change a number: every card read through it equals the same
// card read from the events alone, on Postgres and SQLite, for ranges that cut quarter hours in half; and it stays
// right however events arrive (resent, filled in later, replaced, out of order).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, openPgStore } from '../collector/db.js';
import { makeQueries } from '../collector/queries.js';
import { demoHistory } from '../collector/demo.js';
import { ROLLUP_COLS, PROMPT_COLS } from '../collector/rollup.js';
import { eventRow } from '../collector/otlp.js';
import { pglite } from './pglite.js';

const NOW = Date.parse('2026-10-16T15:07:31Z');
// numbers to a millionth (an average may be summed in another order), the clock left out
const norm = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'now' ? undefined : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)));
const stores = {
  async pg() { const pg = pglite(); const s = await openPgStore(pg, { rollupSync: true }); return { store: s, db: s.sql, close: () => pg.close() }; },
  async sqlite() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joule-rollup-')); const s = openDb(path.join(dir, 'r.db'), { rollup: true }); return { store: s, db: s.db, close: () => { s.close(); fs.rmSync(dir, { recursive: true, force: true }); } }; },
};
const everything = async (q, f, members) => ({
  team: await q.team(f, 330), // +5:30: a half-hour time zone
  person: await q.person(f, 330, members[1]),
  calendar: await q.teamCalendar(f, -240),
  timeseries: await q.timeseries(f), tools: await q.tools(f), health: await q.health(f),
});

for (const kind of ['pg', 'sqlite']) {
  test(`${kind}: every card is the same with the summary as from the events alone`, async () => {
    const { store, db, close } = await stores[kind]();
    try {
      const { rows } = demoHistory({ seed: 21, now: NOW - 60_000 });
      for (let i = 0; i < rows.length; i += 500) await store.insertEvents(rows.slice(i, i + 500));
      const members = [...new Set(rows.map((r) => r.identity.key))];
      const raw = makeQueries(db, { now: () => NOW }), sum = makeQueries(db, { now: () => NOW, rollup: () => true });
      for (const [days, cut] of [[1, 123_457], [7, 61_001], [30, 0]]) {
        const f = { from: NOW - days * 864e5 + cut, to: NOW + 60_000, members, scope: members.map((k) => ({ account_id: k, all: true, since: 0 })), user: null };
        assert.deepEqual(norm(await everything(sum, f, members)), norm(await everything(raw, f, members)), `${days} days`);
      }
      // a team that only sees one person's work account (account-based share): the summary filters the same way
      const orgs = [{ account_id: members[0], orgs: ['org-x'], since: 0 }, { account_id: members[1], all: true, since: 0 }];
      const g = { from: NOW - 7 * 864e5, to: NOW + 60_000, members: members.slice(0, 2), scope: orgs, user: null };
      assert.deepEqual(norm(await sum.team(g, 0)), norm(await raw.team(g, 0)), 'account-based share');
    } finally { await close(); }
  });

  test(`${kind}: the summary stays right however events arrive`, async () => {
    const { store, db, close } = await stores[kind]();
    const q1 = (sql) => (kind === 'pg' ? db.all(sql) : db.prepare(sql).all());
    const dump = async () => norm({ rollup: await q1(`SELECT ${ROLLUP_COLS.join(', ')} FROM event_rollup ORDER BY ${ROLLUP_COLS.join(', ')}`),
      runs: await q1(`SELECT user_key, session_id, org, start_ts, end_ts, n FROM active_run ORDER BY session_id, org, start_ts`),
      prompts: await q1(`SELECT ${PROMPT_COLS.join(', ')} FROM prompt_rollup ORDER BY ${PROMPT_COLS.join(', ')}`) });
    const rebuilt = async () => {
      if (kind === 'pg') { const { rebuildRollup } = await import('../collector/rollup.js'); await rebuildRollup(db); }
      else { const { sqliteRollup } = await import('../collector/rollup.js'); const { sqliteSql } = await import('../collector/sql.js'); sqliteRollup(db, sqliteSql(db)).rebuild(); }
      return dump();
    };
    try {
      const at = (min) => NOW - min * 60_000;
      const ev = (name, ts, a, dedupe) => ({ ...eventRow(name, ts, { 'user.account_uuid': 'u1', 'session.id': 's1', ...a }), dedupe });
      // out of order: the later quarter hour first, then the earlier one
      await store.insertEvents([ev('user_prompt', at(10), { 'prompt.id': 'p2', prompt_length: 5 }, 'up:p2')]);
      await store.insertEvents([ev('user_prompt', at(50), { 'prompt.id': 'p1', prompt_length: 7 }, 'up:p1'),
        ev('api_request', at(49), { 'prompt.id': 'p1', model: 'm', input_tokens: 100, effort: 'high' }, 'api:r1')]);
      const before = await dump();
      assert.deepEqual(before, await rebuilt(), 'built as it went = built from scratch');
      // a resend: nothing changes
      assert.equal(await store.insertEvents([ev('user_prompt', at(10), { 'prompt.id': 'p2', prompt_length: 5 }, 'up:p2')]), 0);
      assert.deepEqual(await dump(), before, 'a resend changes nothing');
      // a detail filled in later (the work account): the summary's row moves to that account
      await store.insertEvents([ev('api_request', at(49), { 'prompt.id': 'p1', model: 'm', input_tokens: 100, effort: 'high', 'context.org': 'org-x' }, 'api:r1')]);
      const filled = await dump();
      assert.ok(filled.rollup.some((r) => r.name === 'api_request' && r.org === 'org-x'), 'the account is in the summary');
      assert.ok(filled.runs.length >= 1, 'active runs are kept too');
      assert.deepEqual(filled, await rebuilt(), 'filled in = built from scratch');
      if (kind === 'sqlite') {
        // a Mac's history copy replaced by telemetry with a different time (another quarter hour): both are recomputed
        const db2 = db;
        db2.prepare(`UPDATE events SET source = 'transcript' WHERE dedupe = 'up:p1'`).run();
        await store.insertEvents([ev('user_prompt', at(20), { 'prompt.id': 'p1', prompt_length: 7 }, 'up:p1')]);
        assert.deepEqual(await dump(), await rebuilt(), 'replaced and moved = built from scratch');
      }
    } finally { await close(); }
  });
}

// After new steps only a conversation's end is worked out again (a long conversation recomputed whole took seconds per
// batch and kept production's database busy, 21 Oct 2026): the runs come out exactly as a full recompute makes them,
// however events arrive (in order, late, out of order, two work accounts interleaving).
for (const kind of ['pg', 'sqlite']) {
  test(`${kind}: active time from a conversation's end only equals a full recompute, however steps arrive`, async () => {
    const { store, db, close } = await stores[kind]();
    try {
      const S = kind === 'pg' ? db : null;
      let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      // two long conversations; steps a few seconds to many minutes apart; one switches work account now and then
      const rows = [];
      for (const sid of ['long-a', 'long-b']) {
        let t = NOW - 30 * 3600_000;
        for (let i = 0; i < 900; i++) {
          t += rnd() < 0.08 ? 6 * 60_000 + rnd() * 3600_000 : rnd() * 200_000;
          const org = sid === 'long-b' && rnd() < 0.2 ? 'org-2' : 'org-1';
          rows.push(eventRow(['user_prompt', 'api_request', 'tool_result'][i % 3], Math.round(t), { 'user.account_uuid': 'u1', 'session.id': sid, 'prompt.id': `p${Math.floor(i / 9)}`, 'organization.id': org, request_id: `${sid}-${i}`, tool_use_id: `${sid}-tu${i}` }));
        }
      }
      // arrival: mostly in order in small batches, some late and out of order
      const late = rows.filter(() => rnd() < 0.1), early = rows.filter((r) => !late.includes(r));
      for (let i = 0; i < early.length; i += 7) await store.insertEvents(early.slice(i, i + 7));
      for (let i = 0; i < late.length; i += 3) await store.insertEvents(late.slice(i, i + 3).reverse());
      const runsNow = async () => (kind === 'pg' ? await S.all(`SELECT session_id, org, start_ts, end_ts, n FROM active_run ORDER BY 1, 2, 3`) : db.prepare(`SELECT session_id, org, start_ts, end_ts, n FROM active_run ORDER BY 1, 2, 3`).all()).map((r) => [r.session_id, r.org, Number(r.start_ts), Number(r.end_ts), Number(r.n)]);
      const incremental = await runsNow();
      if (kind === 'pg') { const { rebuildRollup } = await import('../collector/rollup.js'); await rebuildRollup(S); } else store.rollup?.rebuild ? store.rollup.rebuild() : db.exec('DELETE FROM active_run');
      const full = kind === 'pg' ? await runsNow() : incremental; // SQLite: the comparison below re-derives from the events
      if (kind === 'sqlite') {
        const { sqliteRollup } = await import('../collector/rollup.js'); const { sqliteSql } = await import('../collector/sql.js');
        sqliteRollup(db, sqliteSql(db)).rebuild();
        assert.deepEqual(await runsNow(), incremental, 'the same runs as from all the steps at once');
      } else assert.deepEqual(incremental, full, 'the same runs as from all the steps at once');
      assert.ok(incremental.length > 20, `many runs (${incremental.length})`);
    } finally { await close(); }
  });
}
