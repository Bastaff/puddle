// Before every app build: write the release (package.json's version, as publish-app.sh names the zip) into
// companion/VERSION and the commit into companion/BUILD, both shipped inside Puddle.app. The app compares its VERSION
// with the published one.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// the release (package.json: 0.0.1, …), and the commit it was built from; uncommitted changes make it a -dev build
// (source without git, e.g. a downloaded zip: no commit to name, so it's a -dev build)
let build = 'source-dirty'; try { build = execFileSync('git', ['-C', root, 'describe', '--always', '--dirty'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
const v = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version + (build.endsWith('-dirty') ? '-dev' : '');
fs.writeFileSync(path.join(root, 'companion', 'VERSION'), v + '\n');
fs.writeFileSync(path.join(root, 'companion', 'BUILD'), build + '\n');
// when it was built: an update is only offered when the published build is newer than the running one
fs.writeFileSync(path.join(root, 'companion', 'BUILT'), String(Date.now()) + '\n');
// which website it signs in to: PUDDLE_SERVICE_URLS, else the private config's APP_SERVICE_URLS (official builds);
// a build from source has neither and works on this Mac only (companion/cloud.js)
let urls = process.env.PUDDLE_SERVICE_URLS || '';
if (!urls) try { urls = (fs.readFileSync(path.join(root, 'infra', 'gcp', 'config', 'staging.env'), 'utf8').match(/^APP_SERVICE_URLS="?([^"\n]*)"?/m) || [])[1] || ''; } catch {}
const list = urls.split(/[\s,]+/).filter((u) => /^https:\/\//.test(u));
fs.writeFileSync(path.join(root, 'companion', 'SERVICE'), list.join('\n') + (list.length ? '\n' : ''));
console.log(`Puddle ${v} (build ${build})${list.length ? `, signs in at ${list[0]}` : ', no website (built from source)'}`);
