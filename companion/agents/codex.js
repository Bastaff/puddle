// Codex on this Mac: its CLI, its app and its editor extension write rollouts (<codex home>/sessions/**/rollout-*.jsonl).
// The account from auth.json, thread names from session_index.jsonl, plan limits from its own logs (token counts).
import fs from 'node:fs';
import path from 'node:path';
import { readJson, exists, cleanTitle, onPath, editorExtensions, existing, uniqInstalls, walk, eachLine, jwtClaims } from './util.js';

// is_workspace_account() in codex-rs/protocol/src/auth.rs
const WORK = /^(team|business|self_serve_business|ent|enterprise|edu|education|hc)/;
const PLAN_NAMES = { free: 'Free', go: 'Go', plus: 'Plus', pro: 'Pro', prolite: 'Pro', promax: 'Pro', team: 'Business', business: 'Business', enterprise: 'Enterprise', edu: 'Edu' };

export function classifyCodex(auth) {
  if (!auth) return null;
  if (auth.auth_mode && /api|bedrock/i.test(auth.auth_mode) && !auth.tokens) return { kind: 'api', id: 'api-key', plan: 'API key', org: null };
  const claims = jwtClaims(auth.tokens?.id_token || '')?.['https://api.openai.com/auth'] || {};
  const plan = String(claims.chatgpt_plan_type || '').toLowerCase();
  const id = auth.tokens?.account_id || claims.chatgpt_account_id;
  if (!id) return null;
  const kind = !plan ? 'unknown' : WORK.test(plan) ? 'work' : 'personal';
  const org = (claims.organizations || []).find((o) => o.is_default)?.title;
  return { kind, id, plan: PLAN_NAMES[plan] || plan || 'ChatGPT account', org: kind === 'work' && org && org !== 'Personal' ? org : null };
}

// Codex rate_limits → { five_pct, five_reset, week_pct, week_reset, ts }: the window of about 5 hours and the
// weekly one, whichever slot (primary/secondary) carries them; reset times in ms
export function codexPlan(rl, ts, org = null) {
  const out = { agent: 'codex', org, five_pct: null, five_reset: null, week_pct: null, week_reset: null, month_pct: null, month_reset: null, ts };
  for (const w of [rl.primary, rl.secondary]) {
    if (!w || w.used_percent == null) continue;
    const reset = w.resets_at ? Number(w.resets_at) * (Number(w.resets_at) < 1e12 ? 1000 : 1) : w.resets_in_seconds != null ? ts + Number(w.resets_in_seconds) * 1000 : null;
    const mins = Number(w.window_minutes) || (w === rl.primary ? 300 : 10080);
    // up to a day: the 5-hour window; up to 8 days: the week; longer (e.g. 30 days): the month
    const slot = mins <= 24 * 60 ? 'five' : mins <= 8 * 24 * 60 ? 'week' : 'month';
    out[slot + '_pct'] = Number(w.used_percent); out[slot + '_reset'] = reset;
  }
  return out.five_pct == null && out.week_pct == null && out.month_pct == null ? null : out;
}

// Codex keeps each thread's name in <codex home>/session_index.jsonl: { id, thread_name, updated_at }, newest last.
function codexTitles(dir) {
  const m = new Map();
  try { for (const line of fs.readFileSync(path.join(dir, 'session_index.jsonl'), 'utf8').split('\n')) { try { const r = JSON.parse(line); if (r.id && r.thread_name) m.set(r.id, cleanTitle(r.thread_name)); } catch {} } } catch {}
  return m;
}

export default {
  id: 'codex',
  detect(home, env) {
    const installs = uniqInstalls([
      ...onPath('codex', env).map((p) => ({ kind: 'command line', path: p })),
      ...existing([['Homebrew', '/opt/homebrew/bin/codex'], ['inside the ChatGPT app', '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'], ['desktop app', '/Applications/Codex.app']]),
      ...editorExtensions(home, 'openai.chatgpt-'),
    ]);
    const dirs = new Set([path.join(home, '.codex')]);
    if (env.CODEX_HOME) dirs.add(path.resolve(env.CODEX_HOME));
    const homes = [...dirs].filter(exists).map((dir) => {
      let toml = ''; try { toml = fs.readFileSync(path.join(dir, 'config.toml'), 'utf8'); } catch {}
      return { dir, account: classifyCodex(readJson(path.join(dir, 'auth.json'))), telemetry: (toml.match(/endpoint\s*=\s*"([^"]+)"/) || [])[1] || null };
    });
    return { installs, homes, managed: exists('/etc/codex/managed_config.toml') || exists('/etc/codex/requirements.toml') };
  },
  context: () => ({ extraAccounts: [] }),
  sessions(h, since) {
    const out = [], titles = codexTitles(h.dir);
    for (const f of walk(path.join(h.dir, 'sessions'), (n) => n.startsWith('rollout-') && n.endsWith('.jsonl'))) {
      if (fs.statSync(f).mtimeMs < since) continue;
      const s = { tool: 'codex', account: h.account, cwd: null, repo: null, times: [], prompts: 0, surface: null, title: null, titleSource: null };
      let events = 0, items = 0;
      eachLine(f, (r) => {
        const t = Date.parse(r.timestamp);
        if (r.type === 'session_meta') {
          const p = r.payload || {};
          s.cwd = p.cwd; s.repo = p.git?.repository_url || null; s.surface = p.originator || null; s.id = p.id || p.session_id || null;
          // a thread keeps the account it was created under, even if the person switched since
          if (p.creator_account_id && p.creator_account_id !== h.account?.id) s.account = { kind: 'unknown', id: p.creator_account_id, plan: 'Another ChatGPT account', org: null };
        }
        if (!t || t < since) return;
        s.times.push(t);
        // older builds log user_message events; newer ones only the user's response_item (minus injected <context> blocks)
        if (r.type === 'event_msg' && r.payload?.type === 'user_message') events++;
        // plan limits (5-hour and weekly % used) ride along on token counts; the newest one wins
        const rl = r.type === 'event_msg' && r.payload?.type === 'token_count' ? r.payload.rate_limits || r.payload.info?.rate_limits : null;
        if (rl && (!s.plan || t >= s.plan.ts)) s.plan = codexPlan(rl, t, s.account?.id);
        if (r.type === 'response_item' && r.payload?.type === 'message' && r.payload.role === 'user' && (r.payload.content || []).some((b) => b?.type === 'input_text' && !String(b.text).startsWith('<'))) items++;
      });
      s.prompts = events || items;
      const name = s.id && titles.get(s.id);
      if (name) { s.title = name; s.titleSource = 'index'; }
      if (s.cwd && s.times.length) out.push(s);
    }
    return out;
  },
  // its newest plan reading per account, from the sessions' logs
  plans(home, now, sessions) {
    const newest = new Map();
    for (const p of sessions.filter((x) => x.plan).map((x) => x.plan)) if ((newest.get(p.org)?.ts || 0) < p.ts) newest.set(p.org, p);
    return [...newest.values()];
  },
  // the Codex app gives every quick chat its own ~/Documents/Codex/<date>/<slug> folder
  place: (cwd) => (/\/Documents\/Codex\/\d{4}-\d{2}-\d{2}\//.test(cwd) ? { key: 'chats', type: 'chats', label: 'Quick chats in the Codex app' } : null),
  blindSpot: 'Codex cloud tasks',
};
