(() => {
  const KEY = 'puddle-shape', ROW = 8, KEEP = 40;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const write = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} };
  const q = new URLSearchParams(location.search);
  const page = `${location.pathname}|${q.get('team') || ''}|${q.get('user') || ''}|${Math.round(innerWidth / 40)}`;
  const main = document.querySelector('main');
  if (!main) return;
  const gap = () => parseFloat(getComputedStyle(main).rowGap) || 0;
  const span = (h) => `span ${Math.max(1, Math.ceil((h + gap()) / (ROW + gap())))}`;
  const ESTIMATE = { prompts: 265, issues: 290, map: 230, models: 240, lines: 180, calendar: 212, features: 305, recent: 300 };
  const idOf = (c) => c.dataset.card || (c.classList.contains('pv-head') ? 'head' : c.classList.contains('pv-bar') ? 'bar' : null);
  const teamSize = () => {
    try { const t = JSON.parse(localStorage.getItem('puddle-nav') || 'null')?.teams?.find((x) => x.id === q.get('team')); return Number(t?.members) || 0; } catch { return 0; }
  };
  const all0 = read(), bucket = `|${Math.round(innerWidth / 40)}`;
  const exact = all0[page];
  const was = exact || Object.entries(all0).filter(([k]) => k.startsWith(`${location.pathname}|`) && k.endsWith(bucket)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))[0]?.[1];
  const place = (c, m, h) => {
    if (m) { c.style.order = m.o; if (m.z) c.dataset.size = m.z; c.toggleAttribute('data-off', Boolean(m.off)); if (m.hid) { c.hidden = true; c.dataset.empty = '1'; } }
    if (h) { c.style.minHeight = `${h}px`; c.style.gridRowEnd = span(h); }
  };

  if (main.id === 'grid') {
    if (was) main.classList.add('lgrid');
    for (const c of main.querySelectorAll(':scope > .card[data-card]')) {
      c.dataset.wait = '1';
      const m = was?.[c.dataset.card];
      const people = c.dataset.card === 'people' && (!exact || !m) && teamSize() ? 115 + teamSize() * 51 : 0;
      place(c, m, people || (m ? m.h : ESTIMATE[c.dataset.card]));
    }
    main.removeAttribute('aria-busy');
  } else if (was?.order?.length) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
    main.classList.add('lgrid');
    main.innerHTML = was.order.map((id) => {
      const m = was[id];
      if (id === 'bar') return `<div class="pv-bar" style="min-height:${m.h}px;grid-row-end:${span(m.h)};order:-1"></div>`;
      return `<section class="card${id === 'head' ? ' pv-head' : ''}"${id === 'head' ? '' : ` data-card="${esc(id)}"`} data-wait="1"${m.z ? ` data-size="${esc(m.z)}"` : ''}${m.off ? ' data-off' : ''} style="min-height:${m.h}px;grid-row-end:${span(m.h)};order:${id === 'head' ? -1 : m.o}">${m.t ? `<header><h2>${esc(m.t)}</h2></header>` : ''}</section>`;
    }).join('');
  }

  let timer = null;
  const keep = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (['leaving', 'arranging'].some((k) => document.body.classList.contains(k))) return;
      const parts = [...main.children].filter(idOf);
      const waits = (c) => c.hasAttribute('data-wait') || c.classList.contains('sk') || Boolean(c.querySelector(':scope > .sk'));
      if (!parts.some((c) => !waits(c) && idOf(c) !== 'bar')) return;
      const all = read(), prev = all[page] || {}, next = { at: Date.now(), order: [] };
      for (const c of parts) {
        const id = idOf(c);
        if (waits(c) && !c.hasAttribute('data-off')) { if (prev[id]) { next[id] = prev[id]; next.order.push(id); } continue; }
        next.order.push(id);
        next[id] = { h: Math.round(c.getBoundingClientRect().height), hid: c.hidden, off: c.hasAttribute('data-off'), o: Number(c.style.order) || 0, z: c.dataset.size || '', t: c.querySelector(':scope > header h2')?.textContent || '' };
      }
      next.order.sort((a, b) => (next[a].o || 0) - (next[b].o || 0));
      all[page] = next;
      const keys = Object.keys(all);
      if (keys.length > KEEP) for (const k of keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0)).slice(0, keys.length - KEEP)) delete all[k];
      write(all);
    }, 700);
  };
  const sizes = new ResizeObserver(keep);
  for (const c of main.children) sizes.observe(c);
  new MutationObserver(() => { for (const c of main.children) sizes.observe(c); keep(); }).observe(main, { childList: true });

  globalThis.PuddleShape = {
    ready(c) {
      if (!c?.hasAttribute('data-wait')) return;
      c.removeAttribute('data-wait');
      c.style.minHeight = '';
      c.classList.add('card-in');
      setTimeout(() => c.classList.remove('card-in'), 600);
    },
    row(id) { const h = (read()[page] || was)?.[id]?.h; return h ? span(h) : ''; },
    hold(c, id) {
      const h = (read()[page] || was)?.[id]?.h || ESTIMATE[id] || 0;
      c.dataset.wait = '1';
      if (h) c.style.minHeight = `${h}px`;
    },
  };
})();
