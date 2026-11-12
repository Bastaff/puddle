import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pglite } from './pglite.js';
import { openPgStore } from '../collector/db.js';
import { makeQueries, TOOL_CATEGORY } from '../collector/queries.js';
import { demoHistory } from '../collector/demo.js';
import { asSql } from '../collector/sql.js';

test('each person\'s newest step and newest metric match a plain lookup, with excluded conversations left out', async () => {
  const now = Date.now();
  const { rows, points } = demoHistory({ seed: 11, now: now - 60_000 });
  const pgs = await openPgStore(pglite());
  await pgs.insertEvents(structuredClone(rows));
  await pgs.insertPoints(structuredClone(points));
  const S = pgs.sql, q = makeQueries(S, { now: () => now });
  const members = (await q.filters()).users.map((u) => u.user_key);
  assert.ok(members.length >= 3);

  const newest = (u, names, cols) => S.one(`SELECT ts, id, ${cols} FROM events WHERE user_key = ? AND name IN (${names.map(() => '?').join(', ')}) AND ts >= ?
    ORDER BY ts DESC, id DESC LIMIT 1`, [u, ...names, now - 2 * 86400_000]);
  const check = async () => {
    const team = await q.team({ from: now - 7 * 86400_000, to: now + 60_000, members }, 0);
    for (const u of members) {
      const p = team.people.find((x) => x.user_key === u), ev = await newest(u, ['user_prompt', 'api_request', 'tool_result', 'tool_decision'], 'name');
      const tool = await newest(u, ['tool_result', 'tool_decision'], `tool_name, ${TOOL_CATEGORY} cat`);
      assert.deepEqual([p.now.lastTs, p.now.last], [ev?.ts ?? null, ev?.name ?? null], `newest step for ${u}`);
      assert.deepEqual([p.now.toolTs, p.now.tool, p.now.doing], [tool?.ts ?? null, tool?.tool_name ?? null, tool?.cat ?? null], `newest tool for ${u}`);
    }
    const plain = (await S.one(`SELECT MAX(ts) t FROM metric_points m WHERE m.user_key IN (${members.map(() => '?').join(', ')})
      AND NOT EXISTS (SELECT 1 FROM excluded_sessions xs WHERE xs.session_id = m.session_id)`, members)).t;
    assert.equal((await q.health({ members })).lastMetric, plain);
  };
  await check();

  const top = await S.one(`SELECT session_id FROM metric_points WHERE session_id IS NOT NULL ORDER BY ts DESC LIMIT 1`);
  await S.run(`INSERT INTO excluded_sessions (session_id, reason, added) VALUES (?, 'test', ?)`, [top.session_id, now]);
  await S.run(`INSERT INTO metric_points (ts, name, user_key, session_id, model, type, value, attrs_json) VALUES (?, 'cost.usage', ?, NULL, NULL, NULL, 1, '{}')`, [now - 3 * 86400_000, members[0]]);
  await check();
});

test('the prompts card gives the same answer as the single query it replaced, on Postgres and SQLite', async () => {
  const { openDb } = await import('../collector/db.js');
  const { contextWindow } = await import('../collector/pricing.js');
  const os = await import('node:os'), fs = await import('node:fs'), path = await import('node:path');
  const now = Date.now();
  const { rows } = demoHistory({ seed: 5, now: now - 60_000 });
  const lite = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'joule-prompts-')), 'p.db'));
  const pgs = await openPgStore(pglite());
  lite.insertEvents(structuredClone(rows)); await pgs.insertEvents(structuredClone(rows));
  for (const S of [pgs.sql, lite]) {
    const q = makeQueries(S, { now: () => now }), sql = asSql(S);
    const f = { from: now - 864e5, to: now + 60_000 };
    const old = (await sql.all(`SELECT p.ts, p.user_key, p.agent, p.prompt_length len,
        SUM(COALESCE(a.input_tokens,0) + COALESCE(a.output_tokens,0) + COALESCE(a.cache_read,0) + COALESCE(a.cache_creation,0)) tokens,
        SUM(a.output_tokens) output, MAX(COALESCE(a.input_tokens,0) + COALESCE(a.cache_read,0) + COALESCE(a.cache_creation,0)) ctx,
        MAX(a.model) model, COUNT(a.id) requests, SUM(a.cost_usd) cost, MAX(a.ts) end_ts,
        (SELECT COUNT(*) FROM events t WHERE t.prompt_id = p.prompt_id AND t.name = 'tool_result') steps
      FROM events p LEFT JOIN events a ON a.prompt_id = p.prompt_id AND a.name = 'api_request'
      WHERE p.name = 'user_prompt' AND p.prompt_id IS NOT NULL AND p.ts >= ? AND p.ts < ?
        AND NOT EXISTS (SELECT 1 FROM excluded_sessions xs WHERE xs.session_id = p.session_id)
      GROUP BY p.id, p.ts, p.user_key, p.agent, p.prompt_length, p.prompt_id ORDER BY p.ts, p.id`, [f.from, f.to])).map((r) => {
      const ts = Number(r.ts), win = contextWindow(r.model), ctx = Number(r.ctx) || 0;
      return { ts, user: r.user_key, agent: r.agent, model: r.model || null, tokens: Number(r.tokens) || 0, output: Number(r.output) || 0,
        context: ctx ? Math.min(100, Math.round((ctx / win) * 100)) : null, window: win, requests: Number(r.requests) || 0,
        steps: Number(r.steps) || 0, cost: r.cost == null ? null : Number(r.cost), len: r.len == null ? null : Number(r.len),
        took: r.end_ts ? Math.max(0, Number(r.end_ts) - ts) : 0 };
    });
    const now2 = await q.prompts(f);
    assert.ok(old.length > 20, 'the demo has prompts in the last day');
    assert.deepEqual(now2.map((r) => ({ ...r, cost: r.cost == null ? null : Math.round(r.cost * 1e9) })), old.map((r) => ({ ...r, cost: r.cost == null ? null : Math.round(r.cost * 1e9) })));
  }
});

test('the day table gives the same team page, and late data for a finished day falls back to the exact rows until it is rebuilt', async () => {
  const now = Date.now();
  const { rows, points } = demoHistory({ seed: 9, now: now - 60_000 });
  const pgs = await openPgStore(pglite(), { rollupSync: true });
  await pgs.insertEvents(structuredClone(rows));
  await pgs.insertPoints(structuredClone(points));
  const S = pgs.sql;
  assert.ok(await pgs.rollup.fillDays({ limit: 1e6 }) > 0, 'past days get built');
  const members = (await makeQueries(S, { now: () => now }).filters()).users.map((u) => u.user_key);
  const scope = members.map((account_id) => ({ account_id, all: true, since: 0 }));
  const page = async (fast) => {
    const q = makeQueries(S, { now: () => now, rollup: () => true, fast: () => fast });
    const f = { members, scope, user: null, from: now - 30 * 864e5, to: now + 60_000 };
    const r = JSON.parse(JSON.stringify({ team: await q.team(f, -60, { parts: 'core' }), health: await q.health({ members }) }));
    return JSON.parse(JSON.stringify(r, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v)));
  };
  assert.deepEqual(await page(true), await page(false));
  const day = Math.floor((now - 3 * 864e5) / 864e5) * 864e5 + 3600_000;
  const late = structuredClone(rows.find((r) => r.name === 'tool_result' && r.dedupe));
  const who = (await S.one(`SELECT user_key FROM events WHERE dedupe = ?`, [late.dedupe])).user_key;
  const before = Number((await S.one(`SELECT COUNT(*) n FROM event_day_done WHERE user_key = ? AND day = ?`, [who, day - 3600_000])).n);
  Object.assign(late, { ts: day, dedupe: 'late-' + day, tool_name: 'LateTool' });
  await pgs.insertEvents([late]);
  const after = Number((await S.one(`SELECT COUNT(*) n FROM event_day_done WHERE user_key = ? AND day = ?`, [who, day - 3600_000])).n);
  assert.equal(before, 1); assert.equal(after, 0, 'the late row un-marks its day');
  assert.deepEqual(await page(true), await page(false));
  const pt = structuredClone(points.find((x) => x.name === 'active_time.total' && !x.cumulative) || points[0]);
  const used = Number((await S.one(`SELECT COUNT(*) n FROM metric_quarter`)).n);
  await pgs.insertPoints([{ ...pt, ts: now - 2 * 864e5 + 7 * 60_000, value: 41, cumulative: false }]);
  assert.ok(used > 0 && Number((await S.one(`SELECT COUNT(*) n FROM metric_quarter`)).n) >= used, 'the metric table is filled and kept up to date');
  assert.deepEqual(await page(true), await page(false), 'a new metric point shows the same either way');
  await pgs.rollup.fillDays({ limit: 1e6 });
  assert.deepEqual(await page(true), await page(false), 'and the rebuilt day agrees too');
});
