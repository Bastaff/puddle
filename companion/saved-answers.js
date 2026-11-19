import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MIN = 60_000;

export function makeSaved({ dir, compute, version = () => 0, onFresh = () => {}, now = () => Date.now(), keepMs = 7 * 1440 * MIN, freshMs = 10 * MIN, gapMs = 30_000, warmMs = 10 * MIN, settleMs = 3000, log = () => {} }) {
  const mem = new Map(), running = new Map(), asked = new Map(), last = new Map();
  let settle = null;
  const file = (key) => path.join(dir, createHash('sha1').update(key).digest('hex').slice(0, 20) + '.json');
  const read = (key) => {
    if (mem.has(key)) return mem.get(key);
    try { const e = JSON.parse(fs.readFileSync(file(key), 'utf8')); if (e?.key === key) { e.version = -1; mem.set(key, e); return e; } } catch {}
    return null;
  };
  const save = (key, e) => {
    mem.set(key, e);
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const f = file(key), tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ key, at: e.at, body: e.body }), { mode: 0o600 });
      fs.renameSync(tmp, f);
    } catch {}
  };

  function refresh(key, job, quiet = false) {
    if (running.has(key)) return running.get(key);
    const v = version(), began = now();
    last.set(key, began);
    const p = compute(job).then((r) => {
      const e = { key, at: began, version: v, body: r == null ? null : JSON.stringify(r), job };
      save(key, e);
      if (!quiet) onFresh(key);
      return e;
    }).finally(() => running.delete(key));
    p.catch((err) => log(`answer ${job.kind}: ${err?.message || err}`));
    running.set(key, p);
    return p;
  }

  return {
    async get(key, job) {
      asked.set(key, { at: now(), job });
      const e = read(key);
      if (e && e.version === version() && now() - e.at < freshMs) return { ...e, stale: false };
      if (e && now() - e.at < keepMs) {
        if (!running.has(key)) refresh(key, job).catch(() => {});
        return { ...e, stale: true };
      }
      return { ...(await refresh(key, job, true)), stale: false };
    },
    changed: function changed(wait = settleMs) {
      clearTimeout(settle);
      settle = setTimeout(() => {
        let again = null;
        for (const [key, a] of asked) {
          if (now() - a.at > warmMs) { asked.delete(key); continue; }
          if (mem.get(key)?.version === version() && !running.has(key)) continue;
          const left = gapMs - (now() - (last.get(key) || 0));
          if (left > 0) { again = Math.min(again ?? left, left); continue; }
          refresh(key, a.job).catch(() => {});
        }
        if (again != null) changed(again);
      }, wait);
      settle.unref?.();
    },
    busy: () => running.size > 0,
    close() { clearTimeout(settle); },
  };
}
