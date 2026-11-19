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

const tile = ({ lbl, num = null, line = '', pic = '', ico = '', cls = '', t = 0 }) => `<div class="tile land ${cls}" style="--t:${t}s">${ico}<div class="lbl">${esc(lbl)}</div>${num == null ? '' : `<div class="big">${esc(num)}</div>`}<div class="line">${esc(line)}</div>${pic}</div>`;
const ghosts = (k) => '<div class="tile blank" aria-hidden="true"></div>'.repeat(k);

function screen({ lbl = '', q, hint = '', body, next = 'Continue', back = true, nextDisabled = false }) {
  $('#app').innerHTML = `<section class="screen tiles">
    ${lbl ? `<div class="lbl">${lbl}</div>` : ''}<h1>${q}</h1>${hint ? `<p class="hint">${hint}</p>` : ''}
    <div class="hl">${body}</div>
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
  $('#app').innerHTML = `<section class="screen tiles">
    <div class="lbl">Step 1</div>
    <h1 id="scan-title">Looking for agents</h1>
    <p class="hint" id="scan-hint">Settings only. Never what you typed.</p>
    <div class="hl" id="found">${ghosts(4)}</div>
  </section>`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  let saved;
  try { [saved] = await Promise.all([state.scan && !fresh ? null : load(fresh), wait(1400)]); }
  catch (e) { $('#scan-title').textContent = "Couldn't look around"; $('#scan-hint').textContent = e.message; wayOn(true); return; }
  if (saved) return state.invite?.real ? go('team') : MODE === 'app' ? settingsScreen() : go('menubar');
  const found = [...new Set(state.scan.accounts.map((a) => a.tool))];
  const box = $('#found'), spots = [...box.children];
  for (const [i, t] of found.entries()) {
    if (spots[i]) spots[i].outerHTML = agentTile(t); else box.insertAdjacentHTML('beforeend', agentTile(t));
    await wait(320);
  }
  for (const g of spots.slice(found.length)) { g.classList.add('gone'); setTimeout(() => g.remove(), reduced ? 0 : 450); }
  $('#scan-title').textContent = found.length ? `Found ${found.length}` : 'No agents yet';
  if (!found.length) { $('#scan-hint').textContent = 'Install Claude Code or Codex. Puddle will notice.'; return wayOn(false); }
  await wait(1800);
  if (state.step === 'scan') { await save(); go(after('scan')); }
}

function agentTile(t) {
  const mine = state.scan.sessions.filter((s) => s.tool === t), kind = new Map(state.scan.places.map((p) => [p.key, p.type]));
  const proj = new Set(mine.filter((s) => !LOOSE.has(kind.get(s.place))).map((s) => s.place)).size;
  return tile({ ico: icon(t), lbl: globalThis.PuddleAgents.agent(t).name, num: mine.length.toLocaleString(),
    line: proj ? `sessions · ${proj} project${proj === 1 ? '' : 's'}` : `session${mine.length === 1 ? '' : 's'}` });
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
  const rows = realAccounts().map((a, i) => tile({ cls: 'small', ico: icon(a.tool), lbl: globalThis.PuddleAgents.agent(a.tool).name, line: a.org || a.plan || 'account', t: 0.1 + i * 0.12 }));
  screen({ lbl: 'Invite', q:`Join ${esc(inv.team)}?`, hint: `${esc(inv.team)} sees all your Claude Code and Codex work on this Mac, your earlier work included. Time and counts only. Never your words.`,
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

const SIZES = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
const short = (x) => { for (const [v, s] of SIZES) if (x >= v) return (x / v).toFixed(x / v < 10 ? 1 : 0).replace(/\.0$/, '') + s; return String(Math.round(x)); };
const SCALE = [[90000, 'novel', 'novels'], [300, 'page', 'pages']];
function worth(tokens) {
  const w = tokens * 0.75;
  for (const [per, one, many] of SCALE) if (w >= per) { const x = w / per, k = x < 100 ? Math.round(x) : Number(x.toPrecision(2)); return `≈ ${k.toLocaleString()} ${k === 1 ? one : many}’ worth`; }
  return 'through your agents';
}
const hourName = (h) => `${String(h).padStart(2, '0')}:00`;
const NIGHT = new Set(['Night owl', 'Evening hacker']);
const rnd = (i) => { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };
const BOOK = ['var(--s1)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s7)', 'var(--s2)', 'var(--s6)'];
const shelf = () => `<div class="pic shelf">${Array.from({ length: 22 }, (_, i) =>
  `<i class="grow" style="--d:${(i * 0.03).toFixed(2)}s;--h:${(58 + rnd(i) * 42).toFixed(0)}%;--c:${BOOK[(i * 3) % BOOK.length]}"></i>`).join('')}</div>`;
function dial(by, peak, night) {
  const max = Math.max(...by, 1);
  const spokes = by.map((v, h) => {
    const a = (h / 24) * 2 * Math.PI + Math.PI / 2, r0 = 30, r1 = r0 + 6 + (v / max) * 36, c = Math.cos(a), si = Math.sin(a);
    return `<line class="pop${h === peak ? ' peak' : ''}" style="--d:${(h * 0.02).toFixed(2)}s" x1="${(75 + r0 * c).toFixed(1)}" y1="${(75 + r0 * si).toFixed(1)}" x2="${(75 + r1 * c).toFixed(1)}" y2="${(75 + r1 * si).toFixed(1)}"/>`;
  }).join('');
  const orb = night ? '<path class="moon" d="M80 60a15 15 0 1 0 9 24 12 12 0 0 1-9-24z"/>' : '<circle class="sun" cx="75" cy="75" r="13"/>';
  return `<svg class="dial" viewBox="0 0 150 150" aria-hidden="true">${spokes}${orb}</svg>`;
}
const squares = (vals) => { const max = Math.max(...vals, 1);
  return `<div class="pic sq">${vals.map((v, i) => `<i class="pop${i === vals.length - 1 ? ' today' : ''}" style="--d:${(i * 0.02).toFixed(2)}s;--o:${v ? Math.round(45 + (v / max) * 55) : 0}%"></i>`).join('')}</div>`; };
const bars = (vals) => { const max = Math.max(...vals, 1), top = vals.indexOf(max);
  return `<div class="pic bars">${vals.map((v, i) => `<i class="grow${i === top ? ' peak' : ''}" style="--d:${(i * 0.018).toFixed(3)}s;--h:${Math.max(4, (v / max) * 100).toFixed(0)}%"></i>`).join('')}</div>`; };
function highlightTiles(h, t0) {
  const out = [], last = (h.last28 || []).slice(-28);
  if (h.tokens > 0) out.push({ lbl: 'Tokens', num: short(h.tokens), line: worth(h.tokens), pic: shelf() });
  if (h.persona && h.peakHour != null) out.push({ lbl: 'Busiest hour', num: hourName(h.peakHour), line: h.persona, pic: dial(h.byHour || Array(24).fill(0), h.peakHour, NIGHT.has(h.persona)) });
  if (h.streak?.current >= 2) out.push({ lbl: 'On a roll', num: h.streak.current, line: `days in a row · best ${h.streak.best}`, pic: last.length ? squares(last) : '' });
  if (h.bestDay?.prompts) out.push({ lbl: 'Biggest day', num: h.bestDay.prompts.toLocaleString(), line: `prompts · ${new Date(h.bestDay.day + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`, pic: last.length ? bars(last) : '' });
  return out.map((c, i) => tile({ ...c, t: t0 + i * 0.35 }));
}
async function reveal(began, reduced) {
  let h = null;
  for (let i = 0; i < 5; i++) {
    h = await fetch(`/api/highlights?tz=${-new Date().getTimezoneOffset()}`).then((r) => r.json()).catch(() => null);
    if (h?.tokens > 0 || state.step !== 'done') break;
    await new Promise((r) => setTimeout(r, 900));
  }
  const box = $('#hl');
  if (state.step !== 'done' || !box) return;
  const list = h ? highlightTiles(h, reduced ? 0 : Math.max(0, 1.3 - (performance.now() - began) / 1000)) : [];
  if (!list.length) return box.remove();
  box.innerHTML = list.join('');
}

function done() {
  const began = performance.now(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const agents = [...new Set(state.scan.accounts.map((a) => a.tool))].map((t) => globalThis.PuddleAgents.agent(t).name);
  const restartHtml = agents.length ? `<div class="restart"><b>Restart ${esc(agents.join(' and '))} once</b>
      <small>Your past work is in. New work shows up live after that.</small></div>` : '';
  const sparks = Array.from({ length: 28 }, (_, i) => {
    const a = i * (360 / 28) + Math.random() * 10 - 5, d = 80 + Math.random() * 80, sz = 6 + Math.random() * 6;
    const col = ['#fff', '#ffd66b', '#ffe3d1'][i % 3];
    return `<i class="spark${i % 4 === 1 ? ' bar' : ''}" style="animation-delay:${(0.32 + Math.random() * 0.12).toFixed(2)}s;--a:${a.toFixed(0)}deg;--d:${d.toFixed(0)}px;--s:${sz.toFixed(1)}px;--c:${col};--r:${(Math.random() * 360).toFixed(0)}deg"></i>`;
  }).join('');
  document.body.insertAdjacentHTML('afterbegin', '<div class="cheer" aria-hidden="true"></div>');
  document.body.classList.add('celebrate');
  $('#app').innerHTML = `<section class="screen tiles allset">
    <div class="burst" aria-hidden="true"><i class="wave"></i><i class="wave"></i>${sparks}
      <div class="ring full"><svg viewBox="0 0 52 52" width="42" height="42"><path class="check" d="M14 27l8 8 16-18"/></svg></div></div>
    <h1>${state.joined ? `You joined ${esc(state.joined.team.name)}` : 'All set'}</h1>
    <p class="hint">${state.joined ? 'They see all your agent work, your earlier work included. ' : ''}Puddle lives in your menu bar (✱).</p>
    ${restartHtml}
    <div class="hl" id="hl">${ghosts(4)}</div>
    <div class="go">${state.solo ? '' : '<button class="next soft" id="share" type="button">Share</button>'}<button class="next" id="next" type="button">Open Me</button></div>
  </section>`;
  const r = $('.burst').getBoundingClientRect(), cheer = $('.cheer');
  cheer.style.setProperty('--cx', `${r.left + r.width / 2}px`); cheer.style.setProperty('--cy', `${r.top + r.height / 2}px`);
  reveal(began, reduced);
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
  $('#app').innerHTML = `<section class="screen tiles">
    <div class="lbl">Welcome</div>
    <h1>Sign in to Puddle</h1>
    <p class="hint" id="hint">We email you a 6-digit code. No password.</p>
    <div class="peek" aria-hidden="true"><div class="hl">${ghosts(4)}</div></div>
    <form id="f" class="ask"><input id="email" type="email" autocomplete="email" placeholder="Your email" aria-label="Your email" value="${esc(prefill)}" required>
      <button class="next" id="next">Send code</button>
      <button class="linkish" id="solo" type="button">Use without an account</button></form>
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
  $('#app').innerHTML = `<section class="screen tiles">
    <div class="lbl">Sign in</div>
    <h1>Check your email</h1>
    <p class="hint" id="hint">Type the code we sent to <b>${esc(email)}</b>.</p>
    <form id="f" class="ask fill"><label class="cells">${'<i></i>'.repeat(6)}<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" aria-label="6-digit code" value="${esc(devCode || '')}" required></label>
      <button class="next" id="next">Sign in</button>
      <div class="links"><button class="linkish" id="again" type="button">Send a new code</button><button class="linkish" id="other" type="button">Use another email</button></div></form>
  </section>`;
  const input = $('#code'), cells = [...document.querySelectorAll('.cells i')];
  const paint = () => {
    const d = input.value.replace(/\D/g, '').slice(0, 6);
    cells.forEach((c, i) => { c.classList.toggle('on', i < d.length); c.classList.toggle('at', i === d.length); c.textContent = d[i] || ''; });
  };
  paint(); input.focus();
  const submit = async () => {
    const code = input.value.replace(/\D/g, ''); if (code.length !== 6) return;
    $('#next').disabled = true; $('#next').textContent = 'Signing in…';
    const { ok, d } = await post('/api/signin/verify', { email, code });
    if (!ok) { $('#hint').textContent = d.error || 'Something went wrong.'; $('#hint').style.color = 'var(--s2)'; $('#next').disabled = false; $('#next').textContent = 'Sign in'; input.select(); return; }
    $('#app').innerHTML = `<section class="screen tiles center"><div class="ring full"><div><span class="big-check" aria-hidden="true"></span></div></div>
      <h1>Signed in</h1><p class="hint">${esc(d.email)}${d.invite ? ` · next: ${esc(d.invite.team.name)}` : state.after === 'team' ? ' · next: your team' : ''}</p></section>`;
    setTimeout(() => { if (state.after === 'team' && !d.invite) { location.href = meUrl('/go?to=' + encodeURIComponent('/team/new')); return; } state.scan = null; go('scan'); }, 1100);
  };
  input.oninput = () => { paint(); if (input.value.replace(/\D/g, '').length === 6) submit(); };
  $('#f').onsubmit = (e) => { e.preventDefault(); submit(); };
  $('#again').onclick = async () => { const { ok, d } = await post('/api/signin/code', { email }); $('#hint').textContent = ok ? 'New code sent.' : d.error || 'Something went wrong.'; if (ok && d.devCode) { input.value = d.devCode; paint(); } };
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
    <div class="ring full"><div>${orange ? '<svg viewBox="0 0 52 52" width="42" height="42" aria-hidden="true"><path class="check done" d="M14 27l8 8 16-18"/></svg>' : logo(36)}</div></div>
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
