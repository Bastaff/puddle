# What Puddle reads, keeps and sends

Puddle counts how you work with your coding agents. It never reads, keeps or sends your conversations: no prompts, no
answers, no code, no commands, no file contents, no file paths. The only words from your work it keeps are names, so
your work can be told apart: each project's folder and repo name, each conversation's title as Claude Code shows it,
and the names of the tools the agent used (all below).

Every claim on this page points at the code that makes it true. If you find a place where the code does more than
this page says, that's a bug: please [report it](SECURITY.md).

## Without signing in: nothing leaves your Mac

**What Puddle reads:**
- **Claude Code's session logs** (`~/.claude/projects/…`).
- **Codex's session logs** (`~/.codex/sessions/…`).
- **The account files of both** (`~/.claude.json`, `~/.codex/auth.json`), for the plan you're on and the account's name.

**What it keeps:**
- **Timings, counts and names**, in a database on your Mac (`~/.puddle/personal.db`): when you worked, which model, how many tokens, what it cost, which tool ran and whether it worked, how long a prompt was.
- **Text is dropped as it's read** (`collector/otlp.js` `eventRow`, `collector/backfill.js`).
- **For tool runs:** what was run or opened is never stored, only the tool's name (`TOOL_DETAIL_KEYS`).

**The Me page** is served by Puddle's helper on `127.0.0.1` and loads nothing from the internet. Its map and charts are vendored (`collector/public/vendor/`).

**The one request** Puddle makes before you sign in: every 15 minutes it asks the update server whether a newer version exists (`companion/update.js`). That request carries nothing about you.

## When you sign in

Signing in (email code) is optional. You need it to share a live page, join a team or appear on a leaderboard. After that, Puddle sends the following to the Puddle website (`companion/cloud.js`, `companion/mirror.js`, `plugin/bin/puddle`).

| What | When | Fields |
|---|---|---|
| **Your agents' own usage reports.** Claude Code and Codex send OpenTelemetry events straight to the website. | As you work | The events Claude Code and Codex emit, with prompt and answer logging switched **off** (`OTEL_LOG_USER_PROMPTS=0`, `log_user_prompt = false`). They include your agent account's email and id: the website deletes both on arrival and keeps a 16-character fingerprint of the account. That part runs on the website, whose code isn't in this repository. |
| **History from before you connected**, so your page isn't empty | Every 30 s, the last 90 days, until sent | Only the allow-listed fields in `SENT` (`companion/mirror.js`): the event's name, time, session id, the ids that prevent double counting, model, tokens, cost, duration, success, tool name, prompt length, your time zone and country (the Mac's region), and the account as a fingerprint. Anything else stays on the Mac, and a test checks it (`test/mirror-fields.test.js`). |
| **Which project a conversation was in** | Every 2 min, for new or renamed conversations | Session id; the repo's address with any credentials removed (e.g. `github.com/acme/app`); the folder's name; the conversation's title as Claude Code shows it (its own generated title, or the name you gave it, never a prompt); the account fingerprint and plan, and the company's name for Team/Enterprise plans only. |
| **Plan limits** | When they change | How much of your 5-hour, weekly and monthly limits is used, and when they reset; the account as a fingerprint. |
| **A health check-in** | Every 2 min | Puddle's version; how many conversations each app (terminal, desktop, IDE) had this week and how many had a title; error counts by kind; whether each agent is connected; what Puddle itself cost the Mac in the last day (its CPU %, memory, longest freeze, how much session log it read and how long that took, the total size of those logs, status line runs). Never which conversations they were. |
| **This Mac's name** | Once, when signing in | Your macOS user name (or the computer's name, from the `puddle` command), so you can tell your devices apart in Settings. Only you see it. |

### What signing in changes on your Mac

To get those reports, Puddle switches them on in your agents' own settings (`plugin/bin/puddle` `connect`). Without
an account none of this happens.

- **Claude Code** (`~/.claude/settings.json`):
  - An `env` block turns on its usage reports and sends them to Puddle with this Mac's key. Prompt and answer logging
    stays off.
  - The reports carry your time zone and country. Your country comes from the Mac's region setting.
  - Its status line becomes Puddle's, so Puddle can read your plan limits. Puddle's status line runs the one you had
    before, if any, so you see the same thing.
  - The file is backed up first, to `~/.puddle/claude-settings.backup`.
- **Codex** (`~/.codex/config.toml`): a marked `[otel]` block (`# >>> puddle … <<< puddle`) with the same address and
  key, and `log_user_prompt = false`. The original file is backed up to `~/.puddle/codex-config.backup`.
- **Kept in place:** Puddle checks every 10 minutes that each agent is still connected, and connects one that isn't
  (for example Codex used for the first time) (`companion/connections.js`). An agent that already sends its reports
  somewhere else is left alone.
- **Undone by signing out** (or `puddle off`): your status line and settings go back to how they were.

**What you share is your choice:**
- **A team** sees only the accounts and projects you chose to share when you joined.
- **A public page** shows only the cards of Me you switch on (Share live, or Settings → Sharing). Three can show names
  from your work, said next to their switch: Recent conversations (their titles and projects), Code changes (project
  names), and What the agent worked on or Needs a look (tool names). Nothing else you or the agent wrote is ever on it.
  Under your name it shows a short line you write yourself (80 characters at most), or, if you leave it empty, one
  Puddle writes from those cards (like "Daytime builder · 24 days in a row").

**Signing out** disconnects your agents and stops all of the above.

## Where it goes

The Puddle website runs on Google Cloud in Frankfurt (`europe-west3`). It isn't part of this repository; what it receives is exactly what is listed above.
