import claudeCode from './claude-code.js';
import codex from './codex.js';
import { agent } from '../../collector/agents.js';

export const ADAPTERS = [claudeCode, codex].map((a) => ({ ...a, name: agent(a.id).name }));
