# What Puddle reads, keeps and sends

Puddle counts how you work with your coding agents. It never reads, keeps or sends what you or the agent wrote:
no prompts, no answers, no code, no commands, no file contents, no file paths.

Every claim on this page points at the code that makes it true. If you find a place where the code does more than
this page says, that's a bug: please [report it](SECURITY.md).

## Without signing in: nothing leaves your Mac

**What Puddle reads:**
- **Claude Code's session logs** (`~/.claude/projects/…`).
- **Codex's session logs** (`~/.codex/sessions/…`).
- **The account files of both** (`~/.claude.json`, `~/.codex/auth.json`), for the plan you're on and the account's name.

**What it keeps:**
- **Timings, counts and names**, in a database on your Mac (`~/.joule/personal.db`): when you worked, which model, how many tokens, what it cost, which tool ran and whether it worked, how long a prompt was.
- **Text is dropped as it's read** (`collector/otlp.js` `eventRow`, `collector/backfill.js`).
- **For tool runs:** what was run or opened is never stored, only the tool's name (`TOOL_DETAIL_KEYS`).

**The Me page** is served by Puddle's helper on `127.0.0.1` and loads nothing from the internet. Its map and charts are vendored (`collector/public/vendor/`).

**The one request** Puddle makes before you sign in: every 15 minutes it asks the update server whether a newer version exists (`companion/update.js`). That request carries nothing about you.

## When you sign in

Signing in (email code) is optional. You need it to share a live page, join a team or appear on a leaderboard. After that, Puddle sends the following to the Puddle website (`companion/cloud.js`, `companion/mirror.js`, `plugin/bin/joule`).

| What | When | Fields |
|---|---|---|
| **Your agents' own usage reports.** Claude Code and Codex send OpenTelemetry events straight to the website. | As you work | The events Claude Code and Codex emit, with prompt and answer logging switched **off** (`OTEL_LOG_USER_PROMPTS=0`, `log_user_prompt = false`). They include your agent account's email and id: the website deletes both on arrival and keeps a 16-character fingerprint of the account (`service` `claim()`). |
| **History from before you connected**, so your page isn't empty | Every 30 s, the last 90 days, until sent | Only the allow-listed fields in `SENT` (`companion/mirror.js`): the event's name, time, session id, the ids that prevent double counting, model, tokens, cost, duration, success, tool name, prompt length, and the account as a fingerprint. Anything else stays on the Mac, and a test checks it (`test/mirror.test.js`). |
| **Which project a conversation was in** | Every 2 min, for new or renamed conversations | Session id; the repo's address with any credentials removed (e.g. `github.com/acme/app`); the folder's name; the conversation's title as Claude Code shows it (its own generated title, or the name you gave it, never a prompt); the account fingerprint and plan, and the company's name for Team/Enterprise plans only. |
| **Plan limits** | When they change | How much of your 5-hour, weekly and monthly limits is used, and when they reset; the account as a fingerprint. |
| **A health check-in** | Every 2 min | Puddle's version; how many conversations each app (terminal, desktop, IDE) had this week and how many had a title; error counts by kind; whether each agent is connected. Never which conversations they were. |
| **This Mac's name** | Once, when signing in | Your macOS user name (or the computer's name, from the `joule` command), so you can tell your devices apart in Settings. Only you see it. |

**What you share is your choice:**
- **A team** sees only the accounts and projects you chose to share when you joined.
- **A public page** shows only the counts and times you switched on.

**Signing out** disconnects your agents and stops all of the above.

## Where it goes

The Puddle website runs on Google Cloud in Frankfurt (`europe-west3`). It isn't part of this repository; what it receives is exactly what is listed above.
