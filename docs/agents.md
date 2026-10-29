# Adding a coding agent to Puddle

Puddle reads each coding agent through one adapter. A new agent is four things:

1. **Its adapter**, `companion/agents/<id>.js`, registered in `companion/agents/index.js`.
2. **Its catalogue entry** in `collector/public/agents.js`: names, icon, clients, and what each client can report.
3. **Its fixture** in `test/agents.test.js`.
4. **Keeping it connected:** `companion/connections.js` checks each agent at start and every 10 minutes and connects
   one that's missing or holds an old key (`plugin/bin/joule connect`, with `JOULE_ONLY=<id>`). A new agent needs its
   case there (where its settings live, how to tell Puddle's block from someone else's) and in `cmd_connect`.

The board, sharing, "Needs a look", the Mac's setup report and the error table then work without other changes.
`test/agents.test.js` checks the first three; `test/connections.test.js` the fourth.

## The privacy rule (never bend it)
- **What may leave an adapter:** counts, lengths, times, ids, folder and repo names, and conversation titles: a name someone gave a conversation, or the agent's own generated title.
- **What never leaves it:** prompts, answers, code, file contents or tool arguments.
- **A "title" that is really a prompt is not a title.** For example, an app that names a conversation by its first or last prompt. The contract test puts a secret prompt in every fixture and fails if it shows up anywhere in the scan.

## The adapter
```js
export default {
  id: 'my-agent',                       // the same id as in the catalogue
  detect(home, env) → { installs: [{ kind, path }], homes: [{ dir, account, telemetry }], managed: boolean },
  context(home, env, homes) → { extraAccounts: [{ account, dir }], ... },   // anything sessions() needs
  sessions(home, since, ctx, { titles }) → [{ id, tool, account, cwd, repo?, times: [ms], prompts, surface, title, titleSource }],
  plans?(userHome, now, sessions) → [{ agent, org, five_pct, five_reset, week_pct, week_reset, month_pct, month_reset, ts }],
  place?(cwd) → { key, type, label } | null,   // a kind of place only this agent makes (Codex's quick chats)
  blindSpot?: 'My agent cloud runs',           // work this Mac can't see
};
```

### Fields
- **`account`:** `{ kind: work | personal | unknown | api, id, plan, org }`. `kind: 'work'` only when the agent's own account data says so (a team or business plan). A work account is never guessed.
- **`surface`:** the client the session ran in, using the agent's own value (Claude Code's `entrypoint`, Codex's `originator`). Every value must be a client in the catalogue.
- **`titleSource`:** one of
  - `set`: named by hand;
  - `app`: the agent's app named it;
  - `generated`: the agent wrote a title;
  - `statusline`: from Puddle's status line;
  - `index`: from the agent's own index of names.

  Leave `title` null rather than use a prompt.
- **Plan readings:** they carry an `agent` id listed in the catalogue's `planSources`. The helper (`companion/plan.js`) and the website (`/api/plan`) accept only those ids.

## The catalogue entry
```js
{ id: 'my-agent', name: 'My Agent', short: 'Agent', letter: 'M', ico: 'other', planSources: { 'my-agent': 'its logs' },
  clients: [
    { id: 'my-agent-cli', label: 'terminal', kind: 'terminal', limits: 'logs', titles: ['generated'] },
    { id: 'my-agent-ide', label: 'VS Code', kind: 'editor', limits: 'none', titles: [],
      why: { limits: "Its editor extension doesn't report plan limits", titles: '…' } },
  ] }
```

### Client fields
- **`kind`:** `app | terminal | editor | scripts`. This is the sign after a person's name.
- **`limits`:** `statusline | logs | app | none`. What it is decides what the board shows:
  - with `none`, the Limits ring is a dotted "unknown" and its tooltip says `why.limits`;
  - with `statusline`, a missing status line raises an alarm.
- **`titles`:** the title sources this client can have. `why.titles` explains when titles are usually missing.

### Unknown agents and clients
- A newer Puddle may report an agent or a client the website doesn't know yet. The website shows it by its id, with a neutral icon, and promises nothing about it.
- So add the catalogue entry, deploy the website first, then publish the app.

## Live activity
- **Live events arrive as OpenTelemetry** (`/v1/logs`, parsed in `collector/otlp.js`). An agent whose events aren't Claude Code's gets a translator, like `collector/codex.js`, that turns them into the same rows with the same tool names.
- **History from the agent's own files** fills the gaps (`collector/backfill.js` for Claude Code, `collector/codex-backfill.js` for Codex).
- **Each row's `agent` column holds the catalogue id.**

## Before shipping
- `npm test`. The contract test must pass with the new fixture.
- Puddle Dev (`npm run dev:app`) with the agent installed: its sessions show up in Me, with the right kind of work.
- Nothing new is stored or sent that [DATA.md](../DATA.md) doesn't list: tool calls keep their name only, never their input or output.
