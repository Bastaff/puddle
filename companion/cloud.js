// The companion's only conversations with the Puddle service: connect this computer from a
// one-time pairing link, read a team invite, and join it with the choice made in the app.
// Everything else stays on the device.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { agent as agentOf } from '../collector/agents.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Puddle's own addresses only: a joule:// link can be made by anyone, and must never point
// this computer's usage at somebody else's server. They come with the build (companion/SERVICE, one per line, the
// first is where "Sign in" goes; scripts/stamp-version.mjs writes it): a copy built from source has none, signs in
// nowhere and works on this Mac only.
const HOSTED = (() => { try { return fs.readFileSync(path.join(HERE, 'SERVICE'), 'utf8').split('\n').map((s) => s.trim().replace(/\/+$/, '')).filter((s) => /^https:\/\//.test(s)); } catch { return []; } })();
const DEV = ['http://127.0.0.1:4500', 'http://localhost:4500'];
export function allowedUrl(u, env = process.env, hosted = HOSTED) {
  const extra = String(env.JOULE_ALLOWED_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const clean = String(u || '').replace(/\/+$/, '');
  return [...hosted, ...DEV, ...extra].includes(clean) ? clean : null;
}

// Where "Connect" sends you: Puddle's service (a local one while developing, via JOULE_SERVICE_URL), or null
export const serviceUrl = (env = process.env, hosted = HOSTED) => allowedUrl(env.JOULE_SERVICE_URL, env, hosted) || hosted[0] || null;
const NOWHERE = { status: 400, data: { error: 'This copy of Puddle was built without a website to sign in to. Everything else works on this Mac.' } };

// The same fingerprint the service keeps for a vendor account (never the id itself).
export const fingerprint = (id) => createHash('sha256').update('joule|' + id).digest('hex').slice(0, 16);

// The app's choices ("Work for <team>?") in the service's words:
//   account "claude-code:<org id>" / "codex:<account id>" → its fingerprint
//   place "github.com/acme" → "group:github.com/acme"; folder "dir:/Users/x/side" → "dir:side"
export function toShare(team = {}) {
  const share = { all: false, orgs: [], projects: [] };
  for (const [key, on] of Object.entries(team)) {
    if (!on) continue;
    // <agent>:<account id> (an agent the catalogue knows; "dir:" and "group:" keys are places)
    const m = key.match(/^([a-z0-9-]+):(.+)$/);
    if (m && !agentOf(m[1]).unknown) { if (!['none', 'api-key', 'cloud'].includes(m[2])) share.orgs.push(fingerprint(m[2])); continue; }
    if (key.startsWith('dir:')) share.projects.push('dir:' + path.basename(key.slice(4)));
    else if (/^[a-z0-9.-]+\/[^/]/i.test(key)) share.projects.push('group:' + key.toLowerCase());
  }
  return share;
}

export function makeCloud({ dir, env = process.env, fetchImpl = fetch, log = () => {} }) {
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return null; } };
  const inviteFile = path.join(dir, 'invite.json');
  const emailFile = path.join(dir, 'email');
  // Every key this Mac has put into Claude Code's settings (Claude Code reads it once per session, so sessions
  // started earlier keep sending an older one): kept so a new sign-in reuses it and the website re-adopts lost ones.
  const keysFile = path.join(dir, 'keys.json');
  const KEY = /^jl_[A-Za-z0-9_-]{20,100}$/;
  const readKeys = () => { try { return JSON.parse(fs.readFileSync(keysFile, 'utf8')).filter((k) => KEY.test(k)); } catch { return []; } };
  const addKeys = (ks) => {
    const all = [...new Set([...readKeys(), ...ks.filter((k) => KEY.test(k || ''))])].slice(-20);
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(keysFile, JSON.stringify(all), { mode: 0o600 }); } catch {}
  };
  // the key in Claude Code's settings right now (what new sessions will send)
  const settingsKeys = () => {
    const home = env.HOME || os.homedir();
    const files = [path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json')];
    const out = [];
    for (const f of files) { try { const h = JSON.parse(fs.readFileSync(f, 'utf8'))?.env?.OTEL_EXPORTER_OTLP_HEADERS || ''; const m = String(h).match(/Bearer\s+(jl_[A-Za-z0-9_-]+)/); if (m) out.push(m[1]); } catch {} }
    return out;
  };
  const keepKey = () => read('token') || readKeys().at(-1) || settingsKeys()[0] || null;
  const plugin = env.JOULE_PLUGIN_BIN || path.join(HERE, '..', 'plugin', 'bin', 'joule');
  const call = async (method, p, body) => {
    const url = read('url'), token = read('token');
    if (!url || !token) return { status: 401, data: { error: 'This computer isn\'t connected yet.' } };
    const r = await fetchImpl(url + p, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };

  let syncing = false;
  async function syncOnce(scanData, days) {
    const sentFile = path.join(dir, 'synced.json');
    // { signIn, sent }: forgotten when this computer signs in again (a new account, or the website started over)
    const signIn = this.signInKey();
    let sent = {}; try { const st = JSON.parse(fs.readFileSync(sentFile, 'utf8')); if (st.signIn === signIn) sent = st.sent || {}; } catch {}
    const since = Date.now() - days * 86400_000;
    const accounts = Object.fromEntries((scanData.accounts || []).map((a) => [a.key, a]));
    let n = 0;
    for (const s of scanData.sessions || []) {
      const sig = `${s.repo}|${s.folder}|${s.title || ''}`; // sent again when the title changes
      if (!s.id || s.end < since || sent[s.id] === sig) continue;
      const a = accounts[s.account], id = s.account?.split(':').slice(1).join(':');
      const account = a && id && !['none', 'api-key', 'cloud'].includes(id)
        ? { org_hash: fingerprint(id), type: String(a.plan || a.kind || ''), name: a.kind === 'work' ? a.org || '' : '' } : undefined;
      const r = await call('POST', '/api/session-context', { session_id: s.id, agent: s.tool, repo: s.repo ? `https://${s.repo}` : '', folder: s.folder || '', title: s.title || '', source: 'app', account }).catch(() => null);
      // saved as it goes: an interrupted run picks up where it stopped
      if (r?.status === 200) { sent[s.id] = sig; n++; fs.writeFileSync(sentFile, JSON.stringify({ signIn, sent }), { mode: 0o600 }); }
    }
    return { sent: n };
  }
  return {
    connected: () => Boolean(read('token') && read('url')),
    // This sign-in (a new device key every time, also after the website's data was reset): what was already sent
    // is remembered per sign-in, so a new one sends everything again. A fingerprint, never the key itself.
    signInKey: () => { const t = read('token'), u = read('url'); return t && u ? fingerprint(u + '|' + t) : null; },
    // Signing in from the app: email → a 6-digit code by mail → this computer's own device key.
    async sendCode(email) {
      const base = serviceUrl(env); if (!base) return NOWHERE;
      const r = await fetchImpl(base + '/api/app/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(15_000) });
      return { status: r.status, data: await r.json().catch(() => ({})) };
    },
    async signIn(email, code) {
      const base = serviceUrl(env); if (!base) return NOWHERE;
      const r = await fetchImpl(base + '/api/app/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code, label: `${env.USER || 'Mac'} · Puddle app`, keep: keepKey() }), signal: AbortSignal.timeout(15_000) });
      const d = await r.json().catch(() => ({}));
      return r.ok ? this.connect(base, d) : { status: r.status, data: d };
    },
    // joule://pair?code=…&url=… (a signed-in browser's shortcut) → the same device key, no code
    async pair(code, url) {
      const base = allowedUrl(url, env);
      if (!base) return { status: 400, data: { error: 'That link points somewhere Puddle doesn\'t know. Open "Get Puddle" from Puddle\'s own website.' } };
      const r = await fetchImpl(base + '/api/pair/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, label: `${env.USER || 'Mac'} · Puddle app`, keep: keepKey() }), signal: AbortSignal.timeout(15_000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { status: r.status, data: d };
      return this.connect(base, d);
    },
    async connect(base, d) {
      // Puddle Dev (testing on the local website): sign in only; Claude Code keeps reporting to the real Puddle
      if (env.JOULE_DEV) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(dir, 'token'), d.token, { mode: 0o600 }); fs.writeFileSync(path.join(dir, 'url'), base, { mode: 0o600 });
        addKeys([d.token]);
        if (d.invite) fs.writeFileSync(inviteFile, JSON.stringify({ code: d.invite.code, team: d.invite.team, at: Date.now() }), { mode: 0o600 });
        if (d.email) fs.writeFileSync(emailFile, String(d.email), { mode: 0o600 });
        return { status: 200, data: { email: d.email, invite: d.invite, connected: ['Puddle Dev: your history is mirrored to the local website'] } };
      }
      // the same steps /joule takes, minus the sign-in: switch on usage export in Claude Code and Codex
      const out = await new Promise((resolve) => execFile('sh', [plugin, 'connect'], { env: { ...env, JOULE_TOKEN: d.token, JOULE_URL: base, JOULE_DIR: dir } },
        (err, stdout, stderr) => resolve({ ok: !err, text: String(stdout || '') + String(stderr || '') })));
      if (!out.ok) { log(`connect failed: ${out.text}`); return { status: 500, data: { error: 'Puddle connected your account but couldn\'t switch on tracking. Try again from Settings.' } }; }
      addKeys([d.token]);
      if (d.invite) fs.writeFileSync(inviteFile, JSON.stringify({ code: d.invite.code, team: d.invite.team, at: Date.now() }), { mode: 0o600 });
      if (d.email) fs.writeFileSync(emailFile, String(d.email), { mode: 0o600 }); // shown in Settings: "Signed in as …"
      return { status: 200, data: { email: d.email, invite: d.invite, connected: out.text.trim().split('\n') } };
    },
    // Join from Puddle: an invite link (or its code) pasted in Settings or opened as joule://join; checked, then
    // remembered so the app's "What can <team> see?" step picks it up
    async useInvite(linkOrCode) {
      const code = (String(linkOrCode || '').match(/(?:\/join\/)?([A-Za-z0-9_-]{10,40})\/?\s*$/) || [])[1];
      if (!code) return { status: 400, data: { error: 'That doesn\'t look like an invite link.' } };
      // not signed in yet: keep the invite; after signing in, Puddle asks "What can <team> see?"
      if (!this.connected()) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(inviteFile, JSON.stringify({ code, team: null, at: Date.now() }), { mode: 0o600 }); return { status: 202, data: { saved: true } }; }
      const r = await call('GET', `/api/app/invite/${encodeURIComponent(code)}`);
      if (r.status === 410 || r.status === 404) return { status: 410, data: { error: 'This invite has expired. Ask for a new link.' } };
      if (r.status !== 200) return r;
      if (r.data.member) return { status: 409, data: { error: `You're already in ${r.data.team.name}.` } };
      fs.writeFileSync(inviteFile, JSON.stringify({ code, team: r.data.team, at: Date.now() }), { mode: 0o600 });
      return { status: 200, data: { team: r.data.team } };
    },
    // the invite this computer is on its way to joining, if any
    async invite() {
      let pending = null; try { pending = JSON.parse(fs.readFileSync(inviteFile, 'utf8')); } catch {}
      if (!pending) return null;
      const r = await call('GET', `/api/app/invite/${encodeURIComponent(pending.code)}`).catch(() => null);
      if (!r || r.status !== 200) return r?.status === 410 ? (fs.rmSync(inviteFile, { force: true }), null) : { code: pending.code, team: pending.team, owner: null };
      if (r.data.member) { fs.rmSync(inviteFile, { force: true }); return null; }
      return { code: pending.code, team: r.data.team, owner: r.data.owner };
    },
    // Tell the team service which project each recent session belongs to (repo name or folder name,
    // never paths or content), and the names of this Mac's accounts for the "what to share" picker.
    // This is what the /joule plugin's session hook does, for people who only have the app.
    async syncContexts(scanData, { days = 90 } = {}) { // the same window as the history a team sees (mirror.js)
      if (!this.connected() || syncing) return { sent: 0 }; // one run at a time: a long first sync must not start over
      syncing = true;
      try { return await syncOnce.call(this, scanData, days); } finally { syncing = false; }
    },

    // a one-time link that signs Puddle's Team window in (no email, no browser)
    // Puddle Dev: send events (OTLP JSON) to the local website, as Claude Code would to a real one
    async ingest(body) { return this.connected() ? call('POST', '/v1/logs', body) : { status: 401 }; },
    // Keys written into Claude Code's settings earlier, valid again for this account (lost by the website, or
    // replaced by a newer sign-in): running sessions still send them. → { adopted, refused }
    async healKeys() {
      if (!this.connected()) return { adopted: 0, refused: 0 };
      const now = read('token');
      addKeys([now, ...settingsKeys()]);
      const others = readKeys().filter((k) => k !== now);
      if (!others.length) return { adopted: 0, refused: 0 };
      const r = await call('POST', '/api/app/keys', { keys: others }).catch(() => null);
      const res = r?.status === 200 ? r.data.keys || [] : [];
      const adopted = res.filter((x) => x === 'adopted').length, refused = res.filter((x) => x === 'refused').length;
      if (adopted) log(`device keys: ${adopted} earlier key(s) valid again`);
      // keys another account owns aren't ours to keep
      if (refused) {
        const keep = readKeys().filter((k) => k === now || res[others.indexOf(k)] !== 'refused');
        try { fs.writeFileSync(keysFile, JSON.stringify(keep), { mode: 0o600 }); } catch {}
      }
      return { adopted, refused };
    },
    email() { try { return fs.readFileSync(emailFile, 'utf8').trim() || null; } catch { return null; } },
    // Sign out: the same as `joule off` (tracking off in Claude Code and Codex, this computer's key cancelled)
    // forget: false when the website stopped knowing this Mac (a reset): the keys are kept, so signing in again
    // brings the same key back and Claude Code sessions started earlier work again
    async signOut({ forget = true } = {}) {
      if (forget) fs.rmSync(keysFile, { force: true });
      if (env.JOULE_DEV) { await call('POST', '/api/token/revoke', {}).catch(() => null); for (const f of [inviteFile, emailFile, path.join(dir, 'token'), path.join(dir, 'url')]) fs.rmSync(f, { force: true }); return { ok: true }; }
      const out = await new Promise((resolve) => execFile('sh', [plugin, 'off'], { env: { ...env, JOULE_DIR: dir } },
        (err, stdout, stderr) => resolve({ ok: !err, text: String(stdout || '') + String(stderr || '') })));
      if (!out.ok) log(`sign out: ${out.text}`);
      for (const f of [inviteFile, emailFile, path.join(dir, 'token'), path.join(dir, 'url')]) fs.rmSync(f, { force: true });
      return { ok: true };
    },
    // this computer's device key and website address (companion/connections.js compares them with each agent's settings)
    credentials: () => ({ token: read('token'), url: read('url') }),
    // one agent ('claude' or 'codex') connected with the same steps sign-in takes (plugin/bin/joule connect)
    async connectAgent(only) {
      if (env.JOULE_DEV || !this.connected()) return { ok: false, text: 'not connected' };
      return new Promise((resolve) => execFile('sh', [plugin, 'connect'], { env: { ...env, JOULE_ONLY: only, JOULE_TOKEN: read('token'), JOULE_URL: read('url'), JOULE_DIR: dir } },
        (err, stdout, stderr) => resolve({ ok: !err, text: String(stdout || '') + String(stderr || '') })));
    },
    // At every start: Puddle's Claude Code status line (plan limits) in place and pointing at this copy of Puddle.
    // Puddle Dev never touches Claude Code's settings.
    async refreshStatusLine() {
      if (env.JOULE_DEV || !this.connected()) return;
      await new Promise((resolve) => execFile('sh', [plugin, 'statusline'], { env: { ...env, JOULE_DIR: dir } }, (err, stdout, stderr) => { if (err) log(`status line: ${stderr || err.message}`); resolve(); }));
    },
    // plan limits (5-hour and weekly % used, reset times) to the team service
    async plan(reading) { return this.connected() ? call('POST', '/api/plan', reading) : { status: 401 }; },
    async dashboardLink(next) { return this.connected() ? call('POST', '/api/auth/device-link', next ? { next } : undefined) : { status: 401, data: {} }; },
    // the teams for Me's menu bar (Me · teams · Settings)
    async nav() { return this.connected() ? call('GET', '/api/app/nav') : { status: 401, data: {} }; },
    // "Puddle is running": the website shows the download instead of an empty page when this stops
    async alive(report = null) { return this.connected() ? call('POST', '/api/app/alive', report || {}) : { status: 401 }; },
    // "Share live": your public page, switched from Me (the service decides the link)
    async share(action) { return action ? call('POST', '/api/me/share', { action }) : call('GET', '/api/me/share'); },
    // how you arranged your pages (layout.js), kept with your account: the same on the website and in Puddle
    async layouts() { return call('GET', '/api/me/layout'); },
    async setLayout(body) { return call('POST', '/api/me/layout', body); },
    async join(code, team) {
      const share = toShare(team);
      const r = await call('POST', '/api/app/join', { code, share });
      if (r.status === 200) fs.rmSync(inviteFile, { force: true });
      return r;
    },
  };
}
