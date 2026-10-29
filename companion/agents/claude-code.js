// Claude Code on this Mac: the CLI, its editor extensions and the Claude desktop app all write the same
// transcripts (<config dir>/projects/**/<session>.jsonl). Accounts from ~/.claude.json, titles from the transcript
// (custom-title, ai-title), the desktop app's own names, and Puddle's status line; plan limits from the desktop app's
// record (here) and Puddle's status line (POST /api/plan to the helper).
import fs from 'node:fs';
import path from 'node:path';
import { DAY, readJson, exists, lsDir, cleanTitle, onPath, editorExtensions, existing, uniqInstalls, walk, eachLine } from './util.js';

// oauthAccount.organizationType
const WORK = /^claude_(team|enterprise)/;
const PLAN_NAMES = { claude_team: 'Team', claude_enterprise: 'Enterprise', claude_max: 'Max', claude_pro: 'Pro' };

export function classifyClaude(oauth, env = {}) {
  if (oauth?.organizationUuid) {
    const type = oauth.organizationType || '';
    const kind = WORK.test(type) ? 'work' : /max|pro|free/.test(type) ? 'personal' : 'unknown';
    return { kind, id: oauth.organizationUuid, plan: PLAN_NAMES[type] || type.replace(/^claude_/, '') || 'Claude account', org: kind === 'work' ? oauth.organizationName || null : null, seat: oauth.seatTier || null };
  }
  if (env.CLAUDE_CODE_USE_BEDROCK || env.CLAUDE_CODE_USE_VERTEX || env.CLAUDE_CODE_USE_FOUNDRY) return { kind: 'api', id: 'cloud', plan: 'Cloud provider', org: null };
  if (env.ANTHROPIC_API_KEY || env.apiKeyHelper) return { kind: 'api', id: 'api-key', plan: 'API key', org: null };
  return null;
}

// The Claude desktop app can switch between organizations (say a Team org and a personal one) and files each Code
// session under the org it ran in: <app data>/claude-code-sessions/<account>/<org>/local_*.json → { cliSessionId,
// cwd, title }. The CLI's ~/.claude.json only knows the org it is signed into right now.
export function desktopAppDir(home, platform = process.platform, env = process.env) {
  if (platform === 'darwin') return path.join(home, 'Library/Application Support/Claude');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData/Roaming'), 'Claude');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude');
}
function desktopOrgs(home, env) {
  const root = path.join(desktopAppDir(home, process.platform, env), 'claude-code-sessions');
  const orgs = [], bySession = new Map(), titles = new Map(); // titles: the name the app shows for the conversation
  for (const acct of lsDir(root).filter((e) => e.isDirectory())) {
    for (const org of lsDir(path.join(root, acct.name)).filter((e) => e.isDirectory())) {
      orgs.push(org.name);
      for (const f of lsDir(path.join(root, acct.name, org.name)).filter((e) => e.name.startsWith('local_') && e.name.endsWith('.json'))) {
        const rec = readJson(path.join(root, acct.name, org.name, f.name));
        if (rec?.cliSessionId) { bySession.set(rec.cliSessionId, org.name); if (rec.title) titles.set(rec.cliSessionId, cleanTitle(rec.title)); }
      }
    }
  }
  return { orgs: [...new Set(orgs)], bySession, titles };
}

// The desktop app keeps each account's plan use (5-hour and 7-day %) in plan-usage-history.json, as it sees it while
// you work there (no status line needed). The newest sample per account; no reset times in it, and they can't be
// worked out from it (a Team plan's week started over twice in three days, at different hours).
export const claudeHistoryFile = (home) => path.join(home, 'Library', 'Application Support', 'Claude', 'plan-usage-history.json');
export function claudePlans(home, now = Date.now()) {
  let j;
  try { j = JSON.parse(fs.readFileSync(claudeHistoryFile(home), 'utf8')); } catch { return []; }
  const newest = new Map();
  for (const x of Array.isArray(j?.samples) ? j.samples : []) {
    const ts = Number(x?.t) < 1e12 ? Number(x?.t) * 1000 : Number(x?.t);
    if (!ts || !x.org || !x.u || now - ts > 8 * DAY || (newest.get(x.org)?.ts || 0) > ts) continue;
    newest.set(x.org, { agent: 'claude', org: String(x.org), five_pct: x.u.fh ?? null, five_reset: null, week_pct: x.u.sd ?? null, week_reset: null, ts });
  }
  return [...newest.values()].filter((r) => r.five_pct != null || r.week_pct != null);
}

const isPrompt = (r) => r.type === 'user' && !r.isMeta && !r.isSidechain && (typeof r.message?.content === 'string' ? !r.message.content.startsWith('<') : Array.isArray(r.message?.content) && r.message.content.some((b) => b?.type === 'text') && !r.message.content.some((b) => b?.type === 'tool_result'));

export default {
  id: 'claude-code',
  // installs, every config dir (the default, $CLAUDE_CONFIG_DIR, and the ~/.claude-<name> dirs the docs recommend for
  // keeping work and personal apart) and whether an organization manages it
  detect(home, env) {
    const installs = uniqInstalls([
      ...onPath('claude', env).map((p) => ({ kind: 'command line', path: p })),
      ...existing([['native installer', path.join(home, '.local/bin/claude')], ['older installer', path.join(home, '.claude/local/claude')], ['Homebrew', '/opt/homebrew/bin/claude'], ['desktop app', '/Applications/Claude.app'], ['desktop app', path.join(home, 'Applications/Claude.app')]]),
      ...editorExtensions(home, 'anthropic.claude-code-'),
    ]);
    const dirs = new Set([path.join(home, '.claude')]);
    if (env.CLAUDE_CONFIG_DIR) dirs.add(path.resolve(env.CLAUDE_CONFIG_DIR));
    for (const e of lsDir(home)) if (e.isDirectory() && /^\.claude[-_.]/.test(e.name) && exists(path.join(home, e.name, 'projects'))) dirs.add(path.join(home, e.name));
    const homes = [...dirs].filter((d) => exists(d)).map((dir) => {
      const isDefault = dir === path.join(home, '.claude');
      const cfg = readJson(isDefault ? path.join(home, '.claude.json') : path.join(dir, '.claude.json')) || readJson(path.join(dir, '.claude.json'));
      const settings = readJson(path.join(dir, 'settings.json')) || {};
      const env2 = { ...(settings.env || {}), apiKeyHelper: settings.apiKeyHelper };
      return { dir, account: classifyClaude(cfg?.oauthAccount, env2), telemetry: settings.env?.OTEL_EXPORTER_OTLP_ENDPOINT || null };
    });
    const mp = process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode/managed-settings.json' : process.platform === 'win32' ? 'C:\\Program Files\\ClaudeCode\\managed-settings.json' : '/etc/claude-code/managed-settings.json';
    return { installs, homes, managed: exists(mp) };
  },
  // the desktop app's organizations and names; an org it knows but no CLI login describes can't have its plan read,
  // so it's asked about, never assumed to be work
  context(home, env, homes) {
    const desktop = desktopOrgs(home, env);
    const known = new Map(homes.filter((h) => h.account).map((h) => [h.account.id, h.account]));
    const accountFor = (id) => known.get(id) || { kind: 'unknown', id, plan: 'Other Claude account', org: null };
    return { desktop, accountFor, extraAccounts: desktop.orgs.map((id) => ({ account: accountFor(id), dir: 'desktop app' })) };
  },
  // titles: names from Puddle's status line, per session (the helper keeps them; see companion/server.js)
  sessions(h, since, ctx, { titles = null } = {}) {
    const { desktop, accountFor } = ctx, out = [];
    for (const f of walk(path.join(h.dir, 'projects'), (n) => n.endsWith('.jsonl'))) {
      // a sub-agent's transcript (<session>/subagents/agent-*.jsonl) is part of its conversation, not one of its own
      if (f.split(path.sep).includes('subagents')) continue;
      if (fs.statSync(f).mtimeMs < since) continue;
      const org = desktop.bySession.get(path.basename(f, '.jsonl')); // app sessions know their org; CLI ones get the CLI's login
      const s = { id: path.basename(f, '.jsonl'), tool: 'claude-code', account: org ? accountFor(org) : h.account, cwd: null, times: [], prompts: 0, surface: null, title: null, titleSource: null };
      const cwds = new Map(); // the desktop app logs a scratch folder first; the folder most turns ran in wins
      let aiTitle = null;
      eachLine(f, (r) => {
        // the conversation's title as Claude Code shows it (the last one wins; these records carry no timestamp)
        if (r.type === 'custom-title' && r.customTitle) { s.title = cleanTitle(r.customTitle); return; }
        if (r.type === 'ai-title' && r.aiTitle) { aiTitle = cleanTitle(r.aiTitle); return; }
        const t = Date.parse(r.timestamp);
        if (!t || t < since) return;
        if (r.cwd && (r.type === 'user' || r.type === 'assistant')) cwds.set(r.cwd, (cwds.get(r.cwd) || 0) + 1);
        if (r.entrypoint && !s.surface) s.surface = r.entrypoint;
        if (r.type === 'user' || r.type === 'assistant') s.times.push(t);
        if (isPrompt(r)) s.prompts++;
      });
      s.cwd = [...cwds].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      // a name given by hand wins; else the app's own name; else the title Claude Code wrote (ai-title); else the
      // one Puddle's status line saw (never a prompt, never the default "my-app-3f" display name)
      const app = desktop.titles?.get(s.id), line = titles?.get(s.id);
      if (s.title) s.titleSource = 'set';
      else if (app) { s.title = app; s.titleSource = 'app'; }
      else if (aiTitle) { s.title = aiTitle; s.titleSource = 'generated'; }
      else if (line) { s.title = line; s.titleSource = 'statusline'; }
      if (s.cwd && s.times.length) out.push(s);
    }
    return out;
  },
  plans: (home, now) => claudePlans(home, now),
  blindSpot: 'Claude Code on the web',
};
