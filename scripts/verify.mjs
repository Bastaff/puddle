#!/usr/bin/env node
import { dataDir } from '../collector/env.js';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const JOULE = dataDir(HOME);
const APP = path.join(ROOT, 'companion-app', 'target', 'debug', 'joule');
const results = [];
const ok = (area, name, pass, detail = '') => results.push({ area, name, pass, detail });
const skip = (area, name, detail) => results.push({ area, name, pass: null, detail });
const get = async (url, opts = {}) => { try { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) }); return { status: r.status, body: await r.text() }; } catch (e) { return { status: 0, body: String(e.message) }; } };
const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000, ...o });
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };

try { const out = sh('npm', ['test'], { cwd: ROOT }); const m = out.match(/ℹ pass (\d+)[\s\S]*ℹ fail (\d+)/); ok('Code', 'Automated tests', m && m[2] === '0', m ? `${m[1]} passed, ${m[2]} failed` : 'no summary'); }
catch (e) { const m = String(e.stdout).match(/ℹ fail (\d+)/); ok('Code', 'Automated tests', false, m ? `${m[1]} failing` : 'test run failed'); }
try { sh('claude', ['plugin', 'validate', '--strict', path.join(ROOT, 'plugin')]); ok('Code', 'Claude Code plugin passes strict validation', true); }
catch (e) { if (e.code === 'ENOENT') skip('Code', 'Claude Code plugin validation', 'claude CLI not on PATH'); else ok('Code', 'Claude Code plugin passes strict validation', false, String(e.stdout || e.stderr).trim().split('\n').pop()); }
const cargoEnv = { ...process.env, PATH: `/opt/homebrew/opt/rustup/bin:${HOME}/.cargo/bin:${process.env.PATH}` };
try { sh('cargo', ['build'], { cwd: path.join(ROOT, 'companion-app'), env: cargoEnv }); ok('Code', 'Menu bar app builds', true); }
catch (e) { ok('Code', 'Menu bar app builds', false, e.code === 'ENOENT' ? 'Rust not installed' : String(e.stderr).split('\n').find((l) => l.startsWith('error')) || 'build failed'); }

const url = read(path.join(JOULE, 'url')), token = read(path.join(JOULE, 'token'));
ok('Connection', 'This Mac is connected (Puddle signed in)', !!(url && token), url ? `service ${url}` : 'no token: sign in to Puddle');
const settings = read(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'settings.json')) || '';
ok('Connection', 'Claude Code sends usage to Puddle', settings.includes('OTEL_EXPORTER_OTLP_ENDPOINT') && (!url || settings.includes(url)), settings.includes('OTEL_LOG_USER_PROMPTS": "0') || settings.includes('"OTEL_LOG_USER_PROMPTS":"0"') ? 'prompt text logging off' : 'check OTEL_LOG_USER_PROMPTS');
const codex = read(path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'config.toml')) || '';
if (!codex) skip('Connection', 'Codex sends usage to Puddle', 'Codex not set up on this Mac');
else ok('Connection', 'Codex sends usage to Puddle', codex.includes('# >>> joule') && codex.includes('log_user_prompt = false'), codex.includes('# >>> joule') ? 'config block present' : 'no Puddle block in ~/.codex/config.toml');

const svc = url || 'http://127.0.0.1:4500';
const login = await get(`${svc}/login`);
ok('Team service', 'Team service is up', login.status === 200, `${svc} → ${login.status || login.body}`);
if (token && login.status === 200) {
  const link = await get(`${svc}/api/auth/device-link`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  ok('Team service', 'Device key is valid (app can open Team signed in)', link.status === 200, link.status === 401 ? 'key revoked or unknown: run /joule again' : `status ${link.status}`);
}
if (token && login.status === 200) {
  try {
    const link = JSON.parse((await get(`${svc}/api/auth/device-link`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })).body).url;
    const r = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    const live = JSON.parse((await get(`${svc}/api/live`, { headers: { cookie } })).body);
    const h = live.health || {};
    const mins = h.lastEvent ? Math.round((Date.now() - h.lastEvent) / 60000) : null;
    ok('Team service', 'Your usage data is arriving', mins != null && mins < 60, mins == null ? 'no events yet' : `last event ${mins} min ago, ${h.events} events, ${h.lastHour} in the last hour`);
    const health = JSON.parse((await get(`${svc}/health`)).body);
    ok('Team service', 'Database reachable', health.ok === true);
    ok('Privacy', 'Team service hides other people (your view lists only you)', Array.isArray(h.users) && h.users.length === 0, 'agent emails are dropped at ingest (tested in test/service.test.js)');
  } catch (e) { ok('Team service', 'Your usage data is arriving', false, e.message); }
}

const comp = await get('http://127.0.0.1:4600/api/scan');
ok('Companion', 'Companion is up', comp.status === 200, comp.status ? '' : 'start it: npm run companion');
if (comp.status === 200) {
  const s = JSON.parse(comp.body);
  ok('Companion', 'Finds the agents on this Mac', s.tools.some((t) => t.found), s.tools.map((t) => `${t.name}: ${t.found ? 'found' : 'not found'}`).join(', '));
  ok('Companion', 'Sorts accounts into work/personal', s.accounts.length > 0, s.accounts.map((a) => `${a.org || a.plan} (${a.kind})`).join(', '));
  ok('Privacy', 'Scan holds no emails', !/@[a-z0-9-]+\.[a-z]/i.test(comp.body.replace(/"[^"]*\/[^"]*"/g, '')), 'emails would appear as name@domain');
  const today = await get('http://127.0.0.1:4600/api/today');
  ok('Companion', 'Menu bar time is computed', today.status === 200 && /^\d+:\d\d$/.test(JSON.parse(today.body).label || ''), today.status === 200 ? `today ${JSON.parse(today.body).label}` : '');
  ok('Companion', 'Onboarding finished on this Mac', fs.existsSync(path.join(JOULE, 'companion.json')), fs.existsSync(path.join(JOULE, 'companion.json')) ? '' : 'go through onboarding once');
}
const me = await get('http://127.0.0.1:4601/api/highlights');
ok('Me', 'Personal dashboard is up', me.status === 200, me.status === 200 ? (() => { const h = JSON.parse(me.body); return `${h.agentHours} h, streak ${h.streak.current}, ${h.persona || 'no persona yet'}`; })() : 'part of the companion');
for (const f of ['personal.db', 'companion.json', 'token']) {
  const p = path.join(JOULE, f);
  if (fs.existsSync(p)) { const mode = fs.statSync(p).mode & 0o777; ok('Privacy', `${f} readable only by you`, (mode & 0o077) === 0, mode.toString(8)); }
}

if (process.argv.includes('--app') && fs.existsSync(APP)) {
  const running = (() => { try { sh('pgrep', ['-x', 'joule']); return true; } catch { return false; } })();
  try { sh('pkill', ['-x', 'joule']); } catch {}
  const run = (mode) => new Promise((resolve) => {
    const p = spawn(APP, [], { env: { ...process.env, PUDDLE_SELFTEST: mode } });
    let out = ''; p.stderr.on('data', (d) => (out += d));
    setTimeout(() => { p.kill(); resolve(out); }, 14_000);
  });
  const team = await run('team');
  ok('Menu bar app', 'Menu bar title shows today', /menu bar title = Some\("\d+:\d\d"\)/.test(team), (team.match(/menu bar title = (.*)/) || [])[1] || 'no output');
  ok('Menu bar app', 'Team opens inside the app, signed in', /team window at Some\("\/"\)/.test(team), (team.match(/team window at (.*?),/) || [])[1] || 'no output');
  const choices = path.join(JOULE, 'companion.json'), saved = read(choices);
  const done = await run('done');
  if (saved) fs.writeFileSync(choices, saved, { mode: 0o600 });
  ok('Menu bar app', 'Done closes onboarding and opens Me', /main visible after = Some\(Ok\(false\)\), me visible = Some\(Ok\(true\)\)/.test(done), (done.match(/main visible after = (.*)/) || [])[1] || 'no output');
  if (running) spawn(APP, [], { detached: true, stdio: 'ignore' }).unref();
} else skip('Menu bar app', 'Self-test of the real app', process.argv.includes('--app') ? 'app not built' : 'add --app (restarts the app briefly)');

let area = '';
for (const r of results) {
  if (r.area !== area) { area = r.area; console.log(`\n${area}`); }
  console.log(`  ${r.pass === null ? '–' : r.pass ? '✓' : '✗'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
const bad = results.filter((r) => r.pass === false).length;
console.log(`\n${results.filter((r) => r.pass).length} passed, ${bad} failed, ${results.filter((r) => r.pass === null).length} skipped`);
process.exit(bad ? 1 : 0);
