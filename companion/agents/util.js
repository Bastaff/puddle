import fs from 'node:fs';
import path from 'node:path';

export const DAY = 86_400_000;
export const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };
export const lsDir = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
export const cleanTitle = (t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 140) || null;

export function jwtClaims(t) {
  try { const p = t.split('.')[1]; return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return null; }
}

export function onPath(name, env) {
  return (env.PATH || '').split(path.delimiter).filter(Boolean).map((d) => path.join(d, name)).filter(exists);
}
export const editorExtensions = (home, prefix) => ['.vscode', '.vscode-insiders', '.cursor', '.windsurf'].flatMap((d) => lsDir(path.join(home, d, 'extensions'))
  .filter((e) => e.name.startsWith(prefix)).map((e) => ({ kind: `${d.slice(1)} extension`, path: path.join(home, d, 'extensions', e.name) })));
export const existing = (list) => list.filter(([, p]) => exists(p)).map(([kind, p]) => ({ kind, path: p }));
export const uniqInstalls = (a) => [...new Map(a.map((x) => [fs.realpathSync.native?.(x.path) ?? x.path, x])).values()];

export function walk(dir, test, out = [], depth = 0) {
  if (depth > 5) return out;
  for (const e of lsDir(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out, depth + 1); else if (test(e.name)) out.push(p);
  }
  return out;
}

export function eachLine(file, fn) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  eachRecord(text, fn);
}
export function eachRecord(text, fn) {
  for (const line of text.split('\n')) { if (!line) continue; let r; try { r = JSON.parse(line); } catch { continue; } if (fn(r) === false) return; }
}
