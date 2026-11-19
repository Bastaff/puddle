import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../collector/db.js';
import { eventRow } from '../collector/otlp.js';
import { trackedRollup } from '../collector/rollup.js';
import { sqliteSql } from '../collector/sql.js';
import { makeQueries, parseFilters } from '../collector/queries.js';

const H = 3600_000;
const rows = (sid, t0, n) => Array.from({ length: n }, (_, i) => {
  const who = { 'user.account_uuid': 'u1', 'session.id': sid }, t = t0 + i * 7 * 60_000;
  return [eventRow('user_prompt', t, { ...who, 'prompt.id': `${sid}-${i}`, prompt_length: 10 + i }),
    eventRow('api_request', t + 4000, { ...who, 'prompt.id': `${sid}-${i}`, model: 'claude-sonnet-5-5', input_tokens: 100, output_tokens: 20 + i }),
    eventRow('tool_result', t + 9000, { ...who, 'prompt.id': `${sid}-${i}`, tool_name: i % 2 ? 'Edit' : 'Bash', success: 'true' })];
}).flat();

test('Me\'s summary tables follow every write, from any part of Puddle, and answer exactly like counting from scratch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-tracked-'));
  const file = path.join(dir, 'personal.db');
  const store = openDb(file), other = new DatabaseSync(file);
  other.exec('PRAGMA busy_timeout = 5000');
  const db = new DatabaseSync(file);
  try {
    const now = Date.now();
    store.insertEvents(rows('s1', now - 50 * H, 12));
    db.exec(`CREATE TABLE IF NOT EXISTS rollup_dirty (session_id TEXT, user_key TEXT, bucket BIGINT NOT NULL); CREATE TRIGGER rollup_dirty_ins AFTER INSERT ON events BEGIN INSERT OR IGNORE INTO rollup_dirty VALUES (NEW.session_id, NULL, 0); END;`);
    const sums = trackedRollup(db, sqliteSql(db), { pauseMs: 1 });
    assert.equal(await sums.sync(), true, 'the first time, the tables are built');
    assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM rollup_dirty').get().n), 0);

    const raw = makeQueries(db, { now: () => now, fast: () => false }), sum = makeQueries(db, { now: () => now, rollup: () => true, fast: () => false });
    const f = { ...parseFilters(new URLSearchParams({ from: String(now - 10 * 24 * H), to: String(now + H) })), user: null };
    const same = async (why) => {
      assert.deepEqual(await sum.person(f, 60, 'u1'), await raw.person(f, 60, 'u1'), why);
      assert.deepEqual(await sum.days(f, 60), await raw.days(f, 60), why);
    };
    await same('built');
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name = 'rollup_dirty_ins'`).get().n, 0, 'triggers from an older Puddle are replaced');

    store.insertEvents(rows('s2', now - 3 * H, 4));
    const upsert = other.prepare(`INSERT INTO events (dedupe, ts, name, user_key, session_id) VALUES (?, ?, 'user_prompt', 'u1', 's2') ON CONFLICT(dedupe) DO UPDATE SET ts = excluded.ts`);
    for (const k of ['c1', 'c2', 'c1']) upsert.run(k, now - 3 * H + 1000);
    other.prepare(`DELETE FROM events WHERE session_id = 's1' AND ts > ?`).run(now - 45 * H);
    other.prepare(`UPDATE events SET ts = ts + 600000 WHERE session_id = 's2' AND name = 'tool_result'`).run();
    assert.ok(Number(db.prepare('SELECT COUNT(*) n FROM rollup_dirty').get().n) > 0, 'changes from any connection are noted');
    assert.equal(await sums.sync(), true, 'only the changed slices are counted again');
    await same('after inserts, catch-up style upserts into a marked slice, a delete and a moved event from another connection');

    store.insertEvents(rows('s3', now - 9 * 24 * H, 100));
    assert.equal(await sums.sync({ most: 10 }), false, 'an ask with a lot waiting answers at once without refreshing');
    assert.ok(Number(db.prepare('SELECT COUNT(*) n FROM rollup_dirty').get().n) > 10);
    const slow = trackedRollup(db, sqliteSql(db), { step: 5, budgetMs: 0 });
    assert.equal(await slow.sync(), false, 'a big catch-up is worked through in small steps, and the tables are not used until they are current');
    let asks = 1;
    while (!(await trackedRollup(db, sqliteSql(db), { step: 5, budgetMs: 0 }).sync())) asks++;
    assert.ok(asks > 3, 'spread over several asks');
    await same('after a big catch-up');
    assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM rollup_dirty').get().n), 0);
  } finally { db.close(); other.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
