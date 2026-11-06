import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { ADAPTERS } from '../companion/agents/index.js';
import { Agents } from '../collector/agents.js';
import { scan } from '../companion/scan.js';

const SECRET = 'please refactor the payment module secretly';
const NOW = Date.now(), T = (m) => new Date(NOW - m * 60_000).toISOString();
const write = (f, lines) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n'); };

const FIXTURES = {
  'claude-code': (home) => {
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { organizationUuid: 'org-1', organizationType: 'claude_team', organizationName: 'Acme' } }));
    const cwd = path.join(home, 'code', 'web'); fs.mkdirSync(cwd, { recursive: true });
    write(path.join(home, '.claude', 'projects', 'web', 'cc-1.jsonl'), [
      { type: 'user', cwd, sessionId: 'cc-1', entrypoint: 'cli', timestamp: T(20), message: { role: 'user', content: SECRET } },
      { type: 'assistant', cwd, sessionId: 'cc-1', timestamp: T(19), message: { content: [{ type: 'text', text: SECRET }] } },
      { type: 'ai-title', aiTitle: 'Payment module', sessionId: 'cc-1' },
    ]);
    write(path.join(home, '.claude', 'projects', 'web', 'cc-2.jsonl'), [
      { type: 'user', cwd, sessionId: 'cc-2', entrypoint: 'claude-vscode', timestamp: T(10), message: { role: 'user', content: SECRET } },
      { type: 'last-prompt', lastPrompt: SECRET, sessionId: 'cc-2' },
    ]);
    return { titled: { 'cc-1': ['Payment module', 'generated'] }, untitled: ['cc-2'] };
  },
  codex: (home) => {
    const cwd = path.join(home, 'code', 'api'); fs.mkdirSync(cwd, { recursive: true });
    write(path.join(home, '.codex', 'sessions', '2026', '10', '20', 'rollout-x.jsonl'), [
      { type: 'session_meta', timestamp: T(30), payload: { id: 'cx-1', cwd, originator: 'codex_cli_rs' } },
      { type: 'event_msg', timestamp: T(29), payload: { type: 'user_message', message: SECRET } },
      { type: 'event_msg', timestamp: T(28), payload: { type: 'token_count', rate_limits: { primary: { used_percent: 12, window_minutes: 300 }, secondary: { used_percent: 40, window_minutes: 10080 } } } },
    ]);
    write(path.join(home, '.codex', 'session_index.jsonl'), [{ id: 'cx-1', thread_name: 'API pagination' }]);
    return { titled: { 'cx-1': ['API pagination', 'index'] }, untitled: [], plans: 1 };
  },
};

test('every adapter has a fixture here and an entry in the catalogue, with every client declaring what it can report', () => {
  for (const a of ADAPTERS) {
    assert.ok(FIXTURES[a.id], `${a.id}: add a fixture to test/agents.test.js`);
    const cat = Agents.agent(a.id);
    assert.ok(!cat.unknown, `${a.id}: add it to collector/public/agents.js`);
    for (const k of ['name', 'short', 'letter', 'ico']) assert.ok(cat[k], `${a.id}: ${k}`);
    assert.ok(cat.clients.length, `${a.id}: its clients`);
    for (const c of cat.clients) {
      assert.ok(['app', 'terminal', 'editor', 'scripts'].includes(c.kind), `${a.id}/${c.id}: kind`);
      assert.ok(['statusline', 'logs', 'app', 'none'].includes(c.limits), `${a.id}/${c.id}: where its limits come from`);
      assert.ok(Array.isArray(c.titles), `${a.id}/${c.id}: where its titles come from`);
      if (c.limits === 'none') assert.ok(c.why?.limits, `${a.id}/${c.id}: say why there are no limits`);
    }
    for (const fn of ['detect', 'context', 'sessions']) assert.equal(typeof a[fn], 'function', `${a.id}: ${fn}()`);
  }
});

for (const a of ADAPTERS) {
  test(`${a.id}: sessions and plans in the shared shape, a title with its source, never a word anyone typed`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), `joule-agent-${a.id}-`));
    try {
      const want = FIXTURES[a.id](home);
      const env = { PATH: '' };
      const d = a.detect(home, env);
      assert.ok(Array.isArray(d.installs) && d.homes.length >= 1 && typeof d.managed === 'boolean', 'detect: installs, homes, managed');
      const ctx = a.context(home, env, d.homes);
      const sessions = d.homes.flatMap((h) => a.sessions(h, NOW - 864e5, ctx, {}));
      for (const s of sessions) {
        assert.equal(s.tool, a.id);
        assert.ok(s.id && s.cwd && s.times.length && Number.isInteger(s.prompts), 'id, cwd, times, prompts');
        assert.ok(s.surface && Agents.client(s.surface) && !Agents.client(s.surface).unknown, `the client ${s.surface} is in the catalogue`);
        assert.ok(s.title == null || ['set', 'app', 'generated', 'statusline', 'index'].includes(s.titleSource), 'a title says where it came from');
      }
      for (const [id, [title, source]] of Object.entries(want.titled)) {
        const s = sessions.find((x) => x.id === id);
        assert.deepEqual([s?.title, s?.titleSource], [title, source], `${id}: its title`);
      }
      for (const id of want.untitled) assert.equal(sessions.find((x) => x.id === id)?.title, null, `${id}: no title (a prompt is never one)`);
      const plans = a.plans?.(home, NOW, sessions) || [];
      if (want.plans) assert.equal(plans.length, want.plans);
      for (const p of plans) {
        assert.ok(Agents.planAgents.includes(p.agent), `plan readings carry a known agent id (${p.agent})`);
        assert.ok(['five_pct', 'week_pct', 'month_pct'].some((k) => p[k] != null) && p.ts, 'a plan reading');
      }
      const out = JSON.stringify(scan({ home, env, now: NOW }));
      assert.ok(!out.includes(SECRET), 'no prompt text in the scan');
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
}

test('Claude Code: the status line\'s name titles a conversation that has none, after a name set by hand and Claude Code\'s own', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'joule-agent-line-'));
  try {
    FIXTURES['claude-code'](home);
    const titles = new Map([['cc-2', 'Checkout flow'], ['cc-1', 'Ignored: Claude Code wrote one']]);
    const s = scan({ home, env: { PATH: '' }, now: NOW, titles }).sessions;
    assert.deepEqual(s.map((x) => [x.id, x.title, x.titleSource]).sort(), [['cc-1', 'Payment module', 'generated'], ['cc-2', 'Checkout flow', 'statusline']]);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('the catalogue: older ids, unknown agents and clients degrade gracefully', () => {
  assert.equal(Agents.agent('claude').id, 'claude-code', 'the Claude app\'s plan readings belong to Claude Code');
  const x = Agents.agent('gemini-cli');
  assert.deepEqual([x.unknown, x.name, x.letter], [true, 'gemini-cli', 'G'], 'an agent a newer Puddle reports still shows');
  assert.equal(Agents.client('cursor-agent').kind, 'editor');
  assert.equal(Agents.client('claude-vscode').limits, 'none');
  assert.equal(Agents.client('unknown'), null);
  assert.equal(Agents.planLabel('codex'), 'Codex');
});
