// Plan limits on this Mac: the newest reading per tool and account (the Claude desktop app's record, Puddle's
// Claude Code status line, Codex's logs), kept in ~/.joule/plan.json and passed on to the team service when it
// changes (at most once a minute each, at least every 15 minutes so the team sees it's current). Numbers only:
// % used, reset times, and the account's fingerprint (never its id).
import fs from 'node:fs';
import path from 'node:path';
import { fingerprint } from './cloud.js';
import { planAgents } from '../collector/agents.js';

// the agent ids a plan reading may carry, from the agent catalogue (claude: the Claude desktop app's own record;
// claude-code: Puddle's status line; codex: its logs)
const AGENTS = planAgents;
const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(100, Number(v))));
// reset times arrive as epoch seconds, epoch ms or ISO text; kept as ms
const when = (v) => { if (v == null || v === '') return null; const n = Number(v); if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

export function clean(r, now = Date.now()) {
  if (!r || !AGENTS.includes(r.agent)) return null;
  const out = { agent: r.agent, org: r.org ? String(r.org).slice(0, 100) : null, five_pct: pct(r.five_pct), five_reset: when(r.five_reset), week_pct: pct(r.week_pct), week_reset: when(r.week_reset),
    month_pct: pct(r.month_pct), month_reset: when(r.month_reset), ts: Number(r.ts) || now };
  return out.five_pct == null && out.week_pct == null && out.month_pct == null ? null : out;
}

export function makePlan({ dir, cloud, log = () => {}, onError = () => {}, now = () => Date.now(), minGap = 60_000, heartbeat = 15 * 60_000 }) {
  const file = path.join(dir, 'plan.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch {}
  for (const k of Object.keys(state)) if (!k.includes('|')) delete state[k]; // readings kept before accounts were told apart
  const sent = {}, timers = {};
  const same = (a, b) => a && b && ['five', 'week', 'month'].every((k) => a[k + '_pct'] === b[k + '_pct'] && a[k + '_reset'] === b[k + '_reset']);
  const keyOf = (r) => `${r.agent}|${r.org || ''}`;
  async function send(key) {
    clearTimeout(timers[key]); timers[key] = null;
    const r = state[key]; if (!r) return;
    sent[key] = { at: now(), r };
    const { org, ...rest } = r; // the account id stays on this Mac; the team sees its fingerprint
    const res = await cloud.plan({ ...rest, org_hash: org ? fingerprint(org) : null }).catch((e) => ({ status: 0, error: e.message }));
    if (res.status !== 200 && res.status !== 401) { log(`plan: ${res.status || res.error}`); onError(); }
  }
  function record(reading) {
    const r = clean(reading, now());
    if (!r || now() - r.ts > 8 * 864e5) return false; // too old to say anything about today
    const key = keyOf(r), prev = state[key];
    if (prev && prev.ts > r.ts) return false; // an older reading never replaces a newer one
    state[key] = r;
    // the same tool's reading from before it knew its account (older status lines) is this one's past: gone
    const blind = `${r.agent}|`;
    if (r.org && state[blind] && state[blind].ts <= r.ts) delete state[blind];
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 }); } catch {}
    const last = sent[key];
    if (last && same(last.r, r) && now() - last.at < heartbeat) return true; // nothing new to tell
    const wait = last ? Math.max(0, minGap - (now() - last.at)) : 0;
    if (!timers[key]) timers[key] = setTimeout(() => send(key), wait);
    timers[key].unref?.();
    return true;
  }
  return { record, latest: () => ({ ...state }), close: () => { for (const t of Object.values(timers)) clearTimeout(t); } };
}
