import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { localStorage: { getItem: () => null, setItem() {} } };
vm.runInNewContext(fs.readFileSync(new URL('../collector/public/learn.js', import.meta.url), 'utf8') + '\nthis.LEARN = LEARN;', ctx);
const { LEARN } = ctx;

test('learn mode explains built-in tools, MCP tools and dashboard parts in plain words', () => {
  assert.match(LEARN.tool('Bash'), /built-in Claude Code tool.*terminal/);
  const mcp = LEARN.tool('mcp__Claude_Browser__browser_batch');
  assert.match(mcp, /MCP tool/);
  assert.match(mcp, /browser built into the Claude desktop app/);
  assert.match(mcp, /several steps in one go/);
  assert.match(LEARN.tool('mcp__linear__list_issues'), /Linear.*searches or lists/);
  assert.match(LEARN.tool('SomethingNew'), /tool Claude used/);
  for (const k of ['card:team', 'kpi:tokens', 'col:autonomy', 'cat:mcp', 'flag:friction', 'feat:subagents', 'mix:Effort', 'bar:learn', 'bar:arrange']) assert.ok(LEARN.explain(k).length > 40, k);
  assert.ok(!LEARN.tool('<img src=x>').includes('<img'), 'tool names are escaped');
});
