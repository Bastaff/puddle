import { esc } from '/you.js';
import { hover, rows } from '/tips.js';

const DAY = 864e5;
const KIND = [['web', 'Web apps', 'var(--s1)'], ['ios', 'iOS apps', 'var(--s7)'], ['code', 'Code', 'var(--s3)']];
const nf = (n) => Math.round(n || 0).toLocaleString('en-US');
const big = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : nf(n));
const hours = (m) => (m >= 60 ? `${Math.round(m / 60)} h` : `${Math.round(m)} min`);
const short = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const bar = (x, y, w, h, fill, cls = 'cr-bar', d = 0) => {
  const r = Math.min(4, w / 2, h);
  return `<path class="${cls}" style="--d:${d}" d="M${x},${y + h}V${y + r}q0,${-r} ${r},${-r}H${x + w - r}q${r},0 ${r},${r}V${y + h}Z" fill="${fill}"/>`;
};

function dayList(r) {
  const off = r.tz * 6e4, end = Math.floor((r.to + off) / DAY);
  return Array.from({ length: 30 }, (_, i) => new Date((end - 29 + i) * DAY).toISOString().slice(0, 10));
}

const PICS = {
  climb(el, w, r) {
    const map = new Map(r.lines.days), days = dayList(r), H = 96;
    let acc = 0; const pts = days.map((d) => (acc += map.get(d) || 0));
    if (!acc) return '';
    const X = (i) => (i / (days.length - 1)) * w, Y = (v) => H - 6 - (v / acc) * (H - 16);
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    el.dataset.n = days.length;
    el.tip = (i) => `<b>${short(days[i])}</b>` + rows([['Lines added', nf(map.get(days[i]) || 0)], ['So far', nf(pts[i])]]);
    return `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}"><defs><linearGradient id="sh-ship" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--s3)" stop-opacity=".42"/><stop offset="1" stop-color="var(--s3)" stop-opacity="0"/></linearGradient></defs>
      <path d="${line}L${w},${H}L0,${H}Z" fill="url(#sh-ship)"/><path d="${line}" class="cr-shipline" pathLength="1"/><circle cx="${w - 7}" cy="${Y(acc) + 1}" r="6" class="cr-shipdot"/></svg>`;
  },
  hourBars(el, w, r) {
    const map = new Map(r.hours.days), days = dayList(r), H = 76, g = 2, bw = w / days.length;
    const mx = Math.max(1, ...days.map((d) => map.get(d) || 0));
    el.dataset.n = days.length;
    el.tip = (i) => `<b>${short(days[i])}</b>` + rows([['Agents worked', hours(map.get(days[i]) || 0)]]);
    return `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}">${days.map((d, i) => {
      const v = map.get(d) || 0, h = (v / mx) * (H - 2);
      return v ? bar(i * bw + g / 2, H - h, bw - g, h, d === r.hours.best[0] ? 'var(--s2)' : 'var(--s1)', 'cr-bar', i) : bar(i * bw + g / 2, H - 3, bw - g, 3, 'var(--ghost)', '', i);
    }).join('')}</svg>`;
  },
  squares(el, w, r) {
    const days = dayList(r), on = new Set(r.streak.days), cols = 10, gap = Math.max(3, Math.round(w / 60));
    const cell = Math.min(28, (w - gap * (cols - 1)) / cols), H = cell * 3 + gap * 2;
    let run = 0; for (let i = days.length - 1; i >= 0 && on.has(days[i]); i--) run++;
    const hot = new Set(run >= 2 ? days.slice(days.length - run) : []);
    el.dataset.cols = cols; el.dataset.cell = cell + gap;
    el.tip = (i) => days[i] && `<b>${short(days[i])}</b>` + rows([['Worked', on.has(days[i]) ? 'Yes' : 'No']]);
    return `<svg viewBox="0 0 ${cols * (cell + gap) - gap} ${H}" width="${cols * (cell + gap) - gap}" height="${H}">${days.map((d, i) => {
      const x = (i % cols) * (cell + gap), y = Math.floor(i / cols) * (cell + gap);
      return `<rect class="cr-sqc" style="--d:${i}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${Math.round(cell * 0.28)}" fill="${hot.has(d) ? 'var(--s2)' : on.has(d) ? 'var(--s1)' : 'var(--cal0)'}"/>`;
    }).join('')}</svg>`;
  },
  versus(el, w, r) {
    const H = 64, bw = Math.min(46, w / 3.4), usual = Math.max(5, (r.prompt.usual / r.prompt.longest) * H);
    return `<svg viewBox="0 0 ${bw * 2 + 14} ${H + 16}" width="${bw * 2 + 14}" height="${H + 16}">${bar(0, H - usual, bw, usual, 'var(--ghost)', 'cr-bar', 0)}${bar(bw + 14, 0, bw, H, 'var(--s2)', 'cr-bar', 4)}
      <text x="${bw / 2}" y="${H + 14}" text-anchor="middle" class="sh-lab">USUAL</text><text x="${bw * 1.5 + 14}" y="${H + 14}" text-anchor="middle" class="sh-lab">BEST</text></svg>`;
  },
  lanes(el, w, r) {
    const n = Math.min(5, r.together.peak), lh = n > 3 ? 12 : 16, g = 6, H = n * lh + (n - 1) * g;
    const at = [[0.02, 0.86], [0.18, 0.7], [0.34, 0.98], [0.1, 0.5], [0.46, 0.92]];
    return `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}">${Array.from({ length: n }, (_, i) => {
      const [a, b] = at[i];
      return `<rect class="sh-lane" style="--d:${i}" x="${a * w}" y="${i * (lh + g)}" width="${(b - a) * w}" height="${lh}" rx="${lh / 2}" fill="${i === n - 1 ? 'var(--s2)' : 'var(--s1)'}"/>`;
    }).join('')}</svg>`;
  },
  ring(el, w, r) {
    const p = Math.max(0, Math.min(1, r.hands.share)), c = 2 * Math.PI * 24;
    return `<svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="24" fill="none" stroke="var(--cal0)" stroke-width="12"/><circle class="sh-ring" cx="32" cy="32" r="24" fill="none" stroke="var(--s3)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(p * c).toFixed(1)} ${c.toFixed(1)}" style="--to:${(p * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>`;
  },
};

function tiles(r) {
  const out = [];
  if (r.lines?.added > 0) out.push({ id: 'lines', wide: true, title: 'Lines shipped', num: big(r.lines.added), line: r.lines.projects > 1 ? `added across ${r.lines.projects} projects` : 'lines added', pic: 'climb' });
  if (r.streak?.best >= 2) out.push({ id: 'streak', title: 'Best streak', num: r.streak.best, line: r.streak.current >= 2 && r.streak.current !== r.streak.best ? `days in a row, ${r.streak.current} now` : 'days in a row', pic: 'squares' });
  if (r.prompt?.longest > 1) out.push({ id: 'prompt', title: 'One prompt', num: nf(r.prompt.longest), line: `steps, usually ${Math.max(1, Math.round(r.prompt.usual))}`, pic: 'versus' });
  if (r.together?.peak >= 2) out.push({ id: 'together', title: 'At once', num: r.together.peak, line: `agents working, on ${short(r.together.day)}`, pic: 'lanes' });
  if (r.hands?.share > 0) out.push({ id: 'hands', title: 'Hands-off', num: `${(r.hands.share * 100).toFixed(r.hands.share >= 0.995 ? 1 : 0)}%`, line: 'of steps ran without asking', pic: 'ring' });
  if (r.hours?.minutes >= 60) out.push({ id: 'hours', wide: true, title: 'Agent hours', num: hours(r.hours.minutes), line: `best day ${short(r.hours.best[0])}, ${hours(r.hours.best[1])}`, pic: 'hourBars' });
  const kt = KIND.reduce((a, [k]) => a + (r.kinds?.[k] || 0), 0);
  if (kt > 0) {
    const parts = KIND.map(([k, l, c]) => ({ l, c, p: Math.round(((r.kinds[k] || 0) / kt) * 100) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
    out.push({ id: 'kinds', wide: true, title: 'What gets built', num: parts[0].l, line: `${parts[0].p}% of the agents' work`, html: `<div class="sh-kbar">${parts.map((x) => `<i class="cr-wide" style="flex:${x.p};background:${x.c}">${x.p >= 12 ? `<span>${x.p}%</span>` : ''}</i>`).join('')}</div><div class="cr-keys">${parts.map((x) => `<span><i style="background:${x.c}"></i>${esc(x.l)}</span>`).join('')}</div>` });
  }
  const half = out.filter((t) => !t.wide);
  if (half.length % 2) half.at(-1).wide = true;
  if (out.reduce((a, t) => a + (t.wide ? 2 : 1), 0) % 4 && out.at(-1).wide) out.at(-1).fill = true;
  return out;
}

export function mountShare(el, { api, stream }) {
  let data = null, seen = new Set(), last = 0;
  const draw = () => {
    for (const t of el.querySelectorAll('.sh-pic[data-pic]')) {
      const w = Math.floor(t.clientWidth);
      if (!w || t.dataset.w === String(w)) continue;
      t.dataset.w = w; t.innerHTML = PICS[t.dataset.pic](t, w, data);
      if (t.tip) hover(t, (e) => {
        const b = t.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
        const i = t.dataset.cols ? Math.floor(y / t.dataset.cell) * t.dataset.cols + Math.floor(x / t.dataset.cell) : Math.floor((x / b.width) * t.dataset.n);
        return t.tip(Math.max(0, i));
      });
    }
  };
  const render = (r) => {
    data = r;
    const list = tiles(r);
    if (!list.length) { el.innerHTML = '<p class="sh-empty">Nothing to show here yet.</p>'; el.removeAttribute('aria-busy'); return; }
    el.innerHTML = list.map((t, i) => `<section class="sh-t${t.wide ? ' wide' : ''}${t.fill ? ' fill' : ''}${seen.has(t.id) ? '' : ' cr-grow sh-new'}" style="--d:${i}" data-id="${t.id}">
      <h3>${esc(t.title)}</h3><b>${esc(t.num)}</b><small>${esc(t.line)}</small>${t.html || `<div class="sh-pic" data-pic="${t.pic}"></div>`}</section>`).join('');
    el.removeAttribute('aria-busy');
    draw();
    setTimeout(() => el.querySelectorAll('.cr-grow').forEach((n) => n.classList.remove('cr-grow', 'sh-new')), 1400);
    seen = new Set(list.map((t) => t.id));
  };
  const load = async () => {
    last = Date.now();
    try {
      const res = await fetch(`${api}?tz=${-new Date().getTimezoneOffset()}`);
      if (res.ok) render(await res.json());
      else if (!data) { el.innerHTML = '<p class="sh-empty">Nothing to show here yet.</p>'; el.removeAttribute('aria-busy'); }
    } catch {}
  };
  new ResizeObserver(() => data && draw()).observe(el);
  load();
  if (stream) { const es = new EventSource(stream); es.addEventListener('update', () => { if (Date.now() - last > 60_000) load(); }); }
  setInterval(() => { if (!document.hidden) load(); }, 5 * 60_000);
}
