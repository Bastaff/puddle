import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codexPlan, claudePlans } from '../companion/scan.js';
import { watchClaudePlans } from '../companion/server.js';
import { makePlan, clean } from '../companion/plan.js';
import { planNow, planAccounts } from '../collector/queries.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'bin');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'joule-plan-'));
const MINE = '{\n  "model": "opus",\n  "statusLine": {\n    "type": "command",\n    "command": "echo mine",\n    "padding": 1\n  }\n}\n';

for (const [name, run] of [['node', (a) => execFileSync(process.execPath, [path.join(BIN, 'merge.cjs'), ...a])], ['python', (a) => execFileSync('python3', [path.join(BIN, 'merge.py'), ...a])]]) {
  test(`status line on/off keeps yours (${name})`, () => {
    const d = tmp(), f = path.join(d, 'settings.json'), w = path.join(d, 'statusline.sh'), prev = path.join(d, 'prev');
    fs.writeFileSync(f, MINE);
    run(['statusline-on', f, w, prev]);
    run(['statusline-on', f, w, prev]);
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(s.statusLine.command, `"${w}"`);
    assert.equal(s.statusLine.padding, 1, 'your padding stays');
    assert.equal(fs.readFileSync(prev + '.sh', 'utf8'), 'echo mine\n');
    run(['statusline-off', f, w, prev]);
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), JSON.parse(MINE), 'yours is back');
    assert.ok(!fs.existsSync(prev + '.json') && !fs.existsSync(prev + '.sh'));
    fs.writeFileSync(f, '{}\n'); run(['statusline-on', f, w, prev]); run(['statusline-off', f, w, prev]);
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), {});
  });
}

test('connect then off: settings.json back byte for byte, status line included', () => {
  const d = tmp(), claude = path.join(d, 'claude'), jd = path.join(d, 'joule');
  fs.mkdirSync(claude); fs.writeFileSync(path.join(claude, 'settings.json'), MINE);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: claude, PUDDLE_DIR: jd, PUDDLE_URL: 'http://127.0.0.1:9', PUDDLE_ONLY: 'claude', PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` };
  execFileSync('sh', [path.join(BIN, 'puddle'), 'connect'], { env: { ...env, PUDDLE_TOKEN: 'jl_test' } });
  assert.match(fs.readFileSync(path.join(claude, 'settings.json'), 'utf8'), /statusline\.sh/);
  assert.ok(fs.statSync(path.join(jd, 'statusline.sh')).mode & 0o100, 'the wrapper is executable');
  execFileSync('sh', [path.join(BIN, 'puddle'), 'off'], { env });
  assert.equal(fs.readFileSync(path.join(claude, 'settings.json'), 'utf8'), MINE);
});

test('the status line passes the numbers and the conversation\'s name on, and shows your own line', async () => {
  const got = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push({ path: req.url, h: req.headers['x-puddle'], body: JSON.parse(b) }); res.end('{}'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const d = tmp(); fs.writeFileSync(path.join(d, 'statusline-prev.sh'), 'cat >/dev/null; printf mine\n');
    fs.writeFileSync(path.join(d, '.claude.json'), JSON.stringify({ oauthAccount: { organizationUuid: 'org-1', emailAddress: 'never@read.example' } }));
    const input = JSON.stringify({ session_id: 'sess-1234', session_name: 'Login bug', rate_limits: { five_hour: { used_percentage: 42, resets_at: 1792430000 }, seven_day: { used_percentage: 18.5 } }, transcript_path: '/secret', cwd: '/secret/project' });
    const run = (dir, inp = input) => statusline(dir, inp, srv.address().port);
    const out = await run(d);
    assert.equal(out, 'mine', 'your status line, unchanged');
    assert.deepEqual(got[0], { path: '/api/statusline', h: '1', body: { session_id: 'sess-1234', session_name: 'Login bug',
      plan: { agent: 'claude-code', five_pct: 42, five_reset: 1792430000, week_pct: 18.5, week_reset: null, month_pct: null, month_reset: null,
        org: 'org-1', shape: 'five_hour:resets_at,used_percentage seven_day:used_percentage' } } }, 'the plan numbers, the account, which fields came, and the name: nothing else');
    await run(d, JSON.stringify({ session_id: 'sess-1234', session_name: 'Login bug' }));
    assert.deepEqual(got[1].body, { session_id: 'sess-1234', session_name: 'Login bug', plan: null });
    fs.rmSync(path.join(d, 'statusline-prev.sh'));
    assert.equal(await run(d), '5h 42% · week 19%', 'no status line of yours: Puddle\'s short one');
    const gw = JSON.stringify({ session_id: 's2', rate_limits: { spend_limit: { used_percentage: 62.8, resets_at: 1792900000, used_usd: 314.12, limit_usd: 500, period: 'monthly' } } });
    assert.equal(await run(d, gw), 'spend 63%');
    assert.deepEqual([got.at(-1).body.plan.month_pct, got.at(-1).body.plan.month_reset, got.at(-1).body.plan.shape], [62.8, 1792900000, 'spend_limit:limit_usd,period,resets_at,used_percentage,used_usd']);
    assert.ok(!JSON.stringify(got).includes('314') && !JSON.stringify(got).includes('never@read'), 'no dollars, no email');
  } finally { srv.close(); }
});
function statusline(dir, input, port) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(BIN, 'statusline.cjs')], { env: { ...process.env, PUDDLE_DIR: dir, PUDDLE_PORT: String(port), CLAUDE_CONFIG_DIR: dir } });
    let out = ''; c.stdout.on('data', (x) => (out += x)); c.on('exit', () => resolve(out)); c.stdin.end(input);
  });
}

test('Codex: the 5-hour and weekly windows from its rate_limits', () => {
  const ts = 1_800_000_000_000;
  assert.deepEqual(codexPlan({ primary: { used_percent: 12, window_minutes: 300, resets_in_seconds: 600 }, secondary: { used_percent: 40, window_minutes: 10080, resets_at: 1_800_100_000 } }, ts),
    { agent: 'codex', org: null, five_pct: 12, five_reset: ts + 600_000, week_pct: 40, week_reset: 1_800_100_000_000, month_pct: null, month_reset: null, ts });
  const m = codexPlan({ primary: { used_percent: 7, window_minutes: 43200, resets_at: 1_800_200_000 }, secondary: null }, ts);
  assert.deepEqual([m.five_pct, m.week_pct, m.month_pct, m.month_reset], [null, null, 7, 1_800_200_000_000]);
  assert.equal(codexPlan({ primary: null, secondary: null }, ts), null);
});

test('plan now: highest across accounts; a window that started over is unknown, not 0', () => {
  const now = 100_000_000;
  const p = planNow([{ agent: 'claude-code', five_pct: 90, five_reset: now - 1, week_pct: 61, week_reset: now + 5, ts: now - 10 }, { agent: 'codex', five_pct: 30, week_pct: 20, ts: now - 20 }], now);
  assert.deepEqual([p.five_pct, p.week_pct, p.week_reset, p.seen], [30, 61, now + 5, now - 10]);
  const old = planNow([{ agent: 'claude', five_pct: 80, week_pct: 40, ts: now - 6 * 3600_000 }], now);
  assert.deepEqual([old.five_pct, old.week_pct, old.agents[0].five_pct, old.stale], [null, 40, null, false]);
  const gone = planNow([{ agent: 'claude', five_pct: 0, week_pct: 0, ts: now - 8 * 864e5 + 1 }], now);
  assert.deepEqual([gone.five_pct, gone.week_pct, gone.stale], [null, null, true]);
  assert.equal(planNow([], now), null);
});

test('the Claude desktop app\'s record: newest per account, accounts without numbers skipped', () => {
  const home = tmp(), dir = path.join(home, 'Library', 'Application Support', 'Claude'), now = Date.now();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan-usage-history.json'), JSON.stringify({ version: 2, samples: [
    { t: now - 3 * 3600_000, org: 'org-a', u: { fh: 20, sd: 50 } }, { t: now - 3600_000, org: 'org-a', u: { fh: 35, sd: 52 } },
    { t: now - 3600_000, org: 'org-b', u: {} }, { t: now - 20 * 864e5, org: 'org-c', u: { fh: 1, sd: 1 } }] }));
  assert.deepEqual(claudePlans(home, now), [{ agent: 'claude', org: 'org-a', five_pct: 35, five_reset: null, week_pct: 52, week_reset: null, ts: now - 3600_000 }]);
  assert.deepEqual(claudePlans(tmp(), now), [], 'no Claude app: nothing');
});

test('this Mac: newest reading per agent, told to the team at most once a minute', async () => {
  const sent = [];
  let t = 1_000_000;
  const plan = makePlan({ dir: tmp(), cloud: { plan: async (r) => { sent.push(r); return { status: 200 }; } }, now: () => t, minGap: 20 });
  assert.equal(clean({ agent: 'x', five_pct: 1 }), null);
  plan.record({ agent: 'claude-code', five_pct: 10, five_reset: 1_792_430_000 });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent[0].five_reset, 1_792_430_000_000, 'seconds become ms');
  assert.ok(!('org' in sent[0]) && sent[0].org_hash === null, 'no account: no fingerprint, and never an id');
  plan.record({ agent: 'claude-code', five_pct: 11 });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sent.length, 1, 'the next one waits for the gap');
  t += 60_000; plan.record({ agent: 'claude-code', five_pct: 12 });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(sent.at(-1).five_pct, 12);
  assert.equal(plan.record({ agent: 'claude-code', five_pct: 50, ts: 1 }), false, 'an older reading never wins');
  plan.record({ agent: 'claude', org: 'org-secret-id', five_pct: 5, week_pct: 6 });
  await new Promise((r) => setTimeout(r, 40));
  const c = sent.find((r) => r.agent === 'claude');
  assert.match(c.org_hash, /^[0-9a-f]{16}$/, 'an account travels as its fingerprint');
  assert.ok(!JSON.stringify(sent).includes('org-secret-id'), 'the account id never leaves the Mac');
  assert.equal(Object.keys(plan.latest()).length, 2, 'one reading per tool and account');
  plan.close();
});

test('one account, two sources: per window the newest reading counts, not the highest', () => {
  const now = 100 * 864e5, h = 3600_000;
  const rows = [{ agent: 'claude', org: 'org-a', five_pct: 18, week_pct: 45, ts: now - 20 * h },
    { agent: 'claude-code', org: 'org-a', five_pct: 3, five_reset: now + h, week_pct: 8, week_reset: now + 5 * 864e5, ts: now - h },
    { agent: 'claude-code', org: null, five_pct: 1, ts: now - 2 * h },
    { agent: 'codex', org: 'acct-x', week_pct: 30, ts: now - h }];
  const accts = planAccounts(rows);
  assert.equal(accts.length, 2, 'Claude (both sources, one account) and Codex');
  const p = planNow(rows, now);
  assert.deepEqual([p.five_pct, p.week_pct, p.week_reset], [3, 30, null], 'per window the highest across accounts; Claude\'s week is 8, not 45');
  const c = p.agents.find((a) => a.agent === 'claude-code');
  assert.deepEqual([c.five_pct, c.week_pct, c.week_ts, c.ts], [3, 8, now - h, now - h]);
  const only = planNow([{ agent: 'claude', org_hash: 'abc', five_pct: 10, week_pct: 40, ts: now - 2 * h }, { agent: 'claude-code', org_hash: 'abc', five_pct: 20, ts: now - h }], now);
  assert.deepEqual([only.agents.length, only.agents[0].five_pct, only.agents[0].week_pct, only.agents[0].week_ts], [1, 20, 40, now - 2 * h]);
  assert.equal(planAccounts([{ agent: 'claude-code', five_pct: 5, ts: now }, { agent: 'claude', org: 'o', five_pct: 6, ts: now - h }]).length, 2);
});

test('this Mac: a reading that knows its account replaces the same tool\'s one that didn\'t', () => {
  const plan = makePlan({ dir: tmp(), cloud: { plan: async () => ({ status: 200 }) } });
  plan.record({ agent: 'claude-code', five_pct: 1, ts: Date.now() - 1000 });
  plan.record({ agent: 'claude-code', org: 'org-a', five_pct: 2 });
  assert.deepEqual(Object.keys(plan.latest()), ['claude-code|org-a']);
  plan.close();
});

test('this Mac: a send that fails once is tried again, and only a second failure counts', async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let fails = 1, sends = 0, errors = 0;
  const cloud = { plan: async () => { sends++; if (fails-- > 0) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); return { status: 200 }; } };
  let plan = makePlan({ dir: tmp(), cloud, onError: () => errors++, retryAfter: 10 });
  plan.record({ agent: 'claude-code', org: 'o', five_pct: 3 });
  await wait(60);
  assert.deepEqual([sends, errors], [2, 0], 'the network came back: nothing to count');
  plan.close();
  fails = 2; sends = 0;
  plan = makePlan({ dir: tmp(), cloud, onError: () => errors++, retryAfter: 10 });
  plan.record({ agent: 'claude-code', org: 'o', five_pct: 4 });
  await wait(60);
  assert.deepEqual([sends, errors], [2, 1]);
  plan.close();
});

test('the Claude app\'s record is picked up as soon as it\'s written', async () => {
  const home = tmp(), dir = path.join(home, 'Library', 'Application Support', 'Claude'), got = [];
  fs.mkdirSync(dir, { recursive: true });
  const w = watchClaudePlans(home, (r) => got.push(r), () => {}, 20);
  try {
    fs.writeFileSync(path.join(dir, 'other.json'), '{}');
    for (let i = 0; i < 50 && !got.length; i++) {
      fs.writeFileSync(path.join(dir, 'plan-usage-history.json'), JSON.stringify({ version: 2, samples: [{ t: Date.now(), org: 'o', u: { fh: 7, sd: 9 } }] }));
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.deepEqual(got.map((r) => [r.org, r.five_pct, r.week_pct]), [['o', 7, 9]]);
  } finally { w.close(); }
  assert.equal(watchClaudePlans(tmp(), () => {}), null, 'no Claude app: nothing watched');
});
