import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openDb } from '../collector/db.js';
import { makeBackfill } from '../collector/backfill.js';

const HOLD = `
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[1]);
db.exec('PRAGMA busy_timeout = 10000; BEGIN IMMEDIATE');
db.prepare("INSERT INTO meta (key, value) VALUES ('other', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
console.log('holding');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.argv[2]));
db.exec('COMMIT');
`;

test('a write on the main side waits while the background reader is writing, instead of stopping the helper', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-lock-'));
  try {
    const file = path.join(dir, 'personal.db');
    const store = openDb(file);
    const b = makeBackfill(store.db, { home: dir });
    const other = spawn(process.execPath, ['--input-type=module', '-e', HOLD, file, '800'], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((r) => other.stdout.once('data', r));
    const t = Date.now();
    assert.doesNotThrow(() => b.startup());
    assert.ok(Date.now() - t >= 300, 'it waited for the other writer');
    await new Promise((r) => other.once('exit', r));
    b.stop(); store.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('every write transaction takes the write lock up front, so a read inside it can never go stale and fail with "database is locked"', () => {
  const files = ['collector', 'companion'].flatMap((d) => fs.readdirSync(new URL(`../${d}/`, import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));
  const plain = files.filter((f) => /exec\(\s*['"`]BEGIN(\s+DEFERRED)?\s*;?['"`]\s*\)/.test(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')));
  assert.deepEqual(plain, []);
});
