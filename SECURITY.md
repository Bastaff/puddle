# Security

## Reporting a problem

Please don't open a public issue. Use **Report a vulnerability** in this repository's **Security** tab: only the
maintainers see it.

Tell us the Puddle version (at the bottom of Settings → This Mac), your macOS version, what happens, and how to make
it happen. Leave out tokens, device keys (`~/.joule/token`), and anything from your own agent sessions.

Puddle's promise is that it never sends what you or your agent wrote. **Anything that breaks that promise is a security
issue**, even a small one: a field in an upload that [DATA.md](DATA.md) doesn't list, a log line that keeps a path, a
page that loads something from elsewhere.

## Supported versions

The latest release. Puddle updates itself, so that's what almost everyone runs.

## Known limits

- Builds are signed ad hoc for now, not with an Apple Developer ID. The updater checks that a new build's signature is
  whole (`codesign --verify --deep --strict`), not who signed it. Once builds carry a Developer ID it will check that
  too.
- Your device key (`~/.joule/token`) is readable by your own user account, as the agents' settings files are.
