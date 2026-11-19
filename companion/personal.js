import { fromPuddle } from '../collector/env.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../collector/db.js';
import { makeQueries, parseFilters, planNow } from '../collector/queries.js';
import { makeBackfill, LOG_FOLDERS } from '../collector/backfill.js';
import { backfillThread } from '../collector/backfill-thread.js';
import { meThread } from './me-thread.js';
import { makeSaved } from './saved-answers.js';
import { themeRoute, readTheme } from './theme.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'collector', 'public');
const ME = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'me');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

export { highlights } from './me-answers.js';

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
    } catch {  }
  }
  res.writeHead(204, { 'access-control-allow-origin': service || '*' }); res.end();
}

const HELPER_VERSION = (() => { try { return fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'VERSION'), 'utf8').trim() || null; } catch { return null; } })() || `dev-${Date.now()}`;

export function startPersonal({ home, port = 4601, log = () => {}, listen = true, share = null, shareNext = null, layout = null, site = null, onError = () => {} } = {}) {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const store = openDb(path.join(home, 'personal.db'));
  for (const f of ['personal.db', 'personal.db-wal', 'personal.db-shm']) try { fs.chmodSync(path.join(home, f), 0o600); } catch {}
  const q = makeQueries(store.db);
  const clients = new Set();
  let pending = null;
  let version = 0, saved = null;
  const notify = () => { version++; saved?.changed(); if (pending) return; pending = setTimeout(() => { pending = null; for (const r of clients) r.write(`event: update\ndata: ${Date.now()}\n\n`); }, 500); };
  const local = makeBackfill(store.db, { home, notify, log });
  local.startup();
  let soon = null, settle = null;
  const thread = backfillThread({ file: path.join(home, 'personal.db'), home, notify, log, onStatus: (st) => {
    if (st.error) onError('backfill');
    clearTimeout(settle); settle = st.settlesAt ? setTimeout(read, Math.max(1000, st.settlesAt - Date.now() + 500)) : null;
    settle?.unref?.();
  } });
  const backfill = { ...local, run: (o) => thread.run(o), status: () => thread.status() };
  const read = () => { thread.run(); };
  const first = setTimeout(read, 50);
  const changed = () => { soon ??= setTimeout(() => { soon = null; read(); }, 2000); };
  const watchers = new Map();
  const watch = () => { for (const dir of LOG_FOLDERS) if (!watchers.has(dir)) try { watchers.set(dir, fs.watch(dir, { recursive: true }, changed).on('error', () => { watchers.get(dir)?.close(); watchers.delete(dir); })); } catch {} };
  if (listen) watch();
  const every = setInterval(() => { watch(); read(); }, 5 * 60_000);
  const ping = setInterval(() => { for (const r of clients) r.write(': ping\n\n'); }, 25_000);
  for (const t of [every, ping]) t.unref?.();

  const me = meThread({ file: path.join(home, 'personal.db'), log });
  saved = makeSaved({ dir: path.join(home, 'answers'), compute: (job) => me.ask(job), version: () => version, log,
    onFresh: () => { for (const r of clients) r.write(`event: update\ndata: ${Date.now()}\n\n`); } });
  const answer = async (key, job) => { const e = await saved.get(key, job); return { r: e.body == null ? null : JSON.parse(e.body), stale: e.stale ? Math.round((Date.now() - e.at) / 1000) : 0 }; };
  const highlightData = async (tz) => (await answer(`highlights|${tz}`, { kind: 'highlights', tz })).r;
  const todayData = async (tz) => (await answer(`today|${tz}|${new Date().toDateString()}`, { kind: 'today', tz, version })).r;
  const rhythmData = async (tz) => (await answer(`rhythm|${tz}`, { kind: 'rhythm', tz, version })).r;

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const quick = (p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 5000).unref?.())]);
  const NO_NET = /^(ENOTFOUND|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH)$/;
  const reach = (p) => quick(p).then((r) => ({ r }), (e) => ({ why: NO_NET.test(String(e?.cause?.code || e?.code || '')) ? 'offline' : 'slow' }));
  let lastNav = null;
  const trusted = (req) => req.method === 'POST' && req.headers['x-claude-usage'] === '1' && (!req.headers.origin || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin));

  const page = () => fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
    .replace('<body>', '<body class="hosted personal">')
    .replace(/<title>[^<]*<\/title>/, '<title>Puddle · Me</title><link rel="stylesheet" href="/me/me.css">')
    .replace('<h2 data-learn="card:team">Team</h2>', '<h2 data-learn="card:team">Me</h2>');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      if (p === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`retry: 3000\n\nevent: version\ndata: ${HELPER_VERSION}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (p === '/api/site-nav') {
        const { r, why } = site ? await reach(site.nav().then((x) => { if (x?.status === 200) lastNav = x.data; return x; })) : {};
        if (r?.status === 200) return json(res, 200, r.data);
        if (why && site?.mac?.().connected) return json(res, 200, { ...(lastNav || { teams: [] }), [why]: true });
        return json(res, 200, { teams: [], signedOut: true, signIn: site?.mac?.().website === false ? null : `http://127.0.0.1:${port - 1}/?app&team` });
      }
      if (p === '/signout') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(`<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Puddle</title><style>html{background:#f7f2e9}@media (prefers-color-scheme:dark){html{background:#17151a}}</style><body style="font-family:system-ui;padding:40px;color:#888">Signing out…<script>
fetch('/api/app-signout', { method: 'POST', headers: { 'x-puddle': '1' } }).then((r) => r.json()).then((d) => { location.href = d.next || '/'; });</script>`);
      }
      if (p === '/api/app-signout' && req.method === 'POST') {
        if (!fromPuddle(req) || !site?.signOut) return json(res, 403, { error: 'forbidden' });
        await site.signOut();
        return json(res, 200, { next: `http://127.0.0.1:${port - 1}/?app` });
      }
      if (p.startsWith('/__joule/')) { res.writeHead(204); return res.end(); }
      if (p === '/api/perf' && req.method === 'POST') return perfRoute(req, res, home);
      if (p === '/api/theme') return themeRoute(req, res, home, json);
      if (p === '/go') {
        let to = url.searchParams.get('to') || '/';
        if (to === 'team') {
          const { r: n, why } = site ? await reach(site.nav()) : {};
          if (why && site?.mac?.().connected) { res.writeHead(302, { location: `/?${why}=1` }); return res.end(); }
          const t = n?.data?.teams?.find((x) => x.canView); to = t ? `/?team=${t.id}` : '/team/new';
        }
        const next = (to.startsWith('/') && !to.startsWith('//') ? to : '/') + (to.includes('?') ? '&' : '?') + 'app=' + encodeURIComponent(`http://127.0.0.1:${port}/`) + '&theme=' + readTheme(home);
        const { r, why } = site ? await reach(site.link(next)) : {};
        if (why && site?.mac?.().connected) { res.writeHead(302, { location: `/?${why}=1` }); return res.end(); }
        if (r?.status !== 200 || !r.data?.url) { res.writeHead(302, { location: `http://127.0.0.1:${port - 1}/?app&settings` }); return res.end(); }
        res.writeHead(302, { location: r.data.url, 'cache-control': 'no-store' }); return res.end();
      }
      if (p === '/api/share-next') return json(res, 200, { open: Boolean(share && shareNext?.()) });
      if (p === '/api/share') {
        if (!share) return json(res, 404, { error: 'not available' });
        if (req.method === 'POST' && (!fromPuddle(req) || (req.headers.origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin)))) return json(res, 403, { error: 'forbidden' });
        let b = ''; if (req.method === 'POST') for await (const c of req) b += c;
        const body = req.method === 'POST' ? JSON.parse(b || '{}') : {};
        const r = await share(body.action || null, body).catch(() => ({ status: 502, data: { error: "Couldn't reach Puddle" } }));
        return json(res, r.status, r.data);
      }
      if (p === '/api/me/layout') {
        if (!layout) return json(res, 404, { error: 'not available' });
        if (req.method === 'POST' && (!fromPuddle(req) || (req.headers.origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin)))) return json(res, 403, { error: 'forbidden' });
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
      if (p === '/api/mac') return site?.mac ? json(res, 200, site.mac()) : json(res, 404, { error: 'not available' });
      if (p === '/api/popover') {
        const m = site?.mac?.() || {}, nav = lastNav || null;
        return json(res, 200, { connected: Boolean(m.connected), website: Boolean(m.website), team: nav?.teams?.[0]?.name || null, update: site?.update?.() || null });
      }
      if (p === '/api/update/check' && req.method === 'POST') {
        if (!fromPuddle(req) || !site?.check) return json(res, 403, { error: 'forbidden' });
        return json(res, 200, await site.check());
      }
      if (p === '/api/update/install' && req.method === 'POST') {
        if (!fromPuddle(req) || !site?.install) return json(res, 403, { error: 'forbidden' });
        site.install(); return json(res, 202, site.update());
      }
      if (p.startsWith('/api/')) {
        if (req.method !== 'GET') return json(res, 409, { error: 'Not available in the personal view' });
        const f = parseFilters(url.searchParams);
        const tz = Number(url.searchParams.get('tz')) || 0;
        switch (p) {
          case '/api/live': return json(res, 200, { ...(await q.live(f)), health: { ...(await q.health()), recovery: backfill.status(), demo: false, hosted: true } });
          case '/api/team': return json(res, 200, (await q.team({ ...f, user: null }, tz)));
          case '/api/person': {
            const sp = new URLSearchParams(url.searchParams); sp.sort();
            const projects = site?.projects ? site.projects() : null;
            const { r, stale } = await answer(`person|${sp}`, { kind: 'person', search: sp.toString(), tz, user: url.searchParams.get('user'), projects });
            if (!r) return json(res, 404, { error: 'not found' });
            if (site?.work) r.projects = site.work(f.from);
            const pl = site?.plan ? planNow(Object.values(site.plan())) : null;
            if (pl) Object.assign(r.person, { plan: pl, five_pct: pl.five_pct, week_pct: pl.week_pct });
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(stale ? { 'x-puddle-stale': String(stale), 'access-control-expose-headers': 'x-puddle-stale' } : {}) });
            return res.end(JSON.stringify(r));
          }
          case '/api/events': return json(res, 200, (await q.feed(f, Math.min(1000, Number(url.searchParams.get('limit')) || 100))));
          case '/api/highlights': return json(res, 200, await highlightData(tz));
          case '/api/today': return json(res, 200, await todayData(tz));
          case '/api/me/rhythm': return json(res, 200, await rhythmData(tz));
          case '/api/export.csv': {
            const rows = (await q.exportEvents(f)), cols = rows.length ? Object.keys(rows[0]) : [];
            const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
            res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="puddle-me.csv"' });
            return res.end([cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
          }
          default: return json(res, 404, { error: 'not found' });
        }
      }
      if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(ME, 'index.html'), 'utf8').replace(/<head>/i, `<head><meta name="puddle-version" content="${HELPER_VERSION}">`)); }
      if (p === '/popover') { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(ME, 'popover.html'), 'utf8')); }
      if (p === '/mac') { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(ME, 'mac.html'), 'utf8')); }
      if (p === '/dashboard') { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); return res.end(page()); }
      const base = p.startsWith('/me/') ? ME : PUBLIC;
      const file = path.join(base, path.normalize(p.startsWith('/me/') ? p.slice(4) : p).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': /\/vendor\/outfit-[\w-]+\.woff2$/.test(p) ? 'public, max-age=604800' : 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { log(`personal: ${e.stack || e.message}`); if (!res.headersSent) json(res, 500, { error: 'internal error' }); }
  });
  if (listen) {
    server.on('error', (e) => log(e.code === 'EADDRINUSE' ? `Port ${port} is busy: the personal dashboard is probably already running` : e.message));
    server.listen(port, '127.0.0.1', () => log(`Puddle · Me: http://127.0.0.1:${port}`));
  }
  return { server, store, backfill, highlightData, todayData, rhythmData, close() { clearTimeout(first); clearTimeout(soon); clearTimeout(settle); clearInterval(every); for (const w of watchers.values()) w.close(); clearInterval(ping); local.stop(); thread.close(); me.close(); saved.close(); server.close(); try { store.close(); } catch {} } };
}
