import fs from 'node:fs';
import path from 'node:path';
import { DAY, readJson, exists, lsDir, cleanTitle, onPath, editorExtensions, existing, uniqInstalls, walk, eachRecord } from './util.js';
import { makeFollower } from '../../collector/lines.js';

const read = makeFollower(() => ({ title: null, aiTitle: null, rows: [] }));

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

export function desktopAppDir(home, platform = process.platform, env = process.env) {
  if (platform === 'darwin') return path.join(home, 'Library/Application Support/Claude');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData/Roaming'), 'Claude');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude');
}
function desktopOrgs(home, env) {
  const root = path.join(desktopAppDir(home, process.platform, env), 'claude-code-sessions');
  const orgs = [], bySession = new Map(), titles = new Map();
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
  context(home, env, homes) {
    const desktop = desktopOrgs(home, env);
    const known = new Map(homes.filter((h) => h.account).map((h) => [h.account.id, h.account]));
    const accountFor = (id) => known.get(id) || { kind: 'unknown', id, plan: 'Other Claude account', org: null };
    return { desktop, accountFor, extraAccounts: desktop.orgs.map((id) => ({ account: accountFor(id), dir: 'desktop app' })) };
  },
  sessions(h, since, ctx, { titles = null } = {}) {
    const { desktop, accountFor } = ctx, out = [];
    for (const f of walk(path.join(h.dir, 'projects'), (n) => n.endsWith('.jsonl'))) {
      if (f.split(path.sep).includes('subagents')) continue;
      let st; try { st = fs.statSync(f); } catch { continue; }
      if (st.mtimeMs < since) { read.logs.delete(f); continue; }
      const org = desktop.bySession.get(path.basename(f, '.jsonl'));
      const s = { id: path.basename(f, '.jsonl'), tool: 'claude-code', account: org ? accountFor(org) : h.account, cwd: null, times: [], prompts: 0, surface: null, title: null, titleSource: null };
      const cwds = new Map();
      const { s: log, text } = read.follow(f, st);
      eachRecord(text, (r) => {
        if (r.type === 'custom-title' && r.customTitle) { log.title = cleanTitle(r.customTitle); return; }
        if (r.type === 'ai-title' && r.aiTitle) { log.aiTitle = cleanTitle(r.aiTitle); return; }
        const t = Date.parse(r.timestamp);
        if (!t) return;
        const turn = r.type === 'user' || r.type === 'assistant';
        log.rows.push([t, turn && r.cwd ? r.cwd : null, r.entrypoint || null, turn, isPrompt(r)]);
      });
      s.title = log.title;
      const aiTitle = log.aiTitle;
      for (const [t, cwd, entry, turn, prompt] of log.rows) {
        if (t < since) continue;
        if (cwd) cwds.set(cwd, (cwds.get(cwd) || 0) + 1);
        if (entry && !s.surface) s.surface = entry;
        if (turn) s.times.push(t);
        if (prompt) s.prompts++;
      }
      s.cwd = [...cwds].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
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
