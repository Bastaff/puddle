import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { parseLogs, scrubPayload } from '../collector/otlp.js';
import { openDb } from '../collector/db.js';
import { makeQueries } from '../collector/queries.js';

const s = (key, v) => ({ key, value: { stringValue: String(v) } });
const common = [s('conversation.id', 'conv-1'), s('app.version', '0.159.2'), s('auth_mode', 'Chatgpt'), s('originator', 'codex_exec'),
  s('user.account_id', 'ws-acme'), s('user.email', 'dev@example.com'), s('terminal.type', 'xterm'), s('model', 'gpt-6-luna')];
const rec = (name, attrs, t = Date.now()) => ({ timeUnixNano: String(BigInt(t) * 1000000n), body: { stringValue: name },
  attributes: [s('event.name', name), s('event.timestamp', new Date(t).toISOString()), ...common, ...attrs] });
const payload = () => ({ resourceLogs: [{ resource: { attributes: [s('service.name', 'codex_exec')] }, scopeLogs: [{ logRecords: [
  rec('codex.startup_phase', [s('phase', 'auth')]),
  rec('codex.conversation_starts', [s('reasoning_effort', 'medium'), s('context_window', 258400)]),
  rec('codex.user_prompt', [s('prompt_length', 42), s('prompt', 'secret prompt text')]),
  rec('codex.sse_event', [s('event.kind', 'response.created')]),
  rec('codex.sse_event', [s('event.kind', 'response.completed'), s('input_token_count', 1200), s('cached_token_count', 1000),
    s('cache_write_token_count', 0), s('output_token_count', 80), s('reasoning_token_count', 30), s('ttft_ms', 900), s('model_reasoning_effort', 'medium')]),
  rec('codex.tool_result', [s('tool_name', 'shell'), s('call_id', 'call_1'), s('duration_ms', 1500), s('success', 'false'),
    s('arguments', '{"command":["rm","-rf","/secret/path"]}'), s('output', 'secret output'), s('tool_origin', 'builtin')]),
  rec('codex.tool_result', [s('tool_name', 'search_issues'), s('call_id', 'call_2'), s('duration_ms', 300), s('success', 'true'),
    s('tool_origin', 'mcp'), s('mcp_server', 'linear')]),
  rec('codex.tool_decision', [s('tool_name', 'shell'), s('call_id', 'call_1'), s('decision', 'approved'), s('source', 'user')]),
  rec('codex.api_request', [s('http.response.status_code', 429), s('attempt', 1)]),
  rec('codex.api_request', [s('http.response.status_code', 200)]),
  rec('codex.turn_cost', [s('turn.id', 't1'), s('usage.estimated_usd', 0.0123)]),
] }] }] });

test('Codex events become the same rows as Claude Code, without text or tool arguments', async () => {
  const rows = parseLogs(payload());
  const by = (n) => rows.filter((r) => r.name === n);
  assert.deepEqual([...new Set(rows.map((r) => r.name))].sort(), ['api_error', 'api_request', 'session_start', 'tool_decision', 'tool_result', 'turn_cost', 'user_prompt']);
  assert.ok(rows.every((r) => r.agent === 'codex'));
  const p = by('user_prompt')[0];
  assert.equal(p.prompt_length, 42);
  assert.ok(!JSON.stringify(rows).includes('secret prompt text'), 'prompt text dropped');
  assert.ok(!JSON.stringify(rows).includes('/secret/path') && !JSON.stringify(rows).includes('secret output'), 'tool arguments/output dropped');
  const api = by('api_request');
  assert.equal(api.length, 1, 'only completed responses count as requests');
  assert.equal(api[0].input_tokens, 200); assert.equal(api[0].cache_read, 1000); assert.equal(api[0].output_tokens, 80);
  const [shell, mcp] = by('tool_result');
  assert.equal(shell.tool_name, 'Bash'); assert.equal(shell.success, 0); assert.equal(shell.attrs['codex.tool'], 'shell');
  assert.equal(mcp.tool_name, 'mcp__linear__search_issues');
  assert.equal(by('tool_decision')[0].decision, 'accept');
  assert.equal(by('api_error')[0].attrs.status_code, 429);
  assert.equal(by('turn_cost')[0].cost_usd, 0.0123);
  assert.equal(p.session.session_id, 'conv-1'); assert.equal(p.session.entrypoint, 'codex_exec');
  assert.equal(p.identity.key, 'ws-acme');
});

test('raw archive scrub removes Codex prompt text and tool arguments', async () => {
  const body = JSON.stringify(scrubPayload(payload()));
  assert.ok(!body.includes('secret prompt text') && !body.includes('/secret/path') && !body.includes('secret output'));
});

test('Codex usage shows up in the dashboard queries next to Claude Code', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-codex-'));
  const store = openDb(path.join(dir, 'u.db'));
  try {
    store.insertEvents(parseLogs(payload()));
    const q = makeQueries(store.db), now = Date.now();
    const team = (await q.team({ from: now - 3600_000, to: now + 60_000 }, 0));
    const me = team.people[0];
    assert.equal(me.prompts, 1); assert.equal(me.tools, 2); assert.equal(me.toolFail, 1);
    assert.equal(me.mix.run, 1); assert.equal(me.mix.mcp, 1);
    assert.equal(store.db.prepare(`SELECT COUNT(*) n FROM events WHERE agent = 'codex'`).get().n, 8);
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
