// Settings → This Mac (served by Puddle at /mac): the same page as the website's other Settings (its bar, its rail, its
// cards), holding only what this Mac knows: who Puddle is signed in as here, which coding accounts it counts, and
// joining a team with an invite link. The rest of Settings (account, sharing, teams) opens on the website through
// /go, signed in; joining hands over to Puddle's window, which asks what the team may see.
(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const site = (to) => `/go?to=${encodeURIComponent(to)}`; // a website page, signed in as this Mac
  const app = `http://127.0.0.1:${Number(location.port) - 1}/?app`; // Puddle's own window (sign-in, joining)
  const srow = (title, sub, acts = '') => `<div class="srow"><div class="txt"><b>${title}</b>${sub ? `<span class="muted">${sub}</span>` : ''}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
  const [mac, nav] = await Promise.all([fetch('/api/mac').then((r) => r.json()).catch(() => ({ accounts: [] })),
    fetch('/api/site-nav').then((r) => r.json()).catch(() => ({ teams: [] }))]);
  const teams = mac.connected ? nav.teams || [] : [];

  // the bar and the rail, as on every Settings page (Settings itself marked, This Mac in the rail)
  $('#mac-nav').innerHTML = `<a href="/">Me</a>${teams.map((t) => `<a href="${site(t.canView ? `/?team=${t.id}` : `/team/${t.id}/share`)}">${esc(t.name)}</a>`).join('')}${nav.sim ? `<a href="${site('/sim')}">Simulate</a>` : ''}`;
  if (mac.connected) $('header.bar').insertAdjacentHTML('beforeend', `<a href="${site('/settings')}" class="icon-btn settings-btn on" aria-label="Settings" title="Settings" aria-current="page">${globalThis.JOULE_GEAR || ''}</a>`);
  $('#rail').innerHTML = `<h3>Settings</h3>${mac.connected ? `<a href="${site('/settings')}">Account</a><a href="${site('/settings/sharing')}">Sharing</a>` : ''}<a class="on" aria-current="page">This Mac</a>
    ${mac.connected ? `<small>Teams</small>${teams.map((t) => `<a href="${site(`/settings/team/${t.id}`)}">${esc(t.name)}<span class="role">${t.owner ? 'owner' : 'member'}</span></a>`).join('')}
    <a href="${site('/settings/team/new')}" class="new">+ New team</a>` : ''}`;

  const who = (a) => (a.kind === 'unknown' ? 'Other account' : `${esc(a.org || a.plan || '')} · ${a.kind === 'work' ? 'work' : a.kind === 'personal' ? 'personal' : 'API'}`);
  const ico = (tool) => { const a = globalThis.JouleAgents?.agent(tool); return a ? `<span class="ico ${a.ico}">${a.letter}</span>` : ''; };
  $('#mac').innerHTML = `<div class="head"><h1>This Mac</h1></div>
    <section class="card">${mac.connected
      ? srow('Puddle on this Mac', `Signed in as ${esc(mac.email || 'you')}. Your work reaches your teams from here. Sign out in <a href="${site('/settings')}">Account</a>.`)
      : mac.website === false ? srow('Puddle on this Mac', 'Built without a website: Puddle only counts here, and nothing leaves this Mac')
      : srow('Puddle on this Mac', 'Not signed in: Puddle only counts here, and no team sees anything', `<a class="btn2" href="${app}">Sign in</a>`)}</section>
    <h2>What Puddle counts</h2>
    <section class="card">${(mac.accounts || []).map((a) => `<div class="srow"><div class="txt mac-acct">${ico(a.tool)}<span><b>${esc(globalThis.JouleAgents?.agent(a.tool)?.short || a.tool)}</b><span class="muted">${who(a)}</span></span></div></div>`).join('')
      || srow('Nothing yet', 'No Claude Code or Codex use found on this Mac yet')}</section>
    <p class="muted small">Claude Code and Codex on this Mac. Chats and Cowork in the Claude app aren't counted.</p>
    ${mac.connected ? `<h2>Join a team</h2>
    <section class="card"><form class="srow" id="join"><div class="txt"><b>Invite link</b><span class="muted">Paste the link you were sent; you choose what the team sees next</span></div>
      <div class="acts"><input type="text" id="link" placeholder="https://…/join/…" autocomplete="off" required><button class="btn2">Join</button></div></form></section>
    <p class="err" id="join-err">${esc(new URLSearchParams(location.search).get('err') || '')}</p>` : ''}
    <p class="muted small version-line">Puddle ${esc(mac.version || 'from source')}</p>`;
  $('#mac').setAttribute('aria-busy', 'false');
  // joining: Puddle's window takes the invite and asks what the team may see
  $('#join')?.addEventListener('submit', (e) => { e.preventDefault(); location.href = `${app}&join=${encodeURIComponent($('#link').value.trim())}`; });
})();
