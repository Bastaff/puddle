// One project, unfolding through time (/project?team=…&p=…&range=…[&c=conversation]): what it cost and the context it
// ran at, prompt by prompt; spend adding up over the range; its tokens by kind; each conversation as its own small
// chart, and any one of them picked to see it alone (how that conversation spent its tokens); who did how much.
// Numbers only: never a prompt, never code. Costs at API prices.
const q = new URLSearchParams(location.search), team = q.get('team'), demo = q.get('demo') === '1', name = q.get('p') || '';
const RANGES = { '1d': ['1D', 1], '7d': ['7D', 7], '30d': ['30D', 30], '90d': ['90D', 90] };
const PER = 25; // conversations listed at a time
let range = RANGES[q.get('range')] ? q.get('range') : '7d', data = null, sel = q.get('c') || null, cpage = 0;
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
const back = () => (demo ? '/?demo=1' : team ? `/?team=${encodeURIComponent(team)}` : '/');
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const titleOf = (c) => c.title || `Conversation on ${new Date(c.first).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
// tokens by kind: what was sent fresh, what came back, what was re-read from the cache, what was written to it
const KINDS = [['inp', 'Input', 'var(--s1)'], ['out', 'Output', 'var(--s2)'], ['cr', 'Cache read', 'var(--s3)'], ['cw', 'Cache write', 'var(--s4)']];
function tokensBar(x) {
  const all = KINDS.reduce((a, [key]) => a + (x[key] || 0), 0);
  if (!all) return '';
  return `<div class="prj-tok"><div class="prj-share">${KINDS.map(([key, label, c]) => (x[key] ? `<i style="flex:${x[key]};background:${c}" title="${label}: ${k(x[key])}"></i>` : '')).join('')}</div>
    <ul>${KINDS.map(([key, label, c]) => `<li><i style="background:${c}"></i>${label} <b>${k(x[key] || 0)}</b><small>${Math.round(((x[key] || 0) / all) * 100)}%</small></li>`).join('')}</ul></div>`;
}

// tooltip: one small box that follows the pointer
const tip = Object.assign(document.createElement('div'), { className: 'tip' }); tip.hidden = true; document.body.append(tip);
const showTip = (e, html) => { tip.innerHTML = html; tip.hidden = false; const r = tip.getBoundingClientRect(); tip.style.left = `${Math.min(innerWidth - r.width - 8, e.clientX + 14)}px`; tip.style.top = `${Math.min(innerHeight - r.height - 8, e.clientY + 14)}px`; };
const hideTip = () => { tip.hidden = true; };

// The big chart: the range's prompts in order, evenly spaced (work comes in bursts, nights between), a line and
// the date where a new day starts. A column per prompt, as tall as what it spent, in its sender's colour; the line
// is the context its calls ran at; the area behind is spend adding up.
function unfold(prompts) {
  const W = 1000, H = 240, top = 10, bottom = 4, ph = H - top - bottom, n = prompts.length, step = W / Math.max(n, 1);
  const x = (i) => (i + 0.5) * step;
  const maxC = Math.max(0.01, ...prompts.map((p) => p.cost)), maxX = Math.max(1, ...prompts.map((p) => p.ctx || 0));
  const total = prompts.reduce((a, p) => a + p.cost, 0) || 1;
  let run = 0; const cum = prompts.map((p, i) => { run += p.cost; return [x(i), top + ph - (run / total) * ph]; });
  const area = n ? `M0,${top + ph} L0,${cum[0][1].toFixed(1)} ${cum.map(([a, b]) => `L${a.toFixed(1)},${b.toFixed(1)}`).join(' ')} L${W},${cum.at(-1)[1].toFixed(1)} L${W},${top + ph} Z` : '';
  // where a new day starts (at most ~10 labels; the others keep their line)
  const dayOf = (t) => new Date(t).toDateString(), days = [];
  prompts.forEach((p, i) => { if (!i || dayOf(p.t) !== dayOf(prompts[i - 1].t)) days.push(i); });
  // the dates under the chart as page text (text inside a stretched chart distorts), none closer than 7% apart
  const labels = []; for (const i of days) { const at = (i / Math.max(n, 1)) * 100; if (!labels.length || at - labels.at(-1).at >= 7) labels.push({ at, i }); }
  const bw = Math.max(2, Math.min(14, step * 0.7));
  return `<div class="prj-chartw"><svg class="prj-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Spend per prompt and context, prompt by prompt">
    ${days.map((i) => `<line x1="${(i * step).toFixed(1)}" x2="${(i * step).toFixed(1)}" y1="${top}" y2="${top + ph}" class="prj-grid"/>`).join('')}
    <path d="${area}" class="prj-cum"/>
    ${prompts.map((p, i) => { const h = Math.max(2, (p.cost / maxC) * ph * 0.92); return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(top + ph - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${colorOf(p.u)}"/>`; }).join('')}
    <polyline points="${prompts.map((p, i) => (p.ctx ? `${x(i).toFixed(1)},${(top + ph - (p.ctx / maxX) * ph * 0.92).toFixed(1)}` : '')).filter(Boolean).join(' ')}" class="prj-ctx" vector-effect="non-scaling-stroke"/>
    ${prompts.map((p, i) => `<rect data-i="${i}" x="${(i * step).toFixed(1)}" y="${top}" width="${step.toFixed(1)}" height="${ph}" fill="transparent" class="prj-hit"/>`).join('')}
  </svg><div class="prj-days">${labels.map((l) => `<span style="left:${l.at.toFixed(2)}%">${new Date(prompts[l.i].t).toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</span>`).join('')}</div></div>`;
}

function draw() {
  const d = data, c = sel ? d.conversations.find((x) => x.session_id === sel) : null;
  if (sel && !c) sel = null; // not in this range
  // what the tiles, the chart and the token bar show: the whole project, or the picked conversation
  const t = c ? { cost: c.cost, prompts: c.prompts, conversations: 1, perPrompt: med(c.series.map((x) => x.cost)), ctx: c.ctx, inp: c.inp, out: c.out, cr: c.cr, cw: c.cw } : d.totals;
  const prompts = c ? c.series : d.prompts;
  const pages = Math.ceil(d.conversations.length / PER);
  if (c) cpage = Math.floor(d.conversations.indexOf(c) / PER); // the picked one stays in view
  cpage = Math.min(cpage, Math.max(0, pages - 1));
  const range0 = `<div class="prj-ranges" role="group" aria-label="Range">${Object.entries(RANGES).map(([key, [l]]) => `<button type="button" data-r="${key}" aria-pressed="${key === range}">${l}</button>`).join('')}</div>`;
  const peopleBar = d.people.length ? `<div class="prj-share">${d.people.map((p) => `<i style="flex:${Math.max(p.cost, 0.001)};background:${colorOf(p.user_key)}" title="${esc(nameOf(p.user_key))}: ${usd(p.cost)}"></i>`).join('')}</div>
    <div class="prj-who">${d.people.map((p) => `<span>${avatar(p.user_key)}<b>${esc(nameOf(p.user_key))}</b><small>${usd(p.cost)} · ${p.prompts} prompt${p.prompts === 1 ? '' : 's'}</small></span>`).join('')}</div>` : '';
  el.innerHTML = `
    <section class="card prj-head">
      <a class="pv-back" href="${back()}">‹ Back to the team</a>
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
        <div class="pj-legend"><span><i class="c"></i>spend per prompt</span><span><i class="l"></i>context it ran at</span><span><i class="a"></i>spend adding up</span></div></header>
      ${prompts.length ? unfold(prompts) : '<p class="muted">No prompts with model calls in this range.</p>'}
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
  // pick a conversation (again: back to the whole project); its chart, tiles and tokens replace the project's
  const pick = (sid) => { sel = sid; remember(); draw(); el.querySelector('.prj-unfold')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => pick(b.dataset.c === sel ? null : b.dataset.c);
  el.querySelector('[data-all]')?.addEventListener('click', () => pick(null));
  for (const b of el.querySelectorAll('[data-cp]')) b.onclick = () => { cpage = Number(b.dataset.cp); if (sel) { sel = null; remember(); } draw(); };
  for (const r of el.querySelectorAll('.prj-hit')) {
    const p = prompts[Number(r.dataset.i)];
    r.onmousemove = (e) => showTip(e, `<b>${when(p.t)}</b> ${avatar(p.u)} ${esc(nameOf(p.u))}<div class="prj-tipv"><span><small>spent</small><b>${usd(p.cost)}</b></span><span><small>context</small><b>${k(p.ctx)}</b></span><span><small>calls</small><b>${p.calls}</b></span>${p.agents ? `<span><small>sub-agents</small><b>${p.agents}</b></span>` : ''}</div>`
      + `<div class="prj-tipv">${KINDS.map(([key, label]) => `<span><small>${label.toLowerCase()}</small><b>${k(p[key] || 0)}</b></span>`).join('')}</div>`);
    r.onmouseleave = hideTip;
  }
}

// the range and the picked conversation live in the address: a link or a reload lands on the same view
function remember() {
  const u = new URL(location.href); u.searchParams.set('range', range);
  if (sel) u.searchParams.set('c', sel); else u.searchParams.delete('c');
  history.replaceState(null, '', u);
}

async function load() {
  const days = RANGES[range][1], to = Date.now() + 60_000, from = range === '1d' ? new Date().setHours(0, 0, 0, 0) : Date.now() - days * 864e5;
  const qs = new URLSearchParams({ from, to, tz: -new Date().getTimezoneOffset(), p: name, ...(team ? { team } : {}), ...(demo ? { demo: '1' } : {}) });
  const r = await fetch(`/api/project?${qs}`).catch(() => null);
  if (!r || !r.ok) { el.innerHTML = `<section class="card"><a class="pv-back" href="${back()}">‹ Back to the team</a><p class="muted">Nothing for this project in this range${r?.status === 404 ? '' : ' (could not load it)'}.</p></section>`; return; }
  data = await r.json();
  // prompts arrive as compact rows: back into objects; each conversation gets its own prompts
  if (data && Array.isArray(data.prompts?.[0])) {
    data.prompts = data.prompts.map(([t, cost, ctx, tok, calls, agents, u, s, inp, out, cr, cw]) => ({ t, cost, ctx, tok, calls, agents, u: data.team[u]?.user_key, s: data.conversations[s]?.session_id, inp, out, cr, cw }));
    for (const c of data.conversations) c.series = data.prompts.filter((x) => x.s === c.session_id);
  }
  if (!data) { el.innerHTML = `<section class="card"><a class="pv-back" href="${back()}">‹ Back to the team</a><p class="muted">Nothing for ${esc(short(name))} in this range.</p></section>`; return; }
  draw(); globalThis.JouleHeal?.drawn();
}
load();
