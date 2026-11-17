import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startPersonal } from '../companion/personal.js';
import { freePort } from './port.js';

test('offline: Me keeps the teams it knew, and /go comes back to Me at once', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-offline-'));
  const port = await freePort();
  let down = false, slow = false;
  const net = (data) => (down ? Promise.reject(new TypeError('fetch failed')) : slow ? new Promise(() => {}) : Promise.resolve({ status: 200, data }));
  const site = { mac: () => ({ connected: true }), nav: () => net({ teams: [{ id: 't1', name: 'Acme', canView: true }] }), link: (next) => net({ url: 'https://puddle.example/auth?next=' + encodeURIComponent(next) }) };
  const p = startPersonal({ home, port, site });
  await new Promise((r) => setTimeout(r, 200));
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.deepEqual((await (await fetch(`${base}/api/site-nav`)).json()).teams.map((t) => t.name), ['Acme'], 'online: the website\'s list');
    down = true;
    const off = await (await fetch(`${base}/api/site-nav`)).json();
    assert.equal(off.offline, true);
    assert.ok(!off.signedOut, 'a signed-in Mac is never told to sign in because the network is down');
    assert.deepEqual(off.teams.map((t) => t.name), ['Acme'], 'the last list it had');
    const go = await fetch(`${base}/go?to=team`, { redirect: 'manual' });
    assert.equal(go.status, 302);
    assert.equal(go.headers.get('location'), '/?offline=1', 'back to Me, which says why');
    down = false; slow = true;
    const t0 = Date.now(), hung = await fetch(`${base}/go?to=${encodeURIComponent('/settings')}`, { redirect: 'manual' });
    assert.equal(hung.headers.get('location'), '/?offline=1');
    assert.ok(Date.now() - t0 < 10_000, `${Date.now() - t0} ms`);
  } finally { p.close(); fs.rmSync(home, { recursive: true, force: true }); }
});
