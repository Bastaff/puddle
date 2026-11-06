import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeUpdater, appBundle, placeFor, signedByTeam, TEAM, TEAM_REQUIREMENT } from '../companion/update.js';

const published = (version, built = null) => async (url) => {
  assert.match(url, /\/api\/app\/latest$/);
  return { json: async () => ({ version, built, url: 'https://x/download/mac' }) };
};

test('an update is offered when the published version differs, never from a repo checkout', async () => {
  const u = makeUpdater({ serviceUrl: () => 'https://joule.example', fetchImpl: published('abc1234'), current: 'abc1234', built: null, bundle: '/Applications/Puddle.app' });
  assert.equal((await u.check()).available, false, 'same version: nothing to do');
  const v = makeUpdater({ serviceUrl: () => 'https://joule.example', fetchImpl: published('def5678'), current: 'abc1234', built: null, bundle: '/Applications/Puddle.app' });
  const s = await v.check();
  assert.equal(s.available, true);
  assert.equal(s.latest, 'def5678');
  const dev = makeUpdater({ serviceUrl: () => 'https://joule.example', fetchImpl: published('def5678'), current: null, built: null });
  assert.equal((await dev.check()).available, false, 'no version stamp (development): never offered');
  const loose = makeUpdater({ serviceUrl: () => 'https://joule.example', fetchImpl: published('def5678'), current: 'abc1234', built: null, bundle: null });
  await loose.check();
  assert.match((await loose.install()).error, /can't update itself/);
});

test('only a newer build is offered: one built here for testing is never "updated" back', async () => {
  const mine = 2_000_000;
  const older = makeUpdater({ serviceUrl: () => 'https://j', fetchImpl: published('old1', 1_000_000), current: 'new1', built: mine, bundle: '/Applications/Puddle.app' });
  assert.equal((await older.check()).available, false);
  const unknown = makeUpdater({ serviceUrl: () => 'https://j', fetchImpl: published('old1'), current: 'new1', built: mine, bundle: '/Applications/Puddle.app' });
  assert.equal((await unknown.check()).available, false, 'a published build without a build time is older than any stamped one');
  const newer = makeUpdater({ serviceUrl: () => 'https://j', fetchImpl: published('new2', 3_000_000), current: 'new1', built: mine, bundle: '/Applications/Puddle.app' });
  assert.equal((await newer.check()).available, true);
});

test('a new app takes the old one\'s place, under its own name', () => {
  assert.equal(placeFor('/Applications/Puddle.app', '/tmp/x/Puddle.app'), '/Applications/Puddle.app');
  assert.equal(placeFor('/Applications/Joule.app', '/tmp/x/Puddle.app'), '/Applications/Puddle.app');
  assert.equal(placeFor('/Users/a/Apps/Joule.app', '/tmp/x/Puddle.app'), '/Users/a/Apps/Puddle.app');
});

test('only a real, settled Puddle.app counts as installable', () => {
  assert.equal(appBundle('/Applications/Puddle.app/Contents/MacOS/node'), '/Applications/Puddle.app');
  assert.equal(appBundle('/private/var/folders/x/AppTranslocation/ABC/d/Puddle.app/Contents/MacOS/node'), null);
  assert.equal(appBundle('/opt/homebrew/bin/node'), null);
});

test("a Puddle signed by Puddle's developer takes only updates signed by them; anything else isn't team-signed", async () => {
  assert.match(TEAM_REQUIREMENT, new RegExp(`leaf\\[subject\\.OU\\] = "${TEAM}"`));
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-adhoc-')) + '/Tiny.app';
  fs.mkdirSync(`${app}/Contents/MacOS`, { recursive: true });
  fs.copyFileSync('/usr/bin/true', `${app}/Contents/MacOS/Tiny`);
  fs.writeFileSync(`${app}/Contents/Info.plist`, '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Tiny</string><key>CFBundleIdentifier</key><string>test.tiny</string></dict></plist>');
  execFileSync('/usr/bin/codesign', ['-s', '-', '--force', app]);
  assert.equal(await signedByTeam(app), false);
  assert.equal(await signedByTeam('/nonexistent.app'), false);
  fs.rmSync(path.dirname(app), { recursive: true, force: true });
});
