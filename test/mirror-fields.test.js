import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOtlp } from '../companion/mirror.js';
import { fingerprint } from '../companion/cloud.js';

test('mirrored history sends only allow-listed fields, and the account as its fingerprint', () => {
  const stored = { 'user.email': 'dev@acme.io', 'user.account_uuid': 'u-1', 'organization.id': 'org-acme', 'user.display_name': 'Dev',
    tool_input: '{"command":"cat .env"}', error: 'ENOENT /Users/dev/secret.txt', some_future_field: 'x',
    recovered_from: 'session log', 'app.entrypoint': 'cli', 'skill.name': 'review', status_code: 529 };
  const rows = [{ dedupe: 'tr:t-1', ts: 1, name: 'tool_result', session_id: 'work-1', tool_name: 'Bash', success: 1, duration_ms: 40, attrs_json: JSON.stringify(stored) }];
  const rec = toOtlp(rows, 'Europe/Berlin', () => 'org-acme').resourceLogs[0].scopeLogs[0].logRecords[0];
  const a = Object.fromEntries(rec.attributes.map((x) => [x.key, x.value.stringValue]));
  assert.deepEqual(Object.keys(a).sort(), ['app.entrypoint', 'context.org', 'duration_ms', 'event.name', 'recovered_from', 'session.id', 'skill.name',
    'status_code', 'success', 'tool_name', 'tool_use_id'].sort());
  assert.equal(a['context.org'], fingerprint('org-acme'));
  assert.ok(!JSON.stringify(rec).includes('org-acme') && !JSON.stringify(rec).includes('acme.io'), 'neither the account id nor the email leaves');
});
