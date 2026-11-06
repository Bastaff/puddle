import fs from 'node:fs';
import path from 'node:path';

export const CODEX_BEGIN = '# >>> puddle (managed by Puddle; remove with `puddle off`) >>>';
const CODEX_END = '# <<< puddle <<<';
const OLD_CODEX_BEGIN = '# >>> joule (managed by `joule`; remove with `joule off`) >>>';
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

export function agentConnections({ home, env = {}, token, url }) {
  const out = {};
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  if (!exists(claudeDir)) out['claude-code'] = 'absent';
  else {
    let e = {}; try { e = JSON.parse(read(path.join(claudeDir, 'settings.json')) || '{}')?.env || {}; } catch { e = null; }
    if (e === null) out['claude-code'] = 'own';
    else if (String(e.JOULE || '').startsWith('joule:') && !e.PUDDLE) out['claude-code'] = 'stale';
    else if (String(e.PUDDLE || '').startsWith('puddle:')) out['claude-code'] = String(e.OTEL_EXPORTER_OTLP_HEADERS || '').includes(`Bearer ${token}`) && e.OTEL_EXPORTER_OTLP_ENDPOINT === url ? 'connected' : 'stale';
    else out['claude-code'] = e.OTEL_EXPORTER_OTLP_ENDPOINT ? 'own' : 'missing';
  }
  const codexHome = env.CODEX_HOME || path.join(home, '.codex');
  if (!exists(codexHome)) out.codex = 'absent';
  else {
    const t = read(path.join(codexHome, 'config.toml')) || '';
    const a = t.indexOf(CODEX_BEGIN);
    if (a >= 0) { const block = t.slice(a, t.indexOf(CODEX_END, a) >>> 0 || undefined); out.codex = block.includes(`Bearer ${token}`) && block.includes(`${url}/v1/logs`) ? 'connected' : 'stale'; }
    else if (t.includes(OLD_CODEX_BEGIN)) out.codex = 'stale';
    else out.codex = /^[ \t]*\[otel\]|^[ \t]*otel[ \t]*=/m.test(t) ? 'own' : 'missing';
  }
  return out;
}

const RETRY = 6 * 3600_000, ONLY = { 'claude-code': 'claude', codex: 'codex' };
export function makeKeeper({ home, env = {}, credentials, connect, log = () => {}, onError = () => {}, now = () => Date.now() }) {
  const tried = {};
  let busy = false;
  return {
    state: () => { const c = credentials(); return c?.token && c?.url ? agentConnections({ home, env, ...c }) : null; },
    async keep() {
      if (busy || env.PUDDLE_DEV) return [];
      const c = credentials(); if (!c?.token || !c?.url) return [];
      busy = true;
      const done = [];
      try {
        for (const [agent, s] of Object.entries(agentConnections({ home, env, ...c }))) {
          if ((s !== 'missing' && s !== 'stale') || (tried[agent] != null && now() - tried[agent] < RETRY)) continue;
          tried[agent] = now();
          const r = await connect(ONLY[agent]).catch((e) => ({ ok: false, text: e.message }));
          done.push({ agent, was: s, ok: r.ok });
          if (r.ok) log(`${agent}: was ${s}, connected`); else { log(`${agent}: was ${s}, couldn't connect: ${String(r.text || '').trim().slice(0, 200)}`); onError(`connect-${agent}`); }
        }
      } finally { busy = false; }
      return done;
    },
  };
}
