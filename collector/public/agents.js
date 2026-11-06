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

  globalThis.PuddleAgents = {
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
