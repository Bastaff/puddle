import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { openDb } from '../collector/db.js';

const T0 = Date.now() - 3 * 3600_000;
const iso = (t) => new Date(t).toISOString();
function transcript(seed = 1) {
  let x = seed; const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = []; let t = T0;
  for (let p = 0; p < 40; p++) {
    const sid = p < 30 ? 's1' : 's2', pid = `p${p}`;
    out.push({ type: 'user', sessionId: sid, promptId: pid, timestamp: iso((t += 1000)), version: '2.1.0', entrypoint: 'cli', message: { role: 'user', content: rnd() < 0.5 ? `привет мир ${p} — ünïcödé ✓` : [{ type: 'text', text: 'hello '.repeat(p + 1) }] } });
    for (let k = 0; k < 6; k++) {
      const rid = `req_${p}_${k}`, tu = `tu_${p}_${k}`;
      out.push({ type: 'assistant', sessionId: sid, requestId: rid, timestamp: iso((t += 300)), message: { model: 'claude-sonnet-5-5', content: [{ type: 'thinking' }], usage: { input_tokens: 3, output_tokens: 5 } } });
      out.push({ type: 'assistant', sessionId: sid, requestId: rid, timestamp: iso((t += 300)), message: { model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id: tu, name: k % 2 ? 'Bash' : 'Edit', input: { command: 'secret' } }], usage: { input_tokens: 3, output_tokens: 40 + k, cache_read_input_tokens: 1000 * k } } });
      if (rnd() < 0.3) out.push({ type: 'cost-state', sessionId: sid, totalLinesAdded: p * 10 + k, totalLinesRemoved: p + k });
      out.push({ type: 'user', sessionId: sid, promptId: pid, timestamp: iso((t += 400)), permissionDecision: { decision: rnd() < 0.9 ? 'accept' : 'reject', source: rnd() < 0.5 ? 'config' : 'user_temporary' },
        message: { content: [{ type: 'tool_result', tool_use_id: tu, is_error: rnd() < 0.1, content: 'out '.repeat(Math.floor(rnd() * 200)) }] } });
    }
  }
  return out.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

async function reader(dir) {
  fs.mkdirSync(path.join(dir, 'projects', 'proj'), { recursive: true });
  process.env.CLAUDE_CONFIG_DIR = dir; process.env.CODEX_HOME = path.join(dir, 'codex');
  const { makeBackfill } = await import('../collector/backfill.js?inc=' + Math.random());
  const store = openDb(path.join(dir, 'u.db'));
  return { store, bf: makeBackfill(store.db, { home: dir, notify() {}, log() {} }), file: path.join(dir, 'projects', 'proj', 's.jsonl') };
}
const rows = (store) => store.db.prepare(`SELECT dedupe, ts, name, user_key, session_id, prompt_id, tool_name, success, model, input_tokens, output_tokens,
  cache_read, cache_creation, cost_usd, prompt_length, decision, attrs_json FROM events ORDER BY dedupe`).all();

test('a log read in pieces gives exactly what reading it whole gives', async () => {
  const text = Buffer.from(transcript());
  const dirs = [];
  try {
    const whole = await reader(dirs[dirs.push(fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-inc-a-'))) - 1]);
    fs.writeFileSync(whole.file, text); whole.bf.run();
    const want = rows(whole.store);
    assert.ok(want.length > 500, 'the log gives plenty of rows');

    for (const seed of [1, 2, 3]) {
      const inc = await reader(dirs[dirs.push(fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-inc-b-'))) - 1]);
      let x = seed * 7919, at = 0, reads = 0, bytes = 0;
      while (at < text.length) {
        const n = 1 + ((x = (x * 48271) % 2147483647) % 9000);
        fs.appendFileSync(inc.file, text.subarray(at, at + n)); at += n;
        const st = inc.bf.run(); reads++; bytes += st.bytesRead;
      }
      inc.bf.run();
      assert.deepEqual(rows(inc.store), want, `seed ${seed}: same rows after ${reads} reads`);
      assert.ok(bytes <= text.length * 1.2, `each byte read about once (${bytes} of ${text.length})`);
      assert.equal(inc.bf.run().bytesRead, 0);
      inc.store.close();
    }
    whole.store.close();
  } finally { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); }
});

test('a log that was replaced or got shorter is read again from the start; fresh work is counted once it settles', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-inc-c-'));
  try {
    const r = await reader(dir);
    const text = transcript(5);
    fs.writeFileSync(r.file, text); r.bf.run();
    const before = rows(r.store).length;
    const other = transcript(9).replaceAll('"s1"', '"s9"').replaceAll('"s2"', '"s8"').replaceAll('req_', 'rq9_').replaceAll('tu_', 'tu9_').replaceAll('"p', '"q');
    fs.writeFileSync(r.file, other.slice(0, other.length / 2).replace(/[^\n]*$/, ''));
    r.bf.run();
    assert.ok(rows(r.store).length > before);
    assert.ok(rows(r.store).some((x) => x.session_id === 's9'));

    const now = Date.now();
    fs.appendFileSync(r.file, JSON.stringify({ type: 'user', sessionId: 's9', promptId: 'fresh', timestamp: iso(now), message: { role: 'user', content: 'just now' } }) + '\n');
    const st = r.bf.run();
    assert.ok(!rows(r.store).some((x) => x.prompt_id === 'fresh'), 'not yet');
    assert.ok(st.settlesAt >= now + 59_000 && st.settlesAt <= now + 61_000, 'counted a minute later');
    r.store.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
