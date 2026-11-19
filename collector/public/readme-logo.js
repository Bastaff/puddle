import { planPill } from '/craft.js';

const LOOP = 6000;
const root = document.querySelector('.banner');
const $ = (s) => root.querySelector(s);
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const env = (u) => (u < 0.7 ? smooth(u / 0.7) : u < 0.85 ? 1 : 1 - smooth((u - 0.85) / 0.15));
const hm = (m) => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

const TYP = [0, 0, 0, 0, 0, 0, 0, 2, 14, 38, 46, 44, 22, 30, 48, 50, 42, 28, 12, 6, 10, 8, 2, 0];
const TODAY = TYP.map((v, h) => v * (0.8 + ((h * 7) % 5) / 9));
const MAX = Math.max(...TODAY, ...TYP);
const LEV = [11.2, 9.4, 8.6, 8.6, 9.1, 13.1, 10.2];
const SHIP = [0, 240, 310, 520, 760, 820, 1190, 1460, 1610, 2050, 2380, 2600, 3120, 3819];

$('.today .bars').innerHTML = TYP.map((v) => `<i><s style="height:${((v / MAX) * 100).toFixed(1)}%"></s><em></em></i>`).join('');
$('.days .sq').innerHTML = Array.from({ length: 7 }, () => '<i><span></span></i>').join('');
$('.lev .bars').innerHTML = LEV.map((v) => `<i${v === Math.max(...LEV) ? ' class="top"' : ''}></i>`).join('');
const bars = [...root.querySelectorAll('.today .bars em')], squares = [...root.querySelectorAll('.days .sq span')], lev = [...root.querySelectorAll('.lev .bars i')];
const arc = $('.ring .arc'), C = 2 * Math.PI * 38;

function shipPath(e) {
  const n = SHIP.length - 1, end = e * n, top = SHIP[n], pts = [];
  for (let i = 0; i <= Math.floor(end); i++) pts.push([(i / n) * 100, SHIP[i]]);
  if (end % 1 && end < n) { const i = Math.floor(end), f = end - i; pts.push([(end / n) * 100, SHIP[i] + (SHIP[i + 1] - SHIP[i]) * f]); }
  const xy = pts.map(([x, v]) => [x, 38 - (v / top) * 34]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return { d, area: xy.length > 1 ? `${d} L${xy.at(-1)[0].toFixed(2)} 40 L0 40 Z` : '', last: pts.at(-1)[1] };
}

globalThis.logoAt = (u) => {
  const e = env(u);
  for (const el of root.querySelectorAll('[data-ph]')) el.style.transform = `translateY(${(Math.sin(2 * Math.PI * (u + Number(el.dataset.ph))) * 5).toFixed(2)}px)`;
  let mins = 0;
  bars.forEach((b, h) => { const f = clamp(e * 24 - h); mins += TODAY[h] * f; b.style.height = `${((TODAY[h] / MAX) * 100 * f).toFixed(2)}%`; });
  $('[data-n="today"]').textContent = hm(mins);
  squares.forEach((s, i) => { const f = smooth(e * 7 - i); s.style.transform = `scale(${(0.35 + 0.65 * f).toFixed(3)})`; s.style.opacity = f.toFixed(3); });
  arc.setAttribute('stroke-dasharray', `${(0.962 * e * C).toFixed(2)} ${C}`);
  arc.style.opacity = e > 0.01 ? 1 : 0;
  $('[data-n="hands"]').textContent = `${(96.2 * e).toFixed(0)}%`;
  const sp = shipPath(e);
  $('.ship .line').setAttribute('d', sp.d); $('.ship .area').setAttribute('d', sp.area);
  $('[data-n="ship"]').textContent = `+${Math.round(sp.last).toLocaleString('en-US')}`;
  lev.forEach((b, i) => { b.style.height = `${((LEV[i] / 13.1) * 100 * smooth(e * 7 - i)).toFixed(2)}%`; });
  $('[data-n="lev"]').textContent = (11.2 * e).toFixed(1);
  $('.plan .pill').innerHTML = planPill({ agents: [{ week_pct: Math.round(64 * e) }] });
};

if (new URLSearchParams(location.search).has('shot')) {
  globalThis.logoAt(0);
  document.body.dataset.ready = '1';
} else {
  const frame = (t) => { requestAnimationFrame(frame); globalThis.logoAt((t % LOOP) / LOOP); };
  requestAnimationFrame(frame);
}
