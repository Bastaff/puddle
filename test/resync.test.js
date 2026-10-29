// Projects come back after the website starts over: what this Mac already sent is remembered per sign-in, so a
// new sign-in (new account, or the same email after the website's data was reset) sends every project again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { makeCloud } from '../companion/cloud.js';

test('session projects are sent again after signing in again, never twice within one sign-in', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joule-resync-'));
  const posted = [];
  const fetchImpl = async (url, opts) => { posted.push(JSON.parse(opts.body).session_id); return { status: 200, json: async () => ({}) }; };
  const cloud = makeCloud({ dir, env: {}, fetchImpl });
  const signIn = (token) => { fs.writeFileSync(path.join(dir, 'url'), 'https://joule.test'); fs.writeFileSync(path.join(dir, 'token'), token); };
  const scan = { accounts: [], sessions: [{ id: 's1', tool: 'claude-code', repo: 'github.com/acme/web', folder: 'web', end: Date.now() }, { id: 's2', tool: 'codex', folder: 'notes', end: Date.now() }] };

  // an older Puddle's memory (a plain list of sent sessions) must not hide anything from a new sign-in
  fs.writeFileSync(path.join(dir, 'synced.json'), JSON.stringify({ s1: 'github.com/acme/web|web|', s2: 'undefined|notes|' }));
  signIn('key-1');
  assert.equal((await cloud.syncContexts(scan)).sent, 2, 'first sync after this sign-in sends everything');
  assert.equal((await cloud.syncContexts(scan)).sent, 0, 'nothing twice within one sign-in');

  signIn('key-2'); // signed in again: the website may have started over
  assert.equal((await cloud.syncContexts(scan)).sent, 2, 'a new sign-in sends every project again');
  assert.deepEqual(posted, ['s1', 's2', 's1', 's2']);
  assert.ok(!fs.readFileSync(path.join(dir, 'synced.json'), 'utf8').includes('key-2'), 'the device key itself is never written down');
});
