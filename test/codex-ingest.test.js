import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLogs, eventRow } from '../collector/otlp.js';
import { parseRollout } from '../collector/codex-backfill.js';
import { openPgStore } from '../collector/db.js';
import { makeQueries, RUNS_PROJECT } from '../collector/queries.js';
import { pglite } from './pglite.js';

const load = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const rowsOf = (reqs) => { const out = []; let ignored = 0; for (const b of reqs) { const r = parseLogs(b); ignored += r.ignored || 0; out.push(...r); } return Object.assign(out, { ignored }); };
const HELLO = '01a15ebe-69a7-71b0-91e3-22e5f15f690c';

test('Codex in the terminal: one prompt, one priced call (the warm-up is no call), no log line stored', () => {
  const rows = rowsOf(load('codex-live-exec.json'));
  assert.equal(rows.ignored, 1, '"flushing OTEL metrics" is not an event');
  assert.ok(!rows.some((r) => /flushing/.test(r.name)));
  assert.equal(rows.filter((r) => r.name === 'user_prompt').length, 1);
  const calls = rows.filter((r) => r.name === 'api_request');
  assert.equal(calls.length, 1, 'two completed responses, the first a warm-up (2 tokens in, none out)');
  assert.ok(calls[0].cost_usd > 0, 'priced at gpt-6-luna list price');
  assert.ok(rows.every((r) => r.agent === 'codex' || r.name === 'session_start'));
  assert.equal(rows.find((r) => r.session?.entrypoint)?.session.entrypoint, 'codex_exec');
});

test('the Codex app: "Codex_Desktop" is the Codex app, and its own background conversation is told apart', () => {
  const rows = rowsOf(load('codex-live-desktop.json'));
  const starts = rows.filter((r) => r.name === 'session_start');
  const app = (sid) => starts.find((r) => r.session.session_id.endsWith(sid))?.session.entrypoint;
  assert.equal(app('5f690c'), 'Codex Desktop', 'the conversation someone typed in');
  assert.equal(app('b8fc1f'), 'codex_background', 'started by the app itself: read-only, asks no one');
  assert.ok(rows.filter((r) => r.name !== 'session_start' && r.session?.entrypoint).every((r) => r.session.entrypoint === 'Codex Desktop'), 'one spelling');
  assert.equal(rows.filter((r) => r.name === 'api_request').length, 2, 'a call per conversation, warm-ups dropped');
});

test('stored: calls on their prompt at once, and the conversation sent live and from Codex\'s files counted once', async () => {
  const pg = pglite(), store = await openPgStore(pg, { rollupSync: true });
  try {
    const live = rowsOf(load('codex-live-desktop.json'));
    await store.insertEvents(live);
    const x = parseRollout(fs.readFileSync(new URL('./fixtures/codex-history-desktop.jsonl', import.meta.url), 'utf8'));
    const who = { 'user.email': 'dev@example.test', agent: 'codex', 'session.id': HELLO, 'app.entrypoint': 'Codex Desktop', recovered_from: 'codex log' };
    const hist = [...x.prompts.map((p) => eventRow('user_prompt', p.ts, { ...who, 'prompt.id': p.id, prompt_length: p.length })),
      ...x.reqs.map((q) => eventRow('api_request', q.ts, { ...who, 'prompt.id': q.prompt_id, model: q.model, input_tokens: q.input, output_tokens: q.output, cache_read_tokens: q.cached, cache_creation_tokens: q.cacheWrite }))];
    await store.insertEvents(hist);
    const n = async (name, sid = HELLO) => Number((await store.sql.one(`SELECT COUNT(*) n FROM events WHERE name = ? AND session_id = ?`, [name, sid])).n);
    assert.equal(await n('user_prompt'), 1, 'one prompt, not one per copy');
    assert.equal(await n('api_request'), 1, 'one call, not one per copy');
    const calls = await store.sql.all(`SELECT e.prompt_id, e.cost_usd, s.entrypoint FROM events e JOIN sessions s ON s.session_id = e.session_id WHERE e.name = 'api_request'`);
    assert.ok(calls.every((c) => c.prompt_id), 'every call on its prompt, as it arrived');
    assert.ok(calls.every((c) => Number(c.cost_usd) > 0), 'every call priced');
    assert.deepEqual([...new Set(calls.map((c) => c.entrypoint))].sort(), ['Codex Desktop', 'codex_background'], 'background stays background');
    assert.equal(await store.rollup.fillPrompts(), 0, 'nothing left for the hourly job');
  } finally { await pg.close(); }
});

test('projects: scripted and background runs are one group, a folder named like an id is no project', async () => {
  const pg = pglite(), store = await openPgStore(pg, { rollupSync: true });
  try {
    await store.sql.exec(`CREATE TABLE IF NOT EXISTS session_contexts (session_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, agent TEXT, repo TEXT, folder TEXT, source TEXT, ts BIGINT NOT NULL, title TEXT)`);
    const t = Date.now() - 600_000, who = { 'user.account_uuid': 'u1', agent: 'codex' };
    const rows = [];
    const conv = (sid, entry, i) => rows.push(eventRow('user_prompt', t + i * 1000, { ...who, 'session.id': sid, 'app.entrypoint': entry, 'prompt.id': `p-${sid}`, prompt_length: 5 }));
    conv('e1', 'codex_exec', 0); conv('e2', 'codex_exec', 1); conv('bg', 'codex_background', 2); conv('app', 'Codex Desktop', 3); conv('tmp', 'Codex Desktop', 4);
    await store.insertEvents(rows);
    for (const [sid, repo, folder] of [['e1', null, 'a3f0c2e1-0b7d-4c8e-9d11-5b2a7e6f9c01'], ['e2', null, 'run-two'], ['bg', null, 'Documents'], ['app', 'github.com/acme/web', 'web'], ['tmp', null, '01a15ebe69a771b091e322e5f15f690c']])
      await store.sql.run(`INSERT INTO session_contexts (session_id, account_id, agent, repo, folder, source, ts) VALUES (?, 'u1', 'codex', ?, ?, 'app', ?)`, [sid, repo, folder, t]);
    const q = makeQueries(store.sql, { now: () => Date.now(), rollup: () => true });
    const sp = await q.sessionProjects({ from: t - 3600_000, to: Date.now() + 60_000, members: ['u1'], scope: [{ account_id: 'u1', all: true, since: 0 }] });
    const names = Object.fromEntries(sp.map((r) => [r.session_id, r.repo || r.folder]));
    assert.deepEqual(names, { e1: RUNS_PROJECT, e2: RUNS_PROJECT, bg: RUNS_PROJECT, app: 'github.com/acme/web' }, 'the id-named scratch folder is no project');
  } finally { await pg.close(); }
});

test('data stored before Puddle knew better heals itself: Codex calls get their price, one name per app', async () => {
  const pg = pglite(), store = await openPgStore(pg, { rollupSync: true });
  try {
    const t = Date.now() - 600_000, who = { 'user.account_uuid': 'u1', agent: 'codex', 'session.id': 'old' };
    await store.insertEvents([eventRow('api_request', t, { ...who, model: 'gpt-6-luna', input_tokens: 200_000, output_tokens: 0 }),
      eventRow('api_request', t + 9000, { ...who, model: 'codex-auto-review', input_tokens: 10, output_tokens: 1 })]);
    await store.sql.run(`UPDATE events SET cost_usd = NULL`);
    await store.sql.run(`UPDATE sessions SET entrypoint = 'Codex_Desktop'`);
    assert.equal(await store.rollup.fillCosts({ step: 1, pause: 0 }), 1, 'the priced model only');
    const costs = (await store.sql.all(`SELECT model, cost_usd FROM events ORDER BY ts`)).map((r) => [r.model, r.cost_usd == null ? null : Number(r.cost_usd)]);
    assert.deepEqual(costs, [['gpt-6-luna', 0.02], ['codex-auto-review', null]], '$0.10 per million input (under 272K: no long-context rate); no published price stays unknown, never $0');
    assert.ok(Number((await store.sql.one(`SELECT SUM(cost) c FROM event_rollup`)).c) > 0.019, 'the summaries follow');
    await store.rollup.fixClientNames();
    assert.equal((await store.sql.one(`SELECT entrypoint FROM sessions`)).entrypoint, 'Codex Desktop');
  } finally { await pg.close(); }
});

test('who is running what right now: each live conversation\'s agent and app, in the team row and the live feed', async () => {
  const pg = pglite(), store = await openPgStore(pg, { rollupSync: true });
  try {
    const t = Date.now() - 60_000, rows = [];
    const ev = (sid, agent, entry, k) => eventRow('api_request', t + k * 1000, { 'user.account_uuid': 'u1', 'session.id': sid, agent, 'app.entrypoint': entry, model: 'm', input_tokens: 1, output_tokens: 1, request_id: `${sid}-${k}` });
    rows.push(ev('c1', 'claude-code', 'cli', 0), ev('c2', 'claude-code', 'cli', 1), ev('v1', 'claude-code', 'claude-vscode', 2), ev('x1', 'codex', 'Codex_Desktop', 3));
    rows.push(eventRow('api_request', Date.now() - 3600_000, { 'user.account_uuid': 'u1', 'session.id': 'old', agent: 'codex', 'app.entrypoint': 'codex-tui', model: 'm', request_id: 'old-1' }));
    await store.insertEvents(rows);
    const q = makeQueries(store.sql, { now: () => Date.now(), rollup: () => true });
    const team = await q.team({ from: Date.now() - 864e5, to: Date.now() + 60_000, members: ['u1'], scope: [{ account_id: 'u1', all: true, since: 0 }], user: null }, 0, { parts: 'core' });
    const now = team.people[0].now.sessions.map((x) => [x.id, x.agent, x.client]).sort();
    assert.deepEqual(now, [['c1', 'claude-code', 'cli'], ['c2', 'claude-code', 'cli'], ['v1', 'claude-code', 'claude-vscode'], ['x1', 'codex', 'Codex Desktop']], 'three Claude Codes and a Codex, one app name each');
    const feed = await q.feed({ from: t - 1, to: Date.now() + 60_000, members: ['u1'], user: null });
    assert.ok(feed.every((r) => r.agent && r.client), 'live rows say which agent and app');
  } finally { await pg.close(); }
});
