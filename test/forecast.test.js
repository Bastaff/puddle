import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rhythm, activeSegments, mergeRuns } from '../collector/forecast.js';

const TZ = 120;
const at = (iso) => Date.parse(iso) - TZ * 60_000;
const work = (day, from, to, session = day + from) => {
  const rows = []; for (let t = at(`${day}T${from}:00Z`); t <= at(`${day}T${to}:00Z`); t += 120_000) rows.push({ session, ts: t }); return rows;
};
function history(weeks = 8) {
  const rows = [];
  for (let d = 0; d < weeks * 7; d++) {
    const day = new Date(Date.parse('2026-08-17T12:00:00Z') + d * 864e5).toISOString().slice(0, 10);
    if (new Date(day + 'T12:00:00Z').getUTCDay() % 6 !== 0) rows.push(...work(day, '09:00', '11:00'));
  }
  return rows;
}
const WED_10 = at('2026-10-14T10:00:00Z');

test('active time: gaps over 5 minutes are pauses, parallel sessions count once', () => {
  const rows = [...work('2026-10-01', '09:00', '09:30', 'a'), ...work('2026-10-01', '09:10', '09:40', 'b'), { session: 'a', ts: at('2026-10-01T10:00:00Z') }];
  assert.deepEqual(activeSegments(rows).map(([a, b]) => (b - a) / 60_000), [40], '09:00–09:40 once; the 20-minute pause is not work');
});

test('today and this week, projected from your usual', () => {
  const rows = [...history(8), ...work('2026-10-12', '09:00', '11:00'), ...work('2026-10-13', '09:00', '11:00'), ...work('2026-10-14', '09:00', '10:00')];
  const r = rhythm(rows, { now: WED_10, tz: TZ });
  assert.equal(r.today.minutes, 60);
  assert.equal(r.today.usual, 120);
  assert.deepEqual(r.today.projected, { mid: 120, low: 120, high: 120 }, 'your usual Wednesdays add another hour after 10:00');
  assert.equal(r.today.verdict, 'like');
  assert.deepEqual(r.week.days.map((d) => d.kind), ['done', 'done', 'today', 'ahead', 'ahead', 'ahead', 'ahead']);
  assert.equal(r.week.minutes, 300);
  assert.equal(r.week.usual, 600);
  assert.deepEqual(r.week.projected, { mid: 600, low: 600, high: 600 }, 'Thu + Fri usual, weekend usually nothing');
  assert.equal(r.usualStart, 9); assert.equal(r.usualEnd, 10);
  assert.deepEqual(r.peakHours, [9, 10]);
  assert.ok(r.heat[2][9] > 55 && r.heat[5][9] === 0, 'Wednesdays at 9 busy, Saturdays empty');
  assert.equal(r.focus.week, 3, 'Mon, Tue, and today\'s hour are focus blocks');
  assert.equal(r.focus.longest, 120);
  assert.equal(r.activeDaysPerWeek.at(-1).days, 3);
  assert.equal(r.activeDaysPerWeek.at(-2).days, 5);
  assert.deepEqual(r.streak, { current: 3, best: 5 }, 'Mon–Wed this week; weekends break the streak');
});

test('ahead or quieter than usual, and honest when history is short', () => {
  const busy = rhythm([...history(8), ...work('2026-10-14', '07:00', '10:00')], { now: WED_10, tz: TZ });
  assert.equal(busy.today.verdict, 'ahead');
  const quiet = rhythm([...history(8), ...work('2026-10-14', '09:50', '10:00')], { now: WED_10, tz: TZ });
  assert.equal(quiet.today.verdict, 'quieter');
  const fresh = rhythm(work('2026-10-14', '09:00', '10:00'), { now: WED_10, tz: TZ });
  assert.equal(fresh.today.projected, null, 'not enough history yet');
  assert.equal(fresh.week.projected, null);
  assert.equal(fresh.today.minutes, 60);
  assert.equal(rhythm([], { now: WED_10, tz: TZ }).today.minutes, 0);
});

test('from the stored runs (no events read): the same rhythm as from the events', () => {
  const rows = [...history(8), ...work('2026-10-12', '09:00', '11:00'), ...work('2026-10-13', '09:00', '10:30', 'x'), ...work('2026-10-13', '10:00', '11:00', 'y'), ...work('2026-10-14', '09:00', '10:00')];
  rows.push({ session: 'lone', ts: at('2026-10-13T15:00:00Z') });
  const runs = [], by = new Map();
  for (const r of rows) (by.get(r.session) || by.set(r.session, []).get(r.session)).push(r.ts);
  for (const ts of by.values()) { ts.sort((a, b) => a - b); let s0 = ts[0]; for (let i = 1; i <= ts.length; i++) if (i === ts.length || ts[i] - ts[i - 1] >= 5 * 60_000) { runs.push({ start: s0, end: ts[i - 1] }); s0 = ts[i]; } }
  assert.deepEqual(mergeRuns(runs), activeSegments(rows));
  assert.deepEqual(rhythm({ runs }, { now: WED_10, tz: TZ }), rhythm(rows, { now: WED_10, tz: TZ }));
});
