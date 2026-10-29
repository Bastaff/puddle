// What this Mac tells the team service at every check-in (every 2 minutes), so "Needs a look" can say when
// something is missing: Puddle's version, whether Puddle's status line is in Claude Code, which Claude clients ran
// this week, how many of this week's conversations have a title, and Puddle's own errors of the last day.
// Counts and flags only: never a name, a path, a title or anything anyone wrote.
import fs from 'node:fs';
import path from 'node:path';

const DAY = 864e5;

// Puddle's own errors, counted per kind (kept a day): note('contexts') wherever something fails
export function makeErrors({ now = () => Date.now() } = {}) {
  const kinds = new Map(); // kind → { n, last }
  return {
    note(kind) { const e = kinds.get(kind) || { n: 0, last: 0 }; e.n++; e.last = now(); kinds.set(kind, e); },
    list() {
      for (const [k, e] of kinds) if (now() - e.last > DAY) kinds.delete(k);
      return [...kinds].map(([kind, e]) => ({ kind, n: e.n, last: e.last }));
    },
  };
}

// Is Claude Code's status line Puddle's (this copy of it)? null: can't tell (no settings file, or Puddle Dev)
export function statusLineIsJoule(home, dir) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
    return String(s?.statusLine?.command || '').includes(path.join(dir, 'statusline.sh'));
  } catch { return null; }
}

// lineSeen: when Puddle's status line last ran per session (companion/titles.js): which clients run it at all
export function setupReport({ scan, lineSeen = new Map(), version, built, statusline, errors, agents = null, now = Date.now() }) {
  const week = (scan?.sessions || []).filter((s) => s.end && now - s.end < 7 * DAY);
  const clients = {}, byClient = {};
  for (const s of week) {
    const k = String(s.surface || 'unknown').toLowerCase().replace(/[^a-z0-9:._-]/g, '-').slice(0, 40);
    clients[k] = (clients[k] || 0) + 1;
    // per client: conversations, how many have a title and where it came from, how many ran Puddle's status line
    const c = byClient[k] || (byClient[k] = { sessions: 0, titled: 0, readings: 0, sources: {} });
    c.sessions++;
    if (s.title) { c.titled++; const src = s.titleSource || 'other'; c.sources[src] = (c.sources[src] || 0) + 1; }
    if (s.id && now - (lineSeen.get(s.id) || 0) < 7 * DAY) c.readings++;
  }
  const r = { app: version || undefined, built: built || undefined, clients, byClient,
    week: { sessions: week.length, titled: week.filter((s) => s.title).length }, errors: errors || [] };
  if (typeof statusline === 'boolean') r.statusline = statusline;
  if (agents) r.agents = agents; // each agent's connection to Puddle: connected | stale | missing | own | absent
  return r;
}
