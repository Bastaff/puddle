'use strict';

const LEARN = (() => {
  const T = {
    'pv:state': 'What this person\'s agent is doing right now: the kind of step it is taking, thinking between steps, idle (a few minutes quiet) or away.',
    'pv:range': 'The time window the work and Task size cover: today since midnight, or the last 7 or 30 days.',
    'pv:work': 'Every step the agent took, grouped by what it was for. Running commands = the terminal, Editing code = changing files, Connected tools = MCP connectors such as a browser or Slack.',
    'pv:tools': 'The individual tools the agent used most. Red = the share of calls that failed.',
    'pv:plan': 'How much of your subscription is used and left: the 5-hour window and the week, per account. From the Claude app\'s own record (and Codex). A window that has reset counts as 0.',
    'pv:lines': 'Lines of code your agents added and removed, per project (counts only, never the code). Each line is a project\'s running total, so you see it grow or shrink.',
    'pv:size': 'How full your conversations get: the share of what the model can hold, at the largest point of each conversation. Near full, the agent forgets early parts or has to squeeze the conversation; a fresh one per task helps.',
    'pv:projects': 'The latest conversations, by the title Claude Code gave them, with their project (its git repository, or the folder when there is none), how long each was worked on and when. Open one to see how it spent its tokens; "See all" lists every one.',
    'pv:flags': 'Things worth a look, found by fixed rules: a tool or connector that keeps failing, rate limits, being stuck retrying, an old Claude Code, or having stopped. Nothing here means nothing unusual.',
    'pv:hands': 'Task size: how big the tasks are that get handed over: questions (no tools), short tasks, or long tasks of 20+ steps without stepping in.',
    'pv:prompts': 'Your prompts in the window you pick (15 minutes to 24 hours), in time slots: above, the tokens each slot\'s prompts took (re-reading the conversation counts too); below, how full the fullest conversation among them got (red from 90%, the dashed line). Hover a slot for its numbers.',
    'pv:day': 'Today hour by hour (orange) over the typical day (grey: the average of active days in the last 8 weeks). The dashed line is now.',
    'pv:rhythm': 'Tokens used each day. Beige is a day without agent work; the deeper the blue, the more tokens. Days in the chosen range are full colour, earlier ones faded. Hover a day for its numbers.',
    'bar:range': 'The time window everything on the page covers. 1D = today since midnight, 7D/30D/90D = the last 7, 30 or 90 days. Changes like ▲12% compare with the window just before it.',
    'bar:arrange': 'Arrange the page your way: the cards jiggle; drag one anywhere, pick its size (S, M, L or Full), or tap the eye to hide it. Hidden cards wait in the tray under this button (the number on it) and aren’t loaded until you bring one back: tap it, or drag it where you want it. Kept with your account.',
    'bar:health': 'Whether what you see is current. Live: it updates by itself. Connecting: the live connection is reopening. No internet, Busy or Reconnecting: you\u2019re looking at what was here at the time it says, and it catches up by itself. On a team\u2019s page a click shows the details.',
    'bar:sound': 'Soft sounds when something happens: a prompt, an answer, a tool, a failure. Each person has a different pitch, so you can hear who is working.',
    'bar:theme': 'Light or dark look. Auto follows your computer’s setting.',
    'bar:learn': 'Learn mode: hover anything for an explanation like this one. Turn it off when you know your way around.',
    'bar:demo': 'You are looking at a made-up team so you can see how the dashboard behaves with many people. Your real data is untouched. Click to go back.',

    'card:summary': 'The period in plain sentences, written from fixed rules over the numbers (no AI guessing). Hover a sentence to see the numbers behind it. Click a person to see their own profile here.',
    'card:prompts': 'The team\'s prompts in the window you pick (15 minutes to 24 hours), in time slots: above, the tokens each slot took, split by person in the colour of their dot in the table; below, how full the fullest conversation got (red from 90%, the dashed line). Hover a slot for who used how much.',
    'card:lines': 'Lines of code added and removed, per project, from the agents\' own records (counts only, never the code). Each line is a project\'s running total (added minus removed), so you see which projects grow and which shrink.',
    'card:projects': 'Active Projects: each person\'s latest conversation, newest first: its title, the project (its git repository, or the folder when there is none), how long it was worked on, and when. Open one to see how it spent its tokens; "See all" lists every conversation, a page at a time.',
    'card:team': 'Everyone on the team, one row each. Read it left to right: what they are doing right now, when they worked, what kind of work, how much, how independently Claude works for them, and how often things fail.',
    'card:timeline': 'Tokens used over time. A token is a small piece of text (roughly ¾ of a word) that Claude reads or writes; it is the unit usage is measured in. Tall bars = busy moments. The line below adds them up. Drag across the chart to zoom in.',
    'card:features': 'Which Claude Code features the team actually uses. The bar shows the share of active people who used it; the faces show who. Useful to spot features nobody has discovered yet.',
    'card:issues': 'Things worth a look, worked out automatically from the data. They are facts, not judgements: someone may simply be on holiday. Click one to focus that person.',
    'card:map': 'Where the team is, based on each person’s time zone (the pin sits on that time zone’s city, not their exact location). A pulsing ring means they are working right now.',
    'card:rhythm': 'Tokens the team used each day. Beige is a day without agent work; the deeper the blue, the more tokens. Days in the chosen range are full colour, earlier ones faded. Hover a day for its numbers.',
    'card:models': 'Which Claude models people use, how hard they let Claude think (effort), and which app they use it from. Cache hits show how much was reused instead of read again, which makes Claude faster and cheaper.',

    'col:now': 'The coloured tile shows what Claude is doing for this person right now: reading, editing, running a command, browsing… It pulses while they are working and turns grey when they are idle or away.',
    'col:lane': 'Their activity across the selected period, left = start, right = now. Each column is a slice of time: height = how many actions Claude took, colours = the kind of work, little dark ticks = their prompts, red dots = bursts of failures. Everyone shares the same scale, so you can compare rows.',
    'col:mix': 'What the agent spends its steps on for this person: the bar shows every kind of work, the words name the top three with their share, and the line below the tools used most. Click a person to open their page.',
    'col:prompts': 'Active time with agents in this period (full bar = the most on the team).',
    'col:autonomy': 'How big the tasks are that this person hands to the agent. Three bars, each as tall as its share of prompts: questions (no steps), short tasks (1–19 steps on its own), long tasks (20+ steps). The word underneath: Long tasks when at least 15% of prompts run 20+ steps, Questions when most use no tools, otherwise Short tasks.',
    'col:limits': 'How much of their plan is used. Outer ring: the 5-hour window; inner ring: the week (Codex: the month). Blue is fine, amber from 80%, red from 95%. Hover for exact numbers and when each resets.',

    'cat:read': 'Reading: Claude looks at files or searches through code to understand it before acting.',
    'cat:edit': 'Editing: Claude changes or creates files.',
    'cat:run': 'Running: Claude runs commands in a terminal, such as tests, builds or scripts.',
    'cat:web': 'Web: Claude searches the internet or reads a web page.',
    'cat:agent': 'Agents: Claude hands part of the job to a helper (a “subagent”) or uses a packaged skill.',
    'cat:mcp': 'MCP: Claude uses a connector to another app or service, such as GitHub, Linear, Slack or a browser.',
    'cat:other': 'Other: planning and bookkeeping, like keeping a to-do list or asking the person a question.',

    'flag:quiet': 'Someone who normally uses Claude Code on most working days has sent nothing for at least 4 working days, clearly longer than their usual breaks. Weekends don’t count, and occasional users never get this flag. It may be holiday, other work, or that they got stuck.',
    'flag:failures': 'Claude’s actions fail far more often for this person than the same kinds of actions do for the rest of the team (statistically clear, at least 20 actions). Often a setup problem: a missing tool, wrong permissions or a broken test environment.',
    'flag:broken': 'One tool or connector fails most of the time (60% or more, at least 6 tries). That is almost always a setup problem, such as an expired login for that connector.',
    'flag:stuck': 'Claude ran into the same failing step 4 or more times in a row inside one prompt, in several prompts. The person probably waited while Claude went in circles.',
    'flag:hook': 'A hook (a small script that runs automatically, e.g. when a conversation starts) errors nearly every time it runs. It is usually silent for the person but broken.',
    'flag:ratelimit': 'Claude’s service told this person to slow down several times (rate limit). Work was paused while Claude waited.',
    'flag:auth': 'Claude’s service refused requests because of a login or permission problem.',
    'flag:limit': 'They are close to their plan’s usage limit and may be slowed down or blocked soon.',
    'flag:friction': 'They approve Claude’s actions by hand very often. Allowing common safe actions in settings would save them clicks.',
    'flag:rejects': 'They often say no when Claude asks to do something. Claude may be misunderstanding what they want.',
    'flag:context': 'Most of their conversations fill Claude’s working memory until it has to summarise and continue (auto-compaction). Starting a new conversation per task keeps Claude sharper.',
    'flag:heavy': 'Each prompt suddenly uses several times more tokens than this person usually needs. Often very long conversations or large files being read again and again.',
    'flag:version': 'They run an older Claude Code than the rest of the team and miss fixes and features. Updating is usually one command.',
    'flag:subagents': 'Most of one task\'s cost came from the sub-agents it started. Each sub-agent call re-reads its own context, so many sub-agents with large contexts add up fast. Giving each one only the files it needs, or a smaller model for plain work (translation, renaming), costs less.',
    'flag:longconvos': 'Their main conversations re-read far more context per model call than the rest of the team. Every call in a long conversation reads all of it again, so starting a fresh conversation per task costs less.',
    'flag:oldkey': 'Claude Code reads its key once per session. Sessions started before this person signed in to Puddle again still send the old key, so their work arrives late. Puddle hands the website that key back at its next check-in (every 2 minutes); nobody has to do anything.',
    'flag:offline': 'Puddle on their Mac checks in every 2 minutes. It hasn’t for over a day: the Mac may be off, or Puddle was quit or removed. Work done meanwhile is sent when Puddle runs again.',
    'flag:app': 'Their Puddle is older than the newest version. Older versions miss fixes such as conversation titles and these setup checks. Puddle offers the update and, from this version on, installs it by itself when idle.',
    'flag:statusline': 'Plan limits from the terminal come from Puddle’s status line in Claude Code. It isn’t there on their Mac (another status line, or settings changed), so the Limits rings can’t fill. Puddle puts it back at its next start.',
    'flag:limits': 'They worked today, but no plan reading is current. VS Code never reports plan limits; the terminal (through Puddle’s status line), the Claude app and Codex do. The ring shows dotted until a reading arrives, never a made-up 0%.',
    'flag:titles': 'Most of their conversations reached the team without a title. Titles come from Claude Code and the Claude app on their Mac; an older Puddle doesn’t read them all.',
    'flag:macerrors': 'Puddle on their Mac reported its own errors in the last day (for example sending plan limits or projects). They are also in Puddle’s error table, so they can be fixed.',

    'feat:skills': 'Skills are packaged instructions Claude can load for a specific job, like making a spreadsheet or following a team process.',
    'feat:mcp': 'MCP connectors link Claude to other tools and services (GitHub, Linear, Slack, a browser…). MCP stands for Model Context Protocol.',
    'feat:subagents': 'Subagents are helpers Claude starts for part of a task, for example to search a large codebase while it keeps working.',
    'feat:web': 'Claude searched the web or read web pages.',
    'feat:edits': 'Claude changed files directly.',
    'feat:mentions': '@-mentions: the person pointed Claude at a specific file or folder by typing @ and its name.',
    'feat:plugins': 'Plugins add ready-made commands, skills or connectors to Claude Code.',

    'mix:Models': 'Claude comes in sizes. Opus = most capable, Sonnet = balanced, Haiku = fastest and lightest. Shares are by tokens.',
    'mix:Effort': 'How much thinking Claude is allowed per step. Higher effort = more careful but slower and uses more tokens.',
    'mix:Client': 'Where people use Claude Code: cli = the terminal, desktop = the Claude desktop app, vscode/jetbrains = inside a code editor.',
    'mix:Cache hits': 'Share of what Claude read that was reused from a cache instead of read fresh. Higher is better: faster and cheaper.',
  };

  const TOOLS = {
    Read: 'Opens and reads a file.',
    Write: 'Creates a new file or replaces a file’s whole content.',
    Edit: 'Changes part of an existing file.',
    MultiEdit: 'Makes several changes to one file at once.',
    NotebookEdit: 'Changes a Jupyter notebook (a document mixing code and results).',
    NotebookRead: 'Reads a Jupyter notebook.',
    Glob: 'Finds files by name pattern, like “all .js files”.',
    Grep: 'Searches inside files for a word or pattern.',
    LS: 'Lists the files in a folder.',
    Bash: 'Runs a command in the terminal, like running tests, installing packages or using git.',
    BashOutput: 'Checks the output of a command that is still running in the background.',
    KillShell: 'Stops a command that was running in the background.',
    KillBash: 'Stops a command that was running in the background.',
    Monitor: 'Watches a running process and waits for it to finish.',
    WebFetch: 'Opens one web page and reads it.',
    WebSearch: 'Searches the internet.',
    Agent: 'Starts a helper agent (subagent) to do part of the task on its own and report back.',
    Task: 'Starts a helper agent (subagent) to do part of the task on its own and report back.',
    Skill: 'Loads a skill: packaged instructions for a specific kind of job.',
    Workflow: 'Runs a scripted workflow that coordinates several agents.',
    TodoWrite: 'Updates Claude’s own to-do list for the task, so the person can follow progress.',
    AskUserQuestion: 'Asks the person a multiple-choice question before continuing.',
    ExitPlanMode: 'Presents a plan for the person to approve before Claude starts changing things.',
    EnterPlanMode: 'Switches into planning mode: Claude explores and plans before making changes.',
    ToolSearch: 'Looks up extra tools Claude can load when it needs them.',
    SlashCommand: 'Runs one of the person’s saved / commands.',
  };
  const SERVERS = {
    claude_browser: 'the browser built into the Claude desktop app',
    'claude-in-chrome': 'the person’s own Chrome browser',
    github: 'GitHub (code hosting, pull requests, issues)',
    linear: 'Linear (issue tracking)',
    slack: 'Slack (team chat)',
    notion: 'Notion (docs and wikis)',
    jira: 'Jira (issue tracking)',
    figma: 'Figma (design)',
    sentry: 'Sentry (error monitoring)',
    terminal: 'the terminal panel of the Claude desktop app',
    visualize: 'inline charts and diagrams in the chat',
  };
  const ACTIONS = [
    [/batch/, 'runs several steps in one go (for example: open a page, click, take a screenshot)'],
    [/navigate|open|goto/, 'opens a page or location'],
    [/screenshot|zoom/, 'takes a picture of the screen to look at it'],
    [/computer|click|type|key|scroll/, 'uses the mouse or keyboard'],
    [/read_page|get_page|page_text|read/, 'reads content'],
    [/find|search|query|list/, 'searches or lists things'],
    [/javascript|script|exec/, 'runs a small script to inspect something'],
    [/preview_start|start/, 'starts something, for example a local preview of an app'],
    [/stop|close|delete|remove/, 'stops, closes or removes something'],
    [/create|post|send|write|update|set|upload/, 'creates or changes something'],
    [/get|fetch|show|context|status/, 'looks something up'],
  ];
  const human = (s) => String(s || '').replace(/[_-]+/g, ' ').trim();

  function tool(name) {
    const n = String(name || '');
    if (TOOLS[n]) return `<b>${esc(n)}</b> is a built-in Claude Code tool. ${TOOLS[n]}`;
    const m = n.match(/^(?:mcp__)?(.+?)__(.+)$/);
    if (m) {
      const [, server, action] = m;
      const key = server.toLowerCase().replace(/^[0-9a-f-]{36}$/, '');
      const who = SERVERS[key] || (key ? human(server) : 'a connector');
      const what = (ACTIONS.find(([re]) => re.test(action.toLowerCase())) || [null, 'performs an action'])[1];
      return `This is an <b>MCP tool</b>: an action Claude takes through a connector to another app. ` +
        `<b>${esc(human(server))}</b> = ${esc(who)}; <b>${esc(human(action))}</b> ${esc(what)}. ` +
        `The name always reads <i>connector__action</i>.`;
    }
    return `<b>${esc(n)}</b> is a tool Claude used. Tools are the actions Claude can take, like reading a file or running a command.`;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let on = false;
  try { on = localStorage.getItem('cu-learn') === '1'; } catch {}
  return {
    get on() { return on; },
    set on(v) { on = v; try { localStorage.setItem('cu-learn', v ? '1' : '0'); } catch {} },
    explain(key) {
      if (!key) return '';
      if (key.startsWith('tool:')) return tool(key.slice(5));
      return T[key] ? esc(T[key]) : '';
    },
    tool,
  };
})();
globalThis.LEARN = LEARN;
