import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { estimateCost } from '../collector/pricing.js';
import { parseTranscript } from '../collector/backfill.js';
import { parseLogs } from '../collector/otlp.js';
import { openDb } from '../collector/db.js';

test('cost estimate matches Claude Code telemetry for real requests', () => {
  // Desktop test message (opus-5-5, 1h cache write) -> telemetry said $0.1711584
  assert.equal(+estimateCost('claude-opus-5-5', { input_tokens: 2, output_tokens: 463, cache_read_input_tokens: 41332,
    cache_creation_input_tokens: 19203, cache_creation: { ephemeral_1h_input_tokens: 19203, ephemeral_5m_input_tokens: 0 } }).toFixed(7), 0.1711584);
  // CLI self-test (haiku-5-5) -> telemetry said $0.00317
  assert.equal(+estimateCost('claude-haiku-5-5', { input_tokens: 4, output_tokens: 178, cache_read_input_tokens: 34343,
    cache_creation_input_tokens: 13684, cache_creation: { ephemeral_1h_input_tokens: 13684 } }).toFixed(5), 0.00317);
  assert.equal(estimateCost('some-unknown-model', { input_tokens: 1 }), null);
});

const T = (iso) => new Date(iso).toISOString();
const transcript = [
  { type: 'user', sessionId: 's1', promptId: 'p1', timestamp: T('2026-01-01T10:00:00Z'), version: '2.1.0', entrypoint: 'cli', message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>x</system-reminder>' }, { type: 'text', text: 'hello world' }] } },
  { type: 'assistant', sessionId: 's1', promptId: 'p1', requestId: 'req_1', timestamp: T('2026-01-01T10:00:02Z'), message: { model: 'claude-opus-5-5', content: [{ type: 'thinking' }], usage: { input_tokens: 2, output_tokens: 10 } } },
  { type: 'assistant', sessionId: 's1', promptId: 'p1', requestId: 'req_1', timestamp: T('2026-01-01T10:00:03Z'), message: { model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls -la' } }], usage: { input_tokens: 2, output_tokens: 50, cache_read_input_tokens: 100 } } },
  { type: 'user', sessionId: 's1', promptId: 'p1', timestamp: T('2026-01-01T10:00:04Z'), permissionDecision: { decision: 'accept', source: 'config' }, message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', is_error: false, content: 'ok' }] } },
].map((r) => JSON.stringify(r)).join('\n');

test('parses a session log: final usage per request, tools, prompt length without reminders', () => {
  const p = parseTranscript(transcript);
  assert.equal(p.reqs.size, 1);
  assert.equal(p.reqs.get('req_1').usage.output_tokens, 50, 'last entry wins');
  assert.equal(p.uses.get('tu_1').name, 'Bash');
  assert.equal(p.results[0].decision.decision, 'accept');
  assert.equal(p.prompts.get('p1').length, 'hello world'.length);
});

test('recovery fills gaps, never double counts, and telemetry replaces recovered rows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-bf-'));
  const projects = path.join(dir, 'projects', 'proj');
  fs.mkdirSync(projects, { recursive: true });
  fs.writeFileSync(path.join(projects, 's1.jsonl'), transcript);
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ on: true, since: '2025-12-31T00:00:00Z' }));
  process.env.CLAUDE_CONFIG_DIR = dir;
  process.env.CODEX_HOME = path.join(dir, 'codex'); // no Codex history here (never this Mac's real one)
  const { makeBackfill } = await import('../collector/backfill.js?fresh=' + Date.now());
  const store = openDb(path.join(dir, 'u.db'));
  const bf = makeBackfill(store.db, { home: dir, notify() {}, log() {} });

  // Telemetry already delivered the prompt, but missed the request and tool call.
  const s = (key, v) => ({ key, value: { stringValue: String(v) } });
  store.insertEvents(parseLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ timeUnixNano: String(Date.parse('2026-01-01T10:00:00Z') * 1e6), attributes: [
    s('event.name', 'user_prompt'), s('session.id', 's1'), s('prompt.id', 'p1'), s('prompt_length', 11), s('user.account_uuid', 'acc')] }] }] }] }));

  const st = bf.run();
  assert.deepEqual(st.lastRecovered, { api_request: 1, tool_result: 1, tool_decision: 1, user_prompt: 0, code_lines: 0 });
  assert.equal(st.check.prompts, 1);
  assert.equal(st.check.promptMismatch, 0);
  const count = () => store.db.prepare('SELECT name, source, output_tokens, cost_usd FROM events ORDER BY name').all();
  assert.equal(count().length, 4);

  // Running again (even a full rescan) adds nothing.
  bf.run({ full: true });
  assert.equal(count().length, 4);

  // Late telemetry for the same request replaces the recovered row instead of adding one.
  store.insertEvents(parseLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ timeUnixNano: String(Date.parse('2026-01-01T10:00:02Z') * 1e6), attributes: [
    s('event.name', 'api_request'), s('session.id', 's1'), s('request_id', 'req_1'), s('model', 'claude-opus-5-5'),
    s('input_tokens', 2), s('output_tokens', 50), s('cache_read_tokens', 100), s('cache_creation_tokens', 0), s('cost_usd', 0.001028)] }] }] }] }));
  const api = count().filter((r) => r.name === 'api_request');
  assert.equal(api.length, 1);
  assert.equal(api[0].source, 'otel');

  // After a reset, nothing older is resurrected.
  store.db.exec('DELETE FROM events');
  bf.markReset();
  bf.run({ full: true });
  assert.equal(count().length, 0);
  store.close();
});
