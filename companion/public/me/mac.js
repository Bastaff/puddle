(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const site = (to) => `/go?to=${encodeURIComponent(to)}`;
  const app = `http://127.0.0.1:${Number(location.port) - 1}/?app`;
  const srow = (title, sub, acts = '') => `<div class="srow"><div class="txt"><b>${title}</b>${sub ? `<span class="muted">${sub}</span>` : ''}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
  const [mac, nav] = await Promise.all([fetch('/api/mac').then((r) => r.json()).catch(() => ({ accounts: [] })),
    fetch('/api/site-nav').then((r) => r.json()).catch(() => ({ teams: [] }))]);
  const teams = mac.connected ? nav.teams || [] : [];

  globalThis.PuddleBar?.nav(mac.connected ? nav : { teams: [], signedOut: true });
  $('#rail').innerHTML = `<h3>Settings</h3>${mac.connected ? `<a href="${site('/settings')}">Account</a><a href="${site('/settings/sharing')}">Sharing</a>` : ''}<a class="on" aria-current="page">This Mac</a>
    ${mac.connected ? `<small>Teams</small>${teams.map((t) => `<a href="${site(`/settings/team/${t.id}`)}">${esc(t.name)}<span class="role">${t.owner ? 'owner' : 'member'}</span></a>`).join('')}
    <a href="${site('/team/new')}" class="new">+ New team</a>` : ''}`;

  const who = (a) => (a.kind === 'unknown' ? 'Other account' : `${esc(a.org || a.plan || '')} · ${a.kind === 'work' ? 'work' : a.kind === 'personal' ? 'personal' : 'API'}`);
  const ico = (tool) => { const a = globalThis.PuddleAgents?.agent(tool); return a ? `<span class="ico ${a.ico}">${a.letter}</span>` : ''; };
  $('#mac').innerHTML = `<div class="head"><h1>This Mac</h1></div>
    <section class="card">${mac.connected
      ? srow('Puddle on this Mac', `Signed in as ${esc(mac.email || 'you')}. Your work reaches your teams from here. Sign out in <a href="${site('/settings')}">Account</a>.`)
      : mac.website === false ? srow('Puddle on this Mac', 'Built without a website: Puddle only counts here, and nothing leaves this Mac')
      : srow('Puddle on this Mac', 'Not signed in: Puddle only counts here, and no team sees anything', `<a class="btn2" href="${app}">Sign in</a>`)}</section>
    <h2>What Puddle counts</h2>
    <section class="card">${(mac.accounts || []).map((a) => `<div class="srow"><div class="txt mac-acct">${ico(a.tool)}<span><b>${esc(globalThis.PuddleAgents?.agent(a.tool)?.short || a.tool)}</b><span class="muted">${who(a)}</span></span></div></div>`).join('')
      || srow('Nothing yet', 'No Claude Code or Codex use found on this Mac yet')}</section>
    <p class="muted small">Claude Code and Codex on this Mac. Chats and Cowork in the Claude app aren't counted.</p>
    ${mac.connected ? `<h2>Join a team</h2>
    <section class="card"><form class="srow" id="join"><div class="txt"><b>Invite link</b><span class="muted">Paste the link you were sent; the team then sees all your agent work, your earlier work included</span></div>
      <div class="acts"><input type="text" id="link" placeholder="https://…/join/…" autocomplete="off" required><button class="btn2">Join</button></div></form></section>
    <p class="err" id="join-err">${esc(new URLSearchParams(location.search).get('err') || '')}</p>` : ''}
    <p class="muted small version-line">Puddle ${esc((mac.version || 'from source').replace(/-(\d+)$/, ' ($1)'))}</p>`;
  $('#mac').setAttribute('aria-busy', 'false');
  $('#join')?.addEventListener('submit', (e) => { e.preventDefault(); location.href = `${app}&join=${encodeURIComponent($('#link').value.trim())}`; });
})();
