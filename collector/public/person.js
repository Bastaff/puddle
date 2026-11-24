import { esc } from '/you.js';
import { CARDS, planPill } from '/craft.js';
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
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
const toolName = (t) => String(t || 'unknown').replace(/^mcp__/, '').replace(/__/g, ' · ').replace(/_/g, ' ');

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

function flagsCard(p, size) {
  const full = p.context?.full ? [{ kind: 'context', level: 'info', text: `${p.context.full} conversation${p.context.full === 1 ? '' : 's'} got nearly full (90%+)` }] : [];
  const f = [...(p.flags || []), ...full];
  if (!f.length && size !== 'l') return `<section class="card cr cr-${size} cr-flags" data-sz="${size}" data-learn="pv:flags"><header><h2>Needs a look</h2></header><p class="cr-big">0</p><p class="cr-line">nothing to check</p><p class="cr-nodata">✓ All good</p></section>`;
  if (size === 's') return `<section class="card cr cr-s cr-flags issues" data-sz="s" data-learn="pv:flags"><header><h2>Needs a look</h2></header><p class="cr-big">${f.length}</p>
    <p class="cr-line">${f.length === 1 ? 'thing to check' : 'things to check'}</p><div class="cr-fl">${f.map((x) => `<span class="cr-fi ${x.level}" title="${esc(x.text)}">${FLAG_IC[x.kind] || '!'}</span>`).join('')}</div>
    <p class="cr-flt">${esc(f[0].text)}</p></section>`;
  if (size === 'm') return `<section class="card cr cr-m cr-flags issues pv-flags" data-sz="m" data-learn="pv:flags"><header><h2>Needs a look</h2></header><div class="cr-fm"><div><p class="cr-big">${f.length}</p><p class="cr-line">${f.length === 1 ? 'thing to check' : 'things to check'}</p></div>
    <ul class="attention">${f.map((x) => `<li class="att ${x.level}${x.acknowledged ? ' ack' : ''}"><span class="att-ic">${FLAG_IC[x.kind] || '!'}</span><span class="att-t">${esc(x.text)}</span></li>`).join('')}</ul></div></section>`;
  return `<section class="card issues pv-flags" data-learn="pv:flags"><header><h2>Needs a look</h2>${f.length ? `<span class="chip">${f.length}</span>` : ''}</header>
    ${f.length ? `<ul class="attention">${f.map((x) => `<li class="att ${x.level}${x.acknowledged ? ' ack' : ''}"><span class="att-ic">${FLAG_IC[x.kind] || '!'}</span><span class="att-t">${esc(x.text)}</span></li>`).join('')}</ul>`
      : '<p class="ok">✓ Nothing needs a look</p>'}</section>`;
}

function attachTips(el, p, r, tools, st, fresh) {
  const n = p.now || {};
  const stEl = fresh.has('head') && el.querySelector('.pv-state');
  if (stEl) { stEl.dataset.learn = 'pv:state';
    hover(stEl, () => `<b>${esc(st.text)}</b>` + rows([['Last tool', esc(toolName(n.tool || '—'))], ['Last step', n.lastTs ? `${ago(n.lastTs)} ago` : '—'], ['Last prompt', n.promptTs ? `${ago(n.promptTs)} ago` : '—']])); }
  const plan = fresh.has('head') && el.querySelector('[data-plan]');
  if (plan) hover(plan, () => (p.plan?.agents || []).map((a) => `<b>${esc(a.label || 'Plan')}</b>` + rows([['5 hours', a.five_pct], ['Week', a.week_pct], [a.month_from === 'claude-code' ? 'Spend' : 'Month', a.month_pct]]
    .filter(([, v]) => v != null).map(([l, v]) => [l, `${Math.round(v)}% used`, v >= 95 ? 'var(--critical)' : v >= 80 ? 'var(--warn)' : 'var(--s1)']))).join(''));
}

const RANGES = { '7d': ['Last 7 days', 7], '30d': ['Last 30 days', 30], '90d': ['Last 90 days', 90] };

export function mountPerson(el, { api, cards = null, stream = null, you = false, back = null, links = {} }) {
  let range = '7d', data = null, win = null;
  try { range = sessionStorage.getItem('pv-range') || '7d'; } catch {}
  if (!RANGES[range]) range = '7d';
  const headRange = document.querySelector('header.bar #range'), headLearn = document.querySelector('header.bar #learn-btn');
  if (headLearn) headLearn.onclick = () => { learn.on = !learn.on; hideTip(); draw(); };
  const paintBar = () => {
    if (headRange) {
      for (const b of headRange.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.r === range));
      for (const b of headRange.querySelectorAll('button')) b.onclick = () => { range = b.dataset.r; try { sessionStorage.setItem('pv-range', range); } catch {} paintBar(); load(); };
    }
    headLearn?.setAttribute('aria-pressed', String(learn.on));
  };
  paintBar();
  let held = false;
  const layout = Layout.mount('person', el, { load: Layout.account.load, save: Layout.account.save,
    onShow: (id) => { draw(); const card = { squares: 'calendar', leverage: 'calendar', shipped: 'lines' }[id]; if (card && lastParams) fetchCard(card, lastParams); },
    onDone: () => { if (held) { held = false; draw(); } }, onResize: () => requestAnimationFrame(() => draw(true)) });
  const ctxOf = (p, r) => ({ data, p, r, win, period: RANGES[range][0] });
  const cardsHTML = (p, r) => {
    const ctx = ctxOf(p, r);
    const made = Object.entries(CARDS).map(([id, c]) => [id, () => c.html({ ...ctx, size: layout.size(id) || 'm' })]);
    made.push(['flags', () => flagsCard(p, layout.size('flags'))]);
    const sig = JSON.stringify([range, win?.from, data.daily?.length, data.work, data.codeLines, r?.today, r?.heat ? Math.floor(r.now / 36e5) : 0]);
    return made.filter(([id]) => layout.visible(id)).map(([id, make]) => {
      const html = make().replace(/^\s*<(\w+)/, `<$1 data-card="${id}"`);
      return { key: id, html, sig: html + (CARDS[id]?.draw ? sig : '') };
    });
  };
  const parts = new Map(), seen = new Set();
  const waiting = { squares: () => data.daily === undefined, leverage: () => data.daily === undefined, shipped: () => data.codeLines === undefined };
  function patch(list) {
    const keep = new Set(), fresh = new Set();
    for (const { key, html, sig } of list) {
      if (!html.trim()) continue;
      keep.add(key);
      const had = parts.get(key);
      if (had?.node.parentNode === el && had.sig === sig) continue;
      const t = document.createElement('template'); t.innerHTML = html.trim();
      const node = t.content.firstElementChild; if (!node) continue;
      const col = had?.node.parentNode === el ? had.node.style.gridColumn : globalThis.PuddleShape?.row(key);
      if (col && col !== 'auto') node.style.gridColumn = col;
      if (had?.node.parentNode === el && had.node.style.gridRow) node.style.gridRow = had.node.style.gridRow;
      if (cards && waiting[key]?.()) globalThis.PuddleShape ? PuddleShape.hold(node, key) : (node.dataset.wait = '1');
      else if (key !== 'head' && !seen.has(key)) { seen.add(key); node.classList.add('card-in'); setTimeout(() => node.classList.remove('card-in'), 600); }
      if (had?.node.parentNode === el) { const focused = had.node === document.activeElement; had.node.replaceWith(node); if (focused) queueMicrotask(() => node.focus({ preventScroll: true })); }
      else { const next = list.slice(list.findIndex((x) => x.key === key) + 1).map((x) => parts.get(x.key)?.node).find((n) => n?.parentNode === el); el.insertBefore(node, next || null); }
      parts.set(key, { node, sig }); fresh.add(key);
    }
    for (const [k, v] of parts) if (!keep.has(k)) { v.node.remove(); parts.delete(k); }
    return fresh;
  }
  const draw = (sized = false) => {
    if (!data || document.body.classList.contains('leaving')) return;
    if (layout.arranging() && sized !== true) { held = true; return; }
    const { person: p, rhythm: r, tools } = data, st = liveState(p);
    const name = you ? 'Me' : (p.name || (p.email || '').split('@')[0] || 'Someone');
    document.body.dataset.who = name;
    if (!you) globalThis.PuddleBar?.title(name);
    const head = you ? `<div class="pv-bar"><span class="pv-state ${st.kind}" style="--c:${st.c}"><i></i>${esc(st.text)}</span>${globalThis.signalsHTML?.(p) || ''}${you ? planPill(p.plan) : ''}</div>`
      : `<section class="card pv-head" style="--c:${st.c}">
        <div class="pv-who"><h1>${esc(name)}${globalThis.signalsHTML?.(p) || ''}</h1><span class="pv-state ${st.kind}"><i></i>${esc(st.text)}${st.sub ? ` <small>· ${esc(st.sub)}</small>` : ''}</span></div>
      </section>`;
    if (!parts.size) el.innerHTML = '';
    const fresh = patch([{ key: 'head', html: head, sig: head }, ...cardsHTML(p, r)]);
    layout.apply();
    const opt = { hover, rows }, ctx = ctxOf(p, r);
    for (const [id, c] of Object.entries(CARDS)) if (c.draw && fresh.has(id) && !parts.get(id).node.dataset.none) c.draw(parts.get(id).node, ctx, opt);
    document.body.classList.toggle('learn', learn.on);
    paintBar();
    if (fresh.has('head')) for (const g of parts.get('head').node.querySelectorAll('.sig')) hover(g, () => globalThis.signalTip(g.dataset.sig, p));
    attachTips(el, p, r, tools, st, fresh);
  };
  let busy = false, more = false, shown = null, staleTries = 0, staleTimer = null;
  const mounted = Date.now(), local = you && document.body.classList.contains('personal');
  const kept = () => { try { return local ? localStorage : sessionStorage; } catch { return null; } };
  async function load() {
    if (busy) { more = true; return; }
    busy = true;
    try { await loadOnce(); } finally { busy = false; if (more) { more = false; load(); } }
  }
  async function loadOnce() {
    const { from, to } = PuddleWhen.window(RANGES[range][1]);
    win = { from, to };
    const params = { from, to, tz: -new Date().getTimezoneOffset() };
    const key = `puddle-person:${location.pathname}${location.search}|${range}|${layout.visible('recent') ? '' : 'skip'}`;
    if (shown !== key) {
      shown = key;
      let hit = false;
      try { const v = JSON.parse(kept()?.getItem(key) || 'null'); if (v && Date.now() - v.at < (local ? 7 * 864e5 : 30 * 60_000)) { hit = true; Object.assign(cardData, v.cards || {}); data = { ...v.data, ...cardData }; draw(); globalThis.PuddlePerf?.drawn(you ? 'me' : 'person'); if (local) globalThis.PuddleBar?.sync({ at: v.at }); } } catch {}
      if (local && !hit && !data) globalThis.PuddleBar?.sync({});
    }
    lastParams = params;
    if (cards) layout.ready.then(() => { if (layout.visible('shipped')) fetchCard('lines', params); });
    const bar = globalThis.PuddleBar;
    let res;
    const retry = (why) => {
      if (data) return;
      if (local && Date.now() - mounted < 30_000) { clearTimeout(retryTimer); retryTimer = setTimeout(load, 2000); return; }
      parts.clear();
      el.innerHTML = `<section class="card pv-empty"><h2>${you ? 'Waiting for Puddle on this Mac' : 'This page can\'t be reached right now'}</h2><p class="muted">${esc(why)} Trying again by itself.</p></section>`;
      clearTimeout(retryTimer); retryTimer = setTimeout(load, 5000);
    };
    try { res = await fetch(api(params) + (cards ? '&parts=core' : '') + (layout.visible('recent') ? '' : '&skip=recent')); } catch { bar?.fetched('fail'); retry(you ? 'It isn\'t answering yet.' : 'No connection.'); return; }
    if (!res.ok && res.status !== 404 && data) { bar?.fetched(res.status === 503 ? 'busy' : 'fail'); return; }
    bar?.fetched('ok');
    const stale = Number(res.headers.get('x-puddle-stale')) || 0;
    if (local) bar?.sync(stale && res.ok ? { at: Date.now() - stale * 1000 } : null);
    if (stale && staleTries < 4) { staleTries++; lastLoad = 0; clearTimeout(staleTimer); staleTimer = setTimeout(() => load(), 2500 * staleTries); } else if (!stale) staleTries = 0;
    if (!res.ok) {
      const empty = you ? '<h2>Nothing here yet</h2><p class="muted">This page fills in by itself once you work with Claude Code or Codex on this Mac.</p>'
        : '<p class="muted">Nothing to show for this person here: no shared work yet.</p>';
      if (res.status !== 404) { retry('It answered with an error.'); return; }
      parts.clear();
      lastLoad = 0;
      el.innerHTML = `<section class="card pv-empty">${empty}</section>`; return;
    }
    const fresh = await res.json();
    try { kept()?.setItem(key, JSON.stringify({ at: Date.now(), data: fresh, cards: cardData })); } catch {  }
    data = { ...fresh, ...cardData };
    draw();
    globalThis.PuddlePerf?.drawn(you ? 'me' : 'person'); globalThis.PuddleHeal?.drawn();
    if (cards) {
      await layout.ready;
      if (!layout.visible('squares') && !layout.visible('leverage')) return;
      if (calSeen) fetchCard('calendar', params);
      else watchCal(params);
    }
  }
  const cardData = {};
  let calSeen = false, lastParams = null, retryTimer = null;
  async function fetchCard(name, params) {
    const r = await fetch(cards(name, params)).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (params !== lastParams) return;
    if (!r) { if (name === 'calendar' && data && data.daily === undefined) { cardData.daily = []; data.daily = []; draw(); } return; }
    Object.assign(cardData, r);
    try { const v = JSON.parse(kept()?.getItem(shown) || 'null'); if (v) kept()?.setItem(shown, JSON.stringify({ ...v, cards: cardData })); } catch {}
    if (!data) return;
    Object.assign(data, r); draw(); globalThis.PuddlePerf?.card(name);
  }
  let calParams = null;
  function watchCal(params) { calParams = params; nearCal(); }
  function nearCal() {
    if (calSeen || !calParams) return;
    const c = el.querySelector('.cr-squares') || el.querySelector('.cr-leverage');
    if (!layout.visible('squares') && !layout.visible('leverage')) return;
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
