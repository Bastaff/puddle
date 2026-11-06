import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const HOUR = 3600_000, DAY = 24 * HOUR, STALL_MS = 2000, KEEP = 14 * 24;
const r1 = (n) => Math.round(n * 10) / 10;

export function makeCost({ dir, reads = () => null, errors = null, now = () => Date.now(), every = 60_000, timers = true,
  loop = monitorEventLoopDelay({ resolution: 20 }), cpuUsage = (since) => process.cpuUsage(since) }) {
  const file = path.join(dir, 'logs', 'cost.ndjson');
  loop.enable();
  const hourOf = (t) => Math.floor(t / HOUR) * HOUR;
  const blank = (hour) => ({ hour, cpuS: 0, rssMb: 0, worstBlockMs: 0, blocks: 0, reads: 0, readMb: 0, readS: 0, worstReadMs: 0, historyMb: 0, statusRuns: 0 });
  const started = now(), past = [];
  let cur = blank(hourOf(started)), cpu = cpuUsage(), lastRead = null;

  function keep(row) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify({ ...row, cpuS: r1(row.cpuS), readMb: r1(row.readMb), readS: r1(row.readS), historyMb: Math.round(row.historyMb) }) + '\n', { mode: 0o600 });
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      if (lines.length > KEEP + 24) fs.writeFileSync(file, lines.slice(-KEEP).join('\n') + '\n');
    } catch {}
  }
  function sample() {
    const t = now();
    if (hourOf(t) !== cur.hour) { keep(cur); past.push(cur); while (past.length > 24) past.shift(); cur = blank(hourOf(t)); }
    const c = cpuUsage(cpu); cpu = cpuUsage();
    const usedMs = (c.user + c.system) / 1e3;
    cur.cpuS += usedMs / 1e3;
    cur.rssMb = Math.max(cur.rssMb, Math.round(process.memoryUsage.rss() / 1e6));
    const worst = Math.min(loop.max / 1e6, usedMs); loop.reset();
    cur.worstBlockMs = Math.max(cur.worstBlockMs, Math.round(worst));
    if (worst >= STALL_MS) { cur.blocks++; errors?.note('slow'); }
    const r = reads();
    if (r?.lastRun && r.lastRun !== lastRead) {
      lastRead = r.lastRun; cur.reads++;
      cur.readMb += (r.bytesRead || 0) / 1e6; cur.readS += (r.lastDurationMs || 0) / 1000;
      cur.worstReadMs = Math.max(cur.worstReadMs, r.lastDurationMs || 0);
      cur.historyMb = (r.historyBytes || 0) / 1e6;
    }
  }
  const timer = timers ? setInterval(sample, every) : null;
  timer?.unref?.();

  return {
    sample,
    statusLine() { cur.statusRuns++; },
    summary() {
      const t = now(), rows = [...past, cur].filter((h) => h.hour > t - DAY - HOUR);
      const sum = (k) => rows.reduce((a, h) => a + h[k], 0), max = (k) => Math.max(0, ...rows.map((h) => h[k]));
      const secs = Math.max(1, (t - Math.max(started, rows[0]?.hour ?? t, t - DAY)) / 1000);
      return { hours: r1(secs / 3600), cpuPct: r1((sum('cpuS') / secs) * 100), rssMb: max('rssMb'), worstBlockMs: max('worstBlockMs'), blocks: sum('blocks'),
        reads: sum('reads'), readMb: Math.round(sum('readMb')), worstReadMs: max('worstReadMs'), historyMb: Math.round(cur.historyMb || max('historyMb')), statusRuns: sum('statusRuns') };
    },
    close() { clearInterval(timer); loop.disable(); },
  };
}
