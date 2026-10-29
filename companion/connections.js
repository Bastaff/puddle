// Every agent on this Mac stays connected to Puddle, not only the ones present at sign-in. Connecting used to happen
// once, when you signed in to Puddle: Codex used for the first time afterwards never sent live data (a tester's Mac,
// 21 Oct 2026; its work only reached the team a minute late, read back from Codex's own files). Puddle now looks at
// each agent at start and every 10 minutes, and connects one that's missing, or still holds an old key, with the same
// steps sign-in takes (plugin/bin/joule connect, one agent at a time). An agent with its own telemetry settings is
// left alone, and said so in the setup report. Reads files only; never connects in Puddle Dev.
import fs from 'node:fs';
import path from 'node:path';

export const CODEX_BEGIN = '# >>> joule (managed by `joule`; remove with `joule off`) >>>';
const CODEX_END = '# <<< joule <<<';
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

// One state per agent: connected | stale (Puddle's settings, another key or address) | missing | own (its own
// telemetry settings, left alone) | absent (not on this Mac)
export function agentConnections({ home, env = {}, token, url }) {
  const out = {};
  // Claude Code: ~/.claude/settings.json → env { JOULE: "joule:<address>", OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer <key>" }
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  if (!exists(claudeDir)) out['claude-code'] = 'absent';
  else {
    let e = {}; try { e = JSON.parse(read(path.join(claudeDir, 'settings.json')) || '{}')?.env || {}; } catch { e = null; }
    if (e === null) out['claude-code'] = 'own'; // settings Puddle can't read: never rewritten from here
    else if (String(e.JOULE || '').startsWith('joule:')) out['claude-code'] = String(e.OTEL_EXPORTER_OTLP_HEADERS || '').includes(`Bearer ${token}`) && e.OTEL_EXPORTER_OTLP_ENDPOINT === url ? 'connected' : 'stale';
    else out['claude-code'] = e.OTEL_EXPORTER_OTLP_ENDPOINT ? 'own' : 'missing';
  }
  // Codex: <codex home>/config.toml → Puddle's marked [otel] block with the key and address
  const codexHome = env.CODEX_HOME || path.join(home, '.codex');
  if (!exists(codexHome)) out.codex = 'absent';
  else {
    const t = read(path.join(codexHome, 'config.toml')) || '';
    const a = t.indexOf(CODEX_BEGIN);
    if (a >= 0) { const block = t.slice(a, t.indexOf(CODEX_END, a) >>> 0 || undefined); out.codex = block.includes(`Bearer ${token}`) && block.includes(`${url}/v1/logs`) ? 'connected' : 'stale'; }
    else out.codex = /^[ \t]*\[otel\]|^[ \t]*otel[ \t]*=/m.test(t) ? 'own' : 'missing';
  }
  return out;
}

// Connects what's missing or stale. connect(only) runs Puddle's own connect for 'claude' or 'codex'. A failed agent
// is tried again after RETRY, never in a loop. Returns what was done, for the log.
const RETRY = 6 * 3600_000, ONLY = { 'claude-code': 'claude', codex: 'codex' };
export function makeKeeper({ home, env = {}, credentials, connect, log = () => {}, onError = () => {}, now = () => Date.now() }) {
  const tried = {};
  let busy = false;
  return {
    state: () => { const c = credentials(); return c?.token && c?.url ? agentConnections({ home, env, ...c }) : null; },
    async keep() {
      if (busy || env.JOULE_DEV) return [];
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
