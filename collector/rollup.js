export const QUARTER = 900_000;
export const ROLLUP_VERSION = 4;

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
    org: J('context.org'),
    effort: `CASE WHEN ${e}.name = 'api_request' THEN ${J('effort')} END`,
    sub: `CASE WHEN ${e}.name = 'api_request' AND ${J('agent.name')} IS NOT NULL THEN 1 ELSE 0 END`,
    label: `CASE ${e}.name WHEN 'skill_activated' THEN ${J('skill.name')} WHEN 'api_request' THEN ${J('mcp_server.name')}
      WHEN 'subagent_completed' THEN ${J('agent_type')} WHEN 'hook_execution_complete' THEN ${J('hook_name')}
      WHEN 'api_error' THEN CAST(${J('status_code', 'int')} AS TEXT) WHEN 'compaction' THEN ${J('trigger')} END`,
    by_user: `CASE WHEN ${e}.name = 'tool_decision' AND ${J('source')} LIKE 'user%' THEN 1 ELSE 0 END`,
    compact: `CASE WHEN ${e}.name = 'api_request' AND COALESCE(${J('query_source')}, '') = 'compact' THEN 1 ELSE 0 END`,
  };
  const inputAll = `COALESCE(${e}.input_tokens,0) + COALESCE(${e}.cache_read,0) + COALESCE(${e}.cache_creation,0)`;
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

function insertGrouped(S, cond) {
  const { dims, measures } = rollupColumns(S);
  const d = Object.values(dims), m = Object.entries(measures).map(([, [expr, agg]]) => `${agg}(${expr})`);
  return `INSERT INTO event_rollup (${ROLLUP_COLS.join(', ')}) SELECT ${[...d, ...m].join(', ')} FROM events e WHERE ${cond} GROUP BY ${d.join(', ')}`;
}

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

export function touchedKeys(rows) {
  const keys = new Map();
  for (const r of rows) {
    if (r == null || r.ts == null) continue;
    const s = r.session_id ?? null, u = r.user_key ?? null, b = r.ts - (r.ts % QUARTER);
    keys.set(`${s}\u0000${s == null ? u : ''}\u0000${b}`, { session_id: s, user_key: s == null ? u : null, bucket: b });
  }
  return [...keys.values()];
}

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
      await S.run(`DELETE FROM event_rollup WHERE session_id IS NULL AND user_key IS NOT DISTINCT FROM ? AND bucket = ?`, [k.user_key, k.bucket]);
      await S.run(insertGrouped(S, `e.session_id IS NULL AND e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [k.user_key, ...at]);
      await S.run(`DELETE FROM prompt_rollup WHERE session_id IS NULL AND user_key IS NOT DISTINCT FROM ? AND bucket = ?`, [k.user_key, k.bucket]);
      await S.run(insertPrompts(S, `e.session_id IS NULL AND e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [k.user_key, ...at]);
      await S.run(`DELETE FROM task_rollup WHERE session_id IS NULL AND user_key IS NOT DISTINCT FROM ? AND bucket = ?`, [k.user_key, k.bucket]);
      await S.run(insertTasks(S, `e.session_id IS NULL AND e.user_key IS NOT DISTINCT FROM ? AND e.ts >= ? AND e.ts < ?`), [k.user_key, ...at]);
    }
  }
}

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
    before: (dedupe) => (dedupe == null ? null : old.get(dedupe) ?? null),
    refresh(keys) {
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
export async function refreshRuns(S, sessionIds) {
  for (const sid of sessionIds) {
    await S.run(`DELETE FROM active_run WHERE session_id = ?`, [sid]);
    await S.run(insertRuns(S, 'e.session_id = ?'), [sid]);
  }
}
export const sessionsOf = (rows) => [...new Set(rows.filter((r) => r && r.session_id != null).map((r) => r.session_id))];
export async function rebuildRunsFor(S, userKey) {
  await S.run(`DELETE FROM active_run WHERE user_key IS NOT DISTINCT FROM ?`, [userKey]);
  await S.run(insertRuns(S, 'e.user_key IS NOT DISTINCT FROM ?'), [userKey]);
}

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
export const TASK_COLS = ['user_key', 'session_id', 'prompt_id', 'bucket', 'org', 'part', 'model', 'calls', 'input', 'output', 'cache_read', 'cache_creation', 'cost', 'tools', 'agents', 'agent_tokens', 'min_ts', 'max_ts'];
export const TASK_NAMES = ['api_request', 'tool_result', 'subagent_completed'];
export function taskColumns(S, e = 'e') {
  const qs = `COALESCE(${S.json(`${e}.attrs_json`, 'query_source')}, '')`, an = S.json(`${e}.attrs_json`, 'agent.name'), api = `${e}.name = 'api_request'`;
  return {
    dims: {
      user_key: `${e}.user_key`, session_id: `${e}.session_id`, prompt_id: `${e}.prompt_id`, bucket: `(${e}.ts - (${e}.ts % ${QUARTER}))`, org: S.json(`${e}.attrs_json`, 'context.org'),
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
