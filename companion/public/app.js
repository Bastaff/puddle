const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TOOL = new Proxy({}, { get: (_, id) => globalThis.PuddleAgents.agent(id).short });
const LOOSE = new Set(['scratch', 'home', 'chats']);

const params = new URLSearchParams(location.search);
const MODE = params.has('app') ? 'app' : 'web';
const DASHBOARD = 'http://127.0.0.1:4500/';
const logo = (size) => `<img class="mark" src="/brand/icon.svg" width="${size}" height="${size}" alt="">`;
const LOGO = logo(12);
const native = (cmd) => { if (MODE !== 'web') location.href = '/__joule/' + cmd; };
document.body.classList.add('mode-' + MODE);
if (MODE !== 'web') document.addEventListener('contextmenu', (e) => e.preventDefault());

const state = { scan: null, invite: null, simInvite: false, track: {}, team: {}, step: 'scan', teamRows: null, nudged: new Set() };

const clock = (min) => { min = Math.round(min); return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; };
const n = (x) => (x >= 1e4 ? Math.round(x / 1e3) + 'k' : x.toLocaleString());
const sum = (list, k) => list.reduce((a, s) => a + s[k], 0);
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const onDay = (list, key) => list.reduce((a, s) => a + (s.byDay[key] || 0), 0);
const short2 = (p) => (p.type === 'owner' ? p.label.split('/').slice(1).join('/') : p.label.split('/').pop());

async function load(fresh) {
  state.scan = await (await fetch('/api/scan' + (fresh ? '?fresh' : ''))).json();
  const saved = await (await fetch('/api/choices')).json();
  for (const a of state.scan.accounts) state.track[a.key] = true;
  if (saved.savedAt) Object.assign(state, { team: saved.team || {}, simInvite: !!saved.simInvite, solo: !!saved.solo });
  $('#sim-invite').checked = state.simInvite;
  await loadInvite();
  return !!saved.savedAt;
}
async function loadInvite() {
  state.invite = await (await fetch('/api/invite' + (state.simInvite ? '?sim' : ''))).json().catch(() => null);
  state.teamRows = null;
}
const save = () => fetch('/api/choices', { method: 'POST', headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify({ track: state.track, team: state.invite ? state.team : {}, simInvite: state.simInvite, solo: !!state.solo, team_name: state.invite?.team || null }) });

const tracked = () => state.scan.sessions.filter((s) => state.track[s.account]);
const coveredBy = (placeKey, accounts) => { const own = state.scan.sessions.filter((s) => s.place === placeKey); return own.length > 0 && own.every((s) => accounts[s.account]); };

const icon = (tool) => { const a = globalThis.PuddleAgents.agent(tool); return `<span class="ico ${a.ico}">${a.letter}</span>`; };
const folderIcon = `<span class="ico place"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M3 7.2C3 6 4 5 5.2 5h3.6c.6 0 1.1.2 1.5.6L11.6 7h7.2C20 7 21 8 21 9.2v8.6c0 1.2-1 2.2-2.2 2.2H5.2C4 20 3 19 3 17.8z" opacity=".4"/><path d="M3 10.2C3 9 4 8 5.2 8h13.6C20 8 21 9 21 10.2v7.6c0 1.2-1 2.2-2.2 2.2H5.2C4 20 3 19 3 17.8z"/></svg></span>`;

const pick = ({ key, on, ico, title, sub, multi = true }) => `
  <button type="button" class="pick${on ? ' on' : ''}${multi ? '' : ' radio'}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${on}" data-key="${esc(key)}">
    ${ico}<span class="txt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="tick" aria-hidden="true"></span>
  </button>`;

function screen({ q, hint = '', body, next = 'Continue', back = true, nextDisabled = false }) {
  $('#app').innerHTML = `<section class="screen">
    <h1>${q}</h1>${hint ? `<p class="hint">${hint}</p>` : ''}
    <div class="list">${body}</div>
    <div class="go">${back ? '<button class="ghost" id="back" type="button" aria-label="Back">‹</button>' : ''}${next ? `<button class="next" id="next" type="button" ${nextDisabled ? 'disabled' : ''}>${next}</button>` : ''}</div>
  </section>`;
  $('#back')?.addEventListener('click', () => go(prev(state.step)));
}

const FLOW = () => ['scan', ...(state.invite ? ['team'] : []), 'done'];
const prev = (s) => FLOW()[Math.max(0, FLOW().indexOf(s) - 1)];
const after = (s) => FLOW()[FLOW().indexOf(s) + 1];

function go(step) {
  if (!state.scan && step !== 'scan') return;
  state.step = step;
  document.querySelector('.cheer')?.remove(); document.body.classList.remove('celebrate');
  const f = FLOW(), i = f.indexOf(step);
  $('#steps').hidden = step === 'menubar';
  $('#steps').innerHTML = f.map((_, j) => `<li class="${j <= i ? 'done' : ''}"></li>`).join('');
  ({ scan: scanning, team, done, menubar })[step]();
  window.scrollTo({ top: 0 });
}

function wayOn(failed) {
  $('#app .screen').insertAdjacentHTML('beforeend', `<div class="go">${failed ? '<button class="next" id="retry" type="button">Try again</button>' : '<button class="next" id="to-me" type="button">Open Me</button>'}</div>
    ${failed ? '<button class="linkish" id="to-me" type="button">Open Me</button>' : ''}`);
  $('#retry')?.addEventListener('click', () => scanning(true));
  $('#to-me').onclick = async () => { await save().catch(() => {}); if (MODE === 'app') native('onboarding_done'); else location.href = `http://127.0.0.1:${Number(location.port) + 1}/`; };
}

async function scanning(fresh = false) {
  $('#steps').innerHTML = '<li class="done"></li>';
  $('#app').innerHTML = `<section class="screen center">
    <div class="radar" aria-hidden="true"><i></i><i></i><i></i><div class="found" id="found"></div></div>
    <h1 id="scan-title">Looking for agents</h1>
    <p class="hint" id="scan-hint">Settings only. Never what you typed.</p>
  </section>`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  let saved;
  try { [saved] = await Promise.all([state.scan && !fresh ? null : load(fresh), wait(1400)]); }
  catch (e) { $('#scan-title').textContent = "Couldn't look around"; $('#scan-hint').textContent = e.message; wayOn(true); return; }
  if (saved) return state.invite?.real ? go('team') : MODE === 'app' ? settingsScreen() : go('menubar');
  const found = [...new Set(state.scan.accounts.map((a) => a.tool))];
  for (const t of found) { $('#found').insertAdjacentHTML('beforeend', icon(t)); await wait(320); }
  $('.radar').classList.add('done');
  $('#scan-title').textContent = found.length ? `Found ${found.length}` : 'No agents yet';
  $('#scan-hint').textContent = found.length ? found.map((t) => TOOL[t]).join(' · ') : 'Install Claude Code or Codex. Puddle will notice.';
  if (!found.length) return wayOn(false);
  await wait(900);
  if (state.step === 'scan') { await save(); go(after('scan')); }
}

function teamRows() {
  if (state.teamRows) return state.teamRows;
  const inv = state.invite, s = state.scan;
  for (const k of [...inv.accounts, ...inv.places]) if (state.team[k] === undefined) state.team[k] = true;
  const pre = Object.fromEntries(inv.accounts.map((k) => [k, true]));
  const accounts = s.accounts.filter((a) => a.kind === 'work' || inv.accounts.includes(a.key));
  const places = s.places.filter((p) => !LOOSE.has(p.type) && !coveredBy(p.key, pre));
  return (state.teamRows = { accounts, places });
}

function team() {
  const inv = state.invite;
  for (const a of state.scan.accounts) state.team[a.key] = true;
  const rows = realAccounts().map((a) => `<div class="srow acct">${icon(a.tool)}<span><b>${TOOL[a.tool]}</b><small>${esc(a.org || a.plan || 'account')}</small></span></div>`);
  screen({ q: `Join ${esc(inv.team)}?`, hint: `${esc(inv.team)} sees all your Claude Code and Codex work on this Mac, your earlier work included. Time and counts only. Never your words.`,
    body: rows.join('') || '<p class="foot">Nothing yet. Your work shows up as soon as you use Claude Code or Codex.</p>',
    next: inv.real ? `Join ${esc(inv.team)}` : 'Continue', back: false });
  $('#app .screen').insertAdjacentHTML('beforeend', '<button class="linkish" id="decline" type="button">Not now</button>');
  $('#decline').onclick = async () => { if (inv.real) await fetch('/api/invite/decline', { method: 'POST', headers: { 'x-puddle': '1' } }).catch(() => {}); state.invite = null; state.team = {}; await save(); go('done'); };
  $('#next').onclick = async (e) => {
    if (state.invite?.real) {
      e.target.disabled = true; e.target.textContent = 'Joining…';
      const r = await fetch('/api/team/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify({ code: state.invite.code, team: state.team }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { e.target.disabled = false; e.target.textContent = 'Try again'; $('.hint').textContent = d.error || 'Could not join right now.'; $('.hint').style.color = 'var(--s2)'; return; }
      state.joined = d;
      await save();
    }
    go(after('team'));
  };
}

function streak(list) {
  const days = [...new Set(list.flatMap((s) => Object.keys(s.byDay)))].sort().map((d) => Date.parse(d) / 864e5);
  let best = 0, run = 0; for (let i = 0; i < days.length; i++) { run = i && days[i] - days[i - 1] === 1 ? run + 1 : 1; best = Math.max(best, run); }
  return best;
}

const SHARE_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M8 11H6.5A2.5 2.5 0 0 0 4 13.5v5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-5a2.5 2.5 0 0 0-2.5-2.5H16"/></svg>';
const BIG = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
const words = (x) => { for (const [v, w] of BIG) if (x >= v) return [(x / v).toFixed(x / v < 10 ? 1 : 0).replace(/\.0$/, ''), w]; return [String(Math.round(x)), '']; };
const SCALE = [[90000, 'novel', 'novels'], [300, 'page', 'pages']];
function picture(tokens) {
  const w = tokens * 0.75;
  for (const [per, one, many] of SCALE) if (w >= per) { const x = w / per, k = x < 100 ? Math.round(x) : Number(x.toPrecision(2)); return `≈ ${k.toLocaleString()} ${k === 1 ? one : many}’ worth of words`; }
  return '';
}
const hourName = (h) => `${String(h).padStart(2, '0')}:00`;
const NIGHT = new Set(['Night owl', 'Evening hacker']);
const rnd = (i) => { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };
const BOOK = ['var(--s1)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s7)', 'var(--s2)', 'var(--s6)'];
const shelf = () => `<div class="shelf">${Array.from({ length: 24 }, (_, i) =>
  `<i${i % 9 === 7 ? ' class="lean"' : ''} style="--h:${(55 + rnd(i) * 45).toFixed(0)}%;--c:${BOOK[(i * 3) % BOOK.length]};--d:${(0.15 + i * 0.035).toFixed(2)}s"></i>`).join('')}</div>`;
function dial(by, peak, night) {
  const max = Math.max(...by, 1);
  const spokes = by.map((v, h) => {
    const a = (h / 24) * 2 * Math.PI + Math.PI / 2, r0 = 34, r1 = r0 + 4 + (v / max) * 34, c = Math.cos(a), si = Math.sin(a);
    return `<line pathLength="1" x1="${(75 + r0 * c).toFixed(1)}" y1="${(75 + r0 * si).toFixed(1)}" x2="${(75 + r1 * c).toFixed(1)}" y2="${(75 + r1 * si).toFixed(1)}" style="--d:${(0.2 + h * 0.025).toFixed(3)}s"${h === peak ? ' class="peak"' : ''}/>`;
  }).join('');
  const orb = night ? '<path class="orb moon" d="M80 62a14 14 0 1 0 8 22 11 11 0 0 1-8-22z"/>'
    : `<g class="orb"><circle class="sun" cx="75" cy="75" r="10"/>${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line class="sun-ray" x1="${(75 + 14 * Math.cos(a)).toFixed(1)}" y1="${(75 + 14 * Math.sin(a)).toFixed(1)}" x2="${(75 + 19 * Math.cos(a)).toFixed(1)}" y2="${(75 + 19 * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g>`;
  return `<svg class="dial${night ? ' night' : ''}" viewBox="0 0 150 150" aria-hidden="true"><circle class="face" cx="75" cy="75" r="28"/>${spokes}${orb}</svg>`;
}
const daysGrid = (last) => { const max = Math.max(...last, 1);
  return `<div class="days">${last.map((v, i) => `<i class="${v ? 'on' : ''}${i === last.length - 1 ? ' today' : ''}" style="--o:${(55 + (v / max) * 45).toFixed(0)}%;--d:${(0.15 + i * 0.03).toFixed(2)}s"></i>`).join('')}</div>`; };
const bars = (last) => { const max = Math.max(...last, 1), top = last.indexOf(max);
  return `<div class="bars">${last.map((v, i) => `<i class="${i === top ? 'top' : ''}" style="--h:${((v / max) * 100).toFixed(0)}%;--d:${(0.15 + i * 0.025).toFixed(2)}s"></i>`).join('')}</div>`; };
function revealCards(h) {
  const cards = [], last = h.last28 || [];
  if (h.tokens > 0) { const [v, w] = words(h.tokens); cards.push({ lbl: 'Through your agents', to: Number(v), dec: v.includes('.') ? 1 : 0, u: w ? `${w} tokens` : 'tokens', vis: shelf(), cap: picture(h.tokens) }); }
  if (h.persona) cards.push({ lbl: 'You’re a', word: h.persona, side: dial(h.byHour || Array(24).fill(0), h.peakHour, NIGHT.has(h.persona)), cap: `Busiest around ${hourName(h.peakHour)}` });
  if (h.streak?.current >= 2) cards.push({ lbl: 'On a roll', to: h.streak.current, u: 'days in a row', vis: last.length ? daysGrid(last.slice(-28)) : '', cap: h.streak.current >= h.streak.best ? 'Your longest streak yet, and counting' : `Your best: ${h.streak.best} days` });
  else if (h.bestDay?.prompts) cards.push({ lbl: 'Your biggest day', to: h.bestDay.prompts, u: 'prompts', vis: last.length ? bars(last) : '', cap: new Date(h.bestDay.day + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) });
  return cards;
}
const revealCard = (c) => `<div class="stage${c.word ? ' word' : ''}"><div class="lbl">${esc(c.lbl)}</div>
  ${c.word ? `<div class="big">${esc(c.word)}</div>${c.side}` : `<div class="big num"><span data-to="${c.to}" data-dec="${c.dec || 0}">0</span>${c.u ? `<small>${esc(c.u)}</small>` : ''}</div><div class="vis">${c.vis || ''}</div>`}
  <div class="cap">${esc(c.cap || '')}</div></div>`;
function countUp(root, reduced) {
  for (const el of root.querySelectorAll('[data-to]')) {
    const to = Number(el.dataset.to), dec = Number(el.dataset.dec), fmt = (x) => (dec ? x.toFixed(dec) : Math.round(x).toLocaleString());
    if (reduced) { el.textContent = fmt(to); continue; }
    const t0 = performance.now(), step = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
}
async function reveal() {
  const after = $('#after'), slot = $('#slot'), dots = $('#dots');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let h = null;
  for (let i = 0; i < 5; i++) {
    h = await fetch(`/api/highlights?tz=${-new Date().getTimezoneOffset()}`).then((r) => r.json()).catch(() => null);
    if (h?.tokens > 0 || state.step !== 'done') break;
    await new Promise((r) => setTimeout(r, 900));
  }
  if (state.step !== 'done' || !slot) return;
  const cards = h ? revealCards(h) : [];
  if (!cards.length || reduced) after.classList.remove('waiting');
  if (!cards.length) return;
  $('#reveal').hidden = false;
  if (reduced) { slot.innerHTML = cards.map(revealCard).join(''); slot.classList.add('all'); countUp(slot, true); return; }
  dots.innerHTML = cards.map(() => '<li></li>').join('');
  let i = -1, timer = 0;
  const show = () => {
    if (state.step !== 'done' || !slot.isConnected) return;
    i++; clearTimeout(timer);
    slot.innerHTML = revealCard(cards[i]); countUp(slot);
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j <= i));
    if (i === cards.length - 1) { after.classList.remove('waiting'); slot.onclick = null; slot.classList.remove('more'); return; }
    timer = setTimeout(show, 3400);
  };
  slot.classList.add('more'); slot.onclick = show;
  setTimeout(show, 1500);
}

function done() {
  const agents = [...new Set(state.scan.accounts.map((a) => a.tool))].map((t) => globalThis.PuddleAgents.agent(t).name);
  const restartHtml = agents.length ? `<div class="askbox restart"><b>Restart ${esc(agents.join(' and '))} once</b>
      <small>Your past work is in. New work shows up live after that.</small></div>` : '';
  const sparks = Array.from({ length: 28 }, (_, i) => {
    const a = i * (360 / 28) + Math.random() * 10 - 5, d = 95 + Math.random() * 90, sz = 7 + Math.random() * 7;
    const col = ['#fff', '#ffd66b', '#ffe3d1'][i % 3];
    return `<i class="spark${i % 4 === 1 ? ' bar' : ''}" style="animation-delay:${(0.32 + Math.random() * 0.12).toFixed(2)}s;--a:${a.toFixed(0)}deg;--d:${d.toFixed(0)}px;--s:${sz.toFixed(1)}px;--c:${col};--r:${(Math.random() * 360).toFixed(0)}deg"></i>`;
  }).join('');
  document.body.insertAdjacentHTML('afterbegin', '<div class="cheer" aria-hidden="true"></div>');
  document.body.classList.add('celebrate');
  const shareHtml = state.solo ? '' : `<button type="button" class="share-it" id="share">
      <span class="ico share">${SHARE_IC}</span>
      <span class="txt"><b>Share your progress</b><small>A live page for anyone with the link. You pick what it shows.</small></span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`;
  $('#app').innerHTML = `<section class="screen center allset">
    <div class="burst" aria-hidden="true"><i class="wave"></i><i class="wave"></i>${sparks}
      <div class="ring full"><svg viewBox="0 0 52 52" width="54" height="54"><path class="check" d="M14 27l8 8 16-18"/></svg></div></div>
    <h1>${state.joined ? `You joined ${esc(state.joined.team.name)}` : 'All set'}</h1>
    <p class="hint">${state.joined ? 'They see all your agent work, your earlier work included. ' : ''}Puddle lives in your menu bar (✱).</p>
    ${restartHtml}
    <div class="reveal" id="reveal" hidden><div class="slot" id="slot"></div><ol class="dots" id="dots" aria-hidden="true"></ol></div>
    <div class="after waiting" id="after">
    ${shareHtml}
    <div class="go"><button class="next" id="next" type="button">Done</button></div>
    </div>
  </section>`;
  const r = $('.burst').getBoundingClientRect(), cheer = $('.cheer');
  cheer.style.setProperty('--cx', `${r.left + r.width / 2}px`); cheer.style.setProperty('--cy', `${r.top + r.height / 2}px`);
  reveal();
  const finish = (sharing = false) => { if (MODE === 'app') return handOff(sharing); go('menubar'); window.open(ME, '_blank'); };
  $('#next').onclick = () => finish();
  if ($('#share')) $('#share').onclick = async (e) => {
    tap(e.currentTarget);
    await fetch('/api/share-next', { method: 'POST', headers: { 'x-puddle': '1' } }).catch(() => {});
    finish(true);
  };
}

function pairing() {
  $('#steps').hidden = true;
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36)}</div></div>
    <h1>Turn on Puddle?</h1>
    <p class="hint">It counts how you use Claude Code and Codex on this Mac. Never your prompts or code.</p>
    <p class="hint" id="err" style="color:var(--s2)"></p>
    <div class="go"><button class="next" id="next" type="button">Turn on</button></div>
    <button class="linkish" id="notnow" type="button">Not now</button>
  </section>`;
  $('#notnow').onclick = () => { history.replaceState(null, '', MODE === 'app' ? '/?app' : '/'); native('close_main'); };
  $('#next').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Connecting…';
    const r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify({ code: params.get('pair'), url: params.get('url') }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { $('#err').textContent = d.error || 'Something went wrong.'; e.target.disabled = false; e.target.textContent = 'Get a new link'; e.target.onclick = () => native('connect'); return; }
    history.replaceState(null, '', MODE === 'app' ? '/?app' : '/');
    $('#app').innerHTML = `<section class="screen center"><div class="ring full"><div><span class="big-check" aria-hidden="true"></span></div></div>
      <h1>Connected</h1><p class="hint">${esc(d.email)}${d.invite ? ` · next: ${esc(d.invite.team.name)}` : ''}</p></section>`;
    setTimeout(() => { state.scan = null; go('scan'); }, 1100);
  };
}

const post = (u, body) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify(body) })
  .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
function connectFirst(prefill = '') {
  $('#steps').hidden = true;
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36)}</div></div>
    <h1>Sign in to Puddle</h1>
    <p class="hint" id="hint">We email you a 6-digit code. No password.</p>
    <form id="f" class="signin"><input id="email" type="email" autocomplete="email" placeholder="Your email" value="${esc(prefill)}" required>
      <div class="go"><button class="next" id="next">Send code</button></div></form>
    <button class="linkish" id="solo" type="button">Use without an account</button>
  </section>`;
  $('#email').focus();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim(); $('#next').disabled = true; $('#next').textContent = 'Sending…';
    const { ok, d } = await post('/api/signin/code', { email });
    if (!ok) { $('#hint').textContent = d.error || 'Something went wrong.'; $('#hint').style.color = 'var(--s2)'; $('#next').disabled = false; $('#next').textContent = 'Send code'; return; }
    codeScreen(d.email, d.devCode);
  };
  $('#solo').onclick = () => { state.solo = true; go('scan'); };
}
function codeScreen(email, devCode) {
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36)}</div></div>
    <h1>Check your email</h1>
    <p class="hint" id="hint">Type the code we sent to <b>${esc(email)}</b>.</p>
    <form id="f" class="signin"><input id="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" value="${esc(devCode || '')}" required>
      <div class="go"><button class="next" id="next">Sign in</button></div></form>
    <button class="linkish" id="again" type="button">Send a new code</button> <button class="linkish" id="other" type="button">Use another email</button>
  </section>`;
  const input = $('#code'); input.focus();
  const submit = async () => {
    const code = input.value.replace(/\D/g, ''); if (code.length !== 6) return;
    $('#next').disabled = true; $('#next').textContent = 'Signing in…';
    const { ok, d } = await post('/api/signin/verify', { email, code });
    if (!ok) { $('#hint').textContent = d.error || 'Something went wrong.'; $('#hint').style.color = 'var(--s2)'; $('#next').disabled = false; $('#next').textContent = 'Sign in'; input.select(); return; }
    $('#app').innerHTML = `<section class="screen center"><div class="ring full"><div><span class="big-check" aria-hidden="true"></span></div></div>
      <h1>Signed in</h1><p class="hint">${esc(d.email)}${d.invite ? ` · next: ${esc(d.invite.team.name)}` : state.after === 'team' ? ' · next: your team' : ''}</p></section>`;
    setTimeout(() => { if (state.after === 'team' && !d.invite) { location.href = meUrl('/go?to=' + encodeURIComponent('/team/new')); return; } state.scan = null; go('scan'); }, 1100);
  };
  input.oninput = () => { if (input.value.replace(/\D/g, '').length === 6) submit(); };
  $('#f').onsubmit = (e) => { e.preventDefault(); submit(); };
  $('#again').onclick = async () => { const { ok, d } = await post('/api/signin/code', { email }); $('#hint').textContent = ok ? 'New code sent.' : d.error || 'Something went wrong.'; if (ok && d.devCode) input.value = d.devCode; };
  $('#other').onclick = () => connectFirst(email);
}

function moveFirst() {
  $('#steps').hidden = true;
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36)}</div></div>
    <h1>Move Puddle to Applications</h1>
    <p class="hint">Quit Puddle, drag it from Downloads into Applications, then open it from there.</p>
    <div class="go"><button class="next" id="next" type="button">Quit Puddle</button></div>
  </section>`;
  $('#next').onclick = () => native('quit');
}

function handOff(sharing = false) {
  const orange = document.body.classList.contains('celebrate');
  $('#app').innerHTML = `<section class="screen center${orange ? ' allset handoff' : ''}">
    <div class="ring full"><div>${logo(36)}</div></div>
    <h1>${sharing ? 'Opening Me' : 'Here’s you'}</h1>
    <p class="hint">${sharing ? 'Make your link there. Nothing is shared until you say so.' : 'Opening your dashboard. Puddle stays in the menu bar: click ✱ any time.'}</p>
    ${orange ? '<div class="wait-dots" aria-hidden="true"><i></i><i></i><i></i></div>' : ''}
  </section>`;
  if (orange) setTimeout(() => {
    const r = $('.handoff .ring')?.getBoundingClientRect(), cheer = $('.cheer');
    if (!r || !cheer) return;
    const at = `at ${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
    cheer.classList.add('leave');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) cheer.animate([{ clipPath: `circle(150vmax ${at})` }, { clipPath: `circle(0px ${at})` }], { duration: 550, easing: 'cubic-bezier(.7, 0, .3, 1)', fill: 'forwards' });
  }, 950);
  setTimeout(() => native('onboarding_done'), 1500);
}

const ME = 'http://127.0.0.1:4601/';

async function menubar() {
  if (state.step !== 'menubar') return;
  $('#app').innerHTML = `<div class="desk"><div class="menubar"><span class="jicon">${LOGO}</span><span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
    <iframe class="desk-pop" src="${ME}popover" title="Puddle in the menu bar"></iframe></div>`;
}

function sure(btn, text) {
  if (btn.dataset.armed) { delete btn.dataset.armed; clearTimeout(btn._t); return true; }
  const was = btn.textContent; btn.dataset.armed = '1'; btn.textContent = text; btn.classList.add('armed');
  btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = was; btn.classList.remove('armed'); }, 4000);
  return false;
}

async function joinTeam(link, fail = () => {}) {
  const r = await fetch('/api/invite/use', { method: 'POST', headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify({ link }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return fail(d.error || 'That invite didn\'t work.');
  if (r.status === 202) { connectFirst(); const h = $('#hint'); if (h) h.textContent = 'Sign in to join the team that invited you. We email you a 6-digit code.';
    const solo = $('#solo'); solo.textContent = 'Not now'; solo.onclick = () => { location.href = `http://127.0.0.1:${Number(location.port) + 1}/mac`; };
    return; }
  if (!state.scan) await load(); else await loadInvite();
  if (state.invite?.real) go('team'); else fail('That invite didn\'t work.');
}

const realAccounts = () => state.scan.accounts.filter((a) => Object.keys(a.surfaces || {}).length);

function settingsScreen() { location.href = `http://127.0.0.1:${Number(location.port) + 1}/mac`; }

function tap(el) { el.classList.remove('pop-anim'); void el.offsetWidth; el.classList.add('pop-anim'); }
function toggle(e, map) {
  const b = e.target.closest('.pick'); if (!b) return;
  map[b.dataset.key] = !map[b.dataset.key];
  b.classList.toggle('on', map[b.dataset.key]); b.setAttribute('aria-checked', map[b.dataset.key]); tap(b);
}

document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
$('#sim-invite').onchange = async (e) => {
  state.simInvite = e.target.checked;
  if (!state.simInvite) state.team = {};
  await loadInvite(); go(state.step === 'team' && !state.invite ? 'done' : state.step);
};
const meUrl = (path) => `http://127.0.0.1:${Number(location.port) + 1}${path}`;
async function teamIntro() {
  $('#steps').hidden = true;
  const st = await fetch('/api/status').then((r) => r.json()).catch(() => ({}));
  if (st.connected) { location.href = meUrl('/go?to=' + encodeURIComponent('/team/new')); return; }
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36)}</div></div>
    <h1>Build with your team</h1>
    <p class="hint">See who's working with their agents right now, on which project, and who's close to a limit. Everyone's prompts and code stay on their own Mac.</p>
    <div class="signin"><div class="go"><button class="next" id="start" type="button">Start a team</button></div></div>
    <form id="j" class="signin"><input id="link" type="url" inputmode="url" placeholder="Or paste an invite link" aria-label="Invite link" autocomplete="off">
      <div class="go"><button class="next ghost" id="join" hidden>Join</button></div></form>
    <p class="hint small" id="err" style="color:var(--s2)"></p>
    <p class="hint small">Free during the beta.</p>
    <button class="linkish" id="back" type="button">Not now</button>
  </section>`;
  const link = $('#link');
  link.oninput = () => { $('#join').hidden = !link.value.trim(); };
  $('#j').onsubmit = (e) => { e.preventDefault(); const v = link.value.trim(); if (v) joinTeam(v, (m) => { $('#err').textContent = m; }); };
  $('#start').onclick = () => {
    state.after = 'team'; connectFirst();
    $('h1').textContent = 'Sign in to start a team';
    const solo = $('#solo'); solo.textContent = 'Back'; solo.onclick = teamIntro;
  };
  $('#back').onclick = () => { location.href = meUrl('/'); };
}

function removeScreen() {
  $('#steps').hidden = true;
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36)}</div></div>
    <h1>Remove Puddle from this Mac?</h1>
    <p class="hint">Claude Code's and Codex's settings go back to how they were before Puddle, this Mac is signed out, and Puddle stops opening at login.</p>
    <p class="hint small">Your history on this Mac stays in its folder until you delete it. Your teams keep what was already shared.</p>
    <p class="hint" id="err" style="color:var(--s2)"></p>
    <div class="go"><button class="next" id="next" type="button">Remove Puddle</button></div>
    <button class="linkish" id="cancel" type="button">Cancel</button>
  </section>`;
  $('#cancel').onclick = () => native('close_main');
  $('#next').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Removing…';
    const r = await fetch('/api/remove', { method: 'POST', headers: { 'x-puddle': '1' } }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => ({})) : null;
    if (!d) { $('#err').textContent = 'Something went wrong. Try again.'; e.target.disabled = false; e.target.textContent = 'Remove Puddle'; return; }
    $('#app').innerHTML = `<section class="screen center">
      <div class="ring full"><div><span class="big-check" aria-hidden="true"></span></div></div>
      <h1>Puddle is off</h1>
      <p class="hint">Restart Claude Code and Codex so they stop reporting. To finish, drag <b>Puddle</b> from Applications to the Bin.</p>
      <p class="hint small">Your history on this Mac is in <code>${esc(d.dir || '~/.puddle')}</code>. Delete that folder to remove it too.</p>
      <div class="go"><button class="next" id="quit" type="button">Quit Puddle</button></div>
    </section>`;
    $('#quit').onclick = () => native('uninstall');
  };
}

async function resetOnboarding() {
  await fetch('/api/choices', { method: 'DELETE', headers: { 'x-puddle': '1' } });
  Object.assign(state, { scan: null, team: {}, track: {}, teamRows: null, nudged: new Set() });
  go('scan');
}
$('#restart').onclick = resetOnboarding;

if (params.has('join')) { const code = params.get('join'); history.replaceState(null, '', '/?app'); load().then(() => joinTeam(code, (m) => { location.href = `http://127.0.0.1:${Number(location.port) + 1}/mac?err=${encodeURIComponent(m)}`; })); }
else if (params.has('pair')) pairing();
else if (params.has('remove')) { history.replaceState(null, '', MODE === 'app' ? '/?app' : '/'); removeScreen(); }
else if (params.has('reset')) { history.replaceState(null, '', MODE === 'app' ? '/?app' : '/'); resetOnboarding(); }
else if (params.has('settings')) { history.replaceState(null, '', '/?app'); load().then(settingsScreen); }
else if (params.has('team')) { history.replaceState(null, '', '/?app'); teamIntro(); }
else if (MODE === 'app') Promise.all([fetch('/api/status').then((r) => r.json()).catch(() => ({})), fetch('/api/choices').then((r) => r.json()).catch(() => ({}))])
  .then(([st, saved]) => { if (!st.connected && !st.service) state.solo = true;
    return st.translocated ? moveFirst() : st.connected || state.solo || saved.solo ? go('scan') : connectFirst(); });
else go('scan');
