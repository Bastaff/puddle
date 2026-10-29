import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { parseLogs, parseMetrics, cumulativeDelta } from '../collector/otlp.js';
import { openDb } from '../collector/db.js';
import { makeQueries } from '../collector/queries.js';

const s = (key, v) => ({ key, value: { stringValue: String(v) } });
const ident = [s('user.email', 'me@example.com'), s('user.account_uuid', 'acc-1'), s('organization.id', 'org-1'), s('session.id', 'sess-1')];
const now = BigInt(Date.now()) * 1000000n;

const logs = {
  resourceLogs: [{
    resource: { attributes: [s('service.name', 'claude-code'), s('service.version', '2.1.296')] },
    scopeLogs: [{ logRecords: [
      { timeUnixNano: String(now), body: { stringValue: 'claude_code.api_request' }, attributes: [...ident,
        s('event.name', 'api_request'), s('event.sequence', 1), s('model', 'claude-opus-5-5'),
        s('input_tokens', 100), s('output_tokens', 50), s('cache_read_tokens', 1000), s('cache_creation_tokens', 10),
        s('cost_usd', 0.0123), s('duration_ms', 900)] },
      { timeUnixNano: String(now), body: { stringValue: 'claude_code.tool_result' }, attributes: [...ident,
        s('event.name', 'tool_result'), s('event.sequence', 2), s('tool_name', 'Bash'), s('success', 'false'), s('duration_ms', 42)] },
      { timeUnixNano: String(now), body: { stringValue: 'claude_code.user_prompt' }, attributes: [...ident,
        s('event.name', 'user_prompt'), s('event.sequence', 3), s('prompt_length', 37), s('prompt', 'secret text'), s('prompt_text', 'secret text')] },
    ] }],
  }],
};

const metric = (value, start = '1') => ({
  resourceMetrics: [{ resource: { attributes: [] }, scopeMetrics: [{ metrics: [{
    name: 'claude_code.active_time.total', unit: 's',
    sum: { aggregationTemporality: 2, isMonotonic: true, dataPoints: [{
      attributes: [...ident, s('type', 'user')], startTimeUnixNano: start, timeUnixNano: String(now), asDouble: value }] },
  }] }] }],
});

test('parses events with identity and never keeps prompt text', async () => {
  const rows = parseLogs(logs);
  assert.equal(rows.length, 3);
  const api = rows.find((r) => r.name === 'api_request');
  assert.equal(api.identity.email, 'me@example.com');
  assert.equal(api.identity.key, 'acc-1');
  assert.equal(api.cost_usd, 0.0123);
  assert.equal(api.cache_read, 1000);
  const tool = rows.find((r) => r.name === 'tool_result');
  assert.equal(tool.success, 0);
  const p = rows.find((r) => r.name === 'user_prompt');
  assert.equal(p.prompt_length, 37);
  assert.equal(JSON.stringify(p).includes('secret text'), false);
});

test('raw archive is scrubbed of prompt text', async () => {
  const { scrubPayload } = await import('../collector/otlp.js');
  assert.equal(JSON.stringify(scrubPayload(structuredClone(logs))).includes('secret text'), false);
});

test('cumulative delta handles growth and resets', async () => {
  assert.equal(cumulativeDelta(null, { cumulative: true, value: 5, start_ns: '1' }), 5);
  assert.equal(cumulativeDelta({ start_ns: '1', value: 5 }, { cumulative: true, value: 8, start_ns: '1' }), 3);
  assert.equal(cumulativeDelta({ start_ns: '1', value: 8 }, { cumulative: true, value: 2, start_ns: '2' }), 2);
  assert.equal(cumulativeDelta({ start_ns: '1', value: 8 }, { cumulative: false, value: 4, start_ns: '1' }), 4);
});

test('store dedupes events and turns cumulative metrics into deltas', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-'));
  const store = openDb(path.join(dir, 'u.db'));
  assert.equal(store.insertEvents(parseLogs(logs)), 3);
  const snapshot = () => JSON.stringify(store.db.prepare(`SELECT dedupe, ts, name, input_tokens, output_tokens, attrs_json FROM events ORDER BY dedupe`).all());
  const before = snapshot();
  store.insertEvents(parseLogs(logs));
  assert.equal(snapshot(), before, 'a resent batch changes nothing stored (and adds no duplicates)');
  // a resent event with a detail the first copy lacked: the detail is filled in, nothing else changes
  const more = parseLogs(logs); more[0].attrs = { ...more[0].attrs, effort: 'high' };
  store.insertEvents(more);
  const row = store.db.prepare(`SELECT attrs_json FROM events WHERE dedupe = ?`).get(more[0].dedupe);
  assert.equal(JSON.parse(row.attrs_json).effort, 'high');
  store.insertPoints(parseMetrics(metric(10)));
  store.insertPoints(parseMetrics(metric(25)));
  store.insertPoints(parseMetrics(metric(25))); // no change -> no row
  const q = makeQueries(store.db);
  const f = { from: 0, to: Date.now() + 60_000 };
  const sum = (await q.summary(f));
  assert.equal(sum.activeSeconds.user, 25);
  assert.equal(sum.cost, 0.0123);
  assert.equal(sum.tokens.cacheRead, 1000);
  assert.equal(sum.prompts, 1);
  assert.equal(sum.toolFailures, 1);
  assert.equal((await q.users(f))[0].email, 'me@example.com');
  assert.equal((await q.tools(f))[0].tool, 'Bash');
  store.close();
});

test('timeline buckets align to the local clock at any precision', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-tl-'));
  const store = openDb(path.join(dir, 'u.db'));
  const at = Date.UTC(2026, 0, 1, 10, 7, 30); // 10:07:30 UTC
  const ev = (name, ts, extra = []) => ({ timeUnixNano: String(BigInt(ts) * 1000000n), attributes: [...ident, s('event.name', name), s('event.sequence', ts), ...extra] });
  store.insertEvents(parseLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [
    ev('api_request', at, [s('request_id', 'r1'), s('input_tokens', 10), s('cost_usd', 0.5)]),
    ev('api_request', at + 9 * 60_000, [s('request_id', 'r2'), s('input_tokens', 5), s('cost_usd', 0.25)]),
    ev('user_prompt', at, [s('prompt.id', 'p1'), s('prompt_length', 5)]),
  ] }] }] }));
  const q = makeQueries(store.db);
  const f = { from: at - 3600_000, to: at + 3600_000 };
  const m15 = (await q.timeline(f, 15, 90)); // UTC+1:30
  assert.equal(m15.bucketMs, 15 * 60_000);
  assert.equal(m15.buckets.length, 2, '10:07 and 10:16 UTC fall in different 15-min buckets of a +1:30 clock (11:37 / 11:46)');
  assert.equal(new Date(m15.buckets[0].t + 90 * 60_000).getUTCMinutes() % 15, 0, 'bucket starts on a local quarter hour');
  const m1 = (await q.timeline(f, 1, 0));
  assert.equal(m1.buckets.reduce((a, b) => a + b.input, 0), 15);
  assert.equal(m1.events.length, 1);
  assert.equal(m1.sessions.length, 1);
  store.close();
});

test('timeline auto-fit frames the active part of a mostly empty window', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-fit-'));
  const store = openDb(path.join(dir, 'u.db'));
  const to = Date.UTC(2026, 0, 1, 20, 0), from = to - 20 * 3600_000; // 20h window, activity only in the last hour
  store.insertEvents(parseLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ timeUnixNano: String(BigInt(to - 3600_000) * 1000000n), attributes: [...ident, s('event.name', 'user_prompt'), s('prompt.id', 'p'), s('prompt_length', 3)] }] }] }] }));
  const q = makeQueries(store.db);
  const r = (await q.timeline({ from, to }, 0, 0, true));
  assert.equal(r.fitted, true);
  assert.ok(r.from > from && r.from < to - 3600_000, 'starts a little before the first activity');
  assert.ok(r.bucketMs <= 2 * 60_000, `fine bars for a ~70 min window (got ${r.bucketMs / 60000} min)`);
  assert.equal((await q.timeline({ from, to }, 0, 0, false)).fitted, false);
  store.close();
});

test('days groups activity by the local calendar day', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-days-'));
  const store = openDb(path.join(dir, 'u.db'));
  const late = Date.UTC(2026, 0, 1, 23, 30); // 23:30 UTC = 00:30 next day in UTC+1
  const ev = (ts, id) => ({ timeUnixNano: String(BigInt(ts) * 1000000n), attributes: [...ident, s('event.name', 'user_prompt'), s('prompt.id', id), s('prompt_length', 4)] });
  store.insertEvents(parseLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [ev(late, 'a'), ev(late - 3 * 3600_000, 'b')] }] }] }));
  const q = makeQueries(store.db);
  const f = { from: late - DAY_MS, to: late + 1000 };
  assert.deepEqual((await q.days(f, 0)).map((d) => [d.day, d.prompts]), [['2026-01-01', 2]]);
  assert.deepEqual((await q.days(f, 60)).map((d) => [d.day, d.prompts]), [['2026-01-01', 1], ['2026-01-02', 1]]);
  store.close();
});
const DAY_MS = 86400_000;

test('team privacy: tool inputs, commands and paths are never stored', async () => {
  const rows = parseLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ timeUnixNano: String(now), attributes: [...ident,
    s('event.name', 'tool_result'), s('tool_name', 'Bash'), s('success', 'false'), s('tool_use_id', 't1'),
    s('tool_input', '{"command":"cat ~/secret.txt"}'), s('tool_parameters', '{"full_command":"cat ~/secret.txt"}'),
    s('error', 'cat: /Users/x/secret.txt: denied'), s('error_type', 'ShellError')] }] }] }] });
  const json = JSON.stringify(rows);
  assert.equal(json.includes('secret'), false);
  assert.equal(rows[0].tool_name, 'Bash');
  assert.equal(rows[0].success, 0);
  assert.equal(rows[0].error, 'ShellError');
});

test('excluded sessions (self-tests) are left out of every view', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-ex-'));
  const store = openDb(path.join(dir, 'u.db'));
  store.insertEvents(parseLogs(logs));
  const q = makeQueries(store.db);
  const f = { from: 0, to: Date.now() + 60_000 };
  assert.equal((await q.summary(f)).prompts, 1);
  store.db.prepare(`INSERT INTO excluded_sessions VALUES ('sess-1', 'self-test', 0)`).run();
  assert.equal((await q.summary(f)).prompts, 0);
  assert.equal((await q.team(f)).headline.prompts, 0);
  store.close();
});
