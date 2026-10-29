// The on-device companion's local API: scans this machine, serves onboarding, the menu bar
// popover and Me. Choices stay in ~/.joule/companion.json. The only cloud calls are in
// cloud.js: connecting from a pairing link, and joining a team the person chose to join.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, claudePlans, claudeHistoryFile } from './scan.js';
import { topConversations } from '../collector/queries.js';
import { startPersonal } from './personal.js';
import { makeCloud, serviceUrl } from './cloud.js';
import { makeUpdater, currentVersion, currentBuilt } from './update.js';
import { makeErrors, setupReport, statusLineIsJoule } from './report.js';
import { makeTitles } from './titles.js';
import { startMirror } from './mirror.js';
import { makePlan } from './plan.js';
import { themeRoute } from './theme.js';
import { planLabel } from '../collector/agents.js';
import { makeKeeper } from './connections.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// Me's "Projects & conversations" straight from this Mac (works signed out): repo, else folder, each with its
// conversations (Claude Code's title), active minutes from `from` on (the scan's minutes per local day)
export function workFromScan(scan, from) {
  const d = new Date(from), fromDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const map = new Map();
  for (const s of scan.sessions || []) {
    const name = s.repo || s.folder; if (!name) continue;
    const m = Object.entries(s.byDay || {}).reduce((a, [k, v]) => a + (k >= fromDay ? v : 0), 0);
    if (m < 0.5) continue;
    const pr = map.get(name) || { name, repo: Boolean(s.repo), minutes: 0, sessions: 0, people: [], conversations: [] };
    pr.minutes += m; pr.sessions++; pr.conversations.push({ title: s.title || null, minutes: Math.round(m), last: s.end || null });
    map.set(name, pr);
  }
  return [...map.values()].map((x) => ({ ...x, minutes: Math.round(x.minutes), ...topConversations(x.conversations) }))
    .sort((a, b) => b.minutes - a.minutes).slice(0, 12);
}

// Watches the Claude app's plan record and hands each account's newest reading on a second after it changes. Its
// folder is watched (the app may replace the file); no Claude app, nothing watched.
export function watchClaudePlans(home, record, log = () => {}, wait = 1000) {
  const file = claudeHistoryFile(home);
  let timer = null, watcher;
  try {
    watcher = fs.watch(path.dirname(file), (ev, name) => {
      if (name && name !== path.basename(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => { for (const r of claudePlans(home)) record(r); }, wait);
      timer.unref?.();
    });
  } catch { return null; }
  watcher.on('error', (e) => log(`plan watch: ${e.message}`));
  return { close: () => { clearTimeout(timer); watcher.close(); } };
}

// Me's plan limits, named after this Mac's accounts ("Claude · Dcvx", "Codex · personal")
export function labelPlans(latest, sc) {
  const accounts = new Map((sc.accounts || []).map((a) => [a.id, a]));
  return Object.values(latest).map((r) => {
    const a = r.org ? accounts.get(r.org) : null, tool = planLabel(r.agent);
    const what = a ? (a.kind === 'work' ? a.org || 'work' : a.kind === 'personal' ? a.plan || 'personal' : null) : null;
    return { ...r, label: what ? `${tool} · ${what}` : tool };
  });
}

export function startCompanion({ port = 4600, home = os.homedir(), env = process.env, log = console.log, listen = true } = {}) {
  const dir = env.JOULE_DIR || path.join(home, '.joule');
  const choicesFile = path.join(dir, 'companion.json');
  // "Me": the personal dashboard on its own port, same engine as the team view
  const personal = startPersonal({ home: dir, port: port + 1, log, listen, share: (action) => cloud.share(action),
    layout: { get: () => cloud.layouts(), set: (b) => cloud.setLayout(b) },
    site: { work: (from) => workFromScan(getScan(), from), plan: () => labelPlans(plan.latest(), getScan()),
      // which project a session belongs to (repo, else folder), for "Code changes"
      // This Mac in Settings (/mac): who Puddle is signed in as here, and the coding accounts it found on this Mac
      mac: () => ({ connected: cloud.connected(), email: cloud.email(), website: Boolean(serviceUrl(env)), version: currentVersion(), accounts: (getScan().accounts || []).filter((a) => Object.keys(a.surfaces || {}).length)
        .map(({ tool, kind, org, plan }) => ({ tool, kind, org, plan })) }),
      projectOf: () => { const m = new Map((getScan().sessions || []).map((x) => [x.id, x.repo || x.folder || null])); return (sid) => m.get(sid) || null; }, nav: () => cloud.nav(), link: (next) => cloud.dashboardLink(next), signOut: async () => { await cloud.signOut(); fs.rmSync(choicesFile, { force: true }); } } });
  let cached = null;
  const getScan = (fresh) => {
    if (fresh || !cached || Date.now() - cached.at > 30_000) { cached = { at: Date.now(), data: scan({ home, env, titles: titles.names() }) }; for (const r of cached.data.plans || []) plan.record(r); }
    return cached.data;
  };
  const errors = makeErrors();
  const titles = makeTitles({ dir }); // what Puddle's status line saw per session (names, when it ran)
  const cloud = makeCloud({ dir, env, log });
  // plan limits: Claude Code's from Puddle's status line (POST /api/plan), Codex's from its logs (each scan)
  const plan = makePlan({ dir, cloud, log, onError: () => errors.note('plan-send') });
  let lastShape = null;
  // the Claude app's record the moment it writes it, not at the next scan (the app writes it rarely: every reading counts)
  const planWatch = watchClaudePlans(home, (r) => plan.record(r), log);
  // keep the team service told which project each session belongs to (only when connected)
  let closed = false;
  const timers = []; // every background timer, so close() stops them all (nothing runs on a closed database)
  // a key that no longer works (account deleted, Mac removed): sign out cleanly instead of pretending to be connected
  // (the keys are kept: signing in again brings the same key back, so Claude Code sessions keep working), and older
  // keys Claude Code may still be sending made valid again (healKeys)
  // with the check-in: this Mac's setup and Puddle's own errors (report.js), for the team's "Needs a look"
  // every agent on this Mac connected, not only those present at sign-in (companion/connections.js)
  const keeper = makeKeeper({ home, env, credentials: () => cloud.credentials?.(), connect: (only) => cloud.connectAgent(only), log, onError: (k) => errors.note(k) });
  const report = () => setupReport({ scan: getScan(), lineSeen: titles.seen(), version: currentVersion(), built: currentBuilt(),
    statusline: env.JOULE_DEV ? null : statusLineIsJoule(home, dir), errors: errors.list(), agents: env.JOULE_DEV ? null : keeper.state() });
  const checkIn = async () => {
    let body = null; try { body = report(); } catch (e) { errors.note('scan'); log(`report: ${e.message}`); }
    const r = await cloud.alive(body).catch(() => { errors.note('check-in'); return null; });
    if (r?.status === 401 && cloud.connected()) { log('key no longer valid: signing out'); await cloud.signOut({ forget: false }); fs.rmSync(choicesFile, { force: true }); return; }
    if (r?.status === 200) await cloud.healKeys().catch((e) => { errors.note('keys'); log(`keys: ${e.message}`); });
  };
  const sync = () => (closed ? null : Promise.all([checkIn(), cloud.syncContexts(getScan()).catch((e) => { errors.note('contexts'); log(`sync: ${e.message}`); })]));
  const syncTimer = listen ? setInterval(sync, 120_000) : null;
  if (listen) timers.push(setTimeout(sync, 3_000)); // check in right after start, not 2 minutes later
  if (listen) timers.push(setTimeout(() => cloud.refreshStatusLine().catch(() => errors.note('statusline')), 5_000)); // status line points at this copy of Puddle
  // agents connected: shortly after start, then every 10 minutes (an agent installed or first used later)
  const keepAgents = () => (closed ? null : keeper.keep().catch((e) => { errors.note('connect'); log(`agents: ${e.message}`); }));
  if (listen) { timers.push(setTimeout(keepAgents, 8_000)); const t = setInterval(keepAgents, 600_000); t.unref?.(); timers.push(t); }
  // a newer Puddle published? (checked shortly after start, then every 15 minutes): offered with a click, downloaded
  // ahead, and installed by itself at an idle moment if nobody has after a day (the app decides when it's idle)
  const updater = makeUpdater({ serviceUrl: () => serviceUrl(env), log, dir });
  if (listen) timers.push(setTimeout(updater.check, 10_000), setInterval(updater.check, 15 * 60_000));
  // this Mac's history to the service (mirror.js): earlier work for teams, and sessions opened before signing in
  const orgMaps = new WeakMap(); // one lookup table per scan (the scan itself is cached for 30 s)
  const orgOf = (sid) => {
    const sc = getScan();
    let m = orgMaps.get(sc);
    if (!m) { m = new Map((sc.sessions || []).map((x) => [x.id, x.account || ''])); orgMaps.set(sc, m); }
    // the account a session belongs to (Claude org or Codex account): the team's share rules work per account
    const acc = m.get(sid) || '', cut = acc.indexOf(':'), id = cut > 0 ? acc.slice(cut + 1) : null; // <agent>:<account id>
    return id && !['none', 'api-key', 'cloud'].includes(id) ? id : null;
  };
  const mirror = listen ? startMirror({ dir, cloud, log, orgOf }) : null;
  for (const t of timers) t.unref?.();
  syncTimer?.unref?.();
  const readBody = async (req) => { let b = ''; for await (const c of req) { b += c; if (b.length > 100_000) throw new Error('too large'); } return JSON.parse(b || '{}'); };
  const readChoices = () => { try { return JSON.parse(fs.readFileSync(choicesFile, 'utf8')); } catch { return null; } };

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      // app actions are caught by the native shell; anywhere else, do nothing (204 keeps the page)
      if (url.pathname.startsWith('/__joule/')) { res.writeHead(204); return res.end(); }
      if (url.pathname === '/api/scan') return json(res, 200, getScan(url.searchParams.has('fresh')));
      // the one theme for Puddle's screens and its window (theme.js), and the script itself, shared with the website
      if (url.pathname === '/api/theme') return themeRoute(req, res, dir, json);
      // the agent catalogue (names, icons, clients), shared with the website
      if (url.pathname === '/agents.js') { res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(PUBLIC, '..', '..', 'collector', 'public', 'agents.js'))); }
      if (url.pathname === '/theme.js') { res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(PUBLIC, '..', '..', 'collector', 'public', 'theme.js'))); }
      // the palette, shared with the website
      if (url.pathname === '/tokens.css') { res.writeHead(200, { 'content-type': TYPES['.css'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(PUBLIC, '..', '..', 'collector', 'public', 'tokens.css'))); }
      // squircle corners where the window's browser can't draw them (squircle.js)
      if (url.pathname === '/squircle.js') { res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(PUBLIC, '..', '..', 'collector', 'public', 'squircle.js'))); }
      // Puddle's Claude Code status line (never from a web page: no Origin, our header): the session's name and the
      // plan limits it saw. /api/plan: older status lines, limits only.
      if ((url.pathname === '/api/statusline' || url.pathname === '/api/plan') && req.method === 'POST') {
        if (req.headers['x-joule'] !== '1' || req.headers.origin) return json(res, 403, { error: 'forbidden' });
        const b = await readBody(req);
        if (url.pathname === '/api/plan') return json(res, plan.record(b) ? 200 : 400, {});
        const named = titles.saw(b?.session_id, b?.session_name);
        // which limit windows Claude Code sent (field names only), logged when it changes
        if (typeof b?.plan?.shape === 'string' && b.plan.shape !== lastShape) { lastShape = b.plan.shape; log(`statusline limits: ${lastShape.slice(0, 300)}`); }
        const limited = b?.plan ? plan.record(b.plan) : false;
        return json(res, named || limited ? 200 : 400, {});
      }
      if (url.pathname === '/api/choices' && req.method === 'GET') return json(res, 200, readChoices() || {});
      // the menu bar title and the popover: today, the way the dashboard counts it
      if (url.pathname === '/api/today') {
        const t = await personal.todayData(Number(url.searchParams.get('tz')) || -new Date().getTimezoneOffset());
        const m = Math.round((t.activeSeconds || 0) / 60);
        return json(res, 200, { ...t, minutes: m, label: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` });
      }
      if (url.pathname === '/api/highlights') return json(res, 200, await personal.highlightData(Number(url.searchParams.get('tz')) || 0));
      // Settings → Sign out: disconnect this Mac and start over at the sign-in screen
      if (url.pathname === '/api/signout' && req.method === 'POST') {
        if (req.headers['x-joule'] !== '1') return json(res, 403, { error: 'forbidden' });
        await cloud.signOut();
        fs.rmSync(choicesFile, { force: true });
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/choices' && req.method === 'DELETE') {
        if (req.headers['x-joule'] !== '1') return json(res, 403, { error: 'forbidden' });
        fs.rmSync(choicesFile, { force: true });
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/choices' && req.method === 'POST') {
        // browsers on other sites can't write here: they can't send this header without a preflight we never answer
        if (req.headers['x-joule'] !== '1') return json(res, 403, { error: 'forbidden' });
        let body = ''; for await (const c of req) { body += c; if (body.length > 100_000) return json(res, 413, {}); }
        const choices = JSON.parse(body);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(choicesFile, JSON.stringify({ ...choices, savedAt: Date.now() }, null, 2), { mode: 0o600 });
        return json(res, 200, { ok: true });
      }
      // The app connects itself from a pairing link, and joins a team with the choice made here.
      const cloudCalls = { '/api/pair': (b) => cloud.pair(b.code, b.url), '/api/team/join': (b) => cloud.join(b.code, b.team),
        '/api/signin/code': (b) => cloud.sendCode(b.email), '/api/signin/verify': (b) => cloud.signIn(b.email, b.code) };
      if (cloudCalls[url.pathname] && req.method === 'POST') {
        if (req.headers['x-joule'] !== '1') return json(res, 403, { error: 'forbidden' });
        const b = await readBody(req);
        const r = await cloudCalls[url.pathname](b).catch((e) => ({ status: 502, data: { error: `Couldn't reach Puddle: ${e.message}` } }));
        if (r.status === 200 && url.pathname !== '/api/signin/code') await sync(); // first report right away: the team's picker and rules need it
        return json(res, r.status, r.data);
      }
      // The Team window signs itself in: the device key buys a one-time sign-in link (https happens here, in Node)
      if (url.pathname === '/api/dashboard-link' && req.method === 'POST') {
        if (req.headers['x-joule'] !== '1') return json(res, 403, { error: 'forbidden' });
        const r = await cloud.dashboardLink().catch(() => ({ status: 502, data: {} }));
        return r.status === 200 && r.data.url ? json(res, 200, { url: r.data.url }) : json(res, 200, { url: serviceUrl() ? `${serviceUrl()}/login` : null });
      }
      if (url.pathname === '/api/update') return json(res, 200, updater.state);
      if (url.pathname === '/api/update/install' && req.method === 'POST') {
        if (req.headers['x-joule'] !== '1') return json(res, 403, { error: 'forbidden' });
        updater.install(); // runs on; the app restarts itself when the new version is in place
        return json(res, 202, updater.state);
      }
      if (url.pathname === '/api/status') {
        // needsSetup: the app opens its window at launch (not connected, unless you chose to use it alone).
        // translocated: opened straight from Downloads, macOS runs a temporary copy that won't last.
        const c = readChoices() || {};
        return json(res, 200, { connected: cloud.connected(), email: cloud.email(), service: serviceUrl(), needsSetup: !cloud.connected() && !c.solo,
          translocated: process.execPath.includes('/AppTranslocation/') });
      }
      if (url.pathname === '/api/site-nav') { const r = await cloud.nav().catch(() => null); return json(res, 200, r?.status === 200 ? r.data : { teams: [] }); }
      if (url.pathname === '/api/invite/use' && req.method === 'POST') {
        if (req.headers['x-joule'] !== '1') return json(res, 403, { error: 'forbidden' });
        const r = await cloud.useInvite((await readBody(req)).link).catch((e) => ({ status: 502, data: { error: e.message } }));
        return json(res, r.status, r.data);
      }
      // A real invite this computer is joining (from a pairing link); otherwise the development view's pretend one.
      if (url.pathname === '/api/invite') {
        const real = await cloud.invite().catch(() => null);
        // (an invite kept before signing in has no team name yet: it's offered once Puddle is signed in)
        if (real?.team) {
          const s = getScan();
          return json(res, 200, { real: true, code: real.code, team: real.team.name, from: real.owner || 'Your team',
            accounts: s.accounts.filter((a) => a.kind === 'work').map((a) => a.key), places: [] });
        }
        if (!url.searchParams.has('sim')) return json(res, 200, null);
        const s = getScan();
        const work = s.accounts.filter((a) => a.kind === 'work');
        const org = work.find((a) => a.org)?.org;
        return json(res, 200, work.length || s.places.length ? {
          team: org || 'Acme', from: 'Your manager',
          accounts: work.map((a) => a.key),
          places: s.places.filter((p) => p.type === 'owner' && p.workShare >= 0.5).map((p) => p.key),
          sees: ['Time with agents', 'Sessions and prompts (counts only)', 'Tokens and cost', 'Tools used', 'Errors and blockers'],
          never: ['What you typed', 'What the agent answered', 'File contents and commands', 'Anything you leave unticked'],
        } : null);
      }
      let p = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.join(PUBLIC, p);
      if (!file.startsWith(PUBLIC)) return json(res, 404, {});
      fs.readFile(file, (err, data) => {
        if (err) return json(res, 404, { error: 'not found' });
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(data);
      });
    } catch (e) { json(res, 500, { error: String(e.message || e) }); }
  });
  if (listen) {
    server.on('error', (e) => { if (e.code === 'EADDRINUSE') { log(`Port ${port} is busy — the companion preview is probably already running at http://127.0.0.1:${port}`); process.exit(1); } throw e; });
    server.listen(port, '127.0.0.1', () => log(`Puddle companion preview: http://127.0.0.1:${port}`));
  }
  return { server, personal, cloud, checkIn, close: () => { closed = true; clearInterval(syncTimer); for (const t of timers) clearTimeout(t); mirror?.stop(); plan.close(); planWatch?.close(); titles.close(); server.close(); personal.close(); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startCompanion({ port: Number(process.env.PORT) || 4600 });
