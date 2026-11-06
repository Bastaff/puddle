(() => {
  const bar = document.currentScript?.previousElementSibling;
  if (!bar || !bar.matches('header.bar')) return;
  const page = bar.dataset.page || 'page', dash = ['me', 'team', 'person'].includes(page);
  const top = Object.assign(document.createElement('div'), { className: 'top' });
  bar.before(top); top.append(bar);
  const helper = /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const q = new URLSearchParams(location.search);

  const appMe = (() => { try { const a = q.get('app'); if (a && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(a)) sessionStorage.setItem('puddle-me', a); return sessionStorage.getItem('puddle-me') || sessionStorage.getItem('joule-me'); } catch { return null; } })();
  const site = (to) => (helper ? `/go?to=${encodeURIComponent(to)}` : to);
  const meHref = helper ? '/' : appMe || '/?home=1';
  const teamHere = q.get('team') || (location.pathname.match(/^\/team\/([0-9a-f-]{36})/) || [])[1] || null;
  const here = page === 'me' ? 'me' : page === 'settings' ? 'settings' : location.pathname === '/sim' ? 'sim'
    : q.get('demo') === '1' ? '' : teamHere ? 'team:' + teamHere
    : !helper && ['/', '/person', '/project', '/work'].includes(location.pathname) ? 'me' : '';

  const I = {
    learn: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="10" opacity=".28"/><path d="M9 9.4a3 3 0 1 1 4.3 2.7c-.9.5-1.3 1.1-1.3 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17.6" r="1.6"/></svg>',
    theme: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="10" opacity=".28"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3.5 9.2c0-.7.6-1.2 1.2-1.2h2.6l4.6-3.6c.8-.6 1.9 0 1.9 1v13.2c0 1-1.1 1.6-1.9 1L7.3 16H4.7c-.6 0-1.2-.5-1.2-1.2z"/><path class="waves" d="M16.4 8.6a4.8 4.8 0 0 1 0 6.8M18.9 6.1a8.3 8.3 0 0 1 0 11.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".55"/><g class="mute"><circle cx="19" cy="12" r="4.4" opacity=".28"/><path d="M17.3 10.3l3.4 3.4M20.7 10.3l-3.4 3.4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></g></svg>',
    grid: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="11" height="8" rx="2.4"/><rect x="16" y="3" width="5" height="8" rx="2" opacity=".55"/><rect x="3" y="13" width="5" height="8" rx="2" opacity=".55"/><rect x="10" y="13" width="11" height="8" rx="2.4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(0 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(45 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(90 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(135 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(180 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(225 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(270 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(315 12 12)"/><path fill-rule="evenodd" d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 4.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z"/></svg>',
  };
  globalThis.PUDDLE_GEAR = I.gear;

  const has = { share: page === 'me', demo: page === 'team', arrange: dash, learn: dash, sound: page === 'team', range: dash };
  const rangeNow = (() => { try { const r = page === 'team' ? JSON.parse(store.get('cu2') || '{}').range || '7d' : store.get('pv-range') || '7d'; return r === 'today' ? '1d' : r; } catch { return '7d'; } })();
  const ranges = [['1d', '1D', 'Last 24 hours'], ['7d', '7D', 'Last 7 days'], ['30d', '30D', 'Last 30 days'], ['90d', '90D', 'Last 90 days']];
  const CARET = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.6 6 7.6l3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const keep = [...bar.children];
  const settingsHref = helper ? site('/settings') : '/settings';
  bar.innerHTML = `<a class="brand" href="${meHref}" aria-label="Puddle: Me" title="Puddle: Me"><img class="mark" src="/brand/icon.svg" alt=""><b>Puddle</b></a>
<nav class="places" id="site-nav" aria-label="Pages"></nav>
<span class="bar-gap"></span>
<span class="bar-tools">
<button class="pill status" id="status" type="button" data-learn="bar:health" aria-live="polite" hidden><i class="dot"></i><span>…</span></button>
${has.range ? `<span class="range-pick" data-learn="bar:range"><button type="button" class="rp-btn" id="range-btn" aria-haspopup="menu" aria-expanded="false" title="Date range"><span class="rp-now">${(ranges.find((r) => r[0] === rangeNow) || ranges[1])[1]}</span>${CARET}</button><nav class="rp-menu" id="range" aria-label="Date range" role="menu" hidden>${ranges.map(([k, l, long]) => `<button type="button" role="menuitemradio" data-r="${k}" aria-pressed="${k === rangeNow}"><b>${l}</b><span>${long}</span></button>`).join('')}</nav></span>` : ''}
${has.demo ? `<button class="pill demo-btn" id="demo-btn" type="button" data-act="demo" data-tuck="5" aria-pressed="false" data-learn="bar:demo" title="A synthetic demo team to try things on. Your data is untouched.">Demo</button>` : ''}
${has.share ? `<button class="pill primary" id="share-live" type="button" data-tuck="5" title="A public page of your own agent work, live">Share live</button>` : ''}
${has.arrange ? `<button class="icon-btn lay-btn" id="arrange-btn" type="button" data-tuck="3" aria-pressed="false" aria-label="Arrange" data-learn="bar:arrange" title="Arrange the page: move, resize and hide cards">${I.grid}<span class="lay-n" hidden></span></button>` : ''}
${has.learn ? `<button class="icon-btn learn-btn" id="learn-btn" type="button" data-tuck="2" aria-pressed="false" aria-label="Explain this page" data-learn="bar:learn" title="Explain this page">${I.learn}</button>` : ''}
${has.sound ? `<button class="icon-btn sound-btn" id="sound-btn" type="button" data-tuck="1" aria-pressed="false" aria-label="Sounds" data-learn="bar:sound" title="Sounds">${I.sound}</button>` : ''}
<button class="icon-btn theme-btn" id="theme-btn" type="button" data-tuck="4" aria-label="Theme" title="Theme" data-learn="bar:theme">${I.theme}</button>
<a class="icon-btn settings-btn${here === 'settings' ? ' on' : ''}" id="settings-btn" href="${settingsHref}" aria-label="Settings" title="Settings"${here === 'settings' ? ' aria-current="page"' : ''}>${I.gear}</a>
<button class="icon-btn more-btn${here === 'settings' ? ' on' : ''}" id="more-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Settings and more" title="Settings and more" hidden>${I.gear}${CARET}</button>
</span>`;
  for (const k of keep) bar.querySelector('#settings-btn').before(k);

  const nav = bar.querySelector('#site-nav');
  let offline = !navigator.onLine;
  const needsSite = (a) => (helper ? a.getAttribute('href')?.startsWith('/go') : a.dataset.k !== 'me');
  const lastTeam = { get: () => store.get('puddle-last-team'), set: (v) => store.set('puddle-last-team', v) };
  if (here.startsWith('team:') && teamHere) lastTeam.set(teamHere);
  const teamHref = (t) => site(t.canView ? `/?team=${t.id}` : `/team/${t.id}/share`);
  let openPop = null;
  const closePop = (focus) => openPop?.close(focus);
  const place = (btn, panel) => {
    const r = btn.getBoundingClientRect(), b = bar.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(r.right - b.left - panel.offsetWidth, b.width - panel.offsetWidth - 8))}px`;
    panel.style.top = `${r.bottom - b.top + 6}px`;
  };
  function popup(btn, make) {
    function close(focus) {
      if (openPop?.btn !== btn) return; const { panel, owned } = openPop; openPop = null;
      if (owned) panel.remove(); else panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus();
    }
    function open() {
      closePop();
      const { panel, owned, first } = make(); if (!panel) return;
      if (owned) bar.append(panel); panel.hidden = false; place(btn, panel);
      btn.setAttribute('aria-expanded', 'true'); openPop = { btn, panel, owned, close };
      const items = () => [...panel.querySelectorAll('a, button, input')].filter((x) => x.offsetParent && !x.hidden);
      panel.onkeydown = (e) => {
        const list = items(), i = list.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); close(true); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); list[Math.min(list.length - 1, i + 1)]?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); list[Math.max(0, i - 1)]?.focus(); }
      };
      (first || items()[0])?.focus();
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (openPop?.btn === btn) close(); else open(); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && openPop?.btn !== btn) { e.preventDefault(); open(); } });
    return { open, close };
  }
  document.addEventListener('pointerdown', (e) => { if (openPop && !openPop.panel.contains(e.target) && !openPop.btn.contains(e.target)) closePop(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPop) closePop(true); });

  function teamMenu(teams, d) {
    const menu = Object.assign(document.createElement('div'), { className: 'place-menu', role: 'menu' });
    const search = teams.length >= 8;
    menu.innerHTML = `${search ? '<input class="pm-find" type="search" placeholder="Find a team" aria-label="Find a team">' : ''}
      <div class="pm-list">${teams.map((t) => `<a role="menuitem" href="${teamHref(t)}" data-k="team:${esc(t.id)}" data-name="${esc(t.name.toLowerCase())}" class="${here === 'team:' + t.id ? 'on' : ''}"${here === 'team:' + t.id ? ' aria-current="page"' : ''}>${esc(t.name)}</a>`).join('')}</div>
      <div class="pm-sep"></div>
      <a role="menuitem" href="${site('/team/new')}" data-k="start" class="pm-new">Start a team</a>
      ${d?.sim ? `<a role="menuitem" href="${site('/sim')}" data-k="sim">Simulate</a>` : ''}`;
    const find = menu.querySelector('.pm-find');
    find?.addEventListener('input', () => { const q = find.value.trim().toLowerCase(); for (const a of menu.querySelectorAll('.pm-list a')) a.hidden = q && !a.dataset.name.includes(q); });
    find?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); menu.querySelector('.pm-list a:not([hidden])')?.click(); } });
    menu.addEventListener('click', placeClick);
    return { panel: menu, owned: true, first: find || menu.querySelector('a.on') };
  }
  function paintNav(d) {
    if (openPop?.btn.closest('#site-nav')) closePop();
    const link = (href, label, key, cls = '', title = '') => `<a href="${href}" data-k="${esc(key)}" class="${cls}${here === key ? ' on' : ''}"${here === key ? ' aria-current="page"' : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</a>`;
    const teams = d?.teams || [];
    const shown = teams.find((t) => here === 'team:' + t.id) || teams.find((t) => t.id === lastTeam.get()) || teams[0];
    let html = link(meHref, 'Me', 'me');
    if (shown) html += link(teamHref(shown), `<span class="pl-name">${esc(shown.name)}</span>`, 'team:' + shown.id, 'team', shown.name);
    if (teams.length) html += `<button type="button" class="caret" aria-haspopup="menu" aria-expanded="false" aria-label="${teams.length > 1 ? `All ${teams.length} teams` : 'Teams'}" title="${teams.length > 1 ? `All ${teams.length} teams` : 'Teams'} · start a team">${CARET}</button>`;
    else if (d && d.signedOut && d.signIn) html += `<a href="${esc(d.signIn)}" data-k="signin" class="add" title="Sign in to start or join a team">+ Team</a>`;
    else if (d && !d.signedOut) html += link(site('/team/new'), '+ Team', 'start', 'add', 'Start a team');
    if (d?.sim && !teams.length) html += link(site('/sim'), 'Simulate', 'sim', 'add');
    nav.innerHTML = html;
    const caret = nav.querySelector('.caret'); if (caret) popup(caret, () => teamMenu(teams, d));
    paintOffline();
    fit();
    if (trailOn) paintTrail();
  }
  let known = null; try { known = JSON.parse(store.get('puddle-nav') || 'null'); } catch {}

  const rp = bar.querySelector('#range'), rpBtn = bar.querySelector('#range-btn');
  if (rp && rpBtn) {
    const pop = popup(rpBtn, () => ({ panel: rp, first: rp.querySelector('[aria-pressed="true"]') }));
    const label = () => { const b = rp.querySelector('[aria-pressed="true"]'); if (b) rpBtn.querySelector('.rp-now').textContent = b.querySelector('b').textContent; };
    rp.addEventListener('click', (e) => { if (e.target.closest('button')) setTimeout(() => pop.close(true)); });
    new MutationObserver(label).observe(rp, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    label();
  }

  const more = bar.querySelector('#more-btn'), settingsBtn = bar.querySelector('#settings-btn');
  const tools = [...bar.querySelectorAll('[data-tuck]')].sort((a, b) => a.dataset.tuck - b.dataset.tuck);
  const pressed = (el) => el.getAttribute('aria-pressed') === 'true';
  const CHECK = '<i class="gm-on" aria-hidden="true">✓</i>';
  function gearMenu() {
    const m = Object.assign(document.createElement('div'), { className: 'place-menu gear-menu', role: 'menu' });
    const row = (el, label, extra = '') => `<button type="button" role="menuitem" data-for="${el.id}"${el.getAttribute('aria-disabled') === 'true' ? ' aria-disabled="true"' : ''}><span>${label}</span>${extra}</button>`;
    const theme = globalThis.PuddleTheme?.get?.() || 'auto';
    const LABELS = { 'arrange-btn': 'Arrange this page', 'learn-btn': 'Explain this page', 'demo-btn': 'Demo team', 'share-live': 'Share live' };
    const items = tools.filter((el) => el.classList.contains('tucked')).sort((a, b) => [...bar.querySelectorAll('[data-tuck]')].indexOf(a) - [...bar.querySelectorAll('[data-tuck]')].indexOf(b)).map((el) =>
      el.id === 'theme-btn' ? `<div class="gm-theme" role="group" aria-label="Theme"><span>Theme</span><span class="gm-seg">${['auto', 'light', 'dark'].map((t) => `<button type="button" role="menuitemradio" data-pick-theme="${t}" aria-pressed="${t === theme}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</span></div>`
        : el.id === 'sound-btn' ? row(el, 'Sounds', `<em>${pressed(el) ? 'On' : 'Off'}</em>`)
          : row(el, LABELS[el.id] || el.getAttribute('aria-label') || el.textContent.trim(), pressed(el) ? CHECK : ''));
    m.innerHTML = `${items.join('')}${items.length ? '<div class="pm-sep"></div>' : ''}
      <a role="menuitem" href="${esc(settingsBtn.getAttribute('href'))}" data-k="settings" class="${here === 'settings' ? 'on' : ''}">Settings</a>`;
    m.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pick-theme]'); if (t) { globalThis.PuddleTheme?.set(t.dataset.pickTheme); for (const b of m.querySelectorAll('[data-pick-theme]')) b.setAttribute('aria-pressed', String(b === t)); return; }
      const b = e.target.closest('[data-for]'); if (b) { if (b.getAttribute('aria-disabled') === 'true') return; closePop(true); bar.querySelector('#' + b.dataset.for)?.click(); return; }
      const a = e.target.closest('a'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      if (settingsBtn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); nudge(); return; }
      closePop(); for (const x of nav.querySelectorAll('a.on')) x.classList.remove('on'); more.classList.add('on'); opening();
    });
    return { panel: m, owned: true };
  }
  popup(more, gearMenu);
  const markMore = () => more.classList.toggle('lit', tools.some((el) => el.classList.contains('tucked') && el.id !== 'sound-btn' && pressed(el)));
  new MutationObserver(markMore).observe(bar, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });

  const sub = Object.assign(document.createElement('nav'), { className: 'subbar', id: 'trail' });
  sub.setAttribute('aria-label', 'You are here');
  top.append(sub);
  const under = ['/project', '/work'].includes(location.pathname) || (location.pathname === '/person' && q.has('user'));
  let trailOn = under, title = location.pathname === '/work' ? 'Conversations'
    : location.pathname === '/project' ? (q.get('p') || '').split(/[\\/]/).filter(Boolean).pop() || null : null;
  const CHEV = '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><path d="M7.5 2.5 2.5 8l5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function paintTrail() {
    sub.hidden = !trailOn; if (!trailOn) { sub.innerHTML = ''; return; }
    const steps = []; let u = new URL(location.href);
    for (let i = 0; i < 4; i++) {
      const b = u.searchParams.get('back'); if (!b || !b.startsWith('/') || b.startsWith('//') || b.startsWith('/\\')) break;
      const next = new URL(b, location.origin); if (next.pathname === '/') break;
      steps.unshift({ href: b, label: (u.searchParams.get('bt') || 'Back').slice(0, 40) }); u = next;
    }
    const tid = here.startsWith('team:') ? here.slice(5) : null;
    const place = q.get('demo') === '1' ? { href: '/?demo=1', label: 'Demo team' }
      : tid ? { href: site(`/?team=${tid}`), label: (known?.teams || []).find((t) => t.id === tid)?.name || 'Team' } : { href: meHref, label: 'Me' };
    steps.unshift(place);
    const prev = steps[steps.length - 1];
    sub.innerHTML = `<div class="sb-in"><a class="sb-back" href="${esc(prev.href)}" title="Back to ${esc(prev.label)}">${CHEV}<span>Back</span></a>
      <ol class="sb-path">${steps.map((x) => `<li><a href="${esc(x.href)}">${esc(x.label)}</a></li>`).join('')}<li aria-current="page">${title ? `<span>${esc(title)}</span>` : '<span class="sb-wait" aria-label="Loading"></span>'}</li></ol></div>`;
  }
  sub.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) opening(); });
  paintTrail();

  const over = () => bar.scrollWidth > bar.clientWidth + 1;
  const tuck = (el) => () => el.classList.add('tucked');
  const narrower = [...tools.map(tuck), () => bar.classList.add('quiet'), () => bar.classList.add('squeeze'), () => bar.classList.add('mark-only'), () => bar.classList.add('tight')];
  function fit() {
    bar.classList.remove('quiet', 'squeeze', 'mark-only', 'tight'); for (const el of tools) el.classList.remove('tucked');
    more.hidden = true; settingsBtn.hidden = false;
    for (let i = 0; i < narrower.length && over(); i++) {
      narrower[i]();
      if (i < tools.length) { more.hidden = false; settingsBtn.hidden = true; }
    }
    markMore();
  }
  if (typeof ResizeObserver === 'function') { let w = 0; new ResizeObserver(([e]) => { const nw = Math.round(e.contentRect.width); if (nw !== w) { w = nw; if (openPop) closePop(); fit(); } }).observe(bar); }
  document.fonts?.ready.then(fit);

  const st = { stream: null, fetched: 'ok', check: null, since: Date.now() };
  const statusEl = bar.querySelector('#status');
  const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function paintStatus() {
    let level = 'ok', text = 'Live', title = 'What you see is current and updates by itself.';
    const local = helper && page !== 'settings';
    if (offline) {
      level = 'warn'; text = 'No internet';
      title = local ? 'Your own numbers still update live from this Mac. Teams and Settings come back when you’re online.'
        : `Showing what was here at ${hhmm(st.since)}. Puddle keeps counting on your Mac and sends it when you’re back.`;
    } else if (st.fetched === 'busy') { level = 'warn'; text = 'Busy'; title = `Puddle is busy for a moment: showing what was here at ${hhmm(st.since)}. It catches up by itself.`; }
    else if (st.fetched === 'fail') { level = 'warn'; text = 'Reconnecting…'; title = `Can’t reach Puddle right now: showing what was here at ${hhmm(st.since)}. It tries again by itself.`; }
    else if (st.stream === false && performance.now() < 3000) { setTimeout(paintStatus, 3000 - performance.now()); }
    else if (st.stream === false) { level = 'warn'; text = 'Connecting…'; title = 'The live connection is reopening. The numbers are current as of the last update.'; }
    else if (st.stream === null) { text = 'Online'; title = 'Connected.'; }
    else if (st.check) ({ level, text, title } = st.check);
    statusEl.className = `pill status ${level}`;
    const was = statusEl.hidden + statusEl.querySelector('span').textContent;
    statusEl.hidden = level === 'ok';
    statusEl.querySelector('span').textContent = text;
    statusEl.title = title; statusEl.setAttribute('aria-label', text);
    if (was !== statusEl.hidden + text) fit();
  }
  const note = Object.assign(document.createElement('div'), { className: 'net-note', role: 'status' }); note.hidden = true;
  document.addEventListener('DOMContentLoaded', () => document.body.append(note));
  function paintOffline() {
    for (const a of [...nav.querySelectorAll('a'), ...(openPop?.owned ? openPop.panel.querySelectorAll('a') : []), bar.querySelector('#settings-btn')]) {
      const block = offline && needsSite(a) && !a.classList.contains('on');
      a.classList.toggle('needs-net', block);
      if (block) a.setAttribute('aria-disabled', 'true'); else if (a.getAttribute('aria-disabled') === 'true') a.removeAttribute('aria-disabled');
      if (block) a.title = 'Needs an internet connection'; else if (a.title === 'Needs an internet connection') a.removeAttribute('title');
    }
    note.textContent = helper && page !== 'settings'
      ? 'No internet. Your own numbers keep updating from this Mac; teams come back when you’re online.'
      : `No internet. Showing what was here at ${hhmm(st.since)}. Puddle keeps counting on your Mac and sends it when you’re back.`;
    note.hidden = !offline;
  }
  const nudge = () => { note.hidden = false; note.classList.remove('nudge'); void note.offsetWidth; note.classList.add('nudge'); };
  const placeClick = (e) => {
    const a = e.target.closest('a'); if (!a) return;
    if (a.classList.contains('needs-net')) { e.preventDefault(); nudge(); return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    for (const x of nav.querySelectorAll('a')) { x.classList.toggle('on', x === a); if (x === a) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); }
    bar.querySelector('#settings-btn')?.classList.remove('on');
    if (a.dataset.k?.startsWith('team:')) lastTeam.set(a.dataset.k.slice(5));
    closePop(); opening();
  };
  nav.addEventListener('click', placeClick);
  bar.querySelector('#settings-btn').addEventListener('click', (e) => { if (e.currentTarget.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; } for (const x of nav.querySelectorAll('a.on')) x.classList.remove('on'); e.currentTarget.classList.add('on'); opening(); });
  const opening = () => {
    const main = document.querySelector('main'); if (!main) return;
    main.setAttribute('aria-busy', 'true'); document.body.classList.add('leaving');
    main.innerHTML = `<div class="sk-page"><section class="kpis headline">${'<div class="kpi sk"></div>'.repeat(6)}</section>
      <div class="sk-cards"><section class="card sk" style="height:300px"></section><section class="card sk" style="height:300px"></section>
      <section class="card sk" style="height:220px"></section><section class="card sk" style="height:220px"></section></div></div>`;
  };
  addEventListener('pageshow', (e) => { if (e.persisted && document.body.classList.contains('leaving')) location.reload(); });
  const net = (on) => { offline = !on; paintNav(known); paintStatus(); if (on) dispatchEvent(new Event('puddle:online')); };
  addEventListener('online', () => net(true));
  addEventListener('offline', () => net(false));
  if (q.get('offline') === '1' && helper) { offline = true; history.replaceState(null, '', location.pathname); }
  paintNav(known);

  document.addEventListener('click', (e) => {
    const x = e.target.closest?.('[data-close]'); if (x?.closest('dialog')) { x.closest('dialog').close(); return; }
    const d = e.target;
    if (d instanceof HTMLDialogElement && d.open) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); }
  });
  const tipped = (n) => { for (; n && n !== document; n = n.parentNode) if (n.ontouchstart) return true; return false; };
  document.addEventListener('touchstart', (e) => { if (!tipped(e.target)) for (const t of document.querySelectorAll('.tip')) t.hidden = true; }, { passive: true });

  globalThis.PuddleBar = {
    page, here,
    nav(d) { if (!d) return; if (d.offline) offline = true; else if (navigator.onLine) offline = false; known = d.offline ? (d.teams?.length ? d : known) : d; if (!d.offline) store.set('puddle-nav', JSON.stringify(d)); paintNav(known); paintStatus(); },
    stream(on) { st.stream = on; if (on) st.since = Date.now(); paintStatus(); },
    fetched(how) { st.fetched = how; if (how === 'ok') st.since = Date.now(); paintStatus(); },
    check(c) { st.check = c; paintStatus(); },
    get offline() { return offline; },
    from: (name) => `back=${encodeURIComponent(location.pathname + location.search)}&bt=${encodeURIComponent(String(name || '').slice(0, 40))}`,
    teamName: (id) => (known?.teams || []).find((t) => t.id === id)?.name || null,
    title(t) { title = t ? String(t) : null; trailOn = trailOn || Boolean(title); paintTrail(); },
  };
  paintStatus();
})();
