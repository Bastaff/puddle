import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, 'companion-app');
const TARGET = path.join(APP_DIR, 'target-dev');
const BUILT = path.join(TARGET, 'release', 'bundle', 'macos', 'Puddle Dev.app');
const INSTALLED = '/Applications/Puddle Dev.app';
const env = { ...process.env, PUDDLE_DEV: '1', CARGO_TARGET_DIR: TARGET, PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH}` };
const step = (t) => console.log(`\n▸ ${t}`);

if (fs.existsSync(path.join(ROOT, 'scripts', 'up.mjs'))) {
  step('Local website (npm run up)');
  execFileSync('node', [path.join(ROOT, 'scripts', 'up.mjs')], { stdio: 'inherit' });
}

step('The Node.js the app carries (scripts/fetch-node.mjs)');
execFileSync('node', [path.join(ROOT, 'scripts', 'fetch-node.mjs')], { stdio: 'inherit' });

step('Build Puddle Dev from this checkout');
const b = spawnSync('npx', ['--yes', '@tauri-apps/cli@2.12.1', 'build', '--bundles', 'app', '--config', 'tauri.dev.json'], { cwd: APP_DIR, env, stdio: 'inherit' });
if (b.status !== 0) process.exit(b.status || 1);
execFileSync('codesign', ['--verify', '--deep', '--strict', BUILT]);

step('Install and restart Puddle Dev');
for (const app of [INSTALLED, '/Applications/Joule Dev.app']) {
  spawnSync('osascript', ['-e', `quit app "${path.basename(app, '.app')}"`]);
  spawnSync('pkill', ['-f', `${app}/Contents/MacOS`]);
  fs.rmSync(app, { recursive: true, force: true });
}
execFileSync('ditto', [BUILT, INSTALLED]);
execFileSync('open', [INSTALLED]);
const v = fs.readFileSync(path.join(INSTALLED, 'Contents/Resources/app/companion/VERSION'), 'utf8').trim();
console.log(`\n✓ Puddle Dev ${v} is running ("DEV" in the menu bar).${fs.existsSync(path.join(ROOT, 'service')) ? ' Sign in with any email: the local website shows the code.' : ''}`);
