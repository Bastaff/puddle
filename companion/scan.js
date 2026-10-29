// The companion's first look at a machine: which agents are installed, which
// accounts they are signed into (and whether those are business or personal
// plans), and which projects they were used in. It reads local files only and
// never reads prompt or response text — it counts lines that are prompts.
//
// This is the reference implementation for the native companion; the tests in
// test/scan.test.js are its spec.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonicalRepo, repoParts } from '../collector/repo.js';
import { ADAPTERS } from './agents/index.js';
import { client } from '../collector/agents.js';

const DAY = 86_400_000;
const GAP = 5 * 60_000; // gaps longer than this don't count as active time

const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };
const lsDir = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };

// each agent's own knowledge lives in its adapter (companion/agents/); these stay importable from here
export { classifyClaude, desktopAppDir, claudePlans, claudeHistoryFile } from './agents/claude-code.js';
export { classifyCodex, codexPlan } from './agents/codex.js';

const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Active time, split by local day (a session can run past midnight or for days).
function activeTime(times) {
  times.sort((a, b) => a - b);
  const byDay = {};
  const add = (t, ms) => { const k = localDay(t); byDay[k] = (byDay[k] || 0) + ms; };
  for (let i = 0; i < times.length; i++) {
    add(times[i], 15_000); // a little credit for each touch
    const d = i ? times[i] - times[i - 1] : 0;
    if (d > 0 && d < GAP) add(times[i], d);
  }
  const ms = Object.values(byDay).reduce((a, b) => a + b, 0);
  return { ms, byDay: Object.fromEntries(Object.entries(byDay).map(([k, v]) => [k, Math.round(v / 6000) / 10])) };
}

// ---------- projects ----------

const gitCache = new Map();
function gitRemote(cwd) {
  if (gitCache.has(cwd)) return gitCache.get(cwd);
  let url = null;
  if (exists(cwd)) { try { url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch {} }
  gitCache.set(cwd, url);
  return url;
}

// git@github.com:Acme/web.git, https://user:pw@github.com/acme/web → { host, owner, name }
// (the same canonical key the team service uses, see collector/repo.js)
export function parseRemote(url) {
  const p = repoParts(canonicalRepo(url));
  return p && { host: p.host, owner: p.owner, name: p.name };
}

function isScratch(cwd, home) {
  if (cwd.startsWith(home + '/')) return cwd.includes('/Library/Application Support/') || cwd.includes('/scratchpad');
  const tmp = [os.tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'];
  return tmp.some((t) => cwd === t || cwd.startsWith(t + '/')) || cwd.includes('/scratchpad');
}

function placeOf(s, home) {
  const tilde = (p) => (p.startsWith(home + '/') ? '~' + p.slice(home.length) : p);
  if (isScratch(s.cwd, home)) return { key: 'scratch', type: 'scratch', label: 'Temporary and scratch folders' };
  if (s.cwd === home) return { key: 'home', type: 'home', label: 'Home folder, no project' };
  // an agent's own kind of place (the Codex app's quick chats)
  const own = ADAPTERS.find((a) => a.id === s.tool)?.place?.(s.cwd);
  if (own) return own;
  const r = parseRemote(s.repo || gitRemote(s.cwd));
  if (r) return { key: `${r.host}/${r.owner}`, type: 'owner', label: `${r.host}/${r.owner}`, repo: r.name, repoKey: `${r.host}/${r.owner}/${r.name}` };
  return { key: 'dir:' + s.cwd, type: 'folder', label: tilde(s.cwd), repo: null };
}

// Where a session ran (Claude Code's `entrypoint`, Codex's `originator`), from the agent catalogue: an editor by
// its name (VS Code, JetBrains), otherwise its kind (app, terminal, scripts)
const surfaceName = (raw) => { const c = client(raw); return !c ? 'terminal' : c.kind === 'editor' && !c.unknown ? c.label.replace(/ \(.*\)$/, '') : c.kind; };

// ---------- the scan ----------

const LOOSE = new Set(['scratch', 'home', 'chats']); // not projects: listed last, personal unless ticked

// titles: names Puddle's status line saw per session (Map id → name; companion/server.js keeps them)
export function scan({ home = os.homedir(), env = process.env, days = 90, now = Date.now(), titles = null } = {}) {
  const since = now - days * DAY;
  // every agent: where it is, its homes and accounts, and its sessions (companion/agents/)
  const found = ADAPTERS.map((a) => { const d = a.detect(home, env); return { a, ...d, ctx: a.context(home, env, d.homes) }; });
  const sessions = found.flatMap((f) => f.homes.flatMap((h) => f.a.sessions(h, since, f.ctx, { titles })));

  // accounts, with what each was used for
  const accounts = new Map();
  const addAccount = (tool, a, dir) => {
    if (!a) return null;
    const key = `${tool}:${a.id}`;
    if (!accounts.has(key)) accounts.set(key, { key, tool, ...a, dirs: [], surfaces: {}, sessions: 0, prompts: 0, minutes: 0, lastUsed: 0 });
    if (dir && !accounts.get(key).dirs.includes(dir)) accounts.get(key).dirs.push(dir);
    return accounts.get(key);
  };
  for (const f of found) {
    for (const h of f.homes) addAccount(f.a.id, h.account, h.dir);
    for (const x of f.ctx.extraAccounts || []) addAccount(f.a.id, x.account, x.dir);
  }

  const places = new Map();
  const daily = new Map();
  const list = []; // one row per session: what the checklist needs to preview sharing live
  for (const s of sessions) {
    const act = activeTime(s.times), mins = act.ms / 60_000, last = s.times.at(-1), first = s.times[0]; // activeTime sorts
    const acc = addAccount(s.tool, s.account) || addAccount(s.tool, { kind: 'unknown', id: 'none', plan: 'Not signed in', org: null });
    if (s.surface) acc.surfaces[surfaceName(s.surface)] = (acc.surfaces[surfaceName(s.surface)] || 0) + 1;
    acc.sessions++; acc.prompts += s.prompts; acc.minutes += mins; acc.lastUsed = Math.max(acc.lastUsed, last);
    const pl = placeOf(s, home);
    if (!places.has(pl.key)) places.set(pl.key, { key: pl.key, type: pl.type, label: pl.label, repos: new Set(), tools: new Set(), accounts: {}, sessions: 0, prompts: 0, minutes: 0, lastUsed: 0 });
    const p = places.get(pl.key);
    if (pl.repo) p.repos.add(pl.repo);
    p.tools.add(s.tool); p.accounts[acc.key] = (p.accounts[acc.key] || 0) + mins;
    p.sessions++; p.prompts += s.prompts; p.minutes += mins; p.lastUsed = Math.max(p.lastUsed, last);
    // id/repo/folder let the app tell the team service which project a session belongs to (never paths or content)
    list.push({ id: s.id || null, title: s.title || null, titleSource: s.title ? s.titleSource || null : null, repo: pl.repoKey || null, folder: pl.type === 'folder' ? path.basename(s.cwd) : null, tool: s.tool, account: acc.key, place: pl.key, minutes: Math.round(mins * 10) / 10, prompts: s.prompts, start: first, end: last, surface: s.surface, byDay: act.byDay });
    for (const [d, m] of Object.entries(act.byDay)) daily.set(d, (daily.get(d) || 0) + m);
  }

  // every account stays listed, used or not, so its future sessions are sorted from day one
  const accountList = [...accounts.values()].filter((a) => a.sessions || a.id !== 'none');
  const kindOf = Object.fromEntries(accountList.map((a) => [a.key, a.kind]));
  const placeList = [...places.values()].map((p) => {
    const total = Object.values(p.accounts).reduce((a, b) => a + b, 0) || 1;
    const workShare = Object.entries(p.accounts).filter(([k]) => kindOf[k] === 'work').reduce((a, [, v]) => a + v, 0) / total;
    return { ...p, repos: [...p.repos].sort(), tools: [...p.tools], workShare: Math.round(workShare * 100) / 100, minutes: Math.round(p.minutes) };
  }).sort((a, b) => LOOSE.has(a.type) - LOOSE.has(b.type) || b.minutes - a.minutes);

  const tools = found.map((f) => ({ id: f.a.id, name: f.a.name, installs: f.installs, homes: f.homes.map((h) => ({ dir: h.dir, telemetry: h.telemetry })), managed: f.managed }))
    .map((t) => ({ ...t, found: t.installs.length > 0 || t.homes.length > 0, sessions: sessions.filter((s) => s.tool === t.id).length }));

  // plan limits seen on this Mac, from each agent's own records (Claude Code's from the status line arrive separately)
  const plans = found.flatMap((f) => f.a.plans?.(home, now, sessions.filter((s) => s.tool === f.a.id)) || []);
  return {
    days, scannedAt: now, tools, plans,
    accounts: accountList.map((a) => ({ ...a, minutes: Math.round(a.minutes) })),
    places: placeList,
    sessions: list.sort((a, b) => a.start - b.start),
    daily: [...daily.entries()].sort().map(([day, minutes]) => ({ day, minutes: Math.round(minutes) })),
    totals: { sessions: sessions.length, prompts: sessions.reduce((a, s) => a + s.prompts, 0), minutes: Math.round(placeList.reduce((a, p) => a + p.minutes, 0)), activeDays: daily.size },
    blindSpots: blindSpots(home, env),
  };
}

// Places an agent may run that this machine can't see: say so instead of
// showing silently incomplete numbers.
function blindSpots(home, env) {
  const out = [];
  if (exists(path.join(home, '.vscode/extensions')) && lsDir(path.join(home, '.vscode/extensions')).some((e) => e.name.startsWith('ms-vscode-remote.'))) out.push('VS Code remote: sessions on other machines or containers stay there');
  if (process.platform === 'win32') out.push('WSL: Linux installs keep their own home folder');
  out.push(`Cloud sessions (${ADAPTERS.map((a) => a.blindSpot).filter(Boolean).join(', ')}) never touch this machine`);
  return out;
}
