# Security

## Reporting a problem

Please don't open a public issue. Use **Report a vulnerability** in this repository's **Security** tab: only the
maintainers see it.

Tell us the Puddle version (at the bottom of Settings → This Mac), your macOS version, what happens, and how to make
it happen. Leave out tokens, device keys (`~/.puddle/token`), and anything from your own agent sessions.

Puddle's promise is that it never sends your conversations: only counts, timings and the few names
[DATA.md](DATA.md) lists. **Anything that breaks that promise is a security issue**, even a small one: a field in an upload that [DATA.md](DATA.md) doesn't list, a log line that keeps a path, a
page that loads something from elsewhere.

## Supported versions

The latest release. Puddle updates itself, so that's what almost everyone runs.

## Known limits

- Official builds are signed with Puddle's Apple Developer ID (team `QTZU933VL4`) and notarized by Apple. A Puddle
  signed that way installs only updates signed by the same team (`TEAM` in `companion/update.js`). The very first
  update from an older, ad hoc signed Puddle (0.0.1) can't make that check yet; from then on it holds.
- Your device key (`~/.puddle/token`) is readable by your own user account, as the agents' settings files are.
