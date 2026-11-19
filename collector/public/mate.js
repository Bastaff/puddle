import { esc } from '/you.js';
import { CAT, liveState, FLAG_IC } from '/person.js';
import { showTip, hideTip, hover } from '/tips.js';

const RANGES = { '7d': ['Last 7 days', 7], '30d': ['Last 30 days', 30], '90d': ['Last 90 days', 90] };
const ORDER = ['read', 'edit', 'run', 'web', 'agent', 'mcp', 'other'];
const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s7)', 'var(--s5)', 'var(--s4)', 'var(--s6)', 'var(--s8)'];
const WIN = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 };
const nf = (n) => Math.round(n || 0).toLocaleString();
const short = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : nf(n));
const pc = (v) => `${Math.max(0, Math.min(100, +v || 0)).toFixed(2)}%`;
const pad = (n) => String(n).padStart(2, '0');
const clock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hm = (m) => { m = Math.max(0, Math.round(m || 0)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : s < 172800 ? 'yesterday' : `${Math.floor(s / 86400)}d ago`; };
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayLong = (k) => new Date(`${k}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const dayShort = (k) => new Date(`${k}T12:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
const toolName = (t) => String(t || 'unknown').replace(/^mcp__/, '').replace(/__/g, ' · ').replace(/_/g, ' ');
const catOf = (t) => /^(Read|Grep|Glob|LS|NotebookRead)$/.test(t) ? 'read' : /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t) ? 'edit'
  : /^(Bash|BashOutput|KillShell|KillBash|Monitor)$/.test(t) ? 'run' : /^(WebFetch|WebSearch)$/.test(t) ? 'web'
  : /^(Agent|Task|Skill|Workflow)$/.test(t) ? 'agent' : /^mcp(__|_tool$)/.test(String(t)) ? 'mcp' : 'other';
const repo = (n) => (/^[a-z0-9.-]+\.[a-z]+\/.+\/.+/i.test(n || '') ? n.split('/').pop() : n || 'Other');
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return SLOTS[h % SLOTS.length]; };

const tips = [];
const tip = (title, pairs = []) => { tips.push({ title, pairs }); return `data-t="${tips.length - 1}"`; };
const tipHTML = (i) => { const t = tips[i]; if (!t) return ''; return `<b>${esc(t.title)}</b>${t.pairs.length ? `<dl class="mt-dl">${t.pairs.map(([k, v]) => (k ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : `<dd class="w">${esc(v)}</dd>`)).join('')}</dl>` : ''}`; };
const tile = (size, id, label, right, body, cls = '') => `<section class="card mt ${size} ${cls}" data-card="${id}"><div class="mt-lbl"><span>${esc(label)}</span>${right ? `<span>${right}</span>` : ''}</div>${body}</section>`;
const big = (n, unit = '', cls = '') => `<div class="mt-big ${cls}">${esc(n)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>`;
const line = (t) => `<div class="mt-line">${t}</div>`;
const axis = (marks) => `<div class="mt-axis">${marks.map(([at, t]) => `<span style="left:${at}%">${esc(t)}</span>`).join('')}</div>`;
const fact = (v, k, t) => `<div tabindex="0" ${tip(k[0].toUpperCase() + k.slice(1), [['', t]])}><dd>${esc(v)}</dd><dt>${esc(k)}</dt></div>`;

function windowDays(win) {
  const out = []; const d = new Date(win.from); d.setHours(12, 0, 0, 0);
  while (d.getTime() <= win.to) { out.push(dayKey(d)); d.setDate(d.getDate() + 1); }
  return out;
}

function todayTile(r) {
  if (!r?.today) return '';
  const byHour = r.today.byHour || [], typ = r.typicalDay || [], mx = Math.max(1, ...byHour, ...typ), now = new Date(), nowH = now.getHours() + now.getMinutes() / 60;
  const d = r.today.minutes - (r.today.usual || 0);
  const said = !r.today.usual ? 'worked today' : Math.abs(d) < 5 ? 'about a usual day' : `vs a usual ${hm(r.today.usual)}`;
  const cols = Array.from({ length: 24 }, (_, h) => { const u = typ[h] || 0, t = h <= nowH ? byHour[h] || 0 : 0;
    return `<div class="mt-col" ${tip(`${pad(h)}:00–${pad((h + 1) % 24)}:00`, [['Today', h > nowH ? 'later today' : hm(byHour[h] || 0)], ['Usual day', hm(u)]])}>${u ? `<i class="u" style="height:${pc((u / mx) * 100)}"></i>` : ''}${t ? `<i class="d" style="height:${pc((t / mx) * 100)}"></i>` : ''}</div>`; }).join('');
  return tile('m', 'today', 'Today', 'Since midnight', big(hm(r.today.minutes)) + line(esc(said))
    + `<div class="mt-pic"><div class="mt-ch mt-hrs"><div class="mt-rk" style="--h:6rem">${cols}<div class="mt-now${nowH < 1.5 ? ' l' : nowH > 22.5 ? ' r' : ''}" style="left:${pc((nowH / 24) * 100)}"><span>now ${clock(now)}</span></div></div>${axis([[0, '00'], [25, '06'], [50, '12'], [75, '18'], [100, '24']])}</div></div>`);
}

function tank(pct, name, reset, ts) {
  const col = pct >= 95 ? 'var(--critical)' : pct >= 80 ? 'var(--warn)' : 'var(--s1)', on = pct >= 80 && pct < 95 ? '#1f1b16' : '#fff', when = reset ? `resets ${new Date(reset).toDateString() === new Date().toDateString() ? clock(reset) : `${new Date(reset).toLocaleDateString([], { weekday: 'short' })} ${clock(reset)}`}` : '';
  const tx = (cls, st) => `<div class="mt-tx ${cls}" style="${st}"${cls ? ' aria-hidden="true"' : ''}><div><b class="p">${Math.round(pct)}%</b><span class="n">${esc(name)}</span></div><div class="sm"><span>${Math.max(0, 100 - Math.round(pct))}% left</span>${when ? `<span>${esc(when)}</span>` : ''}</div></div>`;
  return `<figure class="mt-tank" tabindex="0" ${tip(name, [['Used', `${Math.round(pct)}%`], ['Left', `${Math.max(0, 100 - Math.round(pct))}%`], ...(when ? [['Resets', when.replace('resets ', '')]] : []), ...(ts ? [['As of', ago(ts)]] : [])])}>
    <div class="fill" style="height:${pc(pct)};background:${col}"></div>${tx('', '')}${tx('on', `color:${on};clip-path:inset(${(100 - Math.min(100, pct)).toFixed(2)}% 0 0 0)`)}</figure>`;
}
function planTile(plan) {
  const agents = plan?.agents || [], many = agents.length > 1;
  let body;
  if (plan?.stale) body = line('Unknown right now: no reading since the window started over.');
  else if (!agents.length) body = line('Not seen yet. It shows once Puddle sees the Claude app or Codex being used.');
  else body = `<div class="mt-pic mt-fill"><div class="mt-tanks">${agents.flatMap((a) => [[a.five_pct, '5 hours', a.five_reset, a.five_ts ?? a.ts], [a.week_pct, 'Week', a.week_reset, a.week_ts ?? a.ts], [a.month_pct, a.month_from === 'claude-code' ? 'Spend' : 'Month', a.month_reset, a.month_ts ?? a.ts]]
    .filter(([v]) => v != null).map(([v, n, rs, ts]) => tank(v, many ? `${a.label || 'Claude'} · ${n}` : n, rs, ts))).join('')}</div></div>`;
  return tile('s', 'plan', 'Plan limits', !many && agents[0]?.label ? esc(agents[0].label) : '', body);
}

function flagsTile(p) {
  const full = p.context?.full ? [{ kind: 'context', level: 'info', text: `${p.context.full} conversation${p.context.full === 1 ? '' : 's'} got nearly full (90%+)` }] : [];
  const f = [...(p.flags || []), ...full];
  const what = { warn: 'Worth a look soon', info: 'Good to know', crit: 'Needs a look now' };
  return tile('s', 'flags', 'Needs a look', f.length ? `<b class="mt-cnt">${f.length}</b>` : '', f.length
    ? `<ul class="attention">${f.map((x) => `<li class="att ${x.level}${x.acknowledged ? ' ack' : ''}" tabindex="0" ${tip(x.text, [['', what[x.level] || 'Worth a look'], ...(x.acknowledged ? [['', 'Already acknowledged']] : [])])}><span class="att-ic">${FLAG_IC[x.kind] || '!'}</span><span class="att-t">${esc(x.text)}</span></li>`).join('')}</ul>`
    : '<p class="ok">✓ Nothing needs a look</p>', 'issues');
}

function workTile(p, tools, period) {
  const mix = p.mix || {}, tot = ORDER.reduce((a, k) => a + (mix[k] || 0), 0);
  if (!tot) return tile('m', 'work', 'What the agent worked on', esc(period), big('0', 'steps') + line('No agent steps in this period.'));
  const kinds = ORDER.filter((k) => mix[k]).sort((a, b) => mix[b] - mix[a]);
  const raw = kinds.map((k) => (mix[k] / tot) * 100), sq = raw.map(Math.floor); let left = 100 - sq.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { sq[i]++; left--; } });
  const tipOf = (k) => tip(CAT[k].label, [['Share', `${Math.round((mix[k] / tot) * 100)}% of steps`], ['Steps', nf(mix[k])], ...(tools || []).filter((t) => catOf(t.tool) === k).slice(0, 3).map((t) => [toolName(t.tool), nf(t.calls)])]);
  const tipIds = Object.fromEntries(kinds.map((k) => [k, tipOf(k)]));
  const squares = kinds.map((k, i) => `<i style="background:${CAT[k].c}" ${tipIds[k]}></i>`.repeat(sq[i])).join('');
  const rowsH = kinds.map((k) => `<div tabindex="0" ${tipIds[k]}><i style="background:${CAT[k].c}"></i><span>${esc(CAT[k].label)}</span><b>${Math.round((mix[k] / tot) * 100)}%</b><small>${nf(mix[k])}</small></div>`).join('');
  return tile('m', 'work', 'What the agent worked on', esc(period), big(nf(tot), 'steps') + line(`Mostly ${esc(CAT[kinds[0]].label.toLowerCase())}`)
    + `<div class="mt-pic mt-top"><div class="mt-wr"><div class="mt-waf">${squares}</div><div class="mt-kr">${rowsH}</div></div></div>`);
}

function taskTile(p) {
  const r = p.runs || {}, n = r.prompts || 0;
  if (!n) return '';
  const chat = r.chat || 0, long = r.long || 0, shortT = Math.max(0, n - long - chat);
  const word = long / n >= 0.15 ? 'Long tasks' : chat / n >= 0.5 ? 'Questions' : 'Short tasks';
  const per = n > 240 ? Math.ceil(n / 240) : 1;
  const groups = [[chat, 'var(--k-think)', 'Questions', 'answered without the agent using tools'], [shortT, 'var(--s1)', 'Short tasks', 'under 20 steps each'], [long, 'var(--s7)', 'Long tasks', '20 steps or more each']].filter(([v]) => v);
  const cols = groups.reduce((a, [v, , l]) => a + Math.max(Math.ceil(Math.max(1, Math.round(v / per)) / 10), Math.ceil((l.length + String(nf(v)).length + 1) * 0.42)), 0);
  const dots = `<div class="mt-dg" style="--cols:${cols};--groups:${groups.length}">${groups.map(([v, c, l, m]) => `<div class="mt-dgr" tabindex="0" ${tip(l, [['Prompts', nf(v)], ['Share', `${Math.round((v / n) * 100)}%`], ['Means', m]])}><div class="mt-dgi">${`<i style="background:${c}"></i>`.repeat(Math.max(1, Math.round(v / per)))}</div><span>${l} ${nf(v)}</span></div>`).join('')}</div>`;
  return tile('m', 'hands', 'Task size', `${nf(n)} prompts`, big(word, '', 'word') + (per > 1 ? line(`Each dot is ${per} prompts`) : '')
    + `<div class="mt-pic">${dots}</div><dl class="mt-mini">${fact(p.toolsPerPrompt == null ? '—' : p.toolsPerPrompt.toFixed(1), 'steps per prompt', 'Average steps the agent took for one prompt')}${fact(nf(r.longest), 'longest run', 'Most steps the agent took for a single prompt')}${fact(p.autoApproved == null ? '—' : `${Math.floor(p.autoApproved * 100)}%`, 'auto-approved', 'Steps that ran without asking first')}${fact(nf(p.rejects), 'stopped by hand', 'Times the person stopped or turned down a step')}</dl>`);
}

function sizeTile(p) {
  const c = p.context; if (!c) return '';
  const fills = c.fills || [];
  const pills = fills.length ? `<div class="mt-pic"><div class="mt-ch"><div class="mt-rk mt-pl" style="--h:6rem">${fills.map((v, i) => `<div class="mt-col" ${tip(fills.length < c.sessions ? `About ${Math.round(((i + 1) / fills.length) * 100)}% of conversations` : `Conversation ${i + 1} of ${c.sessions}`, [['Fullest point', `${v}% of what the model can hold`], ...(v >= 90 ? [['', 'Nearly full']] : [])])}><i style="height:${pc(v)};background:${v >= 90 ? 'var(--critical)' : 'var(--s4)'}"></i></div>`).join('')}<div class="mt-ref" style="bottom:90%"></div></div><div class="mt-cap">${fills.length < c.sessions ? 'Each bar stands for an equal share of conversations' : 'One bar per conversation'}, from least to most full · line at 90%</div></div></div>` : '';
  return tile('m', 'size', 'Conversation size', `${nf(c.sessions)} conversation${c.sessions === 1 ? '' : 's'}`, big(`${c.typical}%`, 'usually') + line('of what the model can hold') + pills
    + `<dl class="mt-mini">${fact(`${c.max}%`, 'the largest', 'The fullest conversation in this period')}${fact(`${c.full} of ${c.sessions}`, 'nearly full (90%+)', 'Past 90%, answers slow down and lose detail')}${fact(nf(p.compactions), 'squeezed to make room', 'Times a conversation was shortened to fit')}</dl>`);
}

function linesTile(codeLines, win, period) {
  if (!codeLines?.length) return '';
  const days = windowDays(win), by = new Map(days.map((k) => [k, { a: 0, r: 0, p: [] }]));
  let A = 0, R = 0;
  for (const pr of codeLines) for (const d of pr.days || []) { const x = by.get(d.day); if (!x) continue; x.a += d.added; x.r += d.removed; A += d.added; R += d.removed; if (d.added || d.removed) x.p.push([repo(pr.name), d.added, d.removed]); }
  let ca = 0, cr = 0;
  const run = days.map((k) => { const x = by.get(k); ca += x.a; cr += x.r; return [ca, cr]; }), top = Math.max(1, ca), n = days.length;
  const X = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100), Y = (v) => 100 - (v / top) * 96;
  const path = (j) => run.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)} ${Y(v[j]).toFixed(2)}`).join(' ');
  const svg = `<svg class="mt-lnsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${path(0)} L100 100 L0 100 Z" fill="color-mix(in srgb, var(--s3) 16%, transparent)"/><path d="${path(0)}" fill="none" stroke="var(--s3)" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><path d="${path(1)}" fill="none" stroke="var(--s8)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  const cols = days.map((k, i) => { const x = by.get(k);
    return `<div class="mt-hit" ${tip(dayLong(k), [['Added', `+${nf(x.a)} lines`], ['Removed', `−${nf(x.r)} lines`], ['So far', `+${nf(run[i][0])} −${nf(run[i][1])}`], ...x.p.sort((m, q) => q[1] + q[2] - m[1] - m[2]).slice(0, 3).map(([nm, a, r]) => [nm, `+${nf(a)} −${nf(r)}`])])}><b style="top:${pc(Y(run[i][0]))}"></b><b class="r" style="top:${pc(Y(run[i][1]))}"></b></div>`; }).join('');
  return tile('m', 'lines', 'Code changes', esc(period), big(`+${short(A)}`, `−${short(R)} lines`) + line('<i class="mt-key" style="background:var(--s3)"></i>added <i class="mt-key" style="background:var(--s8)"></i>removed, adding up over the period')
    + `<div class="mt-pic"><div class="mt-ch"><div class="mt-ln" style="--h:9rem">${svg}<div class="mt-hits">${cols}</div></div>${axis([[0, dayShort(days[0])], [100, 'Today']])}</div></div>`);
}

const SLOTS_OF = { '15m': [15, 60_000], '1h': [60, 60_000], '6h': [72, 300_000], '24h': [96, 900_000] };
const took = (ms) => (!ms ? '—' : ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))}s` : hm(ms / 60000));
function promptsTile(lastDay, win) {
  const all = lastDay?.prompts;
  const head = `<span class="mt-seg" role="group" aria-label="Window">${Object.keys(WIN).map((k) => `<button type="button" data-win="${k}" aria-pressed="${k === win}">${k}</button>`).join('')}</span>`;
  if (lastDay === undefined) return tile('l', 'prompts', 'Prompt by prompt', head, line('Loading…'));
  if (!all) return tile('l', 'prompts', 'Prompt by prompt', head, line('Not available right now. It comes back by itself.'));
  const [n, step] = SLOTS_OF[win], end = Math.ceil(Date.now() / step) * step, start = end - n * step, list = all.filter((x) => x.ts >= start);
  if (!list.length) return tile('l', 'prompts', 'Prompt by prompt', head, big('0', 'prompts') + line(`No prompts in the last ${win}.`));
  const slots = Array.from({ length: n }, () => []);
  for (const x of list) slots[Math.min(n - 1, Math.max(0, Math.floor((x.ts - start) / step)))].push(x);
  const tok = (q) => q.reduce((a, x) => a + (x.tokens || 0), 0), max = Math.max(1, ...slots.map(tok));
  const cols = slots.map((q, i) => {
    const from = start + i * step, ctx = q.reduce((m, x) => (x.context != null && x.context > (m ?? -1) ? x.context : m), null), t = tok(q), one = q.length === 1 ? q[0] : null;
    const pairs = one ? [['Model', one.model || '—'], ['Tokens', `${short(one.tokens)}${one.output ? ` (${short(one.output)} written)` : ''}`], ['Steps', nf(one.steps)], ['Took', took(one.took)], ...(one.cost != null ? [['Cost', `$${one.cost.toFixed(2)}`]] : []), ...(one.len != null ? [['Prompt length', `${nf(one.len)} characters`]] : []), ...(one.context != null ? [['Conversation', `${one.context}% full`]] : [])]
      : q.length ? [['Prompts', nf(q.length)], ['Tokens', short(t)], ['Steps', nf(q.reduce((a, x) => a + (x.steps || 0), 0))], ...(ctx != null ? [['Fullest conversation', `${ctx}%`]] : []), ['Models', [...new Set(q.map((x) => x.model).filter(Boolean))].join(', ') || '—']] : [['', 'No prompts']];
    const title = one ? `Prompt at ${clock(one.ts)}` : step >= 300_000 ? `${clock(from)}–${clock(from + step)}` : clock(from);
    return `<div class="mt-col mt-pp" ${tip(title, pairs)}><div class="bt">${t ? `<i style="height:${pc(Math.max(3, (t / max) * 100))}"></i>` : ''}</div><div class="cx">${ctx != null ? `<b style="bottom:${pc(ctx)};background:${ctx >= 90 ? 'var(--critical)' : 'var(--s4)'}"></b>` : ''}</div></div>`; }).join('');
  return tile('l', 'prompts', 'Prompt by prompt', head, big(nf(list.length), `prompts · ${short(tok(list))} tokens`) + line(`Bars: tokens the answers took, every ${step / 60_000} min. Dots: how full the conversation got, red past 90%`)
    + `<div class="mt-pic"><div class="mt-ch"><div class="mt-rk mt-ppc${n > 60 ? ' tight' : ''}" style="--h:11rem">${cols}<div class="mt-ref mt-r90"></div></div>${axis([[0, `${win} ago`], [100, 'Now']])}</div></div>`);
}

function recentTile(recent, links, range, period) {
  if (!recent?.length) return '';
  const list = recent.slice(0, 6), max = Math.max(1, ...list.map((c) => c.minutes || 0));
  const items = list.map((c) => { const title = c.title || `Conversation on ${dayLong(dayKey(c.last))}`, href = links.project ? links.project(c, range) : null, col = hue(c.project);
    const inner = `<span class="mt-cr"><span>${esc(title)}</span><b>${hm(c.minutes)}</b></span><span class="mt-trk"><i style="width:${pc(Math.max(2, ((c.minutes || 0) / max) * 100))};background:${col}"></i></span><span class="mt-meta"><i style="background:${col}"></i>${esc(repo(c.project))} · ${esc(ago(c.last))}</span>`;
    const t = tip(title, [['Project', repo(c.project)], ['Time', hm(c.minutes)], ['Last active', ago(c.last)], ...(href ? [['', 'Click to open the conversation']] : [])]);
    return `<li>${href ? `<a class="mt-cl" href="${esc(href)}" ${t}>${inner}</a>` : `<span class="mt-cl" tabindex="0" ${t}>${inner}</span>`}</li>`; }).join('');
  return tile('m', 'recent', 'Recent conversations', esc(period), `<ul class="mt-dur">${items}</ul>${links.work ? `<a class="mt-all" href="${esc(links.work(range))}">See all conversations →</a>` : ''}`);
}

function calTile(daily, win, period) {
  if (!daily) return '';
  const days = windowDays(win), by = new Map(daily.map((d) => [d.day, d])), toks = days.map((k) => Number(by.get(k)?.tokens) || 0), total = toks.reduce((a, b) => a + b, 0), max = Math.max(1, ...toks);
  const steps = ['var(--cal0)', 'var(--seq1)', 'var(--seq2)', 'var(--seq3)', 'var(--seq4)', 'var(--seq5)', 'var(--seq6)'];
  const off = (new Date(`${days[0]}T12:00:00`).getDay() + 6) % 7, best = days[toks.indexOf(max)];
  const cell = (k, i) => { const d = by.get(k) || {}, lv = toks[i] ? Math.min(6, 1 + Math.floor((toks[i] / max) * 5.999)) : 0;
    return `<i style="background:${steps[lv]}" ${tip(dayLong(k), [['Tokens', toks[i] ? short(toks[i]) : 'none'], ['Prompts', nf(d.prompts)], ['Conversations', nf(d.sessions)], ['Agent steps', nf(d.tools)], ...(total ? [['Share of period', `${((toks[i] / total) * 100).toFixed(1)}%`]] : [])])}></i>`; };
  const bar = (k, i) => { const d = by.get(k) || {};
    return `<div class="mt-col" ${tip(dayLong(k), [['Tokens', toks[i] ? short(toks[i]) : 'none'], ['Prompts', nf(d.prompts)], ['Conversations', nf(d.sessions)], ['Agent steps', nf(d.tools)], ...(total ? [['Share of period', `${((toks[i] / total) * 100).toFixed(1)}%`]] : [])])}>${toks[i] ? `<i style="height:${pc(Math.max(3, (toks[i] / max) * 100))};background:var(--seq4)"></i>` : ''}</div>`; };
  const pic = days.length <= 14
    ? `<div class="mt-ch"><div class="mt-rk mt-tk" style="--h:10rem">${days.map(bar).join('')}</div><div class="mt-days">${days.map((k) => `<span>${new Date(`${k}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' })}</span>`).join('')}</div></div>`
    : `<div class="mt-cal${days.length > 40 ? ' wide' : ''}">${['M', '', 'W', '', 'F', '', 'S'].map((t) => `<span class="wd">${t}</span>`).join('')}${'<s></s>'.repeat(off)}${days.map(cell).join('')}</div>`;
  return tile('m', 'calendar', 'Tokens per day', esc(period), big(short(total), 'tokens') + line(total ? `Busiest ${esc(dayShort(best))}${days.length > 14 ? ' · darker is more' : ''}` : 'No tokens in this period')
    + `<div class="mt-pic">${pic}</div>`);
}

export function mountMate(el, { api, cards, stream = null, links = {} }) {
  let range = '7d', data = null, win = null, pwin = '24h';
  try { range = sessionStorage.getItem('pv-range') || '7d'; pwin = localStorage.getItem('pv-pwin') || '24h'; } catch {}
  if (!RANGES[range]) range = '7d';
  if (!WIN[pwin]) pwin = '24h';
  el.classList.add('mate');
  const headRange = document.querySelector('header.bar #range');
  const paintBar = () => { if (!headRange) return; for (const b of headRange.querySelectorAll('button')) { b.setAttribute('aria-pressed', String(b.dataset.r === range)); b.onclick = () => { range = b.dataset.r; try { sessionStorage.setItem('pv-range', range); } catch {} paintBar(); load(); }; } };
  paintBar();
  const arrange = document.getElementById('arrange-btn');
  if (arrange) { arrange.setAttribute('aria-disabled', 'true'); arrange.title = 'A teammate’s page keeps one order, so every leader sees the same'; arrange.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, true); }
  let on = null, touchT = null;
  const show = (t, x, y) => { const i = t.dataset.t; showTip({ clientX: x, clientY: y, target: t }, tipHTML(i)); if (on !== t) { on?.classList.remove('on'); on = t; t.classList.add('on'); } };
  const hide = () => { clearTimeout(touchT); hideTip(); on?.classList.remove('on'); on = null; };
  addEventListener('scroll', hide, { passive: true });
  el.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; const t = e.target.closest('[data-t]'); if (t) show(t, e.clientX, e.clientY); else if (on) hide(); });
  el.addEventListener('pointerleave', hide);
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; const t = e.target.closest('[data-t]'); if (t) { show(t, e.clientX, e.clientY); clearTimeout(touchT); touchT = setTimeout(hide, 5000); } else hide(); });
  el.addEventListener('focusin', (e) => { const t = e.target.closest('[data-t]'); if (!t || !t.matches(':focus-visible')) return; const b = t.getBoundingClientRect(); show(t, b.left + Math.min(b.width / 2, 40), b.top); });
  el.addEventListener('focusout', hide);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-win]'); if (!b) return; pwin = b.dataset.win; try { localStorage.setItem('pv-pwin', pwin); } catch {} draw(); });

  const draw = () => {
    if (!data || document.body.classList.contains('leaving')) return;
    const { person: p, rhythm: r, tools } = data, st = liveState(p), w = data.win || win, rg = data.range || range, per = RANGES[rg][0];
    const name = p.name || (p.email || '').split('@')[0] || 'Someone';
    document.body.dataset.who = name; globalThis.PuddleBar?.title(name);
    tips.length = 0;
    const n = p.now || {};
    const head = `<section class="card pv-head" style="--c:${st.c}"><div class="pv-who"><h1>${esc(name)}${globalThis.signalsHTML?.(p) || ''}</h1><span class="pv-state ${st.kind}" tabindex="0" data-learn="pv:state" ${tip(st.text, [['Last tool', n.tool ? toolName(n.tool) : '—'], ['Last step', n.lastTs ? ago(n.lastTs) : '—'], ['Last prompt', n.promptTs ? ago(n.promptTs) : '—']])}><i></i>${esc(st.text)}${st.sub ? ` <small>· ${esc(st.sub)}</small>` : ''}</span></div></section>`;
    const body = [todayTile(r), planTile(p.plan), flagsTile(p), workTile(p, tools, per), taskTile(p), sizeTile(p), linesTile(data.codeLines, w, per), promptsTile(data.lastDay, pwin), recentTile(data.recent, links, rg, per), calTile(data.daily, w, per)].join('');
    const a = document.activeElement, keep = a && el.contains(a) ? (a.dataset.win ? `[data-win="${a.dataset.win}"]` : a.dataset.t ? `[data-t="${a.dataset.t}"]` : a.getAttribute('href') ? `[href="${CSS.escape(a.getAttribute('href'))}"]` : null) : null;
    if (on) hide();
    const y = scrollY;
    el.innerHTML = `${head}<div class="mt-wrap"><div class="mt-g">${body}</div></div>`;
    if (Math.abs(scrollY - y) > 1) scrollTo(0, y);
    el.removeAttribute('aria-busy'); delete el.dataset.wait;
    for (const g of el.querySelectorAll('.pv-head .sig')) hover(g, () => globalThis.signalTip(g.dataset.sig, p));
    if (keep) el.querySelector(keep)?.focus({ preventScroll: true });
  };

  let busy = false, more = false;
  async function load() { if (busy) { more = true; return; } busy = true; try { await loadOnce(); } finally { busy = false; if (more) { more = false; load(); } } }
  async function loadOnce() {
    const rg0 = range, { from, to } = PuddleWhen.window(RANGES[rg0][1]);
    win = { from, to };
    const params = { from, to, tz: -new Date().getTimezoneOffset() }, key = `puddle-mate:${location.search}|${range}`;
    try { const v = JSON.parse(sessionStorage.getItem(key) || 'null'); if (v && Date.now() - v.at < 30 * 60_000 && !data) { data = v.data; draw(); } } catch {}
    const bar = globalThis.PuddleBar;
    const promptsP = fetch(cards('prompts', params)).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    let res;
    try { res = await fetch(api(params)); } catch { bar?.fetched('fail'); if (!data) (delete el.dataset.wait, el.innerHTML = '<section class="card pv-empty"><h2>This page can\'t be reached right now</h2><p class="muted">No connection. Trying again by itself.</p></section>'); setTimeout(load, 5000); return; }
    if (!res.ok) {
      bar?.fetched(res.status === 503 ? 'busy' : res.status === 404 ? 'ok' : 'fail');
      if (res.status === 404) (delete el.dataset.wait, el.innerHTML = '<section class="card pv-empty"><p class="muted">Nothing to show for this person here: no shared work yet.</p></section>');
      else if (!data) { el.removeAttribute('data-wait'); setTimeout(load, 5000); }
      return;
    }
    bar?.fetched('ok');
    const fresh = await res.json();
    data = { ...fresh, lastDay: data?.lastDay, win: { from, to }, range: rg0 };
    draw();
    globalThis.PuddlePerf?.drawn('person'); globalThis.PuddleHeal?.drawn();
    const pr = await promptsP;
    data.lastDay = pr?.lastDay || data.lastDay || null; draw();
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch {}
  }
  load();
  let lastLoad = Date.now(), liveTimer = null;
  const soon = () => { if (liveTimer) return; liveTimer = setTimeout(() => { liveTimer = null; lastLoad = Date.now(); load(); }, Math.max(0, lastLoad + 60_000 - Date.now())); };
  if (stream) {
    const connect = () => { try {
      const es = new EventSource(stream);
      globalThis.PuddleBar?.stream(false);
      es.onopen = () => globalThis.PuddleBar?.stream(true);
      es.addEventListener('version', (ev) => globalThis.PuddleHeal?.saw(ev.data));
      es.addEventListener('update', (ev) => { try { const d = JSON.parse(ev.data); if (d?.version) globalThis.PuddleHeal?.saw(d.version); } catch {} soon(); });
      es.onerror = () => { globalThis.PuddleBar?.stream(false); if (es.readyState === EventSource.CLOSED) setTimeout(() => { connect(); soon(); }, 5000 + Math.random() * 10_000); };
    } catch {} };
    connect();
  }
  addEventListener('puddle:online', () => load());
  let hour = new Date().getHours();
  setInterval(() => { const h = new Date().getHours(); if (h !== hour) { hour = h; load(); } else if (!on) draw(); }, 30_000);
  return { reload: load };
}
