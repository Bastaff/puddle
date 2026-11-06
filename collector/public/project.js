const q = new URLSearchParams(location.search), team = q.get('team'), demo = q.get('demo') === '1', name = q.get('p') || '';
const RANGES = { '1d': ['1D', 1], '7d': ['7D', 7], '30d': ['30D', 30], '90d': ['90D', 90] };
const PER = 25;
let range = RANGES[q.get('range')] ? q.get('range') : '1d', data = null, sel = q.get('c') || null, cpage = 0;
let win = { from: Date.now() - 864e5, to: Date.now() };
const el = document.getElementById('prj');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (v) => { const x = Number(v) || 0; return `$${x < 10 ? x.toFixed(2) : Math.round(x).toLocaleString()}`; };
const k = (v) => (v == null ? '–' : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));
const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const colorOf = (u) => SLOTS[Math.max(0, (data?.team || []).findIndex((p) => p.user_key === u)) % SLOTS.length];
const nameOf = (u) => (data?.team || []).find((p) => p.user_key === u)?.name || 'someone';
const initials = (u) => nameOf(u).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const avatar = (u) => `<i class="prj-av" style="background:${colorOf(u)}" title="${esc(nameOf(u))}">${esc(initials(u))}</i>`;
const when = (t, withDay = true) => { const d = new Date(t); return `${withDay ? d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' : ''}${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; };
const short = (n) => (/^[a-z0-9.-]+\.[a-z]+\/.+\/.+/i.test(n) ? n.split('/').pop() : n);
globalThis.PuddleBar?.title(short(name));
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const titleOf = (c) => c.title || `Conversation on ${new Date(c.first).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
const KINDS = [['inp', 'Input', 'var(--s1)'], ['out', 'Output', 'var(--s2)'], ['cr', 'Cache read', 'var(--s3)'], ['cw', 'Cache write', 'var(--s4)']];
function tokensBar(x) {
  const all = KINDS.reduce((a, [key]) => a + (x[key] || 0), 0);
  if (!all) return '';
  return `<div class="prj-tok"><div class="prj-share">${KINDS.map(([key, label, c]) => (x[key] ? `<i style="flex:${x[key]};background:${c}" title="${label}: ${k(x[key])}"></i>` : '')).join('')}</div>
    <ul>${KINDS.map(([key, label, c]) => `<li><i style="background:${c}"></i>${label} <b>${k(x[key] || 0)}</b><small>${Math.round(((x[key] || 0) / all) * 100)}%</small></li>`).join('')}</ul></div>`;
}

const tip = Object.assign(document.createElement('div'), { className: 'tip' }); tip.hidden = true; document.body.append(tip);
const showTip = (e, html) => { tip.innerHTML = html; tip.hidden = false; const r = tip.getBoundingClientRect(); tip.style.left = `${Math.min(innerWidth - r.width - 8, e.clientX + 14)}px`; tip.style.top = `${Math.min(innerHeight - r.height - 8, e.clientY + 14)}px`; };
const hideTip = () => { tip.hidden = true; };

const SLOT_SIZES = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * 60_000);
function slotsOf(prompts, from, to, width) {
  const span = to - from, size = SLOT_SIZES.find((z) => width / (span / z) >= 10) || SLOT_SIZES.at(-1), n = Math.max(1, Math.round(span / size));
  const step = span / n, slots = Array.from({ length: n }, (_, i) => ({ from: from + i * step, to: i === n - 1 ? to : from + (i + 1) * step, cost: 0, ctx: null, calls: 0, prompts: 0, by: new Map() }));
  for (const p of prompts) {
    if (p.t < from || p.t > to) continue;
    const sl = slots[Math.min(n - 1, Math.floor((p.t - from) / step))];
    sl.cost += p.cost; sl.calls += p.calls || 0; sl.prompts++; sl.by.set(p.u, (sl.by.get(p.u) || 0) + p.cost);
    if (p.ctx) sl.ctx = Math.max(sl.ctx || 0, p.ctx);
  }
  return slots;
}
let shown = [];
function unfold(prompts) {
  const W = 1000, H = 240, top = 10, bottom = 4, ph = H - top - bottom, { from, to } = win, span = to - from;
  const slots = shown = slotsOf(prompts, from, to, el.clientWidth || 1000), n = slots.length, sw = W / n, bw = Math.max(1, sw * 0.72);
  const x = (t) => ((t - from) / span) * W;
  const maxC = Math.max(0.01, ...slots.map((sl) => sl.cost)), maxX = Math.max(1, ...slots.map((sl) => sl.ctx || 0));
  const total = slots.reduce((a, sl) => a + sl.cost, 0) || 1;
  let run = 0; const cum = slots.map((sl) => { run += sl.cost; return [x(sl.to), top + ph - (run / total) * ph]; });
  const area = `M0,${top + ph} L0,${top + ph} ${cum.map(([a, b], i) => `L${(i ? cum[i - 1][0] : 0).toFixed(1)},${b.toFixed(1)} L${a.toFixed(1)},${b.toFixed(1)}`).join(' ')} L${W},${top + ph} Z`;
  const mids = []; for (let d = new Date(from); d.setHours(24, 0, 0, 0), d.getTime() < to;) mids.push(d.getTime());
  const named = []; for (const t of mids) { const at = (t - from) / span; if (at > 0.1 && at < 0.92 && (!named.length || at - named.at(-1).at >= 0.08)) named.push({ t, at }); }
  const lines = span > 14 * 864e5 ? named.map((m) => m.t) : mids;
  const people = [...new Set(prompts.map((p) => p.u))];
  const cols = slots.map((sl, i) => {
    if (!sl.prompts) return '';
    const bx = (i * sw + (sw - bw) / 2).toFixed(1); let y0 = top + ph, out = '';
    for (const u of people) { const v = sl.by.get(u); if (!v) continue; const h = Math.max(1.5, (v / maxC) * ph * 0.92); y0 -= h; out += `<rect x="${bx}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${colorOf(u)}"/>`; }
    if (sl.ctx) out += `<rect x="${bx}" y="${(top + ph - (sl.ctx / maxX) * ph * 0.92 - 1.5).toFixed(1)}" width="${bw.toFixed(1)}" height="3" class="prj-ctxm"/>`;
    return out;
  }).join('');
  return `<div class="prj-chartw"><svg class="prj-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Spend and context over the range, in ${n} slots">
    ${lines.map((t) => `<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${top}" y2="${top + ph}" class="prj-grid"/>`).join('')}
    <path d="${area}" class="prj-cum"/>${cols}
    ${slots.map((sl, i) => `<rect data-i="${i}" x="${(i * sw).toFixed(1)}" y="${top}" width="${sw.toFixed(1)}" height="${ph}" fill="transparent" class="prj-hit"/>`).join('')}
  </svg><div class="prj-days"><span style="left:0">${esc(when(from))}</span>${named.map((m) => `<span style="left:${(m.at * 100).toFixed(2)}%">${new Date(m.t).toLocaleDateString([], span > 14 * 864e5 ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' })}</span>`).join('')}<span style="right:0">now</span></div></div>`;
}

function draw() {
  const d = data, c = sel ? d.conversations.find((x) => x.session_id === sel) : null;
  if (sel && !c) sel = null;
  const t = c ? { cost: c.cost, prompts: c.prompts, conversations: 1, perPrompt: med(c.series.map((x) => x.cost)), ctx: c.ctx, inp: c.inp, out: c.out, cr: c.cr, cw: c.cw } : d.totals;
  const prompts = c ? c.series : d.prompts;
  const pages = Math.ceil(d.conversations.length / PER);
  if (c) cpage = Math.floor(d.conversations.indexOf(c) / PER);
  cpage = Math.min(cpage, Math.max(0, pages - 1));
  const range0 = `<div class="prj-ranges" role="group" aria-label="Range">${Object.entries(RANGES).map(([key, [l]]) => `<button type="button" data-r="${key}" aria-pressed="${key === range}">${l}</button>`).join('')}</div>`;
  const peopleBar = d.people.length ? `<div class="prj-share">${d.people.map((p) => `<i style="flex:${Math.max(p.cost, 0.001)};background:${colorOf(p.user_key)}" title="${esc(nameOf(p.user_key))}: ${usd(p.cost)}"></i>`).join('')}</div>
    <div class="prj-who">${d.people.map((p) => `<span>${avatar(p.user_key)}<b>${esc(nameOf(p.user_key))}</b><small>${usd(p.cost)} · ${p.prompts} prompt${p.prompts === 1 ? '' : 's'}</small></span>`).join('')}</div>` : '';
  el.innerHTML = `
    <section class="card prj-head">
      
      <div class="prj-title"><h1>${esc(short(d.name))}</h1>${short(d.name) !== d.name ? `<span class="muted">${esc(d.name)}</span>` : ''}${range0}</div>
    </section>
    <section class="kpis headline prj-tiles">
      <div class="kpi"><span class="k">Spent</span><div class="v">${usd(t.cost)}</div><small class="muted">at API prices</small></div>
      <div class="kpi"><span class="k">Prompts</span><div class="v">${t.prompts}</div><small class="muted">${c ? 'in this conversation' : `in ${t.conversations} conversation${t.conversations === 1 ? '' : 's'}`}</small></div>
      <div class="kpi"><span class="k">Typical prompt</span><div class="v">${usd(t.perPrompt)}</div><small class="muted">half cost less</small></div>
      <div class="kpi"><span class="k">Typical context</span><div class="v">${k(t.ctx)}</div><small class="muted">per call, of a 1M window</small></div>
    </section>
    <section class="card prj-unfold">
      <header><h2>How it unfolded</h2>${c ? `<span class="prj-pick">${avatar(c.user_key)}<b>${esc(titleOf(c))}</b><button type="button" data-all>All conversations ×</button></span>` : ''}
        <div class="pj-legend"><span><i class="c"></i>spend</span><span><i class="l"></i>context it ran at</span><span><i class="a"></i>spend adding up</span></div></header>
      ${unfold(prompts)}
      ${tokensBar(t)}
      ${c ? '' : peopleBar}
    </section>
    <section class="card prj-convs">
      <header><h2>Conversations</h2><span class="muted small">newest first · pick one to see how it spent its tokens</span></header>
      <div class="prj-list">${d.conversations.slice(cpage * PER, (cpage + 1) * PER).map((x) => `<button type="button" class="prj-c" data-c="${esc(x.session_id)}" aria-pressed="${x === c}">
        ${avatar(x.user_key)}<span class="prj-ct"><b>${esc(titleOf(x))}</b><small class="muted">${when(x.first)} · ${x.prompts} prompt${x.prompts === 1 ? '' : 's'} · ${k(x.tok)} tokens · context ${k(x.ctx)}</small></span>
        <span class="prj-cs">${globalThis.promptSpark?.(x.series, colorOf) || ''}</span><b class="prj-cc">${usd(x.cost)}</b></button>`).join('')}</div>
      ${pages > 1 ? `<nav class="cv-pager" aria-label="Pages"><button type="button" data-cp="${cpage - 1}"${cpage <= 0 ? ' disabled' : ''}>‹ Newer</button>
        <span class="muted">${cpage * PER + 1}–${Math.min(d.conversations.length, (cpage + 1) * PER)} of ${d.conversations.length}</span>
        <button type="button" data-cp="${cpage + 1}"${cpage >= pages - 1 ? ' disabled' : ''}>Older ›</button></nav>` : ''}
    </section>`;
  el.setAttribute('aria-busy', 'false');
  document.title = `${short(d.name)} · Puddle`;
  for (const b of el.querySelectorAll('[data-r]')) b.onclick = () => { range = b.dataset.r; remember(); load(); };
  const pick = (sid) => { sel = sid; remember(); draw(); el.querySelector('.prj-unfold')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => pick(b.dataset.c === sel ? null : b.dataset.c);
  el.querySelector('[data-all]')?.addEventListener('click', () => pick(null));
  for (const b of el.querySelectorAll('[data-cp]')) b.onclick = () => { cpage = Number(b.dataset.cp); if (sel) { sel = null; remember(); } draw(); };
  for (const r of el.querySelectorAll('.prj-hit')) {
    const sl = shown[Number(r.dataset.i)], span = `${when(sl.from)}–${when(sl.to, new Date(sl.from).toDateString() !== new Date(sl.to).toDateString())}`;
    r.onmousemove = (e) => showTip(e, !sl.prompts ? `<b>${span}</b><div class="muted">No prompts</div>`
      : `<b>${span}</b>${[...sl.by.entries()].sort((a, b) => b[1] - a[1]).map(([u, v]) => `<div class="prj-tipp">${avatar(u)} ${esc(nameOf(u))} <b>${usd(v)}</b></div>`).join('')}`
        + `<div class="prj-tipv"><span><small>spent</small><b>${usd(sl.cost)}</b></span><span><small>prompts</small><b>${sl.prompts}</b></span><span><small>context</small><b>${k(sl.ctx)}</b></span><span><small>calls</small><b>${sl.calls}</b></span></div>`);
    r.onmouseleave = hideTip;
  }
}

function remember() {
  const u = new URL(location.href); u.searchParams.set('range', range);
  if (sel) u.searchParams.set('c', sel); else u.searchParams.delete('c');
  history.replaceState(null, '', u);
}

async function load() {
  const days = RANGES[range][1], to = Date.now() + 60_000, from = Date.now() - days * 864e5;
  win = { from, to: Date.now() };
  const qs = new URLSearchParams({ from, to, tz: -new Date().getTimezoneOffset(), p: name, ...(team ? { team } : {}), ...(demo ? { demo: '1' } : {}) });
  const r = await fetch(`/api/project?${qs}`).catch(() => null);
  if (!r || !r.ok) { el.innerHTML = `<section class="card"><p class="muted">Nothing for this project in this range${r?.status === 404 ? '' : ' (could not load it)'}.</p></section>`; return; }
  data = await r.json();
  if (data && Array.isArray(data.prompts?.[0])) {
    data.prompts = data.prompts.map(([t, cost, ctx, tok, calls, agents, u, s, inp, out, cr, cw]) => ({ t, cost, ctx, tok, calls, agents, u: data.team[u]?.user_key, s: data.conversations[s]?.session_id, inp, out, cr, cw }));
    for (const c of data.conversations) c.series = data.prompts.filter((x) => x.s === c.session_id);
  }
  if (!data) { el.innerHTML = `<section class="card"><p class="muted">Nothing for ${esc(short(name))} in this range.</p></section>`; return; }
  draw(); globalThis.PuddleHeal?.drawn();
}
load();
