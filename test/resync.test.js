import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { makeCloud } from '../companion/cloud.js';

test('session projects are sent again after signing in again, never twice within one sign-in', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joule-resync-'));
  const posted = [], requests = [];
  const fetchImpl = async (url, opts) => {
    const b = JSON.parse(opts.body), list = b.sessions || [b];
    requests.push(list.length); posted.push(...list.map((x) => x.session_id));
    return { status: 200, json: async () => ({ saved: list.length }) };
  };
  const cloud = makeCloud({ dir, env: {}, fetchImpl });
  const signIn = (token) => { fs.writeFileSync(path.join(dir, 'url'), 'https://joule.test'); fs.writeFileSync(path.join(dir, 'token'), token); };
  const scan = { accounts: [], sessions: [{ id: 's1', tool: 'claude-code', repo: 'github.com/acme/web', folder: 'web', end: Date.now() }, { id: 's2', tool: 'codex', folder: 'notes', end: Date.now() }] };

  fs.writeFileSync(path.join(dir, 'synced.json'), JSON.stringify({ s1: 'github.com/acme/web|web|', s2: 'undefined|notes|' }));
  signIn('key-1');
  assert.equal((await cloud.syncContexts(scan)).sent, 2, 'first sync after this sign-in sends everything');
  assert.equal((await cloud.syncContexts(scan)).sent, 0, 'nothing twice within one sign-in');

  signIn('key-2');
  assert.equal((await cloud.syncContexts(scan)).sent, 2, 'a new sign-in sends every project again');
  assert.deepEqual(posted, ['s1', 's2', 's1', 's2']);
  assert.deepEqual(requests, [2, 2], 'one request per batch, not one per session');
  assert.ok(!fs.readFileSync(path.join(dir, 'synced.json'), 'utf8').includes('key-2'), 'the device key itself is never written down');
});

test('a Mac back after days away sends hundreds of sessions in a few batches, and still works with a website that only takes one at a time', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-batch-'));
  fs.writeFileSync(path.join(dir, 'url'), 'https://puddle.test'); fs.writeFileSync(path.join(dir, 'token'), 'key-1');
  const sessions = Array.from({ length: 1800 }, (_, i) => ({ id: `d${i}`, tool: 'claude-code', folder: 'work', end: Date.now() }));
  const requests = [];
  const cloud = makeCloud({ dir, env: {}, fetchImpl: async (url, opts) => { const b = JSON.parse(opts.body); requests.push(b.sessions ? b.sessions.length : 1); return { status: 200, json: async () => ({ saved: b.sessions?.length ?? 1 }) }; } });
  assert.equal((await cloud.syncContexts({ accounts: [], sessions })).sent, 1800);
  assert.ok(requests.length <= 20, `${requests.length} requests for 1800 sessions`);

  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-batch-old-'));
  fs.writeFileSync(path.join(old, 'url'), 'https://puddle.test'); fs.writeFileSync(path.join(old, 'token'), 'key-1');
  const one = [];
  const legacy = makeCloud({ dir: old, env: {}, fetchImpl: async (url, opts) => { const b = JSON.parse(opts.body); if (!b.session_id) return { status: 400, json: async () => ({ error: 'session_id required' }) }; one.push(b.session_id); return { status: 200, json: async () => ({}) }; } });
  assert.equal((await legacy.syncContexts({ accounts: [], sessions: sessions.slice(0, 5) })).sent, 5, 'an older website still gets every session');
  assert.deepEqual(one, ['d0', 'd1', 'd2', 'd3', 'd4']);
});
