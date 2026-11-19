const MIN = 60_000, HOUR = 3_600_000, STEP = 5 * MIN, GAP = 3 * HOUR;
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SIM = /ios_?simulator|xcode/i;
const BROWSER = /claude_browser|claude-in-chrome|playwright|puppeteer|browser/i;
const CMDS = ['test', 'build', 'commit', 'push', 'deploy'];

const kindOf = (c) => (c.sim >= 3 ? 'ios' : c.web >= 5 ? 'web' : c.tools ? 'code' : 'chat');

export function workDays(rows, { tzMin = 0 } = {}) {
  const off = Math.round(tzMin) * MIN;
  const dayKey = (t) => new Date(t + off).toISOString().slice(0, 10);
  const hourKey = (t) => Math.floor((t + off) / HOUR);
  const sessions = new Map();
  for (const r of rows) {
    if (!r.session_id) continue;
    const s = sessions.get(r.session_id) || { ev: [], c: { sim: 0, web: 0, tools: 0 } };
    const ts = Number(r.ts);
    s.ev.push({ ts, name: r.name, tool: r.tool_name, cmd: r.cmd_kind, ext: r.ext });
    if (r.name === 'tool_result') { s.c.tools++; if (SIM.test(r.tool_name || '')) s.c.sim++; else if (BROWSER.test(r.tool_name || '')) s.c.web++; }
    sessions.set(r.session_id, s);
  }
  const hours = new Map(), busy = new Map(), days = new Map();
  const actions = { ios: { checks: 0, builds: 0 }, web: { checks: 0, edits: 0 }, code: { edits: 0, commands: 0 } };
  const hour = (h) => hours.get(h) || (hours.set(h, { agent: 0, wait: 0 }), hours.get(h));
  const day = (k) => days.get(k) || (days.set(k, { day: k, working: 0, waiting: 0, peak: 0, kinds: {}, cmd: {}, ext: {} }), days.get(k));
  for (const s of sessions.values()) {
    s.ev.sort((a, b) => a.ts - b.ts);
    const kind = kindOf(s.c), steps = new Set(), seen = new Set();
    for (const e of s.ev) {
      if (e.name === 'user_prompt') continue;
      const step = Math.floor(e.ts / STEP);
      if (!steps.has(step)) { steps.add(step); hour(hourKey(e.ts)).agent += 5; }
      if (!seen.has(step)) { seen.add(step); busy.set(step, (busy.get(step) || 0) + 1); }
      const d = day(dayKey(e.ts));
      d.kinds[kind] = (d.kinds[kind] || 0) + 1;
      if (e.name !== 'tool_result') continue;
      if (e.cmd && CMDS.includes(e.cmd)) d.cmd[e.cmd] = (d.cmd[e.cmd] || 0) + 1;
      if (e.ext) d.ext[e.ext] = (d.ext[e.ext] || 0) + 1;
      const tool = e.tool || '';
      if (kind === 'ios') { if (SIM.test(tool)) actions.ios.checks++; if (e.cmd === 'build') actions.ios.builds++; }
      else if (kind === 'web') { if (BROWSER.test(tool)) actions.web.checks++; else if (EDITS.has(tool)) actions.web.edits++; }
      else if (kind === 'code') { if (EDITS.has(tool)) actions.code.edits++; else if (tool === 'Bash') actions.code.commands++; }
    }
    const prompts = s.ev.map((e, i) => (e.name === 'user_prompt' ? i : -1)).filter((i) => i >= 0);
    for (let j = 0; j + 1 < prompts.length; j++) {
      let end = null;
      for (let i = prompts[j] + 1; i < prompts[j + 1]; i++) end = s.ev[i].ts;
      const next = s.ev[prompts[j + 1]].ts;
      if (end == null || next - end > GAP) continue;
      for (let t = end; t < next; t += STEP) hour(hourKey(t)).wait += Math.min(5, (next - t) / MIN);
    }
  }
  for (const [h, o] of hours) {
    const k = new Date(h * HOUR).toISOString().slice(0, 10), d = days.get(k);
    if (!d) continue;
    const agent = Math.min(60, o.agent), wait = Math.max(0, Math.min(60 - agent, o.wait));
    d.working += agent; d.waiting += wait;
  }
  for (const [step, n] of busy) { const d = days.get(dayKey(step * STEP)); if (d) d.peak = Math.max(d.peak, n); }
  return { days: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => ({ ...d, working: Math.round(d.working), waiting: Math.round(d.waiting) })), actions };
}
