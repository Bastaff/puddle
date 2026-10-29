// Every agent Puddle reads on this Mac: one adapter each (docs/agents.md). Order is the order things are listed in.
// Names, icons, clients and what each client can report live in the shared catalogue (collector/public/agents.js);
// an adapter here must have an entry there (test/agents.test.js checks both).
import claudeCode from './claude-code.js';
import codex from './codex.js';
import { agent } from '../../collector/agents.js';

export const ADAPTERS = [claudeCode, codex].map((a) => ({ ...a, name: agent(a.id).name }));
