// The one theme switch for every Puddle screen: auto → light → dark, remembered as "cu-theme".
// Puddle's window moves between pages Puddle serves (127.0.0.1: Me, This Mac, the popover) and the website (team,
// Settings), and each address keeps its own memory, so the setting travels with you:
//   · Puddle's own pages ask Puddle for it (GET /api/theme) and tell it when it changes;
//   · links between Puddle and the website carry ?theme=…, and a page given one adopts it;
//   · the app watches Puddle's setting and themes its window and the menu-bar popover to match; a click on the
//     website inside Puddle's window tells the app directly (/__joule/theme_<mode>). Nothing ever navigates on load.
// Pages put the same few lines in <head> first (THEME_BOOT), so the right theme is there before the first paint.
(() => {
  const KEY = 'cu-theme', MODES = ['auto', 'light', 'dark'];
  const ok = (t) => MODES.includes(t);
  const joulePage = location.hostname === '127.0.0.1'; // served by Puddle on this Mac
  const inJoule = joulePage || (() => { try { return Boolean(sessionStorage.getItem('joule-me')); } catch { return false; } })();
  const listeners = [];
  const read = () => { try { const t = localStorage.getItem(KEY); return ok(t) ? t : 'auto'; } catch { return 'auto'; } };
  const btns = () => document.querySelectorAll('#theme-btn, #theme');
  // the button shows the mode it's in: auto (half and half, with an "A"), light (a sun), dark (a moon)
  const S = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">${body}</svg>`;
  const ICON = {
    auto: S('<circle cx="11" cy="12" r="9" opacity=".28"/><path d="M11 3a9 9 0 0 1 0 18z"/><circle cx="18.6" cy="18.4" r="5" fill="var(--page, #fff)"/><circle cx="18.6" cy="18.4" r="4.2"/><path d="M16.7 20.4l1.9-4.6 1.9 4.6M17.4 18.9h2.4" fill="none" stroke="var(--page, #fff)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    light: S('<circle cx="12" cy="12" r="5.2"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="10.9" y="1.4" width="2.2" height="4" rx="1.1" opacity=".55" transform="rotate(${a} 12 12)"/>`).join('')),
    dark: S('<path d="M19.6 14.6A8.4 8.4 0 0 1 9.4 4.4a8.4 8.4 0 1 0 10.2 10.2z"/><circle cx="17.2" cy="5.6" r="1.5" opacity=".55"/><circle cx="20.4" cy="9.4" r="1" opacity=".55"/>'),
  };
  const LABEL = { auto: 'Theme: auto (follows your Mac)', light: 'Theme: light', dark: 'Theme: dark' };
  function apply(t) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    for (const b of btns()) { b.dataset.mode = t; b.title = b.ariaLabel = LABEL[t]; if (b.dataset.icon !== t) { b.innerHTML = ICON[t]; b.dataset.icon = t; } }
  }
  // remember locally; tell Puddle (its pages) and the app (inside its window) unless this came from them
  function set(t, { from = 'user' } = {}) {
    if (!ok(t)) return;
    const changed = t !== read();
    try { localStorage.setItem(KEY, t); } catch {}
    apply(t);
    if (from !== 'joule' && joulePage) fetch('/api/theme', { method: 'POST', headers: { 'content-type': 'application/json', 'x-joule': '1' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
    // the website inside Puddle's window can't reach Puddle's file, so a click asks the app (it cancels this
    // navigation and saves it); Puddle's own pages saved it above and the app picks that up by itself
    if (from === 'user' && inJoule && !joulePage) { try { location.href = '/__joule/theme_' + t; } catch {} }
    if (changed) for (const f of listeners) f(t, from);
  }
  const next = () => ({ auto: 'light', light: 'dark', dark: 'auto' })[read()];

  // a page opened with ?theme=… (from Puddle, or from the website inside Puddle) adopts it, then tidies the address
  const q = new URL(location.href);
  if (ok(q.searchParams.get('theme'))) {
    set(q.searchParams.get('theme'), { from: 'link' });
    q.searchParams.delete('theme'); try { history.replaceState(history.state, '', q); } catch {}
  } else apply(read());
  // Puddle's pages: Puddle's setting wins (it's the one the popover, This Mac and Me share)
  const sync = () => joulePage && fetch('/api/theme').then((r) => r.json()).then((d) => { if (ok(d.theme) && d.theme !== read()) set(d.theme, { from: 'joule' }); }).catch(() => {});
  sync();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  addEventListener('storage', (e) => { if (e.key === KEY) apply(read()); }); // another tab of this address changed it

  // links that leave for Puddle's pages (or from them to the website) take the setting along
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]'); if (!a) return;
    let u; try { u = new URL(a.href, location.href); } catch { return; }
    if (u.origin === location.origin || !/^https?:$/.test(u.protocol)) return;
    if (!(u.hostname === '127.0.0.1' || joulePage)) return; // only between Puddle and the website
    u.searchParams.set('theme', read()); a.href = u.toString();
  }, true);

  for (const b of btns()) b.addEventListener('click', () => set(next()));
  globalThis.JouleTheme = { get: read, set, next, onChange: (f) => listeners.push(f) };
})();
