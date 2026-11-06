const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const SQLITE_FMT = { day: '%Y-%m-%d', hour: '%Y-%m-%dT%H:00', minute: '%Y-%m-%dT%H:%M', datetime: '%Y-%m-%d %H:%M:%S' };
const PG_FMT = { day: 'YYYY-MM-DD', hour: 'YYYY-MM-DD"T"HH24:00', minute: 'YYYY-MM-DD"T"HH24:MI', datetime: 'YYYY-MM-DD HH24:MI:SS' };

const common = {
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
    jsonFill: (a, b) => `json_patch(COALESCE(${a}, '{}'), COALESCE(${b}, '{}'))`,
    jsonSame: (a, b) => `json(COALESCE(${a}, '{}')) = json(COALESCE(${b}, '{}'))`,
    least: (a, b) => `MIN(COALESCE(${a}, ${b}), COALESCE(${b}, ${a}))`,
    greatest: (a, b) => `MAX(COALESCE(${a}, ${b}), COALESCE(${b}, ${a}))`,
  };
}

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

export function numbered(sql) {
  let n = 0, out = '', quote = null;
  for (const ch of sql) {
    if (quote) { if (ch === quote) quote = null; out += ch; continue; }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    out += ch === '?' ? `$${++n}` : ch;
  }
  return out;
}

export const asSql = (x) => (x?.dialect && typeof x.all === 'function' ? x
  : x?.sql?.dialect ? x.sql
  : typeof x?.query === 'function' && typeof x?.prepare !== 'function' ? pgSql(x)
  : sqliteSql(x));
