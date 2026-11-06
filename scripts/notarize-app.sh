#!/usr/bin/env bash
set -euo pipefail
APP="${1:-$(cd "$(dirname "$0")/.." && pwd)/companion-app/target/release/bundle/macos/Puddle.app}"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '✗ %s\n' "$*"; exit 1; }
[ -d "$APP" ] || fail "no $APP: build it first (see the top of this script)"

say "1. Signed with a Developer ID, hardened runtime, whole"
codesign --verify --deep --strict "$APP" || fail "the signature isn't whole"
info="$(codesign -dv --verbose=2 "$APP" 2>&1)"
printf '%s\n' "$info" | grep -q '^Authority=Developer ID Application:' || fail "not signed with a Developer ID (ad hoc?): build with APPLE_SIGNING_IDENTITY"
printf '%s\n' "$info" | grep -q 'flags=.*runtime' || fail "no hardened runtime: notarization would refuse it"
printf '%s\n' "$info" | grep '^Authority=Developer ID Application:' | sed 's/^/  /'

say "2. Apple's notary service (a few minutes)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ditto -c -k --norsrc --noextattr --keepParent "$APP" "$TMP/notarize.zip"
if [ -n "${APPLE_ID:-}" ]; then auth=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
else auth=(--keychain-profile "${PUDDLE_NOTARY_PROFILE:-puddle}"); fi
out="$(xcrun notarytool submit "$TMP/notarize.zip" "${auth[@]}" --wait 2>&1)" || true
printf '%s\n' "$out" | tail -3 | sed 's/^/  /'
printf '%s\n' "$out" | grep -q 'status: Accepted' || {
  id="$(printf '%s\n' "$out" | sed -n 's/^ *id: //p' | head -1)"
  [ -n "$id" ] && xcrun notarytool log "$id" "${auth[@]}" 2>&1 | head -40
  fail "Apple didn't accept it (its log above)"; }

say "3. The ticket stapled, judged as a download"
xcrun stapler staple "$APP" >/dev/null && xcrun stapler validate "$APP" >/dev/null || fail "stapling failed"
spctl -a -vv -t exec "$APP" 2>&1 | sed 's/^/  /'
spctl -a -t exec "$APP" 2>/dev/null || fail "Gatekeeper refuses it"
codesign --verify --deep --strict "$APP" || fail "the signature broke while stapling"
say "✓ $APP is notarized: a download opens with no warning"
