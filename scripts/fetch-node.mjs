// The Node.js the app carries inside it (companion-app/binaries/node-aarch64-apple-darwin, not in git): this exact
// official release, from nodejs.org, checked against Node's own published checksums. `npm run dev:app` runs this when
// the binary is missing; run it by hand to change the version (and then update NODE here).
//   node scripts/fetch-node.mjs [--force]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE = 'v24.11.1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'companion-app', 'binaries', 'node-aarch64-apple-darwin');
const NAME = `node-${NODE}-darwin-arm64`;

if (fs.existsSync(OUT) && !process.argv.includes('--force')) {
  const v = execFileSync(OUT, ['--version'], { encoding: 'utf8' }).trim();
  console.log(v === NODE ? `✓ Node ${v} already in place` : `Node ${v} is in place, ${NODE} expected: run with --force to replace it`);
  process.exit(0);
}
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
console.log(`Downloading Node ${NODE} (macOS, Apple silicon) from nodejs.org…`);
const sums = (await get(`https://nodejs.org/dist/${NODE}/SHASUMS256.txt`)).toString('utf8');
const want = (sums.match(new RegExp(`^([0-9a-f]{64})  ${NAME}\\.tar\\.gz$`, 'm')) || [])[1];
if (!want) throw new Error(`no checksum for ${NAME}.tar.gz`);
const tgz = await get(`https://nodejs.org/dist/${NODE}/${NAME}.tar.gz`);
const got = createHash('sha256').update(tgz).digest('hex');
if (got !== want) throw new Error(`checksum mismatch: ${got}, nodejs.org says ${want}`);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-node-'));
try {
  fs.writeFileSync(path.join(work, 'node.tar.gz'), tgz);
  execFileSync('tar', ['-xzf', path.join(work, 'node.tar.gz'), '-C', work, `${NAME}/bin/node`]);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.copyFileSync(path.join(work, NAME, 'bin', 'node'), OUT);
  fs.chmodSync(OUT, 0o755);
} finally { fs.rmSync(work, { recursive: true, force: true }); }
console.log(`✓ Node ${NODE} in ${path.relative(ROOT, OUT)} (checksum matches nodejs.org)`);
