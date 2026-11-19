(() => {
  const AGENTS = [
    {
      id: 'claude-code', name: 'Claude Code', short: 'Claude', letter: 'C', ico: 'claude',
      aliases: ['claude'],
      planSources: { 'claude-code': 'status line', claude: 'Claude app' },
      clients: [
        { id: 'cli', label: 'terminal', kind: 'terminal', limits: 'statusline', titles: ['set', 'generated', 'statusline'] },
        { id: 'claude-vscode', label: 'VS Code', kind: 'editor', limits: 'none', titles: ['set', 'generated'],
          why: { limits: "VS Code doesn't report plan limits: they show when Claude is used in the terminal or the Claude app",
            titles: 'VS Code names some conversations by their last prompt, which Puddle never sends' } },
        { id: 'claude-jetbrains', label: 'JetBrains', kind: 'editor', limits: 'statusline', titles: ['set', 'generated', 'statusline'] },
        { id: 'claude-desktop', label: 'Claude app', kind: 'app', limits: 'app', titles: ['set', 'app'] },
        ...['sdk-cli', 'sdk-ts', 'sdk-py'].map((id) => ({ id, label: 'scripts', kind: 'scripts', limits: 'none', titles: [],
          why: { limits: 'Scripts (claude -p, the SDK) report no plan limits', titles: 'Scripts (claude -p, the SDK) get no title' } })),
      ],
    },
    {
      id: 'codex', name: 'Codex', short: 'Codex', letter: 'X', ico: 'codex',
      planSources: { codex: 'Codex logs' },
      clients: [
        { id: 'Codex Desktop', label: 'Codex app', kind: 'app', limits: 'logs', titles: ['index'] },
        ...['codex_cli_rs', 'codex-tui'].map((id) => ({ id, label: 'Codex terminal', kind: 'terminal', limits: 'logs', titles: ['index'] })),
        { id: 'codex_vscode', label: 'VS Code (Codex)', kind: 'editor', limits: 'logs', titles: ['index'] },
        ...['codex_exec', 'codex_sdk_ts'].map((id) => ({ id, label: 'Codex scripts', kind: 'scripts', limits: 'logs', titles: [] })),
        { id: 'codex_background', label: 'Codex app, in the background', kind: 'scripts', limits: 'logs', titles: [] },
      ],
    },
  ];

  const byId = new Map();
  for (const a of AGENTS) { byId.set(a.id, a); for (const x of a.aliases || []) byId.set(x, a); }
  const clients = new Map(AGENTS.flatMap((a) => a.clients.map((c) => [c.id, { ...c, agent: a.id }])));
  const fold = (v) => String(v || '').toLowerCase().replace(/[\s_-]+/g, '_');
  const folded = new Map([...clients.keys()].map((id) => [fold(id), id]));
  const canonical = (raw) => (raw == null || raw === '' ? raw : clients.has(raw) ? raw : folded.get(fold(raw)) || raw);
  const guessKind = (v) => (/vscode|jetbrains|cursor|zed|windsurf|editor|ide/.test(v) ? 'editor' : /sdk|exec|action|script/.test(v) ? 'scripts' : /desktop|app/.test(v) ? 'app' : 'terminal');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MARKS = {
    'claude-code': { c: '#d97757', svg: '<path d="M8 .9 9.1 6 13 2.6 10.4 7.1l5.1.4-5 1.3 3.8 3.5-4.7-2.2.3 5.2L8 10.6l-1.9 4.7.3-5.2-4.7 2.2 3.8-3.5-5-1.3 5.1-.4L3 2.6 6.9 6z"/>' },
    codex: { c: 'var(--ink)', svg: '<path d="M8 .8 14.3 4.4v7.2L8 15.2 1.7 11.6V4.4z" opacity=".22"/><path d="M8 2.6 12.7 5.3v5.4L8 13.4 3.3 10.7V5.3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m5.8 6.4 1.9 1.6-1.9 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.4" y="9.1" width="2.4" height="1.4" rx=".7"/>' },
  };
  globalThis.PuddleAgents = {
    mark(id, size = 12, mono = false) {
      const m = MARKS[id] || { c: 'var(--muted)', svg: `<circle cx="8" cy="8" r="7" opacity=".25"/><text x="8" y="11.3" text-anchor="middle" font-size="9.5" font-weight="800">${esc(globalThis.PuddleAgents.agent(id).letter || '?')}</text>` };
      return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="currentColor" style="color:${mono ? 'currentColor' : m.c}" aria-hidden="true">${m.svg}</svg>`;
    },
    list: AGENTS,
    agent(id) {
      const a = byId.get(String(id || ''));
      if (a) return a;
      const s = String(id || 'agent');
      return { id: s, name: s, short: s, letter: s.charAt(0).toUpperCase() || '?', ico: 'other', clients: [], planSources: {}, unknown: true };
    },
    client(raw) {
      const v = String(raw || '');
      if (!v || v === 'unknown') return null;
      return clients.get(canonical(v)) || { id: v, label: v.replace(/^claude-/, ''), kind: guessKind(v.toLowerCase()), limits: null, titles: null, agent: null, unknown: true };
    },
    canonicalClient: canonical,
    isRun: (raw) => clients.get(canonical(String(raw || '')))?.kind === 'scripts',
    planAgents: AGENTS.flatMap((a) => Object.keys(a.planSources)),
    planLabel: (agentId) => globalThis.PuddleAgents.agent(agentId).short,
    planTool: (agentId) => AGENTS.find((a) => agentId in a.planSources)?.id || String(agentId || ''),
  };
})();
