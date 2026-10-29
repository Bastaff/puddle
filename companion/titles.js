// What Puddle's Claude Code status line sees per session: the conversation's name (`session_name`: the name set
// with /rename or -n, otherwise the title Claude Code generated; never a prompt, never the default "my-app-3f"
// display name, which Claude Code doesn't put there) and when it last ran (which clients run the status line at
// all). ~/.joule/titles.json, kept 30 days, at most 3000 sessions.
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
    // a status line call for this session; false when the id isn't one
    saw(sessionId, name) {
      if (!ID.test(String(sessionId || ''))) return false;
      const e = state[sessionId] || {}, t = clean(name);
      e.seen = now(); if (t) e.name = t;
      state[sessionId] = e;
      if (!timer) { timer = setTimeout(save, 5000); timer.unref?.(); } // a status line runs often: written at most every 5 s
      return true;
    },
    names: () => new Map(Object.entries(state).filter(([, e]) => e.name).map(([k, e]) => [k, e.name])),
    seen: () => new Map(Object.entries(state).map(([k, e]) => [k, e.seen])),
    close: () => { if (timer) save(); },
  };
}
