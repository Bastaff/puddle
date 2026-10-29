// Every conversation of a team (or Me) over the range, a page at a time (/work?team=…&range=…&page=…&sort=…): who, its
// title, its project, how long it was worked on, its tokens and what it spent; newest first or ordered by any of those;
// narrowed to one person or one project. A row opens the conversation on its project's page. Each column says what it
// counts on hover. Numbers only: never a prompt, never code.
const q = new URLSearchParams(location.search), team = q.get('team'), demo = q.get('demo') === '1';
const RANGES = { '1d': ['1D', 1], '7d': ['7D', 7], '30d': ['30D', 30], '90d': ['90D', 90] };
let range = RANGES[q.get('range')] ? q.get('range') : '7d', page = Math.max(1, Number(q.get('page')) || 1);
// the orders, as the API knows them; and what each column counts (the header's hover)
const SORTS = { recent: 'Newest', time: 'Longest worked', tokens: 'Most tokens', cost: 'Most spent' };
const HINT = {
  time: 'Time worked: the minutes the agent was busy in this conversation (gaps over 5 minutes left out)',
  tokens: 'Tokens: everything its prompts used, input, output, cache read and cache write together. Open it to see them apart',
  cost: 'Spent: what its model calls cost, at API prices',
  last: 'Last: when it was last worked on',
};
let person = q.get('person') || '', project = q.get('project') || '', sort = SORTS[q.get('sort')] ? q.get('sort') : 'recent', data = null;
const el = document.getElementById('work');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (v) => { const x = Number(v) || 0; return `$${x < 10 ? x.toFixed(2) : Math.round(x).toLocaleString()}`; };
const k = (v) => (v == null ? '–' : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));
const hmm = (m) => `${Math.floor((m || 0) / 60)}:${String(Math.round((m || 0) % 60)).padStart(2, '0')} h`;
const ago = (t) => { if (!t) return ''; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return `${s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`} ago`; };
const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const colorOf = (u) => SLOTS[Math.max(0, (data?.team || []).findIndex((p) => p.user_key === u)) % SLOTS.length];
const nameOf = (u) => (data?.team || []).find((p) => p.user_key === u)?.name || 'someone';
const initials = (u) => nameOf(u).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const avatar = (u) => `<i class="prj-av" style="background:${colorOf(u)}" title="${esc(nameOf(u))}">${esc(initials(u))}</i>`;
const short = (n) => (/^[a-z0-9.-]+\.[a-z]+\/.+\/.+/i.test(n) ? n.split('/').pop() : n);
const scope = demo ? 'demo=1&' : team ? `team=${encodeURIComponent(team)}&` : '';
const back = () => (demo ? '/?demo=1' : team ? `/?team=${encodeURIComponent(team)}` : '/');
const untitled = (c) => (c.last ? `Conversation on ${new Date(c.last).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Conversation');
const open = (c) => `/project?${scope}p=${encodeURIComponent(c.project)}&range=${range}&c=${encodeURIComponent(c.session_id)}`;

// the page's state lives in its address: a link, reload or back lands on the same page of the same list
function remember() {
  const u = new URL(location.href);
  for (const [key, v] of [['range', range], ['page', page > 1 ? page : ''], ['person', person], ['project', project], ['sort', sort === 'recent' ? '' : sort]]) if (v) u.searchParams.set(key, v); else u.searchParams.delete(key);
  history.replaceState(null, '', u);
}

function draw() {
  const d = data, from = d.total ? (d.page - 1) * d.per + 1 : 0, to = Math.min(d.total, d.page * d.per);
  const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
  el.innerHTML = `
    <section class="card prj-head">
      <a class="pv-back" href="${back()}">‹ Back to ${team || demo ? 'the team' : 'Me'}</a>
      <div class="prj-title"><h1>Conversations</h1><span class="muted">${esc(SORTS[sort].toLowerCase())} first</span>
        <div class="prj-ranges" role="group" aria-label="Range">${Object.entries(RANGES).map(([key, [l]]) => `<button type="button" data-r="${key}" aria-pressed="${key === range}">${l}</button>`).join('')}</div></div>
      <div class="cv-filters">
        ${d.people.length > 1 || person ? `<label><span>Person</span><select id="w-person">${opt('', 'Everyone', !person)}${d.people.map((u) => opt(u, nameOf(u), u === person)).join('')}</select></label>` : ''}
        <label><span>Project</span><select id="w-project">${opt('', 'All projects', !project)}${d.projects.map((p) => opt(p, short(p), p === project)).join('')}</select></label>
        <label><span>Order by</span><select id="w-sort">${Object.entries(SORTS).map(([key, l]) => opt(key, l, key === sort)).join('')}</select></label>
      </div>
    </section>
    <section class="card">
      ${d.rows.length ? `<div class="cv-list"><div class="cv-c cv-head" aria-hidden="true"><i class="cv-sp"></i><span class="rc-t">Conversation</span>
        ${[['time', 'Time', 'cv-n cv-time'], ['tokens', 'Tokens', 'cv-n cv-tok'], ['cost', 'Spent', 'cv-n'], ['last', 'Last', 'rc-a']].map(([key, l, cls]) => `<span class="${cls}${sort === key || (key === 'last' && sort === 'recent') ? ' on' : ''}" title="${esc(HINT[key])}">${l}</span>`).join('')}</div>
        ${d.rows.map((c) => `<a class="cv-c" href="${esc(open(c))}">
        ${avatar(c.user_key)}<span class="rc-t"><b>${esc(c.title || untitled(c))}</b><small>${esc(nameOf(c.user_key))} · <span title="${esc(c.project)}">${esc(short(c.project))}</span></small></span>
        <span class="cv-n cv-time" title="${esc(HINT.time)}">${c.minutes ? hmm(c.minutes) : '–'}</span><span class="cv-n cv-tok" title="${c.tok.toLocaleString()} tokens">${k(c.tok)}</span>
        <b class="cv-n" title="$${c.cost.toFixed(2)} at API prices · ${c.prompts} prompt${c.prompts === 1 ? '' : 's'}">${usd(c.cost)}</b><span class="rc-a" title="${c.last ? esc(new Date(c.last).toLocaleString()) : ''}">${ago(c.last)}</span></a>`).join('')}</div>`
        : '<p class="muted">No conversations in this range.</p>'}
      ${d.pages > 1 ? `<nav class="cv-pager" aria-label="Pages">
        <button type="button" data-p="${d.page - 1}"${d.page <= 1 ? ' disabled' : ''}>‹ Previous</button>
        <span class="muted">${from}–${to} of ${d.total}</span>
        <button type="button" data-p="${d.page + 1}"${d.page >= d.pages ? ' disabled' : ''}>Next ›</button></nav>` : d.total ? `<p class="muted small cv-count">${d.total} conversation${d.total === 1 ? '' : 's'}</p>` : ''}
    </section>`;
  el.setAttribute('aria-busy', 'false');
  for (const b of el.querySelectorAll('[data-r]')) b.onclick = () => { range = b.dataset.r; page = 1; load(); };
  for (const b of el.querySelectorAll('[data-p]')) b.onclick = () => { page = Number(b.dataset.p); load(); window.scrollTo({ top: 0 }); };
  const sel = (id, set) => { const s = el.querySelector(id); if (s) s.onchange = () => { set(s.value); page = 1; load(); }; };
  sel('#w-person', (v) => { person = v; }); sel('#w-project', (v) => { project = v; }); sel('#w-sort', (v) => { sort = v; });
}

// one request at a time: a newer click cancels the one still on its way (an older answer never draws over a newer one,
// and the site stops working out a page nobody waits for)
let asking = null;
async function load() {
  remember();
  const days = RANGES[range][1], to = Date.now() + 60_000, from = range === '1d' ? new Date().setHours(0, 0, 0, 0) : Date.now() - days * 864e5;
  const qs = new URLSearchParams({ from, to, tz: -new Date().getTimezoneOffset(), page, ...(sort !== 'recent' ? { sort } : {}), ...(person ? { person } : {}), ...(project ? { project } : {}), ...(team ? { team } : {}), ...(demo ? { demo: '1' } : {}) });
  asking?.abort();
  const mine = asking = new AbortController();
  const r = await fetch(`/api/work?${qs}`, { signal: mine.signal }).catch(() => null);
  if (mine.signal.aborted) return;
  if (!r || !r.ok) { el.innerHTML = `<section class="card"><a class="pv-back" href="${back()}">‹ Back</a><p class="muted">Could not load the conversations.</p></section>`; return; }
  const fresh = await r.json().catch(() => null);
  if (mine.signal.aborted || !fresh) return;
  data = fresh;
  page = data.page;
  draw(); globalThis.JouleHeal?.drawn();
}
load();
