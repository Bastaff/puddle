export const DAY = 86_400_000;
export const FAST_VERSION = 1;

export const WINNERS = new Set(['team.requests', 'team.features', 'team.tools', 'team.hooks', 'team.asks', 'health.ever', 'team.lanes', 'team.waits', 'team.totals', 'team.metrics']);

const DIMS = ['user_key', 'name', 'agent', 'tool_name', 'model', 'decision', 'source', 'org', 'effort', 'sub', 'label', 'by_user', 'compact'];
const MAX = new Set(['ctx_max', 'win_max', 'max_ts']), MIN = new Set(['min_ts']);
const MEASURES = ['n', 'fails', 'tok', 'cost', 'cache_read', 'input', 'output', 'cache_creation', 'input_all', 'ctx_max', 'win_max', 'plen_sum', 'plen_n', 'hook_err', 'min_ts', 'max_ts'];
export const DAY_COLS = ['session_id', 'bucket', ...DIMS, ...MEASURES];

export const TOOL_CATEGORY = `CASE
  WHEN tool_name IN ('Read', 'Grep', 'Glob', 'LS', 'NotebookRead') THEN 'read'
  WHEN tool_name IN ('Edit', 'Write', 'MultiEdit', 'NotebookEdit') THEN 'edit'
  WHEN tool_name IN ('Bash', 'BashOutput', 'KillShell', 'KillBash', 'Monitor') THEN 'run'
  WHEN tool_name IN ('WebFetch', 'WebSearch') THEN 'web'
  WHEN tool_name IN ('Agent', 'Task', 'Skill', 'Workflow') THEN 'agent'
  WHEN substr(tool_name, 1, 5) = 'mcp__' OR tool_name = 'mcp_tool' THEN 'mcp'
  ELSE 'other' END`;
export const CATEGORIES = ['read', 'edit', 'run', 'web', 'agent', 'mcp', 'other'];

export const PQ_VERSION = 4;
const PQ_SUMS = {
  prompts: `CASE WHEN r.name = 'user_prompt' THEN r.n ELSE 0 END`,
  requests: `CASE WHEN r.name = 'api_request' THEN r.n ELSE 0 END`,
  tok: `CASE WHEN r.name = 'api_request' THEN r.tok END`,
  input: `CASE WHEN r.name = 'api_request' THEN r.input END`,
  output: `CASE WHEN r.name = 'api_request' THEN r.output END`,
  cache_read: `CASE WHEN r.name = 'api_request' THEN r.cache_read END`,
  cache_creation: `CASE WHEN r.name = 'api_request' THEN r.cache_creation END`,
  cost: `CASE WHEN r.name = 'api_request' THEN r.cost END`,
  tools: `CASE WHEN r.name = 'tool_result' THEN r.n ELSE 0 END`,
  tool_fails: `CASE WHEN r.name = 'tool_result' THEN r.fails ELSE 0 END`,
  api_errors: `CASE WHEN r.name = 'api_error' THEN r.n ELSE 0 END`,
  ...Object.fromEntries(CATEGORIES.map((c) => [`c_${c}`, `CASE WHEN r.name = 'tool_result' AND ${TOOL_CATEGORY.replace(/tool_name/g, 'r.tool_name')} = '${c}' THEN r.n ELSE 0 END`])),
  main_requests: `CASE WHEN r.name = 'api_request' AND r.sub = 0 THEN r.n ELSE 0 END`,
  input_all: `CASE WHEN r.name = 'api_request' THEN r.input_all END`,
  plen_sum: `CASE WHEN r.name = 'user_prompt' THEN r.plen_sum END`,
  plen_n: `CASE WHEN r.name = 'user_prompt' THEN r.plen_n END`,
  asks: `CASE WHEN r.name = 'tool_decision' AND r.by_user = 1 THEN r.n ELSE 0 END`,
  rejects: `CASE WHEN r.name = 'tool_decision' AND r.decision LIKE '%reject%' THEN r.n ELSE 0 END`,
  decisions: `CASE WHEN r.name = 'tool_decision' THEN r.n ELSE 0 END`,
  skills: `CASE WHEN r.name = 'skill_activated' THEN r.n ELSE 0 END`,
  subagents: `CASE WHEN r.name = 'subagent_completed' THEN r.n ELSE 0 END`,
  mentions: `CASE WHEN r.name = 'at_mention' THEN r.n ELSE 0 END`,
  mcp: `CASE WHEN r.name = 'api_request' AND r.label IS NOT NULL THEN r.n ELSE 0 END`,
  compactions: `CASE WHEN r.name = 'compaction' THEN r.n ELSE 0 END`,
  last_active: `CASE WHEN r.name IN ('user_prompt', 'api_request', 'tool_result') THEN r.max_ts END`,
};
const PQ_MAX = new Set(['last_active']);
const PQ_LANE = ['prompts', 'tools', 'tool_fails', 'api_errors', ...CATEGORIES.map((c) => `c_${c}`)];
const PQ_TOTALS = ['prompts', 'requests', 'main_requests', 'tok', 'cost', 'cache_read', 'input_all', 'tools', 'tool_fails', 'api_errors', 'plen_sum', 'plen_n',
  'asks', 'rejects', 'decisions', 'skills', 'subagents', 'c_web', 'c_edit', 'mentions', 'mcp', 'compactions', 'last_active'];
export const PQ_COLS = Object.keys(PQ_SUMS);
const pqInsert = (cond) => `INSERT INTO person_quarter (user_key, bucket, ${PQ_COLS.join(', ')})
  SELECT r.user_key, r.bucket, ${PQ_COLS.map((c) => `${PQ_MAX.has(c) ? 'MAX' : 'SUM'}(${PQ_SUMS[c]})`).join(', ')} FROM event_rollup r
  WHERE r.user_key IS NOT NULL AND ${cond} AND NOT EXISTS (SELECT 1 FROM excluded_sessions xs WHERE xs.session_id = r.session_id) GROUP BY r.user_key, r.bucket`;
const OF_SESSION = `IN (SELECT DISTINCT user_key FROM event_rollup WHERE session_id = ? AND bucket = ?)`;
export async function pqSession(T, sessionId, bucket) {
  await T.run(`DELETE FROM person_quarter WHERE bucket = ? AND user_key ${OF_SESSION}`, [bucket, sessionId, bucket]);
  await T.run(pqInsert(`r.bucket = ? AND r.user_key ${OF_SESSION}`), [bucket, sessionId, bucket]);
}
export async function pqUser(T, user, from, to) {
  if (user == null) return;
  await T.run(`DELETE FROM person_quarter WHERE user_key = ? AND bucket >= ? AND bucket < ?`, [user, from, to]);
  await T.run(pqInsert(`r.user_key = ? AND r.bucket >= ? AND r.bucket < ?`), [user, from, to]);
}
export const pqMark = async (S) => { const ex = await S.one(`SELECT COUNT(*) n, MAX(added) a FROM excluded_sessions`, []); return `${PQ_VERSION}|${ex?.n || 0}|${ex?.a || 0}`; };
export async function pqReady(S) {
  try { const [v, m] = await Promise.all([S.one(`SELECT v FROM rollup_state WHERE k = 'pq'`, []), pqMark(S)]); return v?.v === m; } catch { return false; }
}
export async function pqBuild(T) {
  await T.run(`LOCK TABLE person_quarter IN EXCLUSIVE MODE`, []);
  await T.run(`LOCK TABLE prompt_facts IN EXCLUSIVE MODE`, []);
  await T.run(`LOCK TABLE metric_quarter IN EXCLUSIVE MODE`, []);
  await T.run(`DELETE FROM person_quarter`, []);
  await T.run(pqInsert('1 = 1'), []);
  await T.run(`DELETE FROM metric_quarter`, []);
  await T.run(mqInsert('1 = 1'), []);
  await T.run(`DELETE FROM prompt_facts`, []);
  await T.run(pfInsert('1 = 1'), []);
  await T.run(`INSERT INTO rollup_state (k, v) VALUES ('pq', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`, [await pqMark(T)]);
}

const Q = 900_000;
const mqInsert = (cond) => `INSERT INTO metric_quarter (user_key, bucket, name, type, v)
  SELECT m.user_key, m.ts - (m.ts % ${Q}), m.name, m.type, SUM(m.value) FROM metric_points m
  WHERE m.user_key IS NOT NULL AND ${cond} AND NOT EXISTS (SELECT 1 FROM excluded_sessions xs WHERE xs.session_id = m.session_id) GROUP BY 1, 2, 3, 4`;
export async function mqRefresh(T, points) {
  const span = new Map();
  for (const p of points) {
    if (p.user == null) continue;
    const b = p.ts - (p.ts % Q), s = span.get(p.user);
    span.set(p.user, s ? [Math.min(s[0], b), Math.max(s[1], b + Q)] : [b, b + Q]);
  }
  for (const [u, [from, to]] of span) {
    await T.run(`DELETE FROM metric_quarter WHERE user_key = ? AND bucket >= ? AND bucket < ?`, [u, from, to]);
    await T.run(mqInsert(`m.user_key = ? AND m.ts >= ? AND m.ts < ?`), [u, from, to]);
  }
}

export async function pfRefresh(T, ids) {
  const list = [...new Set(ids.filter((x) => x != null))];
  for (let i = 0; i < list.length; i += 500) {
    const c = list.slice(i, i + 500), qs = c.map(() => '?').join(', ');
    await T.run(`DELETE FROM prompt_facts WHERE prompt_id IN (${qs})`, c);
    await T.run(pfInsert(`r.prompt_id IN (${qs})`), c);
  }
}
const pfInsert = (cond) => `INSERT INTO prompt_facts (prompt_id, user_key, session_id, ups, t, up_max, ans_max)
  SELECT r.prompt_id, r.user_key, MIN(r.session_id), SUM(CASE WHEN xs.session_id IS NULL THEN r.up ELSE 0 END),
    MIN(CASE WHEN xs.session_id IS NULL AND r.up > 0 THEN r.up_min END), MAX(CASE WHEN xs.session_id IS NULL AND r.up > 0 THEN r.up_min END),
    (SELECT MAX(q.ans_max) FROM prompt_rollup q WHERE q.prompt_id = r.prompt_id)
  FROM prompt_rollup r LEFT JOIN excluded_sessions xs ON xs.session_id = r.session_id WHERE ${cond} GROUP BY r.prompt_id, r.user_key`;
export const promptIdsOf = async (T, cond, params) => (await T.all(`SELECT DISTINCT prompt_id FROM prompt_rollup WHERE ${cond}`, params)).map((r) => r.prompt_id);

export function fastSchema(dialect) {
  const BIG = 'BIGINT', REAL = dialect === 'pg' ? 'DOUBLE PRECISION' : 'REAL';
  const pqCols = PQ_COLS.map((c) => `${c} ${c === 'cost' ? REAL : BIG}`).join(', ');
  return `
CREATE TABLE IF NOT EXISTS prompt_facts (prompt_id TEXT NOT NULL, user_key TEXT, session_id TEXT, ups ${BIG} NOT NULL, t ${BIG}, up_max ${BIG}, ans_max ${BIG});
CREATE INDEX IF NOT EXISTS prompt_facts_prompt ON prompt_facts(prompt_id);
CREATE INDEX IF NOT EXISTS prompt_facts_twice ON prompt_facts(user_key, up_max) WHERE ups > 1;
DROP INDEX IF EXISTS prompt_facts_user_t;
CREATE INDEX IF NOT EXISTS prompt_facts_user_time ON prompt_facts(user_key, t)${dialect === 'pg' ? ' INCLUDE (ups, up_max, ans_max, prompt_id)' : ''};
CREATE TABLE IF NOT EXISTS person_quarter (user_key TEXT NOT NULL, bucket ${BIG} NOT NULL, ${pqCols});${dialect === 'pg' ? `
${PQ_COLS.map((c) => `ALTER TABLE person_quarter ADD COLUMN IF NOT EXISTS ${c} ${c === 'cost' ? REAL : BIG};`).join('\n')}
DROP INDEX IF EXISTS person_quarter_key;
CREATE UNIQUE INDEX IF NOT EXISTS person_quarter_lane ON person_quarter(user_key, bucket) INCLUDE (${PQ_LANE.join(', ')});
CREATE INDEX IF NOT EXISTS person_quarter_totals ON person_quarter(user_key, bucket) INCLUDE (${PQ_TOTALS.join(', ')});` : `
CREATE UNIQUE INDEX IF NOT EXISTS person_quarter_lane ON person_quarter(user_key, bucket);`}
CREATE TABLE IF NOT EXISTS metric_quarter (user_key TEXT NOT NULL, bucket ${BIG} NOT NULL, name TEXT NOT NULL, type TEXT, v ${REAL} NOT NULL);
CREATE INDEX IF NOT EXISTS metric_quarter_user ON metric_quarter(user_key, bucket)${dialect === 'pg' ? ' INCLUDE (name, type, v)' : ''};
CREATE TABLE IF NOT EXISTS event_day (
  user_key TEXT, session_id TEXT, bucket ${BIG} NOT NULL, name TEXT NOT NULL, agent TEXT, tool_name TEXT, model TEXT, decision TEXT, source TEXT,
  org TEXT, effort TEXT, sub INTEGER NOT NULL, label TEXT, by_user INTEGER NOT NULL, compact INTEGER NOT NULL,
  n ${BIG} NOT NULL, fails ${BIG} NOT NULL, tok ${BIG}, cost ${REAL}, cache_read ${BIG}, input ${BIG}, output ${BIG}, cache_creation ${BIG}, input_all ${BIG}, ctx_max ${BIG}, win_max ${BIG},
  plen_sum ${BIG}, plen_n ${BIG} NOT NULL, hook_err ${BIG} NOT NULL, min_ts ${BIG} NOT NULL, max_ts ${BIG} NOT NULL
);
CREATE INDEX IF NOT EXISTS event_day_user_name_bucket ON event_day(user_key, name, bucket);
CREATE TABLE IF NOT EXISTS event_day_done (user_key TEXT NOT NULL, day ${BIG} NOT NULL, built ${BIG} NOT NULL, PRIMARY KEY (user_key, day));`;
}

export async function buildDay(T, user, day) {
  await T.run(`DELETE FROM event_day WHERE user_key = ? AND bucket = ?`, [user, day]);
  const agg = (c) => `${MAX.has(c) ? 'MAX' : MIN.has(c) ? 'MIN' : 'SUM'}(r.${c})`;
  await T.run(`INSERT INTO event_day (${DAY_COLS.join(', ')}) SELECT NULL, ?, ${DIMS.map((d) => `r.${d}`).join(', ')}, ${MEASURES.map(agg).join(', ')}
    FROM event_rollup r WHERE r.user_key = ? AND r.bucket >= ? AND r.bucket < ?
      AND NOT EXISTS (SELECT 1 FROM excluded_sessions xs WHERE xs.session_id = r.session_id)
    GROUP BY ${DIMS.map((d) => `r.${d}`).join(', ')}`, [day, user, day, day + DAY]);
  await T.run(`INSERT INTO event_day_done (user_key, day, built) VALUES (?, ?, ?) ON CONFLICT (user_key, day) DO UPDATE SET built = excluded.built`, [user, day, Date.now()]);
}

export const unmarkSession = (T, sessionId, bucket) => T.run(`DELETE FROM event_day_done WHERE day = ? AND user_key IN (SELECT DISTINCT user_key FROM event_rollup WHERE session_id = ? AND bucket = ?)`,
  [bucket - (bucket % DAY), sessionId, bucket]);
export const unmarkUser = (T, user, from, to) => T.run(`DELETE FROM event_day_done WHERE user_key IS NOT DISTINCT FROM ? AND day >= ? AND day < ?`, [user, from - (from % DAY), to]);

export async function doneDays(S, members, from, to) {
  const out = new Map();
  if (!members?.length) return out;
  const rows = await S.all(`SELECT user_key, day FROM event_day_done WHERE user_key IN (${members.map(() => '?').join(', ')}) AND day >= ? AND day < ?`, [...members, from - DAY, to]);
  for (const r of rows) { if (!out.has(r.user_key)) out.set(r.user_key, new Set()); out.get(r.user_key).add(Number(r.day)); }
  return out;
}

export function daySplit(f, done, A, B) {
  if (!done || !f.members?.length || f.client || (f.scope && !f.scope.every((m) => m.all))) return null;
  const since = new Map((f.scope || []).map((m) => [m.account_id, Number(m.since) || 0]));
  const quarter = [], day = [];
  let any = false;
  for (const u of f.members) {
    const s = since.get(u) || 0, first = Math.max(Math.ceil(A / DAY) * DAY, Math.ceil(s / DAY) * DAY), last = Math.floor(B / DAY) * DAY, have = done.get(u) || new Set();
    const runs = [];
    for (const d of [...have].filter((x) => x >= first && x + DAY <= last).sort((a, b) => a - b)) {
      const r = runs[runs.length - 1];
      if (r && r[1] === d) r[1] = d + DAY; else runs.push([d, d + DAY]);
    }
    let at = A;
    for (const r of runs) { if (r[0] > at) quarter.push([u, at, r[0]]); day.push([u, ...r]); at = r[1]; any = true; }
    if (at < B) quarter.push([u, at, B]);
  }
  return any ? { quarter, day } : null;
}

export function makeDayFiller(S, { inTx, lockFor, log = () => {} }) {
  let running = false;
  return async function fill({ busy = null, limit = 500 } = {}) {
    if (running) return 0;
    running = true;
    let n = 0;
    try {
      const ex = await S.one(`SELECT COUNT(*) n, MAX(added) a FROM excluded_sessions`, []);
      const mark = `${FAST_VERSION}|${ex?.n || 0}|${ex?.a || 0}`;
      const was = (await S.one(`SELECT v FROM rollup_state WHERE k = 'fast'`, []))?.v;
      if (was !== mark) {
        await S.run(`DELETE FROM event_day_done`, []);
        await S.run(`INSERT INTO rollup_state (k, v) VALUES ('fast', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`, [mark]);
      }
      const today = Date.now() - (Date.now() % DAY);
      const todo = await S.all(`SELECT x.user_key, x.day FROM (SELECT DISTINCT r.user_key, r.bucket - (r.bucket % ${DAY}) AS day FROM event_rollup r
          WHERE r.user_key IS NOT NULL AND r.bucket < ?) x
        WHERE NOT EXISTS (SELECT 1 FROM event_day_done d WHERE d.user_key = x.user_key AND d.day = x.day) ORDER BY x.day DESC LIMIT ?`, [today, limit]);
      for (const t of todo) {
        for (let i = 0; i < 60 && busy?.(); i++) await new Promise((r) => setTimeout(r, 500));
        await inTx(async (T) => { await lockFor(T, [t.user_key]); await buildDay(T, t.user_key, Number(t.day)); });
        n++;
      }
      if (n) log(`day table: ${n} person-days built`);
      if (!(await pqReady(S))) {
        const t = Date.now(); await inTx(async (T) => pqBuild(T));
        for (const t of ['person_quarter', 'prompt_facts', 'metric_quarter']) await S.exec(`VACUUM ANALYZE ${t}`).catch(() => {});
        log(`person_quarter built in ${Date.now() - t} ms`);
      }
      if (n) await S.exec(`VACUUM ANALYZE event_day`).catch(() => {});
    } catch (e) { log(`day table: ${e.message}`); } finally { running = false; }
    return n;
  };
}
