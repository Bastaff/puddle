# The team page: design

How the team page (`collector/public/app.js`, served by the website) is laid out and why: facts about how people work
with their agents, never judgements about people.

## Layout
- **Top bar:** the menu (Me, each team), the date range (1D, 7D, 30D, 90D), Arrange, learn mode (?), theme and Settings.
- **The cards**, which each person arranges for themselves (Arrange: move, size S/M/L/Full,
  hide; kept with their account, `collector/public/layout.js`): Team, Needs a look, Where the team is, Models · effort ·
  client, Active projects, Code changes, Tokens per day, Features in use, What the team does.
- **Details:** hover or tap anything; Learn mode explains every part in plain words.

## Purpose
Built for a project manager reading how a team uses Claude Code: facts about behaviour, not judgements about people. It keeps the warmth of the reference images (cream paper, ink outlines, pastel tints, tactile chunky edges) without characters or gamification.

1. **Team board**, the core. Each row is meant to be read without reading text:
   - **Right now:** a coloured tile with an icon showing what Claude is doing for that person (reading, editing, running commands, web, delegating to agents, MCP, or thinking), pulsing while they work. It turns grey when the person is idle or away.
   - **Activity lane:** one column per time slice across the range. Height is tool calls, on the same scale for everyone, and colour is the kind of work. Ink ticks are prompts and red marks are failures; a green line shows they are working now.
   - **Kind of work:** a stacked bar of tool calls by kind, plus the dominant kind.
   - **Prompts:** a volume bar on the team scale, with the change against the previous period.
   - **Hands-off:** ● your prompt followed by ○ one dot per step Claude took on its own. A long chain means the person delegates.
   - **Fails:** a ring whose red wedge is the tool failure rate.

   Sort by any header (working people come first by default). Click a row to focus the dashboard on that person, and hover any cell for the numbers.
2. **Needs a look** sits top-right on desktop, first on a phone and under the board on a tablet. The rules live in `collector/flags.js`. Each one needs enough data, compares against the person's own rhythm or the rest of the team, and stays silent when unsure:

   | Flag | Fires when | Never fires for |
   |---|---|---|
   | Quiet | 4+ working days without prompts (in their time zone), longer than twice their usual longest break, from someone active on 12+ of the 20 working days before | weekends, short holidays, occasional users |
   | Broken tool | one tool or connector fails ≥60% of ≥6 calls, ≥3× the norm for it | a few unlucky failures |
   | Failures | overall tool failure rate ≥10%, ≥2× and statistically above (z ≥ 3) what the rest of the team sees for the same tools, ≥20 calls | Bash-heavy work where failing tests are normal |
   | Stuck | Claude retried the same failing step 4+ times in a row, in 2+ prompts | a single bad prompt |
   | Hook | a hook errored on ≥80% of ≥3 runs | |
   | Rate limit / auth | ≥5 rate-limit errors (or ≥3 at ≥1% of requests); ≥2 login/permission errors | Anthropic-side overloads (retried automatically) |
   | Plan limit | 80%+ of the 5-hour or weekly limit (status line, Pro/Max) | |
   | Friction | >2 hand approvals per prompt, ≥30 in total, ≥10 prompts | |
   | Rejects | rejects ≥25% of the actions Claude asks for, ≥8 rejects | |
   | Context | auto-compaction in about every other session or more, ≥3 times | the odd long session |
   | Heavy prompts | tokens per prompt ≥3× their own previous 28 days | simply doing more work |
   | Old version | Claude Code ≥10 patch releases (or a minor version) behind the team's newest | single-person installs |

   **Accuracy:** rate each flag with ✓ (useful) or ✕ (not an issue). ✕ hides that flag for that person for 14 days. The card footer shows the share rated useful, and hovering it gives a breakdown by kind, so the 90% target is measured on your team rather than assumed.

   **Synthetic check:** `node scripts/flag-eval.js 10` builds 10 random demo teams with planted problems, plus decoys that must stay silent (an occasional user's normal breaks, a holiday, normal Bash failures, the odd long session) and reports precision and recall. Current result: 100% / 100%. The demo team shows one example of each planted problem.

3. **Person focus:** the avatar chips in the top bar (or a board row, map pin or flag) focus one person. The features, work mix, models and flags then describe only them, and the board dims everyone else. Click ✕ on the name chip to go back to everyone.
4. **Features in use:** one row per feature (skills, MCP, subagents, web, edits, @-mentions, plugins), showing how many people use it and who. With a person focused, it shows how often that person used each one.
5. **Map** (no header, edge to edge), framed around the team's cities. Pins never overlap; they are nudged apart with a thin line back to their city.
6. **Team tokens** over time, **What the team does** (work mix and top tools), **Rhythm** and **Models · effort · client**.

**Counting rules:**
- Sessions count only if they contain a human prompt, so the desktop app's background helper sessions don't inflate them.
- An `excluded_sessions` table can hide sessions from every view. It's empty by default, so test runs count as usage.

**Team privacy (aggregate only):**
- Tool names, counts, success and timing are stored per person.
- Tool inputs, commands, file paths and tool error text are **never stored**. They are stripped on ingest, from session-log recovery and from the raw archive, and were removed from existing data.
- Prompt and response text are never stored either; only lengths are.
- Tell your team what is collected. The dashboard shows *how* people use Claude Code, never *what* they asked.

**Learn mode** (the **?** button, top right): every tooltip gets a plain-language explanation underneath, and parts of the page that have no tooltip of their own get one. Card titles are underlined to show you can hover them. It covers:
- **Tools:** built-in tools, e.g. *Bash: runs a command in the terminal*. MCP tool names are decoded, e.g. `Claude_Browser__browser_batch` → *the browser built into the Claude desktop app; runs several steps in one go*.
- **Everything else:** every board column, kind of work, flag, feature, model, effort level and client.

It is off by default and remembered per browser.

**Motion** (`collector/public/motion.js`): every animation is a spring, simulated once and played by the browser as a CSS `linear()` curve, so it costs no JavaScript per frame.
- **Physics, kept calm:** springs are nearly critically damped (about 2% overshoot). Activity tokens travel on a low arc that is clamped to the screen, and the number they reach gives one soft nudge. Digits roll and settle, bars glide, and rows slide into their new order. There is no confetti.
- **No restarts:** the team board and map update in place. Live updates only touch the cells that changed, so pulses keep their rhythm.
- **Motion budget:**
  - *full* normally.
  - *lite* when power saving is detected: the frame rate is capped at ~30 fps (Low Power Mode on iPhone, iPad and Mac), or the battery is at or below 20% and not charging. Lite drops flights, particles and looping pulses but keeps meaningful changes.
  - *off* when the tab is in the background or "reduce motion" is on.
- **Background tabs:** nothing renders. With sounds on, only the latest events are fetched so you still hear who is working, and the page catches up in one go when you come back, without replaying the backlog.

**Sounds** are off by default (speaker icon to enable). Each person has their own voice, a different pitch and timbre, so you can tell who is working by ear. Clicking a person's chip plays their voice.

**Demo team:** ⋯ → *Demo team*, or open `http://127.0.0.1:4400/?demo=1`.
- Nine synthetic people in seven countries, each with a distinct way of working: a builder, an operator with many failures, a delegator, a researcher, an MCP-heavy user, someone who stopped, a new hire approving everything by hand, and a spike.
- It covers 35 days of history. While the page is open, a live simulator keeps the people who are in their working hours prompting.
- It lives in its own database file (`joule-demo-<pid>.db` in the website's data folder), so real data is never touched. A striped **DEMO** badge shows in the top bar; click it to return.
- *Reset* regenerates the demo, and *Run test* and *Recover* are hidden while it is on.

## Visual feedback
Every new event is shown, not just heard:
- **Flights:** a small token lifts off from the person who caused it (map pin, avatar or filter chip) and arcs to what it changes:
  - ✎ prompt, ⚡ answer and ⚙ tool → that person's row on the board
  - ✕ failure → that person's row on the board, with a soft red shake
  - ↻ recovery → health pill
- **Landing:** the sound plays the moment a token lands. The target glows in the event's colour, and a `+value` floats up.
- **Team list:** active people glide to the top, with a breathing chip showing what they're doing right now.
- **Limits:** at most 7 tokens per update, 230ms apart. With "reduce motion" switched on in the system settings, there are no flights or sparkles; the glows, floats and sounds remain.

## Sounds
Soft tones synthesized in the browser (no audio files):
- prompt sent: a rising pair
- Claude answered: a tiny tick
- tool ran: a wooden tap
- failure: a low falling pair
- recovered data: a chime
- test passed: an arpeggio
- data deleted: a slide down

Each is under half a second, very quiet and low-pass filtered. At most two sounds play per update, the same sound at most once every 0.6 seconds, and the constant "answered" ticks are skipped while the tab is hidden. The speaker icon in the top bar mutes them, and the setting is remembered. Browsers only allow audio after your first click or key press on the page.
