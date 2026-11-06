import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullVersion } from './version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let build = 'source-dirty'; try { build = execFileSync('git', ['-C', root, 'describe', '--always', '--dirty'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
const v = fullVersion(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))) + (build.endsWith('-dirty') ? '-dev' : '');
fs.writeFileSync(path.join(root, 'companion', 'VERSION'), v + '\n');
fs.writeFileSync(path.join(root, 'companion', 'BUILD'), build + '\n');
fs.writeFileSync(path.join(root, 'companion', 'BUILT'), String(Date.now()) + '\n');
let urls = process.env.PUDDLE_SERVICE_URLS || '';
if (!urls) try { urls = (fs.readFileSync(path.join(root, 'infra', 'gcp', 'config', 'staging.env'), 'utf8').match(/^APP_SERVICE_URLS="?([^"\n]*)"?/m) || [])[1] || ''; } catch {}
const list = urls.split(/[\s,]+/).filter((u) => /^https:\/\//.test(u));
fs.writeFileSync(path.join(root, 'companion', 'SERVICE'), list.join('\n') + (list.length ? '\n' : ''));
console.log(`Puddle ${v} (build ${build})${list.length ? `, signs in at ${list[0]}` : ', no website (built from source)'}`);
