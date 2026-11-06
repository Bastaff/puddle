(() => {
  const KEY = 'cu-theme', MODES = ['auto', 'light', 'dark'];
  const ok = (t) => MODES.includes(t);
  const puddlePage = location.hostname === '127.0.0.1';
  const inPuddle = puddlePage || (() => { try { return Boolean(sessionStorage.getItem("puddle-me") || sessionStorage.getItem("joule-me")); } catch { return false; } })();
  const listeners = [];
  const read = () => { try { const t = localStorage.getItem(KEY); return ok(t) ? t : 'auto'; } catch { return 'auto'; } };
  const btns = () => document.querySelectorAll('#theme-btn, #theme');
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
  function set(t, { from = 'user' } = {}) {
    if (!ok(t)) return;
    const changed = t !== read();
    try { localStorage.setItem(KEY, t); } catch {}
    apply(t);
    if (from !== 'joule' && puddlePage) fetch('/api/theme', { method: 'POST', headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
    if (from === 'user' && inPuddle && !puddlePage) { try { location.href = '/__joule/theme_' + t; } catch {} }
    if (changed) for (const f of listeners) f(t, from);
  }
  const next = () => { const mac = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const shown = read() === 'auto' ? mac : read(), want = shown === 'dark' ? 'light' : 'dark'; return want === mac ? 'auto' : want; };

  const q = new URL(location.href);
  if (ok(q.searchParams.get('theme'))) {
    set(q.searchParams.get('theme'), { from: 'link' });
    q.searchParams.delete('theme'); try { history.replaceState(history.state, '', q); } catch {}
  } else apply(read());
  const sync = () => puddlePage && fetch('/api/theme').then((r) => r.json()).then((d) => { if (ok(d.theme) && d.theme !== read()) set(d.theme, { from: 'joule' }); }).catch(() => {});
  sync();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  addEventListener('storage', (e) => { if (e.key === KEY) apply(read()); });

  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]'); if (!a) return;
    let u; try { u = new URL(a.href, location.href); } catch { return; }
    if (u.origin === location.origin || !/^https?:$/.test(u.protocol)) return;
    if (!(u.hostname === '127.0.0.1' || puddlePage)) return;
    u.searchParams.set('theme', read()); a.href = u.toString();
  }, true);

  for (const b of btns()) b.addEventListener('click', () => set(next()));
  globalThis.PuddleTheme = { get: read, set, next, onChange: (f) => listeners.push(f) };
})();
