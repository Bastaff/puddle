# Changelog

## 0.0.6

- **Setting up looks like Me:** from signing in to All set, every step is made of Me's tiles. Empty tiles shimmer
  where your numbers will land, each agent Puddle finds lands as a tile with its sessions and projects, the code you
  type fills six squares, and All set shows your tokens, busiest hour, streak and biggest day as four tiles at once
  instead of one after another.
- **Me keeps up with less work:** when new work comes in, Puddle now recounts only the last few minutes that changed
  instead of all your history, so your Mac does about a fifth of the counting it did.
- **Me on the website opens at once:** it shows the last answer straight away and freshens a moment later, and when
  several teammates open it together the website works it out once for all of them.
- **Me opens instantly every time after the first:** Puddle keeps Me's last answer and shows it at once, then works
  out the new numbers on the side, once, and swaps them in. Everything else in Puddle stays quick while it counts.
- **Puddle no longer stops on its own:** when it was catching up on new work and noting that it was still running at
  the same moment, the two collided and Puddle stopped, leaving Me stuck for up to a minute, sometimes several times
  in a row. Now one waits for the other. Each Mac also counts these stops (just how many, and the error's code) so we
  can see they're gone.
- **Me is a grid of tiles you place yourself:** drag a card to any spot (empty space is fine) and pull its corner to
  resize it, from one tile up to four across and two down. Each card draws its own picture for its size (a ring, day
  squares, the hours of a usual day), so even the small ones read at a glance. Me opens on the last 7 days.
- **Me opens straight away:** it shows your last numbers at once, with a small "Updating…" until the latest arrive.
  On the very first open each tile shows a moving picture of its card while your Mac counts. A slow website is no
  longer reported as "No internet".
- **The front page no longer plays a made-up demo.**
- **Your Me layout stays put when you're signed in:** it used to go back to the start each time it was loaded from
  your account.
- **Charts read in whole steps:** the last 24 hours is 24 hourly bars, a week is whole days, and every chart starts
  and ends on the clock (14:00, not 14:02).
- **Me, rebuilt around your work, at magazine scale:** big numbers, fat bars and one picture per card, all on the
  period you pick (7, 30 or 90 days). Today against a usual day; You and the agent (each day split into the time your
  agents worked and the time they waited on you); What you built (web, iOS app or code, with the checks, builds and
  edits behind each, and the languages edited); Shipped (lines added as a running total, with commits, pushes and
  deploys); Days, Leverage, Your week and Hands-off. Plan limits sit in a small ring at the top.
- **Two new labels, kept on your Mac only:** the kind of each command an agent ran (test, build, commit, push, deploy)
  and the type of each file it edited (`.js`, `.swift`, …). Never the command or the path, and never uploaded.
- **Codex counts right:** compressed Codex sessions are found again, and Codex's automatic reviewer no longer counts
  as your work.
- **Your shared page shows what you've achieved:** an orange name card, then one tile per record from the last 30
  days: lines shipped, best streak, biggest prompt, agents at once, hands-off and agent hours. It no longer shows
  project or tool names, and Needs a look is no longer on it.
- **Reset a page's layout:** while arranging, Reset puts the cards back in the order and sizes Puddle starts with,
  hidden ones included.
- **Every layout fills the window:** cards sit in rows in the order you chose, each row as wide as the window and its
  cards as tall as each other, whatever sizes you pick. Charts grow into the room they get, a long list beside shorter
  cards shows what fits and scrolls the rest, and nothing is cut off or shrunk below readable at any window size.
- **Better starting layouts** for Me and the team page, so cards of a similar height share a row.
- **New and empty pages say what's coming:** a team with only you offers Invite people; the map, models and calendar
  say what fills them in; Me says when it's waiting for Puddle on this Mac and keeps trying.
- **Puddle is in ⌘Tab and the Dock while its window is open**, and goes back to the menu bar alone when you close it.
- **Lighter logo files** on every page.
- **Tidier inside:** the old team timeline, the plain-words summary and five unused endpoints are gone, so team pages
  ask the database for less.

## 0.0.5

- **Opening Puddle after days away is quick:** catching up on the days you missed happens in the background, so
  the app and Me answer at once instead of freezing for seconds.
- **Catching up sends far less:** session details go up in batches, a hundred at a time, instead of one by one.
- **Team pages open at once** with the last numbers, then freshen in place.

## 0.0.4

- **Pages load faster and never jump:** every page draws its cards right where they end up, at their final size, and
  each one fades in as its numbers arrive. Going back to a page you just saw shows it at once and freshens it in place.
- **The map is there straight away** and zooms to your team when everyone's location is in.
- **All your teams in the top bar** when the window is wide enough.
- **Check for updates** in the menu bar menu and in Settings → This Mac.
- **The popover fits its content,** so the update notice is never cut off.
- **No more flicker of the Puddle name** when switching between Me and a team.

## 0.0.3

- **No more slowdowns from long conversations:** a conversation whose log grew past 512 MB made Puddle use over a
  gigabyte of memory and try again on every change, and stopped your other conversations being read. Logs are now
  read a piece at a time.
- **Website:** a team page left open no longer shows up as a slow request, and the demo gives each teammate their own
  hours.

## 0.0.2

- **Signed and notarized:** Puddle now carries its Apple Developer ID and opens without a warning, and it installs
  only updates signed by the same team.
- **Clearer about what it changes:** signing in now says it switches on Claude Code's and Codex's own usage reports
  (and its status line in Claude Code), and DATA.md lists exactly what is written where. **Remove Puddle…** in the
  menu bar menu puts it all back.
- **Teams are free during the beta.**
- **Charts cover exactly the range you pick:** 1D is the last 24 hours, and the project page has a real time axis.
- **Prompt by prompt:** every prompt of the last 15 minutes to 24 hours, its tokens and how full the conversation got.
- **The same controls on every page,** a status in words, an offline state, and loaders instead of blank pages.
- **No white flashes in dark mode;** the window remembers where you put it and opens again after a restart.
- **More accurate:** error counts and the freeze meter no longer overcount after sleep.

## 0.0.1

The first public version.

- The menu bar app for macOS (Apple silicon): today's time with agents, a week against a usual day, what the agent
  worked on, how it went, your rhythm and your plan limits. Claude Code and Codex.
- Works without an account: your history is read from the agents' own session logs, on your Mac.
- Sign in (optional) to share a live page or join a team.
- Updates itself.
