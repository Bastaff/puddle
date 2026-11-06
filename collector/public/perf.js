(() => {
  let told = false;
  const tell = () => { if (!told) { told = true; document.dispatchEvent(new Event('puddle:drawn')); } };
  const local = /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin);
  let helper = null;
  try {
    const a = new URLSearchParams(location.search).get('app');
    if (a && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(a)) sessionStorage.setItem('puddle-me', a);
    helper = local ? location.origin + '/' : (sessionStorage.getItem('puddle-me') || sessionStorage.getItem('joule-me'));
  } catch {  }
  const noop = () => {};
  if (!helper) { globalThis.PuddlePerf = { drawn: tell, card: noop, live: noop }; return; }
  const endpoint = local ? location.origin + '/api/perf' : '/api/perf';
  let run = null; try { run = sessionStorage.getItem('puddle-perf-run') || Math.random().toString(36).slice(2, 8); sessionStorage.setItem('puddle-perf-run', run); } catch {}

  const view = local ? 'me' : location.pathname === '/person' ? 'person' : location.pathname.startsWith('/settings') ? 'settings' : new URLSearchParams(location.search).has('team') ? 'team' : 'page';
  const buf = [];
  const put = (e) => { buf.push({ t: Date.now(), view, run, ...e }); };
  const flush = () => {
    if (!buf.length) return;
    const body = JSON.stringify(buf.splice(0, buf.length));
    if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' })))) fetch(endpoint, { method: 'POST', body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
  };
  setInterval(flush, 3000);
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  const KEY = 'puddle-perf-action';
  const label = (el) => {
    const rangeBtn = el.closest('#range button, .pv-range button, [data-r]');
    if (rangeBtn) return 'range ' + (rangeBtn.dataset.r || rangeBtn.textContent.trim()).slice(0, 8);
    if (el.closest('.pf-all')) return 'all people';
    if (el.closest('.brow.body')) return 'person row';
    if (el.closest('.settings-btn, a[href$="/settings"]')) return 'settings';
    for (const [sel, name] of [['#demo-btn', 'demo'], ['#theme-btn', 'theme'], ['#sound-btn', 'sound'], ['#learn-btn', 'learn'], ['.trail a, a.back', 'back']]) if (el.closest(sel)) return name;
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
    put({ kind: 'click', label: name });
    const leaves = name.startsWith('to ') || ev.target.closest('a[href]');
    if (leaves) flush();
    if (!name.startsWith('to ')) { try { sessionStorage.setItem(KEY, JSON.stringify(pending)); } catch {} }
  }, true);

  try {
    new PerformanceObserver((list) => {
      for (const r of list.getEntries()) {
        const u = new URL(r.name, location.href);
        if (!u.pathname.startsWith('/api/') || u.pathname === '/api/perf') continue;
        put({ kind: 'request', label: u.pathname + (u.searchParams.get('parts') ? '?parts' : '') + (u.searchParams.get('user') ? '?user' : '') + (u.searchParams.get('demo') ? '?demo' : ''),
          ms: Math.round(r.duration), kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024), at: Math.round(r.startTime) });
      }
    }).observe({ type: 'resource', buffered: true });
  } catch {  }

  let first = true;
  globalThis.PuddlePerf = {
    drawn(what = view) {
      tell();
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
  if (document.currentScript?.dataset.auto != null) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => globalThis.PuddlePerf.drawn()); else globalThis.PuddlePerf.drawn();
  }
})();
