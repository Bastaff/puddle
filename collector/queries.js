// Read-side queries for the dashboard API. Written once for SQLite (device) and
// Postgres (team service): see sql.js for the few helpers where the two differ.
// Portable SQL rules used here: COUNT(*) FILTER (WHERE …) instead of SUM(condition);
// no "bare" columns next to GROUP BY (use ROW_NUMBER); camelCase aliases are quoted;
// 64-bit math is CAST AS BIGINT.

import { rollupColumns, promptColumns, taskColumns, TASK_NAMES, QUARTER, ACTIVE_NAMES } from './rollup.js';
import { contextWindow } from './pricing.js';
import * as R from './flags.js';
import { asSql } from './sql.js';
import { activeSegments, rhythm } from './forecast.js';
import { profile, teamSummary, commonFacts } from './insights-text.js';
import { planLabel, planTool, isRun, canonicalClient } from './agents.js';

const CLIENT = `COALESCE(s.entrypoint, s.terminal_type, 'unknown')`;
const HOUR = 3600_000;

// A team's view: for each member, only what they chose to share and only since they joined.
// scope = [{ account_id, since, all, orgs: [hash], projects: ['repo:github.com/acme/web', 'group:github.com/acme', 'dir:name'] }]
// Accounts match on the hashed work account every event carries (context.org); projects match the
// session's repo/folder reported by the plugin hook (session_contexts, team service only).
function scopeClause(scope, alias, S, { ts = 'ts', org = null } = {}) {
  if (!scope.length) return { sql: '1 = 0', params: [] };
  const parts = scope.map((m) => {
    const p = [m.account_id, Math.floor(m.since || 0)];
    const head = `${alias}.user_key = ? AND ${alias}.${ts} >= ?`;
    if (m.all) return { sql: `(${head})`, p };
    const any = [];
    if (m.orgs?.length) { any.push(`${org || S.json(`${alias}.attrs_json`, 'context.org')} IN (${m.orgs.map(() => '?').join(', ')})`); p.push(...m.orgs); }
    const proj = m.projects || [];
    const repos = proj.filter((x) => x.startsWith('repo:')).map((x) => x.slice(5));
    const groups = proj.filter((x) => x.startsWith('group:')).map((x) => x.slice(6) + '/');
    const dirs = proj.filter((x) => x.startsWith('dir:')).map((x) => x.slice(4));
    const conds = [], cp = [];
    if (repos.length) { conds.push(`repo IN (${repos.map(() => '?').join(', ')})`); cp.push(...repos); }
    for (const g of groups) { conds.push(`substr(repo, 1, ${g.length}) = ?`); cp.push(g); }
    if (dirs.length) { conds.push(`(repo IS NULL AND folder IN (${dirs.map(() => '?').join(', ')}))`); cp.push(...dirs); }
    if (conds.length) { any.push(`${alias}.session_id IN (SELECT session_id FROM session_contexts WHERE account_id = ? AND (${conds.join(' OR ')}))`); p.push(m.account_id, ...cp); }
    return any.length ? { sql: `(${head} AND (${any.join(' OR ')}))`, p } : { sql: '1 = 0', p: [] };
  });
  return { sql: `(${parts.map((x) => x.sql).join(' OR ')})`, params: parts.flatMap((x) => x.p) };
}

// Shared WHERE clause. `alias` is the events/metric_points alias.
// ts / org: the column names on a summary row (bucket, org) instead of an event's (ts, its JSON)
function baseWhere(f, alias, { model = false, ts = 'ts', org = null } = {}, S = null) {
  const c = [`${alias}.${ts} >= ?`, `${alias}.${ts} < ?`,
    `NOT EXISTS (SELECT 1 FROM excluded_sessions xs WHERE xs.session_id = ${alias}.session_id)`]; // an anti-join (NOT IN can't be one)
  const p = [Math.floor(f.from), Math.ceil(f.to)];
  if (f.user) { c.push(`${alias}.user_key = ?`); p.push(f.user); }
  // Hosted service: only these people's data is ever visible (an account, or a team's members)
  if (f.members) {
    if (!f.members.length) c.push('1 = 0');
    else { c.push(`${alias}.user_key IN (${f.members.map(() => '?').join(', ')})`); p.push(...f.members); }
  }
  if (f.client) {
    c.push(`${alias}.session_id IN (SELECT s.session_id FROM sessions s WHERE ${CLIENT} = ?)`);
    p.push(f.client);
  }
  if (model && f.model) { c.push(`${alias}.model = ?`); p.push(f.model); }
  if (f.scope) { const sc = scopeClause(f.scope, alias, S, { ts, org }); c.push(sc.sql); p.push(...sc.params); }
  return { sql: c.join(' AND '), params: p };
}

export function parseFilters(q) {
  const now = Date.now();
  const to = Number(q.get('to')) || now;
  const from = Number(q.get('from')) || to - 7 * 24 * HOUR;
  return {
    from, to,
    user: q.get('user') || null,
    client: q.get('client') || null,
    model: q.get('model') || null,
  };
}

// What a tool call was for, at a glance (shared with the dashboard legend).
export const TOOL_CATEGORY = `CASE
  WHEN tool_name IN ('Read', 'Grep', 'Glob', 'LS', 'NotebookRead') THEN 'read'
  WHEN tool_name IN ('Edit', 'Write', 'MultiEdit', 'NotebookEdit') THEN 'edit'
  WHEN tool_name IN ('Bash', 'BashOutput', 'KillShell', 'KillBash', 'Monitor') THEN 'run'
  WHEN tool_name IN ('WebFetch', 'WebSearch') THEN 'web'
  WHEN tool_name IN ('Agent', 'Task', 'Skill', 'Workflow') THEN 'agent'
  WHEN substr(tool_name, 1, 5) = 'mcp__' OR tool_name = 'mcp_tool' THEN 'mcp'
  ELSE 'other' END`;
export const CATEGORIES = ['read', 'edit', 'run', 'web', 'agent', 'mcp', 'other'];
const LANE_BUCKETS = 48;
const TOK = `COALESCE(input_tokens,0) + COALESCE(output_tokens,0) + COALESCE(cache_read,0) + COALESCE(cache_creation,0)`;

// Minutes east of UTC for a person's IANA time zone at a moment (falls back to the viewer's offset).
function tzOffset(fallbackMin) {
  const cache = new Map();
  return (ts, tz) => {
    if (!tz) return fallbackMin * 60_000;
    let fmt = cache.get(tz);
    if (fmt === undefined) { try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }); } catch { fmt = null; } cache.set(tz, fmt); }
    if (!fmt) return fallbackMin * 60_000;
    const v = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
    return Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute) - Math.floor(ts / 60_000) * 60_000;
  };
}

// Plan limits now, per account from its newest readings, and per window the highest across accounts. A window that
// started over since its reading (reset passed, or the reading is older than the window) is unknown, not 0: nobody
// knows what was used since (VS Code, for one, never reports). stale: no window is known any more. null: nothing seen.
const WINDOW = { five: 5 * 3600_000, week: 7 * 864e5, month: 31 * 864e5 };
// a window that has certainly started over since the reading: its reset time passed, or (no reset time known)
// the reading is older than the window itself
const startedOver = (r, k, now) => { const reset = r[k + '_reset'] == null ? null : Number(r[k + '_reset']); return reset ? reset <= now : now - Number(r[k + '_ts'] ?? r.ts) > WINDOW[k]; };
// One account, whichever source read it: the Claude app's record and Puddle's status line both read the same Claude
// account. Per window its newest reading that has the window counts (an older one from the other source is what
// was used before, not more). A reading from before its tool knew the account gives way to a newer one that does.
const orgOf = (r) => r.org || r.org_hash || '';
export function planAccounts(rows) {
  const known = new Map(); // tool → its newest reading that knows the account
  for (const r of rows) if (orgOf(r)) known.set(planTool(r.agent), Math.max(known.get(planTool(r.agent)) || 0, Number(r.ts)));
  const groups = new Map();
  for (const r of rows) {
    if (!orgOf(r) && known.get(planTool(r.agent)) >= Number(r.ts)) continue;
    const k = `${planTool(r.agent)}|${orgOf(r)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.values()].map((list) => {
    list.sort((a, b) => Number(b.ts) - Number(a.ts));
    const out = { agent: list[0].agent, label: list.find((r) => r.label)?.label || null, ts: Number(list[0].ts) };
    for (const k of ['five', 'week', 'month']) {
      const r = list.find((x) => x[k + '_pct'] != null);
      Object.assign(out, { [k + '_pct']: r ? r[k + '_pct'] : null, [k + '_reset']: r ? r[k + '_reset'] ?? null : null, [k + '_ts']: r ? Number(r.ts) : null, [k + '_from']: r?.agent || null });
    }
    return out;
  });
}
export function planNow(rows, now = Date.now()) {
  if (!rows || !rows.length) return null;
  const seen = Math.max(...rows.map((r) => Number(r.ts) || 0));
  rows = planAccounts(rows);
  const pick = (k) => {
    let best = null;
    for (const r of rows) {
      if (r[k + '_pct'] == null) continue;
      if (startedOver(r, k, now)) continue;
      const reset = r[k + '_reset'] == null ? null : Number(r[k + '_reset']), v = Number(r[k + '_pct']);
      if (!best || v > best.pct) best = { pct: v, reset: reset && reset > now ? reset : null };
    }
    return best;
  };
  const five = pick('five'), week = pick('week'), month = pick('month');
  if (!rows.some((r) => r.five_pct != null || r.week_pct != null || r.month_pct != null)) return null;
  return { stale: !five && !week && !month, five_pct: five?.pct ?? null, five_reset: five?.reset ?? null, week_pct: week?.pct ?? null, week_reset: week?.reset ?? null,
    month_pct: month?.pct ?? null, month_reset: month?.reset ?? null,
    seen,
    // each account: used now (unknown once its window started over), when it resets if known, and as of when (per
    // window, and the newest of them); the month from Puddle's status line is a gateway's spend limit
    agents: rows.map((r) => ({ agent: r.agent, label: r.label || null, five_ts: r.five_ts, week_ts: r.week_ts, month_ts: r.month_ts, month_from: r.month_from,
      five_pct: r.five_pct == null || startedOver(r, 'five', now) ? null : Number(r.five_pct), five_reset: r.five_reset && Number(r.five_reset) > now ? Number(r.five_reset) : null,
      week_pct: r.week_pct == null || startedOver(r, 'week', now) ? null : Number(r.week_pct), week_reset: r.week_reset && Number(r.week_reset) > now ? Number(r.week_reset) : null,
      month_pct: r.month_pct == null || startedOver(r, 'month', now) ? null : Number(r.month_pct), month_reset: r.month_reset && Number(r.month_reset) > now ? Number(r.month_reset) : null,
      ts: Number(r.ts) })) };
}

// A project's conversations, longest first: the top 8 by name, the rest as one "other conversations" total.
export function topConversations(list, n = 8) {
  const all = [...list].sort((a, b) => b.minutes - a.minutes), rest = all.slice(n);
  return { conversations: all.slice(0, n), more: rest.length ? { count: rest.length, minutes: Math.round(rest.reduce((a, c) => a + c.minutes, 0)) } : null };
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);

// `now` is the clock every "last N days" / "right now" reads (fixed in tests and evaluations).
// session id → its project name (repo, else folder), from sessionProjects rows
export const RUNS_PROJECT = 'Scripted runs';
const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i;
const projectOf = (rows) => ((m) => (sid) => m.get(sid) || null)(new Map(rows.map((r) => [r.session_id, r.repo || r.folder || null])));

// rollup: () => true once the summary table (collector/rollup.js) is complete and kept up to date (the team service)
export function makeQueries(db, { now: clock = () => Date.now(), rollup = () => false } = {}) {
  const S = asSql(db);
  const { all, one } = S;
  const workCache = new Map(); // the Work page's whole-range list, per view and range (work())
  // every query below filters through this (it needs the dialect for team scopes)
  const where = (f, alias, opts = {}) => baseWhere(f, alias, opts, S);
  const n = S.count, J = S.json, T = S.time;
  // Summed events over a range, as rows to add up (alias e): the summary table for the whole quarter hours inside it,
  // the events themselves for the partial quarter hours at either end, so every answer is exactly what the events
  // alone give. Columns: those in ROLLUP_COLS, with ts = when (a quarter hour's start, or the event's time) and
  // max_ts = the newest event in it. Without a complete summary: events only (n = 1 each).
  const RC = rollupColumns(S, 'x');
  const RAW = [...Object.entries(RC.dims).filter(([k]) => k !== 'bucket').map(([k, v]) => `${v} AS ${k}`), 'x.ts AS ts', 'x.ts AS max_ts',
    ...Object.entries(RC.measures).filter(([k]) => k !== 'min_ts' && k !== 'max_ts').map(([k, [v]]) => `${v} AS ${k}`)].join(', ');
  const SUMMED = [...Object.keys(RC.dims).filter((k) => k !== 'bucket').map((k) => `r.${k}`), 'r.bucket AS ts', 'r.max_ts',
    ...Object.keys(RC.measures).filter((k) => k !== 'min_ts' && k !== 'max_ts').map((k) => `r.${k}`)].join(', ');
  // The same for prompts (prompt_rollup): whole quarter hours summed, the events at the range's ends one by one
  const PC = promptColumns(S, 'x');
  const RAWP = [...Object.entries(PC.dims).filter(([k]) => k !== 'bucket').map(([k, v]) => `${v} AS ${k}`), ...Object.entries(PC.measures).map(([k, [v]]) => `${v} AS ${k}`)].join(', ');
  const SUMP = [...Object.keys(PC.dims).filter((k) => k !== 'bucket').map((k) => `r.${k}`), ...Object.keys(PC.measures).map((k) => `r.${k}`)].join(', ');
  const promptSource = (f) => {
    const raw = (from, to) => { const w = where({ ...f, from, to }, 'x'); return { sql: `SELECT ${RAWP} FROM events x WHERE x.prompt_id IS NOT NULL AND ${w.sql}`, params: w.params }; };
    const A = Math.ceil(f.from / QUARTER) * QUARTER, B = Math.floor(f.to / QUARTER) * QUARTER;
    if (!rollup() || A >= B) { const r = raw(f.from, f.to); return { sql: `(${r.sql}) e`, params: r.params }; }
    const head = raw(f.from, A), tail = raw(B, f.to), w = where({ ...f, from: A, to: B }, 'r', { ts: 'bucket', org: 'r.org' });
    return { sql: `(${head.sql} UNION ALL SELECT ${SUMP} FROM prompt_rollup r WHERE ${w.sql} UNION ALL ${tail.sql}) e`, params: [...head.params, ...w.params, ...tail.params] };
  };
  // The same for tasks (task_rollup): what each prompt and everything it set off cost, by part
  const TC = taskColumns(S, 'x');
  const RAWT = [...Object.entries(TC.dims).filter(([k]) => k !== 'bucket').map(([k, v]) => `${v} AS ${k}`), ...Object.entries(TC.measures).map(([k, [v]]) => `${v} AS ${k}`)].join(', ');
  const SUMT = [...Object.keys(TC.dims).filter((k) => k !== 'bucket').map((k) => `r.${k}`), ...Object.keys(TC.measures).map((k) => `r.${k}`)].join(', ');
  const TASK_IN = TASK_NAMES.map((x) => `'${x}'`).join(', ');
  const taskSource = (f) => {
    const raw = (from, to) => { const w = where({ ...f, from, to }, 'x'); return { sql: `SELECT ${RAWT} FROM events x WHERE x.prompt_id IS NOT NULL AND x.name IN (${TASK_IN}) AND ${w.sql}`, params: w.params }; };
    const A = Math.ceil(f.from / QUARTER) * QUARTER, B = Math.floor(f.to / QUARTER) * QUARTER;
    if (!rollup() || A >= B) { const r = raw(f.from, f.to); return { sql: `(${r.sql}) e`, params: r.params }; }
    const head = raw(f.from, A), tail = raw(B, f.to), w = where({ ...f, from: A, to: B }, 'r', { ts: 'bucket', org: 'r.org' });
    return { sql: `(${head.sql} UNION ALL SELECT ${SUMT} FROM task_rollup r WHERE ${w.sql} UNION ALL ${tail.sql}) e`, params: [...head.params, ...w.params, ...tail.params] };
  };
  // each prompt (a task) once: what it cost, its tokens, and the context its own conversation's calls ran at
  const perPrompt = (src) => all(`SELECT e.user_key, e.session_id, e.prompt_id, SUM(e.cost) cost, SUM(CASE WHEN e.part LIKE 'agent:%' THEN e.cost END) agent_cost, SUM(e.agents) agents,
      SUM(CASE WHEN e.part = 'main' THEN e.cache_read END) main_read, SUM(CASE WHEN e.part = 'main' THEN e.calls END) main_calls,
      SUM(CASE WHEN e.part = 'main' THEN COALESCE(e.input, 0) + COALESCE(e.cache_read, 0) + COALESCE(e.cache_creation, 0) END) main_in,
      SUM(COALESCE(e.input, 0) + COALESCE(e.output, 0) + COALESCE(e.cache_read, 0) + COALESCE(e.cache_creation, 0)) tok, SUM(e.calls) calls, MIN(e.min_ts) t0,
      SUM(e.input) inp, SUM(e.output) out, SUM(e.cache_read) cr, SUM(e.cache_creation) cw
    FROM ${src.sql} GROUP BY 1, 2, 3`, src.params);
  // a prompt as a point on a chart: when, what it spent, the context per call, its tokens (all, then input, output,
  // cache read, cache write), who
  const promptPoint = (r) => ({ t: Number(r.t0) || 0, cost: Math.round((Number(r.cost) || 0) * 1000) / 1000, ctx: Number(r.main_calls) ? Math.round(Number(r.main_in) / Number(r.main_calls)) : null,
    tok: Number(r.tok) || 0, calls: Number(r.calls) || 0, agents: Number(r.agents) || 0, u: r.user_key, s: r.session_id,
    inp: Number(r.inp) || 0, out: Number(r.out) || 0, cr: Number(r.cr) || 0, cw: Number(r.cw) || 0 });
  // Active time from the stored runs (collector/rollup.js): per person, each conversation's runs cut to the range
  // [from, to). A run across either end is cut at its first or last step inside, looked up from the events.
  const activeRuns = async (f) => {
    const from = Math.floor(f.from), to = Math.ceil(f.to);
    const w = where({ ...f, from: 0, to: 8.64e15 }, 'r', { ts: 'start_ts', org: 'r.org' });
    const runs = await all(`SELECT r.user_key, r.session_id, r.org, r.start_ts, r.end_ts FROM active_run r WHERE r.end_ts >= ? AND r.start_ts < ? AND ${w.sql}`, [from, to, ...w.params]);
    const names = ACTIVE_NAMES.map((x) => `'${x}'`).join(', '), org = J('e.attrs_json', 'context.org');
    const out = new Map();
    for (const r of runs) {
      let a = Number(r.start_ts), b = Number(r.end_ts);
      if (a < from || b >= to) {
        const c = await one(`SELECT MIN(ts) a, MAX(ts) b FROM events e WHERE e.session_id = ? AND e.name IN (${names}) AND ${org} IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts <= ?`,
          [r.session_id, r.org, Math.max(a, from), Math.min(b, to - 1)]);
        if (c?.a == null) continue;
        a = Number(c.a); b = Number(c.b);
      }
      if (!out.has(r.user_key)) out.set(r.user_key, []);
      out.get(r.user_key).push({ session: r.session_id, a, b });
    }
    return out;
  };
  // runs → active stretches, parallel conversations once (what activeSegments gives from the steps themselves)
  const unionRuns = (list) => {
    const segs = (list || []).filter((x) => x.b > x.a).map((x) => [x.a, x.b]).sort((x, y) => x[0] - y[0]), out = [];
    for (const s1 of segs) { const last = out[out.length - 1]; if (last && s1[0] <= last[1]) last[1] = Math.max(last[1], s1[1]); else out.push([...s1]); }
    return out;
  };  // each conversation's active minutes and when it was last worked on: from the stored runs ({session, a, b} per
  // person), else from the steps themselves ({session, ts} per person)
  const sessionTimes = (runs, rows) => {
    const min = new Map(), last = new Map(), by = new Map();
    for (const list of (runs || rows || new Map()).values()) for (const r of list) { if (!by.has(r.session)) by.set(r.session, []); by.get(r.session).push(r); }
    for (const [sid, list] of by) {
      min.set(sid, (runs ? unionRuns(list) : activeSegments(list)).reduce((a, [x, y]) => a + (y - x) / 60_000, 0));
      last.set(sid, list.reduce((m, x) => Math.max(m, runs ? x.b : Number(x.ts)), 0));
    }
    return { min, last };
  };
  const sessionTimesIn = async (f) => {
    if (rollup()) return sessionTimes(await activeRuns(f), null);
    const w = where(f, 'e');
    const rows = await all(`SELECT e.session_id session, ts FROM events e WHERE name IN ('user_prompt', 'api_request', 'tool_result') AND ${w.sql}`, w.params);
    return sessionTimes(null, new Map([['all', rows]]));
  };

  // cuts: times something is split at (the activity lane's slices): a quarter hour containing one comes from the
  // events too, so each event lands on its own side. rawOnly: events only (slices shorter than a quarter hour).
  const source = (f, { names = null, model = false, cuts = [], rawOnly = false } = {}) => {
    const nm = (a) => (names ? ` AND ${a}.name IN (${names.map((x) => `'${x}'`).join(', ')})` : '');
    const raw = (from, to) => { const w = where({ ...f, from, to }, 'x', { model }); return { sql: `SELECT ${RAW} FROM events x WHERE ${w.sql}${nm('x')}`, params: w.params }; };
    const A = Math.ceil(f.from / QUARTER) * QUARTER, B = Math.floor(f.to / QUARTER) * QUARTER;
    if (rawOnly || !rollup() || A >= B) { const r = raw(f.from, f.to); return { sql: `(${r.sql}) e`, params: r.params }; }
    const split = [...new Set(cuts.filter((t) => t % QUARTER !== 0).map((t) => t - (t % QUARTER)))].filter((q) => q >= A && q < B).sort((a, b) => a - b);
    const parts = [raw(f.from, A), ...split.map((q) => raw(q, q + QUARTER)), raw(B, f.to)];
    const w = where({ ...f, from: A, to: B }, 'r', { model, ts: 'bucket', org: 'r.org' });
    const skip = split.length ? ` AND r.bucket NOT IN (${split.join(', ')})` : '';
    return { sql: `(${parts.map((x) => x.sql).join(' UNION ALL ')} UNION ALL SELECT ${SUMMED} FROM event_rollup r WHERE ${w.sql}${nm('r')}${skip}) e`,
      params: [...parts.flatMap((x) => x.params), ...w.params] };
  };

  return {
    sql: S,

    async summary(f) {
      const w = where(f, 'e', { model: true });
      const api = await one(`SELECT COUNT(*) requests, SUM(cost_usd) cost, SUM(input_tokens) input, SUM(output_tokens) output,
          SUM(cache_read) cache_read, SUM(cache_creation) cache_creation
        FROM events e WHERE name = 'api_request' AND ${w.sql}`, w.params);
      const we = where(f, 'e');
      const ev = await one(`SELECT
          ${n(`name = 'user_prompt'`)} prompts,
          AVG(CASE WHEN name = 'user_prompt' THEN prompt_length END) avg_prompt_len,
          ${n(`name = 'tool_result'`)} tool_calls,
          ${n(`name = 'tool_result' AND success = 0`)} tool_failures,
          ${n(`name = 'api_error'`)} api_errors,
          COUNT(DISTINCT CASE WHEN name = 'user_prompt' THEN session_id END) sessions,
          ${n(`source = 'transcript'`)} recovered
        FROM events e WHERE ${we.sql}`, we.params);
      const wm = where(f, 'm');
      const metrics = {};
      for (const r of await all(`SELECT name, type, SUM(value) v FROM metric_points m WHERE ${wm.sql} GROUP BY name, type`, wm.params)) {
        metrics[`${r.name}${r.type ? '.' + r.type : ''}`] = r.v;
      }
      return {
        cost: api.cost || 0,
        requests: api.requests || 0,
        tokens: { input: api.input || 0, output: api.output || 0, cacheRead: api.cache_read || 0, cacheCreation: api.cache_creation || 0 },
        prompts: ev.prompts || 0,
        avgPromptLength: ev.avg_prompt_len ? Math.round(ev.avg_prompt_len) : null,
        toolCalls: ev.tool_calls || 0,
        toolFailures: ev.tool_failures || 0,
        apiErrors: ev.api_errors || 0,
        sessions: ev.sessions || 0,
        recovered: ev.recovered || 0,
        activeSeconds: { user: metrics['active_time.total.user'] || 0, cli: metrics['active_time.total.cli'] || 0 },
        lines: { added: metrics['lines_of_code.count.added'] || 0, removed: metrics['lines_of_code.count.removed'] || 0 },
        commits: metrics['commit.count'] || 0,
        pullRequests: metrics['pull_request.count'] || 0,
      };
    },

    async timeseries(f) {
      const hourly = f.to - f.from <= 48 * HOUR;
      const bucket = T('ts', hourly ? 'hour' : 'day', { local: true });
      const w = source(f, { names: ['api_request'], model: true });
      const rowsP = all(`SELECT ${bucket} bucket,
          SUM(input) input, SUM(output) output, SUM(cache_read) "cacheRead", SUM(cache_creation) "cacheCreation",
          SUM(cost) cost, SUM(n) requests, COUNT(DISTINCT session_id) sessions
        FROM ${w.sql} GROUP BY bucket ORDER BY bucket`, w.params);
      const wp = source(f, { names: ['user_prompt'] });
      const [rows, prompts] = await Promise.all([rowsP, all(`SELECT ${bucket} bucket, SUM(n) n FROM ${wp.sql} GROUP BY bucket ORDER BY bucket`, wp.params)]);
      return { granularity: hourly ? 'hour' : 'day', rows, prompts };
    },

    async models(f) {
      const w = where(f, 'e', { model: true });
      return all(`SELECT COALESCE(model, 'unknown') model, COUNT(*) requests, SUM(cost_usd) cost, SUM(${TOK}) tokens
        FROM events e WHERE name = 'api_request' AND ${w.sql} GROUP BY 1 ORDER BY cost DESC NULLS LAST, 1`, w.params);
    },

    // calls and failures per tool, exactly, from the summary; typical and slowest times (p50, p95) from the range's
    // 5,000 newest calls (every call's time over 90 days was the dearest read on the page)
    async tools(f) {
      const st = source(f, { names: ['tool_result'] });
      const by = new Map();
      for (const r of await all(`SELECT tool_name, SUM(n) calls, SUM(fails) fails FROM ${st.sql} GROUP BY 1`, st.params)) {
        const k = r.tool_name || 'unknown', t = by.get(k) || { tool: k, calls: 0, failures: 0, d: [] };
        t.calls += Number(r.calls) || 0; t.failures += Number(r.fails) || 0; by.set(k, t);
      }
      const w = where(f, 'e');
      for (const r of await all(`SELECT tool_name, duration_ms FROM events e WHERE name = 'tool_result' AND duration_ms IS NOT NULL AND ${w.sql} ORDER BY ts DESC LIMIT 5000`, w.params)) {
        const t = by.get(r.tool_name || 'unknown'); if (t) t.d.push(r.duration_ms);
      }
      const sd = source(f, { names: ['tool_decision'] });
      const dec = await all(`SELECT tool_name, decision, SUM(n) n FROM ${sd.sql} GROUP BY 1, 2`, sd.params);
      const out = [...by.values()].map((t) => {
        t.d.sort((a, b) => a - b);
        return { tool: t.tool, calls: t.calls, failures: t.failures, p50: pct(t.d, 50), p95: pct(t.d, 95), accepted: 0, rejected: 0 };
      });
      for (const d of dec) {
        let r = out.find((x) => x.tool === (d.tool_name || 'unknown'));
        if (!r) { r = { tool: d.tool_name || 'unknown', calls: 0, failures: 0, p50: null, p95: null, accepted: 0, rejected: 0 }; out.push(r); }
        if (/accept/i.test(d.decision || '')) r.accepted += d.n; else r.rejected += d.n;
      }
      return out.sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
    },

    async users(f) {
      const w = where(f, 'e');
      return all(`SELECT u.user_key, u.email, u.organization_id, u.last_seen, u.name, u.country, u.timezone, u.first_seen,
          (SELECT MAX(x.ts) FROM events x WHERE x.user_key = u.user_key AND x.name IN ('user_prompt', 'api_request', 'tool_result')) last_active,
          (SELECT sl.five_pct FROM statusline_samples sl JOIN sessions ss ON ss.session_id = sl.session_id
             WHERE ss.user_key = u.user_key AND sl.five_pct IS NOT NULL ORDER BY sl.ts DESC LIMIT 1) five_pct,
          (SELECT sl.week_pct FROM statusline_samples sl JOIN sessions ss ON ss.session_id = sl.session_id
             WHERE ss.user_key = u.user_key AND sl.week_pct IS NOT NULL ORDER BY sl.ts DESC LIMIT 1) week_pct,
          SUM(CASE WHEN e.name = 'api_request' THEN e.cost_usd END) cost,
          SUM(CASE WHEN e.name = 'api_request' THEN ${TOK} END) tokens,
          ${n(`e.name = 'user_prompt'`)} prompts,
          COUNT(DISTINCT e.session_id) sessions
        FROM users u LEFT JOIN events e ON e.user_key = u.user_key AND ${w.sql}
        GROUP BY u.user_key ORDER BY cost DESC NULLS LAST, u.last_seen DESC, u.user_key`, w.params);
    },

    async feed(f, limit = 60) {
      const w = where(f, 'e');
      // the newest rows first, then who and in which app for just those (joining before the limit joined every row of
      // the range: 3.3 s for a week of a team's events, 22 Oct 2026)
      return all(`SELECT f.*, u.email, s.entrypoint client FROM (
          SELECT e.id, e.ts, e.name, e.tool_name, e.success, e.duration_ms, e.model, e.cost_usd,
            e.input_tokens, e.output_tokens, e.cache_read, e.cache_creation, e.prompt_length, e.decision, e.error, e.user_key, e.session_id, e.source, e.agent
          FROM events e WHERE ${w.sql} ORDER BY e.ts DESC, e.id DESC LIMIT ?) f
        LEFT JOIN users u ON u.user_key = f.user_key LEFT JOIN sessions s ON s.session_id = f.session_id
        ORDER BY f.ts DESC, f.id DESC`, [...w.params, limit]);
    },

    // Last 60 minutes, per minute, plus sessions active in the last 15 minutes.
    async live(f) {
      const now = clock();
      const lf = { ...f, from: now - 60 * 60_000, to: now + 60_000 };
      const w = where(lf, 'e', { model: true });
      const minute = T('ts', 'minute', { local: true });
      const minutes = await all(`SELECT ${minute} bucket,
          SUM(CASE WHEN name = 'api_request' THEN input_tokens END) input, SUM(CASE WHEN name = 'api_request' THEN output_tokens END) output,
          SUM(CASE WHEN name = 'api_request' THEN cache_read END) "cacheRead", SUM(CASE WHEN name = 'api_request' THEN cache_creation END) "cacheCreation",
          SUM(CASE WHEN name = 'api_request' THEN cost_usd END) cost, ${n(`name = 'api_request'`)} requests,
          ${n(`name = 'user_prompt'`)} prompts, ${n(`name = 'tool_result'`)} tools
        FROM events e WHERE ${w.sql} GROUP BY bucket ORDER BY bucket`, w.params);
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const wt = where({ ...f, from: midnight.getTime(), to: now + 60_000 }, 'e', { model: true });
      const today = await one(`SELECT SUM(cost_usd) cost, SUM(${TOK}) tokens,
          COUNT(*) requests FROM events e WHERE name = 'api_request' AND ${wt.sql}`, wt.params);
      const wtp = where({ ...f, from: midnight.getTime(), to: now + 60_000 }, 'e');
      const todayPrompts = (await one(`SELECT COUNT(*) n FROM events e WHERE name = 'user_prompt' AND ${wtp.sql}`, wtp.params)).n;
      const wa = where({ ...f, from: now - 15 * 60_000, to: now + 60_000 }, 'e');
      const active = await all(`SELECT e.session_id, MAX(e.ts) last_ts, ${CLIENT} client, u.email, s.first_seen,
          (SELECT model FROM events x WHERE x.session_id = e.session_id AND x.name = 'api_request' ORDER BY x.ts DESC LIMIT 1) model,
          (SELECT name || '|' || COALESCE(tool_name, '') FROM events x WHERE x.session_id = e.session_id AND x.name IN ('user_prompt', 'api_request', 'tool_result', 'api_error') ORDER BY x.ts DESC, x.id DESC LIMIT 1) last_event
        FROM events e JOIN sessions s ON s.session_id = e.session_id LEFT JOIN users u ON u.user_key = s.user_key
        WHERE e.name IN ('user_prompt', 'api_request', 'tool_result') AND ${wa.sql}
        GROUP BY e.session_id, s.session_id, u.email ORDER BY last_ts DESC LIMIT 12`, wa.params);
      for (const a of active) {
        Object.assign(a, await one(`SELECT SUM(CASE WHEN name = 'api_request' THEN cost_usd END) cost,
            SUM(CASE WHEN name = 'api_request' THEN ${TOK} END) tokens,
            ${n(`name = 'user_prompt'`)} prompts, ${n(`name = 'tool_result'`)} tools, ${n(`name = 'api_request'`)} requests
          FROM events WHERE session_id = ?`, [a.session_id]));
      }
      return { minutes, today: { ...today, prompts: todayPrompts }, active, now };
    },

    // Visual insights: time-of-day heatmap, prompt lengths, waiting time, context use.
    async insights(f) {
      const w = where(f, 'e');
      const heat = await all(`SELECT ${T('ts', 'dow', { local: true })} AS dow, ${T('ts', 'hourOfDay', { local: true })} AS hour,
          ${n(`name = 'user_prompt'`)} prompts, ${n(`name = 'api_request'`)} requests,
          SUM(CASE WHEN name = 'api_request' THEN ${TOK} END) tokens,
          SUM(CASE WHEN name = 'api_request' THEN cost_usd END) cost
        FROM events e WHERE name IN ('user_prompt', 'api_request') AND ${w.sql} GROUP BY 1, 2 ORDER BY 1, 2`, w.params);

      const promptLengths = (await all(`SELECT prompt_length FROM events e WHERE name = 'user_prompt' AND prompt_length IS NOT NULL AND ${w.sql} ORDER BY ts, id`, w.params))
        .map((r) => r.prompt_length);

      // One row per prompt ("turn"): how long you waited, and on what.
      const wpq = where(f, 'p');
      const turns = (await all(`SELECT p.prompt_id, p.ts start, p.session_id,
          (SELECT MAX(a.ts) FROM events a WHERE a.prompt_id = p.prompt_id AND a.name IN ('api_request', 'assistant_response', 'tool_result')) end_ts,
          (SELECT SUM(t.duration_ms) FROM events t WHERE t.prompt_id = p.prompt_id AND t.name = 'tool_result') tool_ms,
          (SELECT ${J('a.attrs_json', 'ttft_ms', 'float')} FROM events a WHERE a.prompt_id = p.prompt_id AND a.name = 'api_request' ORDER BY a.ts LIMIT 1) ttft_ms,
          (SELECT COUNT(*) FROM events a WHERE a.prompt_id = p.prompt_id AND a.name = 'api_request') requests
        FROM events p WHERE p.name = 'user_prompt' AND p.prompt_id IS NOT NULL AND ${wpq.sql}
        ORDER BY p.ts, p.id`, wpq.params))
        .filter((t) => t.end_ts && t.end_ts >= t.start)
        .map((t) => {
          const wall = t.end_ts - t.start;
          const tool = Math.min(wall, t.tool_ms || 0);
          return { start: t.start, wall_ms: wall, tool_ms: tool, claude_ms: wall - tool, ttft_ms: t.ttft_ms, requests: t.requests };
        });

      // Context in use per request = everything the model read for that request.
      const wm = where(f, 'e', { model: true });
      const ctx = (await all(`SELECT ts, session_id, model,
          COALESCE(input_tokens,0) + COALESCE(cache_read,0) + COALESCE(cache_creation,0) ctx
        FROM events e WHERE name = 'api_request' AND ${wm.sql}
          AND COALESCE(${J('attrs_json', 'query_source')}, 'main') NOT IN ('compact')
        ORDER BY ts, id`, wm.params)).map((r) => ({ ...r, window: contextWindow(r.model) }));
      const bySession = new Map();
      for (const r of ctx) {
        if (!bySession.has(r.session_id)) bySession.set(r.session_id, []);
        bySession.get(r.session_id).push([r.ts, r.ctx, r.window]);
      }
      const sessions = [...bySession.entries()]
        .map(([id, pts]) => ({ session_id: id, last: pts[pts.length - 1][0], points: pts.slice(-200) }))
        .sort((a, b) => b.last - a.last).slice(0, 6);
      for (const s1 of sessions) s1.client = (await one(`SELECT ${CLIENT} client FROM sessions s WHERE s.session_id = ?`, [s1.session_id]))?.client || 'unknown';

      // Plan limits come only from the status line (terminal sessions, Pro/Max plans).
      const nowS = Math.floor(clock() / 1000);
      const latest = (col, reset) => one(`SELECT ts, ${col} pct, ${reset} reset FROM statusline_samples
          WHERE ${col} IS NOT NULL AND (${reset} IS NULL OR ${reset} > ?) ORDER BY ts DESC LIMIT 1`, [nowS]);
      const limitTrend = await all(`SELECT ts, five_pct, week_pct FROM statusline_samples
          WHERE (five_pct IS NOT NULL OR week_pct IS NOT NULL) AND ts > ? ORDER BY ts`, [clock() - 7 * 86400_000]);
      const statusline = await one(`SELECT COUNT(*) n, MAX(ts) last FROM statusline_samples`, []);
      // Exact context % from the status line where available (keyed by session).
      for (const s1 of sessions) s1.exact = await one(`SELECT ctx_pct, ctx_size FROM statusline_samples WHERE session_id = ? AND ctx_pct IS NOT NULL ORDER BY ts DESC LIMIT 1`, [s1.session_id]);
      return {
        heat, promptLengths, turns, contextSessions: sessions,
        limits: { five: await latest('five_pct', 'five_reset'), week: await latest('week_pct', 'week_reset'), trend: limitTrend, statusline },
      };
    },

    // Timeline at any precision: buckets of `bucketMin` minutes aligned to the
    // viewer's local clock (tzMin = minutes east of UTC), plus exact-time
    // events and session spans for the lanes below the bars.
    async timeline(f, bucketMin, tzMin, fit = false) {
      // Auto-fit: if activity only covers a small part of the window, frame
      // the active part (with a little lead-in) so it isn't squeezed into a corner.
      let fitted = false;
      if (fit) {
        const wf = where(f, 'e');
        const first = (await one(`SELECT MIN(ts) t FROM events e WHERE name IN ('api_request', 'user_prompt', 'tool_result') AND ${wf.sql}`, wf.params)).t;
        if (first && f.to - first < 0.6 * (f.to - f.from)) {
          const lead = Math.max(10 * 60_000, 0.08 * (f.to - first));
          const from = Math.max(f.from, Math.min(first - lead, f.to - 30 * 60_000));
          if (from > f.from) { f = { ...f, from: Math.floor(from) }; fitted = true; }
        }
      }
      if (!bucketMin) bucketMin = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].find((m) => (f.to - f.from) / (m * 60_000) <= 120) || 1440;
      const B = Math.max(1, Math.round(bucketMin)) * 60_000, off = Math.round(tzMin || 0) * 60_000;
      // floor((ts + off) / B) for positive ts: integer division in both databases
      const bucket = `(CAST((ts + ${off}) / ${B} AS BIGINT) * ${B} - ${off})`;
      const w = where(f, 'e', { model: true });
      const buckets = await all(`SELECT ${bucket} t,
          SUM(CASE WHEN name = 'api_request' THEN input_tokens END) input, SUM(CASE WHEN name = 'api_request' THEN output_tokens END) output,
          SUM(CASE WHEN name = 'api_request' THEN cache_read END) "cacheRead", SUM(CASE WHEN name = 'api_request' THEN cache_creation END) "cacheCreation",
          SUM(CASE WHEN name = 'api_request' THEN cost_usd END) cost, ${n(`name = 'api_request'`)} requests,
          ${n(`name = 'user_prompt'`)} prompts, ${n(`name = 'tool_result'`)} tools,
          ${n(`(name = 'tool_result' AND success = 0) OR name = 'api_error'`)} fails
        FROM events e WHERE name IN ('api_request', 'user_prompt', 'tool_result', 'api_error') AND ${w.sql}
        GROUP BY 1 ORDER BY 1`, w.params);
      const byUser = await all(`SELECT ${bucket} t, user_key, SUM(${TOK}) tokens
        FROM events e WHERE name = 'api_request' AND ${w.sql} GROUP BY 1, 2 ORDER BY 1, 2`, w.params);
      const we = where(f, 'e');
      const events = await all(`SELECT ts, name, success, user_key, tool_name FROM events e
        WHERE name IN ('user_prompt', 'tool_result', 'api_error') AND ${we.sql} ORDER BY ts, id LIMIT 5000`, we.params);
      const sessions = await all(`SELECT e.session_id, s.user_key, ${CLIENT} client, MIN(e.ts) start, MAX(e.ts) "end",
          ${n(`e.name = 'user_prompt'`)} prompts, ${n(`e.name = 'tool_result'`)} tools,
          SUM(CASE WHEN e.name = 'api_request' THEN e.cost_usd END) cost
        FROM events e JOIN sessions s ON s.session_id = e.session_id
        WHERE e.name IN ('user_prompt', 'api_request', 'tool_result') AND ${we.sql}
        GROUP BY e.session_id, s.session_id ORDER BY start, e.session_id LIMIT 60`, we.params);
      return { bucketMs: B, from: f.from, to: f.to, fitted, buckets, byUser, events, sessions };
    },

    // Tokens per local day and person (the team calendar's hover): only days someone used tokens.
    async daysByUser(f, tzMin) {
      const day = T('ts', 'day', { offSec: Math.round(tzMin || 0) * 60 });
      const w = where(f, 'e');
      const src = source(f, { names: ['api_request'] });
      return all(`SELECT ${day} AS day, user_key, SUM(tok) tokens FROM ${src.sql} GROUP BY 1, 2 HAVING SUM(tok) > 0 ORDER BY 1`, src.params);
    },

    // Lines added and removed, per project (projectOf(session) → its name) and local day: how each project grows or
    // shrinks. The 5 busiest projects by name, the rest as "Other".
    async codeLines(f, tzMin, projectOf = () => null) {
      const day = T('ts', 'day', { offSec: Math.round(tzMin || 0) * 60 });
      const w = where(f, 'e');
      const rows = await all(`SELECT ${day} AS day, e.session_id, SUM(${J('attrs_json', 'added', 'int')}) added, SUM(${J('attrs_json', 'removed', 'int')}) removed
        FROM events e WHERE e.name = 'code_lines' AND ${w.sql} GROUP BY 1, 2`, w.params);
      const by = new Map();
      for (const r of rows) {
        const name = projectOf(r.session_id) || 'Other', p = by.get(name) || { name, added: 0, removed: 0, days: new Map() };
        const d = p.days.get(r.day) || { day: r.day, added: 0, removed: 0 };
        d.added += Number(r.added) || 0; d.removed += Number(r.removed) || 0; p.days.set(r.day, d);
        p.added += Number(r.added) || 0; p.removed += Number(r.removed) || 0; by.set(name, p);
      }
      const all5 = [...by.values()].sort((a, b) => (b.added + b.removed) - (a.added + a.removed));
      const top = all5.filter((p) => p.name !== 'Other').slice(0, 5), rest = all5.filter((p) => !top.includes(p));
      if (rest.length) {
        const o = { name: 'Other', added: 0, removed: 0, days: new Map() };
        for (const p of rest) { o.added += p.added; o.removed += p.removed; for (const d of p.days.values()) { const x = o.days.get(d.day) || { day: d.day, added: 0, removed: 0 }; x.added += d.added; x.removed += d.removed; o.days.set(d.day, x); } }
        top.push(o);
      }
      return top.map((p) => ({ ...p, days: [...p.days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)) }));
    },

    // Per local day (tzMin = minutes east of UTC) for streaks and the "today" tower.
    async days(f, tzMin) {
      const day = T('ts', 'day', { offSec: Math.round(tzMin || 0) * 60 });
      const w = where(f, 'e');
      const src = source(f, { names: ['user_prompt', 'api_request', 'tool_result'] });
      return all(`SELECT ${day} AS day,
          SUM(CASE WHEN name = 'user_prompt' THEN n ELSE 0 END) prompts, SUM(CASE WHEN name = 'tool_result' THEN n ELSE 0 END) tools,
          SUM(CASE WHEN name = 'api_request' THEN tok END) tokens,
          COUNT(DISTINCT CASE WHEN name IN ('user_prompt', 'api_request') THEN session_id END) sessions
        FROM ${src.sql} GROUP BY 1 ORDER BY 1`, src.params);
    },

    // Everything a manager needs per person, for the range and the period before it.
    // parts: 'all' (everything, one answer), or 'core' (the table, headline and flags; the calendar and code
    // changes then come from teamCalendar / teamLines, loaded when their cards are on screen)
    // skip: parts of the answer the viewer's hidden cards would need ('recent': the projects behind "What the team is
    // on"; 'features': the names behind "Features in use"). The rest is shared by many cards, so it's always worked out.
    async team(f, tzMin = 0, { single = false, parts = 'all', skip = [] } = {}) {
      const core = parts === 'core', skips = new Set(skip);
      const day = T('ts', 'day', { offSec: Math.round(tzMin) * 60 });
      const len = f.to - f.from;
      const w = where(f, 'e');
      const wp = where({ ...f, from: f.from - len, to: f.from }, 'e');
      const users = (await all(`SELECT user_key, email, name, country, timezone, first_seen FROM users ORDER BY first_seen, user_key`, []))
        .filter((u) => !f.members || f.members.includes(u.user_key));
      const per = async (sql, params) => { const m = new Map(); for (const r of await all(sql, params)) m.set(r.user_key, r); return m; };
      const group = async (sql, params) => { const m = new Map(); for (const r of await all(sql, params)) { if (!m.has(r.user_key)) m.set(r.user_key, []); m.get(r.user_key).push(r); } return m; };
      // The most recent row per person (portable "latest row per group").
      const latestPer = (cols, from, cond, params) => per(`SELECT ${cols} FROM (SELECT ${cols}, ROW_NUMBER() OVER (PARTITION BY user_key ORDER BY ts DESC, id DESC) rn
          FROM ${from} WHERE ${cond}) x WHERE rn = 1`, params);

      // sums over the range: summary rows plus the events at its ends (see `source`)
      const sw = source(f), sp = source({ ...f, from: f.from - len, to: f.from });
      const add = (cond, col = 'n') => `SUM(CASE WHEN ${cond} THEN ${col} ELSE 0 END)`;
      const stat$ = per(`SELECT e.user_key,
          ${add(`name = 'user_prompt'`)} prompts,
          COUNT(DISTINCT CASE WHEN name = 'user_prompt' THEN session_id END) sessions,
          ${add(`name = 'api_request'`)} requests,
          ${add(`name = 'api_request' AND sub = 0`)} main_requests,
          SUM(CASE WHEN name = 'api_request' THEN tok END) tokens,
          SUM(CASE WHEN name = 'api_request' THEN cost END) cost,
          SUM(CASE WHEN name = 'api_request' THEN cache_read END) cache_read,
          SUM(CASE WHEN name = 'api_request' THEN input_all END) input_all,
          ${add(`name = 'tool_result'`)} tools, ${add(`name = 'tool_result'`, 'fails')} tool_fail,
          ${add(`name = 'api_error'`)} api_errors,
          SUM(CASE WHEN name = 'user_prompt' THEN plen_sum END) * 1.0 / NULLIF(SUM(CASE WHEN name = 'user_prompt' THEN plen_n END), 0) avg_prompt,
          ${add(`name = 'tool_decision' AND by_user = 1`)} asks,
          ${add(`name = 'tool_decision' AND decision LIKE '%reject%'`)} rejects,
          ${add(`name = 'tool_decision'`)} decisions,
          ${add(`name = 'skill_activated'`)} skills,
          ${add(`name = 'subagent_completed'`)} subagents,
          ${add(`name = 'tool_result' AND tool_name IN ('WebFetch', 'WebSearch')`)} web,
          ${add(`name = 'tool_result' AND tool_name IN ('Edit', 'Write', 'MultiEdit', 'NotebookEdit')`)} edits,
          ${add(`name = 'at_mention'`)} mentions,
          ${add(`name = 'api_request' AND label IS NOT NULL`)} mcp,
          ${add(`name = 'compaction'`)} compactions,
          MAX(CASE WHEN name IN ('user_prompt', 'api_request', 'tool_result') THEN max_ts END) last_active,
          COUNT(DISTINCT CASE WHEN name = 'user_prompt' THEN ${day} END) active_days
        FROM ${sw.sql} GROUP BY e.user_key`, sw.params);
      const prev$ = per(`SELECT e.user_key, ${add(`name = 'user_prompt'`)} prompts, SUM(CASE WHEN name = 'api_request' THEN tok END) tokens,
          COUNT(DISTINCT CASE WHEN name = 'user_prompt' THEN session_id END) sessions
        FROM ${sp.sql} GROUP BY e.user_key`, sp.params);
      const sReq = source(f, { names: ['api_request'] });
      const models$ = group(`SELECT e.user_key, model, SUM(tok) tokens FROM ${sReq.sql} GROUP BY 1, 2 ORDER BY 3 DESC, 2`, sReq.params);
      const effort$ = group(`SELECT e.user_key, COALESCE(effort, 'default') effort, SUM(n) n FROM ${sReq.sql} GROUP BY 1, 2 ORDER BY 1, 2`, sReq.params);
      const sPr = source(f, { names: ['user_prompt'] }), sPrReq = source(f, { names: ['user_prompt', 'api_request'] });
      const clients$ = group(`SELECT e.user_key, ${CLIENT} client, COUNT(DISTINCT e.session_id) n FROM ${sPr.sql} JOIN sessions s ON s.session_id = e.session_id
          GROUP BY 1, 2 ORDER BY 3 DESC, 2`, sPr.params);
      // right now: the app each person works in (their latest session) and their latest effort level (later rows win)
      const clientNow$ = per(`SELECT user_key, client FROM (SELECT e.user_key, ${CLIENT} client, MAX(e.max_ts) t FROM ${sPrReq.sql} JOIN sessions s ON s.session_id = e.session_id
          GROUP BY 1, 2) x ORDER BY t`, sPrReq.params);
      const effortNow$ = per(`SELECT user_key, effort FROM (SELECT e.user_key, effort, MAX(e.max_ts) t FROM ${sReq.sql} WHERE effort IS NOT NULL GROUP BY 1, 2) x ORDER BY t`, sReq.params);
      // how full conversations get: per session, the most of the model's window one call used (window from the
      // call itself when the tool says it, e.g. Codex; else the model's known size)
      const ctxRows$ = group(`SELECT e.user_key, e.session_id, e.model, MAX(ctx_max) used, MAX(win_max) win FROM ${sReq.sql} WHERE compact = 0 GROUP BY 1, 2, 3`, sReq.params);
      const contextOf = (k) => {
        const peaks = (ctxRows.get(k) || []).map((r) => Math.min(1, Number(r.used) / (Number(r.win) || contextWindow(r.model)))).filter((x) => x > 0).sort((a, b) => a - b);
        if (!peaks.length) return null;
        return { typical: Math.round(peaks[Math.floor((peaks.length - 1) / 2)] * 100), max: Math.round(peaks[peaks.length - 1] * 100), full: peaks.filter((x) => x >= 0.9).length, sessions: peaks.length };
      };
      const sNames = source(f, { names: ['skill_activated', 'api_request', 'subagent_completed'] });
      const names$ = skips.has('features') ? Promise.resolve(new Map()) : group(`SELECT e.user_key, CASE name WHEN 'skill_activated' THEN 'skill' WHEN 'api_request' THEN 'mcp' ELSE 'agent' END kind, label, SUM(n) n
          FROM ${sNames.sql} WHERE label IS NOT NULL GROUP BY 1, 2, 3 ORDER BY 4 DESC, 3`, sNames.params);
      // only this view's people (a team's members), never everyone on the service
      const mem = f.members ? { sql: `user_key IN (${f.members.map(() => '?').join(', ') || 'NULL'})`, p: f.members } : { sql: '1 = 1', p: [] };
      // plugins loaded in the last 90 days (not every load ever)
      const plugins$ = skips.has('features') ? Promise.resolve(new Map()) : group(`SELECT user_key, ${J('attrs_json', 'plugin.name')} label, MAX(ts) ts FROM events
          WHERE name = 'plugin_loaded' AND ts >= ? AND ${mem.sql} GROUP BY 1, 2 ORDER BY 1, 2`, [clock() - 90 * 864e5, ...mem.p]);
      const wm = where(f, 'm');
      const metrics$ = group(`SELECT m.user_key, name, type, SUM(value) v FROM metric_points m WHERE ${wm.sql} GROUP BY 1, 2, 3`, wm.params);
      // last 7 local days, independent of the selected range
      // (prompt times from the per-prompt summary: when each prompt was sent, without reading every prompt event)
      const prompted = (g) => { const src = promptSource(g); return { sql: `(SELECT e.user_key, e.up_min AS ts, e.up FROM ${src.sql} WHERE e.up > 0) e`, params: src.params }; };
      const p7 = prompted({ ...f, from: clock() - 7 * 86400_000, to: clock() + 60_000 });
      const days$ = group(`SELECT user_key, ${day} AS day, SUM(up) prompts FROM ${p7.sql} GROUP BY 1, 2 ORDER BY 1, 2`, p7.params);
      // wall time per prompt (prompt → last response or tool result)
      const wpp = where(f, 'p');
      // one join, not a lookup per prompt (prompts with no answer have no wait, as before: the median skips them)
      const waitsRaw = (extra = '', ps = []) => all(`SELECT p.user_key, MAX(a.ts) - p.ts wall FROM events p JOIN events a ON a.prompt_id = p.prompt_id
          AND a.name IN ('api_request', 'assistant_response', 'tool_result')
          WHERE p.name = 'user_prompt' AND p.prompt_id IS NOT NULL AND ${wpp.sql}${extra} GROUP BY p.id, p.user_key, p.ts`, [...wpp.params, ...ps]);
      const waits$ = (async () => {
      let waitRows;
      if (!rollup()) waitRows = await waitsRaw();
      else {
        // from the per-prompt summary: when the prompt was sent (in the range) to its last answer (whenever); a prompt
        // sent more than once (rare) from its events, each send its own wait as before
        const sw2 = promptSource(f);
        const per1 = await all(`SELECT p.user_key, p.prompt_id, p.ups, p.t, MAX(q.ans_max) a FROM (SELECT e.user_key, e.prompt_id, SUM(up) ups, MIN(up_min) t FROM ${sw2.sql}
            GROUP BY 1, 2 HAVING SUM(up) > 0) p JOIN prompt_rollup q ON q.prompt_id = p.prompt_id GROUP BY p.user_key, p.prompt_id, p.ups, p.t`, sw2.params);
        const twice = per1.filter((r) => Number(r.ups) > 1).map((r) => r.prompt_id);
        waitRows = per1.filter((r) => Number(r.ups) === 1 && r.a != null).map((r) => ({ user_key: r.user_key, wall: Number(r.a) - Number(r.t) }));
        if (twice.length) waitRows.push(...await waitsRaw(` AND p.prompt_id IN (${twice.map(() => '?').join(', ')})`, twice));
      }
      const waits = new Map(); for (const r of waitRows) { if (!waits.has(r.user_key)) waits.set(r.user_key, []); waits.get(r.user_key).push(r); }
      return waits;
      })();
      const limits$ = per(`SELECT ss.user_key,
          (SELECT sl.five_pct FROM statusline_samples sl JOIN sessions s2 ON s2.session_id = sl.session_id WHERE s2.user_key = ss.user_key AND sl.five_pct IS NOT NULL ORDER BY sl.ts DESC LIMIT 1) five_pct,
          (SELECT sl.week_pct FROM statusline_samples sl JOIN sessions s2 ON s2.session_id = sl.session_id WHERE s2.user_key = ss.user_key AND sl.week_pct IS NOT NULL ORDER BY sl.ts DESC LIMIT 1) week_pct
        FROM (SELECT DISTINCT user_key FROM sessions WHERE ${mem.sql}) ss`, mem.p);
      // plan limits as Puddle reports them (the Claude app, the status line, Codex logs): the newest per tool and
      // account, last 8 days. A team sees only the accounts each person shares with it ("everything": all of them).
      const planRows = new Map(), planOf = (k) => planNow(planRows.get(k), clock());
      const shares = new Map((f.scope || []).map((m) => [m.account_id, m]));
      // account names the service knows ("Dcvx", "Max"), never on this Mac's own database
      const plan$ = (async () => {
      let accRows = []; try { accRows = await all(`SELECT account_id, org_hash, label FROM device_accounts`, []); } catch { /* the Mac's own database has none */ }
      const accName = new Map(accRows.map((r) => [`${r.account_id}|${r.org_hash}`, r.label]));
      for (const r of await all(`SELECT * FROM plan_limits WHERE ts > ?${f.members ? ` AND user_key IN (${f.members.map(() => '?').join(',') || 'NULL'})` : ''}`, [clock() - 8 * 864e5, ...(f.members || [])])) {
        const m = shares.get(r.user_key);
        if (m && !m.all && !(r.org_hash && (m.orgs || []).includes(r.org_hash))) continue;
        const name = accName.get(`${r.user_key}|${r.org_hash}`);
        if (!planRows.has(r.user_key)) planRows.set(r.user_key, []);
        planRows.get(r.user_key).push({ ...r, label: name || planLabel(r.agent) });
      }
      })();

      // What each person does: tool calls by kind, over the range and right now.
      const sTool = source(f, { names: ['tool_result'] });
      const mix$ = group(`SELECT e.user_key, ${TOOL_CATEGORY} cat, SUM(n) n FROM ${sTool.sql} GROUP BY 1, 2`, sTool.params);
      const size = Math.max(60_000, Math.ceil((f.to - f.from) / LANE_BUCKETS));
      // whole quarter hours inside one slice from the summary; those a slice boundary cuts through from the events
      const cuts = Array.from({ length: LANE_BUCKETS + 1 }, (_, k) => Math.floor(f.from) + k * size);
      const sLane = source(f, { names: ['user_prompt', 'tool_result', 'api_error'], cuts, rawOnly: size < QUARTER });
      const lanes$ = group(`SELECT e.user_key, CAST((ts - ${Math.floor(f.from)}) / ${size} AS BIGINT) b, ${add(`name = 'user_prompt'`)} p,
          ${CATEGORIES.map((c) => `${add(`name = 'tool_result' AND ${TOOL_CATEGORY} = '${c}'`)} ${c}`).join(', ')},
          ${add(`name = 'tool_result'`, 'fails')} + ${add(`name = 'api_error'`)} fail
        FROM ${sLane.sql} GROUP BY 1, 2`, sLane.params);
      const wn = where({ ...f, from: clock() - 2 * 86400_000, to: clock() + 60_000 }, 'e');
      // what each person did last: per person the newest row straight from the index (user, kind, time), not a
      // window over two days of everyone's events; a view that narrows what it shares keeps the general query
      const everything = !f.scope || f.scope.every((m) => m.all);
      const latestRowOf = (names, cols) => (async () => {
        const m = new Map();
        const rows = await Promise.all(f.members.map((u) => one(`SELECT user_key, ts, id, ${cols} FROM events WHERE user_key = ? AND name IN (${names.map(() => '?').join(', ')}) AND ts >= ?
          ORDER BY ts DESC, id DESC LIMIT 1`, [u, ...names, clock() - 2 * 86400_000])));
        for (const r of rows) if (r) m.set(r.user_key, r);
        return m;
      })();
      const lastEv$ = f.members && everything ? latestRowOf(['user_prompt', 'api_request', 'tool_result', 'tool_decision'], 'name, tool_name')
        : latestPer('user_key, ts, id, name, tool_name', 'events e', `name IN ('user_prompt', 'api_request', 'tool_result', 'tool_decision') AND ${wn.sql}`, wn.params);
      // the conversations each person has going right now (the last 10 minutes): which agent, in which app, and when
      // each last moved, so a row shows "Claude Code ×3 · Codex" when several run at once (pages keep it live)
      const wa = where({ ...f, from: clock() - 10 * 60_000, to: clock() + 60_000 }, 'e');
      const active$ = group(`SELECT e.user_key, e.session_id, e.agent, s.entrypoint, MAX(e.ts) ts FROM events e LEFT JOIN sessions s ON s.session_id = e.session_id
          WHERE e.session_id IS NOT NULL AND e.name IN ('user_prompt', 'api_request', 'tool_result', 'tool_decision') AND ${wa.sql} GROUP BY 1, 2, 3, 4`, wa.params);
      const lastTool$ = f.members && everything ? latestRowOf(['tool_result', 'tool_decision'], `tool_name, ${TOOL_CATEGORY} cat`)
        : latestPer('user_key, ts, id, cat, tool_name', `(SELECT e.*, ${TOOL_CATEGORY} cat FROM events e WHERE name IN ('tool_result', 'tool_decision') AND ${wn.sql}) e`, '1 = 1', wn.params);
      // when each person was last seen at all: per person and kind, the newest row straight from the index
      const ever = new Map();
      const ever$ = (async () => {
        if (f.members) {
          const probes = f.members.flatMap((u) => ['user_prompt', 'api_request', 'tool_result'].map((k) => one(`SELECT MAX(ts) ts FROM events WHERE user_key = ? AND name = ?`, [u, k]).then((r) => [u, r])));
          for (const [u, r] of await Promise.all(probes)) if (r?.ts != null && Number(r.ts) > (ever.get(u)?.ts || 0)) ever.set(u, { user_key: u, ts: Number(r.ts) });
        } else for (const [k, v] of await per(`SELECT user_key, MAX(ts) ts FROM events WHERE name IN ('user_prompt', 'api_request', 'tool_result') GROUP BY user_key`, [])) ever.set(k, v);
      })();
      // Usual level: the 28 days before this period, per day the person was active.
      const wb = where({ ...f, from: f.from - 28 * 86400_000, to: f.from }, 'e');
      const sb = source({ ...f, from: f.from - 28 * 86400_000, to: f.from });
      const usual$ = per(`SELECT e.user_key, SUM(CASE WHEN name = 'api_request' THEN tok END) tokens, ${add(`name = 'user_prompt'`)} prompts,
          COUNT(DISTINCT CASE WHEN name = 'user_prompt' THEN ${day} END) days
        FROM ${sb.sql} GROUP BY e.user_key`, sb.params);
      // ---- inputs for "Needs a look" (see flags.js) ----
      const toolStats$ = group(`SELECT e.user_key, tool_name tool, SUM(n) calls, SUM(fails) fails FROM ${sTool.sql} GROUP BY 1, 2 ORDER BY 1, 2`, sTool.params);
      // prompts with 4+ failed steps in the range (from the per-prompt summary); only those are read step by step
      const sStuck = promptSource(f);
      const streaks = new Map();
      const stuck$ = (async () => {
      // (the 50 most recent of them: their steps are read one by one)
      const stuckPrompts = (await all(`SELECT prompt_id FROM ${sStuck.sql} GROUP BY prompt_id HAVING SUM(fails) >= 4 ORDER BY MAX(ans_max) DESC LIMIT 50`, sStuck.params)).map((r) => r.prompt_id);
      if (stuckPrompts.length) {
        const rowsS = await all(`SELECT user_key, prompt_id, tool_name, success FROM events WHERE name = 'tool_result' AND prompt_id IN (${stuckPrompts.map(() => '?').join(',')}) ORDER BY prompt_id, ts, id`, stuckPrompts);
        let cur = null, len2 = 0;
        const best = new Map();
        for (const r of rowsS) {
          const k = r.prompt_id + '|' + r.tool_name;
          if (r.success === 0 && cur === k) len2++; else if (r.success === 0) { cur = k; len2 = 1; } else { cur = null; len2 = 0; }
          const b = best.get(r.prompt_id);
          if (len2 >= 4 && (!b || len2 > b.length)) best.set(r.prompt_id, { user: r.user_key, prompt: r.prompt_id, tool: r.tool_name, length: len2 });
        }
        for (const s1 of best.values()) { if (!streaks.has(s1.user)) streaks.set(s1.user, []); streaks.get(s1.user).push(s1); }
      }
      })();
      const sHook = source(f, { names: ['hook_execution_complete'] });
      const hooks$ = group(`SELECT e.user_key, label name, SUM(n) runs, SUM(hook_err) errors FROM ${sHook.sql} GROUP BY 1, 2 ORDER BY 1, 2`, sHook.params);
      const sErr = source(f, { names: ['api_error'] });
      const apiErr$ = group(`SELECT e.user_key, CAST(label AS INTEGER) code, SUM(n) n FROM ${sErr.sql} GROUP BY 1, 2`, sErr.params);
      const sDec = source(f, { names: ['tool_decision'] });
      const asksBy$ = group(`SELECT e.user_key, tool_name tool, ${add('by_user = 1')} n, ${add(`by_user = 1 AND decision LIKE '%reject%'`)} rej
        FROM ${sDec.sql} GROUP BY 1, 2 ORDER BY 1, 2`, sDec.params);
      const sCmp = source(f, { names: ['compaction'] });
      const compactAuto$ = per(`SELECT e.user_key, SUM(n) n FROM ${sCmp.sql} WHERE label = 'auto' GROUP BY 1`, sCmp.params);
      const versions$ = group(`SELECT user_key, app_version v FROM sessions WHERE app_version IS NOT NULL AND last_seen > ? GROUP BY 1, 2 ORDER BY 1, 2`, [clock() - 14 * 86400_000]);
      const p60 = prompted({ ...f, from: clock() - 60 * 86400_000, to: clock() + 60_000 });
      const promptTimes$ = group(`SELECT e.user_key, ts FROM ${p60.sql} ORDER BY ts`, p60.params);
      // Feedback: "not an issue" hides that kind of flag for that person for 14 days (latest verdict wins).
      const fb$ = all(`SELECT user_key, kind, verdict, ts FROM (SELECT user_key, kind, verdict, ts,
          ROW_NUMBER() OVER (PARTITION BY user_key, kind ORDER BY ts DESC, id DESC) rn FROM flag_feedback WHERE ts > ?) x WHERE rn = 1`, [clock() - 14 * 86400_000]);
      const fbOf = (u, k) => fb.find((r) => r.user_key === u && r.kind === k);
      const DEFAULT_FAIL = { read: 0.02, edit: 0.05, run: 0.08, web: 0.06, agent: 0.03, mcp: 0.05, other: 0.03 };
      const catOf = (t) => /^(Read|Grep|Glob|LS|NotebookRead)$/.test(t) ? 'read' : /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t) ? 'edit'
        : /^(Bash|BashOutput|KillShell|KillBash|Monitor)$/.test(t) ? 'run' : /^(WebFetch|WebSearch)$/.test(t) ? 'web'
        : /^(Agent|Task|Skill|Workflow)$/.test(t) ? 'agent' : /^mcp(__|_tool$)/.test(String(t)) ? 'mcp' : 'other';
      const p2 = prompted({ ...f, from: clock() - 2 * 86400_000, to: clock() + 60_000 });
      const lastPrompt$ = per(`SELECT e.user_key, MAX(ts) ts FROM ${p2.sql} GROUP BY e.user_key`, p2.params);

      // ---- inputs for the plain-language view (insights-text.js) ----
      // per prompt: how many tool steps the agent took on its own, and whether one failed
      const sPrompt = promptSource(f);
      const runsBy$ = group(`SELECT e.user_key, e.prompt_id, SUM(up) up, SUM(steps) steps, SUM(fails) fails FROM ${sPrompt.sql} GROUP BY 1, 2`, sPrompt.params);
      // active time (gaps under 5 minutes, parallel conversations once) and when it happened, in local time
      // from the stored runs once they're complete, else from the steps themselves (the same answer)
      const act$ = rollup() ? Promise.all([activeRuns(f), activeRuns({ ...f, from: f.from - len, to: f.from }), null, null])
        : Promise.all([null, null, group(`SELECT e.user_key, e.session_id session, ts FROM events e WHERE name IN ('user_prompt', 'api_request', 'tool_result') AND ${w.sql}`, w.params),
          group(`SELECT e.user_key, e.session_id session, ts FROM events e WHERE name IN ('user_prompt', 'api_request', 'tool_result') AND ${wp.sql}`, wp.params)]);
      const segsOf = (u) => (runsNow ? unionRuns(runsNow.get(u)) : activeSegments(actRows.get(u) || []));
      const offsetOf = tzOffset(tzMin);
      const hoursOf = (segs, tz) => {
        const h = { total: 0, day: 0, evening: 0, night: 0, weekend: 0, outside: 0 };
        for (let [a, b] of segs) {
          const off = offsetOf(a, tz);
          for (; a < b; a += 60_000) {
            const m = Math.min(1, (b - a) / 60_000), d = new Date(a + off), hr = d.getUTCHours(), wd = d.getUTCDay();
            h.total += m;
            if (wd === 0 || wd === 6) h.weekend += m; else if (hr >= 8 && hr < 19) h.day += m; else if (hr >= 19) h.evening += m; else h.night += m;
          }
        }
        h.outside = h.total - h.day;
        for (const k of Object.keys(h)) h[k] = Math.round(h[k]);
        return h;
      };
      // projects (team service: the repo or folder each conversation ran in, as the plugin reported it)
      const projectRows$ = skips.has('recent') && core ? Promise.resolve([]) : this.sessionProjects(f); // code changes need them (the full answer)

      // every query above was started at once (they don't depend on each other): here they're all waited for
      // per person, from the tasks summary: their most expensive task (how much of it sub-agents made) and how much
      // context their main conversation re-reads per call (long conversations make every call dearer)
      const tsrc = taskSource(f);
      const promptRows = [];
      const taskFacts$ = (async () => {
        const m = new Map();
        for (const r of await perPrompt(tsrc)) {
          promptRows.push(r);
          const x = m.get(r.user_key) || { top: null, mainRead: 0, mainCalls: 0 };
          x.mainRead += Number(r.main_read) || 0; x.mainCalls += Number(r.main_calls) || 0;
          const cost = Number(r.cost) || 0;
          if (!x.top || cost > x.top.cost) x.top = { prompt_id: r.prompt_id, cost, agentCost: Number(r.agent_cost) || 0, agents: Number(r.agents) || 0 };
          m.set(r.user_key, x);
        }
        for (const x of m.values()) x.rereadPerCall = x.mainCalls ? x.mainRead / x.mainCalls : 0;
        return m;
      })();
      const [stat, prev, models, effort, clients, clientNow, effortNow, ctxRows, names, plugins, metrics, days, limits, mix, lanes, lastEv, lastTool, usual, toolStats, hooks, apiErr, asksBy, compactAuto, versions, promptTimes, fb, lastPrompt, runsBy, projectRows, [runsNow, runsPrev, actRows, prevRows], waits, , , , taskFacts, activeNow] = await Promise.all([
        stat$, prev$, models$, effort$, clients$, clientNow$, effortNow$, ctxRows$, names$, plugins$, metrics$, days$, limits$, mix$, lanes$, lastEv$, lastTool$, usual$, toolStats$, hooks$, apiErr$, asksBy$, compactAuto$, versions$, promptTimes$, fb$, lastPrompt$, runsBy$, projectRows$, act$, waits$, plan$, ever$, stuck$, taskFacts$, active$]);
      // the team's usual context re-read per call (people with enough calls), to say when someone's is far above it
      const rereads = [...taskFacts.values()].filter((x) => x.mainCalls >= 50).map((x) => x.rereadPerCall).sort((a, b) => a - b);
      const teamTool = new Map();
      for (const rows of toolStats.values()) for (const r of rows) { const t = teamTool.get(r.tool) || { calls: 0, fails: 0 }; t.calls += r.calls; t.fails += r.fails; teamTool.set(r.tool, t); }
      if (f.members) for (const k of [...versions.keys()]) if (!f.members.includes(k)) versions.delete(k);
      const newestOf = (vs) => vs.map((r) => r.v).filter((v) => R.parseVersion(v)).sort((a, b) => { const x = R.parseVersion(a), y = R.parseVersion(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }).pop() || null;
      const teamNewest = newestOf([...versions.values()].flat());

      const med = (a) => { const v = a.filter((x) => x != null && x >= 0).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
      const now = clock();
      const people = users.map((u) => {
        const s1 = stat.get(u.user_key) || {}, p1 = prev.get(u.user_key) || {};
        const mt = {}; for (const r of metrics.get(u.user_key) || []) mt[`${r.name}${r.type ? '.' + r.type : ''}`] = r.v;
        const nm = (kind) => (names.get(u.user_key) || []).filter((r) => r.kind === kind).map((r) => ({ label: r.label, n: r.n }));
        const prompts = s1.prompts || 0;
        const row = {
          ...u,
          prompts, sessions: s1.sessions || 0, requests: s1.requests || 0, tokens: s1.tokens || 0, cost: s1.cost || 0,
          prev: { prompts: p1.prompts || 0, tokens: p1.tokens || 0, sessions: p1.sessions || 0 },
          avgPrompt: s1.avg_prompt ? Math.round(s1.avg_prompt) : null,
          autonomy: prompts ? (s1.main_requests || 0) / prompts : null,
          toolsPerPrompt: prompts ? (s1.tools || 0) / prompts : null,
          tools: s1.tools || 0, toolFail: s1.tool_fail || 0, apiErrors: s1.api_errors || 0,
          failRate: s1.tools ? (s1.tool_fail || 0) / s1.tools : null,
          asks: s1.asks || 0, rejects: s1.rejects || 0, decisions: s1.decisions || 0,
          autoApproved: s1.decisions ? 1 - (s1.rejects || 0) / s1.decisions : null,
          hours: hoursOf(segsOf(u.user_key), u.timezone),
          runs: (() => {
            const r = (runsBy.get(u.user_key) || []).filter((x) => x.up > 0);
            return { prompts: r.length, long: r.filter((x) => x.steps >= 20).length, chat: r.filter((x) => !x.steps).length,
              smooth: r.filter((x) => !x.fails).length, longest: Math.max(0, ...r.map((x) => x.steps)) };
          })(),
          cacheHit: s1.input_all ? (s1.cache_read || 0) / s1.input_all : null,
          features: { skills: s1.skills || 0, mcp: s1.mcp || 0, subagents: s1.subagents || 0, web: s1.web || 0, edits: s1.edits || 0, mentions: s1.mentions || 0, plugins: (plugins.get(u.user_key) || []).length },
          featureNames: { skills: nm('skill'), mcp: nm('mcp'), subagents: nm('agent'), plugins: (plugins.get(u.user_key) || []).map((r) => ({ label: r.label })) },
          compactions: s1.compactions || 0,
          models: (models.get(u.user_key) || []).map((r) => ({ model: r.model, tokens: r.tokens })),
          effort: Object.fromEntries((effort.get(u.user_key) || []).map((r) => [r.effort, r.n])),
          clients: (clients.get(u.user_key) || []).map((r) => ({ client: r.client, sessions: r.n })),
          client: clientNow.get(u.user_key)?.client || null,
          effortNow: effortNow.get(u.user_key)?.effort || null,
          context: contextOf(u.user_key),
          output: { added: mt['lines_of_code.count.added'] || 0, removed: mt['lines_of_code.count.removed'] || 0, commits: mt['commit.count'] || 0, prs: mt['pull_request.count'] || 0 },
          activeTime: { user: mt['active_time.total.user'] || 0, cli: mt['active_time.total.cli'] || 0 },
          days: Object.fromEntries((days.get(u.user_key) || []).map((r) => [r.day, r.prompts])),
          medianWait: med((waits.get(u.user_key) || []).map((r) => r.wall)),
          activeDays: s1.active_days || 0,
          lastActive: s1.last_active || null,
          plan: planOf(u.user_key),
          five_pct: planOf(u.user_key)?.five_pct ?? limits.get(u.user_key)?.five_pct ?? null,
          week_pct: planOf(u.user_key)?.week_pct ?? limits.get(u.user_key)?.week_pct ?? null,
          mix: Object.fromEntries(CATEGORIES.map((c) => [c, (mix.get(u.user_key) || []).find((r) => r.cat === c)?.n || 0])),
          lane: (() => {
            const a = Array.from({ length: Math.ceil((f.to - f.from) / size) }, () => null);
            for (const r of lanes.get(u.user_key) || []) if (r.b >= 0 && r.b < a.length) a[r.b] = [r.p, ...CATEGORIES.map((c) => r[c]), r.fail];
            return a;
          })(),
          now: {
            lastTs: lastEv.get(u.user_key)?.ts ?? null, last: lastEv.get(u.user_key)?.name ?? null,
            toolTs: lastTool.get(u.user_key)?.ts ?? null, doing: lastTool.get(u.user_key)?.cat ?? null, tool: lastTool.get(u.user_key)?.tool_name ?? null,
            promptTs: lastPrompt.get(u.user_key)?.ts ?? null, everTs: ever.get(u.user_key)?.ts ?? null,
            sessions: (activeNow.get(u.user_key) || []).map((r) => ({ id: r.session_id, agent: r.agent, client: canonicalClient(r.entrypoint) || null, ts: Number(r.ts) })),
          },
        };
        // Things a manager may want to look at — see flags.js for each rule.
        const k = u.user_key;
        const mine = (toolStats.get(k) || []).map((r) => ({ tool: r.tool || 'unknown', calls: r.calls, fails: r.fails }));
        // Expected failure rate per tool: the rest of the team, smoothed toward a
        // sensible default for that kind of tool. Never the person's own history,
        // which would hide a problem they have always had.
        const ref = (tool) => {
          const t = teamTool.get(tool) || { calls: 0, fails: 0 }, me = mine.find((x) => x.tool === tool) || { calls: 0, fails: 0 };
          return ((t.fails - me.fails) + 20 * DEFAULT_FAIL[catOf(tool)]) / ((t.calls - me.calls) + 20);
        };
        const asks = asksBy.get(k) || [];
        const nAsks = asks.reduce((a, r) => a + r.n, 0), nRej = asks.reduce((a, r) => a + r.rej, 0);
        const byStatus = Object.fromEntries((apiErr.get(k) || []).map((r) => [r.code, r.n]));
        const flags = [
          R.quietRule((promptTimes.get(k) || []).map((r) => r.ts), u.timezone, now),
          ...R.failureRules(mine, ref),
          R.stuckRule(streaks.get(k) || []),
          R.hookRule(hooks.get(k) || []),
          ...R.apiErrorRule(byStatus, row.requests),
          R.limitRule(row.five_pct, row.week_pct, row.plan, tzMin),
          R.frictionRule(prompts, asks.map((r) => ({ tool: r.tool, n: r.n }))),
          R.rejectRule(nAsks, nRej),
          R.contextRule(compactAuto.get(k)?.n || 0, row.sessions),
          R.heavyRule({ prompts, tokens: row.tokens }, usual.get(k)),
          ...R.taskRules(taskFacts.get(k), rereads),
          R.versionRule(newestOf(versions.get(k) || []), teamNewest, [...versions.keys()].length),
          // the team service: is their Mac set up properly (see service/health.js)
          ...(f.setup ? R.setupRules(f.setup.byUser?.get(k), row, { latest: f.setup.latest, now, tzMin }) : []),
        ].filter(Boolean);
        row.hiddenFlags = flags.filter((fl) => fbOf(k, fl.kind)?.verdict === 'no').map((fl) => fl.kind);
        const shown = flags.filter((fl) => fbOf(k, fl.kind)?.verdict !== 'no')
          .map((fl) => ({ ...fl, acknowledged: fbOf(k, fl.kind)?.verdict === 'yes' }))
          .sort((a, b) => (a.acknowledged - b.acknowledged) || R.LEVEL_RANK[a.level] - R.LEVEL_RANK[b.level]);
        row.flags = shown;
        row.topTools = [...mine].sort((a, b) => b.calls - a.calls).slice(0, 4).map((r) => ({ tool: r.tool, calls: r.calls, fails: r.fails, cat: catOf(r.tool) }));
        row.activeMinutes = row.hours.total;
        row.profile = profile(row);
        return row;
      });
      const common = commonFacts(people);
      if (common.size) for (const p of people) p.profile = profile(p, { common });
      const active = people.filter((p) => p.prompts > 0);
      const sum = (k, arr = people) => arr.reduce((a, p) => a + (k(p) || 0), 0);
      const fbWhere = f.members ? `WHERE user_key IN (${f.members.map(() => '?').join(',') || 'NULL'})` : '';
      // projects: active time per repo (or folder), who worked there
      const { min: sessionMin, last: sessionLast } = sessionTimes(runsNow, actRows);
      // what the work was about: projects (repo, else folder), each with its conversations (title, who, time)
      const projMap = new Map();
      for (const r of projectRows) {
        const name = r.repo || (r.folder ? r.folder : null); if (!name) continue;
        const pr = projMap.get(name) || { name, repo: Boolean(r.repo), minutes: 0, sessions: 0, people: new Set(), conversations: [] };
        const m = sessionMin.get(r.session_id) || 0;
        pr.minutes += m; pr.sessions++; pr.people.add(r.user_key);
        pr.conversations.push({ title: r.title || null, user_key: r.user_key, minutes: Math.round(m), last: sessionLast.get(r.session_id) || null });
        projMap.set(name, pr);
      }
      // each project's prompts in order, as a small chart: what each spent, and the context it ran at
      const projectOfSession = new Map(projectRows.map((r) => [r.session_id, r.repo || r.folder || null]));
      const seriesOf = new Map();
      for (const r of promptRows) { const n = projectOfSession.get(r.session_id); if (!n) continue; if (!seriesOf.has(n)) seriesOf.set(n, []); seriesOf.get(n).push(promptPoint(r)); }
      const all$ = [...projMap.values()].map((x) => ({ ...x, minutes: Math.round(x.minutes), people: [...x.people], last: Math.max(0, ...x.conversations.map((c) => c.last || 0)),
        series: (seriesOf.get(x.name) || []).sort((a, b) => a.t - b.t).slice(-40).map(({ inp, out, cr, cw, ...pt }) => pt), ...topConversations(x.conversations) }));
      // what's shown: each person's 3 latest projects (one person: their 6 latest), newest first
      const shown = new Set();
      if (single) for (const x of [...all$].sort((a, b) => b.last - a.last).slice(0, 6)) shown.add(x.name);
      else for (const u of new Set(projectRows.map((r) => r.user_key))) {
        const last = (x) => Math.max(0, ...x.conversations.filter((c) => c.user_key === u).map((c) => c.last || 0));
        for (const x of all$.filter((x) => x.people.includes(u)).sort((a, b) => last(b) - last(a)).slice(0, 3)) shown.add(x.name);
      }
      const projects = all$.filter((x) => shown.has(x.name)).sort((a, b) => b.last - a.last);
      // what everyone is on: each person's latest conversation (one person's page: their last 5), newest first
      const seenConv = new Set(), seenPerson = new Set();
      const convs = projectRows.filter((r) => (r.repo || r.folder) && !seenConv.has(r.session_id) && seenConv.add(r.session_id))
        .map((r) => ({ user_key: r.user_key, session_id: r.session_id, title: r.title || null, project: r.repo || r.folder, last: sessionLast.get(r.session_id) || null, minutes: Math.round(sessionMin.get(r.session_id) || 0) }))
        .filter((c) => c.last && c.minutes >= 1).sort((a, b) => b.last - a.last);
      const recent = single ? convs.slice(0, 5) : convs.filter((c) => !seenPerson.has(c.user_key) && seenPerson.add(c.user_key));
      // the calendar's window: a year back (earlier months fill a wide card), whatever the range
      const cal = { ...f, from: Math.min(f.from, clock() - 366 * 864e5), to: Math.max(f.to, clock() + 60_000) };
      const prevMinutes = (runsPrev ? [...runsPrev.values()].map(unionRuns) : [...prevRows.values()].map((rows) => activeSegments(rows)))
        .reduce((a, segs) => a + segs.reduce((x, [p, q]) => x + (q - p) / 60_000, 0), 0);
      return {
        summary: teamSummary(people, { prevMinutes: prevMinutes >= 1 ? Math.round(prevMinutes) : null }),
        projects, recent,
        // tokens per day for the calendar: a year back (earlier months fill a wide card), whatever the range
        // lines changed per project and day (projects as on the projects card: repo, else folder)
        ...(core ? {} : {
          codeLines: await this.codeLines(f, tzMin, projectOf(projectRows)),
          daily: await this.days(cal, tzMin),
          dailyByUser: f.scope && !single ? await this.daysByUser(cal, tzMin) : [], // a team view's hover lists each person (one person's page doesn't need it)
        }),
        headline: {
          people: people.length,
          activeMinutes: sum((p) => p.activeMinutes), prevMinutes: Math.round(prevMinutes),
          longRuns: sum((p) => p.runs.long), runPrompts: sum((p) => p.runs.prompts), smoothPrompts: sum((p) => p.runs.smooth),
          outsideMinutes: sum((p) => p.hours.outside),
          nearLimit: people.filter((p) => p.week_pct >= 80 || p.five_pct >= 80).length,
          active: active.length,
          activeNow: people.filter((p) => p.lastActive && now - p.lastActive < 3 * 60_000).length,
          prompts: sum((p) => p.prompts), prevPrompts: sum((p) => p.prev.prompts),
          tokens: sum((p) => p.tokens), prevTokens: sum((p) => p.prev.tokens),
          sessions: sum((p) => p.sessions), prevSessions: sum((p) => p.prev.sessions),
          prevActive: people.filter((p) => p.prev.prompts > 0).length,
          promptsPerActive: active.length ? sum((p) => p.prompts) / active.length : 0,
          medianWait: med(people.flatMap((p) => (waits.get(p.user_key) || []).map((r) => r.wall))),
          output: { added: sum((p) => p.output.added), removed: sum((p) => p.output.removed), commits: sum((p) => p.output.commits), prs: sum((p) => p.output.prs) },
        },
        people,
        lane: { from: f.from, size, categories: CATEGORIES },
        feedback: await all(`SELECT kind, ${n(`verdict = 'yes'`)} yes, ${n(`verdict = 'no'`)} no FROM flag_feedback ${fbWhere} GROUP BY kind ORDER BY kind`, f.members || []),
        now: clock(),
      };
    },

    // Which project each conversation with a prompt in the range belongs to (team service: what the plugin or app
    // reported in session_contexts; none on a single device).
    // One project (repo, else folder) over the range, unfolding: every prompt in order (what it spent, the context it
    // ran at, its tokens, who), each conversation with its own prompts, each person's share, and the totals.
    async project(f, name) {
      const sp = (await this.sessionProjects(f)).filter((r) => (r.repo || r.folder) === name);
      if (!sp.length) return null;
      const sessions = new Map(sp.map((r) => [r.session_id, r]));
      const prompts = (await perPrompt(taskSource(f))).filter((r) => sessions.has(r.session_id)).map(promptPoint).filter((x) => x.calls).sort((a, b) => a.t - b.t);
      const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
      const sum = (xs, k) => xs.reduce((a, x) => a + (x[k] || 0), 0);
      const conv = new Map();
      for (const x of prompts) { if (!conv.has(x.s)) conv.set(x.s, []); conv.get(x.s).push(x); }
      const conversations = [...conv].map(([sid, list]) => ({ session_id: sid, title: sessions.get(sid)?.title || null, user_key: sessions.get(sid)?.user_key || list[0].u,
        first: list[0].t, last: list.at(-1).t, cost: Math.round(sum(list, 'cost') * 100) / 100, tok: sum(list, 'tok'), prompts: list.length, ctx: med(list.map((x) => x.ctx)),
        inp: sum(list, 'inp'), out: sum(list, 'out'), cr: sum(list, 'cr'), cw: sum(list, 'cw') }))
        .sort((a, b) => b.last - a.last);
      const people = new Map(); for (const x of prompts) { const p = people.get(x.u) || { user_key: x.u, cost: 0, prompts: 0 }; p.cost += x.cost; p.prompts++; people.set(x.u, p); }
      // everyone this view may see, in the team page's order (first seen): the same colour for the same person
      const team = (await this.filters(f)).users.map((u) => ({ user_key: u.user_key, name: u.name || (u.email ? u.email.split('@')[0] : 'someone') }));
      return { name, repo: Boolean(sp[0].repo), range: { from: f.from, to: f.to }, team,
        totals: { cost: Math.round(sum(prompts, 'cost') * 100) / 100, tok: sum(prompts, 'tok'), prompts: prompts.length, conversations: conversations.length,
          ctx: med(prompts.map((x) => x.ctx)), perPrompt: med(prompts.map((x) => x.cost)), inp: sum(prompts, 'inp'), out: sum(prompts, 'out'), cr: sum(prompts, 'cr'), cw: sum(prompts, 'cw') },
        // each prompt once, as a row: [time, cost, context per call, tokens, calls, sub-agents, person #, conversation #,
        // input, output, cache read, cache write]
        // (person # into `team`, conversation # into `conversations`): a 90-day project was 1.5 MB as objects
        prompt: ['t', 'cost', 'ctx', 'tok', 'calls', 'agents', 'u', 's', 'inp', 'out', 'cr', 'cw'],
        prompts: prompts.map((x) => [x.t, x.cost, x.ctx, x.tok, x.calls, x.agents, team.findIndex((m) => m.user_key === x.u), conversations.findIndex((c) => c.session_id === x.s), x.inp, x.out, x.cr, x.cw]),
        conversations, people: [...people.values()].map((p) => ({ ...p, cost: Math.round(p.cost * 100) / 100 })).sort((a, b) => b.cost - a.cost) };
    },

    // Every conversation in the range, a page at a time (the Work page): its project, who, how long it was worked on,
    // its tokens, what it spent; newest first, or the longest / most tokens / most spent first; narrowed to one person
    // or one project. The lists to narrow by cover the whole range.
    // new data arrived (the service's notify): what was worked out before it is no longer whole
    changed() { workCache.clear(); },
    // The whole range is worked out once and kept for 30 s, or until new data arrives (changed()): paging, sorting and
    // narrowing then reuse it (each click used to redo all four summaries).
    async work(f, { page = 1, per = 25, person = null, project = null, sort = 'recent' } = {}) {
      // the page asks with the time it was clicked, so the range is keyed to 30 s (a click later is the same list)
      const key = JSON.stringify({ ...f, from: Math.floor(f.from / 30_000), to: Math.floor(f.to / 30_000) }), now = Date.now();
      let hit = workCache.get(key);
      if (!hit || now - hit.at > 30_000) {
        hit = { at: now, list: this.workList(f) };
        workCache.set(key, hit);
        for (const [k, v] of workCache) if (now - v.at > 30_000 || workCache.size > 20) workCache.delete(k); else break;
        hit.list.catch(() => { if (workCache.get(key) === hit) workCache.delete(key); });
      }
      const { list: all, team } = await hit.list;
      const list = [...all];
      const by = { time: 'minutes', tokens: 'tok', cost: 'cost' }[sort];
      if (by) list.sort((a, b) => b[by] - a[by] || (b.last || 0) - (a.last || 0)); // ties: the newer first
      // everyone this view may see, in the team page's order (the same colour for the same person); who to narrow by
      const people = team.filter((u) => list.some((x) => x.user_key === u.user_key)).map((u) => u.user_key);
      const projects = [...new Set(list.map((x) => x.project))].sort((a, b) => a.localeCompare(b));
      const rows = list.filter((x) => (!person || x.user_key === person) && (!project || x.project === project));
      const pages = Math.max(1, Math.ceil(rows.length / per)), at = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
      return { total: rows.length, page: at, per, pages, team, people, projects, rows: rows.slice((at - 1) * per, at * per) };
    },
    async workList(f) {
      const [sp, times, promptRows, filt] = await Promise.all([this.sessionProjects(f), sessionTimesIn(f), perPrompt(taskSource(f)), this.filters(f)]);
      const spent = new Map();
      for (const r of promptRows) {
        if (!Number(r.calls)) continue;
        const x = spent.get(r.session_id) || { cost: 0, tok: 0, prompts: 0 };
        x.cost += Number(r.cost) || 0; x.tok += Number(r.tok) || 0; x.prompts++;
        spent.set(r.session_id, x);
      }
      const seen = new Set();
      const list = sp.filter((r) => (r.repo || r.folder) && !seen.has(r.session_id) && seen.add(r.session_id)).map((r) => {
        const s = spent.get(r.session_id) || { cost: 0, tok: 0, prompts: 0 };
        return { session_id: r.session_id, title: r.title || null, user_key: r.user_key, project: r.repo || r.folder, last: times.last.get(r.session_id) || null,
          minutes: Math.round(times.min.get(r.session_id) || 0), cost: Math.round(s.cost * 100) / 100, tok: s.tok, prompts: s.prompts };
      }).sort((a, b) => (b.last || 0) - (a.last || 0));
      const team = filt.users.map((u) => ({ user_key: u.user_key, name: u.name || (u.email ? u.email.split('@')[0] : 'someone') }));
      return { list, team };
    },

    async sessionProjects(f) {
      // conversations with a prompt in the range: from the per-prompt summary (its rows, not every prompt event)
      const src = promptSource(f);
      let rows;
      try {
        rows = await all(`SELECT DISTINCT e.user_key, e.session_id, sc.repo, sc.folder, sc.title, s.entrypoint FROM ${src.sql} JOIN session_contexts sc ON sc.session_id = e.session_id
          LEFT JOIN sessions s ON s.session_id = e.session_id WHERE e.up > 0`, src.params);
      } catch { return []; }
      // scripted and background runs (codex exec, the SDK, the Codex app's own work) are one group, never a project
      // each; a folder named like an id with no repository is a scratch folder, not a project (21 Oct 2026: 157
      // `codex exec` runs showed as id-named projects)
      return rows.flatMap(({ entrypoint, ...r }) => (isRun(entrypoint) ? [{ ...r, repo: null, folder: RUNS_PROJECT }]
        : !r.repo && ID_LIKE.test(String(r.folder || '')) ? [] : [r]));
    },
    // The tokens-per-day calendar: a year back (earlier months fill a wide card), whatever the range; with each
    // person's share of every day on a team view.
    async teamCalendar(f, tzMin = 0, { byUser = Boolean(f.scope) } = {}) {
      const cal = { ...f, from: Math.min(f.from, clock() - 366 * 864e5), to: Math.max(f.to, clock() + 60_000) };
      return { daily: await this.days(cal, tzMin), dailyByUser: byUser ? await this.daysByUser(cal, tzMin) : [] };
    },
    // Code changes per project and day, projects as on the projects card (repo, else folder).
    async teamLines(f, tzMin = 0) {
      return { codeLines: await this.codeLines(f, tzMin, projectOf(await this.sessionProjects(f))) };
    },

    // One person, deep: their row as the team sees it (same scope), their rhythm and forecasts, their tools.
    // Used by Me (the app and the website) and by a team lead opening someone from the team page.
    async person(f, tzMin, userKey, { parts = 'all', skip = [] } = {}) {
      if (!userKey || (f.members && !f.members.includes(userKey))) return null;
      const one = { ...f, members: [userKey], user: null };
      const t = await this.team(one, tzMin, { single: true, parts, skip });
      const row = t.people.find((p) => p.user_key === userKey);
      if (!row) return null;
      const now = clock();
      // their active stretches over 90 days: the stored runs when the summaries are complete, else the events
      let rows;
      if (rollup()) {
        const w = where({ ...one, from: 0, to: 8.64e15 }, 'r', { ts: 'start_ts', org: 'r.org' });
        rows = { runs: await all(`SELECT r.start_ts AS start, r.end_ts AS "end" FROM active_run r WHERE r.end_ts >= ? AND r.start_ts < ? AND ${w.sql}`, [now - 90 * 86400_000, now + 60_000, ...w.params]) };
      } else {
        const w = where({ ...one, from: now - 90 * 86400_000, to: now + 60_000 }, 'e');
        rows = await all(`SELECT e.session_id AS session, e.ts FROM events e WHERE e.session_id IS NOT NULL AND e.name IN ('user_prompt', 'api_request', 'tool_result') AND ${w.sql}`, w.params);
      }
      const tools = (await this.tools(one)).slice(0, 8);
      return { person: row, rhythm: rhythm(rows, { now, tz: tzMin }), tools, range: { from: f.from, to: f.to }, projects: t.projects, recent: t.recent, ...(parts === 'core' ? {} : { daily: t.daily, codeLines: t.codeLines }) };
    },

    async filters(f = {}) {
      const m = f.members ? where({ from: 0, to: 8.64e15, members: f.members }, 'e') : null;
      return {
        users: (await all(`SELECT user_key, email, name, country, last_seen FROM users ORDER BY first_seen, user_key`, [])).filter((u) => !f.members || f.members.includes(u.user_key)),
        models: (await all(`SELECT DISTINCT model FROM events e WHERE model IS NOT NULL ${m ? 'AND ' + m.sql : ''} ORDER BY 1`, m ? m.params : [])).map((r) => r.model),
        clients: (await all(`SELECT DISTINCT ${CLIENT} client FROM sessions s ${f.members ? `WHERE s.user_key IN (${f.members.map(() => '?').join(',') || 'NULL'})` : ''} ORDER BY 1`, f.members || [])).map((r) => r.client),
      };
    },

    async health(f = {}) {
      const m = where({ from: 0, to: 8.64e15, members: f.members }, 'e');
      const mm = where({ from: 0, to: 8.64e15, members: f.members }, 'm');
      // everything ever stored for these people: from the summary (with the events at the very end)
      const ever = source({ from: 0, to: 8.64e15, members: f.members }), hour = source({ from: clock() - 3600_000 + 1, to: 8.64e15, members: f.members });
      const bySource = await all(`SELECT source, SUM(n) n, MAX(max_ts) t FROM ${ever.sql} GROUP BY source`, ever.params);
      return {
        lastEvent: bySource.reduce((a, r) => (a == null || (r.t != null && r.t > a) ? r.t : a), null),
        lastMetric: (await one(`SELECT MAX(ts) t FROM metric_points m WHERE ${mm.sql}`, mm.params)).t,
        events: bySource.reduce((a, r) => a + Number(r.n), 0),
        bySource: Object.fromEntries(bySource.map((r) => [r.source, Number(r.n)])),
        lastHour: Number((await one(`SELECT SUM(n) n FROM ${hour.sql}`, hour.params))?.n) || 0,
        users: f.members ? [] : (await all(`SELECT email FROM users WHERE email IS NOT NULL ORDER BY last_seen DESC`, [])).map((r) => r.email),
      };
    },

    async exportEvents(f) {
      const w = where(f, 'e');
      return all(`SELECT ${T('e.ts', 'datetime')} ts_utc, e.name, u.email, e.session_id, e.prompt_id, e.tool_name,
          e.success, e.duration_ms, e.model, e.input_tokens, e.output_tokens, e.cache_read, e.cache_creation,
          e.cost_usd, e.prompt_length, e.decision, e.error, e.source
        FROM events e LEFT JOIN users u ON u.user_key = e.user_key WHERE ${w.sql} ORDER BY e.ts, e.id`, w.params);
    },
  };
}
