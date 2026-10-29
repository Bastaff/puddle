# Contributing

Thanks for helping. What gets merged quickly, and what needs to come with it.

## Rules that never bend

- **Counts, lengths and timings only.** Nothing Puddle stores or sends may contain what someone wrote: no prompt or
  answer text, code, commands, file paths or file contents. A change that adds a field to an upload also adds it to
  [DATA.md](DATA.md), with the code that sends it.
- **No new places the app talks to.** Pages load nothing from other sites (libraries are vendored in
  `collector/public/vendor/`).
- **Nobody is ever asked to restart, reinstall or reload.** A change takes effect on Macs that already run Puddle, by
  itself.

## Welcome

- **Bug reports** with what you did, what you expected and what happened.
- **A new agent** (Cursor, Gemini CLI, …): follow [docs/agents.md](docs/agents.md). Open an issue first, so two people
  don't build the same one.
- **Fixes** for anything in the issue tracker.

Bigger changes to how Puddle looks or what it counts: please open an issue to talk about it before you build.

## Working on it

```bash
npm ci
npm test            # all tests, a minute or two
npm run dev:app     # builds and installs Puddle Dev ("DEV" in the menu bar) next to Puddle
```

Puddle Dev keeps its own data (`~/.joule-dev`) and never touches your agents' settings, so you can try anything.
Every change comes with a test that fails without it.

Write code like the code around it: the same naming, the same density of comments, comments that say why rather than
what.

## Pull requests

One change per pull request, with a sentence on what it changes for someone using Puddle. Tests pass (`npm test`), and
the menu bar app still builds (`npm run dev:app`).
