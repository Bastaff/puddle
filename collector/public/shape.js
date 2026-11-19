(() => {
  const KEY = 'puddle-shape', KEEP = 40;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const write = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} };
  const q = new URLSearchParams(location.search);
  const page = `${location.pathname}|${q.get('team') || ''}|${q.get('user') || ''}|${Math.round(innerWidth / 40)}`;
  const main = document.querySelector('main');
  if (!main) return;
  const ESTIMATE = { today: 300, agent: 330, built: 420, squares: 400, shipped: 330, leverage: 300, week: 320, handsoff: 290, prompts: 265, issues: 290, map: 230, models: 240, lines: 180, calendar: 212, features: 305, recent: 300 };
  const idOf = (c) => c.dataset.card || (c.classList.contains('pv-head') ? 'head' : c.classList.contains('pv-bar') ? 'bar' : null);
  const teamSize = () => {
    try { const t = JSON.parse(localStorage.getItem('puddle-nav') || 'null')?.teams?.find((x) => x.id === q.get('team')); return Number(t?.members) || 0; } catch { return 0; }
  };
  const all0 = read(), bucket = `|${Math.round(innerWidth / 40)}`;
  const exact = all0[page];
  const was = exact || Object.entries(all0).filter(([k]) => k.startsWith(`${location.pathname}|`) && k.endsWith(bucket)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))[0]?.[1];
  const place = (c, m, h) => {
    if (m) { c.style.order = m.o; if (m.z) c.dataset.size = m.z; if (m.s) c.style.gridColumn = m.s; c.toggleAttribute('data-off', Boolean(m.off)); if (m.hid) { c.hidden = true; c.dataset.empty = '1'; } }
    if (h) c.style.minHeight = `${h}px`;
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
    const tiled = was.order.some((id) => /^\d+ \/ span \d+$/.test(was[id]?.g || ''));
    main.classList.add('lgrid'); main.classList.toggle('tgrid', tiled);
    if (tiled) main.style.gridTemplateRows = 'auto';
    const span = (v) => /^(\d+ \/ )?span \d+$/.test(v || '');
    main.innerHTML = was.order.map((id) => {
      const m = was[id];
      if (id === 'bar') return `<div class="pv-bar" style="min-height:${m.h}px;order:-1;${tiled ? 'grid-row:1;grid-column:1 / -1;' : ''}"></div>`;
      return `<section class="card${id === 'head' ? ' pv-head' : ''}"${id === 'head' ? '' : ` data-card="${esc(id)}"`} data-wait="1"${m.z ? ` data-size="${esc(m.z)}"` : ''}${m.off ? ' data-off' : ''} style="${tiled ? '' : `min-height:${m.h}px;`}${span(m.s) ? `grid-column:${m.s};` : ''}${tiled && span(m.g) ? `grid-row:${m.g};` : ''}order:${id === 'head' ? -1 : m.o}">${m.t ? `<header><h2>${esc(m.t)}</h2></header>` : ''}</section>`;
    }).join('');
  }

  if (main.classList.contains('pv')) {
    const H = [.45, .7, .35, .9, .6, .8, .4, 1, .55, .75];
    const bars = H.map((h, i) => `<rect class="b" style="--i:${i}" x="${i * 12}" y="${60 - h * 56}" width="9" height="${h * 56}" rx="3"/>`).join('');
    const sq = Array.from({ length: 10 }, (_, i) => `<rect class="q" style="--i:${i}" x="${(i % 5) * 24}" y="${Math.floor(i / 5) * 24 + 12}" width="20" height="20" rx="5"/>`).join('');
    const PIC = {
      squares: sq,
      shipped: '<path class="l" d="M2 56 C30 54 40 40 60 34 S96 12 118 6" pathLength="1"/>',
      handsoff: '<circle class="o" cx="60" cy="30" r="24" pathLength="1"/>',
      built: [[0, 58], [60, 34], [96, 24]].map(([x, w], i) => `<rect class="b" style="--i:${i * 2}" x="${x}" y="22" width="${w - 3}" height="26" rx="6"/>`).join(''),
      flags: [0, 1, 2].map((i) => `<rect class="q" style="--i:${i}" x="0" y="${i * 20 + 4}" width="${[110, 84, 96][i]}" height="12" rx="6"/>`).join(''),
    };
    for (const c of main.querySelectorAll(':scope > .card[data-card]')) {
      if (c.querySelector('.sk-pic')) continue;
      c.insertAdjacentHTML('beforeend', `<div class="sk-pic" aria-hidden="true"><svg viewBox="0 0 120 60" preserveAspectRatio="xMidYMax meet">${PIC[c.dataset.card] || bars}</svg></div>`);
    }
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
        next[id] = { h: Math.round(c.getBoundingClientRect().height), hid: c.hidden, off: c.hasAttribute('data-off'), o: Number(c.style.order) || 0, z: c.dataset.size || '', s: c.style.gridColumn || '', g: c.style.gridRow || '', t: c.querySelector(':scope > header h2')?.textContent || '' };
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
  new MutationObserver(keep).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  globalThis.PuddleShape = {
    ready(c) {
      if (!c?.hasAttribute('data-wait')) return;
      c.removeAttribute('data-wait');
      c.style.minHeight = '';
      c.classList.add('card-in');
      setTimeout(() => c.classList.remove('card-in'), 600);
    },
    row(id) { const m = (read()[page] || was)?.[id]; return m?.h ? m.s || 'auto' : ''; },
    hold(c, id) {
      const h = (read()[page] || was)?.[id]?.h || ESTIMATE[id] || 0;
      c.dataset.wait = '1';
      if (h) c.style.minHeight = `${h}px`;
    },
  };
})();
