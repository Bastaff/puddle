'use strict';

const $ = (s) => document.querySelector(s);
const SOLO = document.body.classList.contains('personal');
const HOUR = 3600_000, DAY = 24 * HOUR;
const state = { range: '7d', tab: 'live' };
try { Object.assign(state, JSON.parse(localStorage.getItem('cu2') || '{}')); } catch {}
if (state.range === 'today') state.range = '1d';
delete state.user;
const save = () => { try { localStorage.setItem('cu2', JSON.stringify({ ...state, zoom: null })); } catch {} };
let D = null;
const SKIP_PART = { recent: 'recent', features: 'features' };
const layout = Layout.mount('team', $('#grid'), { before: $('#learn-btn'), load: Layout.account.load, save: Layout.account.save,
  onShow: (id) => { if (SKIP_PART[id]) load(); else { render(); cards.refresh(); } },
  onResize: () => requestAnimationFrame(render) });
const shownCard = (id) => layout.visible(id);
const skipped = () => Object.keys(SKIP_PART).filter((id) => !shownCard(id)).map((id) => SKIP_PART[id]).sort().join(',');
const showCost = () => false;
const evTokens = (e) => (e.input_tokens || 0) + (e.output_tokens || 0) + (e.cache_read || 0) + (e.cache_creation || 0);

const Sound = globalThis.PuddleSound;

const nf = new Intl.NumberFormat();
const compact = (n) => {
  if (n == null) return '—';
  const a = Math.abs(n), one = (v, u) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: v < 100 ? 1 : 0 }).format(v)}${u}`;
  if (a >= 1e9) return one(n / 1e9, 'b');
  if (a >= 1e6) return one(n / 1e6, 'm');
  if (a >= 1e3) return one(n / 1e3, 'k');
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: a < 10 ? 1 : 0 }).format(n);
};
const clock = (ms) => {
  if (ms == null) return '—';
  const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
const usd = (n) => (n == null ? '—' : n > 0 && n < 0.01 ? '<$0.01' : '$' + (n >= 1000 ? compact(n) : n.toFixed(n >= 100 ? 0 : 2)));
const dur = (ms) => (ms == null ? '—' : ms < 1000 ? `${Math.round(ms)}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s` : ms < HOUR ? `${Math.floor(ms / 60_000)}m${pad(Math.round((ms % 60_000) / 1000))}` : `${Math.floor(ms / HOUR)}h${pad(Math.floor((ms % HOUR) / 60_000))}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ago = (t) => { if (!t) return 'never'; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const WAIT = [{ key: 'claude', label: 'Claude', color: 'var(--s1)' }, { key: 'tools', label: 'Tools', color: 'var(--s2)' }];

let people = [];
const colorOf = (key) => SLOTS[Math.max(0, people.findIndex((p) => p.user_key === key)) % SLOTS.length];
const initials = (p) => {
  const n = (p?.name || p?.email || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((n[0]?.[0] || '?') + (n[1]?.[0] || '')).toUpperCase();
};
const flag = (cc) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '');
const regionName = (cc, lang) => { try { return new Intl.DisplayNames(lang ? [lang] : undefined, { type: 'region' }).of(cc); } catch { return cc; } };
const localTime = (tz) => { try { return new Date().toLocaleTimeString([], { timeZone: tz, hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const localHour = (tz) => { try { return +new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()); } catch { return 12; } };
const isLive = (p) => p.last_active && Date.now() - p.last_active < 3 * 60_000;
const displayName = (p) => p?.name || (p?.email || '').replace(/@.*/, '') || 'Unknown';
const avatar = (p, cls = '') => `<span class="avatar ${cls}" style="background:${colorOf(p.user_key)}">${esc(initials(p))}<span class="presence${isLive(p) ? ' on' : ''}"></span></span>`;

const RANGE_LEN = { '1d': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY };
function bounds() {
  const now = Date.now(), len = RANGE_LEN[state.range] || 7 * DAY;
  return { from: now - len, to: now, len };
}
if (new URLSearchParams(location.search).get('demo') === '1') state.demo = true;
const TEAM = new URLSearchParams(location.search).get('team');
const api = (u) => {
  const add = (k, v) => { u += (u.includes('?') ? '&' : '?') + k + '=' + encodeURIComponent(v); };
  if (state.demo) add('demo', '1'); else if (TEAM) add('team', TEAM);
  return u;
};
function qs(extra = {}) {
  const { from, to } = bounds();
  return new URLSearchParams({ from, to: to + 60_000, ...extra }).toString();
}

const tip = $('#tip');
function showTip(e, html) {
  if (LEARN.on) {
    const x = LEARN.explain(e.target?.closest?.('[data-learn]')?.dataset.learn);
    if (x) html = (html || '') + `<div class="learn-x">${x}</div>`;
  }
  if (!html) return hideTip();
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
const hideTip = () => { tip.hidden = true; };
const rows = (pairs) => pairs.map(([k, v, c]) => `<div class="row"><span>${c ? `<i style="background:${c}"></i>` : ''}${esc(k)}</span><span>${v}</span></div>`).join('');
function hover(el, html) { el.onmousemove = (e) => showTip(e, typeof html === 'function' ? html(e) : html); el.onmouseleave = hideTip; el.ontouchstart = (e) => showTip(e.touches[0], typeof html === 'function' ? html(e.touches[0]) : html); }
addEventListener('scroll', hideTip, { passive: true });
let learnTip = false;
const ownTip = (n) => { for (; n && n !== document.body; n = n.parentElement) { if (n.onmousemove) return true; if (n.dataset?.learn) return false; } return false; };
document.addEventListener('mousemove', (e) => {
  if (!LEARN.on || ownTip(e.target)) return;
  if (e.target.closest?.('[data-learn]')) { showTip(e, ''); learnTip = true; } else if (learnTip) { hideTip(); learnTip = false; }
});

function niceMax(v) {
  if (!v) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}

function spark(values, color) {
  const v = values.length ? values : [0];
  const max = Math.max(...v, 1e-9);
  const x = (i) => (v.length === 1 ? 50 : (i / (v.length - 1)) * 100);
  const y = (n) => 28 - (n / max) * 24;
  const line = v.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(n).toFixed(2)}`).join('');
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <path d="${line}L100,30L0,30Z" fill="${color}" opacity="0.14"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

function bars(el, keys, rowsByKey, series, o = {}) {
  const W = el.clientWidth || 400, H = el.clientHeight || 160;
  const m = { l: o.noY ? 2 : 36, r: 2, t: 6, b: o.noX ? 4 : 18 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const tot = keys.map((k) => series.reduce((s, sr) => s + (rowsByKey[k]?.[sr.key] || 0), 0));
  const max = niceMax(Math.max(0, ...tot));
  const y = (v) => m.t + ih - (v / max) * ih;
  const step = iw / Math.max(1, keys.length);
  const bw = Math.max(2, Math.min(o.maxBar || 22, step * 0.72));
  const fmt = o.fmt || compact;
  const empty = !tot.some(Boolean);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || 'chart')}">`;
  const clean = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].some((m) => Math.abs(v / e - m) < 1e-9); };
  const nt = [4, 3, 2, 5].find((n) => clean(max / n)) || 3;
  for (let i = 0; i <= (empty || o.noY ? 0 : nt); i++) {
    const v = (max / nt) * i, yy = y(v);
    s += `<line class="${i ? 'gl' : 'bl'}" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
    if (!o.noY && i) s += `<text x="${m.l - 6}" y="${yy + 3}" text-anchor="end">${fmt(v, true)}</text>`;
  }
  if (empty || o.noY) s += `<line class="bl" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  const every = o.every || Math.max(1, Math.ceil(keys.length / Math.max(1, Math.floor(iw / 56))));
  keys.forEach((k, i) => {
    const cx = m.l + step * i + step / 2;
    if (!o.noX && i % every === 0) s += `<text x="${cx}" y="${H - 4}" text-anchor="middle">${esc(o.label ? o.label(k) : k)}</text>`;
    let base = 0;
    const segs = series.map((sr) => ({ sr, v: rowsByKey[k]?.[sr.key] || 0 })).filter((x) => x.v > 0);
    const now = o.highlightLast && i === keys.length - 1;
    if (now) s += '<g class="now">';
    segs.forEach((g, j) => {
      const y0 = y(base), y1 = y(base + g.v), top = j === segs.length - 1;
      const h = Math.max(1, y0 - y1 - (top ? 0 : 2));
      const r = top ? Math.min(3, h, bw / 2) : 0, x0 = cx - bw / 2, yt = y0 - h;
      s += r ? `<path fill="${g.sr.color}" d="M${x0},${y0}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${y0}Z"/>`
             : `<rect fill="${g.sr.color}" x="${x0}" y="${yt}" width="${bw}" height="${h}"/>`;
      base += g.v;
    });
    if (now) s += '</g>';
    s += `<rect class="hit" data-i="${i}" x="${m.l + step * i}" y="${m.t}" width="${step}" height="${ih}" rx="3"/>`;
  });
  if (empty) s += `<text class="nodata" x="${m.l + iw / 2}" y="${m.t + ih / 2}" text-anchor="middle">—</text>`;
  el.innerHTML = s + '</svg>';
  for (const h of el.querySelectorAll('.hit')) {
    const i = +h.dataset.i, k = keys[i];
    hover(h, () => `<b>${esc(o.title ? o.title(k) : k)}</b>` + rows(series.map((sr) => [sr.label, fmt(rowsByKey[k]?.[sr.key] || 0), sr.color])) + (series.length > 1 ? rows([['Total', fmt(tot[i])]]) : ''));
  }
}

function ring(segments, value, unit, label, sev = '') {
  const R = 38, C = 2 * Math.PI * R;
  let off = 0, arcs = '';
  for (const g of segments) {
    const len = Math.max(0, Math.min(1, g.v)) * C;
    if (len > 0.5) arcs += `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${g.color}" stroke-width="10" stroke-dasharray="${Math.max(0.1, len - (segments.length > 1 ? 1.5 : 0))} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)" stroke-linecap="${segments.length > 1 ? 'butt' : 'round'}"/>`;
    off += len;
  }
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${esc(label + ' ' + value)}">
    <circle class="track" cx="50" cy="50" r="${R}" fill="none" stroke-width="10"/>${arcs}
    <text class="rv" x="50" y="${unit ? 53 : 57}" text-anchor="middle">${esc(value)}</text>
    ${unit ? `<text class="ru" x="50" y="67" text-anchor="middle">${esc(unit)}</text>` : ''}</svg>`;
}
const severity = (pct) => (pct >= 90 ? { color: 'var(--critical)', mark: '<span class="sev crit" aria-label="critical">●</span>' } : pct >= 70 ? { color: 'var(--warn)', mark: '<span class="sev warn" aria-label="high">▲</span>' } : { color: 'var(--s1)', mark: '' });

function delta(cur, prev) {
  if (!prev) return '';
  const d = (cur - prev) / prev;
  if (!isFinite(d) || Math.abs(d) < 0.005) return '<span class="delta">=</span>';
  return `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d * 100) >= 100 ? Math.round(Math.abs(d * 100)) : Math.abs(d * 100).toFixed(0)}%</span>`;
}

const kpiValues = {};
function renderKpis(d) {
  const working = d.team.people.filter((p) => nowState(p).kind === 'work').length;
  const h = { ...d.team.headline, activeNow: working };
  const { keys, at } = bucketKeys(d.board.timeseries);
  const pr = {}; for (const r of d.board.timeseries.prompts) pr[at(r.bucket)] = (pr[at(r.bucket)] || 0) + Number(r.n || 0);
  const meter = (v, color) => `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="22" width="100" height="5" rx="2.5" fill="var(--wash)"/><rect x="0" y="22" width="${Math.max(0, Math.min(100, v * 100))}" height="5" rx="2.5" fill="${color}"/></svg>`;
  const presence = `<svg viewBox="0 0 100 30" aria-hidden="true">${d.team.people.slice(0, 12).map((p, i) => { const st = nowState(p); return `<circle cx="${6 + i * 8}" cy="22" r="3.2" fill="${st.kind === 'work' ? st.color : 'var(--axis)'}"/>`; }).join('')}</svg>`;
  const H = { minutes: d.team.headline.activeMinutes || 0, prev: d.team.headline.prevMinutes || 0, long: d.team.headline.longRuns || 0,
    runs: d.team.headline.runPrompts || 0, smooth: d.team.headline.smoothPrompts || 0, outside: d.team.headline.outsideMinutes || 0, near: d.team.headline.nearLimit || 0 };
  const share = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const hm = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const tiles = [
    { id: 'active', label: 'People using it', value: `${h.active}/${h.people}`, spark: presence, tip: `People who sent at least one prompt in this period (${h.prevActive} in the previous one). Dots: who is working right now.` },
    { id: 'time', label: 'Time with agents', value: hm(H.minutes), unit: 'h', delta: H.prev ? delta(H.minutes, H.prev) : '', spark: spark(keys.map((k) => pr[k] || 0), 'var(--s5)'),
      tip: 'Active time: stretches of work with less than 5 minutes between steps; parallel conversations count once.' + (H.prev ? ` Previous period: ${hm(H.prev)} h.` : '') },
    { id: 'handover', label: 'Handed over', value: `${share(H.long, H.runs)}%`, unit: 'of prompts', spark: meter(H.runs ? H.long / H.runs : 0, 'var(--s7)'),
      tip: `Prompts where the agent took 20 or more steps on its own: ${nf.format(H.long)} of ${nf.format(H.runs)}. Higher = bigger tasks handed over.` },
    { id: 'smooth', label: 'Ran smoothly', value: `${share(H.smooth, H.runs)}%`, unit: 'of prompts', spark: meter(H.runs ? H.smooth / H.runs : 0, 'var(--good)'),
      tip: `Prompts where no step failed: ${nf.format(H.smooth)} of ${nf.format(H.runs)}. Some failures are normal (a test that fails before it is fixed).` },
    { id: 'limits', label: 'Near a plan limit', value: `${H.near}`, unit: H.near === 1 ? 'person' : 'people', spark: meter(h.people ? H.near / h.people : 0, 'var(--warn)'), tip: 'People at 80% or more of their 5-hour or weekly subscription allowance (from Puddle\'s status line).' },
    { id: 'hours', label: 'Outside hours', value: `${share(H.outside, H.minutes)}%`, unit: 'of time', spark: meter(H.minutes ? H.outside / H.minutes : 0, 'var(--s4)'),
      tip: 'Active time in the evening (19–24), at night (0–8) or at the weekend, in each person\'s own time zone.' },
  ];
  if (!d.team.people.some((p) => p.five_pct != null || p.week_pct != null)) tiles.splice(tiles.findIndex((t) => t.id === 'limits'), 1);
  const box = $('#kpis');
  box.style.gridTemplateColumns = innerWidth > 1180 ? `repeat(${tiles.length}, minmax(0, 1fr))` : '';
  if (box.children.length !== tiles.length || box.querySelector('.sk')) {
    box.innerHTML = tiles.map((t) => `<div class="kpi" data-k="${t.id}" data-learn="kpi:${t.id}"><div class="k"><span>${t.label}</span><span class="dl"></span></div><div class="v"><span class="val"></span><small class="unit"></small></div><div class="sp"></div></div>`).join('');
  }
  tiles.forEach((t, i) => {
    const el = box.children[i];
    el.querySelector('.k span').textContent = t.label;
    el.querySelector('.dl').innerHTML = t.delta || '';
    el.querySelector('.unit').textContent = t.unit || '';
    el.querySelector('.sp').innerHTML = t.spark;
    kpiValues[t.id] = t.value;
    if (!Fx.holding(t.id)) roll(el.querySelector('.val'), t.value);
    hover(el, `<b>${t.label}</b>${esc(t.tip)}`);
  });
  Fx.milestones(tiles);
}
const rollKpi = (id) => { const el = document.querySelector(`.kpi[data-k="${id}"] .val`); if (el && kpiValues[id] != null) roll(el, kpiValues[id]); };

const REDUCED = { get matches() { return !Motion.any(); } };
function roll(el, text) {
  const old = el.dataset.v;
  if (old === text) return;
  el.dataset.v = text;
  clearTimeout(el._t);
  if (old == null || REDUCED.matches) { el.textContent = text; return; }
  const a = [...old], b = [...text], off = a.length - b.length;
  let html = '', k = 0;
  b.forEach((ch, i) => {
    const prev = a[i + off];
    if (/\d/.test(ch) && prev !== ch) {
      const from = /\d/.test(prev || '') ? +prev : 0, to = +ch;
      const steps = ((to - from + 10) % 10) || 10;
      const seq = Array.from({ length: steps + 1 }, (_, j) => (from + j) % 10);
      html += `<span class="reel"><span class="strip" style="--n:${steps};--i:${k++}">${seq.map((n) => `<span>${n}</span>`).join('')}</span></span>`;
    } else html += esc(ch);
  });
  el.innerHTML = html;
  el._t = setTimeout(() => { el.textContent = text; }, 1400);
}

const FEATS = [
  ['skills', 'S', 'Skills'], ['mcp', 'M', 'MCP connectors'], ['subagents', 'A', 'Subagents'],
  ['web', 'W', 'Web search'], ['edits', 'E', 'File edits'], ['mentions', '@', '@-mentions'], ['plugins', 'P', 'Plugins'],
];
const CAT = {
  read:  { label: 'Read',   verb: 'Reading',     c: 'var(--k-read)',  ic: '<circle cx="6.8" cy="6.8" r="5.4" opacity=".35"/><circle cx="6.8" cy="6.8" r="2.6"/><rect x="9.4" y="10.7" width="6.2" height="3" rx="1.5" transform="rotate(45 12.5 12.2)"/>' },
  edit:  { label: 'Edit',   verb: 'Editing',    c: 'var(--k-edit)',  ic: '<path d="M3 9.8 1.9 13.6a.4.4 0 0 0 .5.5L6.2 13z" opacity=".45"/><path d="M10.9 1.9a1.6 1.6 0 0 1 2.3 0l.9.9a1.6 1.6 0 0 1 0 2.3L6.6 12.6 3.4 9.4z"/>' },
  run:   { label: 'Run',    verb: 'Running', c: 'var(--k-run)',   ic: '<rect x="1" y="2" width="14" height="12" rx="3" opacity=".3"/><path d="M4.3 5.4 7 8l-2.7 2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.3" y="9.7" width="4.2" height="2" rx="1"/>' },
  web:   { label: 'Web',    verb: 'Browsing',       c: 'var(--k-web)',   ic: '<circle cx="8" cy="8" r="6.8" opacity=".3"/><ellipse cx="8" cy="8" rx="2.7" ry="6.8"/><rect x="1.2" y="7" width="13.6" height="2" rx="1" opacity=".7"/>' },
  agent: { label: 'Agents', verb: 'Delegating',       c: 'var(--k-agent)', ic: '<path d="M4 8 12 4M4 8l8 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" opacity=".45"/><circle cx="3.8" cy="8" r="2.7"/><circle cx="12.2" cy="3.9" r="2.4"/><circle cx="12.2" cy="12.1" r="2.4"/>' },
  mcp:   { label: 'MCP',    verb: 'Using MCP', c: 'var(--k-mcp)',   ic: '<rect x="5" y="1" width="2" height="4.2" rx="1"/><rect x="9" y="1" width="2" height="4.2" rx="1"/><path d="M3.4 4.6h9.2v2.6a4.6 4.6 0 0 1-9.2 0z"/><rect x="7" y="10.8" width="2" height="4.4" rx="1" opacity=".5"/>' },
  other: { label: 'Other',  verb: 'Planning',         c: 'var(--k-other)', ic: '<rect x="2" y="2.8" width="12" height="2.6" rx="1.3"/><rect x="2" y="6.7" width="12" height="2.6" rx="1.3" opacity=".6"/><rect x="2" y="10.6" width="7.6" height="2.6" rx="1.3" opacity=".35"/>' },
};
const CATS = Object.keys(CAT);
const STATE_IC = {
  think: '<path d="M7.5 1.5c.5 3.3 2.2 5 5.5 5.5-3.3.5-5 2.2-5.5 5.5C7 9.2 5.3 7.5 2 7c3.3-.5 5-2.2 5.5-5.5z"/><circle cx="13" cy="13" r="1.7" opacity=".5"/>',
  idle: '<rect x="3.4" y="3" width="3.4" height="10" rx="1.7"/><rect x="9.2" y="3" width="3.4" height="10" rx="1.7"/>',
  away: '<path d="M13.4 10.4A6.1 6.1 0 0 1 5.6 2.6a6.2 6.2 0 1 0 7.8 7.8z"/><circle cx="12.6" cy="3.6" r="1.3" opacity=".5"/>',
};
const icon = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 16 16" aria-hidden="true">${CAT[k]?.ic || STATE_IC[k] || ''}</svg>`;
const catOf = (tool) => {
  const t = String(tool || '');
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(t)) return 'read';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t)) return 'edit';
  if (/^(Bash|BashOutput|KillShell|KillBash|Monitor)$/.test(t)) return 'run';
  if (/^(WebFetch|WebSearch)$/.test(t)) return 'web';
  if (/^(Agent|Task|Skill|Workflow)$/.test(t)) return 'agent';
  if (t.startsWith('mcp__') || t === 'mcp_tool') return 'mcp';
  return 'other';
};
const dominant = (mix) => { let best = null; for (const k of CATS) if ((mix[k] || 0) > (mix[best] || 0)) best = k; return best; };

const MARKS = {
  'claude-code': { c: '#d97757', svg: '<path d="M8 .9 9.1 6 13 2.6 10.4 7.1l5.1.4-5 1.3 3.8 3.5-4.7-2.2.3 5.2L8 10.6l-1.9 4.7.3-5.2-4.7 2.2 3.8-3.5-5-1.3 5.1-.4L3 2.6 6.9 6z"/>' },
  codex: { c: 'var(--ink)', svg: '<path d="M8 .8 14.3 4.4v7.2L8 15.2 1.7 11.6V4.4z" opacity=".22"/><path d="M8 2.6 12.7 5.3v5.4L8 13.4 3.3 10.7V5.3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m5.8 6.4 1.9 1.6-1.9 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.4" y="9.1" width="2.4" height="1.4" rx=".7"/>' },
};
const AG = () => globalThis.PuddleAgents;
const agentMark = (a) => {
  const m = MARKS[a] || { c: 'var(--muted)', svg: `<circle cx="8" cy="8" r="7" opacity=".25"/><text x="8" y="11.3" text-anchor="middle" font-size="9.5" font-weight="800">${esc(AG()?.agent(a).letter || '?')}</text>` };
  return `<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" style="color:${m.c}" aria-hidden="true">${m.svg}</svg>`;
};
const liveSessions = (p, within = 3 * 60_000) => (p.now?.sessions || []).filter((x) => Date.now() - x.ts < within);
function agentsNow(p) {
  const by = new Map();
  for (const x of liveSessions(p)) { const a = x.agent || 'claude-code'; (by.get(a) || by.set(a, []).get(a)).push(x); }
  if (!by.size) return '';
  return `<span class="agents-now">${[...by].map(([a, list]) => {
    const apps = new Map(); for (const x of list) { const l = AG()?.client(x.client)?.label; if (l) apps.set(l, (apps.get(l) || 0) + 1); }
    const tip = `${AG()?.agent(a).name || a}${list.length > 1 ? ` ×${list.length}` : ''}${apps.size ? ` · ${[...apps].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(', ')}` : ''}`;
    return `<span class="an" title="${esc(tip)}" aria-label="${esc(tip)}">${agentMark(a)}${list.length > 1 ? `<b>×${list.length}</b>` : ''}</span>`;
  }).join('')}</span>`;
}

function nowState(p) {
  const n = p.now || {}, now = Date.now(), since = n.lastTs ? now - n.lastTs : Infinity;
  if (since < 90_000) {
    const doing = n.toolTs && now - n.toolTs < 120_000 ? n.doing : null;
    const newest = [...(n.sessions || [])].sort((a, b) => b.ts - a.ts)[0], who = AG()?.agent(newest?.agent || 'claude-code').short || 'Claude';
    return { kind: 'work', ic: doing || 'think', color: doing ? CAT[doing].c : 'var(--k-think)', label: doing ? CAT[doing].verb : `${who} is thinking`,
      sub: n.promptTs ? ago(n.promptTs) : '' };
  }
  if (since < 30 * 60_000) return { kind: 'idle', ic: 'idle', color: 'var(--muted)', label: `Idle ${ago(n.lastTs)}`, sub: '' };
  const seen = p.now?.everTs || p.lastActive;
  return { kind: 'away', ic: 'away', color: 'var(--axis)', label: seen ? `Away ${ago(seen)}` : 'No data yet', sub: '' };
}

const BCOLS = [
  { key: 'now', label: 'Person · right now', get: (p) => p.now?.lastTs || 0 },
  { key: 'mix', label: 'Works on', get: (p) => CATS.indexOf(dominant(p.mix)) },
  { key: 'prompts', label: 'Time', get: (p) => p.activeMinutes || 0 },
  { key: 'autonomy', label: 'Task size', get: (p) => (p.runs?.prompts ? (p.runs.long * 2 + taskMix(p).short) / p.runs.prompts : -1) },
  { key: 'limits', label: 'Limits', get: (p) => (p.plan ? Math.max(p.plan.five_pct ?? 0, p.plan.week_pct ?? p.plan.month_pct ?? 0) : -1) },
];
const taskMix = (p) => { const r = p.runs || {}, q = r.chat || 0, l = r.long || 0; return { prompts: r.prompts || 0, q, short: Math.max(0, (r.prompts || 0) - q - l), long: l }; };
const handsOff = (p) => {
  const m = taskMix(p);
  if (!m.prompts) return { word: '—', tip: 'No prompts in this period' };
  const pc = (v) => `${Math.round((v / m.prompts) * 100)}% of ${nf.format(m.prompts)} prompts`;
  return m.long / m.prompts >= 0.15 ? { word: 'Long tasks', tip: `${pc(m.long)} ran 20+ steps on their own` }
    : m.q / m.prompts >= 0.5 ? { word: 'Questions', tip: `${pc(m.q)} used no tools` }
    : { word: 'Short tasks', tip: `${pc(m.short)} took 1–19 steps` };
};
const hmm = (m) => `${Math.floor((m || 0) / 60)}:${String(Math.round((m || 0) % 60)).padStart(2, '0')}`;

const laneTotal = (b) => (b ? b.slice(1, 1 + CATS.length).reduce((a, v) => a + v, 0) : 0);
function laneSvg(p, scale, liveNow) {
  const L = p.lane || [], n = L.length, H = 32, base = H - 5;
  let h = `<rect x="0" y="${base}" width="${n * 6}" height=".6" fill="var(--axis)"/>`;
  L.forEach((b, i) => {
    if (!b) return;
    const tot = laneTotal(b), x = i * 6 + 0.6;
    const hh = tot ? Math.max(2.5, Math.sqrt(tot / scale) * (base - 4)) : 0;
    let y = base;
    CATS.forEach((k, j) => { const v = b[1 + j]; if (!v) return; const sh = (hh * v) / tot; y -= sh; h += `<rect x="${x}" y="${y.toFixed(2)}" width="4.8" height="${sh.toFixed(2)}" fill="${CAT[k].c}"/>`; });
    if (b[0]) h += `<rect x="${x + 0.9}" y="${base + 1.6}" width="3" height="${Math.min(3.4, 1.4 + b[0] * 0.4)}" rx=".6" fill="var(--ink)"/>`;
    if (b[1 + CATS.length] && b[1 + CATS.length] >= Math.max(1, tot * 0.1)) h += `<rect x="${x + 0.9}" y="${Math.max(0, y - 4)}" width="3" height="3" rx="1.5" fill="var(--critical)"/>`;
  });
  if (liveNow) h += `<rect class="lane-now" x="${n * 6 - 2}" y="2" width="2" height="${base - 2}" fill="var(--good)"/>`;
  return `<svg class="lane" viewBox="0 0 ${n * 6} ${H}" preserveAspectRatio="none" aria-hidden="true">${h}</svg>`;
}
function mixBar(mix) {
  const tot = CATS.reduce((a, k) => a + (mix[k] || 0), 0);
  if (!tot) return '<div class="wm empty-bar"></div>';
  const dom = dominant(mix);
  return `<div class="wm">${CATS.map((k) => (mix[k] ? `<i style="flex:${mix[k]};background:${CAT[k].c}"></i>` : '')).join('')}</div>
    <div class="dom" style="--c:${CAT[dom].c}">${icon(dom)}<span>${CAT[dom].label}</span><small>${Math.round((mix[dom] / tot) * 100)}%</small></div>`;
}
const toolLabel = (t) => String(t || '').replace(/^mcp__/, '').replace(/__/g, ' · ').replace(/_/g, ' ');
function worksOn(p) {
  const tot = CATS.reduce((a, k) => a + (p.mix[k] || 0), 0);
  if (!tot) return '<div class="wm empty-bar"></div><div class="wo-k muted">No agent steps yet</div>';
  const top = CATS.filter((k) => p.mix[k]).sort((a, b) => p.mix[b] - p.mix[a]).slice(0, 3);
  return `<div class="wm">${CATS.map((k) => (p.mix[k] ? `<i style="flex:${p.mix[k]};background:${CAT[k].c}"></i>` : '')).join('')}</div>
    <div class="wo-k">${top.map((k) => `<span style="--c:${CAT[k].c}">${icon(k)}${CAT[k].label} <b>${Math.round((p.mix[k] / tot) * 100)}%</b></span>`).join('')}</div>`;
}
const personHref = (p) => { const q = new URLSearchParams(location.search), team = q.get('team');
  return `/person?${state.demo ? 'demo=1&' : team ? `team=${encodeURIComponent(team)}&` : ''}user=${encodeURIComponent(p.user_key)}`; };

function taskBars(p) {
  const m = taskMix(p);
  if (!m.prompts) return '<span class="tb none"></span>';
  return `<span class="tb">${[m.q, m.short, m.long].map((v, i) => `<i class="t${i}" style="--h:${v ? Math.max(12, Math.round((v / m.prompts) * 100)) : 0}%"></i>`).join('')}</span>`;
}
function limitsWhy(p) {
  const first = displayName(p).split(' ')[0], top = [...(p.clients || [])].sort((a, b) => b.sessions - a.sessions)[0]?.client;
  const last = p.plan?.seen ? ` Last reading: ${new Date(p.plan.seen).toLocaleDateString([], { day: 'numeric', month: 'short' })}.` : '';
  const c = globalThis.PuddleAgents?.client(top);
  if (c?.limits === 'none' && c.why?.limits) return `${first} works in ${c.label}. ${c.why.limits}.${last}`;
  return p.plan ? `No reading since the window started over.${last} They show again as soon as ${first} uses Claude in the terminal, the Claude app or Codex.` : `They show once ${first}'s Puddle sees Claude in the terminal, the Claude app or Codex being used.`;
}
function limitRings(p) {
  const pl = p.plan, ring = (v, cls) => {
    if (v == null) return `<span class="lr ${cls}"></span>`;
    const sev = v >= 95 ? 'var(--critical)' : v >= 80 ? 'var(--warn)' : 'var(--s1)', a = Math.max(v ? 8 : 0, Math.min(100, v)) * 3.6;
    return `<span class="lr ${cls}" style="--g:conic-gradient(${sev} 0 ${a}deg, var(--grid) ${a}deg 360deg)"></span>`;
  };
  if (!pl || pl.stale) return `<span class="lrs unknown" aria-label="Plan limits unknown"><span class="lr out"></span><span class="lr in"></span></span>`;
  return `<span class="lrs">${ring(pl.five_pct, 'out')}${ring(pl.week_pct ?? pl.month_pct, 'in')}</span>`;
}
function trend(cur, prev) {
  if (!prev) return cur ? '<small class="up">new</small>' : '';
  const d = (cur - prev) / prev;
  return `<small class="${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '▲' : '▼'}${Math.abs(d) >= 10 ? '' : Math.round(Math.abs(d) * 100) + '%'}</small>`;
}

function renderPeople(d) {
  const team = d.team.people.map((p) => ({ ...p, last_active: p.lastActive }));
  if (shownCard('issues')) renderAttention(team);
  if (shownCard('features')) { renderAdoption(team); renderNamed(team); }
  if (shownCard('map')) renderMap(team);
  if (!shownCard('people')) return;

  const sort = state.bsort || { key: 'now', dir: -1 };
  const col = BCOLS.find((c) => c.key === sort.key) || BCOLS[1];
  const list = [...team].sort((a, b) => { const x = col.get(a), y = col.get(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir || b.prompts - a.prompts; });
  const scale = Math.max(1, ...team.flatMap((p) => (p.lane || []).map(laneTotal)));
  const maxP = Math.max(1, ...team.map((p) => p.prompts));
  const maxM = Math.max(1, ...team.map((p) => p.activeMinutes || 0));
  const span = d.team.lane ? Date.now() - d.team.lane.from : 0;
  const el = $('#ptable');
  const before = new Map([...el.querySelectorAll('.brow.body')].map((r) => [r.dataset.u, r.getBoundingClientRect().top]));
  const headHtml = BCOLS.map((c) => `<span role="columnheader" data-k="${c.key}" data-learn="col:${{ now: 'now', mix: 'mix', prompts: 'prompts', autonomy: 'autonomy', limits: 'limits' }[c.key]}" ${c.key === sort.key ? `aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.key === 'lane' ? `<span>${c.label}</span><span class="axis-end">${span > 2 * DAY ? Math.round(span / DAY) + ' days' : 'today'} → now</span>` : c.label}</span>`).join('');
  let head = el.querySelector('.brow.head');
  if (!head) { el.innerHTML = ''; head = document.createElement('div'); head.className = 'brow head'; head.setAttribute('role', 'row'); el.appendChild(head); }
  const put = (node, html) => { if (node._h !== html) { node._h = html; node.innerHTML = html; } };
  put(head, headHtml);
  el.querySelector('.empty')?.remove();
  const existing = new Map([...el.querySelectorAll('.brow.body')].map((r) => [r.dataset.u, r]));
  list.forEach((p, i) => {
    const st = nowState(p);
    let r = existing.get(p.user_key);
    existing.delete(p.user_key);
    if (!r) {
      r = document.createElement('div');
      r.setAttribute('role', 'row'); r.dataset.u = p.user_key;
      r.innerHTML = `<div class="who"><span class="now-ic" data-learn="col:now"></span><div class="who-t"></div></div>
        <div class="mix-cell" data-learn="col:mix"></div><div class="vol-cell" data-learn="col:prompts"><div class="vol"><i></i></div><span class="vt"></span></div>
        <div class="sty-cell" data-learn="col:autonomy"></div><div class="hl-cell" data-learn="col:limits"></div>`;
    }
    const cls = `brow body ${st.kind}`;
    if (r.className !== cls) r.className = cls;
    r.style.setProperty('--c', st.color);
    put(r.querySelector('.now-ic'), icon(st.ic));
    put(r.querySelector('.who-t'), `<div class="nm"><i class="pdot" style="background:${colorOf(p.user_key)}"></i>${esc(displayName(p))} <span class="fl">${flag(p.country)}</span>${globalThis.signalsHTML ? globalThis.signalsHTML(p) : ''}${p.flags.length ? `<span class="flagcount" title="${esc(p.flags.map((f) => f.text).join('\n'))}">!</span>` : ''}</div>
        <div class="st">${esc(st.label)}${st.kind === 'work' ? agentsNow(p) : ''}${st.sub ? ` <small>· ${esc(st.sub)}</small>` : ''}${D.team.oldKeys?.[p.user_key] ? ' <span class="oldkey" aria-label="Live activity delayed">↻</span>' : ''}</div>`);
    put(r.querySelector('.mix-cell'), worksOn(p));
    r.querySelector('.vol i').style.width = `${((p.activeMinutes || 0) / maxM) * 100}%`;
    put(r.querySelector('.vt'), `<span class="tv"><b>${hmm(p.activeMinutes)}</b> <small class="unit">h</small></span>`);
    put(r.querySelector('.sty-cell'), `${taskBars(p)}<small class="ho">${handsOff(p).word}</small>`);
    put(r.querySelector('.hl-cell'), limitRings(p));
    if (el.children[i + 1] !== r) el.insertBefore(r, el.children[i + 1] || null);
  });
  for (const r of existing.values()) r.remove();
  if (!list.length) el.insertAdjacentHTML('beforeend', '<div class="empty">Nobody has reported yet</div>');
  for (const hd of el.querySelectorAll('.brow.head > span')) {
    hd.onclick = () => { const k = hd.dataset.k; state.bsort = { key: k, dir: sort.key === k ? -sort.dir : (k === 'name' ? 1 : -1) }; save(); renderPeople(D); };
  }
  for (const r of el.querySelectorAll('.brow.body')) {
    const p = team.find((x) => x.user_key === r.dataset.u);
    r.onclick = () => { location.href = personHref(p); };
    hover(r.querySelector('.who-t'), () => `<b>${esc(displayName(p))} ${flag(p.country)}</b>` + rows([
      ['Email', esc(p.email || '—')], ['Country', esc(p.country ? regionName(p.country) : '—')], ['Local time', esc(`${localHour(p.timezone) >= 7 && localHour(p.timezone) < 19 ? '☀︎' : '☾'} ${localTime(p.timezone)} · ${p.timezone || '—'}`)],
      ['Conversations', `${nf.format(p.sessions)} on ${p.activeDays} day${p.activeDays === 1 ? '' : 's'}`], ['Tokens', compact(p.tokens)],
      ['Prompt size', p.avgPrompt == null ? '—' : `${nf.format(p.avgPrompt)} chars avg`], ['Median wait', clock(p.medianWait)],
      ['Clients', esc(p.clients.map((c) => `${c.client.replace('claude-', '')} ×${c.sessions}`).join(', ') || '—')],
      ['Models', esc(p.models.map((m) => m.model.replace('claude-', '')).join(', ') || '—')],
      ['Effort', esc(Object.entries(p.effort).map(([k, v]) => `${k} ${v}`).join(', ') || '—')],
      ['Cache hits', p.cacheHit == null ? '—' : `${Math.round(p.cacheHit * 100)}%`],
      ['Ran smoothly', p.runs?.prompts ? `${Math.round((p.runs.smooth / p.runs.prompts) * 100)}% of prompts (${nf.format(p.toolFail)} of ${nf.format(p.tools)} steps failed)` : '—'],
      ['Approved by hand', nf.format(p.asks)], ['Lines', `+${nf.format(p.output.added)} / −${nf.format(p.output.removed)}`],
      ...(showCost() ? [['Cost (list price)', usd(p.cost)]] : []),
      ...p.flags.map((f) => ['⚑', esc(f.text)])]));
    const ok = r.querySelector('.oldkey');
    if (ok) { ok.onmousemove = (e) => { e.stopPropagation(); showTip(e, `<b>Live activity is delayed</b><div>Claude Code on ${esc(displayName(p).split(' ')[0])}'s Mac was opened before Puddle signed in again. Puddle takes that key back at its next check-in (within 2 minutes).</div>`); }; ok.onmouseleave = hideTip; }
    for (const g of r.querySelectorAll('.sig')) { g.onmousemove = (e) => { e.stopPropagation(); showTip(e, globalThis.signalTip(g.dataset.sig, p)); }; g.onmouseleave = hideTip; }
    hover(r.querySelector('.now-ic'), () => { const st = nowState(p);
      if (!p.now?.everTs && !p.lastActive) return `<b>No data yet</b><div>Puddle isn't sending anything for ${esc(p.email || displayName(p))} yet. Open Puddle on the Mac and sign in with this email.</div>`;
      return `<b>${esc(st.label)}</b>` + (LEARN.on && p.now?.tool ? `<div class="learn-x">${LEARN.tool(p.now.tool)}</div>` : '') + rows([['Last tool', esc((p.now?.tool || '—').replace(/^mcp__/, ''))], ['Last event', p.now?.lastTs ? `${ago(p.now.lastTs)} ago` : '—'], ['Last prompt', p.now?.promptTs ? `${ago(p.now.promptTs)} ago` : '—']]); });
    hover(r.querySelector('.mix-cell'), () => { const tot = CATS.reduce((a, k) => a + (p.mix[k] || 0), 0) || 1; return `<b>Tool calls by kind</b>` + rows(CATS.filter((k) => p.mix[k]).map((k) => [CAT[k].label, `${nf.format(p.mix[k])} · ${Math.round((p.mix[k] / tot) * 100)}%`, CAT[k].c])); });
    hover(r.querySelector('.vol-cell'), () => `<b>Time with agents</b>` + rows([['Active time', `${hmm(p.activeMinutes)} h`], ['Outside 08–19 / weekend', `${hmm(p.hours?.outside)} h`], ['Prompts', `${nf.format(p.prompts)} (before: ${nf.format(p.prev.prompts)})`], ['Conversations', nf.format(p.sessions)]]));
    hover(r.querySelector('.sty-cell'), () => { const m = taskMix(p), pc = (v) => `${nf.format(v)} · ${m.prompts ? Math.round((v / m.prompts) * 100) : 0}%`;
      return `<b>${handsOff(p).word}</b><div class="muted">${esc(handsOff(p).tip)}</div>` + rows([['Questions (no steps)', pc(m.q), 'var(--tb0)'], ['Short tasks (1–19 steps)', pc(m.short), 'var(--tb1)'], ['Long tasks (20+ steps)', pc(m.long), 'var(--tb2)'],
        ['Longest run', p.runs?.longest ? `${nf.format(p.runs.longest)} steps` : '—'], ['Stopped the agent', `${nf.format(p.rejects)} of ${nf.format(p.decisions || 0)} actions`]]); });
    hover(r.querySelector('.hl-cell'), () => !p.plan || p.plan.stale ? `<b>Plan limits unknown</b><div>${esc(limitsWhy(p))}</div>`
      : `<b>Plan limits</b><div class="muted">Outer ring: the 5-hour window · inner ring: the ${p.plan.week_pct == null && p.plan.month_pct != null ? 'month' : 'week'}</div>` + p.plan.agents.map((a) => `<div class="tip-sep"></div><div class="muted small">${esc(a.label || 'Claude')}</div>`
        + rows([['5 hours', 'five'], ['Week', 'week'], [a.month_from === 'claude-code' ? 'Spend' : 'Month', 'month']].filter(([, k]) => a[k + '_pct'] != null).map(([l, k]) => [l, usedLeft(a[k + '_pct'], a[k + '_reset'], a[k + '_ts'] ?? a.ts)]))).join(''));
  }
  if (!REDUCED.matches) for (const r of el.querySelectorAll('.brow.body')) {
    const was = before.get(r.dataset.u), dy = was == null ? 0 : was - r.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], Motion.ease('snappy'));
  }

}

const FLAG_PATHS = { quiet: '<path d="M13.4 10.4A6.1 6.1 0 0 1 5.6 2.6a6.2 6.2 0 1 0 7.8 7.8z"/>', failures: '<rect x="2.4" y="6.6" width="11.2" height="2.8" rx="1.4" transform="rotate(45 8 8)"/><rect x="2.4" y="6.6" width="11.2" height="2.8" rx="1.4" transform="rotate(-45 8 8)"/>', broken: '<path d="M6.6 2.3a1.6 1.6 0 0 1 2.8 0l5.4 9.6a1.6 1.6 0 0 1-1.4 2.4H2.6a1.6 1.6 0 0 1-1.4-2.4z" opacity=".45"/><rect x="7" y="5" width="2" height="5" rx="1"/><circle cx="8" cy="12" r="1.1"/>', stuck: '<path d="M12.6 6.2A5 5 0 0 0 3.4 6M3.4 9.8a5 5 0 0 0 9.2.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 2.6v4.4H9.6z"/><path d="M2 13.4V9h4.4z"/>', hook: '<path d="M10 3.6v5.6a3.6 3.6 0 0 1-7.2 0V8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="3" r="2.2"/>', ratelimit: '<path d="M3.5 1.5h9v2.2c0 1.6-1.4 3-3 4.3 1.6 1.3 3 2.7 3 4.3v2.2h-9v-2.2c0-1.6 1.4-3 3-4.3-1.6-1.3-3-2.7-3-4.3z" opacity=".45"/><path d="M5.4 12.8c0-1.1 1.2-2 2.6-2.8 1.4.8 2.6 1.7 2.6 2.8z"/>', auth: '<circle cx="5" cy="8" r="3.6"/><rect x="7.4" y="6.9" width="7.2" height="2.2" rx="1.1"/><rect x="11.6" y="8" width="2.2" height="3.4" rx="1.1"/>', limit: '<path d="M1.5 11.4a6.5 6.5 0 0 1 13 0z" opacity=".45"/><path d="M8 11.2 11.8 5.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8" cy="11.2" r="1.9"/>', friction: '<path d="M5.6 1.6c1 0 1.7.8 1.7 1.7v3.4l4.3.8c1 .2 1.7 1.2 1.5 2.2l-.6 3.3c-.2.9-.9 1.5-1.8 1.5H6.6c-.6 0-1.1-.3-1.4-.7l-2.9-3.9a1.2 1.2 0 0 1 1.8-1.6l.5.5V3.3c0-.9.7-1.7 1.6-1.7z"/>', rejects: '<circle cx="8" cy="8" r="6.6" opacity=".45"/><rect x="3.6" y="6.8" width="8.8" height="2.4" rx="1.2"/>', context: '<rect x="2" y="6.8" width="12" height="2.4" rx="1.2"/><path d="M8 1.6v3.2M5.9 3 8 5.1 10.1 3M8 14.4v-3.2M5.9 13 8 10.9l2.1 2.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>', heavy: '<path d="M8 1.6 13.6 7.4H10V14H6V7.4H2.4z"/>', version: '<rect x="2" y="2" width="12" height="12" rx="3" opacity=".45"/><path d="M8 4 11.4 7.6H9.2v4H6.8v-4H4.6z"/>' , oldkey: '<circle cx="5" cy="8" r="3.4"/><rect x="7.5" y="6.9" width="7" height="2.2" rx="1.1"/><rect x="11.6" y="8" width="2" height="3.4" rx="1"/>', offline: '<path d="M8 3a7 7 0 0 1 6.6 4.6l-1.9.7A5 5 0 0 0 3.3 8.3l-1.9-.7A7 7 0 0 1 8 3z"/><path d="M8 7a3.4 3.4 0 0 1 3.2 2.3l-1.9.7a1.4 1.4 0 0 0-2.6 0l-1.9-.7A3.4 3.4 0 0 1 8 7z"/><rect x="1.2" y="7" width="13.6" height="1.8" rx=".9" transform="rotate(45 8 8)"/>', app: '<rect x="7" y="1.5" width="2" height="8" rx="1"/><path d="M4.2 6.6l1.4-1.4L8 7.6l2.4-2.4 1.4 1.4L8 10.4z"/><rect x="2" y="12" width="12" height="2.4" rx="1.2"/>', statusline: '<rect x="1.5" y="10.5" width="13" height="3.5" rx="1.75"/><rect x="1.5" y="2" width="13" height="6.5" rx="1.6" opacity=".45"/>', limits: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 2.4a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2z" opacity=".45"/><path d="M8 1.5A6.5 6.5 0 0 1 14.5 8h-2.4A4.1 4.1 0 0 0 8 3.9z"/>', titles: '<rect x="2" y="3" width="12" height="2.2" rx="1.1"/><rect x="2" y="7" width="8" height="2.2" rx="1.1" opacity=".45"/><rect x="2" y="11" width="10" height="2.2" rx="1.1" opacity=".45"/>', macerrors: '<path d="M8 1.6l7 12.4H1z"/><rect x="7.1" y="5.6" width="1.8" height="4.6" rx=".9" fill="var(--surface, #fff)"/><circle cx="8" cy="12" r="1" fill="var(--surface, #fff)"/>' , subagents: '<circle cx="8" cy="3.6" r="2.4"/><circle cx="3.4" cy="12" r="2.2" opacity=".55"/><circle cx="12.6" cy="12" r="2.2" opacity=".55"/><rect x="7.1" y="5" width="1.8" height="4" rx=".9"/><path d="M8 8.4 4 10.6M8 8.4l4 2.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>', longconvos: '<rect x="2" y="2" width="12" height="2.2" rx="1.1"/><rect x="2" y="5.6" width="12" height="2.2" rx="1.1" opacity=".55"/><rect x="2" y="9.2" width="12" height="2.2" rx="1.1" opacity=".55"/><rect x="2" y="12.8" width="7" height="2.2" rx="1.1" opacity=".35"/>' };
const FLAG_IC = Object.fromEntries(Object.entries(FLAG_PATHS).map(([k, v]) => [k, `<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">${v}</svg>`]));
function renderAttention(team) {
  const rank = { warn: 0, info: 1 };
  const items = team.flatMap((p) => p.flags.map((f) => ({ p, ...f })))
    .sort((a, b) => (a.acknowledged - b.acknowledged) || rank[a.level] - rank[b.level]);
  const open = items.filter((i) => !i.acknowledged), warn = open.filter((i) => i.level === 'warn').length;
  const hidden = team.reduce((a, p) => a + (p.hiddenFlags?.length || 0), 0);
  $('#att-count').className = 'chip' + (warn ? ' warn' : open.length ? ' info' : ' ok');
  $('#att-count').textContent = open.length ? `${open.length}${warn ? ` · ${warn} urgent` : ''}` : '✓';
  $('#attention').innerHTML = (items.length
    ? items.slice(0, 10).map((it) => `<li class="att ${it.level}${it.acknowledged ? ' ack' : ''}" data-u="${esc(it.p.user_key)}" data-k="${it.kind}" data-learn="flag:${it.kind}">
        <span class="att-ic" aria-hidden="true">${FLAG_IC[it.kind] || '•'}</span><span class="att-t"><b>${esc(displayName(it.p))}</b> ${esc(it.text)}</span>
        <span class="att-fb">${it.acknowledged ? '<button data-v="undo" title="Undo">✓ noted</button>'
          : '<button data-v="yes" title="Useful — keep it">✓</button><button data-v="no" title="Not an issue — hide for 14 days">✕</button>'}</span></li>`).join('') +
      (items.length > 10 ? `<li class="att-more">+${items.length - 10} more</li>` : '')
    : '<li class="att-ok">✓ Nothing needs a look</li>');
  const fb = D?.team.feedback || [];
  const yes = fb.reduce((a, r) => a + r.yes, 0), no = fb.reduce((a, r) => a + r.no, 0);
  $('#att-acc').innerHTML = (yes + no ? `<b>${Math.round((yes / (yes + no)) * 100)}%</b> rated useful (${yes} of ${yes + no})` : 'Rate each flag ✓ useful or ✕ not an issue to measure how often they are right')
    + (hidden ? ` · ${hidden} hidden as not an issue` : '');
  hover($('#att-acc'), () => `<b>Flag accuracy by kind</b>` + (fb.length ? rows(fb.map((r) => [r.kind, `${r.yes} ✓ · ${r.no} ✕`])) : '<div class="muted">No ratings yet</div>'));
  for (const li of document.querySelectorAll('#attention .att')) {
    li.onclick = (e) => { const p = team.find((x) => x.user_key === li.dataset.u); if (p && !e.target.closest('button')) location.href = personHref(p); };
    for (const b of li.querySelectorAll('.att-fb button')) b.onclick = async (e) => {
      e.stopPropagation();
      const it = items.find((x) => x.p.user_key === li.dataset.u && x.kind === li.dataset.k);
      const r = await post('/api/flag-feedback', { user_key: li.dataset.u, kind: li.dataset.k, verdict: b.dataset.v, text: it?.text });
      if (!r.ok) { toast('Could not save'); return; }
      Sound.play(b.dataset.v === 'no' ? 'remove' : 'toggle');
      toast(b.dataset.v === 'yes' ? '✓ Kept — thanks, that counts as a correct flag' : b.dataset.v === 'no' ? 'Hidden for 14 days — counted as a false alarm' : 'Rating removed');
      load();
    };
  }
}

function renderAdoption(team) {
  const active = team.filter((p) => p.prompts > 0);
  $('#adoption').innerHTML = FEATS.map(([k, ic, lbl]) => {
    const users = active.filter((p) => p.features[k]).sort((a, b) => b.features[k] - a.features[k]);
    const max = Math.max(1, ...team.map((p) => p.features[k] || 0));
    const pc = active.length ? users.length / active.length : 0;
    const right = `<span class="faces">${users.slice(0, 5).map((p) => `<i style="background:${colorOf(p.user_key)}" title="${esc(displayName(p))}">${esc(initials(p))}</i>`).join('')}${users.length > 5 ? `<em>+${users.length - 5}</em>` : ''}</span>`;
    return `<div class="feat${pc ? '' : ' off'}" data-f="${k}" data-learn="feat:${k}"><span class="fi">${ic}</span><span class="fl">${lbl}</span><span class="pct"><i style="width:${pc * 100}%"></i></span>${right}</div>`;
  }).join('');
  for (const r of document.querySelectorAll('#adoption .feat')) {
    const k = r.dataset.f, lbl = FEATS.find((x) => x[0] === k)[2];
    hover(r, () => {
      const users = active.filter((p) => p.features[k]);
      const names = new Map(); for (const p of team) for (const n of p.featureNames[k] || []) names.set(n.label, (names.get(n.label) || 0) + (n.n || 1));
      return `<b>${lbl}</b>` + rows([['People', `${users.length} of ${active.length} active`], ...[...names].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => [n, nf.format(v)])]);
    });
  }
}

function renderNamed(team) {
  const el = $('#named'); if (!el) return;
  const group = (k) => { const m = new Map(); for (const p of team) for (const n of p.featureNames?.[k] || []) { const e = m.get(n.label) || { label: n.label, n: 0, people: [] }; e.n += n.n || 1; e.people.push(p); m.set(n.label, e); } return [...m.values()].sort((a, b) => b.people.length - a.people.length || b.n - a.n); };
  const section = (title, k) => { const g = group(k); return g.length ? `<div class="named"><small>${title}</small>${g.slice(0, 12).map((e) => `<span class="nchip" title="${esc(e.people.map(displayName).join(', '))}">${esc(e.label)}<span class="faces">${e.people.slice(0, 4).map((p) => `<i style="background:${colorOf(p.user_key)}">${esc(initials(p))}</i>`).join('')}</span></span>`).join('')}</div>` : ''; };
  el.innerHTML = section('Plugins', 'plugins') + section('Connectors (MCP)', 'mcp') + section('Skills', 'skills') + section('Sub-agents', 'subagents') || '<p class="muted small">No plugins, connectors or skills seen yet.</p>';
}

const ATLAS = { 110: '/vendor/countries-110m.json', 50: '/vendor/countries-50m.json' };
const ALIAS = { US: 'United States of America', CD: 'Dem. Rep. Congo', CG: 'Congo', BA: 'Bosnia and Herz.', DO: 'Dominican Rep.', CF: 'Central African Rep.', SS: 'S. Sudan', GQ: 'Eq. Guinea', CI: "Côte d'Ivoire", SZ: 'eSwatini', PS: 'Palestine', EH: 'W. Sahara', SB: 'Solomon Is.', FK: 'Falkland Is.', TT: 'Trinidad and Tobago', MM: 'Myanmar', TR: 'Turkey', CZ: 'Czechia', MK: 'Macedonia', TL: 'Timor-Leste', CY: 'Cyprus' };
const SMALL = { SG: [103.82, 1.35], HK: [114.17, 22.32], MT: [14.4, 35.9], BH: [50.56, 26.07], MU: [57.55, -20.3], MV: [73.5, 4.2], LI: [9.55, 47.16], MC: [7.42, 43.74], AD: [1.52, 42.51], SM: [12.46, 43.94], BB: [-59.55, 13.19], MO: [113.55, 22.2], GI: [-5.35, 36.14] };
const TZ_LL = {
  'Europe/Berlin': [13.40, 52.52], 'Europe/London': [-0.13, 51.51], 'Europe/Paris': [2.35, 48.86], 'Europe/Madrid': [-3.70, 40.42], 'Europe/Lisbon': [-9.14, 38.72],
  'Europe/Amsterdam': [4.90, 52.37], 'Europe/Brussels': [4.35, 50.85], 'Europe/Zurich': [8.54, 47.37], 'Europe/Vienna': [16.37, 48.21], 'Europe/Rome': [12.50, 41.90],
  'Europe/Stockholm': [18.07, 59.33], 'Europe/Oslo': [10.75, 59.91], 'Europe/Copenhagen': [12.57, 55.68], 'Europe/Helsinki': [24.94, 60.17], 'Europe/Warsaw': [21.01, 52.23],
  'Europe/Prague': [14.42, 50.09], 'Europe/Budapest': [19.04, 47.50], 'Europe/Bucharest': [26.10, 44.43], 'Europe/Athens': [23.73, 37.98], 'Europe/Istanbul': [28.98, 41.01],
  'Europe/Kyiv': [30.52, 50.45], 'Europe/Kiev': [30.52, 50.45], 'Europe/Moscow': [37.62, 55.76], 'Europe/Dublin': [-6.26, 53.35], 'Europe/Belgrade': [20.46, 44.79],
  'Europe/Sofia': [23.32, 42.70], 'Europe/Riga': [24.11, 56.95], 'Europe/Vilnius': [25.28, 54.69], 'Europe/Tallinn': [24.75, 59.44], 'Europe/Zagreb': [15.98, 45.81],
  'Africa/Cairo': [31.24, 30.04], 'Africa/Lagos': [3.38, 6.52], 'Africa/Nairobi': [36.82, -1.29], 'Africa/Johannesburg': [28.05, -26.20], 'Africa/Casablanca': [-7.59, 33.57],
  'Asia/Dubai': [55.27, 25.20], 'Asia/Kolkata': [88.36, 22.57], 'Asia/Calcutta': [88.36, 22.57], 'Asia/Karachi': [67.01, 24.86], 'Asia/Dhaka': [90.41, 23.81],
  'Asia/Bangkok': [100.50, 13.76], 'Asia/Singapore': [103.82, 1.35], 'Asia/Hong_Kong': [114.17, 22.32], 'Asia/Shanghai': [121.47, 31.23], 'Asia/Taipei': [121.56, 25.03],
  'Asia/Tokyo': [139.69, 35.69], 'Asia/Seoul': [126.98, 37.57], 'Asia/Manila': [120.98, 14.60], 'Asia/Jakarta': [106.85, -6.21], 'Asia/Jerusalem': [35.22, 31.77],
  'Asia/Tel_Aviv': [34.78, 32.09], 'Asia/Ho_Chi_Minh': [106.66, 10.76], 'Asia/Kuala_Lumpur': [101.69, 3.14], 'Asia/Riyadh': [46.68, 24.71], 'Asia/Tehran': [51.39, 35.69],
  'Australia/Sydney': [151.21, -33.87], 'Australia/Melbourne': [144.96, -37.81], 'Australia/Brisbane': [153.03, -27.47], 'Australia/Perth': [115.86, -31.95], 'Pacific/Auckland': [174.76, -36.85],
  'America/New_York': [-74.01, 40.71], 'America/Chicago': [-87.63, 41.88], 'America/Denver': [-104.99, 39.74], 'America/Los_Angeles': [-118.24, 34.05], 'America/Phoenix': [-112.07, 33.45],
  'America/Toronto': [-79.38, 43.65], 'America/Vancouver': [-123.12, 49.28], 'America/Halifax': [-63.57, 44.65], 'America/Mexico_City': [-99.13, 19.43], 'America/Sao_Paulo': [-46.63, -23.55],
  'America/Argentina/Buenos_Aires': [-58.38, -34.60], 'America/Buenos_Aires': [-58.38, -34.60], 'America/Bogota': [-74.07, 4.71], 'America/Lima': [-77.04, -12.05], 'America/Santiago': [-70.67, -33.45],
};
const tzCity = (tz) => (tz ? tz.split('/').pop().replace(/_/g, ' ') : '');
const atlases = {}, atlasLoading = {};
async function loadAtlas(res) {
  if (atlases[res] || !window.d3?.geoNaturalEarth1 || !window.topojson) return atlases[res] || null;
  atlasLoading[res] ||= fetch(ATLAS[res]).then((r) => r.json()).then((topo) => {
    const fc = topojson.feature(topo, topo.objects.countries);
    fc.features = fc.features.filter((f) => f.id !== '010');
    return (atlases[res] = { fc, byName: new Map(fc.features.map((f) => [f.properties.name.toLowerCase(), f])) });
  }).catch(() => null);
  return atlasLoading[res];
}
const featureIn = (atlas, cc) => {
  if (!atlas || !cc) return null;
  return atlas.byName.get((ALIAS[cc] || regionName(cc, 'en') || '').toLowerCase().replace(/&/g, 'and').replace(/[’]/g, "'")) || null;
};
const pointFor = (atlas, p) => TZ_LL[p.timezone] || (featureIn(atlas, p.country) ? d3.geoCentroid(featureIn(atlas, p.country)) : SMALL[p.country]) || null;

async function renderMap(list) {
  const el = $('#map');
  el._list = list;
  const key = JSON.stringify([el.clientWidth, el.clientHeight, document.documentElement.dataset.theme || '', list.map((p) => [p.user_key, p.timezone, p.country])]);
  if (el._key === key && el.firstChild) return updatePins(el, list);
  el._key = key;
  const base = await loadAtlas(110);
  if (!base) { el.innerHTML = `<div class="map-off">${list.map((p) => flag(p.country)).join(' ') || '🌍'}</div>`; return; }
  const W = el.clientWidth || 400, H = el.clientHeight || 220, R = W < 340 ? 9 : 11;
  const pts = list.map((p) => [p, pointFor(base, p)]).filter(([, ll]) => ll);
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
  for (const [, [lo, la]] of pts) { x0 = Math.min(x0, lo); x1 = Math.max(x1, lo); y0 = Math.min(y0, la); y1 = Math.max(y1, la); }
  if (!pts.length) { x0 = -170; x1 = 170; y0 = -50; y1 = 70; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, minLon = 14, minLat = 8;
  if (x1 - x0 < minLon) { x0 = cx - minLon / 2; x1 = cx + minLon / 2; }
  if (y1 - y0 < minLat) { y0 = cy - minLat / 2; y1 = cy + minLat / 2; }
  const wide = x1 - x0 > 70;
  const atlas = wide ? base : (await loadAtlas(50)) || base;
  const box = { type: 'MultiPoint', coordinates: [[x0, y0], [x1, y1], [x0, y1], [x1, y0], [cx, y0], [cx, y1]] };
  const pad = R * 2 + 6;
  const proj = (wide ? d3.geoNaturalEarth1() : d3.geoMercator()).fitExtent([[pad, pad], [W - pad, H - pad]], box);
  const path = d3.geoPath(proj);
  const on = new Set(list.map((p) => featureIn(atlas, p.country)).filter(Boolean));
  let s = `<svg viewBox="0 0 ${W} ${H}" class="${wide ? '' : 'local'}"><clipPath id="mclip"><rect width="${W}" height="${H}" rx="12"/></clipPath><g clip-path="url(#mclip)">`;
  for (const f of atlas.fc.features) {
    const d = path(f);
    if (d) s += `<path class="land${on.has(f) ? ' on' : ''}" d="${d}"/>`;
  }
  s += '</g>';
  const nodes = pts.map(([p, ll], i) => { const [ax, ay] = proj(ll); return { p, ax, ay, x: ax + Math.cos(i * 2.4) * 0.5, y: ay + Math.sin(i * 2.4) * 0.5 }; });
  const gap = R * 2 + 3;
  for (let it = 0; it < 120; it++) {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      if (d < gap) { const k = (gap - d) / d / 2; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
    for (const n of nodes) { n.x += (n.ax - n.x) * 0.02; n.y += (n.ay - n.y) * 0.02; n.x = Math.max(R + 2, Math.min(W - R - 2, n.x)); n.y = Math.max(R + 2, Math.min(H - R - 2, n.y)); }
  }
  const cities = new Map();
  for (const n of nodes) { const k = `${Math.round(n.ax)},${Math.round(n.ay)}`; if (!cities.has(k)) cities.set(k, n); }
  for (const n of cities.values()) s += `<circle class="anchor" cx="${n.ax.toFixed(1)}" cy="${n.ay.toFixed(1)}" r="2.5"/>`;
  if (!wide || cities.size <= 6) for (const n of cities.values()) s += `<text class="city" x="${(n.ax).toFixed(1)}" y="${(n.ay + R + 14).toFixed(1)}" text-anchor="middle">${esc(tzCity(n.p.timezone))}</text>`;
  for (const n of nodes) {
    const st = nowState(n.p), moved = Math.hypot(n.x - n.ax, n.y - n.ay) > 3;
    if (moved) s += `<line class="leader" x1="${n.ax.toFixed(1)}" y1="${n.ay.toFixed(1)}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}"/>`;
    s += `<g class="pin ${st.kind}" data-u="${esc(n.p.user_key)}" transform="translate(${n.x.toFixed(1)},${n.y.toFixed(1)})" style="--c:${st.color}">
      ${st.kind === 'work' ? `<circle class="halo" r="${R + 1}"/>` : ''}<circle r="${R}" fill="${colorOf(n.p.user_key)}"/><circle class="ring-out" r="${R}"/><text text-anchor="middle" dy="3.2">${esc(initials(n.p))}</text></g>`;
  }
  el.innerHTML = s + '</svg>';
  for (const pin of el.querySelectorAll('.pin')) {
    const cur = () => el._list.find((x) => x.user_key === pin.dataset.u) || list.find((x) => x.user_key === pin.dataset.u);
    pin.onclick = () => { location.href = personHref(cur()); };
    hover(pin, () => { const p = cur(); return `<b>${esc(displayName(p))} ${flag(p.country)}</b>` + rows([['Now', esc(nowState(p).label)], ['City', esc(tzCity(p.timezone) || '—')], ['Local time', esc(localTime(p.timezone))], ['Country', esc(regionName(p.country))]]); });
  }
}

function updatePins(el, list) {
  for (const pin of el.querySelectorAll('.pin')) {
    const p = list.find((x) => x.user_key === pin.dataset.u);
    if (!p) continue;
    const st = nowState(p);
    const cls = `pin ${st.kind}`;
    if (pin.getAttribute('class') !== cls) pin.setAttribute('class', cls);
    pin.style.setProperty('--c', st.color);
    const halo = pin.querySelector('.halo');
    if (st.kind === 'work' && !halo) pin.insertAdjacentHTML('afterbegin', `<circle class="halo" r="${+pin.querySelector('circle:not(.halo)').getAttribute('r') + 1}"/>`);
    else if (st.kind !== 'work' && halo) halo.remove();
  }
}

function bucketKeys(ts) {
  const { len } = bounds(), n = Math.max(1, Math.round(len / (ts.step || DAY)));
  return { keys: Array.from({ length: n }, (_, i) => i), at: (b) => Math.min(n - 1, b) };
}

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];
const tzMin = () => -new Date().getTimezoneOffset();
function tlWindow() {
  if (state.zoom) return { ...state.zoom, zoomed: true };
  if (state.tab === 'live') { const to = Date.now(); return { from: to - HOUR, to }; }
  const { from, to } = bounds();
  return { from, to };
}
const bucketFor = (ms) => STEPS.find((m) => ms / (m * 60_000) <= 120) || 1440;
const resLabel = (m) => (m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : '1 day');


function renderTimeline(d) {
  if (!$('#timeline')) return;
  const tl = d.tl, win = d.tlWin, el = $('#timeline');
  const bMin = tl.bucketMs / 60_000;
  $('#tl-res').innerHTML = `▮ ${resLabel(bMin)}${tl.fitted || state.fit === false ? ` · <button class="fit-btn" id="tl-fit" title="${tl.fitted ? 'Framed to activity — show the whole period' : 'Frame to activity'}">${tl.fitted ? '⤢ fit' : '⤡ full'}</button>` : ''}`;
  const fb = $('#tl-fit');
  if (fb) fb.onclick = () => { state.fit = tl.fitted ? false : true; save(); load(); };
  const z = $('#tl-zoom');
  z.hidden = !state.zoom;
  if (state.zoom) z.querySelector('span').textContent = `${fmtT(state.zoom.from, state.zoom.to - state.zoom.from)}–${fmtT(state.zoom.to, state.zoom.to - state.zoom.from)}`;
  for (const b of document.querySelectorAll('#act-tabs button')) b.setAttribute('aria-pressed', String(!state.zoom && b.dataset.t === state.tab));

  const team = people.length > 1;
  const series = [{ key: 'tok', label: 'Team', color: 'var(--s1)' }];
  $('#tl-title').textContent = SOLO ? 'Your tokens' : 'Team tokens';

  const B = tl.bucketMs, off = tzMin() * 60_000;
  const first = Math.floor((win.from + off) / B) * B - off;
  const keys = [];
  for (let t = first; t < win.to && keys.length < 500; t += B) keys.push(t);
  const by = new Map(tl.buckets.map((b) => [b.t, b]));
  const byU = new Map();
  for (const r of tl.byUser) { if (!byU.has(r.t)) byU.set(r.t, {}); byU.get(r.t)[r.user_key] = r.tokens; }
  const val = (t) => { const b = by.get(t); return b ? (b.input || 0) + (b.output || 0) + (b.cacheRead || 0) + (b.cacheCreation || 0) : 0; };

  const W = el.clientWidth || 600, H = el.clientHeight || 260;
  const m = { l: 44, r: 10, t: 6 };
  const iw = W - m.l - m.r;
  const L = { axis: 16, cum: 34, gap: 8 };
  const tokH = H - m.t - L.axis - L.cum - L.gap * 2;
  const yTok0 = m.t, yCum0 = yTok0 + tokH + L.gap, yEnd = yCum0 + L.cum, yAxis = yEnd + L.gap;
  const span = win.to - win.from;
  const x = (t) => m.l + ((t - win.from) / span) * iw;
  const tx = (px) => win.from + ((px - m.l) / iw) * span;

  const totals = keys.map((t) => series.reduce((a, s1) => a + val(t, s1.key), 0));
  const max = niceMax(Math.max(0, ...totals));
  const yT = (v) => yTok0 + tokH - (v / max) * tokH;
  const bw = Math.max(1, Math.min(18, (iw / keys.length) * 0.74));

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Timeline">`;
  const clean = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].some((q) => Math.abs(v / e - q) < 1e-9); };
  const nt = [4, 3, 2].find((n) => clean(max / n)) || 3;
  for (let i = 0; i <= nt; i++) {
    const yy = yT((max / nt) * i);
    svg += `<line class="${i ? 'gl' : 'bl'}" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
    if (i) svg += `<text x="${m.l - 6}" y="${yy + 3}" text-anchor="end">${compact((max / nt) * i)}</text>`;
  }
  svg += `<text class="lane-l" x="${m.l - 6}" y="${yCum0 + L.cum / 2 + 3}" text-anchor="end">${showCost() ? '$' : 'Σ tok'}</text>`;

  const newest = keys[keys.length - 1];
  keys.forEach((t, i) => {
    const cx = x(t + B / 2);
    let base = 0;
    const segs = series.map((s1) => ({ s1, v: val(t, s1.key) })).filter((g) => g.v > 0);
    if (!segs.length) return;
    svg += `<g class="${t === newest && !win.zoomed && state.tab === 'live' ? 'bar-new' : ''}">`;
    segs.forEach((g, j) => {
      const y0 = yT(base), y1 = yT(base + g.v), top = j === segs.length - 1;
      const h = Math.max(1, y0 - y1 - (top || bw < 4 ? 0 : 1.5)), x0 = cx - bw / 2, yt = y0 - h, r = top ? Math.min(3, h, bw / 2) : 0;
      svg += r ? `<path fill="${g.s1.color}" d="M${x0},${y0}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${y0}Z"/>`
               : `<rect fill="${g.s1.color}" x="${x0}" y="${yt}" width="${bw}" height="${h}"/>`;
      base += g.v;
    });
    svg += '</g>';
  });

  let run = 0;
  const cumOf = (b) => (showCost() ? b?.cost : (b?.input || 0) + (b?.output || 0) + (b?.cacheRead || 0) + (b?.cacheCreation || 0)) || 0;
  const pts = keys.map((t) => { run += cumOf(by.get(t)); return [Math.min(W - m.r, x(t + B)), run]; });
  const cmax = Math.max(run, 1e-9), yC = (v) => yCum0 + L.cum - 2 - (v / cmax) * (L.cum - 6);
  svg += `<line class="bl" x1="${m.l}" x2="${W - m.r}" y1="${yCum0 + L.cum - 2}" y2="${yCum0 + L.cum - 2}"/>`;
  if (run > 0) {
    const line = `M${m.l},${yC(0)}` + pts.map(([px, v]) => `L${px.toFixed(1)},${yC(v).toFixed(1)}`).join('');
    svg += `<path class="cum-a" d="${line}L${pts[pts.length - 1][0]},${yCum0 + L.cum - 2}L${m.l},${yCum0 + L.cum - 2}Z"/><path class="cum" d="${line}"/>`;
    const lx = Math.min(pts[pts.length - 1][0], W - m.r);
    svg += `<text class="cum-v" x="${lx - 4}" y="${yC(run) - 5}" text-anchor="end">${showCost() ? usd(run) : compact(run)}</text>`;
  }

  const now = Date.now();
  if (now >= win.from && now <= win.to + B) {
    const nx = Math.min(x(now), W - m.r);
    svg += `<line class="now-l" x1="${nx}" x2="${nx}" y1="${yTok0}" y2="${yEnd}"/><circle class="now-d" cx="${nx}" cy="${yTok0}" r="3"/>`;
  }

  const tickMin = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].find((q) => span / (q * 60_000) <= 8) || 10080;
  const TB = tickMin * 60_000;
  for (let t = Math.ceil((win.from + off) / TB) * TB - off; t <= win.to; t += TB) {
    svg += `<line class="gl" x1="${x(t)}" x2="${x(t)}" y1="${yAxis - 3}" y2="${yAxis}"/><text x="${x(t)}" y="${yAxis + 11}" text-anchor="middle">${fmtT(t, span)}</text>`;
  }
  svg += `<line class="xh" id="tl-xh" x1="0" x2="0" y1="${yTok0}" y2="${yEnd}" visibility="hidden"/><rect class="sel" id="tl-sel" x="0" y="${yTok0}" width="0" height="${yEnd - yTok0}" visibility="hidden"/>`;
  if (!totals.some(Boolean)) svg += `<text x="${m.l + iw / 2}" y="${yTok0 + tokH / 2}" text-anchor="middle" font-size="12">quiet — nothing in this window</text>`;
  el.innerHTML = svg + '</svg>';

  const xh = el.querySelector('#tl-xh'), sel = el.querySelector('#tl-sel'), svgEl = el.querySelector('svg');
  const px = (e) => { const r = svgEl.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; };
  let drag = null;
  svgEl.onpointerdown = (e) => { drag = px(e); svgEl.setPointerCapture(e.pointerId); };
  svgEl.onpointermove = (e) => {
    const p0 = Math.max(m.l, Math.min(W - m.r, px(e)));
    if (drag != null) {
      const a = Math.max(m.l, Math.min(drag, p0)), b = Math.min(W - m.r, Math.max(drag, p0));
      sel.setAttribute('x', a); sel.setAttribute('width', b - a); sel.setAttribute('visibility', 'visible');
      hideTip(); return;
    }
    const t = tx(p0), k = Math.floor((t + off) / B) * B - off, b = by.get(k) || {};
    xh.setAttribute('x1', p0); xh.setAttribute('x2', p0); xh.setAttribute('visibility', 'visible');
    const tokRows = team
      ? Object.entries(byU.get(k) || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u, v]) => { const p = people.find((x) => x.user_key === u); return [p ? displayName(p) : '—', compact(v), colorOf(u)]; })
      : [['Tokens', compact(val(k)), series[0].color]];
    showTip(e, `<b>${fmtT(k, Math.min(span, B * 2))}${bMin < 1440 ? `–${new Date(k + B).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</b>` +
      rows([...tokRows, ...(showCost() ? [['Spend', usd(b.cost || 0)]] : []), ['Requests', nf.format(b.requests || 0)], ['Prompts', nf.format(b.prompts || 0)], ['Tools', `${nf.format(b.tools || 0)}${b.fails ? ` · ${b.fails} failed` : ''}`]]));
  };
  const end = (e) => {
    if (drag == null) return;
    const a = tx(Math.max(m.l, Math.min(drag, px(e)))), b = tx(Math.min(W - m.r, Math.max(drag, px(e))));
    drag = null; sel.setAttribute('visibility', 'hidden');
    if (b - a >= 5 * 60_000 && Math.abs(x(b) - x(a)) > 8) { state.zoom = { from: Math.round(a), to: Math.round(b) }; save(); load(); }
  };
  svgEl.onpointerup = end;
  svgEl.onpointercancel = () => { drag = null; sel.setAttribute('visibility', 'hidden'); };
  svgEl.onpointerleave = () => { xh.setAttribute('visibility', 'hidden'); if (drag == null) hideTip(); };
  svgEl.ondblclick = () => { if (state.zoom) { state.zoom = null; save(); load(); } };
}
function fmtT(t, span) {
  const d = new Date(t);
  if (span <= 2 * DAY) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (span <= 14 * DAY) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const resetText = (t) => { if (!t) return ''; const d = new Date(t), now = new Date(); const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === now.toDateString() ? `resets ${hm}` : t - now < 7 * 864e5 ? `resets ${d.toLocaleDateString([], { weekday: 'short' })} ${hm}` : `resets ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`; };
const asOf = (t) => { const d = new Date(t); return d.toDateString() === new Date().toDateString() ? `as of ${pad(d.getHours())}:${pad(d.getMinutes())}` : `as of ${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`; };
const usedLeft = (v, reset, ts) => (v == null ? '–' : `${Math.round(v)}% used · ${Math.max(0, 100 - Math.round(v))}% left · ${reset ? resetText(reset) : asOf(ts)}`);
function renderModels(team) {
  const agg = (fn) => { const m = new Map(); for (const p of team) for (const [k, v] of fn(p)) m.set(k, (m.get(k) || 0) + v); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const sections = [
    ['Models', 'tokens', agg((p) => p.models.map((m) => [m.model.replace(/^claude-/, ''), m.tokens]))],
    ['Effort', 'requests', agg((p) => Object.entries(p.effort))],
    ['Client', 'conversations', agg((p) => p.clients.map((c) => [AG()?.client(c.client)?.label || c.client.replace(/^claude-/, ''), c.sessions]))],
  ];
  const hits = team.reduce((a, p) => a + (p.cacheHit != null ? p.cacheHit * p.tokens : 0), 0) / Math.max(1, team.reduce((a, p) => a + (p.cacheHit != null ? p.tokens : 0), 0));
  $('#models').innerHTML = sections.map(([title, unit, items]) => {
    const tot = items.reduce((a, [, v]) => a + v, 0) || 1;
    return `<div class="mixbar" data-learn="mix:${title}"><div class="lbl"><span>${title}</span><span class="muted">${unit}</span></div>
      <div class="track">${items.map(([k, v], i) => `<i title="${esc(k)} · ${Math.round((v / tot) * 100)}%" style="width:${(v / tot) * 100}%;background:${SLOTS[i % SLOTS.length]}"></i>`).join('')}</div>
      <div class="keys">${items.slice(0, 4).map(([k, v], i) => `<span><i style="background:${SLOTS[i % SLOTS.length]}"></i>${esc(k)} ${Math.round((v / tot) * 100)}%</span>`).join('')}</div></div>`;
  }).join('') + `<div class="mixbar" data-learn="mix:Cache hits"><div class="lbl"><span>Cache hits</span><span class="muted">${Math.round(hits * 100)}%</span></div><div class="track"><i style="width:${hits * 100}%;background:var(--s3)"></i></div></div>`;
}

function renderCal(d) {
  const ppl = new Map(d.team.people.map((p) => [p.user_key, p])), perDay = new Map();
  for (const r of d.team.dailyByUser || []) { if (!perDay.has(r.day)) perDay.set(r.day, []); perDay.get(r.day).push(r); }
  globalThis.mountCalendar($('#heat'), d.team.daily || [], { from: d.team.lane?.from ?? Date.now(), now: d.team.now || Date.now(), onDraw: (byDay) => {
    for (const c of document.querySelectorAll('#heat .cal-g .cal-d')) hover(c, () => {
      const x = byDay.get(c.dataset.day) || {}, who = (perDay.get(c.dataset.day) || []).filter((r) => ppl.has(r.user_key)).sort((a, b) => b.tokens - a.tokens);
      const top = who.slice(0, 6).map((r) => [displayName(ppl.get(r.user_key)).split(' ')[0], globalThis.calTok(r.tokens), colorOf(r.user_key)]);
      if (who.length > 6) top.push([`+${who.length - 6} others`, globalThis.calTok(who.slice(6).reduce((a, r) => a + r.tokens, 0))]);
      return `<b>${esc(globalThis.calDayName(c.dataset.day))}</b>` + rows([['Tokens', globalThis.calTok(x.tokens)], ['Prompts', nf.format(x.prompts || 0)]])
        + (top.length > 1 || (top.length === 1 && ppl.size > 1) ? `<div class="tip-sep"></div>` + rows(top) : '');
    });
  } });
}

function renderHealth(h) {
  const r = h.recovery || {}, c = r.check;
  const mism = c ? c.tokenMismatch + c.costMismatch + c.promptMismatch : 0;
  const bad = !!r.error, warn = mism > 0;
  globalThis.PuddleBar?.check(bad ? { level: 'bad', text: 'Error', title: 'Recovering missed data failed: click for the details' }
    : warn ? { level: 'warn', text: `${mism} differ`, title: `${mism} numbers differ from the session logs: click for the details` } : null);
  $('#hs-grid').innerHTML = [
    ['Up', r.startedAt ? dur(Date.now() - r.startedAt) : '—'], ['Last event', h.lastEvent ? ago(h.lastEvent) + ' ago' : '—'],
    ['Events', `${compact(h.events)} <span class="muted">↻${compact(h.bySource?.transcript || 0)}</span>`], ['Last scan', r.lastRun ? ago(r.lastRun) + ' ago' : '—'],
  ].map(([k, v]) => `<div class="hs-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('#hs-check').innerHTML = c && (c.requests || c.prompts)
    ? banner(!mism, mism ? `${mism} value(s) differ from session logs` : `${nf.format(c.requests)} requests · ${nf.format(c.prompts)} prompts match session logs`, mism ? c.examples.map((x) => `${x.kind}: ${JSON.stringify(x.log)} ≠ ${JSON.stringify(x.telemetry)}`).join(' · ') : '')
    : '';
  $('#hs-incidents').innerHTML = (r.incidents || []).map((i) => `<div class="inc"><span>${new Date(i.down_from).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span class="bar-t" title="${esc(i.reason)}"></span><b>${dur(i.down_to - i.down_from)}</b><span>↻ ${nf.format(i.recovered)}</span></div>`).join('');
}
function banner(ok, title, detail) {
  return `<div class="banner ${ok ? 'ok' : 'warn'}" role="status"><span aria-hidden="true">${ok ? '✓' : '⚠'}</span><div><b>${esc(title)}</b>${detail ? esc(detail) : ''}</div></div>`;
}

const cards = (() => {
  const LIST = [
    { key: 'calendar', url: '/api/cards/calendar', near: '[data-card="calendar"]', draw: () => renderCal(D) },
    { key: 'lines', url: '/api/cards/lines', near: '[data-card="lines"]', draw: () => renderLines(D) },
    { key: 'prompts', url: '/api/cards/prompts', near: '[data-card="prompts"]', draw: () => renderPrompts(D) },
  ];
  const shown = (c) => { const el = document.querySelector(c.near); return el && (el.getClientRects().length > 0 || (el.dataset.empty === '1' && shownCard(c.key))); };
  const got = {}, seen = new Set(), asked = {};
  const paramsKey = () => `${state.range}|${new Date().toDateString()}`;
  let newest = 0;
  const fetchCard = async (c) => {
    asked[c.key] = paramsKey();
    const q = new URLSearchParams({ from: bounds().from, to: Date.now() + 60_000, tz: tzMin() });
    const r = await fetch(api(`${c.url}?${q}`)).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r) return;
    got[c.key] = r;
    if (c.key === 'calendar') calNewest = Math.max(calNewest, newest);
    if (D) { Object.assign(D.team, r); c.draw(); globalThis.PuddlePerf?.card(c.key); }
  };
  let calNewest = 0;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) for (const c of LIST) if (!seen.has(c.key) && e.target.matches(c.near) && shown(c)) { seen.add(c.key); fetchCard(c); }
  }, { rootMargin: '800px 0px' }) : null;
  let watching = false;
  const near = () => { if (!watching) return; for (const c of LIST) if (!seen.has(c.key) && shown(c)) { const el = document.querySelector(c.near); if (el.getBoundingClientRect().top < (innerHeight || 800) + 800) { seen.add(c.key); fetchCard(c); } } };
  const watch = () => {
    watching = true; near();
    for (const sel of new Set(LIST.map((c) => c.near))) { const el = document.querySelector(sel); if (el && io) io.observe(el); }
    addEventListener('scroll', near, { passive: true }); addEventListener('resize', near, { passive: true });
  };
  const dayOf = (ts) => new Date(ts + tzMin() * 60_000).toISOString().slice(0, 10);
  const addToCalendar = (feed) => {
    if (!got.calendar || !D) return;
    const fresh = feed.filter((r) => r.id > calNewest);
    if (!fresh.length) return;
    calNewest = Math.max(calNewest, ...fresh.map((r) => r.id));
    const daily = got.calendar.daily, byUser = got.calendar.dailyByUser || [];
    for (const r of fresh) {
      const day = dayOf(r.ts), tok = r.name === 'api_request' ? evTokens(r) : 0;
      let d = daily.find((x) => x.day === day);
      if (!d) { d = { day, prompts: 0, tools: 0, tokens: null, sessions: 0 }; daily.push(d); daily.sort((a, b) => (a.day < b.day ? -1 : 1)); }
      if (r.name === 'user_prompt') d.prompts++;
      if (r.name === 'tool_result') d.tools++;
      if (tok) {
        d.tokens = (d.tokens || 0) + tok;
        let u = byUser.find((x) => x.day === day && x.user_key === r.user_key);
        if (!u) { u = { day, user_key: r.user_key, tokens: 0 }; byUser.push(u); }
        u.tokens += tok;
      }
    }
    Object.assign(D.team, got.calendar); renderCal(D);
  };
  return {
    data: () => Object.assign({}, ...Object.values(got)),
    refresh: () => { near(); for (const c of LIST) if (seen.has(c.key) && shown(c) && asked[c.key] !== paramsKey()) fetchCard(c); },
    live(feed) {
      for (const r of feed) newest = Math.max(newest, r.id || 0);
      addToCalendar(feed);
    },
    stale() { for (const c of LIST.slice(1)) if (seen.has(c.key) && shown(c)) fetchCard(c); },
    seenFeed(feed) { for (const r of feed || []) newest = Math.max(newest, r.id || 0); },
    watch,
  };
})();

let loading = null, again = false;
const rangeBounds = (r) => { const now = Date.now(); return { from: now - (RANGE_LEN[r] || 7 * DAY), to: now }; };
const inflight = new Map();
let viewCtl = null;
function fetchView(r, { prefetch = false } = {}) {
  const hit = inflight.get(r);
  if (!prefetch && hit && Date.now() - hit.at < 5000) { inflight.delete(r); return hit.promise; }
  const { from, to } = rangeBounds(r);
  const bq = new URLSearchParams({ from, to: to + 60_000 });
  const tq = new URLSearchParams({ from, to: Date.now() + 60_000, tz: tzMin(), parts: 'core', ...(skipped() ? { skip: skipped() } : {}) });
  let signal;
  if (!prefetch) { if (viewCtl && viewCtl.range !== r) viewCtl.abort(); viewCtl = new AbortController(); viewCtl.range = r; signal = viewCtl.signal; }
  const opt = { signal, ...(prefetch ? { headers: { 'x-puddle-prefetch': '1' } } : {}) };
  const get = (u) => fetch(api(u), opt).then((x) => (x.ok ? x.json() : Promise.reject(new Error(`view ${x.status}`))));
  return Promise.all([get('/api/board?' + bq), get('/api/team?' + tq)]);
}
function prefetch(r) {
  if (r === state.range || inflight.has(r)) return;
  const promise = fetchView(r, { prefetch: true }); promise.catch(() => inflight.delete(r));
  inflight.set(r, { at: Date.now(), promise });
  promise.then(([board, team]) => remember(viewKey(r), { board, team })).catch(() => {});
}
let shownKey = null;
const viewKey = (r = state.range) => `puddle-view:${state.demo ? 'demo' : TEAM || 'me'}|${r}|${skipped()}`;
function remember(key, v) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), ...v }));
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith('puddle-view:'));
    if (keys.length > 12) for (const k of keys.sort((a, b) => (JSON.parse(sessionStorage.getItem(a)).at - JSON.parse(sessionStorage.getItem(b)).at)).slice(0, keys.length - 12)) sessionStorage.removeItem(k);
  } catch {  }
}
function recall(key) { try { const v = JSON.parse(sessionStorage.getItem(key) || 'null'); return v && Date.now() - v.at < 30 * 60_000 ? v : null; } catch { return null; } }
async function load() {
  if (loading) { again = true; return loading; }
  loading = (async () => {
    try {
      const key = viewKey();
      if (shownKey !== key) {
        const v = recall(key);
        if (v) {
          D = { board: v.board, team: { ...v.team, ...cards.data() } };
          people = D.team.people.map((u) => ({ ...u, last_active: u.lastActive }));
          for (const b of document.querySelectorAll('#range button')) b.setAttribute('aria-pressed', String(b.dataset.r === state.range));
          render(); globalThis.PuddlePerf?.drawn('team');
        }
        shownKey = key;
      }
      const [board, team] = await fetchView(state.range);
      D = { board, team: { ...team, ...cards.data() } };
      lastLoad = Date.now();
      appliedUpTo = team.maxId || Math.max(0, ...(board.feed || []).map((r) => r.id || 0)); applied.clear(); addCounts(liveBuf);
      remember(key, { board, team });
      cards.seenFeed(board.feed);
      var flights = Fx.plan(board.feed);
      people = team.people.map((u) => ({ ...u, last_active: u.lastActive }));
      for (const b of document.querySelectorAll('#range button')) b.setAttribute('aria-pressed', String(b.dataset.r === state.range));
      render(); globalThis.PuddleBar?.fetched('ok');
      globalThis.PuddlePerf?.drawn('team'); globalThis.PuddleHeal?.drawn();
      Fx.run(flights);
      cards.refresh();
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error(e);
      globalThis.PuddleBar?.fetched(/ 503$/.test(e?.message || '') ? 'busy' : 'fail');
    } finally {
      loading = null;
      if (again) { again = false; load(); }
    }
  })();
  return loading;
}
const RANGE_WORD = { '1d': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' };
function renderSummary(d) {
  const el = $('#summary'), items = d.team.summary || [];
  const html = `<header><h2>In plain words</h2><span class="chip">${RANGE_WORD[state.range] || 'This period'}</span></header>
    ${items.length ? `<ul class="plain">${items.map((x, i) => `<li data-i="${i}" class="${x.level === 'warn' ? 'warn' : ''}">${esc(x.text)}</li>`).join('')}</ul>` : '<p class="muted">Nothing to say yet: no prompts in this period.</p>'}
    <p class="plain-note">Time and counts only. They show how agents are used, not how good the work is; prompts and code are never seen.</p>`;
  if (el._h !== html) { el._h = html; el.innerHTML = html; }
  for (const li of el.querySelectorAll('li')) { const x = items[+li.dataset.i]; hover(li, `<b>Why</b><div>${esc(x.evidence || '')}</div>`); }
}
function renderPrompts(d) {
  const ppl = new Map(d.team.people.map((p) => [p.user_key, p]));
  globalThis.mountPrompts?.(document.querySelector('[data-card="prompts"]'), d.team.lastDay, { hover, rows, who: (k) => displayName(ppl.get(k)), colorOf, learn: 'card:prompts' });
}
function renderProjects(d) {
  const list = d.team.recent || [], card = $('#projects-card');
  card.hidden = !list.length;
  if (!list.length) return;
  const ppl = new Map(d.team.people.map((p) => [p.user_key, p]));
  const scope = state.demo ? 'demo=1&' : TEAM ? `team=${encodeURIComponent(TEAM)}&` : '';
  const html = globalThis.recentHTML(list, { avatar: (k) => (ppl.get(k) ? avatar(ppl.get(k), 'sm') : ''), nameOf: (k) => displayName(ppl.get(k)), time: (m) => `${hmm(m)} h`, ago,
    href: (c) => `/project?${scope}p=${encodeURIComponent(c.project)}&range=${encodeURIComponent(state.range)}&c=${encodeURIComponent(c.session_id)}&${fromHere()}`,
    seeAll: `/work?${scope}range=${encodeURIComponent(state.range)}&${fromHere()}` });
  if ($('#projects')._h !== html) { $('#projects')._h = html; $('#projects').innerHTML = html; }
}
function renderLines(d) {
  const card = $('#lines-card');
  if (!card || !d.team.codeLines) return;
  const list = d.team.codeLines;
  card.hidden = !list.length; card.dataset.empty = list.length ? '' : '1';
  if (list.length) globalThis.mountCodeLines($('#lines'), list, { from: bounds().from, now: Date.now(), hover, rows });
}
function render() {
  if (!D || document.body.classList.contains('leaving')) return;
  $('#grid')?.setAttribute('aria-busy', 'false');
  if (shownCard('recent')) renderProjects(D);
  if (shownCard('lines')) renderLines(D);
  if (shownCard('kpis')) renderKpis(D);
  renderPeople(D);
  if (shownCard('models')) renderModels(D.team.people);
  if (shownCard('calendar')) renderCal(D);
  renderHealth(D.board.health);
}

const Fx = (() => {
  let seen = null, filterKey = '', floors = null;
  const hold = new Set();
  const tile = (id) => document.querySelector(`.kpi[data-k="${id}"]`);
  const T = {
    prompt:  { ic: '✎', c: 'var(--s5)', to: () => tile('time'), sound: 'prompt', rolls: ['time'] },
    coin:    { ic: '⚡︎', c: 'var(--s1)', to: () => tile('time'), sound: 'request', rolls: ['time'] },
    tool:    { ic: '⚙︎', c: 'var(--s3)', to: (f) => { const p = people.find((x) => x.email === f.email); return (p && document.querySelector(`.brow.body[data-u="${CSS.escape(p.user_key)}"]`)) || $('.people-card'); }, sound: 'tool', rolls: [] },
    fail:    { ic: '✕', c: 'var(--critical)', to: (f) => { const p = people.find((x) => x.email === f.email); return (p && document.querySelector(`.brow.body[data-u="${CSS.escape(p.user_key)}"]`)) || $('.people-card'); }, sound: 'fail', rolls: [], shake: true },
    recover: { ic: '↻', c: 'var(--s1)', to: () => $('#status'), sound: 'recover', rolls: [] },
  };
  const inView = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  function sourceFor(email) {
    const p = people.find((x) => x.email === email);
    const u = p ? CSS.escape(p.user_key) : null;
    const cands = u ? [`.brow.body[data-u="${u}"] .now-ic`, `#map .pin[data-u="${u}"]`] : [];
    for (const c of [...cands, '#status']) { const el = document.querySelector(c); if (inView(el)) return el; }
    return null;
  }

  function plan(feed) {
    const top = feed[0]?.id ?? 0;
    if (seen == null) { seen = top; return []; }
    const fresh = feed.filter((e) => e.id > seen && Date.now() - e.ts < 20_000).sort((a, b) => a.id - b.id);
    seen = Math.max(seen, top);
    if (!fresh.length) return [];
    const out = [];
    for (const e of fresh.filter((e) => e.name === 'api_error' || e.success === 0).slice(0, 2)) out.push({ type: 'fail', email: e.email, label: e.tool_name || 'error' });
    const per = (pred) => { const m = new Map(); for (const e of fresh.filter(pred)) m.set(e.email, [...(m.get(e.email) || []), e]); return m; };
    for (const [email, es] of per((e) => e.name === 'user_prompt')) out.push({ type: 'prompt', email, label: `+${es.length}` });
    const tools = new Map();
    for (const e of fresh.filter((e) => e.name === 'tool_result' && e.success !== 0)) tools.set(e.tool_name + '|' + e.email, e);
    for (const e of [...tools.values()].slice(0, 3)) out.push({ type: 'tool', email: e.email, tool: e.tool_name, label: (e.tool_name || 'tool').replace(/^mcp__/, '') });
    for (const [email, es] of per((e) => e.name === 'api_request')) {
      const cost = es.reduce((x, e) => x + (e.cost_usd || 0), 0), tok = es.reduce((x, e) => x + evTokens(e), 0);
      out.push({ type: 'coin', email, label: showCost() ? `+${usd(cost)}` : `+${compact(tok)}` });
    }
    if (fresh.some((e) => e.source === 'transcript')) out.push({ type: 'recover', email: null, label: '↻' });
    const flights = out.slice(0, 7);
    for (const f of flights) for (const id of T[f.type].rolls) hold.add(id);
    return flights;
  }

  function run(flights) {
    flights.forEach((f, i) => setTimeout(() => fly(f), i * 230));
    setTimeout(() => { for (const id of [...hold]) { hold.delete(id); rollKpi(id); } }, flights.length * 230 + 1400);
  }

  let flying = 0;
  function fly(f) {
    const t = T[f.type], dst = t.to(f);
    const src = sourceFor(f.email);
    if (!dst || !inView(dst) || !src || !Motion.full() || flying >= 4) { if (src && Motion.any()) bump(src, 0.04); return land(f, dst); }
    const [x0, y0] = center(src), [x1, y1] = center(dst);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const tok = document.createElement('div');
    tok.className = 'fx-token';
    tok.style.setProperty('--c', t.c);
    tok.innerHTML = `<i>${t.ic}</i>${esc(f.label)}`;
    document.body.appendChild(tok);
    flying++;
    bump(src, 0.05);
    const tr = tok.getBoundingClientRect(), mx = tr.width / 2 + 8, my = tr.height / 2 + 8;
    const clampX = (x) => Math.max(mx, Math.min(innerWidth - mx, x)), clampY = (y) => Math.max(my, Math.min(innerHeight - my, y));
    const a0 = [clampX(x0), clampY(y0)], a1 = [clampX(x1), clampY(y1)];
    const lift = Math.max(0, Math.min(60, 20 + dist * 0.12, Math.min(a0[1], a1[1]) - my));
    const path = Motion.arc(a0, a1, { lift });
    const last = path.length - 1;
    const frames = path.map(([x, y, tilt], i) => {
      const u = i / last;
      const sc = u < 0.1 ? 0.85 + (u / 0.1) * 0.15 : 1 - Math.max(0, u - 0.88) * 0.8;
      return { transform: `translate(${clampX(x)}px,${clampY(y)}px) translate(-50%,-50%) rotate(${tilt}deg) scale(${sc})`, opacity: u < 0.08 ? u / 0.08 : 1 };
    });
    frames.push({ transform: `translate(${a1[0]}px,${a1[1]}px) translate(-50%,-50%) scale(1.03, .94)`, opacity: 0 });
    const anim = tok.animate(frames, { duration: Math.min(950, 520 + dist * 0.35), easing: 'linear' });
    anim.onfinish = anim.oncancel = () => { tok.remove(); flying--; land(f, dst); };
  }

  function bump(el, strength = 0.03, axis = 'scale') {
    if (!Motion.any()) return;
    const k = Motion.impulse({ amplitude: strength, frequency: axis === 'scale' ? 3.2 : 7, decay: 11, duration: 420 });
    el.animate(k.map((v) => ({ transform: axis === 'scale' ? `scale(${1 + v})` : `translateX(${v * 40}px)` })), { duration: 420, easing: 'linear', composite: 'add' });
  }

  function land(f, dst) {
    const t = T[f.type];
    Sound.play(t.sound, 0, f.email ? people.findIndex((p) => p.email === f.email) : null);
    for (const id of t.rolls) { hold.delete(id); rollKpi(id); }
    if (t.after) t.after();
    if (!dst) return;
    if (!Motion.any()) return;
    dst.style.setProperty('--hit', t.c);
    dst.classList.remove('fx-hit'); void dst.offsetWidth;
    dst.classList.add('fx-hit');
    setTimeout(() => dst.classList.remove('fx-hit'), 1100);
    if (t.shake) bump(dst, 0.04, 'x'); else if (dst.matches('.kpi')) bump(dst, 0.01);
    if (f.type !== 'recover' && f.type !== 'coin') floatText(dst, f.type === 'tool' ? '✓' : f.label, t.c);
  }

  function floatText(el, text, color) {
    if (!Motion.any()) return;
    const r = el.getBoundingClientRect();
    const n = document.createElement('div');
    n.className = 'fx-float'; n.textContent = text; n.style.color = color;
    document.body.appendChild(n);
    const w = n.offsetWidth;
    n.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width - 28))}px`;
    n.style.top = `${Math.max(24, Math.min(innerHeight - 24, r.top + 10))}px`;
    n.animate([{ transform: 'translateY(4px)', opacity: 0 }, { transform: 'translateY(-3px)', opacity: 1, offset: 0.2 }, { transform: 'translateY(-16px)', opacity: 0 }],
      { duration: 1300, easing: 'cubic-bezier(.15,.7,.3,1)' }).onfinish = () => n.remove();
  }

  function milestones(tiles) {
    const key = state.range;
    const stepOf = { spend: (v) => (v < 10 ? 1 : v < 100 ? 5 : v < 1000 ? 25 : 100), tokens: (v) => (v < 2e7 ? 1e6 : v < 2e8 ? 1e7 : 1e8) };
    const now = {};
    for (const t of tiles) if (stepOf[t.id] && t.raw != null) now[t.id] = Math.floor(t.raw / stepOf[t.id](t.raw)) * stepOf[t.id](t.raw);
    if (key !== filterKey || !floors) { filterKey = key; floors = now; return; }
    for (const id of Object.keys(now)) {
      if (now[id] > floors[id]) {
        const label = id === 'spend' ? usd(now[id]) : compact(now[id]);
        setTimeout(() => celebrate(id, label), hold.has(id) ? 1300 : 200);
      }
    }
    floors = now;
  }
  function celebrate(id, label) {
    const el = tile(id);
    if (!el) return;
    Sound.play('success');
    el.classList.remove('fx-shine'); void el.offsetWidth; el.classList.add('fx-shine');
    setTimeout(() => el.classList.remove('fx-shine'), 1600);
    floatText(el, `★ ${label}`, 'var(--s4)');
  }

  function hear(feed) {
    const flights = plan(feed);
    hold.clear();
    flights.forEach((f, i) => Sound.play(T[f.type].sound, i * 260, f.email ? people.findIndex((p) => p.email === f.email) : null));
  }

  return { plan, run, hear, milestones, holding: (id) => hold.has(id), reset() { seen = null; floors = null; hold.clear(); } };
})();

const soundBtn = $('#sound-btn');
soundBtn.setAttribute('aria-pressed', String(Sound.on));
soundBtn.onclick = () => {
  Sound.on = !Sound.on;
  soundBtn.setAttribute('aria-pressed', String(Sound.on));
  soundBtn.title = Sound.on ? 'Sounds on' : 'Sounds off';
  if (Sound.on) { Sound.play('toggle'); soundBtn.classList.remove('ping'); void soundBtn.offsetWidth; soundBtn.classList.add('ping'); }
};
for (const b of document.querySelectorAll('#range button')) b.onclick = () => {
  state.range = b.dataset.r; state.tab = 'range'; state.zoom = null; save();
  for (const x of document.querySelectorAll('#range button')) x.setAttribute('aria-pressed', String(x === b));
  load();
};
for (const b of document.querySelectorAll('#range button')) { b.addEventListener('pointerenter', () => prefetch(b.dataset.r)); b.addEventListener('pointerdown', () => prefetch(b.dataset.r)); }
for (const b of document.querySelectorAll('#act-tabs button')) b.onclick = () => { state.tab = b.dataset.t; state.zoom = null; save(); load(); };
$('#tl-zoom')?.addEventListener('click', () => { state.zoom = null; save(); load(); });
const learnBtn = $('#learn-btn');
function applyLearn() { document.body.classList.toggle('learn', LEARN.on); learnBtn.setAttribute('aria-pressed', String(LEARN.on)); learnBtn.title = LEARN.on ? 'Learn mode on: hover anything for an explanation' : 'Learn mode: explain everything'; }
learnBtn.onclick = () => { LEARN.on = !LEARN.on; applyLearn(); hideTip(); Sound.play('toggle'); toast(LEARN.on ? '? Learn mode on — hover anything to see what it means' : 'Learn mode off'); };
applyLearn();

globalThis.PuddleTheme?.onChange((t, from) => {
  if (from === 'user') { Sound.play('toggle'); toast(t === 'auto' ? 'Theme follows your system' : `${t[0].toUpperCase()}${t.slice(1)} theme`); }
  if (D) render();
});
const menu = $('#menu'), menuBtn = $('#menu-btn');
if (menuBtn) menuBtn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); };
document.addEventListener('click', () => { if (menu) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (menu) menu.hidden = true; hideTip(); } });
$('#status').onclick = () => { $('#hs-now').textContent = $('#status').title; $('#health-sheet').showModal(); };
for (const b of document.querySelectorAll('[data-act]')) b.onclick = () => act(b.dataset.act);

function fromHere() {
  const t = document.title.includes(' · ') ? document.title.split(' · ')[0] : null;
  return globalThis.PuddleBar?.from(state.demo ? 'the demo team' : globalThis.PuddleBar?.teamName(TEAM) || t || 'the team') || ''; }
const post = (url, body) => fetch(api(url), { method: 'POST', headers: { 'content-type': 'application/json', 'x-claude-usage': '1' }, body: JSON.stringify(body || {}) })
  .then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }

async function act(a) {
  if (menu) menu.hidden = true;
  if (a === 'cost') {
    state.cost = !showCost(); save();
        toast(showCost() ? '$ Cost estimates on (API list prices)' : 'Cost hidden — behaviour only');
    Fx.reset(); render(); Fx.plan(D?.board.feed || []);
    return;
  }
  if (a === 'demo') {
    state.demo = !state.demo; save(); applyDemo();
    const u = new URL(location.href); u.searchParams.delete('demo'); history.replaceState(null, '', u);
    Fx.reset(); D = null; connect();
    toast(state.demo ? '◎ Demo team — synthetic people, your data is untouched' : 'Back to your real data');
    load();
    return;
  }
  if (a === 'reset') { $('#reset-input').value = ''; $('#reset-go').disabled = true; $('#reset-dlg').showModal(); $('#reset-input').focus(); }
  if (a === 'recover') {
    toast('Scanning session logs…');
    const r = await post('/api/recover');
    const n = r.data.lastRecovered ? Object.values(r.data.lastRecovered).reduce((x, y) => x + y, 0) : 0;
    toast(r.ok ? (n ? `↻ Recovered ${n} events` : `✓ Nothing missing · ${r.data.filesScanned} logs`) : 'Recovery failed');
    Sound.play(!r.ok ? 'fail' : n ? 'recover' : 'toggle');
    load();
  }
}
$('#reset-input').oninput = (e) => { $('#reset-go').disabled = e.target.value.trim() !== 'RESET'; };
$('#reset-form').onsubmit = async (e) => {
  e.preventDefault();
  const r = await post('/api/reset', { confirm: 'RESET' });
  if (r.ok) { $('#reset-dlg').close(); Fx.reset(); toast('Data deleted'); Sound.play('remove'); load(); } else { toast('Reset failed'); Sound.play('fail'); }
};


const applied = new Set(); let appliedUpTo = 0;
const liveBuf = [];
function addCounts(rows) {
  let changed = false;
  for (const r of rows) {
    if (!r.id || r.id <= appliedUpTo || applied.has(r.id)) continue;
    const p = D?.team.people.find((x) => x.user_key === r.user_key); if (!p) continue;
    applied.add(r.id); changed = true;
    if (r.name === 'user_prompt') p.prompts = (p.prompts || 0) + 1;
    else if (r.name === 'api_request') { p.requests = (p.requests || 0) + 1; p.tokens = (p.tokens || 0) + evTokens(r); p.cost = (p.cost || 0) + (r.cost_usd || 0); }
    else if (r.name === 'tool_result') { p.tools = (p.tools || 0) + 1; const k = catOf(r.tool_name); if (p.mix && k in p.mix) p.mix[k]++; }
  }
  return changed;
}
function liveRows(feed) {
  for (const r of feed) { liveBuf.push(r); } while (liveBuf.length > 2000) liveBuf.shift();
  let changed = addCounts(feed);
  for (const r of [...feed].sort((a, b) => a.ts - b.ts)) {
    const p = D.team.people.find((x) => x.user_key === r.user_key);
    if (!p) continue;
    const n = (p.now ||= {});
    if (['user_prompt', 'api_request', 'tool_result', 'tool_decision'].includes(r.name) && !(n.lastTs >= r.ts)) { n.lastTs = r.ts; n.last = r.name; changed = true; }
    if (['tool_result', 'tool_decision'].includes(r.name) && !(n.toolTs >= r.ts)) { n.toolTs = r.ts; n.tool = r.tool_name; n.doing = catOf(r.tool_name); changed = true; }
    if (r.name === 'user_prompt' && !(n.promptTs >= r.ts)) { n.promptTs = r.ts; changed = true; }
    if (r.session_id && ['user_prompt', 'api_request', 'tool_result', 'tool_decision'].includes(r.name)) {
      const list = (n.sessions ||= []), x = list.find((y) => y.id === r.session_id);
      if (x) { if (!(x.ts >= r.ts)) { x.ts = r.ts; changed = true; } if (r.client && !x.client) x.client = AG()?.canonicalClient(r.client) || r.client; }
      else { list.push({ id: r.session_id, agent: r.agent || 'claude-code', client: AG()?.canonicalClient(r.client) || r.client || null, ts: r.ts }); changed = true; }
      n.sessions = list.filter((y) => Date.now() - y.ts < 10 * 60_000);
    }
    if (['user_prompt', 'api_request', 'tool_result'].includes(r.name) && !(n.everTs >= r.ts)) n.everTs = r.ts;
  }
  if (changed) { people = D.team.people.map((u) => ({ ...u, last_active: u.lastActive })); renderPeople(D); }
  Fx.run(Fx.plan(feed));
  cards.live(feed);
}
let es = null, stale = false, live = false;
let lastLoad = 0, soonTimer = null;
function soon() {
  if (soonTimer) return;
  const wait = Math.max(0, lastLoad + 60_000 - Date.now());
  soonTimer = setTimeout(() => { soonTimer = null; load(); cards.stale(); }, wait);
}
async function listen() {
  stale = true;
  if (!Sound.on) return;
  const feed = await fetch(api('/api/events?limit=60&' + qs())).then((r) => r.json()).catch(() => null);
  if (Array.isArray(feed)) Fx.hear(feed);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && stale) { stale = false; load(); } });
function connect() {
  es?.close();
  es = new EventSource(api('/api/stream'));
  globalThis.PuddleBar?.stream(false);
  es.onopen = () => { live = true; globalThis.PuddleBar?.stream(true); };
  es.onerror = () => { live = false; globalThis.PuddleBar?.stream(false); if (es.readyState === EventSource.CLOSED) setTimeout(connect, 5000 + Math.random() * 10_000); };
  es.addEventListener('version', (ev) => globalThis.PuddleHeal?.saw(ev.data));
  es.addEventListener('update', (ev) => {
    let d = null; try { d = JSON.parse(ev.data); } catch {  }
    if (d?.version) globalThis.PuddleHeal?.saw(d.version);
    const feed = Array.isArray(d?.feed) ? d.feed : null;
    if (document.hidden) { stale = true; if (feed && Sound.on) Fx.hear(feed); else if (!feed) listen(); return; }
    globalThis.PuddlePerf?.live('arrived');
    if (feed?.length && D) liveRows(feed);
    globalThis.PuddlePerf?.live('drawn');
    soon();
  });
}
function applyDemo() {
  document.body.classList.toggle('demo', !!state.demo);
  $('#demo-toggle')?.setAttribute('aria-checked', String(!!state.demo));
  $('#demo-btn')?.setAttribute('aria-pressed', String(!!state.demo));
  const h = document.querySelector('h2[data-learn="card:team"]');
  if (h) { h.dataset.name ??= h.textContent; h.textContent = state.demo ? 'Demo team' : h.dataset.name; }
}
applyDemo();
layout.ready.then(() => cards.watch());
connect();
addEventListener('puddle:online', () => load());
setInterval(() => { if (!document.hidden && !live) load(); }, 60_000);
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 120); });
load();
