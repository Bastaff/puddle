import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPersonal } from '../companion/personal.js';
import { readTheme } from '../companion/theme.js';
import { freePort } from './port.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Puddle keeps the theme: round trip, local pages only, and /go hands it to the website', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'joule-theme-'));
  const port = await freePort();
  const p = startPersonal({ home, port, site: { link: async (next) => ({ status: 200, data: { url: 'https://joule.example/auth?next=' + encodeURIComponent(next) } }), nav: async () => ({ data: { teams: [] } }) } });
  await new Promise((r) => setTimeout(r, 200));
  const base = `http://127.0.0.1:${port}`, H = { 'content-type': 'application/json', 'x-puddle': '1' };
  try {
    assert.deepEqual(await (await fetch(`${base}/api/theme`)).json(), { theme: 'auto' }, 'auto until someone picks');
    assert.equal((await fetch(`${base}/api/theme`, { method: 'POST', headers: H, body: '{"theme":"dark"}' })).status, 200);
    assert.equal(readTheme(home), 'dark', 'remembered for every screen (and the app reads the same file)');
    assert.equal((await fetch(`${base}/api/theme`, { method: 'POST', headers: { ...H, origin: 'https://evil.example' }, body: '{"theme":"light"}' })).status, 403, 'never from a web page elsewhere');
    assert.equal((await fetch(`${base}/api/theme`, { method: 'POST', headers: H, body: '{"theme":"purple"}' })).status, 400);
    assert.equal((await fetch(`${base}/__joule/theme_dark`)).status, 204, 'an app action outside Puddle\'s window keeps the page');
    const go = await fetch(`${base}/go?to=%2Fsettings`, { redirect: 'manual' });
    assert.match(decodeURIComponent(go.headers.get('location')), /\/settings\?app=.*&theme=dark/, 'the website page opens in the same theme');
  } finally { p.close(); }
});

test('one theme switch: theme.js only, the same boot lines everywhere', () => {
  const files = ['collector/public/app.js', 'collector/public/index.html', 'collector/public/person.html', 'companion/public/app.js', 'companion/public/index.html',
    'companion/public/me/index.html', 'service/pages.js', 'service/you-page.js', 'service/team-pages.js']
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  for (const [f, s] of files) {
    assert.doesNotMatch(s, /joule-theme/, `${f}: no second theme setting`);
    assert.doesNotMatch(s, /setItem\(['"]cu-theme/, `${f}: only theme.js changes the theme`);
  }
  const boot = 'new URLSearchParams(location.search).get("theme")';
  for (const f of ['collector/public/index.html', 'collector/public/person.html', 'companion/public/index.html', 'companion/public/me/index.html', 'service/pages.js', 'service/you-page.js', 'service/team-pages.js'])
    if (files.some(([n]) => n === f)) { const t = files.find(([n]) => n === f)[1]; assert.ok(t.includes(boot) || t.includes('${THEME_BOOT}'), `${f}: the shared boot lines (a ?theme= counts before the first paint)`); }
  for (const f of ['collector/public/index.html', 'collector/public/person.html', 'companion/public/index.html', 'companion/public/me/index.html'])
    assert.match(files.find(([n]) => n === f)[1], /src="\/theme\.js"/, `${f} loads theme.js`);
});
