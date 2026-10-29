// Recovery: fills in anything telemetry missed (collector down, crash, sleep)
// from Claude Code's local session logs (~/.claude/projects/**/*.jsonl).
//
// Every recovered row uses the same dedupe key as its telemetry twin
// (request id, tool_use id, prompt id), so nothing is ever counted twice and
// a late telemetry row always replaces a recovered one. While scanning, it
// also cross-checks rows that telemetry did deliver against the session logs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { estimateCost } from './pricing.js';
import zlib from 'node:zlib';
import { parseRollout } from './codex-backfill.js';
import { canonicalClient } from './agents.js';

const PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
const CODEX = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions');
const SETTLE_MS = 60_000; // leave very recent entries to telemetry first

function account() {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8')).oauthAccount || {};
    return { email: a.emailAddress || null, account_uuid: a.accountUuid || null, organization_id: a.organizationUuid || null };
  } catch { return { email: null, account_uuid: null, organization_id: null }; }
}

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsonl') || e.name.endsWith('.jsonl.zst')) out.push(p);
  }
  return out;
}
// a log file's text; Codex compresses older conversations (rollout-….jsonl.zst, seen 21 Oct 2026)
const readLog = (file) => (file.endsWith('.zst') ? zlib.zstdDecompressSync(fs.readFileSync(file)) : fs.readFileSync(file)).toString('utf8');

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  if (content.some((b) => b?.type === 'tool_result')) return null;
  const parts = content.filter((b) => b?.type === 'text' && !String(b.text).startsWith('<system-reminder>')).map((b) => b.text);
  return parts.length ? parts.join('') : null;
};

function toolParams(name, input = {}) {
  if (name === 'Bash' && input.command) {
    return JSON.stringify({ bash_command: String(input.command).trim().split(/\s+/)[0], full_command: String(input.command).slice(0, 2000), description: input.description });
  }
  const keep = {};
  for (const k of ['file_path', 'path', 'pattern', 'url', 'query', 'notebook_path', 'skill', 'subagent_type']) if (input[k] != null) keep[k] = String(input[k]).slice(0, 500);
  return Object.keys(keep).length ? JSON.stringify(keep) : null;
}

// Parse one session log into telemetry-shaped rows.
export function parseTranscript(text) {
  const reqs = new Map(), uses = new Map(), results = [], prompts = new Map(), meta = new Map(), lines = [];
  const lastTotals = new Map(); let lastTs = 0, costN = 0;
  // Claude Code writes the prompt's id on your lines only (the prompt, its tool results), never on Claude's replies:
  // a reply belongs to the newest prompt before it in its conversation (the transcript is in order)
  const current = new Map(); // session → prompt id
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    // lines changed: Claude Code keeps a running total per session (cost-state, no timestamp of its own); each
    // record's change since the previous one counts at the time of the record before it
    if (r.type === 'cost-state' && r.sessionId) {
      const n = costN++, a = Number(r.totalLinesAdded) || 0, d = Number(r.totalLinesRemoved) || 0, prev = lastTotals.get(r.sessionId);
      // a resumed session starts counting from zero again: then this record is all new
      const da = prev && a >= prev.a ? a - prev.a : a, dd = prev && d >= prev.d ? d - prev.d : d;
      lastTotals.set(r.sessionId, { a, d });
      if ((da || dd) && (lastTs || r.startTime)) lines.push({ key: `cl:${r.sessionId}:${n}`, ts: lastTs || Number(r.startTime), session_id: r.sessionId, added: da, removed: dd });
      continue;
    }
    const ts = Date.parse(r.timestamp);
    if (!ts || !r.sessionId) continue;
    lastTs = ts;
    if (!meta.has(r.sessionId) || r.version) meta.set(r.sessionId, { entrypoint: r.entrypoint || null, version: r.version || null });
    const m = r.message;
    if (r.type === 'assistant' && m && r.requestId && m.usage && m.model && m.model !== '<synthetic>') {
      const prev = reqs.get(r.requestId);
      // The last entry for a request carries the final usage.
      reqs.set(r.requestId, { ts: prev ? Math.min(prev.ts, ts) : ts, model: m.model, usage: m.usage, session_id: r.sessionId, prompt_id: r.promptId || prev?.prompt_id || current.get(r.sessionId) || null,
        effort: r.effort || prev?.effort || null });
      for (const b of Array.isArray(m.content) ? m.content : []) {
        if (b?.type === 'tool_use') uses.set(b.id, { name: b.name, input: b.input, ts, session_id: r.sessionId });
      }
    } else if (r.type === 'user' && m) {
      if (r.promptId && !r.isMeta && !r.isCompactSummary) current.set(r.sessionId, r.promptId);
      if (Array.isArray(m.content) && m.content.some((b) => b?.type === 'tool_result')) {
        for (const b of m.content) {
          if (b?.type === 'tool_result') results.push({ id: b.tool_use_id, is_error: !!b.is_error, ts, session_id: r.sessionId, decision: r.permissionDecision || null, prompt_id: r.promptId || null });
        }
      } else if (r.promptId && !r.isMeta && !r.isCompactSummary && !prompts.has(r.promptId)) {
        const t = textOf(m.content);
        if (t != null) prompts.set(r.promptId, { ts, length: t.length, session_id: r.sessionId });
      }
    }
  }
  return { reqs, uses, results, prompts, meta, lines };
}

export function makeBackfill(db, { home, notify, log }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backfill_files (path TEXT PRIMARY KEY, size INTEGER, mtime_ms REAL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS incidents (id INTEGER PRIMARY KEY, down_from INTEGER, down_to INTEGER, reason TEXT, recovered INTEGER DEFAULT 0);
  `);
  const getMeta = (k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? null;
  const setMeta = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

  // Recovered rows only overwrite other recovered rows, never telemetry.
  const ins = db.prepare(`
    INSERT INTO events (dedupe, ts, name, user_key, session_id, prompt_id, tool_name, success, duration_ms, model,
      input_tokens, output_tokens, cache_read, cache_creation, cost_usd, prompt_length, decision, error, attrs_json, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'transcript')
    ON CONFLICT(dedupe) DO UPDATE SET
      ts = excluded.ts, model = excluded.model, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
      cache_read = excluded.cache_read, cache_creation = excluded.cache_creation, cost_usd = excluded.cost_usd,
      success = excluded.success, prompt_length = excluded.prompt_length, decision = excluded.decision, attrs_json = excluded.attrs_json,
      prompt_id = COALESCE(excluded.prompt_id, events.prompt_id)
    WHERE events.source = 'transcript'`);
  // the same, for rows from Codex's history (agent = codex)
  const insCodex = db.prepare(`
    INSERT INTO events (dedupe, ts, name, user_key, session_id, prompt_id, tool_name, success, duration_ms, model,
      input_tokens, output_tokens, cache_read, cache_creation, cost_usd, prompt_length, decision, error, attrs_json, source, agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'transcript', 'codex')
    ON CONFLICT(dedupe) DO UPDATE SET
      ts = excluded.ts, model = excluded.model, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
      cache_read = excluded.cache_read, cache_creation = excluded.cache_creation, success = excluded.success,
      prompt_length = excluded.prompt_length, attrs_json = excluded.attrs_json, agent = 'codex'
    WHERE events.source = 'transcript'`);
  const existing = db.prepare('SELECT source, input_tokens, output_tokens, cache_read, cache_creation, cost_usd, prompt_length FROM events WHERE dedupe = ?');
  const upUser = db.prepare(`INSERT INTO users (user_key, email, account_uuid, organization_id, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_key) DO UPDATE SET email = COALESCE(users.email, excluded.email), first_seen = MIN(users.first_seen, excluded.first_seen), last_seen = MAX(users.last_seen, excluded.last_seen)`);
  const upSession = db.prepare(`INSERT INTO sessions (session_id, user_key, entrypoint, app_version, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET user_key = COALESCE(sessions.user_key, excluded.user_key), entrypoint = COALESCE(sessions.entrypoint, excluded.entrypoint),
      app_version = COALESCE(sessions.app_version, excluded.app_version), first_seen = MIN(sessions.first_seen, excluded.first_seen), last_seen = MAX(sessions.last_seen, excluded.last_seen)`);
  const fileRow = db.prepare('SELECT size, mtime_ms FROM backfill_files WHERE path = ?');
  const setFile = db.prepare('INSERT INTO backfill_files (path, size, mtime_ms) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime_ms = excluded.mtime_ms');

  const status = { running: false, lastRun: null, lastDurationMs: null, filesScanned: 0, lastRecovered: {}, check: null, error: null };

  // Don't recover from periods when tracking was off, or from before a reset.
  function floor() {
    let since = 0;
    try { since = Date.parse(JSON.parse(fs.readFileSync(path.join(home, 'state.json'), 'utf8')).since) || 0; } catch {}
    return Math.max(since, Number(getMeta('reset_at')) || 0);
  }

  // bumped when history yields new fields (effort, app, lines…): the next run reads every log once more
  const VERSION = 3; // 3: replies carry their prompt's id
  function run({ full = false } = {}) {
    if (status.running) return status;
    if ((Number(getMeta('backfill_version')) || 1) < VERSION) { full = true; setMeta('backfill_version', VERSION); }
    status.running = true;
    const t0 = Date.now();
    const recovered = { api_request: 0, tool_result: 0, tool_decision: 0, user_prompt: 0, code_lines: 0 };
    const check = { requests: 0, tokenMismatch: 0, costMismatch: 0, costUnknown: 0, prompts: 0, promptMismatch: 0, examples: [] };
    let files = 0;
    try {
      const lo = floor();
      const hi = Date.now() - SETTLE_MS;
      const me = account();
      const userKey = me.account_uuid || me.email || 'unknown';
      for (const file of walk(PROJECTS)) {
        let st; try { st = fs.statSync(file); } catch { continue; }
        if (st.mtimeMs < lo) continue;
        const seen = fileRow.get(file);
        if (!full && seen && seen.size === st.size && seen.mtime_ms === st.mtimeMs) continue;
        files++;
        const p = parseTranscript(fs.readFileSync(file, 'utf8'));
        const inWindow = (ts) => ts >= lo && ts <= hi;
        let complete = true;

        db.exec('BEGIN');
        try {
          const touched = new Set();
          const ep = (sid) => p.meta.get(sid)?.entrypoint || null; // which app: the Claude app, the terminal, an editor…
          const touch = (sid, ts) => {
            const m = p.meta.get(sid) || {};
            upSession.run(sid, userKey, m.entrypoint, m.version, ts, ts);
            if (!touched.has(sid)) { upUser.run(userKey, me.email, me.account_uuid, me.organization_id, ts, ts); touched.add(sid); }
          };
          for (const [rid, q] of p.reqs) {
            if (q.ts > hi) complete = false;
            if (!inWindow(q.ts)) continue;
            const u = q.usage;
            const tok = [u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0];
            const cost = estimateCost(q.model, u);
            const ex = existing.get('api:' + rid);
            if (ex && ex.source !== 'transcript') {
              check.requests++;
              const got = [ex.input_tokens, ex.output_tokens, ex.cache_read, ex.cache_creation];
              if (got.some((v, i) => v !== tok[i])) {
                check.tokenMismatch++;
                if (check.examples.length < 10) check.examples.push({ kind: 'tokens', request_id: rid, model: q.model, log: tok, telemetry: got });
              } else if (cost == null) check.costUnknown++;
              else if (Math.abs((ex.cost_usd || 0) - cost) > 1e-6) {
                check.costMismatch++;
                if (check.examples.length < 10) check.examples.push({ kind: 'cost', request_id: rid, model: q.model, log: +cost.toFixed(7), telemetry: ex.cost_usd });
              }
              continue;
            }
            touch(q.session_id, q.ts);
            const attrs = { request_id: rid, recovered_from: 'session log', cost_estimated: true, speed: u.speed || null, 'session.id': q.session_id,
              effort: q.effort, thinking_tokens: u.output_tokens_details?.thinking_tokens ?? null, 'app.entrypoint': ep(q.session_id) };
            const r = ins.run('api:' + rid, q.ts, 'api_request', userKey, q.session_id, q.prompt_id, null, null, q.model,
              tok[0], tok[1], tok[2], tok[3], cost, null, null, JSON.stringify(attrs));
            if (!ex && Number(r.changes)) recovered.api_request++;
          }
          for (const res of p.results) {
            if (res.ts > hi) complete = false;
            if (!inWindow(res.ts)) continue;
            const use = p.uses.get(res.id) || {};
            const params = null; // team privacy: never store what a tool ran or opened
            for (const [name, key, decision] of [['tool_result', 'tr:', null], ['tool_decision', 'td:', res.decision?.decision || null]]) {
              if (name === 'tool_decision' && !decision) continue;
              const ex = existing.get(key + res.id);
              if (ex && ex.source !== 'transcript') continue;
              touch(res.session_id, res.ts);
              const attrs = { tool_use_id: res.id, tool_parameters: params, source: res.decision?.source || null, recovered_from: 'session log', 'session.id': res.session_id, 'app.entrypoint': ep(res.session_id) };
              const r = ins.run(key + res.id, res.ts, name, userKey, res.session_id, res.prompt_id, use.name || null,
                name === 'tool_result' ? (res.is_error ? 0 : 1) : null, null, null, null, null, null, null, null, decision, JSON.stringify(attrs));
              if (!ex && Number(r.changes)) recovered[name]++;
            }
          }
          for (const [pid, pr] of p.prompts) {
            if (pr.ts > hi) complete = false;
            if (!inWindow(pr.ts)) continue;
            const ex = existing.get('up:' + pid);
            if (ex && ex.source !== 'transcript') {
              check.prompts++;
              if (ex.prompt_length !== pr.length) {
                check.promptMismatch++;
                if (check.examples.length < 10) check.examples.push({ kind: 'prompt length', prompt_id: pid, log: pr.length, telemetry: ex.prompt_length });
              }
              continue;
            }
            touch(pr.session_id, pr.ts);
            const attrs = { 'prompt.id': pid, prompt_length: pr.length, recovered_from: 'session log', 'session.id': pr.session_id, 'app.entrypoint': ep(pr.session_id) };
            const r = ins.run('up:' + pid, pr.ts, 'user_prompt', userKey, pr.session_id, pid, null, null, null, null, null, null, null, null, pr.length, null, JSON.stringify(attrs));
            if (!ex && Number(r.changes)) recovered.user_prompt++;
          }
          // lines added/removed (numbers only)
          for (const l of p.lines) {
            if (l.ts > hi) complete = false;
            if (!inWindow(l.ts)) continue;
            const ex = existing.get(l.key);
            if (ex && ex.source !== 'transcript') continue;
            touch(l.session_id, l.ts);
            const attrs = { added: l.added, removed: l.removed, recovered_from: 'session log', 'session.id': l.session_id, 'app.entrypoint': ep(l.session_id) };
            const r = ins.run(l.key, l.ts, 'code_lines', userKey, l.session_id, null, null, null, null, null, null, null, null, null, null, null, JSON.stringify(attrs));
            if (!ex && Number(r.changes)) recovered.code_lines++;
          }
          // Only mark the file done once nothing in it is still too fresh to judge.
          if (complete) setFile.run(file, st.size, st.mtimeMs);
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      }
      // Codex: its rollouts give the same kinds of events (numbers only; see codex-backfill.js)
      for (const file of walk(CODEX).filter((f) => path.basename(f).startsWith('rollout-'))) {
        let st; try { st = fs.statSync(file); } catch { continue; }
        if (st.mtimeMs < lo) continue;
        const seen = fileRow.get(file);
        if (!full && seen && seen.size === st.size && seen.mtime_ms === st.mtimeMs) continue;
        files++;
        let x; try { x = parseRollout(readLog(file)); } catch { setFile.run(file, st.size, st.mtimeMs); continue; } // unreadable: skipped, not retried
        if (!x.session?.id) { setFile.run(file, st.size, st.mtimeMs); continue; }
        const sid = x.session.id, entry = canonicalClient(x.session.entrypoint) || null;
        const attrs = (o) => JSON.stringify({ ...o, recovered_from: 'codex log', 'session.id': sid, 'app.entrypoint': entry });
        let complete = true;
        const put = (key, ts, name, row, a) => {
          if (ts > hi) { complete = false; return; }
          if (ts < lo) return;
          const ex = existing.get(key);
          if (ex && ex.source !== 'transcript') return;
          upSession.run(sid, userKey, entry, x.session.version, ts, ts);
          upUser.run(userKey, me.email, me.account_uuid, me.organization_id, ts, ts);
          const r = insCodex.run(key, ts, name, userKey, sid, row.prompt_id ?? null, row.tool ?? null, row.success ?? null, row.model ?? null,
            row.input ?? null, row.output ?? null, row.cacheRead ?? null, row.cacheCreation ?? null, row.cost ?? null, row.length ?? null, null, attrs(a));
          if (!ex && Number(r.changes)) recovered[name] = (recovered[name] || 0) + 1;
        };
        db.exec('BEGIN');
        try {
          for (const q of x.prompts) put(q.key, q.ts, 'user_prompt', { length: q.length, prompt_id: q.id }, { prompt_length: q.length });
          // each call with the prompt it answered (codex-backfill.js) and its list price (Codex logs no cost)
          for (const q of x.reqs) put(q.key, q.ts, 'api_request', { model: q.model, input: q.input, output: q.output, cacheRead: q.cached, cacheCreation: q.cacheWrite, prompt_id: q.prompt_id,
            cost: estimateCost(q.model, { input_tokens: Math.max(0, q.input - q.cacheWrite), cache_read_input_tokens: q.cached, cache_creation_input_tokens: q.cacheWrite, output_tokens: q.output }) },
            { effort: q.effort, thinking_tokens: q.thinking, context_window: q.window });
          for (const q of x.steps) put(q.key, q.ts, 'tool_result', { tool: q.tool, success: q.ok ? 1 : 0 }, { duration_ms: q.ms });
          for (const q of x.lines) put(q.key, q.ts, 'code_lines', {}, { added: q.added, removed: q.removed });
          for (const q of x.compactions) put(q.key, q.ts, 'compaction', {}, { trigger: 'auto' });
          if (complete) setFile.run(file, st.size, st.mtimeMs);
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      }
      status.error = null;
    } catch (e) {
      status.error = e.message;
      log(`backfill error: ${e.stack || e.message}`);
    } finally {
      status.running = false;
      status.lastRun = Date.now();
      status.lastDurationMs = Date.now() - t0;
      status.filesScanned = files;
      status.lastRecovered = recovered;
      if (files) status.check = check;
      const n = Object.values(recovered).reduce((a, b) => a + b, 0);
      if (n) {
        log(`backfill recovered ${JSON.stringify(recovered)} from ${files} session logs`);
        setMeta('recovered_total', (Number(getMeta('recovered_total')) || 0) + n);
        const inc = db.prepare('SELECT id FROM incidents ORDER BY id DESC LIMIT 1').get();
        if (inc) db.prepare('UPDATE incidents SET recovered = recovered + ? WHERE id = ?').run(n, inc.id);
        notify();
      }
    }
    return status;
  }

  // ---- downtime detection ---------------------------------------------------
  const HEARTBEAT_MS = 15_000;
  let beat = null;
  function startup() {
    const last = Number(getMeta('heartbeat')) || 0;
    const reason = getMeta('shutdown') === 'clean' ? 'stopped' : 'crashed or killed';
    if (last && Date.now() - last > HEARTBEAT_MS * 3) {
      db.prepare('INSERT INTO incidents (down_from, down_to, reason) VALUES (?, ?, ?)').run(last, Date.now(), reason);
      log(`collector was down for ${Math.round((Date.now() - last) / 1000)}s (${reason}); recovering from session logs`);
    }
    setMeta('started_at', Date.now());
    setMeta('shutdown', 'running');
    setMeta('heartbeat', Date.now());
    clearInterval(beat);
    beat = setInterval(() => setMeta('heartbeat', Date.now()), HEARTBEAT_MS); beat.unref();
  }

  return {
    run,
    startup,
    // before the database closes: no heartbeat after that (it would write to a closed database)
    stop() { clearInterval(beat); beat = null; },
    markCleanShutdown() { clearInterval(beat); beat = null; setMeta('shutdown', 'clean'); setMeta('heartbeat', Date.now()); },
    markReset() {
      setMeta('reset_at', Date.now());
      setMeta('recovered_total', 0);
      db.exec('DELETE FROM incidents; DELETE FROM backfill_files;');
    },
    status() {
      return {
        ...status,
        startedAt: Number(getMeta('started_at')) || null,
        recoveredTotal: Number(getMeta('recovered_total')) || 0,
        floor: floor(),
        incidents: db.prepare('SELECT * FROM incidents ORDER BY id DESC LIMIT 10').all(),
      };
    },
  };
}
