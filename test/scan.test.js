import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scan, classifyClaude, classifyCodex, parseRemote, desktopAppDir } from '../companion/scan.js';

const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const put = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data)); };
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

test('plans: business accounts are work, personal plans are personal', () => {
  assert.equal(classifyClaude({ organizationUuid: 'o1', organizationType: 'claude_team', organizationName: 'Acme' }).kind, 'work');
  assert.equal(classifyClaude({ organizationUuid: 'o1', organizationType: 'claude_enterprise' }).kind, 'work');
  assert.equal(classifyClaude({ organizationUuid: 'o2', organizationType: 'claude_max' }).kind, 'personal');
  assert.equal(classifyClaude({ organizationUuid: 'o2', organizationType: 'claude_max', organizationName: 'me@x.io’s Organization' }).org, null, 'personal org names are not shown as a company');
  assert.equal(classifyClaude(null, { ANTHROPIC_API_KEY: 'x' }).kind, 'api');
  assert.equal(classifyClaude(null, { CLAUDE_CODE_USE_BEDROCK: '1' }).plan, 'Cloud provider');
  const codex = (plan) => classifyCodex({ auth_mode: 'chatgpt', tokens: { account_id: 'a', id_token: jwt({ 'https://api.openai.com/auth': { chatgpt_plan_type: plan } }) } });
  for (const p of ['business', 'enterprise', 'edu', 'team', 'self_serve_business_usage_based', 'ent26']) assert.equal(codex(p).kind, 'work', p);
  for (const p of ['free', 'go', 'plus', 'pro', 'prolite']) assert.equal(codex(p).kind, 'personal', p);
});

test('git remotes group by owner and never keep credentials', () => {
  assert.deepEqual(parseRemote('https://user:secret@github.com/Acme/Web-App.git'), { host: 'github.com', owner: 'acme', name: 'web-app' });
  assert.deepEqual(parseRemote('git@gitlab.com:acme/platform/api.git'), { host: 'gitlab.com', owner: 'acme/platform', name: 'api' });
  assert.equal(parseRemote('not a url'), null);
});

test('scan: finds accounts, projects and loose spots on a fake machine', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'joule-scan-'));
  try {
    const now = Date.now(), t = (min) => new Date(now - min * 60_000).toISOString();
    // a work repo and a personal folder
    const repo = path.join(home, 'code', 'web');
    fs.mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:Acme/web.git'], { cwd: repo });
    const side = path.join(home, 'side');
    fs.mkdirSync(side);

    // Claude Code: Team account, one session in the repo (desktop app logs a scratch folder first)
    put(path.join(home, '.claude.json'), { oauthAccount: { organizationUuid: 'org-acme', organizationType: 'claude_team', organizationName: 'Acme', emailAddress: 'dev@acme.io' } });
    put(path.join(home, '.claude/projects/x/s1.jsonl'), jsonl([
      { type: 'attachment', cwd: path.join(home, 'Library/Application Support/Claude/scratch'), sessionId: 's1', timestamp: t(30) },
      { type: 'user', cwd: repo, sessionId: 's1', timestamp: t(30), message: { role: 'user', content: 'fix the bug' } },
      { type: 'assistant', cwd: repo, sessionId: 's1', timestamp: t(29), message: { role: 'assistant', content: [] } },
      { type: 'user', cwd: repo, sessionId: 's1', timestamp: t(28), message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } },
      { type: 'user', cwd: repo, sessionId: 's1', timestamp: t(27), message: { role: 'user', content: '<command-name>/clear</command-name>' } },
      { type: 'user', cwd: repo, sessionId: 's1', timestamp: t(26), message: { role: 'user', content: [{ type: 'text', text: 'and add a test' }] } },
    ]));
    // a second Claude config dir, signed into a personal Max plan (the documented work/personal pattern)
    put(path.join(home, '.claude-personal/.claude.json'), { oauthAccount: { organizationUuid: 'org-me', organizationType: 'claude_max' } });
    put(path.join(home, '.claude-personal/projects/y/s2.jsonl'), jsonl([
      { type: 'user', cwd: side, sessionId: 's2', timestamp: t(20), message: { role: 'user', content: 'hello' } },
      { type: 'assistant', cwd: side, sessionId: 's2', timestamp: t(19), message: { content: [] } },
      { type: 'ai-title', sessionId: 's2', aiTitle: 'Saying hello' },
    ]));
    // the desktop app, switched to a second org, ran a session there: it must not count for the CLI's Team org
    put(path.join(desktopAppDir(home), 'claude-code-sessions/acct-1/org-acme/local_a.json'), { cliSessionId: 's1', cwd: repo, title: 'Fix  the login\nbug' });
    put(path.join(desktopAppDir(home), 'claude-code-sessions/acct-1/org-second/local_b.json'), { cliSessionId: 's3', cwd: side, title: 'The app\'s name' });
    put(path.join(home, '.claude/projects/z/s3.jsonl'), jsonl([
      { type: 'user', cwd: side, sessionId: 's3', entrypoint: 'claude-desktop', timestamp: t(15), message: { role: 'user', content: 'plan my trip' } },
      { type: 'ai-title', sessionId: 's3', aiTitle: 'Trip planning' },
      { type: 'custom-title', sessionId: 's3', customTitle: 'Lisbon trip' },
    ]));
    // Codex: personal Plus, one quick chat in the app
    put(path.join(home, '.codex/auth.json'), { auth_mode: 'chatgpt', tokens: { account_id: 'acc-me', id_token: jwt({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus', organizations: [{ is_default: true, title: 'Personal' }] } }) } });
    const chat = path.join(home, 'Documents/Codex/2026-10-01/what-is-a-monad');
    put(path.join(home, '.codex/sessions/2026/10/01/rollout-1.jsonl'), jsonl([
      { type: 'session_meta', timestamp: t(10), payload: { id: 'cx-1', cwd: chat, originator: 'Codex Desktop', creator_account_id: 'acc-me' } },
      { type: 'response_item', timestamp: t(10), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>…' }] } },
      { type: 'response_item', timestamp: t(9), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'what is a monad' }] } },
    ]));

    fs.writeFileSync(path.join(home, '.codex/session_index.jsonl'), jsonl([{ id: 'cx-1', thread_name: 'Old name', updated_at: t(10) }, { id: 'cx-1', thread_name: 'Monads explained', updated_at: t(9) }]));

    const r = scan({ home, env: { PATH: '' }, now });
    const acc = Object.fromEntries(r.accounts.map((a) => [a.key, a]));
    assert.equal(acc['claude-code:org-acme'].kind, 'work');
    assert.equal(acc['claude-code:org-acme'].org, 'Acme');
    assert.equal(acc['claude-code:org-me'].kind, 'personal');
    assert.equal(acc['codex:acc-me'].plan, 'Plus');
    assert.equal(acc['claude-code:org-second'].kind, 'unknown', 'an org only the app knows is never assumed to be work');
    assert.equal(acc['claude-code:org-second'].sessions, 1);
    assert.deepEqual(acc['claude-code:org-second'].surfaces, { app: 1 });
    assert.equal(acc['claude-code:org-acme'].sessions, 1, 'the second org\'s session is not counted as Acme work');
    assert.ok(!JSON.stringify(r).includes('dev@acme.io'), 'no emails in the scan');

    const place = Object.fromEntries(r.places.map((p) => [p.key, p]));
    assert.deepEqual(place['github.com/acme'].repos, ['web'], 'the repo groups under its owner, not the scratch folder logged first');
    assert.equal(place['github.com/acme'].prompts, 2, 'tool results and slash commands are not prompts');
    assert.equal(place['github.com/acme'].workShare, 1);
    assert.equal(place['dir:' + side].label, '~/side');
    assert.equal(place.chats.prompts, 1, 'injected context is not a prompt');
    assert.equal(r.places.at(-1).key, 'chats', 'loose spots come last');

    assert.equal(r.sessions.length, 4);
    // every conversation gets the name people see: given by hand, else the app's, else Claude Code's own, Codex's thread name
    const title = Object.fromEntries(r.sessions.map((x) => [x.id, x.title]));
    assert.deepEqual(title, { s1: 'Fix the login bug', s2: 'Saying hello', s3: 'Lisbon trip', 'cx-1': 'Monads explained' });
    for (const s of r.sessions) assert.ok(Object.values(s.byDay).reduce((a, b) => a + b, 0) > 0);
    assert.ok(r.tools.every((t) => t.found));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
