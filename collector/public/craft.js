import { esc } from '/you.js';
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KIND = { ios: ['iOS app', 'var(--s7)'], web: ['Web', 'var(--s1)'], code: ['Code', 'var(--s3)'], chat: ['Chat', 'var(--axis)'] };
const LANG = { js: ['JavaScript', 'var(--s4)'], mjs: ['JavaScript', 'var(--s4)'], cjs: ['JavaScript', 'var(--s4)'], jsx: ['JavaScript', 'var(--s4)'], ts: ['TypeScript', 'var(--s1)'], tsx: ['TypeScript', 'var(--s1)'],
  md: ['Markdown', 'var(--axis)'], mdx: ['Markdown', 'var(--axis)'], html: ['HTML', 'var(--s2)'], css: ['CSS', 'var(--s5)'], scss: ['CSS', 'var(--s5)'], swift: ['Swift', 'var(--s7)'], kt: ['Kotlin', 'var(--s6)'],
  rs: ['Rust', 'var(--s8)'], go: ['Go', 'var(--s6)'], py: ['Python', 'var(--s3)'], rb: ['Ruby', 'var(--s8)'], sh: ['Shell', 'var(--k-think)'], sql: ['SQL', 'var(--s6)'], json: ['Data', 'var(--k-other)'],
  yaml: ['Data', 'var(--k-other)'], yml: ['Data', 'var(--k-other)'], toml: ['Data', 'var(--k-other)'], vue: ['Vue', 'var(--s3)'], svelte: ['Svelte', 'var(--s2)'], java: ['Java', 'var(--s8)'], dart: ['Dart', 'var(--s1)'] };
const G = 2;

const nf = (n) => Math.round(n || 0).toLocaleString();
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (m) => { m = Math.round(m || 0); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const short = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const sum = (a) => a.reduce((x, y) => x + y, 0);

const drawn = new WeakMap();
const resized = 'ResizeObserver' in globalThis ? new ResizeObserver((es) => {
  for (const e of es) { const d = drawn.get(e.target); if (d && (Math.abs(e.target.clientWidth - d.w) > 8 || Math.abs(e.target.clientHeight - d.h) > 8)) d.again(); }
}) : null;
const keep = (el, again) => { drawn.set(el, { w: el.clientWidth, h: el.clientHeight, again }); resized?.observe(el); };
const grown = new Set();
const anim = (card, id) => { if (grown.has(id)) return; grown.add(id); card.classList.add('cr-grow'); setTimeout(() => card.classList.remove('cr-grow'), 1400); };

const bar = (x, y, w, h, fill, extra = '') => {
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `<path d="M${x},${y + h}V${y + r}q0,${-r} ${r},${-r}H${x + w - r}q${r},0 ${r},${r}V${y + h}Z" fill="${fill}"${extra}/>`;
};
const stub = (x, y, w) => `<rect x="${x}" y="${y - 3}" width="${Math.max(1, w)}" height="3" rx="1.5" class="cr-none"/>`;

function dayList(win) {
  const out = [], d = new Date(win.from); d.setHours(0, 0, 0, 0);
  while (d.getTime() < win.to) { out.push(d.getTime()); d.setDate(d.getDate() + 1); }
  return out;
}
function buckets(win) {
  const days = dayList(win);
  if (days.length <= 31) return days.map((t) => ({ start: t, days: [key(new Date(t))], label: short(t) }));
  const out = [];
  for (const t of days) {
    const d = new Date(t), monday = (d.getDay() + 6) % 7 === 0;
    if (!out.length || monday) out.push({ start: t, days: [], label: short(t) });
    out.at(-1).days.push(key(d));
  }
  return out;
}
const ticks = (bs, X, w, y, W) => [0, Math.floor((bs.length - 1) / 2), bs.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i, n, a) => {
  const end = n === a.length - 1 && a.length > 1, start = n === 0;
  return `<text x="${start ? Math.max(14, X(i)) : end ? Math.min(W - 14, X(i) + w) : X(i) + w / 2}" y="${y}" class="cr-lab" text-anchor="${start ? 'start' : end ? 'end' : 'middle'}">${bs[i].label.toUpperCase()}</text>`;
}).join('');
const keys = (list) => `<div class="cr-keys">${list.map(([l, c, v]) => `<span><i style="background:${c}"></i>${esc(l)}${v != null ? ` <b>${esc(v)}</b>` : ''}</span>`).join('')}</div>`;
const shell = (id, title, period, big, line, body = '', foot = '', size = 'l') => `<section class="card cr cr-${id} cr-${size}" data-sz="${size}" data-learn="cr:${id}"><header><h2>${title}</h2>${size === 's' ? '' : `<span class="cr-per">${esc(period)}</span>`}</header>
  <p class="cr-big">${big}</p>${line ? `<p class="cr-line">${line}</p>` : ''}${body}${size === 'l' ? foot : ''}</section>`;
const none = (id, title, period, big, line, size) => shell(id, title, period, big, line, '<p class="cr-nodata">No data yet</p>', '', size).replace('<section class="card cr ', '<section data-none="1" class="card cr ');
const plotBox = (h, cls = '') => `<div class="cr-plot${cls ? ` ${cls}` : ''}" style="--ph:${h}px"></div>`;
const box = (card) => { const el = card?.querySelector('.cr-plot'); if (!el) return null; return { el, W: Math.max(120, el.clientWidth || 360), H: Math.max(40, el.clientHeight || 120) }; };
const paint = (b, h, svg, label) => { b.el.innerHTML = `<svg viewBox="0 0 ${b.W} ${h}" width="${b.W}" height="${h}" role="img" aria-label="${esc(label)}">${svg}</svg>`; };
const sz = (card) => card?.dataset.sz || 'l';
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : nf(n));
const hrs = (m) => (m >= 60 ? `${(m / 60).toFixed(m >= 600 ? 0 : 1).replace(/\.0$/, '')} h` : `${Math.round(m)} min`);
function ring(b, parts, label) {
  const s = Math.min(b.W - 24, b.H - 4, 132), sw = Math.max(12, s * 0.2), R = (s - sw) / 2, C = 2 * Math.PI * R, cx = b.W - 16 - s / 2, cy = b.H - s / 2 - 4, tot = Math.max(1e-9, sum(parts.map((p) => p[0])));
  let at = 0, out = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--cal0)" stroke-width="${sw}"/>`;
  for (const [v, c] of parts) { const len = (v / tot) * C; if (len > 1) out += `<circle class="cr-arc" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${Math.max(0.1, len - sw * 0.6)} ${C}" stroke-dashoffset="${-at - sw * 0.3}" transform="rotate(-90 ${cx} ${cy})"/>`; at += len; }
  paint(b, b.H, out, label);
}

const workDays = (data) => new Map((data.work?.days || []).map((d) => [d.day, d]));
const kindTotals = (data) => { const t = {}; for (const d of data.work?.days || []) for (const [k, v] of Object.entries(d.kinds || {})) t[k] = (t[k] || 0) + v; return t; };

const today = {
  html({ r, size }) {
    if (!r?.today) return none('today', 'Today', 'Since midnight', '0 min', 'no work yet today', size);
    const d = r.today.minutes - (r.today.usual || 0);
    if (size === 's') return shell('today', 'Today', '', hrs(r.today.minutes), !r.today.usual ? 'worked today' : Math.abs(d) < 5 ? 'about a usual day' : `${d > 0 ? '▲' : '▼'} ${hm(Math.abs(d))} on usual`, plotBox(40, 'bleed'), '', size);
    const pill = !r.today.usual ? '' : Math.abs(d) < 5 ? '<span class="cr-pill">≈ usual</span>' : d > 0 ? `<span class="cr-pill up">▲ ${hm(d)}</span>` : `<span class="cr-pill">▼ ${hm(-d)}</span>`;
    const line = !r.today.usual ? 'worked today' : Math.abs(d) < 5 ? 'about a usual day' : d > 0 ? 'more than a usual day' : 'less than a usual day';
    return shell('today', 'Today', 'Since midnight', `${hm(r.today.minutes)}${pill}`, line, plotBox(size === 'l' ? 130 : 40, size === 'm' ? 'bleed' : ''), keys([['Today', 'var(--s2)'], ['Usual day', 'var(--ghost)']]), size);
  },
  draw(card, ctx, opt) {
    const { r } = ctx, { hover, rows } = opt, b = box(card); if (!b) return;
    const small = sz(card) === 's', TOP = small ? 4 : 20, BOT = small ? 0 : 22;
    const byHour = r.today.byHour || [], typ = r.typicalDay || [], H = b.H - TOP - BOT, slot = b.W / 24, w = slot - G;
    const mx = Math.max(1, ...byHour, ...typ), y = (m) => TOP + H - (m / mx) * H;
    const now = new Date(r.now || Date.now()), nowH = now.getHours() + now.getMinutes() / 60;
    let out = '';
    for (let h = 0; h < 24; h++) {
      const u = typ[h] || 0, t = byHour[h] || 0, x = h * slot + G / 2;
      out += `<g data-h="${h}" class="cr-col"><rect x="${h * slot}" y="${TOP}" width="${slot}" height="${H}" fill="transparent"/>`;
      if (u > 0) out += bar(x, y(u), w, TOP + H - y(u), 'var(--ghost)');
      if (t > 0) out += bar(x, y(t), w, TOP + H - y(t), 'var(--s2)', ` class="cr-bar" style="--d:${h}"`);
      out += '</g>';
    }
    const nx = Math.min(b.W - 1, (nowH / 24) * b.W);
    out += `<line x1="${nx}" x2="${nx}" y1="${TOP - (small ? 0 : 4)}" y2="${TOP + H}" class="cr-nowline"/>`;
    if (!small) out += `<text x="${Math.min(b.W - 16, Math.max(16, nx))}" y="${TOP - 8}" text-anchor="middle" class="cr-lab b">NOW</text>` + [0, 6, 12, 18].map((h) => `<text x="${h ? h * slot : 14}" y="${TOP + H + 18}" class="cr-lab"${h ? ' text-anchor="middle"' : ''}>${hh(h)}</text>`).join('');
    paint(b, b.H, out, 'Today hour by hour, over a usual day');
    anim(card, 'today');
    if (hover) for (const g of b.el.querySelectorAll('[data-h]')) hover(g, () => { const h = +g.dataset.h; return `<b>${hh(h)}–${hh((h + 1) % 24)}</b>` + rows([['Today', hm(byHour[h] || 0), 'var(--s2)'], ['Usual day', hm(typ[h] || 0)]]); });
    keep(b.el, () => today.draw(card, ctx, opt));
  },
};

const agent = {
  html({ data, period, size }) {
    const ds = data.work?.days || [];
    const work = sum(ds.map((d) => d.working)), wait = sum(ds.map((d) => d.waiting)), peak = Math.max(0, ...ds.map((d) => d.peak || 0));
    if (!work) return none('agent', 'You and the agent', period, '0%', 'no agent work yet', size);
    const pct = `${Math.round((work / Math.max(1, work + wait)) * 100)}%`;
    if (size === 's') return shell('agent', 'You and the agent', period, pct, 'it worked, not waited', plotBox(40), '', size);
    return shell('agent', 'You and the agent', period, pct, 'of the time it worked, not waited on you', plotBox(size === 'l' ? 140 : 40, size === 'm' ? 'bleed' : ''),
      keys([['Working', 'var(--s1)', hm(work)], ['Waiting on you', 'var(--s2)', hm(wait)]]) + (peak > 1 ? `<p class="cr-note">Up to <b>${peak}</b> agents at once</p>` : ''), size);
  },
  draw(card, ctx, opt) {
    const { data, win } = ctx, { hover, rows } = opt, b = box(card); if (!b) return;
    if (sz(card) === 's') {
      const ds = data.work?.days || [], work = sum(ds.map((d) => d.working)), wait = sum(ds.map((d) => d.waiting));
      ring(b, [[work, 'var(--s1)'], [wait, 'var(--s2)']], 'Agent working and waiting on you');
      anim(card, 'agent');
      if (hover) hover(b.el, () => rows([['Working', hm(work), 'var(--s1)'], ['Waiting on you', hm(wait), 'var(--s2)']]));
      keep(b.el, () => agent.draw(card, ctx, opt));
      return;
    }
    const by = workDays(data), bs = buckets(win), cols = bs.map((x) => x.days.reduce((a, k) => { const d = by.get(k); return d ? { w: a.w + d.working, x: a.x + d.waiting } : a; }, { w: 0, x: 0 }));
    const H = b.H - 24, TOPPAD = 10, bw = b.W / bs.length, w = bw - G, mx = Math.max(60, ...cols.map((c) => c.w + c.x)) * (H / (H - TOPPAD)), X = (i) => i * bw + G / 2;
    let out = cols.map((c, i) => {
      const a = (c.w / mx) * H, x2 = (c.x / mx) * H;
      if (!a && !x2) return `<g data-i="${i}"><rect x="${i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>${stub(X(i), H, w)}</g>`;
      return `<g data-i="${i}" class="cr-bar" style="--d:${i}"><rect x="${i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>${x2 > 1 ? bar(X(i), H - a - x2, w, x2 + Math.min(4, a), 'var(--s2)') : ''}${a ? `<rect x="${X(i)}" y="${H - a}" width="${w}" height="${a}" fill="var(--s1)"${x2 > 1 ? '' : ` rx="${Math.min(4, w / 2)}"`}/>` : ''}</g>`;
    }).join('');
    out += ticks(bs, X, w, H + 18, b.W);
    paint(b, b.H, out, 'Agent working and waiting on you, per day');
    anim(card, 'agent');
    if (hover) for (const g of b.el.querySelectorAll('[data-i]')) hover(g, () => { const i = +g.dataset.i, c = cols[i]; return `<b>${bs[i].days.length > 1 ? `Week of ${bs[i].label}` : bs[i].label}</b>` + rows([['Working', hm(c.w), 'var(--s1)'], ['Waiting on you', hm(c.x), 'var(--s2)']]); });
    keep(b.el, () => agent.draw(card, ctx, opt));
  },
};

const built = {
  html({ data, period, size }) {
    const t = kindTotals(data), order = ['ios', 'web', 'code'].filter((k) => t[k]).sort((a, b) => t[b] - t[a]);
    if (!order.length) return none('built', 'What you built', period, '—', 'nothing built yet', size);
    const all = sum(order.map((k) => t[k])), pc = (k) => Math.round((t[k] / all) * 100), top = KIND[order[0]][0], line = `${pc(order[0])}% of your work`;
    const kbar = `<div class="cr-kbar">${order.map((k) => `<i class="cr-wide" style="flex:${t[k]};background:${KIND[k][1]}" title="${KIND[k][0]} ${pc(k)}%">${pc(k) >= 18 ? `<span>${pc(k)}%</span>` : ''}</i>`).join('')}</div>`;
    if (size === 's') return shell('built', 'What you built', period, top, line, kbar, '', size);
    if (size === 'm') return shell('built', 'What you built', period, top, line, kbar + keys(order.map((k) => [KIND[k][0], KIND[k][1], `${pc(k)}%`])), '', size);
    const a = data.work.actions || {};
    const what = { ios: [[a.ios?.checks, 'Simulator checks'], [a.ios?.builds, 'builds']], web: [[a.web?.checks, 'browser checks'], [a.web?.edits, 'edits']], code: [[a.code?.edits, 'edits'], [a.code?.commands, 'commands']] };
    const rowsHtml = order.map((k) => `<div class="cr-kr"><div class="cr-kh"><b>${KIND[k][0]}</b><span>${pc(k)}%</span></div><em><i style="width:${pc(k)}%;background:${KIND[k][1]}"></i></em><div class="cr-kf">${what[k].filter(([v]) => v).map(([v, l]) => `<span><b>${nf(v)}</b> ${l}</span>`).join('')}</div></div>`).join('');
    const lang = {};
    for (const d of data.work.days) for (const [e, v] of Object.entries(d.ext || {})) { const L = LANG[e]; if (L) lang[L[0]] = { c: L[1], v: (lang[L[0]]?.v || 0) + v }; }
    const lt = sum(Object.values(lang).map((x) => x.v)), ll = Object.entries(lang).sort((x, y) => y[1].v - x[1].v).filter(([, x]) => x.v / lt >= 0.04).slice(0, 5);
    const langs = ll.length ? `<p class="cr-sub">Languages</p><div class="cr-sbar">${ll.map(([n, x]) => `<i style="flex:${x.v};background:${x.c}" title="${esc(n)}">${x.v / lt >= 0.08 ? `<span>${Math.round((x.v / lt) * 100)}%</span>` : ''}</i>`).join('')}</div>${keys(ll.map(([n, x]) => [n, x.c]))}` : '';
    return shell('built', 'What you built', period, top, line, `<div class="cr-krs">${rowsHtml}</div>${langs}`, '', size);
  },
  draw(card) { anim(card, 'built'); },
};

const shipped = {
  total(data) { let n = 0; for (const p of data.codeLines || []) for (const d of p.days) n += d.added || 0; return n; },
  html({ data, period, size }) {
    const n = shipped.total(data); if (!n) return none('shipped', 'Shipped', period, '+0', 'lines added', size);
    const c = {}; for (const d of data.work?.days || []) for (const [k, v] of Object.entries(d.cmd || {})) c[k] = (c[k] || 0) + v;
    const nums = [[c.commit, 'commits'], [c.push, 'pushes'], [c.deploy, 'deploys']].filter(([v]) => v);
    return shell('shipped', 'Shipped', period, `+${size === 's' ? compact(n) : nf(n)}`, size === 's' ? 'lines added' : 'lines of code added', plotBox(size === 'l' ? 130 : 40, size === 'l' ? '' : 'bleed'),
      nums.length ? `<div class="cr-nums">${nums.slice(0, 3).map(([v, l]) => `<div><b>${nf(v)}</b><span>${l}</span></div>`).join('')}</div>` : '', size);
  },
  draw(card, ctx, opt) {
    const { data, win } = ctx, { hover, rows } = opt, b = box(card); if (!b) return;
    const small = sz(card) === 's', bleed = sz(card) !== 'l';
    const per = new Map(); for (const p of data.codeLines || []) for (const d of p.days) per.set(d.day, (per.get(d.day) || 0) + (d.added || 0));
    const days = dayList(win), vals = [0]; let run = 0;
    for (const t of days) { run += per.get(key(new Date(t))) || 0; vals.push(run); }
    const pad = bleed ? 0 : 10, H = b.H - (small ? 0 : 24), mx = Math.max(1, run), X = (i) => (i / days.length) * (b.W - pad * 2 - (bleed ? 8 : 0)) + pad, Y = (v) => H - (bleed ? 2 : 6) - (v / mx) * (H - 16);
    const pts = vals.map((v, i) => [X(i), Y(v)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
    const [ex, ey] = pts.at(-1), bs = days.map((t) => ({ label: short(t) }));
    const out = `<defs><linearGradient id="cr-ship" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--s3)" stop-opacity=".42"/><stop offset="1" stop-color="var(--s3)" stop-opacity="0"/></linearGradient></defs>
      <path d="${d} L${ex},${b.H} L${pts[0][0]},${b.H} Z" fill="url(#cr-ship)"/><path d="${d}" class="cr-shipline" pathLength="1"/><circle cx="${ex}" cy="${ey}" r="${small ? 5 : 7}" class="cr-shipdot"/>
      ${small ? '' : ticks(bs, (i) => X(i + 1), 0, H + 18, b.W)}<line class="cr-cross" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>`;
    paint(b, b.H, out, 'Lines of code added, running total');
    anim(card, 'shipped');
    const svg = b.el.querySelector('svg'), cross = svg.querySelector('.cr-cross');
    if (hover) hover(svg, (e) => {
      const r0 = svg.getBoundingClientRect(), i = Math.max(1, Math.min(days.length, Math.round(((e.clientX - r0.left - pad) / (b.W - pad * 2)) * days.length)));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      return `<b>${short(days[i - 1])}</b>` + rows([['Added that day', `+${nf(per.get(key(new Date(days[i - 1]))) || 0)}`, 'var(--s3)'], ['So far', `+${nf(vals[i])}`]]);
    });
    svg.addEventListener('mouseleave', () => cross.setAttribute('visibility', 'hidden'));
    keep(b.el, () => shipped.draw(card, ctx, opt));
  },
};

const squares = {
  html({ data, r, period, win, size }) {
    const by = workDays(data), daily = new Map((data.daily || []).map((x) => [x.day, x]));
    if (!by.size && !daily.size) return none('squares', 'Days', period, '0', 'days worked', size);
    const active = dayList(win).filter((t) => { const k = key(new Date(t)); return by.has(k) || (daily.get(k)?.prompts || daily.get(k)?.tools); }).length;
    const run = r?.streak?.current > 1 ? r.streak.current : 0;
    const line = size === 's' ? `${active === 1 ? 'day' : 'days'} worked${run ? ` · ${run} in a row` : ''}` : `days worked${run ? ` · ${run} in a row` : ''}`;
    return shell('squares', 'Days', period, nf(active), line, plotBox(40, 'cr-fit') + (size === 'm' && by.size ? keys(['ios', 'web', 'code'].map((k) => KIND[k])) : ''),
      by.size ? keys(['ios', 'web', 'code'].map((k) => KIND[k])) : '', size);
  },
  worked(data) {
    const by = workDays(data), daily = new Map((data.daily || []).map((x) => [x.day, x]));
    return { by, daily, size: (k) => { const w = by.get(k); return w ? sum(Object.values(w.kinds || {})) : (daily.get(k)?.tools || 0) + (daily.get(k)?.prompts || 0); } };
  },
  draw(card, ctx, opt) {
    return squares.drawFit(card, ctx, opt);
  },
  tip(k, by, daily, rows) {
    const w = by.get(k), dd = daily.get(k), name = new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (w) return `<b>${name}</b>` + rows([['Working', hm(w.working), 'var(--s1)'], ...['ios', 'web', 'code'].filter((x) => w.kinds[x]).map((x) => [KIND[x][0], `${Math.round((w.kinds[x] / sum(Object.values(w.kinds))) * 100)}%`, KIND[x][1]])]);
    return `<b>${name}</b>` + rows(dd ? [['Prompts', nf(dd.prompts)], ['Steps', nf(dd.tools)]] : [['Nothing', '']]);
  },
  drawFit(card, ctx, opt) {
    const { data, win } = ctx, { hover, rows } = opt, b = box(card); if (!b) return;
    const { by, daily, size } = squares.worked(data), days = dayList(win).map((t) => key(new Date(t))), n = days.length;
    const opts = [];
    for (let cols = 1; cols <= n; cols++) {
      const rws = Math.ceil(n / cols), gap = Math.max(3, Math.min(8, b.W / 40)), cell = Math.min(140, (b.W - (cols - 1) * gap) / cols, (b.H - (rws - 1) * gap) / rws);
      opts.push({ cell, cols, gap, rws });
    }
    const top = Math.max(...opts.map((o) => o.cell)), best = opts.filter((o) => o.cell >= top * 0.9).sort((a, b) => a.rws - b.rws || b.cell - a.cell)[0];
    const { cell, cols } = best, on = days.map((k) => size(k) > 0);
    const gx = cols > 1 ? Math.max(best.gap, Math.min(cell * 0.35, (b.W - cols * cell) / (cols - 1))) : 0, ox = Math.max(0, (b.W - cols * cell - (cols - 1) * gx) / 2), gap = best.gap;
    const rws = Math.ceil(n / cols), oy = b.H - rws * (cell + gap) + gap, max = Math.max(1, ...days.map(size));
    const out = days.map((k, i) => {
      const x = ox + (i % cols) * (cell + gx), y = oy + Math.floor(i / cols) * (cell + gap), rr = Math.round(cell * 0.28), w = by.get(k);
      if (!on[i]) return `<rect data-day="${k}" class="cr-sqc" style="--d:${i}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${rr}" fill="var(--cal0)"/>`;
      const side = Math.max(cell * 0.5, Math.sqrt(size(k) / max) * cell), o = (cell - side) / 2;
      let g = `<g data-day="${k}" class="cr-sqc" style="--d:${i}"><rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${rr}" fill="var(--cal0)"/>`;
      if (w) {
        g += `<clipPath id="crf${i}"><rect x="${x + o}" y="${y + o}" width="${side}" height="${side}" rx="${side * 0.28}"/></clipPath><g clip-path="url(#crf${i})">`;
        let yy = y + o + side; const tot = Math.max(1, sum(Object.values(w.kinds || {})));
        for (const kd of ['ios', 'web', 'code', 'chat']) { const v = w.kinds?.[kd] || 0; if (!v) continue; const h = (v / tot) * side; yy -= h; g += `<rect x="${x + o}" y="${yy}" width="${side}" height="${h + 0.5}" fill="${KIND[kd][1]}"/>`; }
        g += '</g>';
      } else g += `<rect x="${x + o}" y="${y + o}" width="${side}" height="${side}" rx="${side * 0.28}" fill="var(--s1)"/>`;
      return g + (i === n - 1 ? `<rect x="${x + 2}" y="${y + 2}" width="${cell - 4}" height="${cell - 4}" rx="${rr}" class="cr-now"/>` : '') + '</g>';
    }).join('');
    paint(b, b.H, out, 'Days worked');
    anim(card, 'squares');
    if (hover) for (const g of b.el.querySelectorAll('[data-day]')) hover(g, () => squares.tip(g.dataset.day, by, daily, rows));
    keep(b.el, () => squares.drawFit(card, ctx, opt));
  },
};

const leverage = {
  html({ p, data, period, size }) {
    if (p.toolsPerPrompt == null || (Array.isArray(data.daily) && !data.daily.length)) return none('leverage', 'Leverage', period, '0', 'steps per prompt', size);
    return shell('leverage', 'Leverage', period, p.toolsPerPrompt.toFixed(1), size === 's' ? 'steps per prompt' : 'agent steps for each prompt you wrote', plotBox(size === 'l' ? 120 : 40, size === 'l' ? '' : 'bleed'), '', size);
  },
  draw(card, ctx, opt) {
    const { data, win } = ctx, { hover, rows } = opt, b = box(card); if (!b) return;
    const small = sz(card) === 's';
    const daily = new Map((data.daily || []).map((x) => [x.day, x])), bs = buckets(win);
    const vals = bs.map((x) => { let t = 0, p = 0; for (const k of x.days) { const d = daily.get(k); if (d) { t += d.tools || 0; p += d.prompts || 0; } } return { v: p >= 3 ? t / p : 0, t, p }; });
    const TOP = small ? 4 : 18, H = b.H - TOP - (small ? 0 : 24), bw = b.W / bs.length, w = bw - G, X = (i) => i * bw + G / 2, mx = Math.max(1, ...vals.map((x) => x.v)), top = vals.findIndex((x) => x.v === mx);
    let out = vals.map((x, i) => `<g data-i="${i}"><rect x="${i * bw}" y="0" width="${bw}" height="${TOP + H}" fill="transparent"/>${x.v ? bar(X(i), TOP + H - (x.v / mx) * H, w, (x.v / mx) * H, i === top ? 'var(--s2)' : 'var(--s4)', ` class="cr-bar" style="--d:${i}"`) : stub(X(i), TOP + H, w)}</g>`).join('');
    if (!small && mx > 1 && top >= 0) out += `<text x="${Math.min(b.W - 12, Math.max(12, X(top) + w / 2))}" y="${TOP - 6}" text-anchor="middle" class="cr-lab b">${Math.round(mx)}</text>`;
    if (!small) out += ticks(bs, X, w, TOP + H + 18, b.W);
    paint(b, b.H, out, 'Agent steps per prompt, per day');
    anim(card, 'leverage');
    if (hover) for (const g of b.el.querySelectorAll('[data-i]')) hover(g, () => { const i = +g.dataset.i, x = vals[i]; return `<b>${bs[i].days.length > 1 ? `Week of ${bs[i].label}` : bs[i].label}</b>` + rows([['Steps per prompt', x.v ? x.v.toFixed(1) : '—', 'var(--s4)'], ['Prompts', nf(x.p)], ['Steps', nf(x.t)]]); });
    keep(b.el, () => leverage.draw(card, ctx, opt));
  },
};

const week = {
  html({ p, r, size }) {
    if (!r?.heat) return none('week', 'Your week', 'Usual week', '—', 'no usual week yet', size);
    const style = (p.profile?.facts || []).find((f) => f.key === 'style')?.text;
    const word = style ? style.split(' ')[0] : null;
    const peak = (r.peakHours || []).slice(0, 2).map(hh);
    const big = word ? esc(word[0].toUpperCase() + word.slice(1)) : peak[0] || '—';
    const line = peak.length ? `busiest at ${size === 's' ? peak[0] : peak.join(' and ')}` : '';
    return shell('week', 'Your week', 'Usual week', big, line, size === 'l' ? '<div class="cr-heat cr-fit"></div>' : plotBox(40, 'bleed'), '', size);
  },
  draw(card, ctx, opt) {
    if (sz(card) !== 'l') return week.drawDay(card, ctx, opt);
    const { r } = ctx, { hover, rows } = opt;
    const el = card?.querySelector('.cr-heat'); if (!el) return;
    const B = 8, step = 24 / B, blocks = r.heat.map((row) => Array.from({ length: B }, (_, b) => sum(row.slice(b * step, b * step + step))));
    const W = Math.max(200, el.clientWidth || 360), AH = Math.max(120, el.clientHeight || 220), LEFT = 52, PAD = 14, gap = 5;
    const ch = Math.max(14, Math.min(44, (AH - 22 - 6 * gap) / 7)), cw = Math.min((W - LEFT - PAD - (B - 1) * gap) / B, ch * 1.35);
    const mx = Math.max(1e-9, ...blocks.flat());
    const tone = (v) => (v <= 0.02 ? 'var(--cal0)' : v < 0.2 ? 'var(--seq1)' : v < 0.4 ? 'var(--seq2)' : v < 0.6 ? 'var(--seq3)' : v < 0.8 ? 'var(--seq4)' : 'var(--seq6)');
    const now = new Date(r.now || Date.now()), td = (now.getDay() + 6) % 7, tb = Math.floor(now.getHours() / step);
    let out = '';
    blocks.forEach((row, d) => {
      const y = d * (ch + gap);
      out += `<text x="${PAD}" y="${y + ch * 0.5 + 4}" class="cr-lab${d === td ? ' b' : ''}">${DAYS[d].toUpperCase()}</text>`;
      row.forEach((v, b) => { out += `<rect data-d="${d}" data-b="${b}" x="${LEFT + b * (cw + gap)}" y="${y}" width="${cw}" height="${ch}" rx="${Math.min(10, ch / 3.2)}" fill="${tone(v / mx)}" class="cr-sqc" style="--d:${d + b}"/>`; });
    });
    out += `<rect x="${LEFT + tb * (cw + gap) - 3}" y="${td * (ch + gap) - 3}" width="${cw + 6}" height="${ch + 6}" rx="${Math.min(12, ch / 3 + 2)}" class="cr-now"/>`;
    const H = 7 * (ch + gap) + 16;
    out += [0, 2, 4, 6].map((b) => `<text x="${LEFT + b * (cw + gap)}" y="${H - 2}" class="cr-lab">${hh(b * step)}</text>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="When you usually work, in three-hour blocks">${out}</svg>`;
    anim(card, 'week');
    if (hover) for (const c of el.querySelectorAll('rect[data-d]')) hover(c, () => { const d = +c.dataset.d, b = +c.dataset.b; return `<b>${DAYS[d]} ${hh(b * step)}–${hh((b + 1) * step % 24)}</b>` + rows([['Usually', blocks[d][b] >= 1 ? hm(blocks[d][b]) : 'a little or nothing']]); });
    keep(el, () => week.draw(card, ctx, opt));
  },
  drawDay(card, ctx, opt) {
    const { r } = ctx, { hover, rows } = opt, b = box(card); if (!b) return;
    const small = sz(card) === 's', typ = r.typicalDay || [], peaks = new Set((r.peakHours || []).slice(0, small ? 1 : 2));
    const TOP = 4, H = b.H - TOP - (small ? 0 : 22), slot = b.W / 24, w = slot - G, mx = Math.max(1e-9, ...typ);
    let out = '';
    for (let h = 0; h < 24; h++) {
      const v = typ[h] || 0, x = h * slot + G / 2, bh = (v / mx) * H;
      out += `<g data-h="${h}"><rect x="${h * slot}" y="0" width="${slot}" height="${TOP + H}" fill="transparent"/>${bh > 1 ? bar(x, TOP + H - bh, w, bh, peaks.has(h) ? 'var(--s2)' : 'var(--s1)', ` class="cr-bar" style="--d:${h}"`) : stub(x, TOP + H, w)}</g>`;
    }
    if (!small) out += [0, 6, 12, 18].map((h) => `<text x="${h ? h * slot : 14}" y="${TOP + H + 18}" class="cr-lab"${h ? ' text-anchor="middle"' : ''}>${hh(h)}</text>`).join('');
    paint(b, b.H, out, 'Your usual day, hour by hour');
    anim(card, 'week');
    if (hover) for (const g of b.el.querySelectorAll('[data-h]')) hover(g, () => { const h = +g.dataset.h; return `<b>${hh(h)}–${hh((h + 1) % 24)}</b>` + rows([['Usually', typ[h] >= 1 ? hm(typ[h]) : 'a little or nothing']]); });
    keep(b.el, () => week.drawDay(card, ctx, opt));
  },
};

const handsoff = {
  html({ p, period, size }) {
    if (p.autoApproved == null) return none('handsoff', 'Hands-off', period, '0%', 'no actions yet', size);
    const r = p.runs || {}, shortN = Math.max(0, (r.prompts || 0) - (r.long || 0) - (r.chat || 0)), tot = Math.max(1, r.prompts || 0);
    const big = `${(Math.floor(p.autoApproved * 1000) / 10).toFixed(1)}%`;
    if (size === 's') return shell('handsoff', 'Hands-off', period, big, 'ran without asking', plotBox(40), '', size);
    const segs = [['Questions', r.chat || 0, 'var(--ghost)', 'q'], ['Short tasks', shortN, 'var(--s1)', 's'], ['Long runs', r.long || 0, 'var(--s2)', 'l']].filter(([, n]) => n);
    const bar0 = r.prompts ? `<div class="cr-runs">${segs.map(([l, n, , c]) => { const pc = Math.round((n / tot) * 100); return `<i class="${c}" style="flex:${n}" data-label="${l}" data-n="${n}">${pc >= 12 ? `${pc}%` : ''}</i>`; }).join('')}</div>` : '';
    const note = [p.rejects ? `You stopped it <b>${nf(p.rejects)}</b> times` : '', r.longest ? `longest run <b>${nf(r.longest)}</b> steps` : ''].filter(Boolean).join(' · ');
    return shell('handsoff', 'Hands-off', period, big, 'of actions ran without asking you', bar0 + (size === 'm' && r.prompts ? keys(segs.map(([l, , c]) => [l, c])) : ''),
      (r.prompts ? keys(segs.map(([l, n, c]) => [l, c, nf(n)])) : '') + (note ? `<p class="cr-note">${note}</p>` : ''), size);
  },
  draw(card, ctx, opt) {
    const { p } = ctx, { hover, rows } = opt;
    if (sz(card) === 's') {
      const b = box(card); if (!b) return;
      ring(b, [[p.autoApproved, 'var(--s3)'], [1 - p.autoApproved, 'transparent']], 'Actions that ran without asking you');
      anim(card, 'handsoff');
      if (hover) hover(b.el, () => rows([['Ran without asking', `${(p.autoApproved * 100).toFixed(1)}%`, 'var(--s3)'], ['You stopped it', nf(p.rejects || 0)]]));
      keep(b.el, () => handsoff.draw(card, ctx, opt));
      return;
    }
    anim(card, 'handsoff');
    if (!hover) return;
    for (const s of card.querySelectorAll('.cr-runs i')) hover(s, () => `<b>${esc(s.dataset.label)}</b>` + rows([['Prompts', nf(s.dataset.n)], ['Share', `${Math.round((s.dataset.n / Math.max(1, p.runs?.prompts)) * 100)}%`]]));
  },
};

export const CARDS = { today, agent, built, shipped, squares, leverage, week, handsoff };

export const planPill = (plan) => {
  const a = plan?.agents?.find((x) => x.week_pct != null || x.five_pct != null || x.month_pct != null);
  if (!a || plan.stale) return '';
  const v = Math.max(a.five_pct ?? 0, a.week_pct ?? 0, a.month_pct ?? 0), R = 7, C = 2 * Math.PI * R;
  return `<span class="cr-plan${v >= 95 ? ' hot' : v >= 80 ? ' warm' : ''}" data-plan><svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="${R}" class="t"/><circle cx="9" cy="9" r="${R}" class="v" stroke-dasharray="${(v / 100) * C} ${C}" transform="rotate(-90 9 9)"/></svg>${Math.round(v)}%</span>`;
};
