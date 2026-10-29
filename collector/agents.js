// The agent catalogue for Node (the helper, the website, the alarms): the same data the pages load as
// /agents.js. See collector/public/agents.js.
import './public/agents.js';

export const Agents = globalThis.JouleAgents;
export const { agent, client, canonicalClient, isRun, planAgents, planLabel, planTool } = Agents;
