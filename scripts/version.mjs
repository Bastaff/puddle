import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const text = fs.readFileSync(file, 'utf8'), pkg = JSON.parse(text);
export const fullVersion = (p) => p.version + (p.release > 1 ? `-${p.release}` : '');
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const was = fullVersion(pkg);
  if (process.argv[2] === 'bump') {
    const [a, b, c] = pkg.version.split('.').map(Number), part = process.argv[3] || 'patch';
    const next = part === 'major' ? `${a + 1}.0.0` : part === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
    fs.writeFileSync(file, text.replace(`"version": "${pkg.version}"`, `"version": "${next}"`).replace(/\n  "release": \d+,/, ''));
    console.log(`${was} → ${next}`);
  } else if (process.argv[2] === 'again') {
    const n = (pkg.release || 1) + 1;
    fs.writeFileSync(file, pkg.release ? text.replace(/"release": \d+/, `"release": ${n}`) : text.replace(`"version": "${pkg.version}",`, `"version": "${pkg.version}",\n  "release": ${n},`));
    console.log(`${was} → ${fullVersion({ ...pkg, release: n })}`);
  } else console.log(was);
}
