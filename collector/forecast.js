const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const GAP = 5 * MIN;
export const FOCUS = 25 * MIN;
const WEEKS = 8;

const median = (xs) => quantile(xs, 0.5);
function quantile(xs, q) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}

export function activeSegments(rows) {
  const bySession = new Map();
  for (const r of rows) { if (r.session == null) continue; (bySession.get(r.session) || bySession.set(r.session, []).get(r.session)).push(Number(r.ts)); }
  const segs = [];
  for (const list of bySession.values()) {
    list.sort((a, b) => a - b);
    for (let i = 1; i < list.length; i++) if (list[i] - list[i - 1] < GAP && list[i] > list[i - 1]) segs.push([list[i - 1], list[i]]);
  }
  segs.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const s of segs) { const last = out[out.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else out.push([...s]); }
  return out;
}

const local = (ts, tz) => ts + tz * MIN;
const dayKey = (ts, tz) => new Date(local(ts, tz)).toISOString().slice(0, 10);
const dayStart = (key, tz) => Date.parse(key + 'T00:00:00Z') - tz * MIN;
const weekday = (key) => (new Date(key + 'T12:00:00Z').getUTCDay() + 6) % 7;
const addDays = (key, n) => new Date(Date.parse(key + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);

function perHour(segs, tz) {
  const days = new Map();
  for (let [a, b] of segs) {
    while (a < b) {
      const hourEnd = Math.floor(local(a, tz) / HOUR) * HOUR + HOUR - tz * MIN;
      const end = Math.min(b, hourEnd), key = dayKey(a, tz), h = new Date(local(a, tz)).getUTCHours();
      (days.get(key) || days.set(key, new Float64Array(24)).get(key))[h] += (end - a) / MIN;
      a = end;
    }
  }
  return days;
}
const total = (arr) => (arr ? arr.reduce((x, y) => x + y, 0) : 0);
const doneBy = (arr, minuteOfDay) => {
  if (!arr) return 0;
  const h = Math.floor(minuteOfDay / 60);
  let s = 0; for (let i = 0; i < h; i++) s += arr[i];
  return s + (h < 24 ? arr[h] * ((minuteOfDay % 60) / 60) : 0);
};

export function mergeRuns(runs) {
  const segs = runs.map((r) => [Number(r.start), Number(r.end)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]), out = [];
  for (const s of segs) { const last = out[out.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else out.push(s); }
  return out;
}

export function rhythm(rows, { now = Date.now(), tz = 0 } = {}) {
  const segs = rows.runs ? mergeRuns(rows.runs) : activeSegments(rows);
  const hours = perHour(segs, tz);
  const since = segs.length ? segs[0][0] : null;
  const today = dayKey(now, tz), minuteNow = Math.floor((local(now, tz) % DAY) / MIN);
  const firstDay = since ? dayKey(since, tz) : today;
  const known = (key) => key >= firstDay && key < today;

  const same = [];
  for (let k = 1; k <= WEEKS; k++) { const key = addDays(today, -7 * k); if (known(key)) same.push(hours.get(key)); }
  const soFar = total(hours.get(today));
  const after = same.map((arr) => total(arr) - doneBy(arr, minuteNow));
  const usualBy = same.map((arr) => doneBy(arr, minuteNow));
  const enough = same.length >= 3;
  const todayOut = {
    day: today, weekday: weekday(today), minutes: Math.round(soFar), byHour: Array.from(hours.get(today) || new Float64Array(24), Math.round),
    usual: enough ? Math.round(median(same.map(total))) : null,
    projected: enough ? { mid: Math.round(soFar + median(after)), low: Math.round(soFar + quantile(after, 0.25)), high: Math.round(soFar + quantile(after, 0.75)) } : null,
    verdict: !enough ? null : (() => { const u = median(usualBy); if (u < 5 && soFar < 5) return 'like'; const r = soFar / Math.max(u, 1); return r > 1.15 ? 'ahead' : r < 0.85 ? 'quieter' : 'like'; })(),
    samples: same.length,
  };

  const monday = addDays(today, -weekday(today));
  const weekdayMedian = (wd) => {
    const xs = []; for (let k = 1; k <= WEEKS; k++) { const key = addDays(monday, wd - 7 * k); if (known(key)) xs.push(total(hours.get(key))); }
    return xs.length >= 3 ? { mid: median(xs), low: quantile(xs, 0.25), high: quantile(xs, 0.75) } : null;
  };
  const days = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(monday, i);
    if (key < today) days.push({ day: key, minutes: Math.round(total(hours.get(key))), kind: 'done' });
    else if (key === today) days.push({ day: key, minutes: todayOut.minutes, kind: 'today', projected: todayOut.projected });
    else { const m = weekdayMedian(i); days.push({ day: key, minutes: 0, kind: 'ahead', projected: m && { mid: Math.round(m.mid), low: Math.round(m.low), high: Math.round(m.high) } }); }
  }
  const soFarWeek = days.reduce((a, d) => a + d.minutes, 0);
  const canProject = days.every((d) => d.kind === 'done' || d.projected);
  const proj = (k) => days.reduce((a, d) => a + (d.kind === 'done' ? d.minutes : d.projected?.[k] ?? 0), 0);
  const pastWeeks = [];
  for (let k = 1; k <= WEEKS; k++) {
    const start = addDays(monday, -7 * k); if (start < firstDay) break;
    let s = 0; for (let i = 0; i < 7; i++) s += total(hours.get(addDays(start, i))); pastWeeks.push(s);
  }
  const week = { start: monday, days, minutes: soFarWeek, usual: pastWeeks.length >= 2 ? Math.round(median(pastWeeks)) : null,
    projected: canProject ? { mid: Math.round(proj('mid')), low: Math.round(proj('low')), high: Math.round(proj('high')) } : null };

  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0)), heatN = new Array(7).fill(0);
  const starts = [], ends = [], typical = new Array(24).fill(0);
  let activeDaysRecent = 0;
  for (let k = 1; k <= WEEKS * 7; k++) {
    const key = addDays(today, -k); if (!known(key)) continue;
    const arr = hours.get(key), wd = weekday(key); heatN[wd]++;
    if (!arr || total(arr) < 1) continue;
    activeDaysRecent++;
    for (let h = 0; h < 24; h++) { heat[wd][h] += arr[h]; typical[h] += arr[h]; }
    starts.push(arr.findIndex((m) => m >= 1)); ends.push(23 - [...arr].reverse().findIndex((m) => m >= 1));
  }
  for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) heat[wd][h] = heatN[wd] ? Math.round((heat[wd][h] / heatN[wd]) * 10) / 10 : 0;
  const typicalDay = typical.map((m) => (activeDaysRecent ? Math.round((m / activeDaysRecent) * 10) / 10 : 0));
  const peakHours = typicalDay.map((m, h) => [h, m]).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => h).sort((a, b) => a - b);

  const activeDaysPerWeek = [];
  for (let k = 11; k >= 0; k--) {
    const start = addDays(monday, -7 * k); let n = 0, counted = 0;
    for (let i = 0; i < 7; i++) { const key = addDays(start, i); if (key > today || key < firstDay) continue; counted++; if (total(hours.get(key)) >= 1) n++; }
    activeDaysPerWeek.push({ week: start, days: counted ? n : null });
  }
  const blocks = [];
  for (const s of segs) { const last = blocks[blocks.length - 1]; if (last && s[0] - last[1] < GAP) last[1] = Math.max(last[1], s[1]); else blocks.push([...s]); }
  const focus = blocks.filter(([a, b]) => b - a >= FOCUS);
  const weekFrom = dayStart(monday, tz);
  const focusOut = { week: focus.filter(([a]) => a >= weekFrom).length, longestWeek: Math.round(Math.max(0, ...focus.filter(([a]) => a >= weekFrom).map(([a, b]) => b - a)) / MIN),
    longest: Math.round(Math.max(0, ...focus.filter(([a]) => a >= now - 90 * DAY).map(([a, b]) => b - a)) / MIN) };

  const activeDay = (key) => total(hours.get(key)) >= 1;
  let current = 0;
  for (let k = activeDay(today) ? 0 : 1; activeDay(addDays(today, -k)); k++) current++;
  let best = 0, run = 0;
  for (let key = firstDay; key <= today; key = addDays(key, 1)) { run = activeDay(key) ? run + 1 : 0; best = Math.max(best, run); }

  return {
    now, tz, since, today: todayOut, week, heat, typicalDay, peakHours, streak: { current, best },
    usualStart: starts.length >= 3 ? Math.round(median(starts)) : null, usualEnd: ends.length >= 3 ? Math.round(median(ends)) : null,
    activeDaysPerWeek, focus: focusOut,
  };
}
