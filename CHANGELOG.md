# Changelog

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
