export const SHARE_PARTS = [
  { id: 'today', title: 'Today', line: 'Your day hour by hour, over your usual day', on: true },
  { id: 'work', title: 'What the agent worked on', short: 'Kinds of work', line: 'Kinds of work as shares', sensitive: 'Names the tools behind each kind of work, like the MCP servers you use.', on: false },
  { id: 'calendar', title: 'Tokens per day', line: 'A square a day, the last months', on: false },
  { id: 'prompts', title: 'Prompt by prompt', line: 'The last day, prompt by prompt: tokens and steps', on: false },
  { id: 'lines', title: 'Code changes', line: 'Lines added and removed', sensitive: 'Shows the names of your projects.', on: false },
  { id: 'hands', title: 'Task size', line: 'Questions, short and long tasks', on: false },
  { id: 'size', title: 'Conversation size', line: 'How full your conversations get', on: false },
  { id: 'plan', title: 'Plan limits', line: 'How much of your plan is used', on: false },
  { id: 'flags', title: 'Needs a look', line: 'What Puddle thinks could go better', sensitive: 'Can name your tools and what keeps failing.', on: false },
  { id: 'recent', title: 'Recent conversations', short: 'Conversations', line: 'Your latest conversations', sensitive: 'Shows your conversations\' titles and their projects.', on: false },
];
