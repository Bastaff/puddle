// Measures "Needs a look" precision on synthetic teams: every demo persona has
// known, planted problems; any other flag is a false alarm.
//   node scripts/flag-eval.js [seeds=5]
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDemo } from '../collector/demo.js';

// Yuki's broken connector also shows as general failures before it has 6 calls.
export const PLANTED = {
  'Sofia Rossi': ['quiet'], 'Jonas Weber': ['failures', 'stuck'], 'Amara Okafor': ['context'], 'Noah Brooks': ['ratelimit', 'limit'],
  'Yuki Tanaka': ['broken', 'failures'], 'Priya Nair': ['hook'], 'Tom Becker': ['friction'], 'Mateo García': ['version'],
  'Lena Fischer': [], 'Ava Martin': [],
};
// What must be found (recall): one flag per planted problem.
const REQUIRED = { ...PLANTED, 'Yuki Tanaka': ['broken'] };

// The evaluation runs on fixed moments of a reference week, never on the wall clock: the demo
// team's history depends on the hour of the week (people's work hours, time zones), so a
// clock-based run gave different answers at different times (a sweep over 168 hours showed
// planted problems out of view at some hours). Spread over the week; same answer on every run.
export const MOMENTS = ['2026-10-12T09:00:00Z', '2026-10-14T13:00:00Z', '2026-10-16T17:00:00Z'].map(Date.parse);

export async function evaluate(seeds = 5, ranges = [1, 7, 30], moments = MOMENTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-eval-'));
  let tp = 0, fp = 0, expected = 0, found = 0;
  const falseAlarms = [], missed = [];
  try {
    for (let seed = 1; seed <= seeds; seed++) for (const now of moments) {
      const demo = makeDemo(path.join(dir, `s${seed}-${now}.db`), { seed, now: () => now });
      const q = demo.queries();
      for (const days of ranges) {
        const team = (await q.team({ from: now - days * 86400_000, to: now + 60_000 }, 60));
        for (const p of team.people) {
          const want = PLANTED[p.name] || [];
          for (const f of p.flags) {
            if (want.includes(f.kind)) tp++; else { fp++; falseAlarms.push(`seed ${seed} · ${new Date(now).toISOString().slice(0, 13)}h · ${days}d · ${p.name}: ${f.text}`); }
          }
          // recall: planted problems seen in the 7-day view
          if (days === 7) {
            const need = REQUIRED[p.name] || []; expected += need.length;
            for (const k of need) if (p.flags.some((f) => f.kind === k)) found++; else missed.push(`seed ${seed} · ${new Date(now).toISOString().slice(0, 13)}h · ${p.name}: ${k}`);
          }
        }
      }
      demo.close();
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return { precision: tp / Math.max(1, tp + fp), recall: found / Math.max(1, expected), tp, fp, falseAlarms, missed };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  const r = await evaluate(Number(process.argv[2]) || 5);
  console.log(`precision ${(r.precision * 100).toFixed(1)}% (${r.tp} right, ${r.fp} false alarms) · recall at 7D ${(r.recall * 100).toFixed(1)}%`);
  for (const a of r.falseAlarms) console.log('  false alarm:', a);
  for (const m of r.missed) console.log('  missed:', m);
}
