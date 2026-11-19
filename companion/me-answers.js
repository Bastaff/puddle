import { makeQueries, parseFilters } from '../collector/queries.js';
import { trackedRollup } from '../collector/rollup.js';
import { sqliteSql } from '../collector/sql.js';
import { rhythm, activeSegments } from '../collector/forecast.js';

const DAY = 864e5;

export function highlights({ days, person, hours, summary, now = Date.now(), tz = 0 }) {
  const active = days.filter((d) => d.prompts > 0 || d.sessions > 0).map((d) => d.day).sort();
  const n = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / DAY);
  let best = 0, run = 0;
  for (let i = 0; i < active.length; i++) { run = i && n(active[i]) === n(active[i - 1]) + 1 ? run + 1 : 1; best = Math.max(best, run); }
  const today = n(new Date(now + tz * 60_000).toISOString().slice(0, 10));
  let current = 0;
  for (let d = active.length - 1, want = today; d >= 0; d--) {
    if (n(active[d]) === want) { current++; want--; } else if (n(active[d]) === today - 1 && current === 0) { current = 1; want = today - 2; } else break;
  }
  const top = days.reduce((a, d) => (d.prompts > (a?.prompts || 0) ? d : a), null);
  const mix = person?.mix || {};
  const kind = Object.entries(mix).filter(([k]) => k !== 'other').sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const peak = hours.reduce((a, h) => (h.n > (a?.n || 0) ? h : a), null);
  const tokens = summary.tokens ? Object.values(summary.tokens).reduce((a, b) => a + (b || 0), 0) : 0;
  const agentHours = Math.round(((summary.activeSeconds?.cli || 0) / 3600) * 10) / 10;
  return {
    streak: { current, best }, activeDays: active.length,
    bestDay: top && { day: top.day, prompts: top.prompts },
    last28: Array.from({ length: 28 }, (_, i) => { const k = new Date((today - 27 + i) * DAY).toISOString().slice(0, 10); return days.find((d) => d.day === k)?.prompts || 0; }),
    kind, peakHour: peak?.hour ?? null, byHour: Array.from({ length: 24 }, (_, h) => hours.find((x) => x.hour === h)?.n || 0),
    persona: peak == null ? null : peak.hour < 5 || peak.hour >= 22 ? 'Night owl' : peak.hour < 9 ? 'Early bird' : peak.hour < 17 ? 'Daytime builder' : 'Evening hacker',
    tokens, agentHours, prompts: summary.prompts || 0, sessions: summary.sessions || 0,
    handsOff: person?.autonomy ?? null,
    lines: summary.lines || { added: 0, removed: 0 },
    features: Object.values(person?.featureNames || {}).reduce((a, list) => a + (Array.isArray(list) ? list.length : 0), 0),
  };
}

export function makeMeAnswers(db, { log = () => {} } = {}) {
  const sums = trackedRollup(db, sqliteSql(db), { log: (m) => log(`me ${m}`) });
  let ready = false;
  let later = null;
  const sync = async (budgetMs = 1000, most = 300) => {
    try { ready = await sums.sync({ budgetMs, most }); } catch (e) { ready = false; log(`me summary: ${e.code || e.message}`); }
    if (!ready && !later) later = setTimeout(() => { later = null; sync(2000, Infinity); }, 3000);
  };
  const q = makeQueries(db, { rollup: () => ready, fast: () => false });
  const activeStmt = db.prepare(`SELECT COALESCE(SUM(CASE WHEN d < 300000 THEN d ELSE 0 END), 0) / 1000.0 secs FROM
    (SELECT ts - LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) d FROM events WHERE ts >= ? AND ts < ? AND session_id IS NOT NULL)`);
  const rowsStmt = db.prepare(`SELECT session_id session, ts FROM events WHERE ts >= ? AND session_id IS NOT NULL`);
  const activeSecs = (from, to = Date.now() + 60_000) => activeStmt.get(from, to).secs;
  const range = (from) => ({ ...parseFilters(new URLSearchParams({ from: String(from), to: String(Date.now() + 60_000) })), user: null });
  let rhythmKept = null;
  const rhythmData = (tz, version = 0, now = Date.now()) => {
    const key = `${tz}|${version}|${Math.floor(now / 600_000)}`;
    if (rhythmKept?.key !== key) rhythmKept = { key, r: rhythm(rowsStmt.all(now - 90 * DAY), { now, tz }) };
    return rhythmKept.r;
  };
  const lastHours = (now = Date.now()) => {
    const Q = 15 * 60_000, end = Math.ceil(now / Q) * Q, from = end - 24 * Q;
    const mins = new Array(24).fill(0);
    for (const [a, b] of activeSegments(rowsStmt.all(from - 5 * 60_000))) {
      for (let i = Math.max(0, Math.floor((a - from) / Q)); i < 24 && from + i * Q < b; i++) {
        const lo = Math.max(a, from + i * Q), hi = Math.min(b, from + (i + 1) * Q, now);
        if (hi > lo) mins[i] += (hi - lo) / 60_000;
      }
    }
    return { from, slot: Q, minutes: mins.map((m) => Math.round(m * 10) / 10) };
  };

  return {
    async person({ search, tz, user, projects }) {
      await sync();
      const f = parseFilters(new URLSearchParams(search));
      const who = user || (await q.team({ ...f, user: null }, tz)).people.slice().sort((a, b) => b.prompts - a.prompts)[0]?.user_key;
      const r = await q.person({ ...f, user: null }, tz, who);
      if (!r) return null;
      if (projects) { const m = new Map(Object.entries(projects)); r.codeLines = await q.codeLines({ ...f, user: null, members: [who] }, tz, (sid) => m.get(sid) || null); }
      r.work = await q.meWork({ ...f, user: null, members: [who] }, tz);
      const now = Date.now();
      r.lastDay = { from: now - DAY, to: now, prompts: await q.prompts({ ...f, user: null, members: [who], from: now - DAY, to: now + 60_000 }) };
      return r;
    },
    async today({ tz, version }) {
      await sync();
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const g = range(+d0);
      const r = rhythmData(tz, version);
      return { person: (await q.team(g, tz)).people?.[0] || null, summary: (await q.summary(g)), week: (await q.days(range(+d0 - 6 * DAY), tz)), activeSeconds: activeSecs(+d0), last6: lastHours(),
        byHour: r.today.byHour, weekDays: r.week.days.map((x) => ({ day: x.day, minutes: x.minutes, kind: x.kind })), weekMinutes: r.week.minutes };
    },
    async highlights({ tz }) {
      await sync();
      const g = range(Date.now() - 90 * DAY), off = Math.round(tz) * 60;
      const hours = db.prepare(`SELECT CAST(strftime('%H', ts / 1000 + ${off}, 'unixepoch') AS INTEGER) hour, COUNT(*) n FROM events WHERE name = 'user_prompt' AND ts >= ? GROUP BY hour`).all(g.from);
      const summary = (await q.summary(g));
      summary.activeSeconds = { ...summary.activeSeconds, cli: Math.max(summary.activeSeconds?.cli || 0, activeSecs(g.from)) };
      return highlights({ days: (await q.days(g, tz)), person: (await q.team(g, tz)).people?.[0], hours, summary, tz });
    },
    async rhythm({ tz, version }) {
      await sync();
      const t = await q.team({ from: Date.now() - 30 * DAY, to: Date.now() + 60_000 }, tz).catch(() => null);
      const me = t?.people.slice().sort((a, b) => b.prompts - a.prompts)[0];
      return { ...rhythmData(tz, version), profile: me?.profile?.line || null };
    },
  };
}
