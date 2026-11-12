import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { makeFollower } from '../collector/lines.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-lines-'));
const line = (i) => JSON.stringify({ i, pad: 'x'.repeat(10 + (i % 7)) }) + '\n';
const drain = (f, file) => {
  const got = []; let runs = 0, r;
  do { r = f.follow(file, fs.statSync(file)); runs++; got.push(...r.text.split('\n').filter(Boolean).map((l) => JSON.parse(l).i)); } while (r.more && runs < 1000);
  return { got, runs };
};

test('a big log is read a chunk at a time, every line once, never more than a chunk in memory', () => {
  const file = path.join(dir, 'big.jsonl');
  fs.writeFileSync(file, Array.from({ length: 300 }, (_, i) => line(i)).join(''));
  const f = makeFollower(() => ({}), 256);
  const { got, runs } = drain(f, file);
  assert.deepEqual(got, Array.from({ length: 300 }, (_, i) => i));
  assert.ok(runs > 10, `read in many small steps (${runs})`);
  fs.appendFileSync(file, line(300) + line(301));
  assert.deepEqual(drain(f, file).got, [300, 301], 'then only what was added');
});

test('a line longer than a chunk is skipped once it ends, and waited for while it is still being written', () => {
  const file = path.join(dir, 'huge-line.jsonl');
  fs.writeFileSync(file, line(1) + JSON.stringify({ i: 'huge', pad: 'y'.repeat(5000) }));
  const f = makeFollower(() => ({}), 256);
  assert.deepEqual(drain(f, file).got, [1]);
  assert.deepEqual(drain(f, file).got, [], 'the unfinished huge line is not read in pieces');
  fs.appendFileSync(file, '\n' + line(2));
  assert.deepEqual(drain(f, file).got, [2], 'once it ends it is skipped, and what follows is read');
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
