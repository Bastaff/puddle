import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { puddleEnv, dataDir, fromPuddle, prefetching } from '../collector/env.js';

test('an old JOULE_* setting counts as its PUDDLE_* name, unless that one is set', () => {
  const env = puddleEnv({ JOULE_DIR: '/old', JOULE_URL: 'https://old', PUDDLE_URL: 'https://new', OTHER: 'x' });
  assert.equal(env.PUDDLE_DIR, '/old');
  assert.equal(env.PUDDLE_URL, 'https://new', 'the new name wins');
  assert.equal(env.PUDDLE_OTHER, undefined, 'only JOULE_* names');
});

test('the folder: ~/.puddle, or ~/.joule until the app has moved it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-env-'));
  try {
    assert.equal(dataDir(home, {}), path.join(home, '.puddle'), 'a new Mac');
    fs.mkdirSync(path.join(home, '.joule'));
    assert.equal(dataDir(home, {}), path.join(home, '.joule'), 'not moved yet');
    fs.mkdirSync(path.join(home, '.puddle'));
    assert.equal(dataDir(home, {}), path.join(home, '.puddle'), 'moved');
    assert.equal(dataDir(home, { PUDDLE_DIR: '/given' }), '/given', 'the app says which');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('a request from Puddle\'s own page: x-puddle, or x-joule from a page loaded before the rename', () => {
  assert.ok(fromPuddle({ headers: { 'x-puddle': '1' } }));
  assert.ok(fromPuddle({ headers: { 'x-joule': '1' } }));
  assert.ok(!fromPuddle({ headers: {} }));
  assert.ok(prefetching({ headers: { 'x-joule-prefetch': '1' } }) && prefetching({ headers: { 'x-puddle-prefetch': '1' } }));
});
