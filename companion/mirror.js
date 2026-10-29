// Every connected Puddle: this Mac's history (personal.db, read from Claude Code's session logs) goes to the
// service as the same OTLP events Claude Code sends live, so a team sees earlier work too, and work from a
// Claude Code session opened before signing in arrives within 30 s. Each step carries the ids live reporting
// uses (request, tool call, prompt), so the service stores it once however it arrives, and the session's
// account (as its fingerprint) so a team's "share my work account" rule matches. Counts only, never text.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fingerprint } from './cloud.js';

const s = (key, v) => ({ key, value: { stringValue: String(v) } });
const COLS = { prompt_id: 'prompt.id', tool_name: 'tool_name', duration_ms: 'duration_ms', model: 'model', input_tokens: 'input_tokens', output_tokens: 'output_tokens',
  cache_read: 'cache_read_tokens', cache_creation: 'cache_creation_tokens', cost_usd: 'cost_usd', prompt_length: 'prompt_length', decision: 'decision' };

// The only stored attributes that go up, besides the columns above: what the website's numbers read (rollup.js,
// queries.js), what tells history from live reporting, and the session's app. Anything else a step was stored
// with (emails, account ids, a name, error text, or a field an agent adds later) stays on this Mac.
export const SENT = new Set(['event.sequence', 'recovered_from', 'cost_estimated', 'speed', 'entrypoint', 'app.entrypoint', 'terminal.type',
  'app.version', 'user.country', 'added', 'removed', 'agent.name', 'agent_type', 'plugin.name', 'skill.name', 'mcp_server.name', 'hook_name',
  'query_source', 'total_tokens', 'ttft_ms', 'context_window', 'effort', 'num_non_blocking_error', 'source', 'status_code', 'error_type', 'trigger']);

const WINDOW = 90 * 86400_000; // what Me shows; older history stays on this Mac
const BATCH = 200, GAP = 1200; // rows per request, and the pause between requests
// the id live reporting uses for this step, from the history copy's key (see collector/otlp.js dedupeKey)
const idsOf = (dedupe) => {
  const [, kind, id] = String(dedupe || '').match(/^(api|tr|td|up):(.+)$/) || [];
  return kind === 'api' ? { request_id: id } : kind === 'tr' || kind === 'td' ? { tool_use_id: id } : kind === 'up' ? { 'prompt.id': id } : {};
};
// orgOf(session_id) → the Claude account id of that session (from Puddle's scan), or null
export function toOtlp(rows, tz = Intl.DateTimeFormat().resolvedOptions().timeZone, orgOf = () => null) {
  return { resourceLogs: [{ resource: { attributes: [s('service.name', 'claude-code'), s('user.timezone', tz)] }, scopeLogs: [{ logRecords: rows.map((r) => {
    const stored = (() => { try { return JSON.parse(r.attrs_json || '{}'); } catch { return {}; } })();
    const a = Object.fromEntries(Object.entries(stored).filter(([k]) => SENT.has(k)));
    Object.assign(a, idsOf(r.dedupe), { 'event.name': r.name, 'session.id': r.session_id });
    const org = orgOf(r.session_id); if (org) a['context.org'] = fingerprint(org); // the account id itself stays here
    for (const [col, key] of Object.entries(COLS)) if (r[col] != null) a[key] = r[col];
    if (r.success != null) a.success = r.success ? 'true' : 'false';
    if (r.agent && r.agent !== 'claude-code') a.agent = r.agent; // the website reads any other agent from this
    return { timeUnixNano: String(BigInt(r.ts) * 1000000n), body: { stringValue: `claude_code.${r.name}` }, attributes: Object.entries(a).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => s(k, v)) };
  }) }] }] };
}

export function startMirror({ dir, cloud, log = () => {}, every = 30_000, orgOf = () => null }) {
  const stateFile = path.join(dir, 'mirror.json');
  let busy = false;
  const tick = async () => {
    if (busy || !cloud.connected() || !fs.existsSync(path.join(dir, 'personal.db'))) return;
    busy = true;
    try {
      const who = cloud.signInKey?.() || cloud.email?.() || null; // a new sign-in sends the whole window again
      // V: bumped when the Mac's history gains fields the website should have (the app each session ran in…):
      // everything in the window is sent once more (the website keeps each event once)
      const V = 4; // 4: replies from history carry their prompt's id
      let last = 0; try { const st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); if (st.who === who && st.v === V) last = st.last || 0; } catch {}
      const db = new DatabaseSync(path.join(dir, 'personal.db'), { readOnly: true });
      try {
        // paced: the website takes one history batch a second per person and works on it in the background
        // (service/server.js), so a joining member's months of history never crowd out anyone's live work
        for (let n = 0; n < 40; n++) {
          if (n) await new Promise((r) => setTimeout(r, GAP));
          const rows = db.prepare(`SELECT * FROM events WHERE id > ? AND session_id IS NOT NULL AND ts >= ? ORDER BY id LIMIT ${BATCH}`).all(last, Date.now() - WINDOW);
          if (!rows.length) break;
          const r = await cloud.ingest(toOtlp(rows, undefined, orgOf));
          if (r.status !== 200) { log(`mirror: local website said ${r.status}`); break; }
          last = rows[rows.length - 1].id;
          fs.writeFileSync(stateFile, JSON.stringify({ last, who, v: V }));
        }
      } finally { db.close(); }
    } catch (e) { log(`mirror: ${e.message}`); } finally { busy = false; }
  };
  const t = setInterval(tick, every); t.unref?.();
  setTimeout(tick, 5_000).unref?.();
  return { tick, stop: () => clearInterval(t) };
}
