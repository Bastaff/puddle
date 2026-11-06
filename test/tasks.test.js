import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskRules } from '../collector/flags.js';

test('Needs a look: a task sub-agents made dear, and conversations far longer than the team\'s', () => {
  const kinds = (mine, rereads) => taskRules(mine, rereads).map((f) => f.kind);
  const heavy = { top: { cost: 46.85, agentCost: 40.6, agents: 14 }, rereadPerCall: 120_000, mainCalls: 80 };
  const [f] = taskRules(heavy, [120_000, 100_000, 130_000]);
  assert.equal(f.kind, 'subagents');
  assert.match(f.text, /^Sub-agents made 87% of one task's cost \(\$46\.85 at API prices, 14 sub-agents\)/);
  assert.deepEqual(kinds({ ...heavy, top: { cost: 3, agentCost: 2.9, agents: 5 } }, []), [], 'a small task: nothing to say');
  assert.deepEqual(kinds({ ...heavy, top: { cost: 20, agentCost: 8, agents: 5 } }, []), [], 'sub-agents not most of it');
  assert.deepEqual(kinds({ ...heavy, top: { cost: 20, agentCost: 19, agents: 1 } }, []), [], 'one sub-agent is not "many"');
  const long = { top: null, rereadPerCall: 362_000, mainCalls: 400 };
  assert.deepEqual(kinds(long, [127_000, 188_000, 362_000]), ['longconvos'], 'far above the others\' usual');
  assert.match(taskRules(long, [127_000, 188_000, 362_000])[0].text, /re-reads about 362k tokens of context \(the team's usual: 158k\)/);
  assert.deepEqual(kinds({ ...long, mainCalls: 10 }, [127_000, 188_000]), [], 'too few calls to say');
  assert.deepEqual(kinds({ top: null, rereadPerCall: 200_000, mainCalls: 400 }, [127_000, 188_000, 200_000]), [], 'not far above');
});
