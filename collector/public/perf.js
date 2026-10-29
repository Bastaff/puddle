// Timing trace, inside the Puddle app only: how long each page and each click takes until its content is on
// screen, which requests it made and how long they took, how live updates land. Sent to this Mac's Puddle helper,
// which keeps it in ~/.joule/logs/perf.ndjson. Timings, kinds of action and request paths only: never data,
// names or text. Outside the app (the website in a browser) it does nothing.
// Pages call JoulePerf.drawn(view) when their main content is drawn, JoulePerf.card(name) when a card fills,
// JoulePerf.live('arrived' | 'drawn') around a live update.
(() => {
  const local = /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin); // Me, served by Puddle itself
  let helper = null;
  try {
    const a = new URLSearchParams(location.search).get('app');
    if (a && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(a)) sessionStorage.setItem('joule-me', a);
    helper = local ? location.origin + '/' : sessionStorage.getItem('joule-me');
  } catch { /* storage blocked: no trace */ }
  const noop = () => {};
  if (!helper) { globalThis.JoulePerf = { drawn: noop, card: noop, live: noop }; return; }
  // Me posts to the helper it's served by; website pages to the website itself (the app's webview won't let an https
  // page post to this Mac's plain-http address), which logs it
  const endpoint = local ? location.origin + '/api/perf' : '/api/perf';
  // an anonymous id per window, so one run can be told apart from another
  let run = null; try { run = sessionStorage.getItem('joule-perf-run') || Math.random().toString(36).slice(2, 8); sessionStorage.setItem('joule-perf-run', run); } catch {}

  // which view this is, in words (never ids or names)
  const view = local ? 'me' : location.pathname === '/person' ? 'person' : location.pathname.startsWith('/settings') ? 'settings' : new URLSearchParams(location.search).has('team') ? 'team' : 'page';
  const buf = [];
  const put = (e) => { buf.push({ t: Date.now(), view, run, ...e }); };
  const flush = () => {
    if (!buf.length) return;
    const body = JSON.stringify(buf.splice(0, buf.length));
    // a beacon also leaves when the page is going away (a click to another view)
    if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' })))) fetch(endpoint, { method: 'POST', body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
  };
  setInterval(flush, 3000);
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  // a click starts an action; it ends when the page next says its content is drawn, on this page or the next one
  // (switching between Me and a team is a navigation: the start is carried over in sessionStorage)
  const KEY = 'joule-perf-action';
  const label = (el) => {
    const rangeBtn = el.closest('#range button, .pv-range button, [data-r]');
    if (rangeBtn) return 'range ' + (rangeBtn.dataset.r || rangeBtn.textContent.trim()).slice(0, 8);
    if (el.closest('.pf-all')) return 'all people';
    if (el.closest('.brow.body')) return 'person row';
    if (el.closest('.settings-btn, a[href$="/settings"]')) return 'settings';
    for (const [sel, name] of [['#demo-btn', 'demo'], ['#theme-btn', 'theme'], ['#sound-btn', 'sound'], ['#learn-btn', 'learn'], ['.pv-back, a.back', 'back']]) if (el.closest(sel)) return name;
    const a = el.closest('a[href]');
    if (a) {
      const h = a.getAttribute('href');
      if (/^http:\/\/127\.0\.0\.1:\d+\/?(\?.*)?$/.test(h) || (h === '/' && local)) return 'to me';
      if (/[?&]team=|go\?to=%2F%3Fteam|go\?to=team/.test(h)) return 'to team';
      if (/settings/.test(h)) return 'settings';
      return 'link';
    }
    return null;
  };
  let pending = null;
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && Date.now() - s.t0 < 120_000) pending = { ...s, crossed: true }; sessionStorage.removeItem(KEY); } catch {}
  document.addEventListener('click', (ev) => {
    const name = label(ev.target);
    if (!name) return;
    pending = { name, t0: Date.now(), from: view };
    put({ kind: 'click', label: name }); // also on its own: a switch to another origin (Me ↔ a team) is paired up from these
    // a switch between Me and a team lands on another origin: paired from the clicks, never carried (it would be
    // picked up again on coming back); a click that leaves the page sends the trace before it goes
    const leaves = name.startsWith('to ') || ev.target.closest('a[href]');
    if (leaves) flush();
    if (!name.startsWith('to ')) { try { sessionStorage.setItem(KEY, JSON.stringify(pending)); } catch {} }
  }, true);

  // requests this page made: path (no query values), time, size
  try {
    new PerformanceObserver((list) => {
      for (const r of list.getEntries()) {
        const u = new URL(r.name, location.href);
        if (!u.pathname.startsWith('/api/') || u.pathname === '/api/perf') continue;
        put({ kind: 'request', label: u.pathname + (u.searchParams.get('parts') ? '?parts' : '') + (u.searchParams.get('user') ? '?user' : '') + (u.searchParams.get('demo') ? '?demo' : ''),
          ms: Math.round(r.duration), kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024), at: Math.round(r.startTime) });
      }
    }).observe({ type: 'resource', buffered: true });
  } catch { /* no resource timing */ }

  let first = true;
  globalThis.JoulePerf = {
    drawn(what = view) {
      if (first) {
        first = false;
        const nav = performance.getEntriesByType('navigation')[0];
        put({ kind: 'load', label: what, ms: Math.round(performance.now()), ttfb: nav ? Math.round(nav.responseStart) : null });
      }
      if (pending) {
        put({ kind: 'action', label: pending.name, from: pending.from, ms: Date.now() - pending.t0, crossed: Boolean(pending.crossed) });
        pending = null;
        try { sessionStorage.removeItem(KEY); } catch {}
      }
    },
    card(name) { put({ kind: 'card', label: name, ms: Math.round(performance.now()) }); },
    live(stage) {
      if (stage === 'arrived') this._liveAt = performance.now();
      else if (this._liveAt != null) { put({ kind: 'live', label: 'update drawn', ms: Math.round(performance.now() - this._liveAt) }); this._liveAt = null; }
    },
  };
  // pages without their own hook (Settings): drawn once the document is ready
  if (document.currentScript?.dataset.auto != null) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => globalThis.JoulePerf.drawn()); else globalThis.JoulePerf.drawn();
  }
})();
