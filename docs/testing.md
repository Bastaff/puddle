# Which checks a change needs

Test what the change can break, nothing more. The full suite (`npm test`) is for releases. Some checks below exist only in the full, private repository; they say so.

```
npm run test:changed             # picks the tests for what you changed, says why, runs them
npm run test:changed -- --dry    # only says which it would run
npm run test:changed -- --since main   # everything since main, not just uncommitted work
```

It reads each test's imports, so a test runs when it uses a file you changed. Where it can't tell, it says what to
check by hand.

## By kind of change

| You changed | Run | Also |
|---|---|---|
| Words only: docs, README, CHANGELOG, comments in Markdown | nothing | |
| How a page looks: `collector/public/*.css`, card markup, chart drawing (`layout.js`, `shape.js`, `craft.js`, `person.js`, `prompts.js`, `you.js`, `calendar.js`, `lines.js`) | `npm run test:changed` (the page tests, about 9 files, including Me while the Mac is busy) | look at it in Puddle Dev. Full repository: `npm run test:layout` (about 10 min): the team page and Me at 7 widths in packed and freely placed layouts; Me again with the Mac-only parts (work and lines shipped, from `test/me-mac-data.js`) at 7, 30 and 90 days; and arranging Me by mouse, keys and on a phone. Then `npm run layout:sheet` |
| What a page fetches or does (`app.js`, `person.js`, `bar.js`) | `npm run test:changed` | Look at it in Puddle Dev (full repository: also the local website) |
| The Mac app (`companion-app/`) | no JS tests | `cargo check`, then `npm run dev:app` and use it |
| The helper (`companion/*.js`) | `npm run test:changed` | `npm run dev:app`: it isn't done until Puddle Dev runs it |
| The engine: reading logs, storing, counting (`collector/*.js`) | `npm run test:changed` (most of the suite: everything counts through it) | Speed, below, if it touches queries |
| The website (`service/`, full repository only) | `npm run test:changed` | |
| What leaves the Mac (`companion/mirror.js`, `cloud.js`, `DATA.md`) | `npm run test:changed` | Read `DATA.md` against the change |
| `package.json`, test helpers, `scripts/test.mjs` | `npm test` (everything) | |
| A release | `npm test` (everything) | the maintainers' release steps |

## Speed

A change meant to make Puddle faster, or one to `collector/queries.js`, `sql.js`, `db.js`, `rollup.js` or
`service/database.js`:

1. `npm run test:changed`.
2. Full repository: `npm run bench:real` before and after (`--code committed` for before), and an entry in the speed
   history, filled in a few days after it ships.

## Rules

- Never skip a test that `test:changed` picked because it looks unrelated: it uses the file.
- A failing test that passes alone was slowed by the rest of the run. Re-run that file alone before calling it broken.
- Heavy runs one at a time, under `nice`.
