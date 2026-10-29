// Me: the same one-person page a team lead sees (collector/public/person.js), from this Mac's history,
// plus Share live (a public page of your agent time). Counts only, never names unless you add them.
import { mountPerson } from '/person.js';

const $ = (s) => document.querySelector(s);
// Ask twice instead of confirm(): Puddle's windows never show browser dialogs (confirm() just says no there).
// The first click arms the button ("Click again to …"), a second within 4 s does it.
function sure(btn, text) {
  if (btn.dataset.armed) { delete btn.dataset.armed; clearTimeout(btn._t); return true; }
  const was = btn.textContent; btn.dataset.armed = '1'; btn.textContent = text; btn.classList.add('armed');
  btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = was; btn.classList.remove('armed'); }, 4000);
  return false;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// the same menu bar as the website (Me · teams, Settings as a gear on the right): team pages open right here, signed in by Puddle
fetch('/api/site-nav').then((r) => r.json()).then((d) => {
  const go = (to) => `/go?to=${encodeURIComponent(to)}`;
  if (d.signedOut && !d.signIn) { document.getElementById('share-live')?.remove(); return; } // built without a website: nothing to share to
  if (d.signedOut) { $('#me-nav').insertAdjacentHTML('beforeend', `<a href="${esc(d.signIn)}" class="signin-cta">Sign in to share with a team</a>`); return; }
  $('#me-nav').insertAdjacentHTML('beforeend', (d.teams || []).map((t) => `<a href="${go(t.canView ? `/?team=${t.id}` : `/team/${t.id}/share`)}">${esc(t.name)}</a>`).join(''));
  // Settings: a gear at the far right of the bar, as on the website
  document.querySelector('header.bar').insertAdjacentHTML('beforeend', `<a href="${go('/settings')}" class="icon-btn settings-btn" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(0 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(45 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(90 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(135 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(180 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(225 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(270 12 12)"/><rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(315 12 12)"/><path fill-rule="evenodd" d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 4.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z"/></svg></a>`);
}).catch(() => {});
mountPerson($('#pv'), { api: ({ from, to, tz }) => `/api/person?from=${from}&to=${to}&tz=${tz}`, stream: '/api/stream', you: true });

// Share live: a public page of your agent time (the service's copy, since you connected)
async function shareLive() {
  const d = document.createElement('dialog'); d.className = 'sheet share-sheet';
  const paint = (r, err) => {
    d.innerHTML = `<header><h2>Share live</h2><button class="icon-btn" data-close aria-label="Close">✕</button></header>` + (err
      ? `<p class="muted">${err}</p>`
      : r.url
        ? `<p>Anyone with this link sees your agent time, live. Counts and times only, never projects or prompts. It starts from when you connected Puddle.</p>
           <p class="share-url">${r.url}</p><div class="row"><button class="btn primary" data-a="copy">Copy link</button><a class="btn" href="${r.url}" target="_blank" rel="noopener">Open</a><button class="btn" data-a="new">New link</button><button class="btn" data-a="off">Turn off</button></div>`
        : `<p>A public page with your agent time, streak and rhythm, updating live. Counts only, never projects or prompts.</p><div class="row"><button class="btn primary" data-a="on">Share live</button></div>`);
    d.querySelector('[data-close]').onclick = () => d.close();
  };
  document.body.append(d); d.showModal(); d.addEventListener('close', () => d.remove());
  const call = async (action) => { const r = await fetch('/api/share', action ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-joule': '1' }, body: JSON.stringify({ action }) } : {}); const j = await r.json().catch(() => ({})); return r.ok ? paint(j) : paint(null, r.status === 401 ? 'Sign in to Puddle first: click ✱ in the menu bar, then Settings.' : j.error || 'Something went wrong.'); };
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'copy') { await navigator.clipboard.writeText(d.querySelector('.share-url').textContent).catch(() => {}); b.textContent = 'Copied'; return; }
    if (b.dataset.a === 'off' && !sure(b, 'Click again to turn off')) return;
    await call(b.dataset.a);
  });
  await call(null);
}
document.getElementById('share-live')?.addEventListener('click', shareLive);
