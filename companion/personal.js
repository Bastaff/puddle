// "Me": the team dashboard, focused on one person and built only from this
// device. Same engine (collector/*) and same UI (collector/public) as the team
// view, plus a highlights strip for the fun part: streaks, records, a card to share.
// Nothing here leaves the machine.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../collector/db.js';
import { makeQueries, parseFilters, planNow } from '../collector/queries.js';
import { makeBackfill } from '../collector/backfill.js';
import { rhythm } from '../collector/forecast.js';
import { themeRoute, readTheme } from './theme.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'collector', 'public');
const ME = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'me');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const DAY = 864e5;

// Records and streaks: the brag layer. Pure function of the dashboard's own numbers.
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
    kind, peakHour: peak?.hour ?? null,
    persona: peak == null ? null : peak.hour < 5 || peak.hour >= 22 ? 'Night owl' : peak.hour < 9 ? 'Early bird' : peak.hour < 17 ? 'Daytime builder' : 'Evening hacker',
    tokens, agentHours, prompts: summary.prompts || 0, sessions: summary.sessions || 0,
    handsOff: person?.autonomy ?? null,
    lines: summary.lines || { added: 0, removed: 0 },
    features: Object.values(person?.featureNames || {}).reduce((a, list) => a + (Array.isArray(list) ? list.length : 0), 0),
  };
}

// Timing trace from Puddle's own pages and the website it's signed in to, kept in <joule dir>/logs/perf.ndjson.
// Only known fields, short values; anything else is dropped. Sent as beacons: answered with 204, nothing to read.
const PERF_KEYS = { t: 'number', view: 'string', run: 'string', kind: 'string', label: 'string', ms: 'number', kb: 'number', at: 'number', ttfb: 'number', from: 'string', crossed: 'boolean' };
async function perfRoute(req, res, home) {
  const origin = String(req.headers.origin || '');
  let service = ''; try { service = new URL(fs.readFileSync(path.join(home, 'url'), 'utf8').trim()).origin; } catch {}
  const ok = !origin || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || (service && origin === service);
  let body = '';
  for await (const c of req) { body += c; if (body.length > 256_000) break; }
  if (ok && body.length <= 256_000) {
    try {
      const rows = (JSON.parse(body) || []).slice(0, 500).map((e) => Object.fromEntries(Object.entries(PERF_KEYS).filter(([k, ty]) => typeof e?.[k] === ty)
        .map(([k]) => [k, typeof e[k] === 'string' ? e[k].slice(0, 80) : e[k]])));
      fs.mkdirSync(path.join(home, 'logs'), { recursive: true });
      fs.appendFileSync(path.join(home, 'logs', 'perf.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    } catch { /* not a trace */ }
  }
  res.writeHead(204, { 'access-control-allow-origin': service || '*' }); res.end();
}

// this helper's version (the app build's stamp; a start time when run from the repo)
const HELPER_VERSION = (() => { try { return fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'VERSION'), 'utf8').trim() || null; } catch { return null; } })() || `dev-${Date.now()}`;

export function startPersonal({ home, port = 4601, log = () => {}, listen = true, share = null, layout = null, site = null } = {}) {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const store = openDb(path.join(home, 'personal.db'));
  for (const f of ['personal.db', 'personal.db-wal', 'personal.db-shm']) try { fs.chmodSync(path.join(home, f), 0o600); } catch {} // only you can read your history
  const q = makeQueries(store.db);
  const clients = new Set();
  let pending = null;
  const notify = () => { if (pending) return; pending = setTimeout(() => { pending = null; for (const r of clients) r.write(`event: update\ndata: ${Date.now()}\n\n`); }, 500); };
  const backfill = makeBackfill(store.db, { home, notify, log });
  backfill.startup();
  const first = setTimeout(() => backfill.run({ full: true }), 50);
  const every = setInterval(() => backfill.run(), 30_000); // read new history every 30 s (native companion: on file change)
  const ping = setInterval(() => { for (const r of clients) r.write(': ping\n\n'); }, 25_000);
  for (const t of [every, ping]) t.unref?.();

  // Active time from the history itself (telemetry's active-time metric isn't in history files):
  // time between a session's consecutive events, when the gap is under 5 minutes.
  const activeStmt = store.db.prepare(`SELECT COALESCE(SUM(CASE WHEN d < 300000 THEN d ELSE 0 END), 0) / 1000.0 secs FROM
    (SELECT ts - LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) d FROM events WHERE ts >= ? AND ts < ? AND session_id IS NOT NULL)`);
  const activeSecs = (from, to = Date.now() + 60_000) => activeStmt.get(from, to).secs;
  const range = (from) => ({ ...parseFilters(new URLSearchParams({ from: String(from), to: String(Date.now() + 60_000) })), user: null });
  async function highlightData(tz) {
    const g = range(Date.now() - 90 * DAY), off = Math.round(tz) * 60;
    const hours = store.db.prepare(`SELECT CAST(strftime('%H', ts / 1000 + ${off}, 'unixepoch') AS INTEGER) hour, COUNT(*) n FROM events WHERE name = 'user_prompt' AND ts >= ? GROUP BY hour`).all(g.from);
    const summary = (await q.summary(g));
    summary.activeSeconds = { ...summary.activeSeconds, cli: Math.max(summary.activeSeconds?.cli || 0, activeSecs(g.from)) };
    return highlights({ days: (await q.days(g, tz)), person: (await q.team(g, tz)).people?.[0], hours, summary, tz });
  }
  // the popover: today as one row of the team table (same numbers, same words), plus the week
  async function todayData(tz) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const g = range(+d0);
    const r = rhythmData(tz); // minutes per hour today, per day this week (the popover draws them)
    return { person: (await q.team(g, tz)).people?.[0] || null, summary: (await q.summary(g)), week: (await q.days(range(+d0 - 6 * DAY), tz)), activeSeconds: activeSecs(+d0),
      byHour: r.today.byHour, weekDays: r.week.days.map((d) => ({ day: d.day, minutes: d.minutes, kind: d.kind })), weekMinutes: r.week.minutes };
  }

  // Rhythm, habits and forecasts: from every event's timestamp in the last 90 days (collector/forecast.js)
  const rowsStmt = store.db.prepare(`SELECT session_id session, ts FROM events WHERE ts >= ? AND session_id IS NOT NULL`);
  const rhythmData = (tz, now = Date.now()) => rhythm(rowsStmt.all(now - 90 * DAY), { now, tz });

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const trusted = (req) => req.method === 'POST' && req.headers['x-claude-usage'] === '1' && (!req.headers.origin || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin));

  // The dashboard page, reframed: "You" instead of "Team", no demo/test/reset, plus the highlights strip.
  const page = () => fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
    .replace('<body>', '<body class="hosted personal">')
    .replace(/<title>[^<]*<\/title>/, '<title>Puddle · Me</title><link rel="stylesheet" href="/me/me.css">')
    .replace('<b>Usage</b>', '<b>Puddle</b> <span class="me-tag">Me</span>')
    .replace('<h2 data-learn="card:team">Team</h2>', '<h2 data-learn="card:team">Me</h2>')
    .replace('What the team does', 'What you do')
    .replace('<section class="kpis headline" id="kpis" aria-label="Team at a glance"></section>', '<section class="kpis headline" id="kpis" aria-label="You at a glance"></section><section class="card brag" id="brag" aria-label="Highlights" hidden></section>')
    .replace('<b>Puddle</b> <span class="me-tag">Me</span>', '<a href="/" class="me-back"><b>Puddle</b> <span class="me-tag">Me</span></a>');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      if (p === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`retry: 3000\n\nevent: version\ndata: ${HELPER_VERSION}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      // Share live (Me's button): asks the service through this Mac's device key
      // Me's menu bar: your teams, and /go?to=<page> signs this window in to that website page (device key),
      // with ?app= so the website's "Me" comes back here: one Puddle window for Me and the team
      if (p === '/api/site-nav') {
        const r = site ? await site.nav().catch(() => null) : null;
        return json(res, 200, r?.status === 200 ? r.data : { teams: [], signedOut: true, signIn: site?.mac?.().website === false ? null : `http://127.0.0.1:${port - 1}/?app&settings` });
      }
      // Sign out of Puddle from its window (the website's menu points here): this Mac signs out, then the
      // window shows Puddle's sign-in screen
      if (p === '/signout') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(`<!doctype html><meta charset="utf-8"><title>Puddle</title><body style="font-family:system-ui;padding:40px;color:#888">Signing out…<script>
fetch('/api/app-signout', { method: 'POST', headers: { 'x-joule': '1' } }).then((r) => r.json()).then((d) => { location.href = d.next || '/'; });</script>`);
      }
      if (p === '/api/app-signout' && req.method === 'POST') {
        if (req.headers['x-joule'] !== '1' || !site?.signOut) return json(res, 403, { error: 'forbidden' });
        await site.signOut();
        return json(res, 200, { next: `http://127.0.0.1:${port - 1}/?app` });
      }
      // app actions (/__joule/theme_dark…) are caught by Puddle's window; anywhere else, nothing happens (204 keeps the page)
      if (p.startsWith('/__joule/')) { res.writeHead(204); return res.end(); }
      // the app's timing trace (collector/public/perf.js): timings, kinds of action and request paths only
      if (p === '/api/perf' && req.method === 'POST') return perfRoute(req, res, home);
      if (p === '/api/theme') return themeRoute(req, res, home, json);
      if (p === '/go') {
        let to = url.searchParams.get('to') || '/';
        // "team": the first team dashboard you may see, else New team (where you start one, or see how to join one)
        if (to === 'team') { const n = site ? await site.nav().catch(() => null) : null; const t = n?.data?.teams?.find((x) => x.canView); to = t ? `/?team=${t.id}` : '/settings/team/new'; } // no team yet: start one (or join with a link)
        // the website page learns which Me to come back to, and the theme you use here
        const next = (to.startsWith('/') && !to.startsWith('//') ? to : '/') + (to.includes('?') ? '&' : '?') + 'app=' + encodeURIComponent(`http://127.0.0.1:${port}/`) + '&theme=' + readTheme(home);
        const r = site ? await site.link(next).catch(() => null) : null;
        if (r?.status !== 200 || !r.data?.url) { res.writeHead(302, { location: `http://127.0.0.1:${port - 1}/?app&settings` }); return res.end(); }
        res.writeHead(302, { location: r.data.url, 'cache-control': 'no-store' }); return res.end();
      }
      if (p === '/api/share') {
        if (!share) return json(res, 404, { error: 'not available' });
        if (req.method === 'POST' && (req.headers['x-joule'] !== '1' || (req.headers.origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin)))) return json(res, 403, { error: 'forbidden' });
        let b = ''; if (req.method === 'POST') for await (const c of req) b += c;
        const r = await share(req.method === 'POST' ? JSON.parse(b || '{}').action : null).catch(() => ({ status: 502, data: { error: "Couldn't reach Puddle" } }));
        return json(res, r.status, r.data);
      }
      // how you arranged Me (layout.js): kept with your account, through the service (not connected: this browser only)
      if (p === '/api/me/layout') {
        if (!layout) return json(res, 404, { error: 'not available' });
        if (req.method === 'POST' && (req.headers['x-joule'] !== '1' || (req.headers.origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin)))) return json(res, 403, { error: 'forbidden' });
        let b = ''; if (req.method === 'POST') for await (const c of req) { b += c; if (b.length > 4096) return json(res, 413, { error: 'too big' }); }
        const r = await (req.method === 'POST' ? layout.set(JSON.parse(b || '{}')) : layout.get()).catch(() => ({ status: 502, data: { error: "Couldn't reach Puddle" } }));
        return json(res, r.status, r.data);
      }
      if (p === '/api/recover') return trusted(req) ? json(res, 200, backfill.run({ full: true })) : json(res, 403, { error: 'forbidden' });
      if (p === '/api/flag-feedback') {
        if (!trusted(req)) return json(res, 403, { error: 'forbidden' });
        let b = ''; for await (const c of req) b += c;
        return store.addFeedback(JSON.parse(b || '{}')) ? json(res, 200, { ok: true }) : json(res, 400, {});
      }
      // This Mac in Settings (/mac): who Puddle is signed in as here, the coding accounts it found
      if (p === '/api/mac') return site?.mac ? json(res, 200, site.mac()) : json(res, 404, { error: 'not available' });
      if (p.startsWith('/api/')) {
        if (req.method !== 'GET') return json(res, 409, { error: 'Not available in the personal view' });
        const f = parseFilters(url.searchParams);
        const tz = Number(url.searchParams.get('tz')) || 0;
        switch (p) {
          case '/api/all': return json(res, 200, { filters: (await q.filters()), summary: (await q.summary(f)), timeseries: (await q.timeseries(f)), models: (await q.models(f)), tools: (await q.tools(f)), users: (await q.users(f)), feed: (await q.feed(f)) });
          case '/api/live': return json(res, 200, { ...(await q.live(f)), health: { ...(await q.health()), recovery: backfill.status(), demo: false, hosted: true } });
          case '/api/insights': return json(res, 200, (await q.insights(f)));
          case '/api/team': return json(res, 200, (await q.team({ ...f, user: null }, tz)));
          // Me: the same one-person page a team lead sees, from this Mac's full history
          case '/api/person': {
            const who = url.searchParams.get('user') || (await q.team({ ...f, user: null }, tz)).people.slice().sort((a, b) => b.prompts - a.prompts)[0]?.user_key;
            const r = await q.person({ ...f, user: null }, tz, who);
            if (r && site?.work) r.projects = site.work(f.from); // this Mac's projects and conversation titles
            if (r && site?.projectOf) r.codeLines = await q.codeLines({ ...f, user: null, members: [who] }, tz, site.projectOf()); // lines per project, named as above
            const pl = r && site?.plan ? planNow(Object.values(site.plan())) : null; // plan limits seen on this Mac
            if (pl) Object.assign(r.person, { plan: pl, five_pct: pl.five_pct, week_pct: pl.week_pct });
            return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
          }
          case '/api/timeline': return json(res, 200, (await q.timeline(f, Number(url.searchParams.get('bucket')) || 0, tz, url.searchParams.get('fit') === '1')));
          case '/api/summary': return json(res, 200, (await q.summary(f)));
          case '/api/days': return json(res, 200, (await q.days(f, tz)));
          case '/api/events': return json(res, 200, (await q.feed(f, Math.min(1000, Number(url.searchParams.get('limit')) || 100))));
          case '/api/highlights': return json(res, 200, await highlightData(tz));
          case '/api/today': return json(res, 200, await todayData(tz));
          case '/api/me/rhythm': {
            // plus your one-line profile, as a team lead would read it (last 30 days on this Mac)
            const t = await q.team({ from: Date.now() - 30 * DAY, to: Date.now() + 60_000 }, tz).catch(() => null);
            const me = t?.people.slice().sort((a, b) => b.prompts - a.prompts)[0];
            return json(res, 200, { ...rhythmData(tz), profile: me?.profile?.line || null });
          }
          case '/api/export.csv': {
            const rows = (await q.exportEvents(f)), cols = rows.length ? Object.keys(rows[0]) : [];
            const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
            res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="joule-me.csv"' });
            return res.end([cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
          }
          default: return json(res, 404, { error: 'not found' });
        }
      }
      // Me: its own page; every number stays one click away in the full dashboard
      // Me says which helper served it; after an update the helper restarts and Me refreshes itself (selfheal.js)
      if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(ME, 'index.html'), 'utf8').replace(/<head>/i, `<head><meta name="joule-version" content="${HELPER_VERSION}">`)); }
      // Settings → This Mac: the website's Settings look (its rail, its cards), with what only this Mac knows
      if (p === '/mac') { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(ME, 'mac.html'), 'utf8')); }
      if (p === '/dashboard') { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); return res.end(page()); }
      const base = p.startsWith('/me/') ? ME : PUBLIC;
      const file = path.join(base, path.normalize(p.startsWith('/me/') ? p.slice(4) : p).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { log(`personal: ${e.stack || e.message}`); if (!res.headersSent) json(res, 500, { error: 'internal error' }); }
  });
  if (listen) {
    server.on('error', (e) => log(e.code === 'EADDRINUSE' ? `Port ${port} is busy: the personal dashboard is probably already running` : e.message));
    server.listen(port, '127.0.0.1', () => log(`Puddle · Me: http://127.0.0.1:${port}`));
  }
  return { server, store, backfill, highlightData, todayData, rhythmData, close() { clearTimeout(first); clearInterval(every); clearInterval(ping); backfill.stop(); server.close(); try { store.close(); } catch {} } };
}
