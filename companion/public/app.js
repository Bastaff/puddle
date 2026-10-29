// Puddle's own screens: onboarding, settings and the menu bar popover. Watch-style: one question per screen, answers are big rows you tap.
// scanning → track these? → work for <team>? → make a card? → done → menu bar

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// agents by id, from the shared catalogue (/agents.js): TOOL[id] is the short name ("Claude", "Codex")
const TOOL = new Proxy({}, { get: (_, id) => globalThis.JouleAgents.agent(id).short });
const LOOSE = new Set(['scratch', 'home', 'chats']);

// Where the screens run: a browser tab (development: npm run companion), the app's window, or the menu bar popover.
const params = new URLSearchParams(location.search);
const MODE = params.has('popover') ? 'popover' : params.has('app') ? 'app' : 'web';
// In a browser tab (development) "Team" opens the local website; the app opens the real one itself.
const DASHBOARD = 'http://127.0.0.1:4500/';
const logo = (size, stroke = 3) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round"/></svg>`;
const LOGO = logo(12);
// Ask the app to act: it catches navigations to /__joule/<action> (see companion-app/src/main.rs).
// Outside the app the server answers 204, which leaves the page as it is.
const native = (cmd) => { if (MODE !== 'web') location.href = '/__joule/' + cmd; };
document.body.classList.add('mode-' + MODE);
// inside Puddle's own windows: no browser right-click menu (Reload, Inspect…)
if (MODE !== 'web') document.addEventListener('contextmenu', (e) => e.preventDefault());

const state = { scan: null, invite: null, simInvite: false, track: {}, team: {}, card: null, step: 'scan', teamRows: null, nudged: new Set() };

const clock = (min) => { min = Math.round(min); return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; };
const hrs = (min) => (min < 60 ? `${Math.round(min)} min` : `${Math.round(min / 60)} h`);
const n = (x) => (x >= 1e4 ? Math.round(x / 1e3) + 'k' : x.toLocaleString());
const sum = (list, k) => list.reduce((a, s) => a + s[k], 0);
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const onDay = (list, key) => list.reduce((a, s) => a + (s.byDay[key] || 0), 0);
const short2 = (p) => (p.type === 'owner' ? p.label.split('/').slice(1).join('/') : p.label.split('/').pop());

// ---------- data ----------

async function load(fresh) {
  state.scan = await (await fetch('/api/scan' + (fresh ? '?fresh' : ''))).json();
  const saved = await (await fetch('/api/choices')).json();
  for (const a of state.scan.accounts) state.track[a.key] = true; // everything found is counted (nothing to turn off)
  if (saved.savedAt) Object.assign(state, { team: saved.team || {}, card: saved.card ?? null, simInvite: !!saved.simInvite, solo: !!saved.solo });
  $('#sim-invite').checked = state.simInvite;
  await loadInvite();
  return !!saved.savedAt;
}
// A real invite (this Mac came here from "Get Puddle to join <team>"), or the development view's pretend one.
async function loadInvite() {
  state.invite = await (await fetch('/api/invite' + (state.simInvite ? '?sim' : ''))).json().catch(() => null);
  state.teamRows = null;
}
const save = () => fetch('/api/choices', { method: 'POST', headers: { 'content-type': 'application/json', 'x-joule': '1' }, body: JSON.stringify({ track: state.track, team: state.invite ? state.team : {}, card: !!state.card, simInvite: state.simInvite, solo: !!state.solo, team_name: state.invite?.team || null }) });

const tracked = () => state.scan.sessions.filter((s) => state.track[s.account]);
const cardSessions = () => (state.card ? tracked() : []);
const coveredBy = (placeKey, accounts) => { const own = state.scan.sessions.filter((s) => s.place === placeKey); return own.length > 0 && own.every((s) => accounts[s.account]); };

// ---------- the pieces ----------

const icon = (tool) => { const a = globalThis.JouleAgents.agent(tool); return `<span class="ico ${a.ico}">${a.letter}</span>`; };
const folderIcon = `<span class="ico place"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M3 7.2C3 6 4 5 5.2 5h3.6c.6 0 1.1.2 1.5.6L11.6 7h7.2C20 7 21 8 21 9.2v8.6c0 1.2-1 2.2-2.2 2.2H5.2C4 20 3 19 3 17.8z" opacity=".4"/><path d="M3 10.2C3 9 4 8 5.2 8h13.6C20 8 21 9 21 10.2v7.6c0 1.2-1 2.2-2.2 2.2H5.2C4 20 3 19 3 17.8z"/></svg></span>`;

// One tappable row. multi = checkbox, otherwise radio.
const pick = ({ key, on, ico, title, sub, multi = true }) => `
  <button type="button" class="pick${on ? ' on' : ''}${multi ? '' : ' radio'}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${on}" data-key="${esc(key)}">
    ${ico}<span class="txt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="tick" aria-hidden="true"></span>
  </button>`;

function screen({ q, hint = '', body, next = 'Continue', back = true, nextDisabled = false }) { // next: null = the answer itself moves on
  $('#app').innerHTML = `<section class="screen">
    <h1>${q}</h1>${hint ? `<p class="hint">${hint}</p>` : ''}
    <div class="list">${body}</div>
    <div class="go">${back ? '<button class="ghost" id="back" type="button" aria-label="Back">‹</button>' : ''}${next ? `<button class="next" id="next" type="button" ${nextDisabled ? 'disabled' : ''}>${next}</button>` : ''}</div>
  </section>`;
  $('#back')?.addEventListener('click', () => go(prev(state.step)));
}

// ---------- flow ----------

// joining a team is what brought you here: no detour through the card question
// (Puddle counts every Claude Code and Codex account on this Mac, and a team sees all of it: nothing to pick)
const FLOW = () => ['scan', ...(state.invite ? ['team'] : []), ...(state.invite?.real ? [] : ['card']), 'done'];
const prev = (s) => FLOW()[Math.max(0, FLOW().indexOf(s) - 1)];
const after = (s) => FLOW()[FLOW().indexOf(s) + 1];

function go(step) {
  if (!state.scan && step !== 'scan') return;
  state.step = step;
  const f = FLOW(), i = f.indexOf(step);
  $('#steps').hidden = step === 'menubar';
  $('#steps').innerHTML = f.map((_, j) => `<li class="${j <= i ? 'done' : ''}"></li>`).join('');
  ({ scan: scanning, team, card, done, menubar })[step]();
  window.scrollTo({ top: 0 });
}

// The first thing anyone sees: Puddle looking around, then what it found popping in.
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
  catch (e) { $('#scan-title').textContent = "Couldn't look around"; $('#scan-hint').textContent = e.message; return; }
  // set up before and now arriving with an invite: straight to "Work for <team>?"
  if (saved) return state.invite?.real ? go('team') : MODE === 'app' ? settingsScreen() : go('menubar'); // reopened later: settings
  const found = [...new Set(state.scan.accounts.map((a) => a.tool))];
  for (const t of found) { $('#found').insertAdjacentHTML('beforeend', icon(t)); await wait(320); }
  $('.radar').classList.add('done');
  $('#scan-title').textContent = found.length ? `Found ${found.length}` : 'No agents yet';
  $('#scan-hint').textContent = found.length ? found.map((t) => TOOL[t]).join(' · ') : 'Install Claude Code or Codex. Puddle will notice.';
  if (!found.length) return;
  await wait(900);
  // everything found is counted: straight on
  if (state.step === 'scan') { await save(); go(after('scan')); }
}

// Rows for "work for <team>?": the team's accounts, then only the places those don't already cover.
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
  for (const a of state.scan.accounts) state.team[a.key] = true; // (older services read this; a team sees everything)
  const rows = realAccounts().map((a) => `<div class="srow acct">${icon(a.tool)}<span><b>${TOOL[a.tool]}</b><small>${esc(a.org || a.plan || 'account')}</small></span></div>`);
  screen({ q: `Join ${esc(inv.team)}?`, hint: `${esc(inv.team)} sees all your Claude Code and Codex work on this Mac, your earlier work included. Time and counts only. Never your words.`,
    body: rows.join('') || '<p class="foot">Nothing yet. Your work shows up as soon as you use Claude Code or Codex.</p>',
    next: inv.real ? `Join ${esc(inv.team)}` : 'Continue' });
  $('#next').onclick = async (e) => {
    // a real invite: hand the team this choice now (nothing later can lose it)
    if (state.invite?.real) {
      e.target.disabled = true; e.target.textContent = 'Joining…';
      const r = await fetch('/api/team/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-joule': '1' }, body: JSON.stringify({ code: state.invite.code, team: state.team }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { e.target.disabled = false; e.target.textContent = 'Try again'; $('.hint').textContent = d.error || 'Could not join right now.'; $('.hint').style.color = 'var(--s2)'; return; }
      state.joined = d;
      await save();
    }
    go(after('team'));
  };
}

function card() {
  const on = state.card;
  screen({
    q: 'Make a card?', hint: 'Your stats, to share for fun.',
    body: pick({ key: 'yes', on: on === true, multi: false, ico: '<span class="ico card">✦</span>', title: 'Yes', sub: 'Hours and streaks. No names.' })
      + pick({ key: 'no', on: on === false, multi: false, ico: '<span class="ico none">–</span>', title: 'Not now' }),
    next: null, // one answer: tapping it is the answer
  });
  $('.list').onclick = async (e) => {
    const b = e.target.closest('.pick'); if (!b) return;
    state.card = b.dataset.key === 'yes';
    for (const r of document.querySelectorAll('.pick')) { const sel = r === b; r.classList.toggle('on', sel); r.setAttribute('aria-checked', sel); }
    tap(b);
    await Promise.all([save(), new Promise((r) => setTimeout(r, 260))]); // let the tick land before moving on
    go('done');
  };
}

function streak(list) {
  const days = [...new Set(list.flatMap((s) => Object.keys(s.byDay)))].sort().map((d) => Date.parse(d) / 864e5);
  let best = 0, run = 0; for (let i = 0; i < days.length; i++) { run = i && days[i] - days[i - 1] === 1 ? run + 1 : 1; best = Math.max(best, run); }
  return best;
}

function done() {
  const c = cardSessions();
  const cardHtml = state.card ? `<div class="mini-card">
      <small>Last ${state.scan.days} days</small>
      <b class="num">${hrs(sum(c, 'minutes'))}</b><span>with AI agents</span>
      <div class="row3"><div><b class="num">${n(c.length)}</b><small>sessions</small></div><div><b class="num">${streak(c)}</b><small>day streak</small></div><div><b class="num">${n(sum(c, 'prompts'))}</b><small>prompts</small></div></div>
    </div>` : '';
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div><span class="big-check" aria-hidden="true"></span></div></div>
    <h1>${state.joined ? `You joined ${esc(state.joined.team.name)}` : 'All set'}</h1>
    <p class="hint">${state.joined ? 'They see all your agent work, your earlier work included. ' : ''}Puddle lives in your menu bar (✱).</p>
    <p class="hint"><b>Quit and reopen Claude Code (and Codex) to start.</b></p>
    ${cardHtml}
    <div class="go"><button class="next" id="next" type="button">Done</button></div>
  </section>`;
  // in the app, finishing onboarding hands over to the menu bar
  $('#next').onclick = () => { if (MODE === 'app') return handOff(); go('menubar'); window.open(ME, '_blank'); };
}

// Arriving from "Get Puddle" (joule://pair): one clear consent, then Puddle connects itself.
function pairing() {
  $('#steps').hidden = true;
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36, 2.4)}</div></div>
    <h1>Turn on Puddle?</h1>
    <p class="hint">It counts how you use Claude Code and Codex on this Mac. Never your prompts or code. Undo any time.</p>
    <p class="hint" id="err" style="color:var(--s2)"></p>
    <div class="go"><button class="next" id="next" type="button">Turn on</button></div>
  </section>`;
  $('#next').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Connecting…';
    const r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json', 'x-joule': '1' }, body: JSON.stringify({ code: params.get('pair'), url: params.get('url') }) });
    const d = await r.json().catch(() => ({}));
    // a used or expired link can't be retried: get a fresh one from the website
    if (!r.ok) { $('#err').textContent = d.error || 'Something went wrong.'; e.target.disabled = false; e.target.textContent = 'Get a new link'; e.target.onclick = () => native('connect'); return; }
    history.replaceState(null, '', MODE === 'app' ? '/?app' : '/');
    $('#app').innerHTML = `<section class="screen center"><div class="ring full"><div><span class="big-check" aria-hidden="true"></span></div></div>
      <h1>Connected</h1><p class="hint">${esc(d.email)}${d.invite ? ` · next: ${esc(d.invite.team.name)}` : ''}</p></section>`;
    setTimeout(() => { state.scan = null; go('scan'); }, 1100);
  };
}

// Not connected yet: sign in right here, once. Email → a 6-digit code by mail → connected.
// (A team you were invited to with this email is offered next: "What can <team> see?")
const post = (u, body) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-joule': '1' }, body: JSON.stringify(body) })
  .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
function connectFirst(prefill = '') {
  $('#steps').hidden = true;
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36, 2.4)}</div></div>
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
  $('#solo').onclick = () => { state.solo = true; go('scan'); }; // remembered when the choices are saved
}
function codeScreen(email, devCode) {
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36, 2.4)}</div></div>
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
      <h1>Signed in</h1><p class="hint">${esc(d.email)}${d.invite ? ` · next: ${esc(d.invite.team.name)}` : ''}</p></section>`;
    setTimeout(() => { state.scan = null; go('scan'); }, 1100);
  };
  input.oninput = () => { if (input.value.replace(/\D/g, '').length === 6) submit(); }; // pasted or typed: goes by itself
  $('#f').onsubmit = (e) => { e.preventDefault(); submit(); };
  $('#again').onclick = async () => { const { ok, d } = await post('/api/signin/code', { email }); $('#hint').textContent = ok ? 'New code sent.' : d.error || 'Something went wrong.'; if (ok && d.devCode) input.value = d.devCode; };
  $('#other').onclick = () => connectFirst(email);
}

// Opened straight from Downloads: macOS runs a temporary copy, which can't start at login or last.
function moveFirst() {
  $('#steps').hidden = true;
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36, 2.4)}</div></div>
    <h1>Move Puddle to Applications</h1>
    <p class="hint">Quit Puddle, drag it from Downloads into Applications, then open it from there.</p>
    <div class="go"><button class="next" id="next" type="button">Quit Puddle</button></div>
  </section>`;
  $('#next').onclick = () => native('quit');
}

// Done in the app: say where Puddle went, then close the window.
function handOff() {
  $('#app').innerHTML = `<section class="screen center">
    <div class="ring full"><div>${logo(36, 2.4)}</div></div>
    <h1>Here's you</h1>
    <p class="hint">Opening your dashboard. Puddle stays in the menu bar: click ✱ any time.</p>
  </section>`;
  setTimeout(() => native('onboarding_done'), 1400);
}

// Kinds of work, in the dashboard's colours and words (collector/public: --k-*).
const KINDS = [['run', 'Run', 'var(--s2)'], ['edit', 'Edit', 'var(--s3)'], ['read', 'Read', 'var(--s1)'], ['web', 'Web', 'var(--s7)'], ['agent', 'Agents', 'var(--s5)'], ['mcp', 'MCP', 'var(--s4)']];
const short = (x) => (x >= 1e9 ? (x / 1e9).toFixed(1).replace(/\.0$/, '') + 'b' : x >= 1e6 ? (x / 1e6).toFixed(1).replace(/\.0$/, '') + 'm' : x >= 1e4 ? Math.round(x / 1e3) + 'k' : String(Math.round(x || 0)));
const wait = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '–');
const ME = 'http://127.0.0.1:4601/';

// The popover: today as your row of the team table, and two doors: Me and Team.
// the team dashboard's headline tile (collector/public/you.js kpiTiles), sized for the popover
const tile = (label, value, unit, sp, cls = '') => `<div class="ptile ${cls}"><div class="k">${esc(label)}</div><div class="v num">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div><div class="sp">${sp}</div></div>`;
function spark(values, color) {
  const v = values.length ? values : [0], max = Math.max(...v, 1e-9);
  const x = (i) => (v.length === 1 ? 50 : (i / (v.length - 1)) * 100), y = (n) => 28 - (n / max) * 24;
  const line = v.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(n).toFixed(2)}`).join('');
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${line}L100,30L0,30Z" fill="${color}" opacity="0.14"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
async function menubar() {
  const s = state.scan, inv = state.invite;
  const t = await (await fetch(`/api/today?tz=${-new Date().getTimezoneOffset()}`)).json().catch(() => ({}));
  const upd = await fetch('/api/update').then((r) => r.json()).catch(() => null);
  const st = MODE === 'web' ? { connected: true, service: true } : await fetch('/api/status').then((r) => r.json()).catch(() => ({}));
  const connected = st.connected, website = Boolean(st.service);
  if (state.step !== 'menubar') return;
  const p = t.person || {}, mix = p.mix || {}, total = Object.values(mix).reduce((a, b) => a + b, 0) || 0;
  const kinds = KINDS.filter(([k]) => mix[k]).sort((a, b) => mix[b[0]] - mix[a[0]]);
  const week = t.week || [], max = Math.max(1, ...week.map((d) => d.prompts || 0)), todayKey = dayKey(new Date());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return dayKey(d); });
  const ask = null; // a team sees all your work: no new project to ask about
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // today as 24 hour-cells (each filled as much as you worked that hour), the week as bars in hours
  const hours = t.byHour || new Array(24).fill(0), nowH = new Date().getHours();
  const wmax = Math.max(1, ...(t.weekDays || []).map((d) => d.minutes));
  const hmin = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const n = p.now || {}, ago = n.lastTs ? Date.now() - n.lastTs : Infinity;
  const live = ago < 90_000 ? { text: n.doing ? ({ run: 'Running commands', edit: 'Editing code', read: 'Reading code', web: 'Researching', agent: 'Sub-agents', mcp: 'Connected tools' })[n.doing] || 'Working' : 'Thinking', c: 'var(--good)' } : null;
  $('#app').innerHTML = `
    <div class="desk">
      <div class="menubar"><span class="jicon">${LOGO} ${t.label || '0:00'}</span><span>${now}</span></div>
      <div class="pop" role="dialog" aria-label="Puddle">

        <div class="p-today">
          <div class="p-head"><b class="p-time num">${esc(t.label || '0:00')}<small>h</small></b>${live ? `<span class="p-live" style="--c:${live.c}"><i></i>${esc(live.text)}</span>` : ''}</div>
          <div class="p-day" aria-label="Today, hour by hour">${hours.map((m, h) => `<i class="${h === nowH ? 'now' : h > nowH ? 'ahead' : ''}" title="${String(h).padStart(2, '0')}:00 · ${Math.round(m)} min"><b style="height:${Math.min(100, (m / 60) * 100)}%"></b></i>`).join('')}</div>
          <div class="p-ticks"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
        </div>
        <section class="pcard p-week">
          <header><h2>This week</h2><b class="num">${hmin(t.weekMinutes || 0)}<small> h</small></b></header>
          <div class="p-bars">${(t.weekDays || []).map((d, i) => `<span class="${d.kind}" title="${hmin(d.minutes)} h"><i><b style="height:${d.kind === 'ahead' ? 0 : Math.max(d.minutes ? 8 : 0, (d.minutes / wmax) * 100)}%"></b></i><small>${'MTWTFSS'[i]}</small></span>`).join('')}</div>
          ${total ? `<div class="mixbar" aria-label="Kind of work">${kinds.map(([k, , c]) => `<i style="flex:${mix[k]};background:${c}"></i>`).join('')}</div>
          <div class="mixlegend">${kinds.slice(0, 3).map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} ${Math.round((mix[k] / total) * 100)}%</span>`).join('')}</div>` : ''}
        </section>
        ${ask ? `<div class="askbox" data-key="${esc(ask.key)}"><b>${esc(short2(ask))}</b><small>New. Work for ${esc(inv.team)}?</small>
          <div class="yn"><button type="button" data-a="yes">Yes</button><button type="button" data-a="no">No</button></div></div>` : ''}
        <div class="doors">
          <button type="button" class="door primary" id="me"><b>Me</b></button>
          ${connected ? `<button type="button" class="door" id="team"><b>${inv ? esc(inv.team) : 'Team'}</b></button>`
            : website ? `<button type="button" class="door" id="team"><b>Sign in</b></button>` : ''}
          <button type="button" class="door gear" id="settings" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(0 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(45 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(90 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(135 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(180 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(225 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(270 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(315 12 12)"/><path fill-rule="evenodd" d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 4.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z"/></svg></button>
        </div>
        ${upd?.available ? `<div class="upd"><span><b>New Puddle ready</b> · ${upd.error ? esc(upd.error) : upd.status === 'installing' ? 'installing, it restarts in a moment' : 'takes a minute'}</span>${upd.status === 'installing' ? '' : '<button type="button" id="upd">Install</button>'}</div>` : ''}
        <div class="p-brand"><span>${logo(15)}<b>Puddle</b></span>${upd?.current ? `<small>${esc(upd.current)}</small>` : ''}</div>
      </div>
    </div>`;
  $('.askbox')?.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const key = e.currentTarget.dataset.key;
    state.team[key] = b.dataset.a === 'yes'; state.nudged.add(key); await save(); menubar();
  });
  $('#upd')?.addEventListener('click', async () => {
    await fetch('/api/update/install', { method: 'POST', headers: { 'x-joule': '1' } }).catch(() => {});
    menubar(); setTimeout(menubar, 4000);
  });
  $('#me').onclick = () => (MODE === 'web' ? window.open(ME, '_blank') : native('open_me'));
  if ($('#team')) $('#team').onclick = () => (MODE === 'web' ? window.open(DASHBOARD, '_blank') : native(connected ? 'open_dashboard' : 'open_settings'));
  $('#settings').onclick = () => (MODE === 'popover' ? native(connected ? 'open_account' : 'open_settings') : go('track'));
}

// ---------- interaction ----------

// Ask twice instead of confirm(): Puddle's windows never show browser dialogs (confirm() just says no there).
// The first click arms the button ("Click again to …"), a second within 4 s does it.
function sure(btn, text) {
  if (btn.dataset.armed) { delete btn.dataset.armed; clearTimeout(btn._t); return true; }
  const was = btn.textContent; btn.dataset.armed = '1'; btn.textContent = text; btn.classList.add('armed');
  btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = was; btn.classList.remove('armed'); }, 4000);
  return false;
}

// Join from Puddle (an invite link pasted in Settings, or joule://join from the invite page): Puddle checks the
// invite, then shows "What can <team> see?" and joins. No browser sign-in.
async function joinTeam(link, fail = () => {}) {
  const r = await fetch('/api/invite/use', { method: 'POST', headers: { 'content-type': 'application/json', 'x-joule': '1' }, body: JSON.stringify({ link }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return fail(d.error || 'That invite didn\'t work.');
  // kept for after signing in (Puddle wasn't signed in yet): sign in, then "What can <team> see?"
  if (r.status === 202) { connectFirst(); const h = $('#hint'); if (h) h.textContent = 'Sign in to join the team that invited you. We email you a 6-digit code.'; return; }
  if (!state.scan) await load(); else await loadInvite();
  if (state.invite?.real) go('team'); else fail('That invite didn\'t work.');
}

const realAccounts = () => state.scan.accounts.filter((a) => Object.keys(a.surfaces || {}).length); // never offer an account with no coding

// ---------- Settings (from the popover): This Mac, the same Settings page as the website's (served by Me: /mac) ----------
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
  await loadInvite(); go(state.step === 'team' && !state.invite ? 'card' : state.step);
};
// Dev: "Reset onboarding" (or open /?reset) forgets saved choices and replays everything from the scan.
async function resetOnboarding() {
  await fetch('/api/choices', { method: 'DELETE', headers: { 'x-joule': '1' } });
  Object.assign(state, { scan: null, card: null, team: {}, track: {}, teamRows: null, nudged: new Set() });
  go('scan');
}
$('#restart').onclick = resetOnboarding;
// the theme button belongs to theme.js: one setting for every Puddle screen, the window and the popover

// the popover re-reads when it opens, so the numbers are fresh
window.jouleRefresh = async () => { if (MODE === 'popover') { await load(true); go('menubar'); } };

// an invite (a link someone opened, or pasted in Settings → This Mac): a link that didn't work goes back there, saying why
if (params.has('join')) { const code = params.get('join'); history.replaceState(null, '', '/?app'); load().then(() => joinTeam(code, (m) => { location.href = `http://127.0.0.1:${Number(location.port) + 1}/mac?err=${encodeURIComponent(m)}`; })); }
else if (params.has('pair')) pairing();
else if (params.has('reset')) { history.replaceState(null, '', MODE === 'app' ? '/?app' : '/'); resetOnboarding(); }
else if (params.has('settings')) { history.replaceState(null, '', '/?app'); load().then(settingsScreen); }
else if (MODE === 'popover') load().then(() => go('menubar'));
else if (MODE === 'app') Promise.all([fetch('/api/status').then((r) => r.json()).catch(() => ({})), fetch('/api/choices').then((r) => r.json()).catch(() => ({}))])
  .then(([st, saved]) => { if (!st.connected && !st.service) state.solo = true; // built without a website: this Mac only
    return st.translocated ? moveFirst() : st.connected || state.solo || saved.solo ? go('scan') : connectFirst(); });
else go('scan');
