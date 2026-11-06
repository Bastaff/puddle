import fs from 'node:fs';
import path from 'node:path';

const DAY = 864e5;

export function makeErrors({ now = () => Date.now() } = {}) {
  const kinds = new Map();
  return {
    note(kind) { const e = kinds.get(kind) || { n: 0, last: 0 }; e.n++; e.last = now(); kinds.set(kind, e); },
    list() {
      for (const [k, e] of kinds) if (now() - e.last > DAY) kinds.delete(k);
      return [...kinds].map(([kind, e]) => ({ kind, n: e.n, last: e.last }));
    },
  };
}

export function statusLineIsPuddle(home, dir) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')), c = String(s?.statusLine?.command || '');
    return c.includes(path.join(dir, 'statusline.sh')) || /\/\.(puddle|joule)(-dev)?\/statusline\.sh/.test(c);
  } catch { return null; }
}

export function setupReport({ scan, lineSeen = new Map(), version, built, statusline, errors, agents = null, cost = null, now = Date.now() }) {
  const week = (scan?.sessions || []).filter((s) => s.end && now - s.end < 7 * DAY);
  const clients = {}, byClient = {};
  for (const s of week) {
    const k = String(s.surface || 'unknown').toLowerCase().replace(/[^a-z0-9:._-]/g, '-').slice(0, 40);
    clients[k] = (clients[k] || 0) + 1;
    const c = byClient[k] || (byClient[k] = { sessions: 0, titled: 0, readings: 0, sources: {} });
    c.sessions++;
    if (s.title) { c.titled++; const src = s.titleSource || 'other'; c.sources[src] = (c.sources[src] || 0) + 1; }
    if (s.id && now - (lineSeen.get(s.id) || 0) < 7 * DAY) c.readings++;
  }
  const r = { app: version || undefined, built: built || undefined, clients, byClient,
    week: { sessions: week.length, titled: week.filter((s) => s.title).length }, errors: errors || [] };
  if (typeof statusline === 'boolean') r.statusline = statusline;
  if (agents) r.agents = agents;
  if (cost) r.cost = cost;
  return r;
}
