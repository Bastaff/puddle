import fs from 'node:fs';
import path from 'node:path';

const KEEP = 30 * 864e5, MAX = 3000;
const ID = /^[\w-]{8,80}$/;
const clean = (t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, 140) || null : null);

export function makeTitles({ dir, now = () => Date.now() }) {
  const file = path.join(dir, 'titles.json');
  let state = {}; try { state = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch {}
  let timer = null;
  const save = () => {
    clearTimeout(timer); timer = null;
    const keep = Object.entries(state).filter(([, e]) => now() - (e.seen || 0) < KEEP).sort((a, b) => b[1].seen - a[1].seen).slice(0, MAX);
    state = Object.fromEntries(keep);
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 }); } catch {}
  };
  return {
    saw(sessionId, name) {
      if (!ID.test(String(sessionId || ''))) return false;
      const e = state[sessionId] || {}, t = clean(name);
      e.seen = now(); if (t) e.name = t;
      state[sessionId] = e;
      if (!timer) { timer = setTimeout(save, 5000); timer.unref?.(); }
      return true;
    },
    names: () => new Map(Object.entries(state).filter(([, e]) => e.name).map(([k, e]) => [k, e.name])),
    seen: () => new Map(Object.entries(state).map(([k, e]) => [k, e.seen])),
    close: () => { if (timer) save(); },
  };
}
