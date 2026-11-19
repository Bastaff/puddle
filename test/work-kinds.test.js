import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandKind, fileExt } from '../collector/kinds.js';
import { workDays } from '../collector/mework.js';
import { toOtlp } from '../companion/mirror.js';
import { parseRollout } from '../collector/codex-backfill.js';

test('commands become a kind label, never more', () => {
  const cases = [['npm test', 'test'], ['cd app && npm run test:changed', 'test'], ['git commit -m "wip" && git push', 'push'], ['nice -n 19 npm test', 'test'],
    ['xcodebuild -scheme App build', 'build'], ['/bin/zsh -lc "git status && npm run build"', 'build'], [['bash', '-lc', 'cargo test'], 'test'],
    ['gcloud run deploy web', 'deploy'], ['ls -la', 'other'], ['PORT=1 node --test test/a.test.js', 'test'], ['gh pr create --fill', 'push'], ['git commit -m x', 'commit']];
  for (const [cmd, want] of cases) assert.equal(commandKind(cmd), want, JSON.stringify(cmd));
  assert.equal(commandKind(undefined), null);
});

test('files become a known extension or other', () => {
  assert.equal(fileExt('/Users/me/app/src/Main.SWIFT'), 'swift');
  assert.equal(fileExt('/Users/me/app/Makefile'), 'other');
  assert.equal(fileExt('/Users/me/app/logo.png'), 'other');
  assert.equal(fileExt(null), null);
});

test('the labels stay on this Mac', () => {
  const rows = [{ dedupe: 'tr:1', ts: 1, name: 'tool_result', session_id: 's', tool_name: 'Bash', success: 1, attrs_json: JSON.stringify({ cmd_kind: 'push', ext: 'js', recovered_from: 'session log' }) }];
  const rec = toOtlp(rows, 'Europe/Berlin', () => null).resourceLogs[0].scopeLogs[0].logRecords[0];
  const keys = rec.attributes.map((x) => x.key);
  assert.ok(!keys.includes('cmd_kind') && !keys.includes('ext'), keys.join(','));
});

test('Codex auto-review sessions are marked as background', () => {
  const meta = (src) => JSON.stringify({ type: 'session_meta', timestamp: '2026-11-10T10:00:00Z', payload: { id: 'cx-1', thread_source: src, cwd: '/x' } });
  assert.equal(parseRollout(meta('guardian_review')).session.background, true);
  assert.ok(!parseRollout(meta('user')).session.background);
});

test('a day splits into working and waiting, by kind of work', () => {
  const t0 = Date.UTC(2026, 10, 10, 9, 0), m = 60_000;
  const rows = [
    { ts: t0, session_id: 'a', name: 'user_prompt' },
    ...[1, 6, 11].map((k) => ({ ts: t0 + k * m, session_id: 'a', name: 'tool_result', tool_name: 'mcp__Claude_Code_iOS_Simulator__control' })),
    { ts: t0 + 12 * m, session_id: 'a', name: 'tool_result', tool_name: 'Bash', cmd_kind: 'build' },
    { ts: t0 + 40 * m, session_id: 'a', name: 'user_prompt' },
    { ts: t0 + 41 * m, session_id: 'a', name: 'tool_result', tool_name: 'Edit', ext: 'swift' },
  ];
  const { days, actions } = workDays(rows, { tzMin: 0 });
  assert.equal(days.length, 1);
  const d = days[0];
  assert.equal(d.day, '2026-11-10');
  assert.ok(d.working >= 15 && d.working <= 25, `working ${d.working}`);
  assert.ok(d.waiting >= 25 && d.waiting <= 30, `waiting ${d.waiting}`);
  assert.deepEqual(Object.keys(d.kinds), ['ios']);
  assert.equal(d.cmd.build, 1);
  assert.equal(d.ext.swift, 1);
  assert.equal(actions.ios.checks, 3);
  assert.equal(actions.ios.builds, 1);
});
