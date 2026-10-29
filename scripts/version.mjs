// Puddle's version: one number for the whole product (the website and the Mac app), in package.json. Each release
// gets a new one, so everyone can tell which Puddle they're on: 0.0.1, 0.0.2, … The git commit stays the build id.
//   node scripts/version.mjs              → 0.0.1
//   node scripts/version.mjs bump [patch|minor|major]   → the next one, written to package.json
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
if (process.argv[2] === 'bump') {
  const [a, b, c] = pkg.version.split('.').map(Number), part = process.argv[3] || 'patch';
  const next = part === 'major' ? `${a + 1}.0.0` : part === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(`"version": "${pkg.version}"`, `"version": "${next}"`));
  console.log(`${pkg.version} → ${next}`);
} else console.log(pkg.version);
