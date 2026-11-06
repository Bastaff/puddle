import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('onboarding: no screen is a dead end or a loop', () => {
  const app = read('companion/public/app.js');
  const fn = (name) => { const i = app.indexOf(`function ${name}(`); assert.ok(i > 0, name); return app.slice(i, app.indexOf('\n}\n', i)); };
  assert.match(fn('scanning'), /Couldn't look around"[^\n]*wayOn\(true\)/);
  assert.match(fn('scanning'), /!found\.length\) return wayOn\(false\)/);
  assert.match(fn('wayOn'), /Try again[\s\S]*Open Me/);
  assert.match(fn('team'), /back: false/);
  assert.match(fn('team'), /Not now[\s\S]*\/api\/invite\/decline[\s\S]*go\('done'\)/);
  assert.match(fn('pairing'), /id="notnow"[\s\S]*close_main/);
  assert.match(fn('teamIntro'), /Not now/);
  assert.match(fn('connectFirst'), /id="solo"/);
  assert.match(fn('codeScreen'), /Use another email/);
  assert.match(fn('removeScreen'), /Cancel/);
  assert.match(fn('joinTeam'), /solo\.textContent = 'Not now'[^\n]*\/mac/);
});

test('one way back: a row under the header, in the same sticky block, built from where each link came from', () => {
  const bar = read('collector/public/bar.js'), css = read('collector/public/styles.css');
  assert.match(bar, /className: 'top'[\s\S]*top\.append\(bar\)[\s\S]*className: 'subbar', id: 'trail'[\s\S]*top\.append\(sub\)/, 'the bar and the way back are one block');
  assert.match(css, /^\.top \{ position: sticky; top: 0;/m, 'the block sticks, so the row is right under the bar at any height');
  assert.ok(!/--bar-h/.test(bar + css), 'no measured height that can go stale');
  assert.match(bar, /class="sb-back"[^`]*<span>Back<\/span><\/a>/, 'one big Back, always one step back');
  assert.match(bar, /const under = \['\/project', '\/work'\]\.includes/, 'drawn with the bar, before the page\'s data, so nothing moves');
  assert.match(bar, /from: \(name\) => `back=\$\{encodeURIComponent\(location\.pathname \+ location\.search\)\}&bt=/);
  assert.match(bar, /!b\.startsWith\('\/'\) \|\| b\.startsWith\('\/\/'\)/, 'only an address on this site is followed');
  assert.match(bar, /next\.pathname === '\/'\) break/, 'the trail stops at the place (Me or a team): the places control shows it');
  assert.match(read('collector/public/project.js'), /PuddleBar\?\.title\(short\(name\)\)/);
  assert.match(read('collector/public/work.js'), /PuddleBar\?\.title\('Conversations'\)/);
  assert.match(read('collector/public/person.js'), /if \(!you && !fixed\) globalThis\.PuddleBar\?\.title\(name\)/);
  for (const f of ['collector/public/project.js', 'collector/public/work.js', 'collector/public/person.js', 'collector/public/person.html'])
    assert.ok(!/class="pv-back"/.test(read(f)), `${f}: no back link of its own`);
  assert.equal((read('collector/public/person.html').match(/PuddleBar\?\.from\(/g) || []).length, 2);
  assert.match(read('collector/public/app.js'), /href: \(c\) => `\/project\?[^`]*\$\{fromHere\(\)\}`/);
});

test('the range is a small dropdown the pages wire as before', () => {
  const bar = read('collector/public/bar.js');
  assert.match(bar, /<button type="button" class="rp-btn" id="range-btn" aria-haspopup="menu"/);
  assert.match(bar, /<nav class="rp-menu" id="range"[^>]*hidden>/, 'the list holds #range button[data-r], which the pages wire');
});

test('the three menus (teams, range, ⚙) open and close one way', () => {
  const bar = read('collector/public/bar.js');
  assert.match(bar, /popup\(caret, \(\) => teamMenu\(teams, d\)\)/);
  assert.match(bar, /popup\(rpBtn, /);
  assert.match(bar, /popup\(more, gearMenu\)/);
  assert.match(bar, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); close\(true\); \}/, 'Escape closes, back to its button');
  assert.match(bar, /pointerdown', \(e\) => \{ if \(openPop && !openPop\.panel\.contains\(e\.target\)/, 'a click outside closes it');
  assert.match(bar, /closePop\(\);\n      const \{ panel, owned, first \} = make\(\)/, 'one open at a time');
});

test('the bar is one row: what gives way, in order, measured', () => {
  const bar = read('collector/public/bar.js');
  assert.match(bar, /const narrower = \[\.\.\.tools\.map\(tuck\), \(\) => bar\.classList\.add\('quiet'\), \(\) => bar\.classList\.add\('squeeze'\), \(\) => bar\.classList\.add\('mark-only'\), \(\) => bar\.classList\.add\('tight'\)\]/);
  const order = [...bar.matchAll(/id="([a-z-]+)" type="button"[^>]*?data-tuck="(\d)"/g)].map((m) => [m[1], +m[2]]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  assert.deepEqual(order, ['sound-btn', 'learn-btn', 'arrange-btn', 'theme-btn', 'demo-btn', 'share-live'], 'the least used go first');
  assert.match(bar, /bar\.querySelector\('#' \+ b\.dataset\.for\)\?\.click\(\)/);
  assert.match(bar, /PuddleTheme\?\.set\(t\.dataset\.pickTheme\)/);
  assert.ok(!/closest\('\[data-theme\]'\)/.test(bar));
});

test('overlays close the same three ways on every page', () => {
  const bar = read('collector/public/bar.js');
  assert.match(bar, /closest\?\.\('\[data-close\]'\)/, '✕');
  assert.match(bar, /d instanceof HTMLDialogElement && d\.open\) \{ const r = d\.getBoundingClientRect\(\)/, 'a click outside the dialog\'s box');
  assert.match(bar, /touchstart[\s\S]*\.tip/, 'a tap elsewhere hides a tooltip');
  assert.ok(!/for \(const d of document\.querySelectorAll\('dialog'\)\) d\.addEventListener\('click'/.test(read('collector/public/app.js')), 'one way, in bar.js');
  assert.match(read('companion/public/me/popover.js'), /Escape'\) act\('hide_popover'\)/);
  assert.match(read('companion-app/src/main.rs'), /"hide_popover" =>/);
});
