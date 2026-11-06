import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOtlp, SENT } from '../companion/mirror.js';

test('a stored step goes up with its counts and allow-listed fields only, the account as a fingerprint', () => {
  const row = { ts: 1793700000000, name: 'tool_result', session_id: 's1', dedupe: 'tr:tu1', tool_name: 'Bash', success: 1, duration_ms: 1200,
    attrs_json: JSON.stringify({ 'user.email': 'me@acme.io', 'user.account_uuid': 'acct-1', 'organization.id': 'org-1', error: 'cat /Users/me/secret.txt: denied',
      tool_parameters: '{"command":"cat secret.txt"}', prompt: 'fix the login bug', 'user.country': 'BG', 'event.sequence': 7, someone_new: 'x' }) };
  const [rec] = toOtlp([row], 'Europe/Sofia', () => 'org-1').resourceLogs[0].scopeLogs[0].logRecords;
  const a = Object.fromEntries(rec.attributes.map((x) => [x.key, x.value.stringValue]));
  const all = JSON.stringify(rec);
  for (const gone of ['me@acme.io', 'acct-1', 'secret', 'fix the login', 'someone_new', '"org-1"']) assert.ok(!all.includes(gone), `${gone} stays on the Mac`);
  assert.equal(a.tool_name, 'Bash'); assert.equal(a.success, 'true'); assert.equal(a['user.country'], 'BG'); assert.equal(a['tool_use_id'], 'tu1');
  assert.match(a['context.org'], /^[0-9a-f]{16}$/, 'the account only as a fingerprint');
  for (const k of Object.keys(a)) assert.ok(SENT.has(k) || ['event.name', 'session.id', 'tool_use_id', 'context.org', 'tool_name', 'duration_ms', 'success'].includes(k), `${k} is listed`);
});
