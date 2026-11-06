import { client } from './agents.js';

const WORKDAY = (dow) => dow !== 0 && dow !== 6;

const fmtCache = new Map();
function localDay(ts, tz) {
  const key = tz || 'UTC';
  if (!fmtCache.has(key)) {
    let f;
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: key, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); }
    catch { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); }
    fmtCache.set(key, f);
  }
  const p = Object.fromEntries(fmtCache.get(key).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day: `${p.year}-${p.month}-${p.day}`, dow };
}
const dayNum = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / 86400_000);
const dowOf = (n) => (n + 4) % 7;
function workdaysBetween(a, b) {
  let n = 0;
  for (let d = dayNum(a) + 1; d < dayNum(b); d++) if (WORKDAY(dowOf(d))) n++;
  return n;
}

export function parseVersion(v) {
  const m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
const cmpVersion = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function quietRule(promptTimes, tz, now) {
  if (promptTimes.length < 10) return null;
  const days = [...new Set(promptTimes.map((t) => localDay(t, tz).day))].sort();
  const today = localDay(now, tz);
  const last = days[days.length - 1];
  let gap = workdaysBetween(last, today.day);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: 'numeric', hour12: false }).format(new Date(now)));
  if (WORKDAY(today.dow) && last !== today.day && hour >= 16) gap++;
  if (gap < 4) return null;
  const lastN = dayNum(last);
  const window = [];
  for (let d = lastN; window.length < 20 && d > lastN - 40; d--) if (WORKDAY(dowOf(d))) window.push(d);
  const activeSet = new Set(days.map(dayNum));
  const activeInWindow = window.filter((d) => activeSet.has(d)).length;
  if (activeInWindow < 12) return null;
  const gaps = [];
  for (let i = 1; i < days.length; i++) gaps.push(workdaysBetween(days[i - 1], days[i]));
  gaps.sort((x, y) => x - y);
  const p90 = gaps.length ? gaps[Math.floor(gaps.length * 0.9)] : 0;
  if (gap < Math.max(4, 2 * p90 + 1)) return null;
  return {
    kind: 'quiet', level: gap >= 6 && gap >= 3 * Math.max(1, p90) ? 'warn' : 'info',
    text: `No agent work for ${gap} working days (usually active ${activeInWindow} of 20)`,
    evidence: { gap, activeInWindow, usualMaxBreak: p90, lastDay: last },
  };
}

export function failureRules(tools, ref) {
  const out = [];
  const groups = new Map();
  for (const t of tools) {
    const key = String(t.tool).match(/^mcp__(.+?)__/)?.[0] || t.tool;
    const g = groups.get(key) || { tool: key, calls: 0, fails: 0, exp: 0, members: [] };
    g.calls += t.calls; g.fails += t.fails; g.exp += t.calls * ref(t.tool); g.members.push(t.tool);
    groups.set(key, g);
  }
  const broken = [...groups.values()]
    .filter((g) => g.calls >= 6 && g.fails / g.calls >= 0.6 && g.fails / g.calls >= 3 * (g.exp / g.calls))
    .sort((a, b) => b.fails - a.fails)[0];
  if (broken) {
    out.push({ kind: 'broken', level: 'warn', tool: broken.tool,
      text: `${cap(toolLabel(broken.tool))} failed ${broken.fails} of ${broken.calls} tries: probably a setup problem`,
      evidence: { tool: broken.tool, calls: broken.calls, fails: broken.fails } });
  }
  const rest = tools.filter((t) => !broken || !broken.members.includes(t.tool));
  const n = rest.reduce((a, t) => a + t.calls, 0), f = rest.reduce((a, t) => a + t.fails, 0);
  if (n >= 20) {
    const exp = Math.max(0.01, rest.reduce((a, t) => a + t.calls * ref(t.tool), 0) / n);
    const rate = f / n;
    const z = (f - n * exp) / Math.sqrt(n * exp * (1 - exp));
    if (rate >= 0.1 && rate >= 2 * exp && z >= 3) {
      const worst = [...rest].sort((a, b) => (b.fails - b.calls * ref(b.tool)) - (a.fails - a.calls * ref(a.tool)))[0];
      out.push({ kind: 'failures', level: 'warn',
        text: `${Math.round(rate * 100)}% of the agent's steps fail (about ${Math.round(exp * 100)}% is normal), mostly ${toolLabel(worst.tool)}`,
        evidence: { calls: n, fails: f, expected: +exp.toFixed(3), z: +z.toFixed(1), worst: worst.tool } });
    }
  }
  return out;
}

export function stuckRule(streaks) {
  if (streaks.length < 2) return null;
  const by = new Map(); for (const s of streaks) by.set(s.tool, (by.get(s.tool) || 0) + 1);
  const top = [...by].sort((a, b) => b[1] - a[1])[0][0];
  return { kind: 'stuck', level: streaks.length >= 4 ? 'warn' : 'info',
    text: `Claude kept retrying the same failing step in ${streaks.length} prompts, mostly ${toolLabel(top)}`,
    evidence: { prompts: streaks.length, tool: top, longest: Math.max(...streaks.map((s) => s.length)) } };
}

export function hookRule(hooks) {
  const bad = hooks.filter((h) => h.runs >= 3 && h.errors / h.runs >= 0.8).sort((a, b) => b.errors - a.errors)[0];
  if (!bad) return null;
  return { kind: 'hook', level: 'warn', text: `The “${bad.name}” hook${bad.errors === bad.runs ? ` failed every time (${bad.runs} of ${bad.runs})` : ` failed ${bad.errors} of ${bad.runs} times`}: check its setup in Claude Code’s settings`, evidence: bad };
}

export function apiErrorRule(byStatus, requests) {
  const out = [];
  const n429 = byStatus[429] || 0, auth = (byStatus[401] || 0) + (byStatus[403] || 0);
  if (n429 >= 5 || (n429 >= 3 && n429 / Math.max(1, requests) >= 0.01)) out.push({ kind: 'ratelimit', level: 'warn', text: `Claude had to slow down ${n429} times (too many requests at once)`, evidence: { n429, requests } });
  if (auth >= 2) out.push({ kind: 'auth', level: 'warn', text: `Claude refused ${auth} requests: a sign-in or permission problem`, evidence: { auth } });
  return out;
}

export function limitRule(five, week, plan = null, tzMin = 0) {
  const m = Math.max(five || 0, week || 0);
  if (m < 80) return null;
  const reset = (five || 0) >= (week || 0) ? plan?.five_reset : plan?.week_reset;
  return { kind: 'limit', level: 'warn', text: `Plan almost used up: ${Math.round(m)}%${reset ? ` (${resetWhen(reset, tzMin)})` : ''}`, evidence: { five, week, reset: reset || null } };
}
function resetWhen(t, tzMin, now = Date.now()) {
  const local = new Date(t + tzMin * 60_000), hm = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
  const days = Math.floor((t + tzMin * 60_000) / 864e5) - Math.floor((now + tzMin * 60_000) / 864e5);
  return days <= 0 ? `resets ${hm}` : days === 1 ? `resets tomorrow ${hm}` : `resets in ${days} days`;
}

export function frictionRule(prompts, asksByTool) {
  const asks = asksByTool.reduce((a, t) => a + t.n, 0);
  if (prompts < 10 || asks < 30 || asks / prompts <= 2) return null;
  const top = [...asksByTool].sort((a, b) => b.n - a.n)[0];
  return { kind: 'friction', level: 'info',
    text: `Clicks “allow” about ${Math.round(asks / prompts)} times per prompt, mostly for ${toolLabel(top.tool)}. Allowing it in Claude Code’s settings saves those clicks`,
    evidence: { prompts, asks, top: top.tool } };
}

export function rejectRule(asks, rejects) {
  if (rejects < 8 || rejects / Math.max(1, asks) < 0.25) return null;
  return { kind: 'rejects', level: 'info', text: `Says no to ${Math.round((rejects / asks) * 100)}% of what Claude asks to do (${rejects} of ${asks})`, evidence: { asks, rejects } };
}

export function contextRule(autoCompactions, sessions) {
  if (autoCompactions < 3 || autoCompactions / Math.max(1, sessions) < 0.5) return null;
  return { kind: 'context', level: 'info', text: `Conversations got so long Claude had to squeeze them ${autoCompactions} times (in ${sessions} conversations). Starting a new one per task helps`, evidence: { autoCompactions, sessions } };
}

export function heavyRule(now, usual) {
  if (!usual || usual.prompts < 20 || now.prompts < 10 || !usual.tokens) return null;
  const r = (now.tokens / now.prompts) / (usual.tokens / usual.prompts);
  if (r < 3) return null;
  const each = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${Math.round(x / 1e3)}K` : String(Math.round(x)));
  return { kind: 'heavy', level: 'info', text: `Prompts got much bigger: ${r.toFixed(1)} times the usual tokens each (${each(now.tokens / now.prompts)} vs ${each(usual.tokens / usual.prompts)})`, evidence: { ratio: +r.toFixed(2) } };
}

export function versionRule(mine, newest, versionedPeople) {
  const a = parseVersion(mine), b = parseVersion(newest);
  if (!a || !b || versionedPeople < 2 || cmpVersion(a, b) >= 0) return null;
  const behind = a[0] < b[0] || a[1] < b[1] || b[2] - a[2] >= 10;
  return behind ? { kind: 'version', level: 'info', text: `Uses an older Claude Code (${mine}); others are on ${newest}`, evidence: { mine, newest } } : null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const toolLabel = (t) => {
  const m = String(t || '').match(/^mcp__(.+?)__(.*)$/);
  if (m) return `the ${m[1].replace(/_/g, ' ')} connector`;
  if (t === 'mcp_tool') return 'a connector (MCP) tool';
  const plain = { Bash: 'terminal commands', Read: 'reading files', Edit: 'editing files', MultiEdit: 'editing files', Write: 'writing files',
    Grep: 'searching code', Glob: 'finding files', WebFetch: 'opening web pages', WebSearch: 'web searches', Task: 'sub-agents', NotebookEdit: 'notebook edits' }[t];
  return plain ? `${plain} (${t})` : t || 'a tool';
};

export const LEVEL_RANK = { warn: 0, info: 1 };

const MAC_ERRORS = { 'plan-send': 'sending plan limits', contexts: 'sending projects and titles', scan: "reading Claude Code's files", statusline: 'setting up the status line',
  update: 'updating itself', keys: 'repairing device keys', 'check-in': 'checking in' };
const hhmm = (t, tzMin) => { const d = new Date(t + tzMin * 60_000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const dayOf = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export function setupRules(s, row, { latest = {}, now = Date.now(), tzMin = 0 } = {}) {
  if (!s) return [];
  const out = [], r = s.report || null, day = 864e5;
  const recent = row?.now?.lastTs && now - row.now.lastTs < day;
  if (s.oldKey) out.push({ kind: 'oldkey', level: 'warn', text: 'Claude Code sessions started before their last sign-in send an old key, so their activity arrives late. Puddle takes the key back at its next check-in', evidence: { at: s.oldKey } });
  if (s.alive && now - s.alive > day) out.push({ kind: 'offline', level: 'warn', text: `Puddle hasn't checked in from their Mac since ${dayOf(s.alive)}: new work may not be arriving`, evidence: { alive: s.alive } });
  const outdated = s.alive && !r ? 'unreported' : latest.built && s.built && s.built < latest.built ? 'behind' : null;
  if (outdated === 'unreported') out.push({ kind: 'app', level: 'info', text: 'Puddle on their Mac is an older version: conversation titles and setup checks are missing. It is offering the update', evidence: { app: null } });
  else if (outdated) out.push({ kind: 'app', level: 'info', text: `Puddle on their Mac is out of date (${s.app || 'unknown'}${latest.version ? `; newest ${latest.version}` : ''}): it updates itself`, evidence: { app: s.app, latest: latest.version || null } });
  const clients = Object.fromEntries((row?.clients || []).map((c) => [c.client, c.sessions]));
  const viaLine = Object.entries(clients).filter(([k]) => client(k)?.limits === 'statusline').reduce((a, [, n]) => a + n, 0);
  if (r && r.statusline === false && viaLine) out.push({ kind: 'statusline', level: 'warn', text: "Puddle's status line isn't in their Claude Code settings, so plan limits from the terminal aren't seen. Puddle puts it back at its next start", evidence: { sessions: viaLine } });
  for (const [agent, label] of [['codex', 'Codex'], ['claude-code', 'Claude Code']]) {
    const st = r?.agents?.[agent], used = Object.entries(clients).some(([k, n]) => n && client(k)?.agent === agent);
    if (!used || !st || st === 'connected' || st === 'absent') continue;
    out.push({ kind: `connect-${agent}`, level: st === 'own' ? 'info' : 'warn', evidence: { agent, state: st },
      text: st === 'own' ? `${label} on their Mac has its own telemetry settings, so Puddle leaves it alone: its work reaches the team a minute late, from ${label}'s own files`
        : `${label} on their Mac isn't sending live work yet: Puddle connects it by itself, and it takes effect the next time ${label} starts` });
  }
  const fresh = row?.plan?.seen && now - row.plan.seen < 5 * 3600_000;
  if (recent && !fresh) {
    const top = Object.entries(clients).sort((a, b) => b[1] - a[1])[0]?.[0], c = client(top), when = row?.plan?.seen ? ` (last seen ${dayOf(row.plan.seen)})` : '';
    out.push({ kind: 'limits', level: 'info', evidence: { client: top || null, seen: row?.plan?.seen || null },
      text: c?.limits === 'none' && c.why?.limits ? `Works in ${c.label}. ${c.why.limits}${when}` : `No plan limits seen in the last 5 hours${when}` });
  }
  const byClient = Object.entries(r?.byClient || {}).filter(([, x]) => x.sessions >= 5 && x.titled / x.sessions < 0.3).sort((a, b) => b[1].sessions - a[1].sessions);
  if (!outdated && byClient.length) {
    const [id, x] = byClient[0], c = client(id);
    out.push({ kind: 'titles', level: 'info', evidence: { client: id, ...x },
      text: `Most of their ${c?.label || id} conversations reach the team without a title (${x.titled} of ${x.sessions} this week)${c?.why?.titles ? `: ${c.why.titles}` : ''}` });
  } else if (!outdated && !r?.byClient) {
    const t = s.contexts;
    if (t && t.n >= 5 && t.titled / t.n < 0.3) out.push({ kind: 'titles', level: 'info', text: `Most conversations reach the team without a title (${t.titled} of ${t.n} this week)`, evidence: t });
  }
  const errs = (r?.errors || []).filter((e) => e.n > 0 && e.last && now - e.last < day).sort((a, b) => b.n - a.n);
  if (errs.length) {
    const n = errs.reduce((a, e) => a + e.n, 0), last = Math.max(...errs.map((e) => e.last));
    out.push({ kind: 'macerrors', level: 'warn', text: `Puddle on their Mac ran into problems ${errs.slice(0, 2).map((e) => MAC_ERRORS[e.kind] || e.kind).join(' and ')} (${n} time${n === 1 ? '' : 's'}, last at ${hhmm(last, tzMin)})`, evidence: { errors: errs } });
  }
  return out;
}

export function taskRules(mine, rereads = []) {
  if (!mine) return [];
  const out = [], t = mine.top;
  if (t && t.cost >= 5 && t.agents >= 3 && t.agentCost / t.cost >= 0.7) {
    out.push({ kind: 'subagents', level: 'info', evidence: { cost: Math.round(t.cost * 100) / 100, share: Math.round((t.agentCost / t.cost) * 100), agents: t.agents },
      text: `Sub-agents made ${Math.round((t.agentCost / t.cost) * 100)}% of one task's cost ($${t.cost.toFixed(2)} at API prices, ${t.agents} sub-agents). Giving each sub-agent only the files it needs, or a smaller model for plain work, cuts this` });
  }
  const others = rereads.filter((x) => x !== mine.rereadPerCall), h = others.length / 2;
  const usual = others.length >= 2 ? (others.length % 2 ? others[Math.floor(h)] : (others[h - 1] + others[h]) / 2) : null;
  if (usual && mine.mainCalls >= 50 && mine.rereadPerCall >= 150_000 && mine.rereadPerCall >= 2 * usual) {
    const k = (x) => `${Math.round(x / 1000)}k`;
    out.push({ kind: 'longconvos', level: 'info', evidence: { reread: Math.round(mine.rereadPerCall), usual: Math.round(usual) },
      text: `Their conversations get long: each call re-reads about ${k(mine.rereadPerCall)} tokens of context (the team's usual: ${k(usual)}). A fresh conversation per task costs less` });
  }
  return out;
}
