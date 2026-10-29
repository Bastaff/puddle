# Working on Puddle (for coding agents)

Puddle is a Mac menu bar app that counts how someone works with their coding agents (Claude Code, Codex). Read
[README.md](README.md) for what it does and [DATA.md](DATA.md) for what it may read, keep and send.

## Never

- Store, log or send prompt or answer text, code, commands, file paths or file contents. Counts, lengths and timings
  only. Tool calls keep the tool's name, never its input or output (`TOOL_DETAIL_KEYS` in `collector/otlp.js`).
- Add a field to anything that leaves the Mac without adding it to `DATA.md`. History uploads send only the fields in
  `SENT` (`companion/mirror.js`).
- Load anything in a page from another site.
- Ask the person to restart, reinstall or reload: changes must take effect on running Macs by themselves.

## Where things are

- `collector/`: the engine (`otlp.js` and `codex.js` read telemetry, `backfill.js` and `codex-backfill.js` read
  session logs, `db.js` and `rollup.js` store, `queries.js` counts) and the pages (`public/`).
- `companion/`: the helper bundled in the app: `scan.js` finds the agents, `connections.js` keeps them connected,
  `personal.js` serves Me, `cloud.js` and `mirror.js` talk to the website after sign-in, `update.js` updates.
- `companion-app/`: the menu bar app (Rust, Tauri).
- `plugin/`: the `joule` command and the plugin for Claude Code and Codex.
- Adding an agent: [docs/agents.md](docs/agents.md).

## Checking a change

`npm test`, then `npm run dev:app` and look at it in Puddle Dev. Write code like the code around it.
