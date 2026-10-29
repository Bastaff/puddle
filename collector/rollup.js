// Events, summed as they arrive: one row per person, conversation, quarter hour and the few things the dashboard
// groups by (kind of event, tool, model, effort, labels like a skill or MCP server's name, the work account…), with
// the counts and sums every card adds up. Reading 90 days then means a few thousand summary rows instead of every
// event and its JSON. Quarter hours because every time zone in use is a whole number of quarter hours from UTC: a
// person's local days and hours come out exactly the same as from the events themselves.
//
// Kept right by recomputing, never by adding up deltas: when events arrive, each conversation-and-quarter-hour they
// touch is worked out again from its events (delete, then insert one GROUP BY). A resend changes nothing, a detail
// filled in later (a work account, an effort level) or a copy replaced by telemetry is simply recomputed. Missing
// values stay NULL (no conversation, no model), exactly as in the events, so counts and distincts match.
//
// Postgres (the team service) and SQLite (a Mac's own copy, the demo) share the SQL; `S` is collector/sql.js.

export const QUARTER = 900_000;
export const ROLLUP_VERSION = 4; // bump when a dimension or measure changes: the table is rebuilt at the next start

// what each event contributes, as columns (alias e = an events row)
export function rollupColumns(S, e = 'e') {
  const J = (key, as) => S.json(`${e}.attrs_json`, key, as);
  const dims = {
    user_key: `${e}.user_key`,
    session_id: `${e}.session_id`,
    bucket: `(${e}.ts - (${e}.ts % ${QUARTER}))`,
    name: `${e}.name`,
    agent: `${e}.agent`,
    tool_name: `${e}.tool_name`,
    model: `${e}.model`,
    decision: `${e}.decision`,
    source: `${e}.source`,
    // the work account this came from (a fingerprint): what an account-based team share filters on
    org: J('context.org'),
    effort: `CASE WHEN ${e}.name = 'api_request' THEN ${J('effort')} END`,
    // a model call made by a sub-agent (not the conversation's own)
    sub: `CASE WHEN ${e}.name = 'api_request' AND ${J('agent.name')} IS NOT NULL THEN 1 ELSE 0 END`,
    // the one name each kind carries: the skill, the MCP server a call used, the sub-agent type, the hook, the
    // HTTP status of an API error, what triggered a compaction
    label: `CASE ${e}.name WHEN 'skill_activated' THEN ${J('skill.name')} WHEN 'api_request' THEN ${J('mcp_server.name')}
      WHEN 'subagent_completed' THEN ${J('agent_type')} WHEN 'hook_execution_complete' THEN ${J('hook_name')}
      WHEN 'api_error' THEN CAST(${J('status_code', 'int')} AS TEXT) WHEN 'compaction' THEN ${J('trigger')} END`,
    // a permission decision the person made themselves (not a rule or a hook)
    by_user: `CASE WHEN ${e}.name = 'tool_decision' AND ${J('source')} LIKE 'user%' THEN 1 ELSE 0 END`,
    // a model call that only compacted the conversation (left out of "how full conversations get")
    compact: `CASE WHEN ${e}.name = 'api_request' AND COALESCE(${J('query_source')}, '') = 'compact' THEN 1 ELSE 0 END`,
  };
  const inputAll = `COALESCE(${e}.input_tokens,0) + COALESCE(${e}.cache_read,0) + COALESCE(${e}.cache_creation,0)`;
  // per event, and how a group of them adds up
  const measures = {
    n: ['1', 'SUM'],
    fails: [`CASE WHEN ${e}.success = 0 THEN 1 ELSE 0 END`, 'SUM'],
    tok: [`${inputAll} + COALESCE(${e}.output_tokens,0)`, 'SUM'],
    cost: [`${e}.cost_usd`, 'SUM'],
    cache_read: [`${e}.cache_read`, 'SUM'],
    input: [`${e}.input_tokens`, 'SUM'],
    output: [`${e}.output_tokens`, 'SUM'],
    cache_creation: [`${e}.cache_creation`, 'SUM'],
    input_all: [inputAll, 'SUM'],
    ctx_max: [inputAll, 'MAX'],
    win_max: [J('context_window', 'int'), 'MAX'],
    plen_sum: [`${e}.prompt_length`, 'SUM'],
    plen_n: [`CASE WHEN ${e}.prompt_length IS NOT NULL THEN 1 ELSE 0 END`, 'SUM'],
    hook_err: [`CASE WHEN COALESCE(${J('num_non_blocking_error', 'int')}, 0) > 0 THEN 1 ELSE 0 END`, 'SUM'],
    min_ts: [`${e}.ts`, 'MIN'],
    max_ts: [`${e}.ts`, 'MAX'],
  };
  return { dims, measures };
}

export const ROLLUP_COLS = ['user_key', 'session_id', 'bucket', 'name', 'agent', 'tool_name', 'model', 'decision', 'source', 'org', 'effort', 'sub', 'label', 'by_user', 'compact',
  'n', 'fails', 'tok', 'cost', 'cache_read', 'input', 'output', 'cache_creation', 'input_all', 'ctx_max', 'win_max', 'plen_sum', 'plen_n', 'hook_err', 'min_ts', 'max_ts'];

export function rollupSchema(dialect) {
  const BIG = 'BIGINT', REAL = dialect === 'pg' ? 'DOUBLE PRECISION' : 'REAL';
  return `
CREATE TABLE IF NOT EXISTS event_rollup (
  user_key TEXT, session_id TEXT, bucket ${BIG} NOT NULL, name TEXT NOT NULL, agent TEXT, tool_name TEXT, model TEXT, decision TEXT, source TEXT,
  org TEXT, effort TEXT, sub INTEGER NOT NULL, label TEXT, by_user INTEGER NOT NULL, compact INTEGER NOT NULL,
  n ${BIG} NOT NULL, fails ${BIG} NOT NULL, tok ${BIG}, cost ${REAL}, cache_read ${BIG}, input ${BIG}, output ${BIG}, cache_creation ${BIG}, input_all ${BIG}, ctx_max ${BIG}, win_max ${BIG},
  plen_sum ${BIG}, plen_n ${BIG} NOT NULL, hook_err ${BIG} NOT NULL, min_ts ${BIG} NOT NULL, max_ts ${BIG} NOT NULL
);
CREATE INDEX IF NOT EXISTS event_rollup_user_bucket ON event_rollup(user_key, bucket);
CREATE INDEX IF NOT EXISTS event_rollup_session_bucket ON event_rollup(session_id, bucket);
CREATE INDEX IF NOT EXISTS event_rollup_bucket ON event_rollup(bucket);
CREATE TABLE IF NOT EXISTS rollup_state (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS active_run (
  user_key TEXT, session_id TEXT NOT NULL, org TEXT, start_ts ${BIG} NOT NULL, end_ts ${BIG} NOT NULL, n ${BIG} NOT NULL
);
CREATE INDEX IF NOT EXISTS active_run_user_end ON active_run(user_key, end_ts);
CREATE INDEX IF NOT EXISTS active_run_session ON active_run(session_id);
CREATE TABLE IF NOT EXISTS prompt_rollup (
  user_key TEXT, session_id TEXT, prompt_id TEXT NOT NULL, bucket ${BIG} NOT NULL, org TEXT,
  up ${BIG} NOT NULL, steps ${BIG} NOT NULL, fails ${BIG} NOT NULL, n ${BIG} NOT NULL, up_min ${BIG}, ans_max ${BIG}
);
CREATE INDEX IF NOT EXISTS prompt_rollup_user_bucket ON prompt_rollup(user_key, bucket);
CREATE INDEX IF NOT EXISTS prompt_rollup_session_bucket ON prompt_rollup(session_id, bucket);
CREATE INDEX IF NOT EXISTS prompt_rollup_prompt ON prompt_rollup(prompt_id);
CREATE TABLE IF NOT EXISTS task_rollup (
  user_key TEXT, session_id TEXT, prompt_id TEXT NOT NULL, bucket ${BIG} NOT NULL, org TEXT, part TEXT, model TEXT,
  calls ${BIG} NOT NULL, input ${BIG}, output ${BIG}, cache_read ${BIG}, cache_creation ${BIG}, cost ${REAL}, tools ${BIG} NOT NULL, agents ${BIG} NOT NULL,
  agent_tokens ${BIG}, min_ts ${BIG}, max_ts ${BIG}
);
CREATE INDEX IF NOT EXISTS task_rollup_user_bucket ON task_rollup(user_key, bucket);
CREATE INDEX IF NOT EXISTS task_rollup_session_bucket ON task_rollup(session_id, bucket);`;
}

// INSERT … SELECT … GROUP BY over the events matching `cond` (on alias e)
function insertGrouped(S, cond) {
  const { dims, measures } = rollupColumns(S);
  const d = Object.values(dims), m = Object.entries(measures).map(([, [expr, agg]]) => `${agg}(${expr})`);
  return `INSERT INTO event_rollup (${ROLLUP_COLS.join(', ')}) SELECT ${[...d, ...m].join(', ')} FROM events e WHERE ${cond} GROUP BY ${d.join(', ')}`;
}

// The whole table again, from every event (first start, a new version, or after bulk changes like a Mac's history import)
export async function rebuildRollup(S) {
  await S.run(`DELETE FROM event_rollup`);
  await S.run(insertGrouped(S, '1 = 1'));
  await S.run(`DELETE FROM active_run`);
  await S.run(insertRuns(S, '1 = 1'));
  await S.run(`DELETE FROM prompt_rollup`);
  await S.run(insertPrompts(S, '1 = 1'));
  await S.run(`DELETE FROM task_rollup`);
  await S.run(insertTasks(S, '1 = 1'));
  await S.run(`INSERT INTO rollup_state (k, v) VALUES ('version', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [String(ROLLUP_VERSION)]);
}
export async function rollupVersion(S) {
  try { return Number((await S.one(`SELECT v FROM rollup_state WHERE k = 'version'`))?.v) || 0; } catch { return 0; }
}

// One person's summary rows for a window [from, to) (whole quarter hours), again from their events: the pieces a
// background build is made of, so arriving data never waits for more than one of them.
export async function rebuildWindow(S, userKey, from, to) {
  await S.run(`DELETE FROM event_rollup WHERE user_key IS NOT DISTINCT FROM ? AND bucket >= ? AND bucket < ?`, [userKey, from, to]);
  await S.run(insertGrouped(S, `e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [userKey, from, to]);
  await S.run(`DELETE FROM prompt_rollup WHERE user_key IS NOT DISTINCT FROM ? AND bucket >= ? AND bucket < ?`, [userKey, from, to]);
  await S.run(insertPrompts(S, `e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [userKey, from, to]);
  await S.run(`DELETE FROM task_rollup WHERE user_key IS NOT DISTINCT FROM ? AND bucket >= ? AND bucket < ?`, [userKey, from, to]);
  await S.run(insertTasks(S, `e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [userKey, from, to]);
}
export async function setRollupVersion(S) {
  await S.run(`INSERT INTO rollup_state (k, v) VALUES ('version', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [String(ROLLUP_VERSION)]);
}

// The conversation-and-quarter-hours some events belong to, as recompute keys
export function touchedKeys(rows) {
  const keys = new Map();
  for (const r of rows) {
    if (r == null || r.ts == null) continue;
    const s = r.session_id ?? null, u = r.user_key ?? null, b = r.ts - (r.ts % QUARTER);
    keys.set(`${s}\u0000${s == null ? u : ''}\u0000${b}`, { session_id: s, user_key: s == null ? u : null, bucket: b });
  }
  return [...keys.values()];
}

// Recompute those keys from their events (inside the caller's transaction)
export async function refreshRollup(S, keys) {
  for (const k of keys) {
    const at = [k.bucket, k.bucket + QUARTER];
    if (k.session_id != null) {
      await S.run(`DELETE FROM event_rollup WHERE session_id = ? AND bucket = ?`, [k.session_id, k.bucket]);
      await S.run(insertGrouped(S, `e.session_id = ? AND e.ts >= ? AND e.ts < ?`), [k.session_id, ...at]);
      await S.run(`DELETE FROM prompt_rollup WHERE session_id = ? AND bucket = ?`, [k.session_id, k.bucket]);
      await S.run(insertPrompts(S, `e.session_id = ? AND e.ts >= ? AND e.ts < ?`), [k.session_id, ...at]);
      await S.run(`DELETE FROM task_rollup WHERE session_id = ? AND bucket = ?`, [k.session_id, k.bucket]);
      await S.run(insertTasks(S, `e.session_id = ? AND e.ts >= ? AND e.ts < ?`), [k.session_id, ...at]);
    } else {
      // events with no conversation (rare): per person
      await S.run(`DELETE FROM event_rollup WHERE session_id IS NULL AND user_key IS NOT DISTINCT FROM ? AND bucket = ?`, [k.user_key, k.bucket]);
      await S.run(insertGrouped(S, `e.session_id IS NULL AND e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [k.user_key, ...at]);
      await S.run(`DELETE FROM prompt_rollup WHERE session_id IS NULL AND user_key IS NOT DISTINCT FROM ? AND bucket = ?`, [k.user_key, k.bucket]);
      await S.run(insertPrompts(S, `e.session_id IS NULL AND e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [k.user_key, ...at]);
      await S.run(`DELETE FROM task_rollup WHERE session_id IS NULL AND user_key IS NOT DISTINCT FROM ? AND bucket = ?`, [k.user_key, k.bucket]);
      await S.run(insertTasks(S, `e.session_id IS NULL AND e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [k.user_key, ...at]);
    }
  }
}

// ---- SQLite (node:sqlite runs synchronously: the same work with prepared statements, inside the caller's BEGIN…COMMIT)
export function sqliteRollup(db, S) {
  db.exec(rollupSchema('sqlite'));
  const del = db.prepare(`DELETE FROM event_rollup WHERE session_id = ? AND bucket = ?`);
  const ins = db.prepare(insertGrouped(S, `e.session_id = ? AND e.ts >= ? AND e.ts < ?`));
  const delNull = db.prepare(`DELETE FROM event_rollup WHERE session_id IS NULL AND user_key IS ? AND bucket = ?`);
  const insNull = db.prepare(insertGrouped(S, `e.session_id IS NULL AND e.user_key IS ? AND e.ts >= ? AND e.ts < ?`));
  const old = db.prepare(`SELECT session_id, user_key, ts FROM events WHERE dedupe = ?`);
  const tail = db.prepare(TAIL), delTail = db.prepare(`DELETE FROM active_run WHERE session_id = ? AND end_ts >= ?`), insTail = db.prepare(insertRuns(S, 'e.session_id = ? AND e.ts >= ?'));
  const delP = db.prepare(`DELETE FROM prompt_rollup WHERE session_id = ? AND bucket = ?`), insP = db.prepare(insertPrompts(S, `e.session_id = ? AND e.ts >= ? AND e.ts < ?`));
  const delT = db.prepare(`DELETE FROM task_rollup WHERE session_id = ? AND bucket = ?`), insT = db.prepare(insertTasks(S, `e.session_id = ? AND e.ts >= ? AND e.ts < ?`));
  const delTNull = db.prepare(`DELETE FROM task_rollup WHERE session_id IS NULL AND user_key IS ? AND bucket = ?`), insTNull = db.prepare(insertTasks(S, `e.session_id IS NULL AND e.user_key IS ? AND e.ts >= ? AND e.ts < ?`));
  const delPNull = db.prepare(`DELETE FROM prompt_rollup WHERE session_id IS NULL AND user_key IS ? AND bucket = ?`), insPNull = db.prepare(insertPrompts(S, `e.session_id IS NULL AND e.user_key IS ? AND e.ts >= ? AND e.ts < ?`));
  return {
    // where a row with this dedupe sits now (before it's replaced), so its old quarter hour is recomputed too
    before: (dedupe) => (dedupe == null ? null : old.get(dedupe) ?? null),
    refresh(keys) {
      // a conversation's end only (see refreshRunTails)
      for (const [sid, since] of tailsOf(keys)) {
        let b = since - RUN_GAP;
        for (let i = 0; i < 50; i++) { const r = tail.get(sid, b); const nb = r?.b == null ? b : Math.min(Number(r.b), b); if (nb >= b) break; b = nb; }
        delTail.run(sid, b); insTail.run(sid, b);
      }
      for (const k of keys) {
        if (k.session_id != null) { del.run(k.session_id, k.bucket); ins.run(k.session_id, k.bucket, k.bucket + QUARTER); delP.run(k.session_id, k.bucket); insP.run(k.session_id, k.bucket, k.bucket + QUARTER); delT.run(k.session_id, k.bucket); insT.run(k.session_id, k.bucket, k.bucket + QUARTER); }
        else { delNull.run(k.user_key, k.bucket); insNull.run(k.user_key, k.bucket, k.bucket + QUARTER); delPNull.run(k.user_key, k.bucket); insPNull.run(k.user_key, k.bucket, k.bucket + QUARTER); delTNull.run(k.user_key, k.bucket); insTNull.run(k.user_key, k.bucket, k.bucket + QUARTER); }
      }
    },
    rebuild() {
      db.exec('DELETE FROM event_rollup');
      db.prepare(insertGrouped(S, '1 = 1')).run();
      db.exec('DELETE FROM active_run');
      db.prepare(insertRuns(S, '1 = 1')).run();
      db.exec('DELETE FROM prompt_rollup');
      db.prepare(insertPrompts(S, '1 = 1')).run();
      db.exec('DELETE FROM task_rollup');
      db.prepare(insertTasks(S, '1 = 1')).run();
      db.prepare(`INSERT INTO rollup_state (k, v) VALUES ('version', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(String(ROLLUP_VERSION));
    },
    version: () => Number(db.prepare(`SELECT v FROM rollup_state WHERE k = 'version'`).get()?.v) || 0,
  };
}

// ---- active time: runs of activity per conversation ----
// Active time counts the stretches between a conversation's consecutive steps (prompt, model call, tool) that are
// under 5 minutes apart. Stored here as runs: per conversation (and work account), each stretch of steps with no
// gap of 5 minutes or more, from its first step to its last. A range's active time is these runs cut to the range:
// a run inside it as it is, one across its start or end from its first or last step inside (exactly what the steps
// alone give). A run of one step (start = end) is no time, but still says when the conversation was last active.
export const ACTIVE_NAMES = ['user_prompt', 'api_request', 'tool_result'];
export const RUN_GAP = 5 * 60_000;
function insertRuns(S, cond) {
  const org = S.json('e.attrs_json', 'context.org');
  const names = ACTIVE_NAMES.map((x) => `'${x}'`).join(', ');
  return `INSERT INTO active_run (user_key, session_id, org, start_ts, end_ts, n)
    SELECT user_key, session_id, org, MIN(ts), MAX(ts), COUNT(*) FROM (
      SELECT user_key, session_id, org, ts, SUM(brk) OVER (PARTITION BY session_id, org ORDER BY ts, id ROWS UNBOUNDED PRECEDING) run FROM (
        SELECT e.user_key, e.session_id, ${org} org, e.ts, e.id,
          CASE WHEN e.ts - LAG(e.ts) OVER (PARTITION BY e.session_id, ${org} ORDER BY e.ts, e.id) < ${RUN_GAP} THEN 0 ELSE 1 END brk
        FROM events e WHERE e.session_id IS NOT NULL AND e.name IN (${names}) AND ${cond}) t) r
    GROUP BY user_key, session_id, org, run`;
}
// After new steps, only a conversation's end is worked out again, never all of it (a long conversation, thousands
// of steps, took seconds per batch of events and kept the database busy: 21 Oct 2026). New steps from `since` on
// can only change runs that end within RUN_GAP before it: from the start of the earliest such run (widened until
// no run reaches across that point: a work account's runs may interleave another's) the runs are made again from
// the steps; every run before it stays as it is. keys: touchedKeys(rows) (their quarter hours mark `since`).
const TAIL = `SELECT MIN(start_ts) b FROM active_run WHERE session_id = ? AND end_ts >= ?`;
export const tailsOf = (keys) => { const m = new Map(); for (const k of keys) if (k.session_id != null) m.set(k.session_id, Math.min(m.get(k.session_id) ?? Infinity, k.bucket)); return m; };
export async function refreshRunTails(S, keys) {
  for (const [sid, since] of tailsOf(keys)) {
    let b = since - RUN_GAP;
    for (let i = 0; i < 50; i++) { const r = await S.one(TAIL, [sid, b]); const nb = r?.b == null ? b : Math.min(Number(r.b), b); if (nb >= b) break; b = nb; }
    await S.run(`DELETE FROM active_run WHERE session_id = ? AND end_ts >= ?`, [sid, b]);
    await S.run(insertRuns(S, 'e.session_id = ? AND e.ts >= ?'), [sid, b]);
  }
}
// one conversation's runs again from all its steps (inside the caller's transaction): repairs, not every batch
export async function refreshRuns(S, sessionIds) {
  for (const sid of sessionIds) {
    await S.run(`DELETE FROM active_run WHERE session_id = ?`, [sid]);
    await S.run(insertRuns(S, 'e.session_id = ?'), [sid]);
  }
}
export const sessionsOf = (rows) => [...new Set(rows.filter((r) => r && r.session_id != null).map((r) => r.session_id))];
// one person's runs again (the background build: one statement per person)
export async function rebuildRunsFor(S, userKey) {
  await S.run(`DELETE FROM active_run WHERE user_key IS NOT DISTINCT FROM ?`, [userKey]);
  await S.run(insertRuns(S, 'e.user_key IS NOT DISTINCT FROM ?'), [userKey]);
}

// ---- per prompt: what one prompt led to, per quarter hour ----
// Steps the agent took after a prompt, how many failed, when the prompt was sent and when its last answer or step
// came: "task size", "handed over" and wait times, without reading every step. Same upkeep as event_rollup
// (recomputed per conversation and quarter hour).
export const PROMPT_COLS = ['user_key', 'session_id', 'prompt_id', 'bucket', 'org', 'up', 'steps', 'fails', 'n', 'up_min', 'ans_max'];
export function promptColumns(S, e = 'e') {
  return {
    dims: { user_key: `${e}.user_key`, session_id: `${e}.session_id`, prompt_id: `${e}.prompt_id`, bucket: `(${e}.ts - (${e}.ts % ${QUARTER}))`, org: S.json(`${e}.attrs_json`, 'context.org') },
    measures: {
      up: [`CASE WHEN ${e}.name = 'user_prompt' THEN 1 ELSE 0 END`, 'SUM'],
      steps: [`CASE WHEN ${e}.name = 'tool_result' THEN 1 ELSE 0 END`, 'SUM'],
      fails: [`CASE WHEN ${e}.name = 'tool_result' AND ${e}.success = 0 THEN 1 ELSE 0 END`, 'SUM'],
      n: ['1', 'SUM'],
      up_min: [`CASE WHEN ${e}.name = 'user_prompt' THEN ${e}.ts END`, 'MIN'],
      ans_max: [`CASE WHEN ${e}.name IN ('api_request', 'assistant_response', 'tool_result') THEN ${e}.ts END`, 'MAX'],
    },
  };
}
// ---- per task: what one prompt and everything it set off cost, by part ----
// A task is a prompt and every model call made for it: the conversation's own (main), each sub-agent's (agent:<type>,
// whose calls carry the prompt that started it), upkeep (compaction, titles, suggestions) and web searches. Tokens,
// cost, the model, tool calls and the sub-agents that finished (with the tokens they report). Kept like prompt_rollup.
export const TASK_COLS = ['user_key', 'session_id', 'prompt_id', 'bucket', 'org', 'part', 'model', 'calls', 'input', 'output', 'cache_read', 'cache_creation', 'cost', 'tools', 'agents', 'agent_tokens', 'min_ts', 'max_ts'];
export const TASK_NAMES = ['api_request', 'tool_result', 'subagent_completed'];
export function taskColumns(S, e = 'e') {
  const qs = `COALESCE(${S.json(`${e}.attrs_json`, 'query_source')}, '')`, an = S.json(`${e}.attrs_json`, 'agent.name'), api = `${e}.name = 'api_request'`;
  return {
    dims: {
      user_key: `${e}.user_key`, session_id: `${e}.session_id`, prompt_id: `${e}.prompt_id`, bucket: `(${e}.ts - (${e}.ts % ${QUARTER}))`, org: S.json(`${e}.attrs_json`, 'context.org'),
      // the main conversation's calls carry no source (or "sdk" from an app or editor); a sub-agent's "agent:builtin:<type>"
      part: `CASE WHEN NOT (${api}) THEN NULL
        WHEN ${qs} LIKE 'agent:%' THEN 'agent:' || REPLACE(REPLACE(REPLACE(${qs}, 'agent:builtin:', ''), 'agent:custom:', ''), 'agent:', '')
        WHEN ${an} IS NOT NULL THEN 'agent:' || ${an}
        WHEN ${qs} IN ('', 'main', 'sdk', 'repl_main_thread') THEN 'main'
        WHEN ${qs} LIKE 'web%' THEN 'web' ELSE 'upkeep' END`,
      model: `CASE WHEN ${api} THEN ${e}.model END`,
    },
    measures: {
      calls: [`CASE WHEN ${api} THEN 1 ELSE 0 END`, 'SUM'],
      input: [`CASE WHEN ${api} THEN ${e}.input_tokens END`, 'SUM'],
      output: [`CASE WHEN ${api} THEN ${e}.output_tokens END`, 'SUM'],
      cache_read: [`CASE WHEN ${api} THEN ${e}.cache_read END`, 'SUM'],
      cache_creation: [`CASE WHEN ${api} THEN ${e}.cache_creation END`, 'SUM'],
      cost: [`CASE WHEN ${api} THEN ${e}.cost_usd END`, 'SUM'],
      tools: [`CASE WHEN ${e}.name = 'tool_result' THEN 1 ELSE 0 END`, 'SUM'],
      agents: [`CASE WHEN ${e}.name = 'subagent_completed' THEN 1 ELSE 0 END`, 'SUM'],
      agent_tokens: [`CASE WHEN ${e}.name = 'subagent_completed' THEN ${S.json(`${e}.attrs_json`, 'total_tokens', 'int')} END`, 'SUM'],
      min_ts: [`${e}.ts`, 'MIN'],
      max_ts: [`${e}.ts`, 'MAX'],
    },
  };
}
function insertTasks(S, cond) {
  const { dims, measures } = taskColumns(S);
  const d = Object.values(dims), m = Object.values(measures).map(([x, agg]) => `${agg}(${x})`);
  return `INSERT INTO task_rollup (${TASK_COLS.join(', ')}) SELECT ${[...d, ...m].join(', ')} FROM events e WHERE e.prompt_id IS NOT NULL AND e.name IN (${TASK_NAMES.map((x) => `'${x}'`).join(', ')}) AND ${cond} GROUP BY ${d.join(', ')}`;
}
function insertPrompts(S, cond) {
  const { dims, measures } = promptColumns(S);
  const d = Object.values(dims), m = Object.values(measures).map(([x, agg]) => `${agg}(${x})`);
  return `INSERT INTO prompt_rollup (${PROMPT_COLS.join(', ')}) SELECT ${[...d, ...m].join(', ')} FROM events e WHERE e.prompt_id IS NOT NULL AND ${cond} GROUP BY ${d.join(', ')}`;
}
