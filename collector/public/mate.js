import { esc } from '/you.js';
import { CAT, liveState, FLAG_IC } from '/person.js';
import { showTip, hideTip, hover } from '/tips.js';

const RANGES = { '7d': ['Last 7 days', 7], '30d': ['Last 30 days', 30], '90d': ['Last 90 days', 90] };
const ORDER = ['read', 'edit', 'run', 'web', 'agent', 'mcp', 'other'];
const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s7)', 'var(--s5)', 'var(--s4)', 'var(--s6)', 'var(--s8)'];
const K = globalThis.PuddleTiles;
const { nf, short, pc, pad, clock, hm, ago, dayKey, dayLong, repo, tip, tile, big, line, fact, axis, WIN } = K;
const toolName = (t) => String(t || 'unknown').replace(/^mcp__/, '').replace(/__/g, ' · ').replace(/_/g, ' ');
const catOf = (t) => /^(Read|Grep|Glob|LS|NotebookRead)$/.test(t) ? 'read' : /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t) ? 'edit'
  : /^(Bash|BashOutput|KillShell|KillBash|Monitor)$/.test(t) ? 'run' : /^(WebFetch|WebSearch)$/.test(t) ? 'web'
  : /^(Agent|Task|Skill|Workflow)$/.test(t) ? 'agent' : /^mcp(__|_tool$)/.test(String(t)) ? 'mcp' : 'other';
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return SLOTS[h % SLOTS.length]; };

function todayTile(r) {
  if (!r?.today) return '';
  const byHour = r.today.byHour || [], typ = r.typicalDay || [], mx = Math.max(1, ...byHour, ...typ), now = new Date(), nowH = now.getHours() + now.getMinutes() / 60;
  const d = r.today.minutes - (r.today.usual || 0);
  const cmp = !r.today.usual ? '' : Math.abs(d) < 5 ? '<span class="mt-pill" tabindex="0" ' + tip('About a usual day', [['Usual day', hm(r.today.usual)]]) + '>≈</span>'
    : `<span class="mt-pill${d > 0 ? ' up' : ''}" tabindex="0" ${tip(d > 0 ? 'More than a usual day' : 'Less than a usual day', [['Usual day', hm(r.today.usual)]])}>${d > 0 ? '▲' : '▼'} ${hm(Math.abs(d))}</span>`;
  const cols = Array.from({ length: 24 }, (_, h) => { const u = typ[h] || 0, t = h <= nowH ? byHour[h] || 0 : 0;
    return `<div class="mt-col" ${tip(`${pad(h)}:00–${pad((h + 1) % 24)}:00`, [['Today', h > nowH ? 'later today' : hm(byHour[h] || 0)], ['Usual day', hm(u)]])}>${u ? `<i class="u" style="height:${pc((u / mx) * 100)}"></i>` : ''}${t ? `<i class="d" style="height:${pc((t / mx) * 100)}"></i>` : ''}</div>`; }).join('');
  return tile('m', 'today', 'Work', '', `<div class="mt-big">${esc(hm(r.today.minutes))}${cmp}</div>`
    + `<div class="mt-pic bl"><div class="mt-ch"><div class="mt-rk" style="--h:6rem">${cols}</div>${axis([[0, '00'], [25, '06'], [50, '12'], [75, '18'], [100, '24']])}</div></div>`);
}

function tank(pct, name, who, id, reset, ts) {
  const col = pct >= 95 ? 'var(--critical)' : pct >= 80 ? 'var(--warn)' : 'var(--s1)', on = pct >= 80 && pct < 95 ? '#1f1b16' : '#fff', when = reset ? (new Date(reset).toDateString() === new Date().toDateString() ? clock(reset) : `${new Date(reset).toLocaleDateString([], { weekday: 'short' })} ${clock(reset)}`) : '';
  const tx = (cls, st) => `<div class="mt-tx ${cls}" style="${st}"${cls ? ' aria-hidden="true"' : ''}><b class="p">${Math.round(pct)}%</b><span class="n">${esc(name)}</span><span class="w">${globalThis.PuddleAgents?.mark(id, 18, true) || esc(who)}</span></div>`;
  return `<figure class="mt-tank" tabindex="0" ${tip(`${who} · ${name}`, [['Used', `${Math.round(pct)}%`], ['Left', `${Math.max(0, 100 - Math.round(pct))}%`], ...(when ? [['Resets', when]] : []), ...(ts ? [['As of', ago(ts)]] : [])])}>
    <div class="fill" style="height:${pc(pct)};background:${col}"></div>${tx('', '')}${tx('on', `color:${on};clip-path:inset(${(100 - Math.min(100, pct)).toFixed(2)}% 0 0 0)`)}</figure>`;
}
function planTile(plan) {
  const agents = plan?.agents || [];
  let body;
  if (plan?.stale) body = line('Unknown right now');
  else if (!agents.length) body = line('Not seen yet');
  else {
    const list = agents.flatMap((a) => [[a.five_pct, '5 hours', a.five_reset, a.five_ts ?? a.ts], [a.week_pct, 'Week', a.week_reset, a.week_ts ?? a.ts], [a.month_pct, a.month_from === 'claude-code' ? 'Spend' : 'Month', a.month_reset, a.month_ts ?? a.ts]]
      .filter(([v]) => v != null).map(([v, n, rs, ts]) => tank(v, n, a.label || 'Claude', globalThis.PuddleAgents?.planTool(a.agent) || 'claude-code', rs, ts)));
    body = `<div class="mt-pic mt-fill bl"><div class="mt-tanks" style="--n:${Math.min(2, list.length)}">${list.join('')}</div></div>`;
  }
  return tile('s', 'plan', 'Limits', '', body);
}

function flagsTile(p) {
  const full = p.context?.full ? [{ kind: 'context', level: 'info', text: `${p.context.full} conversation${p.context.full === 1 ? '' : 's'} got nearly full (90%+)` }] : [];
  const f = [...(p.flags || []), ...full];
  const what = { warn: 'Worth a look soon', info: 'Good to know', crit: 'Needs a look now' };
  return tile('s', 'flags', 'Needs a look', f.length ? `<b class="mt-cnt">${f.length}</b>` : '', f.length
    ? `<ul class="attention bl">${f.map((x) => `<li class="att ${x.level}${x.acknowledged ? ' ack' : ''}" tabindex="0" ${tip(x.text, [['', what[x.level] || 'Worth a look'], ...(x.acknowledged ? [['', 'Already acknowledged']] : [])])}><span class="att-ic">${FLAG_IC[x.kind] || '!'}</span><span class="att-t">${esc(x.text)}</span></li>`).join('')}</ul>`
    : '<p class="ok">✓ Nothing needs a look</p>', 'issues');
}

function workTile(p, tools) {
  const mix = p.mix || {}, tot = ORDER.reduce((a, k) => a + (mix[k] || 0), 0);
  if (!tot) return tile('m', 'work', 'Agent', '', big('0', 'steps'));
  const kinds = ORDER.filter((k) => mix[k]).sort((a, b) => mix[b] - mix[a]), top = mix[kinds[0]];
  const rows = kinds.map((k) => `<div class="mt-hr" tabindex="0" ${tip(CAT[k].label, [['Share', `${Math.round((mix[k] / tot) * 100)}% of steps`], ['Steps', nf(mix[k])], ...(tools || []).filter((t) => catOf(t.tool) === k).slice(0, 3).map((t) => [toolName(t.tool), nf(t.calls)])])}><i style="width:${pc(Math.max(1.5, (mix[k] / top) * 100))};background:${CAT[k].c}"></i><span class="mt-hl${mix[k] / top >= 0.45 ? ' on' : ''}${mix[k] === top ? ' full' : ''}"${mix[k] / top < 0.45 ? ` style="padding-left:calc(${pc(Math.max(1.5, (mix[k] / top) * 100))} + .625rem)"` : ''}><span>${esc(CAT[k].label)}</span><b>${Math.round((mix[k] / tot) * 100)}%</b></span></div>`).join('');
  return tile('m', 'work', 'Agent', '', big(nf(tot), 'steps') + `<div class="mt-pic mt-fill bl"><div class="mt-hb">${rows}</div></div>`);
}

function taskTile(p) {
  const r = p.runs || {}, n = r.prompts || 0;
  if (!n) return '';
  const chat = r.chat || 0, long = r.long || 0, shortT = Math.max(0, n - long - chat);
  const per = n > 240 ? Math.ceil(n / 240) : 1;
  const groups = [[chat, 'var(--k-think)', 'Questions', 'Answered without the agent using tools'], [shortT, 'var(--s1)', 'Short', 'Under 20 steps each'], [long, 'var(--s7)', 'Long', '20 steps or more each']].filter(([v]) => v)
    .map(([v, c, l, m]) => ({ v, c, l, t: tip(l, [['Prompts', nf(v)], ['Share', `${Math.round((v / n) * 100)}%`], ['', m], ...(per > 1 ? [['', `Each dot is ${per} prompts`]] : [])]) }));
  const dots = groups.map((g) => `<i style="background:${g.c}" ${g.t}></i>`.repeat(Math.max(1, Math.round(g.v / per)))).join('');
  const keys = groups.map((g) => `<span tabindex="0" ${g.t}><i style="background:${g.c}"></i>${g.l} <b>${nf(g.v)}</b></span>`).join('');
  return tile('m', 'hands', 'Tasks', '', big(nf(n), 'prompts') + `<div class="mt-keys">${keys}</div>`
    + `<div class="mt-pic mt-fill"><div class="mt-dots" data-n="${(dots.match(/<i /g) || []).length}"><div>${dots}</div></div></div><dl class="mt-mini">${fact(p.toolsPerPrompt == null ? '—' : p.toolsPerPrompt.toFixed(1), 'steps per prompt', 'Average steps the agent took for one prompt')}${fact(nf(r.longest), 'longest', 'Most steps the agent took for a single prompt')}${fact(p.autoApproved == null ? '—' : `${Math.floor(p.autoApproved * 100)}%`, 'auto-approved', 'Steps that ran without asking first')}${fact(nf(p.rejects), 'stopped', 'Times the person stopped or turned down a step')}</dl>`);
}

function linesTile(codeLines, win) {
  const b = K.lines(codeLines, win);
  return b ? tile('m', 'lines', 'Code changes', '', b) : '';
}

function promptsTile(lastDay, win, c) {
  const all = lastDay?.prompts, head = K.seg(win), T = 'Conversations';
  if (lastDay === undefined) return tile('m', 'prompts', T, head, line('Loading…'));
  if (!all) return tile('m', 'prompts', T, head, line('Not available right now'));
  const pill = c?.typical != null ? `<span class="mt-pill" tabindex="0" ${tip(`Usually ${c.typical}% full`, [['', 'How full a conversation usually gets'], ['Fullest', `${c.max}%`]])}>${c.typical}% full</span>` : '';
  return tile('m', 'prompts', T, head, K.conversations(all, win, { pill }));
}

function recentTile(recent, links, range) {
  if (!recent?.length) return '';
  const list = recent.slice(0, 6), max = Math.max(1, ...list.map((c) => c.minutes || 0));
  const items = list.map((c) => { const title = c.title || `Conversation on ${dayLong(dayKey(c.last))}`, href = links.project ? links.project(c, range) : null, col = hue(c.project);
    const inner = `<span class="mt-cr"><span>${esc(title)}</span><b>${hm(c.minutes)}</b></span><span class="mt-trk"><i style="width:${pc(Math.max(2, ((c.minutes || 0) / max) * 100))};background:${col}"></i></span><span class="mt-meta"><i style="background:${col}"></i>${esc(repo(c.project))} · ${esc(ago(c.last))}</span>`;
    const t = tip(title, [['Project', repo(c.project)], ['Time', hm(c.minutes)], ['Last active', ago(c.last)], ...(href ? [['', 'Click to open the conversation']] : [])]);
    return `<li>${href ? `<a class="mt-cl" href="${esc(href)}" ${t}>${inner}</a>` : `<span class="mt-cl" tabindex="0" ${t}>${inner}</span>`}</li>`; }).join('');
  return tile('m', 'recent', 'Recent conversations', '', `<ul class="mt-dur bl">${items}</ul>${links.work ? `<a class="mt-all" href="${esc(links.work(range))}">See all conversations →</a>` : ''}`);
}

function calTile(daily, win) {
  const b = K.cal(daily, win);
  return b ? tile('m', 'calendar', 'Tokens per day', '', b) : '';
}

function fitDots(d) {
  const n = +d.dataset.n || 1, W = d.clientWidth, H = d.clientHeight, g = d.firstElementChild;
  if (!W || !H || !g) return;
  let s = Math.min(H, 22);
  for (; s > 3; s -= 0.5) { const c = Math.max(1, Math.floor((W + s * .35) / (s * 1.35))); if (Math.ceil(n / c) * s * 1.35 - s * .35 <= H) break; }
  const c = Math.max(1, Math.min(n, Math.floor((W + s * .35) / (s * 1.35))));
  g.style.setProperty('--c', c); g.style.setProperty('--s', `${s}px`);
}
const dotsRO = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => { for (const e of es) fitDots(e.target); }) : null;

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
  const tw = K.wire(el, { showTip, hideTip }), hide = tw.hide;
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-win]'); if (!b) return; pwin = b.dataset.win; try { localStorage.setItem('pv-pwin', pwin); } catch {} draw(); });

  const draw = () => {
    if (!data || document.body.classList.contains('leaving')) return;
    const { person: p, rhythm: r, tools } = data, st = liveState(p), w = data.win || win, rg = data.range || range;
    const name = p.name || (p.email || '').split('@')[0] || 'Someone';
    document.body.dataset.who = name; globalThis.PuddleBar?.title(name);
    const n = p.now || {};
    const head = `<section class="card pv-head" style="--c:${st.c}"><div class="pv-who"><h1>${esc(name)}${globalThis.signalsHTML?.(p) || ''}</h1><span class="pv-state ${st.kind}" tabindex="0" data-learn="pv:state" ${tip(st.text, [['Last tool', n.tool ? toolName(n.tool) : '—'], ['Last step', n.lastTs ? ago(n.lastTs) : '—'], ['Last prompt', n.promptTs ? ago(n.promptTs) : '—']])}><i></i>${esc(st.text)}${st.sub ? ` <small>· ${esc(st.sub)}</small>` : ''}</span></div></section>`;
    const body = [todayTile(r), planTile(p.plan), flagsTile(p), workTile(p, tools), taskTile(p), linesTile(data.codeLines, w), promptsTile(data.lastDay, pwin, p.context), recentTile(data.recent, links, rg), calTile(data.daily, w)].join('');
    const a = document.activeElement, keep = a && el.contains(a) ? (a.dataset.win ? `[data-win="${a.dataset.win}"]` : a.dataset.t ? `[data-t="${CSS.escape(a.dataset.t)}"]` : a.getAttribute('href') ? `[href="${CSS.escape(a.getAttribute('href'))}"]` : null) : null;
    hide();
    const y = scrollY;
    el.innerHTML = `${head}<div class="mt-wrap"><div class="mt-g">${body}</div></div>`;
    if (Math.abs(scrollY - y) > 1) scrollTo(0, y);
    el.removeAttribute('aria-busy'); delete el.dataset.wait;
    for (const g of el.querySelectorAll('.pv-head .sig')) hover(g, () => globalThis.signalTip(g.dataset.sig, p));
    dotsRO?.disconnect();
    for (const d of el.querySelectorAll('.mt-dots')) { fitDots(d); dotsRO?.observe(d); }
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
  setInterval(() => { const h = new Date().getHours(); if (h !== hour) { hour = h; load(); } else if (!tw.active()) draw(); }, 30_000);
  return { reload: load };
}
