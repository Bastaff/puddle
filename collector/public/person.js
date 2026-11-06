import { hm, esc, spark, kpiTiles, todayCard, dayChart } from '/you.js';
import { hover, rows, hideTip, learn } from '/tips.js';

export const CAT = {
  run: { label: 'Running commands', short: 'Run', c: 'var(--k-run)', ic: '<rect x="1" y="2" width="14" height="12" rx="3" opacity=".3"/><path d="M4.3 5.4 7 8l-2.7 2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.3" y="9.7" width="4.2" height="2" rx="1"/>' },
  edit: { label: 'Editing code', short: 'Edit', c: 'var(--k-edit)', ic: '<path d="M3 9.8 1.9 13.6a.4.4 0 0 0 .5.5L6.2 13z" opacity=".45"/><path d="M10.9 1.9a1.6 1.6 0 0 1 2.3 0l.9.9a1.6 1.6 0 0 1 0 2.3L6.6 12.6 3.4 9.4z"/>' },
  read: { label: 'Reading code', short: 'Read', c: 'var(--k-read)', ic: '<circle cx="6.8" cy="6.8" r="5.4" opacity=".35"/><circle cx="6.8" cy="6.8" r="2.6"/><rect x="9.4" y="10.7" width="6.2" height="3" rx="1.5" transform="rotate(45 12.5 12.2)"/>' },
  web: { label: 'Web research', short: 'Web', c: 'var(--k-web)', ic: '<circle cx="8" cy="8" r="6.8" opacity=".3"/><ellipse cx="8" cy="8" rx="2.7" ry="6.8"/><rect x="1.2" y="7" width="13.6" height="2" rx="1" opacity=".7"/>' },
  agent: { label: 'Sub-agents', short: 'Agents', c: 'var(--k-agent)', ic: '<path d="M4 8 12 4M4 8l8 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" opacity=".45"/><circle cx="3.8" cy="8" r="2.7"/><circle cx="12.2" cy="3.9" r="2.4"/><circle cx="12.2" cy="12.1" r="2.4"/>' },
  mcp: { label: 'Connected tools', short: 'MCP', c: 'var(--k-mcp)', ic: '<rect x="5" y="1" width="2" height="4.2" rx="1"/><rect x="9" y="1" width="2" height="4.2" rx="1"/><path d="M3.4 4.6h9.2v2.6a4.6 4.6 0 0 1-9.2 0z"/><rect x="7" y="10.8" width="2" height="4.4" rx="1" opacity=".5"/>' },
  other: { label: 'Planning & other', short: 'Other', c: 'var(--k-other)', ic: '<rect x="2" y="2.8" width="12" height="2.6" rx="1.3"/><rect x="2" y="6.7" width="12" height="2.6" rx="1.3" opacity=".6"/><rect x="2" y="10.6" width="7.6" height="2.6" rx="1.3" opacity=".35"/>' },
};
const VERB = { run: 'Running commands', edit: 'Editing code', read: 'Reading code', web: 'Researching', agent: 'Delegating to sub-agents', mcp: 'Using connected tools', other: 'Planning' };
const FLAG_PATHS = { quiet: '<path d="M13.4 10.4A6.1 6.1 0 0 1 5.6 2.6a6.2 6.2 0 1 0 7.8 7.8z"/>', failures: '<rect x="2.4" y="6.6" width="11.2" height="2.8" rx="1.4" transform="rotate(45 8 8)"/><rect x="2.4" y="6.6" width="11.2" height="2.8" rx="1.4" transform="rotate(-45 8 8)"/>', broken: '<path d="M6.6 2.3a1.6 1.6 0 0 1 2.8 0l5.4 9.6a1.6 1.6 0 0 1-1.4 2.4H2.6a1.6 1.6 0 0 1-1.4-2.4z" opacity=".45"/><rect x="7" y="5" width="2" height="5" rx="1"/><circle cx="8" cy="12" r="1.1"/>', stuck: '<path d="M12.6 6.2A5 5 0 0 0 3.4 6M3.4 9.8a5 5 0 0 0 9.2.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 2.6v4.4H9.6z"/><path d="M2 13.4V9h4.4z"/>', hook: '<path d="M10 3.6v5.6a3.6 3.6 0 0 1-7.2 0V8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="3" r="2.2"/>', ratelimit: '<path d="M3.5 1.5h9v2.2c0 1.6-1.4 3-3 4.3 1.6 1.3 3 2.7 3 4.3v2.2h-9v-2.2c0-1.6 1.4-3 3-4.3-1.6-1.3-3-2.7-3-4.3z" opacity=".45"/><path d="M5.4 12.8c0-1.1 1.2-2 2.6-2.8 1.4.8 2.6 1.7 2.6 2.8z"/>', auth: '<circle cx="5" cy="8" r="3.6"/><rect x="7.4" y="6.9" width="7.2" height="2.2" rx="1.1"/><rect x="11.6" y="8" width="2.2" height="3.4" rx="1.1"/>', limit: '<path d="M1.5 11.4a6.5 6.5 0 0 1 13 0z" opacity=".45"/><path d="M8 11.2 11.8 5.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8" cy="11.2" r="1.9"/>', friction: '<path d="M5.6 1.6c1 0 1.7.8 1.7 1.7v3.4l4.3.8c1 .2 1.7 1.2 1.5 2.2l-.6 3.3c-.2.9-.9 1.5-1.8 1.5H6.6c-.6 0-1.1-.3-1.4-.7l-2.9-3.9a1.2 1.2 0 0 1 1.8-1.6l.5.5V3.3c0-.9.7-1.7 1.6-1.7z"/>', rejects: '<circle cx="8" cy="8" r="6.6" opacity=".45"/><rect x="3.6" y="6.8" width="8.8" height="2.4" rx="1.2"/>', context: '<rect x="2" y="6.8" width="12" height="2.4" rx="1.2"/><path d="M8 1.6v3.2M5.9 3 8 5.1 10.1 3M8 14.4v-3.2M5.9 13 8 10.9l2.1 2.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>', heavy: '<path d="M8 1.6 13.6 7.4H10V14H6V7.4H2.4z"/>', version: '<rect x="2" y="2" width="12" height="12" rx="3" opacity=".45"/><path d="M8 4 11.4 7.6H9.2v4H6.8v-4H4.6z"/>' , oldkey: '<circle cx="5" cy="8" r="3.4"/><rect x="7.5" y="6.9" width="7" height="2.2" rx="1.1"/><rect x="11.6" y="8" width="2" height="3.4" rx="1"/>', offline: '<path d="M8 3a7 7 0 0 1 6.6 4.6l-1.9.7A5 5 0 0 0 3.3 8.3l-1.9-.7A7 7 0 0 1 8 3z"/><path d="M8 7a3.4 3.4 0 0 1 3.2 2.3l-1.9.7a1.4 1.4 0 0 0-2.6 0l-1.9-.7A3.4 3.4 0 0 1 8 7z"/><rect x="1.2" y="7" width="13.6" height="1.8" rx=".9" transform="rotate(45 8 8)"/>', app: '<rect x="7" y="1.5" width="2" height="8" rx="1"/><path d="M4.2 6.6l1.4-1.4L8 7.6l2.4-2.4 1.4 1.4L8 10.4z"/><rect x="2" y="12" width="12" height="2.4" rx="1.2"/>', statusline: '<rect x="1.5" y="10.5" width="13" height="3.5" rx="1.75"/><rect x="1.5" y="2" width="13" height="6.5" rx="1.6" opacity=".45"/>', limits: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 2.4a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2z" opacity=".45"/><path d="M8 1.5A6.5 6.5 0 0 1 14.5 8h-2.4A4.1 4.1 0 0 0 8 3.9z"/>', titles: '<rect x="2" y="3" width="12" height="2.2" rx="1.1"/><rect x="2" y="7" width="8" height="2.2" rx="1.1" opacity=".45"/><rect x="2" y="11" width="10" height="2.2" rx="1.1" opacity=".45"/>', macerrors: '<path d="M8 1.6l7 12.4H1z"/><rect x="7.1" y="5.6" width="1.8" height="4.6" rx=".9" fill="var(--surface, #fff)"/><circle cx="8" cy="12" r="1" fill="var(--surface, #fff)"/>' , subagents: '<circle cx="8" cy="3.6" r="2.4"/><circle cx="3.4" cy="12" r="2.2" opacity=".55"/><circle cx="12.6" cy="12" r="2.2" opacity=".55"/><rect x="7.1" y="5" width="1.8" height="4" rx=".9"/><path d="M8 8.4 4 10.6M8 8.4l4 2.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>', longconvos: '<rect x="2" y="2" width="12" height="2.2" rx="1.1"/><rect x="2" y="5.6" width="12" height="2.2" rx="1.1" opacity=".55"/><rect x="2" y="9.2" width="12" height="2.2" rx="1.1" opacity=".55"/><rect x="2" y="12.8" width="7" height="2.2" rx="1.1" opacity=".35"/>' };
export const FLAG_IC = Object.fromEntries(Object.entries(FLAG_PATHS).map(([k, v]) => [k, `<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">${v}</svg>`]));
const icon = (k) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${CAT[k]?.ic || ''}</svg>`;
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const toolName = (t) => String(t || 'unknown').replace(/^mcp__/, '').replace(/__/g, ' · ').replace(/_/g, ' ');
const catOf = (t) => /^(Read|Grep|Glob|LS|NotebookRead)$/.test(t) ? 'read' : /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t) ? 'edit'
  : /^(Bash|BashOutput|KillShell|KillBash|Monitor)$/.test(t) ? 'run' : /^(WebFetch|WebSearch)$/.test(t) ? 'web'
  : /^(Agent|Task|Skill|Workflow)$/.test(t) ? 'agent' : /^mcp(__|_tool$)/.test(String(t)) ? 'mcp' : 'other';

export function liveState(p) {
  const n = p.now || {}, since = n.lastTs ? Date.now() - n.lastTs : Infinity;
  if (since < 90_000) {
    const doing = n.toolTs && Date.now() - n.toolTs < 120_000 ? n.doing : null;
    return { kind: 'work', text: doing ? VERB[doing] : 'Thinking', sub: n.promptTs ? `prompt ${ago(n.promptTs)} ago` : '', c: doing ? CAT[doing].c : 'var(--k-think)' };
  }
  if (since < 30 * 60_000) return { kind: 'idle', text: `Idle for ${ago(n.lastTs)}`, sub: '', c: 'var(--muted)' };
  const seen = n.everTs || p.lastActive;
  return { kind: 'away', text: seen ? `Away · last active ${ago(seen)} ago` : 'No activity yet', sub: '', c: 'var(--axis)' };
}

function workCard(p, tools) {
  const tot = Object.values(p.mix || {}).reduce((a, b) => a + b, 0);
  const kinds = Object.entries(p.mix || {}).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
  const list = kinds.map(([k, v]) => `<div class="wk-row" data-k="${k}"><span class="wk-l" style="--c:${CAT[k].c}">${icon(k)}${CAT[k].label}</span>
    <div class="wk-b"><i style="width:${pct(v, kinds[0][1])}%;background:${CAT[k].c}"></i></div><b>${pct(v, tot)}%</b><small>${v.toLocaleString()} steps</small></div>`).join('');
  return `<section class="card pv-work" data-learn="pv:work"><header><h2>What the agent worked on</h2><span class="muted">${tot.toLocaleString()} steps</span></header>
    ${tot ? `<div class="wkinds">${list}</div>` : '<p class="muted">No agent steps in this period.</p>'}</section>`;
}

const pad2 = (n) => String(n).padStart(2, '0');
const clock = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const PLAN_OLD = 30 * 60_000;
const whenText = (reset, ts) => {
  const parts = [];
  if (reset) { const d = new Date(reset); parts.push(`resets ${d.toDateString() === new Date().toDateString() ? clock(reset) : `${d.toLocaleDateString([], { weekday: 'short' })} ${clock(reset)}`}`); }
  if (!reset || Date.now() - ts > PLAN_OLD) parts.push(`as of ${ago(ts)} ago`);
  return parts.join(' · ');
};
function planCard(plan) {
  const line = (label, v, reset, ts) => (v == null ? '' : `<div class="pl-row${v >= 95 ? ' hot' : v >= 80 ? ' warm' : ''}${Date.now() - ts > PLAN_OLD ? ' old' : ''}"><span class="pl-l">${label}</span>
    <span class="pl-b"><i style="width:${Math.max(2, v)}%"></i></span><span class="pl-v"><b>${Math.round(v)}% used</b> · ${Math.max(0, 100 - Math.round(v))}% left</span><small>${whenText(reset, ts)}</small></div>`);
  const body = plan?.stale
    ? `<p class="muted">Unknown right now: no reading since the window started over (last one ${whenText(null, plan.seen).replace('as of ', '')}). Some apps never report plan limits (VS Code, scripts); they show when the terminal, the Claude app or Codex is used.</p>`
    : plan?.agents?.length
    ? plan.agents.map((a) => `${plan.agents.length > 1 ? `<h3 class="pl-a">${esc(a.label || 'Claude')}</h3>` : ''}${line('5 hours', a.five_pct, a.five_reset, a.five_ts ?? a.ts)}${line('Week', a.week_pct, a.week_reset, a.week_ts ?? a.ts)}${line(a.month_from === 'claude-code' ? 'Spend' : 'Month', a.month_pct, a.month_reset, a.month_ts ?? a.ts)}`).join('')
    : '<p class="muted">Not seen yet. It shows once Puddle sees the Claude app or Codex being used on this Mac.</p>';
  return `<section class="card pv-plan" data-learn="pv:plan"><header><h2>Plan limits</h2>${plan?.agents?.length === 1 ? `<span class="muted">${esc(plan.agents[0].label || '')}</span>` : ''}</header>${body}</section>`;
}

function sizeCard(p) {
  const c = p.context; if (!c) return '';
  const lvl = c.full >= 2 || c.max >= 98 ? ' hot' : c.typical >= 70 || c.full ? ' warm' : '';
  return `<section class="card pv-size" data-learn="pv:size"><header><h2>Conversation size</h2></header>
    <div class="sz${lvl}"><span class="sz-b"><i style="width:${Math.max(2, c.typical)}%"></i><em style="left:${Math.min(100, c.max)}%"></em></span>
      <span class="sz-v"><b>${c.typical}%</b> of what the model can hold, usually</span></div>
    <ul class="sz-facts"><li><b>${c.max}%</b> the largest</li><li><b>${c.full}</b> of ${c.sessions} nearly full (90%+)</li><li><b>${p.compactions || 0}</b> squeezed to make room</li></ul></section>`;
}

function projectsCard(recent = [], links = {}, range = '7d') {
  if (!recent.length) return '';
  return `<section class="card pv-projects" data-learn="pv:projects"><header><h2>Recent conversations</h2></header>
    ${globalThis.recentHTML(recent, { time: mins, ago, href: links.project ? (c) => links.project(c, range) : null, seeAll: links.work ? links.work(range) : null })}</section>`;
}

function handsCard(p) {
  const r = p.runs || {}, short = Math.max(0, (r.prompts || 0) - (r.long || 0) - (r.chat || 0));
  const seg = (n, c, label) => (n ? `<i style="flex:${n};background:${c}" data-seg="${label}" data-n="${n}"></i>` : '');
  const word = !r.prompts ? '—' : r.long / r.prompts >= 0.15 ? 'Long tasks' : r.chat / r.prompts >= 0.5 ? 'Questions' : 'Short tasks';
  return `<section class="card pv-hands" data-learn="pv:hands"><header><h2>Task size</h2><span class="muted">${(r.prompts || 0).toLocaleString()} prompts</span></header>
    <p class="big-word">${word}</p>
    ${r.prompts ? `<div class="hbar">${seg(r.chat, 'var(--k-think)', 'Questions')}${seg(short, 'var(--s1)', 'Short tasks')}${seg(r.long, 'var(--s7)', 'Long tasks')}</div>
    <div class="hleg"><span><i style="background:var(--k-think)"></i>Questions ${r.chat}</span><span><i style="background:var(--s1)"></i>Short tasks ${short}</span><span><i style="background:var(--s7)"></i>Long tasks (20+ steps) ${r.long}</span></div>` : ''}
    <dl class="facts">
      <div><dt>Steps per prompt</dt><dd>${p.toolsPerPrompt == null ? '—' : p.toolsPerPrompt.toFixed(1)}</dd></div>
      <div><dt>Longest run</dt><dd>${r.longest || 0} steps</dd></div>
      <div><dt>Auto-approved</dt><dd>${p.autoApproved == null ? '—' : `${Math.floor(p.autoApproved * 100)}%`}</dd></div>
      <div><dt>Stopped by hand</dt><dd>${(p.rejects || 0).toLocaleString()}</dd></div>
    </dl></section>`;
}

function flagsCard(p) {
  const f = p.flags || [];
  return `<section class="card issues pv-flags" data-learn="pv:flags"><header><h2>Needs a look</h2>${f.length ? `<span class="chip">${f.length}</span>` : ''}</header>
    ${f.length ? `<ul class="attention">${f.map((x) => `<li class="att ${x.level}${x.acknowledged ? ' ack' : ''}"><span class="att-ic">${FLAG_IC[x.kind] || '!'}</span><span class="att-t">${esc(x.text)}</span></li>`).join('')}</ul>`
      : '<p class="ok">✓ Nothing needs a look</p>'}</section>`;
}

function tiles(p, r) {
  const runs = p.runs || {};
  const meter = (v, c) => `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="22" width="100" height="5" rx="2.5" fill="var(--wash)"/><rect x="0" y="22" width="${Math.max(0, Math.min(100, v * 100))}" height="5" rx="2.5" fill="${c}"/></svg>`;
  return kpiTiles([
    { label: 'Today', value: hm(r.today.minutes), unit: 'h', spark: spark(r.today.byHour, 'var(--s2)'), tip: 'Active time with agents today' },
    { label: 'This week', value: hm(r.week.minutes), unit: 'h', spark: spark(r.week.days.map((d) => d.minutes), 'var(--s1)'), tip: 'Monday to today' },
    { label: 'Handed over', value: `${pct(runs.long || 0, runs.prompts || 0)}%`, unit: 'of prompts', spark: meter(runs.prompts ? runs.long / runs.prompts : 0, 'var(--s7)'), tip: 'Prompts the agent worked on for 20+ steps on its own' },
    { label: 'Ran smoothly', value: `${pct(runs.smooth || 0, runs.prompts || 0)}%`, unit: 'of prompts', spark: meter(runs.prompts ? runs.smooth / runs.prompts : 0, 'var(--good)'), tip: 'Prompts where no step failed' },
    { label: 'Outside hours', value: `${pct(p.hours?.outside || 0, p.hours?.total || 0)}%`, unit: 'of time', spark: meter(p.hours?.total ? p.hours.outside / p.hours.total : 0, 'var(--s4)'), tip: 'Evenings, nights and weekends, in their own time zone' },
  ]);
}

const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const mins = (m) => (m >= 60 ? `${hm(m)} h` : m > 0 && m < 1 ? 'under 1 min' : `${Math.round(m)} min`);
function attachTips(el, p, r, tools, st, fresh) {
  const runs = p.runs || {}, n = p.now || {};
  const stEl = fresh.has('head') && el.querySelector('.pv-state');
  if (stEl) { stEl.dataset.learn = 'pv:state';
    hover(stEl, () => `<b>${esc(st.text)}</b>` + rows([['Last tool', esc(toolName(n.tool || '—'))], ['Last step', n.lastTs ? `${ago(n.lastTs)} ago` : '—'], ['Last prompt', n.promptTs ? `${ago(n.promptTs)} ago` : '—']])); }
  const k = fresh.has('tiles') ? el.querySelectorAll('.pv-tiles .kpi') : [], plan = p.five_pct == null && p.week_pct == null;
  const T = [
    ['pv:today', () => `<b>Today</b>` + rows([['Active time', mins(r.today.minutes)], ['Busiest hour', (() => { const m = Math.max(...r.today.byHour); return m ? hh(r.today.byHour.indexOf(m)) : '—'; })()]])],
    ['pv:week', () => `<b>This week</b>` + rows(r.week.days.map((d, i) => [WD[i], d.kind === 'ahead' ? '—' : mins(d.minutes)]))],
    ['pv:handover', () => `<b>Handed over</b>` + rows([['Long runs (20+ steps)', `${runs.long || 0} of ${runs.prompts || 0}`], ['Longest run', `${runs.longest || 0} steps`]])],
    ['pv:smooth', () => `<b>Ran smoothly</b>` + rows([['Without a failed step', `${runs.smooth || 0} of ${runs.prompts || 0}`], ['Tool calls failed', `${(p.toolFail || 0).toLocaleString()} of ${(p.tools || 0).toLocaleString()}`]])],
    ...(plan ? [] : [['pv:plan', () => `<b>Plan used</b>` + rows([['5-hour allowance', `${Math.round(p.five_pct ?? 0)}%`], ['Weekly allowance', `${Math.round(p.week_pct ?? 0)}%`]])]]),
    ['pv:hours', () => `<b>Outside hours</b>` + rows([['Weekdays 08–19', mins(p.hours?.day || 0)], ['Evenings 19–24', mins(p.hours?.evening || 0)], ['Nights 0–8', mins(p.hours?.night || 0)], ['Weekends', mins(p.hours?.weekend || 0)]])],
  ];
  k.forEach((node, i) => { if (!T[i]) return; node.removeAttribute('title'); node.dataset.learn = T[i][0]; hover(node, T[i][1]); });
  const tot = Object.values(p.mix || {}).reduce((a, b) => a + b, 0);
  for (const row of fresh.has('work') ? el.querySelectorAll('.wk-row') : []) {
    const kind = row.dataset.k, mine = tools.filter((t) => catOf(t.tool) === kind);
    hover(row, () => `<b>${CAT[kind].label}</b>` + rows([['Steps', (p.mix[kind] || 0).toLocaleString()], ['Share', `${pct(p.mix[kind] || 0, tot)}%`],
      ...mine.slice(0, 4).map((t) => [toolName(t.tool), t.calls.toLocaleString(), CAT[kind].c])]));
  }
  for (const seg of fresh.has('hands') ? el.querySelectorAll('.hbar [data-seg]') : []) hover(seg, () => `<b>${esc(seg.dataset.seg)}</b>` + rows([['Prompts', seg.dataset.n], ['Share', `${pct(+seg.dataset.n, runs.prompts || 0)}%`]]));
  const day = fresh.has('today') && el.querySelector('#you-day'); if (day) { day.closest('.card').dataset.learn = 'pv:day';
    hover(day, (e) => { const b = day.getBoundingClientRect(), h = Math.max(0, Math.min(23, Math.floor(((e.clientX - b.left) / b.width) * 24)));
      return `<b>${hh(h)}–${hh(h + 1)}</b>` + rows([['Today', mins(r.today.byHour[h] || 0), 'var(--s2)'], ['Typical day', mins(r.typicalDay[h] || 0), 'var(--axis)']]); }); }
}

const RANGES = { '1d': ['1D', 1], '7d': ['7D', 7], '30d': ['30D', 30], '90d': ['90D', 90] };

export function mountPerson(el, { api, cards = null, stream = null, you = false, back = null, links = {}, fixed = null }) {
  let range = '7d', data = null, timer = null;
  try { range = localStorage.getItem('pv-range') || '7d'; } catch {}
  if (!RANGES[range]) range = '7d';
  const headRange = document.querySelector('header.bar #range'), headLearn = document.querySelector('header.bar #learn-btn');
  if (headLearn) headLearn.onclick = () => { learn.on = !learn.on; hideTip(); draw(); };
  const paintBar = () => {
    if (headRange) {
      for (const b of headRange.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.r === range));
      for (const b of headRange.querySelectorAll('button')) b.onclick = () => { range = b.dataset.r; try { localStorage.setItem('pv-range', range); } catch {} paintBar(); load(); };
    }
    headLearn?.setAttribute('aria-pressed', String(learn.on));
  };
  paintBar();
  let held = false;
  const layout = Layout.mount('person', el, { fixed, load: Layout.account.load, save: Layout.account.save,
    onShow: (id) => { if (id === 'recent') load(); else if (id === 'calendar' || id === 'lines') { draw(); if (lastParams) fetchCard(id, lastParams); } else draw(); },
    onDone: () => { if (held) { held = false; draw(); } }, onResize: () => requestAnimationFrame(draw) });
  const cardsHTML = (p, r, tools) => {
    const built = {
      tiles: () => `<section class="kpis headline pv-tiles">${tiles(p, r)}</section>`,
      work: () => workCard(p, tools),
      recent: () => projectsCard(data.recent || [], links, range),
      lines: () => (data.codeLines?.length ? '<section class="card pv-lines" data-learn="pv:lines"><header><h2>Code changes</h2></header><div id="pv-lines"></div></section>' : ''),
      today: () => todayCard(r.today, { typical: r.typicalDay, nowHour: ((r.now + r.tz * 60_000) % 864e5) / 36e5 }),
      prompts: () => (you || cards ? '<section class="card pv-prompts" data-learn="pv:prompts"></section>' : ''),
      plan: () => (you || p.plan ? planCard(p.plan) : ''),
      size: () => sizeCard(p), flags: () => flagsCard(p), hands: () => handsCard(p),
      calendar: () => '<section class="card pv-cal" data-learn="pv:rhythm"><header><h2>Tokens per day</h2></header><div class="cal" id="pv-cal"></div></section>',
    };
    const drawnBy = { today: () => JSON.stringify([r.today.byHour, r.typicalDay, r.now]), prompts: () => JSON.stringify(data.lastDay || null), calendar: () => JSON.stringify([data.daily || [], data.range?.from]),
      lines: () => JSON.stringify([data.codeLines || [], data.range?.from]) };
    return Object.entries(built).filter(([id]) => layout.visible(id)).map(([id, make]) => {
      const html = make().replace(/^\s*<(\w+)/, `<$1 data-card="${id}"`);
      return { key: id, html, sig: html + (drawnBy[id]?.() || '') };
    });
  };
  const parts = new Map();
  function patch(list) {
    const keep = new Set(), fresh = new Set();
    for (const { key, html, sig } of list) {
      if (!html.trim()) continue;
      keep.add(key);
      const had = parts.get(key);
      if (had?.node.parentNode === el && had.sig === sig) continue;
      const t = document.createElement('template'); t.innerHTML = html.trim();
      const node = t.content.firstElementChild; if (!node) continue;
      if (had?.node.parentNode === el) had.node.replaceWith(node);
      else { const next = list.slice(list.findIndex((x) => x.key === key) + 1).map((x) => parts.get(x.key)?.node).find((n) => n?.parentNode === el); el.insertBefore(node, next || null); }
      parts.set(key, { node, sig }); fresh.add(key);
    }
    for (const [k, v] of parts) if (!keep.has(k)) { v.node.remove(); parts.delete(k); }
    return fresh;
  }
  const draw = () => {
    if (!data || document.body.classList.contains('leaving')) return;
    if (layout.arranging()) { held = true; return; }
    const { person: p, rhythm: r, tools } = data, st = liveState(p);
    const name = you ? 'Me' : (p.name || (p.email || '').split('@')[0] || 'Someone');
    document.body.dataset.who = name;
    if (!you && !fixed) globalThis.PuddleBar?.title(name);
    const head = you || fixed ? `<div class="pv-bar"><span class="pv-state ${st.kind}" style="--c:${st.c}"><i></i>${esc(st.text)}</span>${fixed ? '' : globalThis.signalsHTML?.(p) || ''}</div>`
      : `<section class="card pv-head" style="--c:${st.c}">
        <div class="pv-who"><h1>${esc(name)}${globalThis.signalsHTML?.(p) || ''}</h1><span class="pv-state ${st.kind}"><i></i>${esc(st.text)}${st.sub ? ` <small>· ${esc(st.sub)}</small>` : ''}</span></div>
      </section>`;
    if (!parts.size) el.innerHTML = '';
    const fresh = patch([{ key: 'head', html: head, sig: head }, ...cardsHTML(p, r, tools)]);
    layout.apply();
    const nowHour = ((r.now + r.tz * 60_000) % 864e5) / 36e5;
    if (fresh.has('today') && el.querySelector('#you-day')) dayChart(el.querySelector('#you-day'), r.typicalDay, r.today.byHour, nowHour);
    if (fresh.has('prompts')) globalThis.mountPrompts?.(parts.get('prompts')?.node, data.lastDay, { hover, rows });
    if (fresh.has('calendar') && el.querySelector('#pv-cal')) globalThis.mountCalendar(el.querySelector('#pv-cal'), data.daily || [], { from: data.range?.from ?? r.now, now: r.now, onDraw: (byDay) => {
      for (const c of el.querySelectorAll('#pv-cal .cal-g .cal-d')) hover(c, () => { const x = byDay.get(c.dataset.day) || {};
        return `<b>${esc(globalThis.calDayName(c.dataset.day))}</b>` + rows([['Tokens', globalThis.calTok(x.tokens)], ['Prompts', (x.prompts || 0).toLocaleString()]]); });
    } });
    document.body.classList.toggle('learn', learn.on);
    paintBar();
    if (fresh.has('lines') && data.codeLines?.length && el.querySelector('#pv-lines')) globalThis.mountCodeLines(el.querySelector('#pv-lines'), data.codeLines, { from: data.range?.from ?? r.now, now: r.now, hover, rows });
    if (fresh.has('head')) for (const g of parts.get('head').node.querySelectorAll('.sig')) hover(g, () => globalThis.signalTip(g.dataset.sig, p));
    attachTips(el, p, r, tools, st, fresh);
  };
  let busy = false, more = false, shown = null;
  async function load() {
    if (busy) { more = true; return; }
    busy = true;
    try { await loadOnce(); } finally { busy = false; if (more) { more = false; load(); } }
  }
  async function loadOnce() {
    const days = RANGES[range][1], to = Date.now() + 60_000;
    const from = Date.now() - days * 864e5;
    const params = { from, to, tz: -new Date().getTimezoneOffset() };
    const key = `joule-person:${location.pathname}${location.search}|${range}|${layout.visible('recent') ? '' : 'skip'}`;
    if (shown !== key) {
      shown = key;
      try { const v = JSON.parse(sessionStorage.getItem(key) || 'null'); if (v && Date.now() - v.at < 30 * 60_000) { data = { ...v.data, ...cardData }; draw(); globalThis.PuddlePerf?.drawn(you ? 'me' : 'person'); } } catch {}
    }
    lastParams = params;
    const bar = globalThis.PuddleBar;
    let res;
    try { res = await fetch(api(params) + (cards ? '&parts=core' : '') + (layout.visible('recent') ? '' : '&skip=recent')); } catch { bar?.fetched('fail'); return; }
    if (!res.ok && res.status !== 404 && data) { bar?.fetched(res.status === 503 ? 'busy' : 'fail'); return; }
    bar?.fetched('ok');
    if (!res.ok) {
      const empty = fixed ? '<p class="muted">Nothing to show here yet.</p>' : you ? '<h2>Nothing here yet</h2><p class="muted">This page fills in by itself once Puddle runs on your Mac and you work with Claude Code. Just installed Puddle? Quit and reopen Claude Code once.</p>'
        : '<p class="muted">Nothing to show for this person here: no shared work yet.</p>';
      parts.clear();
      el.innerHTML = `<section class="card" style="grid-column:1/-1">${res.status === 404 ? empty : '<p class="muted">Could not load this page.</p>'}</section>`; return;
    }
    const fresh = await res.json();
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: fresh })); } catch {  }
    data = { ...fresh, ...cardData };
    draw();
    globalThis.PuddlePerf?.drawn(you ? 'me' : 'person'); globalThis.PuddleHeal?.drawn();
    if (cards) {
      await layout.ready;
      if (layout.visible('lines')) fetchCard('lines', params);
      if (layout.visible('prompts')) fetchCard('prompts', params);
      if (!layout.visible('calendar')) return;
      if (calSeen) fetchCard('calendar', params);
      else watchCal(params);
    }
  }
  const cardData = {};
  let calSeen = false, lastParams = null;
  async function fetchCard(name, params) {
    const r = await fetch(cards(name, params)).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r || !data) return;
    Object.assign(cardData, r); Object.assign(data, r); draw(); globalThis.PuddlePerf?.card(name);
  }
  let calParams = null;
  function watchCal(params) { calParams = params; nearCal(); }
  function nearCal() {
    if (calSeen || !calParams) return;
    const c = el.querySelector('.pv-cal');
    if (!layout.visible('calendar')) return;
    if (!c || c.getBoundingClientRect().top < (innerHeight || 800) + 600) { calSeen = true; fetchCard('calendar', calParams); }
  }
  addEventListener('scroll', nearCal, { passive: true });
  addEventListener('resize', nearCal, { passive: true });
  load();
  let lastLoad = Date.now(), liveTimer = null;
  const soon = () => { if (liveTimer) return; liveTimer = setTimeout(() => { liveTimer = null; lastLoad = Date.now(); load().then(() => globalThis.PuddlePerf?.live('drawn')); }, Math.max(0, lastLoad + 60_000 - Date.now())); };
  if (stream) {
    const connect = () => { try {
      const es = new EventSource(stream);
      globalThis.PuddleBar?.stream(false);
      es.onopen = () => globalThis.PuddleBar?.stream(true);
      es.addEventListener('version', (ev) => globalThis.PuddleHeal?.saw(ev.data));
      es.addEventListener('update', (ev) => { try { const d = JSON.parse(ev.data); if (d?.version) globalThis.PuddleHeal?.saw(d.version); } catch {}
        globalThis.PuddlePerf?.live('arrived'); soon(); });
      es.onerror = () => { globalThis.PuddleBar?.stream(false); if (es.readyState === EventSource.CLOSED) setTimeout(() => { connect(); soon(); }, 5000 + Math.random() * 10_000); };
    } catch {} };
    connect();
  }
  addEventListener('puddle:online', () => load());
  setInterval(draw, 30_000);
  return { reload: load };
}
