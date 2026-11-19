import { CARDS } from '/craft.js';
import { hover, rows } from '/tips.js';
import { CAT, FLAG_IC } from '/person.js';

const DAY_MS = 10_000;
const SLOTS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s7)'];
const KINDS = ['read', 'edit', 'run', 'web', 'agent'];
const VERB = { read: 'Reading', edit: 'Editing', run: 'Running', web: 'Browsing', agent: 'Delegating' };
const TEAM = [
  { name: 'Noah Brooks', cc: 'US', ll: [-74.0, 40.7], tz: -5 },
  { name: 'Amara Okafor', cc: 'GB', ll: [-0.13, 51.5], tz: 0 },
  { name: 'Mateo García', cc: 'ES', ll: [-3.7, 40.4], tz: 1 },
  { name: 'Lena Fischer', cc: 'DE', ll: [13.4, 52.5], tz: 1 },
  { name: 'Priya Nair', cc: 'IN', ll: [77.6, 12.97], tz: 5.5 },
  { name: 'Yuki Tanaka', cc: 'JP', ll: [139.7, 35.7], tz: 9 },
];
const flag = (cc) => String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
const initials = (n) => n.split(' ').map((w) => w[0]).join('');
const hm = (m) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const icon = (k) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${CAT[k]?.ic || ''}</svg>`;
const MOON = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.4 10.4A6.1 6.1 0 0 1 5.6 2.6a6.2 6.2 0 1 0 7.8 7.8z"/></svg>';
const rand = ((s) => () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296))(11);

const people = TEAM.map((p, i) => ({ ...p, i, color: SLOTS[i], tasks: [rand(), 0.5 + rand(), rand() * 0.6],
  mix: Object.fromEntries(KINDS.map((k) => [k, 4 + Math.floor(rand() * 8)])), minutes: 0, kind: KINDS[i % KINDS.length], on: false, next: 0, limit: 20 + rand() * 40 }));
const working = (p, utcHour) => { const h = (utcHour + p.tz + 24) % 24; return h >= 9 && h < 18 && !(h >= 12.5 && h < 13.3); };
const events = [];
function stepTeam(utcHour, dtMin, now) {
  for (const p of people) {
    const on = working(p, utcHour);
    if (on && !p.on) { p.next = now + 9000 + rand() * 8000; events.push({ i: p.i, kind: p.kind, first: true }); }
    if (on) {
      if (now > p.next) { p.kind = KINDS[Math.floor(rand() * KINDS.length)]; p.next = now + 10000 + rand() * 8000; events.push({ i: p.i, kind: p.kind }); }
      p.minutes += dtMin; p.limit = Math.min(92, p.limit + dtMin * 0.01);
    }
    p.on = on;
  }
}
function buildRows(el) {
  el.innerHTML = people.map((p) => `<div class="brow body" data-i="${p.i}">
    <div class="who"><span class="now-ic"></span><div class="who-t"><div class="nm"><i class="pdot" style="background:${p.color}"></i>${p.name} <span class="fl">${flag(p.cc)}</span></div><div class="st"></div></div></div>
    <div class="mix-cell"><div class="wm">${KINDS.map((k) => `<i data-k="${k}" style="background:${CAT[k].c}"></i>`).join('')}</div><div class="wo-k"></div></div>
    <div class="vol-cell"><div class="vol"><i></i></div><span class="vt"><span class="tv"><b></b> <small class="unit">h</small></span></span></div>
    <div class="sty-cell"><span class="tb">${p.tasks.map((v, j) => `<i class="t${j}" style="--h:${Math.round(12 + (v / 1.6) * 88)}%"></i>`).join('')}</span><small class="ho">${p.tasks[2] > 0.4 ? 'Long tasks' : 'Short tasks'}</small></div>
    <div class="hl-cell"><span class="lrs"><span class="lr out"></span><span class="lr in"></span></span></div>
  </div>`).join('');
  return people.map((p) => { const r = el.children[p.i]; return { r, ic: r.querySelector('.now-ic'), st: r.querySelector('.st'), segs: [...r.querySelectorAll('.wm i')], top: r.querySelector('.wo-k'), bar: r.querySelector('.vol i'), time: r.querySelector('.tv b'), ring: r.querySelector('.lr.out'), was: null }; });
}
function paintRows(rows) {
  const maxM = Math.max(60, ...people.map((x) => x.minutes));
  for (const p of people) {
    const v = rows[p.i], state = p.on ? p.kind : 'away';
    if (v.was !== state) {
      v.was = state;
      v.r.className = `brow body ${p.on ? 'work' : 'away'}`; v.r.style.setProperty('--c', p.on ? CAT[p.kind].c : 'var(--muted)');
      v.ic.innerHTML = p.on ? icon(p.kind) : MOON; v.st.textContent = p.on ? VERB[p.kind] : 'Away';
    }
    const tot = KINDS.reduce((a, k) => a + p.mix[k], 0), top = [...KINDS].sort((a, b) => p.mix[b] - p.mix[a]).slice(0, 3);
    v.segs.forEach((s, j) => { s.style.flexGrow = p.mix[KINDS[j]].toFixed(2); });
    const words = top.map((k) => `<span style="--c:${CAT[k].c}">${icon(k)}${CAT[k].short} <b>${Math.round((p.mix[k] / tot) * 100)}%</b></span>`).join('');
    if (v.top._h !== words) { v.top._h = words; v.top.innerHTML = words; }
    v.bar.style.width = `${(p.minutes / maxM) * 100}%`; v.time.textContent = hm(p.minutes);
    const a = p.limit * 3.6; v.ring.style.setProperty('--g', `conic-gradient(var(--s1) 0 ${a}deg, var(--grid) ${a}deg 360deg)`);
  }
}

const M = () => (typeof Motion === 'undefined' ? null : Motion);
function bump(el, strength) {
  if (!M()?.any()) return;
  const k = M().impulse({ amplitude: strength, frequency: 3.2, decay: 11, duration: 420 });
  el.animate(k.map((v) => ({ transform: `scale(${1 + v})` })), { duration: 420, easing: 'linear', composite: 'add' });
}
function fly(box, src, dst, label, color, ic) {
  const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect(), B = box.getBoundingClientRect();
  const inView = (r) => r.width > 0 && r.bottom > 0 && r.top < innerHeight;
  if (!M()?.full() || !inView(a) || !inView(b)) return Promise.resolve(false);
  const tok = document.createElement('div'); tok.className = 'fx-token'; tok.style.setProperty('--c', color); tok.innerHTML = `<i>${ic}</i>${label}`;
  box.append(tok);
  bump(src, 0.05);
  const x0 = a.left + a.width / 2 - B.left, y0 = a.top + a.height / 2 - B.top, x1 = b.left + b.width / 2 - B.left, y1 = b.top + b.height / 2 - B.top;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const tr = tok.getBoundingClientRect(), mx = tr.width / 2 + 8, my = tr.height / 2 + 8;
  const clampX = (x) => Math.max(mx, Math.min(B.width - mx, x)), clampY = (y) => Math.max(my, Math.min(B.height - my, y));
  const a0 = [clampX(x0), clampY(y0)], a1 = [clampX(x1), clampY(y1)];
  const lift = Math.max(0, Math.min(60, 20 + dist * 0.12, Math.min(a0[1], a1[1]) - my));
  const path = M().arc(a0, a1, { lift }), last = path.length - 1;
  const frames = path.map(([x, y, tilt], i) => {
    const u = i / last, sc = u < 0.1 ? 0.85 + (u / 0.1) * 0.15 : 1 - Math.max(0, u - 0.88) * 0.8;
    return { transform: `translate(${clampX(x)}px,${clampY(y)}px) translate(-50%,-50%) rotate(${tilt}deg) scale(${sc})`, opacity: u < 0.08 ? u / 0.08 : 1 };
  });
  frames.push({ transform: `translate(${a1[0]}px,${a1[1]}px) translate(-50%,-50%) scale(1.03, .94)`, opacity: 0 });
  const anim = tok.animate(frames, { duration: Math.min(950, 520 + dist * 0.35), easing: 'linear' });
  return new Promise((r) => { anim.onfinish = anim.oncancel = () => { tok.remove(); r(true); }; });
}
function hit(g, color) {
  if (!M()?.any()) return;
  const dot = g.querySelector('circle:not(.halo)'), ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ring.setAttribute('r', dot.getAttribute('r')); ring.setAttribute('class', 'hit'); ring.style.stroke = color;
  g.prepend(ring);
  ring.animate([{ transform: 'scale(1)', opacity: 0.85 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 1050, easing: 'ease-out' }).onfinish = () => ring.remove();
  bump(dot, 0.18);
}
let flying = 0, lastFly = -1e9;
function flights(rows, now) {
  if (events.length > 3) events.splice(0, events.length - 3);
  if (!events.length || flying || now - lastFly < 2300) return;
  const e = events.shift(), p = people[e.i], v = rows[e.i], g = pins?.[e.i];
  if (!g) return;
  lastFly = now; flying++;
  const land = () => { flying--; p.mix[e.kind] += 5 + rand() * 7; hit(g, CAT[e.kind].c); };
  fly(v.r.closest('.sc-team'), v.ic, g.querySelector('circle:not(.halo)'), CAT[e.kind].short, CAT[e.kind].c, icon(e.kind)).then(land);
}

const n = (a, b) => a + Math.floor(rand() * (b - a + 1));
const FLAGS = [
  { kind: 'failures', level: 'warn', text: () => `${n(16, 28)}% of the agent's steps fail, mostly terminal commands` },
  { kind: 'stuck', level: 'warn', text: () => `Claude kept retrying the same failing step in ${n(4, 6)} prompts` },
  { kind: 'limit', level: 'warn', text: () => `Plan almost used up: ${n(88, 96)}%` },
  { kind: 'ratelimit', level: 'warn', text: () => `Claude had to slow down ${n(5, 11)} times` },
  { kind: 'friction', level: 'info', text: () => `Clicks “allow” about ${n(3, 5)} times per prompt` },
  { kind: 'context', level: 'info', text: () => `Conversations got so long Claude had to squeeze them ${n(3, 7)} times` },
];
let flagged = [], flagAt = [];
const planFlags = () => { flagAt = [0.32 + rand() * 0.2, ...(rand() < 0.45 ? [0.68 + rand() * 0.14] : [])]; };
planFlags();
function stepFlags(progress) {
  if (!flagAt.length || progress < flagAt[0]) return null;
  flagAt.shift();
  const free = people.filter((p) => p.on && !flagged.some((f) => f.i === p.i));
  if (!free.length) return null;
  const p = free[Math.floor(rand() * free.length)], kinds = new Set(flagged.map((f) => f.kind)), pool = FLAGS.filter((f) => !kinds.has(f.kind));
  const f = pool[Math.floor(rand() * pool.length)], item = { i: p.i, kind: f.kind, level: f.level, text: f.text() };
  flagged = [item, ...flagged].slice(0, 3);
  return item;
}
function paintFlags(box, fresh) {
  const warn = flagged.filter((f) => f.level === 'warn').length, chip = box.querySelector('.chip'), list = box.querySelector('.attention');
  chip.className = 'chip' + (warn ? ' warn' : flagged.length ? ' info' : ' ok');
  chip.textContent = flagged.length ? `${flagged.length}${warn ? ` · ${warn} urgent` : ''}` : '✓';
  list.innerHTML = flagged.length ? flagged.map((f, j) => `<li class="att ${f.level}${f.ack ? ' ack' : ''}" data-j="${j}">
      <span class="att-ic" aria-hidden="true">${FLAG_IC[f.kind] || '•'}</span><span class="att-t"><b>${people[f.i].name}</b> ${f.text}</span>
      <span class="att-fb">${f.ack ? '<button data-v="undo" title="Undo">✓ noted</button>' : '<button data-v="yes" title="Useful">✓</button><button data-v="no" title="Not an issue">✕</button>'}</span></li>`).join('')
    : '<li class="att-ok">✓ Nothing needs a look</li>';
  const li = fresh && list.querySelector('.att');
  if (li && M()?.any()) li.animate([{ opacity: 0, transform: 'translateY(-10px) scale(.97)' }, { opacity: 1, transform: 'none' }], M().ease('snappy'));
}
function wireFlags(box) {
  box.querySelector('.attention').addEventListener('click', (e) => {
    const b = e.target.closest('button'), li = e.target.closest('.att'); if (!b || !li) return;
    const f = flagged[+li.dataset.j]; if (!f) return;
    if (b.dataset.v === 'no') flagged.splice(+li.dataset.j, 1); else f.ack = b.dataset.v === 'yes';
    paintFlags(box, false);
  });
}

let pins = null;
async function drawMap(el) {
  if (!window.d3?.geoNaturalEarth1 || !window.topojson) return;
  const topo = await fetch('/vendor/countries-110m.json').then((r) => r.json()).catch(() => null); if (!topo) return;
  const fc = topojson.feature(topo, topo.objects.countries); fc.features = fc.features.filter((f) => f.id !== '010');
  const W = el.clientWidth || 600, H = el.clientHeight || 260, R = W < 420 ? 9 : 11;
  const proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'MultiPoint', coordinates: [[-125, 58], [150, 58], [-125, 0], [150, 0]] });
  const path = d3.geoPath(proj);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><g>${fc.features.map((f) => { const d = path(f); return d ? `<path class="land" d="${d}"/>` : ''; }).join('')}</g>
    ${people.map((p) => { const [x, y] = proj(p.ll); return `<g class="pin off" data-i="${p.i}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle class="halo" r="${R}" style="stroke:${p.color}"/><circle r="${R}" style="fill:${p.color}"/><text text-anchor="middle" dy="3">${initials(p.name)}</text></g>`; }).join('')}</svg>`;
  pins = [...el.querySelectorAll('.pin')];
}
const paintMap = () => { for (const g of pins || []) g.classList.toggle('off', !people[g.dataset.i].on); };

const TYPICAL = [0, 0, 0, 0, 0, 0, 0, 2, 14, 38, 46, 44, 22, 30, 48, 50, 42, 28, 12, 6, 10, 8, 2, 0];
const SHAPE = TYPICAL.map((u, h) => u * (0.75 + ((h * 7) % 5) / 10));
const day0 = new Date(); day0.setHours(0, 0, 0, 0);
let dayIndex = 0;
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const PROJECTS = [{ name: 'acme/web', w: 1 }, { name: 'acme/api', w: 0.6 }, { name: 'acme/mobile', w: 0.35 }];
const EXT = ['ts', 'tsx', 'css', 'swift', 'md'];
const sumOf = (a) => a.reduce((x, y) => x + y, 0);
function makeDay(t, f) {
  const wd = new Date(t).getDay(), weekend = wd === 0 || wd === 6, on = weekend ? 0.3 + rand() * 0.25 : 0.7 + rand() * 0.5;
  if (!on) return { day: dayKey(t), off: true };
  const working = sumOf(SHAPE) * on, prompts = Math.round(18 + on * 40 + rand() * 12), tools = Math.round(prompts * (9 + rand() * 7));
  return { day: dayKey(t), on, working, waiting: working * (0.25 + rand() * 0.2), peak: 1 + Math.floor(rand() * 3), prompts, tools, tokens: tools * 21_000,
    kinds: { web: Math.round(tools * (0.35 + rand() * 0.2)), code: Math.round(tools * (0.2 + rand() * 0.15)), ios: Math.round(tools * (0.1 + rand() * 0.15)), chat: Math.round(prompts * 0.2) },
    ext: Object.fromEntries(EXT.map((e, i) => [e, Math.round((5 - i) * (4 + rand() * 6))])),
    cmd: { commit: Math.round(on * (3 + rand() * 5)), push: Math.round(on * (1 + rand() * 3)), deploy: rand() < 0.35 ? 1 : 0 },
    lines: PROJECTS.map((p) => ({ added: Math.round((160 + rand() * 340) * p.w * on), removed: Math.round((40 + rand() * 140) * p.w * on) })), f };
}
const past = [];
for (let i = 13; i >= 1; i--) past.push(makeDay(day0.getTime() - i * 864e5));
const workDay = (t) => { let d = makeDay(t); for (let i = 1; d.off; i++) d = { ...makeDay(t + i * 864e5), day: dayKey(t) }; return d; };
let todayPlan = workDay(day0.getTime());
const HEAT = Array.from({ length: 7 }, (_, d) => TYPICAL.map((u) => (d >= 5 ? u * 0.15 : u * (0.8 + rand() * 0.4))));
const PEAKS = TYPICAL.map((u, h) => [u, h]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, h]) => h);

const scale = (d, k) => ({ ...d, working: d.working * k, waiting: d.waiting * k, prompts: d.prompts * k, tools: d.tools * k * ((x) => x * x * (3 - 2 * x))(Math.min(1, k * 3)), tokens: d.tokens * k,
  kinds: Object.fromEntries(Object.entries(d.kinds).map(([x, v]) => [x, Math.round(v * k)])), ext: Object.fromEntries(Object.entries(d.ext).map(([x, v]) => [x, Math.round(v * k)])),
  cmd: Object.fromEntries(Object.entries(d.cmd).map(([x, v]) => [x, Math.floor(v * k)])), lines: d.lines.map((l) => ({ added: Math.round(l.added * k), removed: Math.round(l.removed * k) })) });
const minutesBy = (nowHour) => SHAPE.map((u, h) => (h + 1 <= nowHour ? u : h < nowHour ? u * (nowHour - h) : 0));

function todayAt(progress) {
  const nowHour = progress * 24, byHour = minutesBy(nowHour);
  return { at: day0.getTime() + dayIndex * 864e5 + progress * 864e5, nowHour, byHour, minutes: sumOf(byHour), usual: sumOf(TYPICAL.map((u, h) => (h + 1 <= nowHour ? u : h < nowHour ? u * (nowHour - h) : 0))) };
}
function meContext(progress) {
  const { at, byHour, minutes, usual } = todayAt(progress);
  const share = minutes / Math.max(1, sumOf(SHAPE)), today = scale(todayPlan, share);
  const days = [...past.slice(-6), today], worked = days.filter((d) => !d.off && (d.prompts || d.tools));
  const { from, to } = globalThis.PuddleWhen?.window ? globalThis.PuddleWhen.window(7, at) : { from: day0.getTime() + (dayIndex - 6) * 864e5, to: day0.getTime() + (dayIndex + 1) * 864e5 };
  let streak = 0; for (let i = days.length - (today.prompts > 0 ? 1 : 2); i >= 0 && !days[i].off && days[i].prompts; i--) streak++;
  const prompts = sumOf(worked.map((d) => d.prompts)), tools = sumOf(worked.map((d) => d.tools));
  const data = {
    daily: worked.map(({ day, prompts: pr, tools: tl, tokens }) => ({ day, prompts: pr, tools: tl, tokens })),
    work: { days: worked.map(({ day, working, waiting, peak, kinds, ext, cmd }) => ({ day, working, waiting, peak, kinds, ext, cmd })) },
    codeLines: PROJECTS.map((p, j) => ({ name: p.name, days: worked.map((d) => ({ day: d.day, ...d.lines[j] })) })),
  };
  const p = { toolsPerPrompt: prompts ? tools / prompts : 0, autoApproved: 0.962, rejects: 4 + dayIndex % 5, runs: { prompts, long: Math.round(prompts * 0.18), chat: Math.round(prompts * 0.22), longest: 74 },
    profile: { facts: [{ key: 'style', text: 'Daytime builder' }] } };
  const r = { now: at, today: { minutes, usual, byHour }, typicalDay: TYPICAL, streak: { current: streak }, heat: HEAT, peakHours: PEAKS };
  return { data, p, r, win: { from, to }, period: 'Last 7 days' };
}

const ME = [['shipped', 's'], ['squares', 's'], ['leverage', 's'], ['handsoff', 's'], ['today', 'm'], ['agent', 'm'], ['built', 'm'], ['week', 'm']];
const LIVE = ['today', 'shipped', 'squares', 'leverage', 'agent', 'built', 'handsoff'];
const SLIDE = ['shipped', 'leverage', 'agent'];
const opt = { hover, rows };
const isNarrow = (grid) => parseInt(getComputedStyle(grid).getPropertyValue('--cols'), 10) < 4;
const cardOf = (html) => { const box = document.createElement('div'); box.innerHTML = html.trim(); return box.firstElementChild; };
const sizeOf = (id, size) => (narrow && (id === 'today' || id === 'built') ? 's' : size);
let narrow = null, lastStep = 0;
const frozen = {}, tween = {};
const NUM = /\d[\d,]*(?:\.\d+)?/g;
function lerpText(from, to, t) {
  const parts = (s) => s.split(/(<[^>]+>)/);
  const a = parts(from).filter((x, i) => i % 2 === 0).join('\u0000').match(NUM) || [], b = parts(to).filter((x, i) => i % 2 === 0).join('\u0000').match(NUM) || [];
  if (a.length !== b.length || !b.length) return to;
  let k = 0;
  return parts(to).map((seg, i) => (i % 2 ? seg : seg.replace(NUM, (m) => {
    const x = parseFloat(a[k].replace(/,/g, '')), y = parseFloat(m.replace(/,/g, '')), dec = (m.split('.')[1] || '').length; k++;
    const v = x + (y - x) * t;
    return m.includes(',') || Math.abs(v) >= 1000 && a[k - 1].includes(',') ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec);
  }))).join('');
}
function patch(card, fresh, id, now) {
  const want = [...fresh.children], have = [...card.children];
  if (want.length !== have.length || want.some((e, i) => e.tagName !== have[i].tagName || e.className !== have[i].className)) {
    const plot = card.querySelector('.cr-plot');
    card.replaceChildren(...want.map((e) => (e.classList.contains('cr-plot') && plot ? plot : e)));
    return;
  }
  want.forEach((e, i) => {
    const h = have[i];
    if (e.tagName === 'HEADER' || e.classList.contains('cr-plot')) return;
    if (e.classList.contains('cr-big') && tween[id]) {
      const t = Math.min(1, (now - tween[id].at) / 600), ease = 1 - (1 - t) ** 3;
      h.innerHTML = lerpText(tween[id].from, e.innerHTML, ease);
      if (t >= 1) delete tween[id];
      return;
    }
    if (h.innerHTML === e.innerHTML) return;
    const kids = [...e.children], cur = [...h.children], own = (x) => [...x.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('|');
    if (own(e) === own(h) && kids.length && kids.length === cur.length && kids.every((k, j) => k.tagName === cur[j].tagName)) kids.forEach((k, j) => { if (cur[j].getAttribute('style') !== k.getAttribute('style')) cur[j].setAttribute('style', k.getAttribute('style') || ''); if (cur[j].innerHTML !== k.innerHTML) cur[j].innerHTML = k.innerHTML; });
    else h.innerHTML = e.innerHTML;
  });
}
function drawMe(root, progress) {
  const grid = root.querySelector('.sc-me'); if (!grid) return;
  narrow = isNarrow(grid);
  const ctx = meContext(progress);
  grid.replaceChildren();
  for (const [id, size] of ME) {
    const card = cardOf(CARDS[id].html({ ...ctx, size: sizeOf(id, size) })); if (!card) continue;
    card.dataset.me = id; card.style.gridColumn = `span ${size === 's' ? 1 : 2}`;
    grid.append(card);
    CARDS[id].draw?.(card, ctx, opt);
  }
}
function stepMe(root, progress, now) {
  const grid = root.querySelector('.sc-me'); if (!grid) return;
  if (isNarrow(grid) !== narrow) { drawMe(root, progress); return; }
  if (now - lastStep < 33) return;
  lastStep = now;
  const ctx = meContext(progress);
  for (const id of LIVE) {
    const card = grid.querySelector(`[data-me="${id}"]`);
    if (!card || card.classList.contains('cr-grow') || frozen[id] > now) continue;
    const size = ME.find((x) => x[0] === id)[1], fresh = cardOf(CARDS[id].html({ ...ctx, size: sizeOf(id, size) }));
    if (!fresh) continue;
    patch(card, fresh, id, now);
    CARDS[id].draw?.(card, ctx, opt);
  }
}
function turnDay(root, now) {
  const grid = root.querySelector('.sc-me'); if (!grid) return;
  for (const card of grid.children) { const big = card.querySelector('.cr-big'); if (big) tween[card.dataset.me] = { from: big.innerHTML, at: now }; }
  for (const id of SLIDE) {
    const plot = grid.querySelector(`[data-me="${id}"] .cr-plot`); if (!plot) continue;
    plot.animate([{ transform: `translateX(${plot.clientWidth / 7}px)` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
  const bars = [...grid.querySelectorAll('[data-me="today"] .cr-plot .cr-bar')];
  if (bars.length) {
    frozen.today = now + 500;
    for (const b of bars) { b.style.transformBox = 'fill-box'; b.style.transformOrigin = '50% 100%'; b.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: 480, easing: 'cubic-bezier(.5, 0, .7, .4)', fill: 'forwards' }); }
  }
}
function endDay() {
  past.push(todayPlan); past.shift();
  todayPlan = workDay(day0.getTime() + (dayIndex + 1) * 864e5);
  for (const p of people) p.minutes *= 0.4;
  planFlags();
  dayIndex++;
}

export async function mountShowcase(root) {
  const rows = buildRows(root.querySelector('.sc-rows')), issues = root.querySelector('.sc-issues');
  wireFlags(issues); paintFlags(issues, false);
  await drawMap(root.querySelector('.sc-map'));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let h = 0; h <= 14.5; h += 0.25) stepTeam(h, 15, 0);
    events.length = 0; stepFlags(1); stepFlags(1); paintFlags(issues, false); paintRows(rows); paintMap(); drawMe(root, 0.65); return;
  }
  let t0 = performance.now(), last = t0, raf = 0, inView = false, lastRows = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last); last = now;
    let progress = (now - t0) / DAY_MS;
    if (progress >= 1) { endDay(); t0 = now; progress = 0; turnDay(root, now); }
    stepTeam(progress * 24, (dt / DAY_MS) * 24 * 60, now);
    if (now - lastRows > 200) { lastRows = now; paintRows(rows); paintMap(); }
    flights(rows, now);
    if (stepFlags(progress)) paintFlags(issues, true);
    stepMe(root, progress, now);
  };
  const run = () => {
    const on = inView && !document.hidden;
    if (on && !raf) { const now = performance.now(); t0 += now - last; last = now; raf = requestAnimationFrame(frame); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver((es) => { inView = es.some((e) => e.isIntersecting); run(); }, { rootMargin: '100px' }).observe(root);
  document.addEventListener('visibilitychange', run);
  paintRows(rows); paintMap(); drawMe(root, 0);
}
export const scene = { KINDS, working, people, stepTeam, buildRows, paintRows, drawMap, paintMap, meContext, paintFlags, flag: (list) => { flagged = list; } };
const root = document.querySelector('.showcase'); if (root) mountShowcase(root);
