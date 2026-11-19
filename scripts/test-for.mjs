#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : 'HEAD';
const named = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--since');
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).split('\n').filter(Boolean);
const changed = named.length ? named : [...new Set([...git('diff', '--name-only', since), ...git('ls-files', '--others', '--exclude-standard')])];

const LOOK = ['layout', 'slots', 'learn', 'pages', 'me-loading', 'offline', 'mac', 'theme', 'static'].map((t) => `test/${t}.test.js`).filter((f) => fs.existsSync(path.join(ROOT, f)));
const tests = fs.readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => `test/${f}`);

const importsOf = new Map();
const imports = (file) => {
  if (importsOf.has(file)) return importsOf.get(file);
  const out = new Set(); importsOf.set(file, out);
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { return out; }
  for (const [, spec] of src.matchAll(/(?:from|import\s*\(|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const to = path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, file)), spec));
    out.add(to);
    for (const x of imports(to)) out.add(x);
  }
  return out;
};
const reads = (test, file) => { try { return fs.readFileSync(path.join(ROOT, test), 'utf8').includes(path.basename(file)); } catch { return false; } };

const run = new Map(), notes = [];
const add = (t, why) => { if (!run.has(t)) run.set(t, why); };
let all = null;
for (const f of changed) {
  if (/\.(md|txt|png|jpg|svg|ico)$/.test(f) || /^(docs|perf|assets|bench\/real\/README)/.test(f)) continue;
  if (/^(package(-lock)?\.json|scripts\/test\.mjs|test\/(port|sign-in)\.js)$/.test(f)) { all = `${f} affects every test`; break; }
  if (f.startsWith('test/') && f.endsWith('.test.js')) { add(f, 'the test itself changed'); continue; }
  if (f === 'test/grid.layout.js') { notes.push('the layout test changed: run npm run test:layout'); continue; }
  if (f.startsWith('companion-app/')) { notes.push(`${f}: the Mac app. No JS tests; check it builds (cargo check) and look at it in Puddle Dev (npm run dev:app)`); continue; }
  if (/^(collector|companion)\/public\//.test(f)) {
    for (const t of LOOK) add(t, `${f} is part of a page`);
    for (const t of tests) if (reads(t, f)) add(t, `reads ${path.basename(f)}`);
    if (/\.(css|html)$|\/(layout|shape|prompts|calendar|lines|you|person|app|projects)\.js$/.test(f)) notes.push(`${f} changes how pages look: also npm run test:layout, and npm run layout:sheet to see it`);
    continue;
  }
  let hit = false;
  for (const t of tests) if (imports(t).has(f) || reads(t, f)) { add(t, `uses ${f}`); hit = true; }
  if (!hit) notes.push(`${f}: no test uses it`);
  if (/^collector\/(queries|sql|db|rollup)\.js$|^service\/(database|server)\.js$/.test(f)) notes.push(`${f} can change speed: see docs/testing.md (Speed)`);
}

if (all) { console.log(`Everything: ${all}.`); if (!dry) process.exit(spawnSync('node', [path.join(ROOT, 'scripts/test.mjs')], { stdio: 'inherit', cwd: ROOT }).status ?? 1); process.exit(0); }
if (!changed.length) console.log('Nothing changed.');
for (const n of [...new Set(notes)]) console.log(`· ${n}`);
if (!run.size) { console.log(changed.length ? 'No tests to run for these changes.' : ''); process.exit(0); }
console.log(`${run.size} of ${tests.length} test files:`);
for (const [t, why] of run) console.log(`  ${t}  (${why})`);
if (dry) process.exit(0);
process.exit(spawnSync('node', [path.join(ROOT, 'scripts/test.mjs'), ...run.keys()], { stdio: 'inherit', cwd: ROOT }).status ?? 1);
