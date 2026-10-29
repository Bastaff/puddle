// One small database layer for two databases:
//   SQLite (node:sqlite): on the device (Me, the local tracker)
//   PostgreSQL (pg / PGlite): the team service (Cloud SQL in production, PGlite locally and in tests)
// Queries are written once in portable SQL; the few things the two disagree on
// (dates, JSON fields, LEAST/GREATEST, placeholders) go through the helpers here.
// Everything is async so both look the same to callers.

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Date parts, keyed by what the dashboard needs. `ts` is milliseconds since 1970.
const SQLITE_FMT = { day: '%Y-%m-%d', hour: '%Y-%m-%dT%H:00', minute: '%Y-%m-%dT%H:%M', datetime: '%Y-%m-%d %H:%M:%S' };
const PG_FMT = { day: 'YYYY-MM-DD', hour: 'YYYY-MM-DD"T"HH24:00', minute: 'YYYY-MM-DD"T"HH24:MI', datetime: 'YYYY-MM-DD HH24:MI:SS' };

const common = {
  // How many rows match: portable (SQLite ≥ 3.30 and Postgres both support FILTER)
  count: (cond) => `COUNT(*) FILTER (WHERE ${cond})`,
};

export function sqliteSql(db) {
  return {
    dialect: 'sqlite',
    raw: db,
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async one(sql, params = []) { return db.prepare(sql).get(...params) ?? null; },
    async run(sql, params = []) { return { changes: Number(db.prepare(sql).run(...params).changes) }; },
    async exec(sql) { db.exec(sql); },
    ...common,
    // `part`: day | hour | minute | datetime (text) or dow | hourOfDay (integers).
    // local = the server's clock; otherwise UTC shifted by offSec (the viewer's offset).
    time(ts, part, { offSec = 0, local = false } = {}) {
      const at = `${ts} / 1000${offSec ? ` + ${Math.round(offSec)}` : ''}, 'unixepoch'${local ? ", 'localtime'" : ''}`;
      if (part === 'dow') return `CAST(strftime('%w', ${at}) AS INTEGER)`;
      if (part === 'hourOfDay') return `CAST(strftime('%H', ${at}) AS INTEGER)`;
      return `strftime('${SQLITE_FMT[part]}', ${at})`;
    },
    json(col, key, as) {
      const v = `json_extract(${col}, '$."${key}"')`;
      return as === 'int' ? `CAST(${v} AS INTEGER)` : as === 'float' ? `CAST(${v} AS REAL)` : v;
    },
    // b's keys plus any keys only a has (b wins): fills in details without changing what's there
    jsonFill: (a, b) => `json_patch(COALESCE(${a}, '{}'), COALESCE(${b}, '{}'))`,
    // the same JSON (spacing aside)
    jsonSame: (a, b) => `json(COALESCE(${a}, '{}')) = json(COALESCE(${b}, '{}'))`,
    least: (a, b) => `MIN(COALESCE(${a}, ${b}), COALESCE(${b}, ${a}))`,
    greatest: (a, b) => `MAX(COALESCE(${a}, ${b}), COALESCE(${b}, ${a}))`,
  };
}

// `pg` is a pg.Pool, a pg.Client or a PGlite instance (all have .query(text, params)).
export function pgSql(pg) {
  const q = (sql, params) => pg.query(numbered(sql), params);
  return {
    dialect: 'pg',
    raw: pg,
    async all(sql, params = []) { return (await q(sql, params)).rows; },
    async one(sql, params = []) { return (await q(sql, params)).rows[0] ?? null; },
    async run(sql, params = []) { const r = await q(sql, params); return { changes: r.rowCount ?? r.affectedRows ?? 0 }; },
    async exec(sql) { await (pg.exec ? pg.exec(sql) : pg.query(sql)); },
    ...common,
    time(ts, part, { offSec = 0, local = false } = {}) {
      const at = `(to_timestamp(${ts} / 1000.0${offSec ? ` + ${Math.round(offSec)}` : ''}) AT TIME ZONE '${local ? LOCAL_TZ : 'UTC'}')`;
      if (part === 'dow') return `CAST(EXTRACT(DOW FROM ${at}) AS INTEGER)`;
      if (part === 'hourOfDay') return `CAST(EXTRACT(HOUR FROM ${at}) AS INTEGER)`;
      return `to_char(${at}, '${PG_FMT[part]}')`;
    },
    json(col, key, as) {
      const v = `(${col}::jsonb ->> '${key}')`;
      return as === 'int' ? `CAST(${v} AS INTEGER)` : as === 'float' ? `CAST(${v} AS DOUBLE PRECISION)` : v;
    },
    jsonFill: (a, b) => `(COALESCE(${a}, '{}')::jsonb || COALESCE(${b}, '{}')::jsonb)::text`,
    jsonSame: (a, b) => `COALESCE(${a}, '{}')::jsonb = COALESCE(${b}, '{}')::jsonb`,
    least: (a, b) => `LEAST(${a}, ${b})`,
    greatest: (a, b) => `GREATEST(${a}, ${b})`,
  };
}

// SQLite placeholders (?) → Postgres ($1, $2 …), skipping anything inside quotes.
export function numbered(sql) {
  let n = 0, out = '', quote = null;
  for (const ch of sql) {
    if (quote) { if (ch === quote) quote = null; out += ch; continue; }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    out += ch === '?' ? `$${++n}` : ch;
  }
  return out;
}

// Accepts a dialect wrapper, a store from db.js ({ sql }), a Postgres connection (pg / PGlite: .query),
// or a raw node:sqlite database (.prepare).
export const asSql = (x) => (x?.dialect && typeof x.all === 'function' ? x
  : x?.sql?.dialect ? x.sql
  : typeof x?.query === 'function' && typeof x?.prepare !== 'function' ? pgSql(x)
  : sqliteSql(x));
