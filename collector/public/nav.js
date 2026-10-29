// The one menu every signed-in website page shows, always the same links in the same order:
// Me · each team, with the page you're on marked, and Settings as a gear at the far right of the bar. Account, sharing, teams and Sign out all
// live inside Settings (no "…" menus). Fills <nav id="site-nav">.
(async () => {
  const gear = globalThis.JOULE_GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(0 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(45 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(90 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(135 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(180 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(225 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(270 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(315 12 12)"/><path fill-rule="evenodd" d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 4.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z"/></svg>';
  const el = document.getElementById('site-nav');
  if (!el) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let d = { teams: [] };
  try { const r = await fetch('/api/me/nav'); if (!r.ok) return; d = await r.json(); } catch { return; }
  const q = new URLSearchParams(location.search), path = location.pathname;
  const teamHere = q.get('team') || (path.match(/^\/team\/([0-9a-f-]{36})/) || [])[1] || null;
  const inSettings = path.startsWith('/settings') || path === '/account' || path === '/upgrade' || /^\/team\//.test(path);
  const here = q.get('demo') === '1' ? '' : inSettings ? 'settings' : teamHere ? 'team:' + teamHere : path === '/' || path === '/person' ? 'me' : path === '/sim' ? 'sim' : '';
  // inside Puddle's window, "Me" is the app's own Me page (full history on this Mac), not the website's copy
  const appMe = (() => { try { const a = q.get('app'); if (a && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(a)) sessionStorage.setItem('joule-me', a); return sessionStorage.getItem('joule-me'); } catch { return null; } })();
  const link = (href, label, key, cls = '') => `<a href="${href}" class="${cls}${here === key ? ' on' : ''}"${here === key ? ' aria-current="page"' : ''}>${label}</a>`;
  el.innerHTML = link(appMe || '/?home=1', 'Me', 'me')
    + (d.teams.length ? d.teams.map((t) => link(t.canView ? `/?team=${esc(t.id)}` : `/team/${esc(t.id)}/share`, esc(t.name), 'team:' + t.id, 'team')).join('') : link('/settings/team/new', 'Start a team', 'start'))
    + (d.sim ? link('/sim', 'Simulate', 'sim') : ''); // a site on this machine only: fake live work, timed
  // Settings: a gear at the far right of the bar (after everything else there)
  el.closest('header')?.insertAdjacentHTML('beforeend', `<a href="/settings" class="icon-btn settings-btn${here === 'settings' ? ' on' : ''}" aria-label="Settings" title="Settings"${here === 'settings' ? ' aria-current="page"' : ''}>${gear}</a>`);
})();
