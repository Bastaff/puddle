// Every coding agent Puddle knows, and what each of its clients can report: one list for the website, Puddle's own
// screens, the alarms and the Mac's setup report (docs/agents.md). Plain data, no file reading. A plain script
// (globalThis.JouleAgents); Node imports it through collector/agents.js.
//
// Per client (where a session ran: Claude Code's `entrypoint`, Codex's `originator`):
//   kind     app | terminal | editor | scripts (the sign after a person's name)
//   limits   where its plan limits come from: statusline (Puddle's status line), logs (the agent's own files),
//            app (the desktop app's record), none
//   titles   where its conversation titles come from: set (named by hand), app, generated, statusline, index
//   why      said when it can't report something (limits or titles), in words anyone reads
(() => {
  const AGENTS = [
    {
      id: 'claude-code', name: 'Claude Code', short: 'Claude', letter: 'C', ico: 'claude',
      aliases: ['claude'], // the Claude desktop app's plan readings (an older id)
      // the agent ids a plan reading may carry, and where it came from
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
        { id: 'Codex Desktop', label: 'Codex app', kind: 'app', limits: 'logs', titles: ['index'] }, // also sent as Codex_Desktop, codex_desktop
        ...['codex_cli_rs', 'codex-tui'].map((id) => ({ id, label: 'Codex terminal', kind: 'terminal', limits: 'logs', titles: ['index'] })),
        { id: 'codex_vscode', label: 'VS Code (Codex)', kind: 'editor', limits: 'logs', titles: ['index'] },
        ...['codex_exec', 'codex_sdk_ts'].map((id) => ({ id, label: 'Codex scripts', kind: 'scripts', limits: 'logs', titles: [] })),
        // the Codex app's own background work (suggestions, naming): started by the app, not typed by anyone. Told
        // apart when it starts (collector/codex.js); its calls count, it groups with scripted runs, not as projects
        { id: 'codex_background', label: 'Codex app, in the background', kind: 'scripts', limits: 'logs', titles: [] },
      ],
    },
  ];

  const byId = new Map();
  for (const a of AGENTS) { byId.set(a.id, a); for (const x of a.aliases || []) byId.set(x, a); }
  const clients = new Map(AGENTS.flatMap((a) => a.clients.map((c) => [c.id, { ...c, agent: a.id }])));
  // the same client spelled differently by different senders: Codex's live telemetry says "Codex_Desktop", its own
  // files "Codex Desktop" (21 Oct 2026). Case, spaces, _ and - don't make a different client.
  const fold = (v) => String(v || '').toLowerCase().replace(/[\s_-]+/g, '_');
  const folded = new Map([...clients.keys()].map((id) => [fold(id), id]));
  const canonical = (raw) => (raw == null || raw === '' ? raw : clients.has(raw) ? raw : folded.get(fold(raw)) || raw);
  // a client nobody listed yet (a new editor, a newer agent version): its kind from its name, nothing promised
  const guessKind = (v) => (/vscode|jetbrains|cursor|zed|windsurf|editor|ide/.test(v) ? 'editor' : /sdk|exec|action|script/.test(v) ? 'scripts' : /desktop|app/.test(v) ? 'app' : 'terminal');

  globalThis.JouleAgents = {
    list: AGENTS,
    // an agent by id (or an older alias); one Puddle doesn't know yet still shows, by its id, never as an error
    agent(id) {
      const a = byId.get(String(id || ''));
      if (a) return a;
      const s = String(id || 'agent');
      return { id: s, name: s, short: s, letter: s.charAt(0).toUpperCase() || '?', ico: 'other', clients: [], planSources: {}, unknown: true };
    },
    // a client by its raw id (entrypoint / originator); unknown ones get a kind from their name
    client(raw) {
      const v = String(raw || '');
      if (!v || v === 'unknown') return null;
      return clients.get(canonical(v)) || { id: v, label: v.replace(/^claude-/, ''), kind: guessKind(v.toLowerCase()), limits: null, titles: null, agent: null, unknown: true };
    },
    // a client's id as the catalogue spells it ("Codex_Desktop" → "Codex Desktop"); one it doesn't know stays as sent
    canonicalClient: canonical,
    // scripted or background runs: counted, but grouped together, never a project each
    isRun: (raw) => clients.get(canonical(String(raw || '')))?.kind === 'scripts',
    // the agent ids plan readings may carry (the helper and the website accept these only)
    planAgents: AGENTS.flatMap((a) => Object.keys(a.planSources)),
    // the short name for a plan reading's agent ("Claude", "Codex")
    planLabel: (agentId) => globalThis.JouleAgents.agent(agentId).short,
    // the agent a plan reading's source belongs to ("claude" and "claude-code" both read a Claude account)
    planTool: (agentId) => AGENTS.find((a) => agentId in a.planSources)?.id || String(agentId || ''),
  };
})();
