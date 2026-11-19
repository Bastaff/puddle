import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../collector/db.js';
import { eventRow } from '../collector/otlp.js';
import { meThread } from '../companion/me-thread.js';

test('Me is counted on its own thread, with project names, and comes back whole', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-me-thread-'));
  const store = openDb(path.join(dir, 'personal.db'));
  const me = meThread({ file: path.join(dir, 'personal.db') });
  try {
    const t = Date.now() - 3600_000, who = { 'user.account_uuid': 'u1', 'session.id': 's1' };
    store.insertEvents([
      eventRow('user_prompt', t, { ...who, 'prompt.id': 'p1', prompt_length: 20 }),
      eventRow('api_request', t + 5000, { ...who, 'prompt.id': 'p1', model: 'claude-sonnet-5-5', input_tokens: 100, output_tokens: 50 }),
      eventRow('tool_result', t + 9000, { ...who, 'prompt.id': 'p1', tool_name: 'Edit', success: 'true' }),
      eventRow('code_lines', t + 9500, { ...who, added: 12, removed: 3 }),
    ]);
    const sp = new URLSearchParams({ from: String(t - 864e5), to: String(Date.now() + 864e5), tz: '0' });
    const r = await me.ask({ kind: 'person', search: sp.toString(), tz: 0, projects: { s1: 'puddle' } });
    assert.ok(r?.person, 'a person answer');
    assert.equal(r.codeLines?.[0]?.name, 'puddle', 'lines are filed under the project name');
    assert.ok(r.work, 'the kinds of work are counted too');
    for (const kind of ['today', 'highlights', 'rhythm']) assert.ok(await me.ask({ kind, tz: 0, version: 1 }), kind);
  } finally { me.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
