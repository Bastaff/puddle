(() => {
  const SIZES = ['s', 'm', 'l', 'full'], LABEL = { s: 'S', m: 'M', l: 'L', full: 'Full' };
  const PAGES = {
    team: [
      { id: 'people', title: 'Team', sizes: ['l', 'full'], size: 'l' },
      { id: 'issues', title: 'Needs a look', sizes: ['s', 'm', 'l'], size: 's' },
      { id: 'prompts', title: 'Prompt by prompt', sizes: ['m', 'l', 'full'], size: 'full' },
      { id: 'map', title: 'Where the team is', sizes: ['s', 'm'], size: 'm' },
      { id: 'models', title: 'Models · effort · client', sizes: ['s', 'm'], size: 'm' },
      { id: 'recent', title: 'Active Projects', sizes: ['s', 'm', 'l', 'full'], size: 'm' },
      { id: 'lines', title: 'Code changes', sizes: ['m', 'l', 'full'], size: 'm' },
      { id: 'calendar', title: 'Tokens per day', sizes: ['s', 'm', 'l', 'full'], size: 'full' },
      { id: 'features', title: 'Features in use', sizes: ['m', 'l', 'full'], size: 'full' },
    ],
    person: [
      { id: 'shipped', title: 'Shipped', sizes: ['s', 'm', 'l'], size: 's' },
      { id: 'squares', title: 'Days', sizes: ['s', 'm', 'l'], size: 's' },
      { id: 'leverage', title: 'Leverage', sizes: ['s', 'm', 'l'], size: 's' },
      { id: 'handsoff', title: 'Hands-off', sizes: ['s', 'm', 'l'], size: 's' },
      { id: 'today', title: 'Today', sizes: ['s', 'm', 'l'], size: 'm' },
      { id: 'agent', title: 'You and the agent', sizes: ['s', 'm', 'l'], size: 'm' },
      { id: 'built', title: 'What you built', sizes: ['s', 'm', 'l'], size: 'm' },
      { id: 'week', title: 'Your week', sizes: ['s', 'm', 'l'], size: 'm' },
      { id: 'flags', title: 'Needs a look', sizes: ['s', 'm', 'l'], size: 'm' },
    ],
  };
  const TILES = { person: true };

  const VERSION = { person: 3 };
  function normalize(saved, page) {
    const cards = PAGES[page] || [], ids = cards.map((c) => c.id), byId = new Map(cards.map((c) => [c.id, c]));
    const v = VERSION[page] || 1, raw = saved && typeof saved === 'object' ? saved : {};
    const s = (raw.v || 1) < v ? { hidden: raw.hidden } : raw;
    const order = [...new Set((Array.isArray(s.order) ? s.order : []).filter((id) => byId.has(id)))];
    ids.forEach((id, i) => { if (order.includes(id)) return; const before = ids.slice(0, i).reverse().find((x) => order.includes(x)); order.splice(before ? order.indexOf(before) + 1 : 0, 0, id); });
    const size = {};
    for (const c of cards) { const want = s.size?.[c.id]; size[c.id] = c.sizes.includes(want) ? want : c.size; }
    const hidden = [...new Set((Array.isArray(s.hidden) ? s.hidden : []).filter((id) => byId.has(id)))];
    if (!TILES[page]) return { v, order, size, hidden };
    const pos = {};
    for (const id of order) if (okPos(s.pos?.[id])) pos[id] = s.pos[id].slice();
    if (!Object.keys(pos).length) { const p = place(order.map((id) => ({ id, size: size[id] })), COLS); for (const id of order) pos[id] = [p[id].c, p[id].r, p[id].w, p[id].h]; }
    for (const id of order) if (!pos[id]) { const [w, h] = UNIT[size[id]] || UNIT.s; pos[id] = [...spot(taken(pos, order.filter((x) => pos[x])), w, h), w, h]; }
    settle(pos, order.filter((id) => !hidden.includes(id)));
    return { v, order, size, hidden, pos };
  }

  const WANT = { 12: { s: 4, m: 6, l: 8, full: 12 }, 6: { s: 3, m: 3, l: 6, full: 6 } };
  function pack(items, cols) {
    const out = {}, rows = [];
    let row = [], used = 0;
    for (const { id, size } of items) {
      const w = Math.min(cols, WANT[cols]?.[size] || cols);
      if (used + w > cols && row.length) { rows.push(row); row = []; used = 0; }
      row.push({ id, w }); used += w;
    }
    if (row.length) rows.push(row);
    for (const r of rows) {
      const sum = r.reduce((a, x) => a + x.w, 0);
      const exact = r.map((x) => (x.w * cols) / sum), span = exact.map(Math.floor);
      let left = cols - span.reduce((a, b) => a + b, 0);
      for (const i of exact.map((v, i) => i).sort((a, b) => (exact[b] - span[b]) - (exact[a] - span[a]) || r[b].w - r[a].w)) { if (!left) break; span[i]++; left--; }
      r.forEach((x, i) => { out[x.id] = span[i]; });
    }
    return out;
  }

  const UNIT = { s: [1, 1], m: [2, 1], l: [2, 2] };
  function place(items, cols) {
    const out = {}, used = [], at = (r, c) => used[r]?.[c], take = (r, c) => { (used[r] ||= [])[c] = true; };
    const fits = (r, c, w, h) => { if (c + w > cols) return false; for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (at(y, x)) return false; return true; };
    for (const { id, size } of items) {
      const [w0, h] = UNIT[size] || UNIT.s, w = Math.min(cols, w0);
      let r = 0, c = 0;
      for (;; r++) { c = [...Array(cols).keys()].find((x) => fits(r, x, w, h)); if (c != null) break; }
      out[id] = { r, c, w, h };
      for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) take(y, x);
    }
    const free = (t, x) => x >= 0 && x < cols && [...Array(t.h).keys()].every((y) => !at(t.r + y, x));
    const grab = (t, x) => { for (let y = 0; y < t.h; y++) take(t.r + y, x); };
    for (const t of Object.values(out).reverse()) {
      while (free(t, t.c + t.w)) { grab(t, t.c + t.w); t.w++; }
      while (free(t, t.c - 1)) { t.c--; grab(t, t.c); t.w++; }
    }
    const rows = used.length, below = (t) => t.r + t.h < rows && [...Array(t.w).keys()].every((x) => !at(t.r + t.h, t.c + x));
    for (const t of Object.values(out)) while (below(t)) { for (let x = 0; x < t.w; x++) take(t.r + t.h, t.c + x); t.h++; }
    return out;
  }

  const COLS = 4, MAXH = 2;
  const kind = (w, h) => (w <= 1 ? 's' : h >= 2 ? 'l' : 'm');
  const okPos = (p) => Array.isArray(p) && p.length === 4 && p.every(Number.isInteger) && p[0] >= 0 && p[2] >= 1 && p[0] + p[2] <= COLS && p[1] >= 0 && p[1] < 60 && p[3] >= 1 && p[3] <= MAXH;
  function rise(at) {
    const taken = new Set(), out = {};
    for (const [id, p] of Object.entries(at).sort(([, a], [, b]) => a.r - b.r || a.c - b.c)) {
      let r = p.r;
      while (r > 0 && !cells([p.c, r - 1, p.w, p.h]).some((k) => taken.has(k))) r--;
      out[id] = { ...p, r };
      for (const k of cells([p.c, r, p.w, p.h])) taken.add(k);
    }
    return out;
  }
  const cells = ([c, r, w, h]) => { const out = []; for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) out.push(`${y},${x}`); return out; };
  const taken = (pos, ids) => new Set(ids.flatMap((id) => cells(pos[id])));
  function spot(occ, w, h, from = 0) {
    for (let r = from; ; r++) for (let c = 0; c + w <= COLS; c++) if (cells([c, r, w, h]).every((k) => !occ.has(k))) return [c, r];
  }
  function settle(pos, ids, fixed = null) {
    const occ = new Set(fixed ? cells(pos[fixed]) : []);
    for (const id of ids.filter((x) => x !== fixed).sort((a, b) => pos[a][1] - pos[b][1] || pos[a][0] - pos[b][0])) {
      const p = pos[id];
      if (cells(p).some((k) => occ.has(k))) pos[id] = [...spot(occ, p[2], p[3], p[1]), p[2], p[3]];
      for (const k of cells(pos[id])) occ.add(k);
    }
    return pos;
  }
  function flow(list, cols) {
    const out = {}, occ = new Set();
    for (const { id, w: w0, h } of list) {
      const w = Math.min(cols, w0);
      let at = null;
      for (let r = 0; !at; r++) for (let c = 0; c + w <= cols && !at; c++) if (cells([c, r, w, h]).every((k) => !occ.has(k))) at = [c, r];
      out[id] = { c: at[0], r: at[1], w, h };
      for (const k of cells([at[0], at[1], w, h])) occ.add(k);
    }
    return out;
  }

  const KEY = 'joule-layout';
  const local = { read: () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } },
    write: (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} } };
  const motion = () => !globalThis.Motion || Motion.any();
  const ease = (name, fallback) => (globalThis.Motion ? Motion.ease(name) : fallback);
  const EYE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="currentColor" opacity=".3"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M4 20 20 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const GROW = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 20h12V8"/><path d="M20 20 11 11"/></svg>';
  const GRID_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="11" height="8" rx="2.4"/><rect x="16" y="3" width="5" height="8" rx="2" opacity=".55"/><rect x="3" y="13" width="5" height="8" rx="2" opacity=".55"/><rect x="10" y="13" width="11" height="8" rx="2.4"/></svg>';

  function mount(page, grid, { before = null, save = null, load = null, onShow = () => {}, onChange = () => {}, onDone = () => {}, onResize = () => {} } = {}) {
    const cards = PAGES[page], byId = new Map(cards.map((c) => [c.id, c]));
    let state = normalize(local.read()[page], page), arranging = false, saveTimer = null, edited = false;
    const tiles = Boolean(TILES[page]);
    grid.classList.add('lgrid'); grid.classList.toggle('tgrid', tiles);

    let btn = document.getElementById('arrange-btn');
    if (!btn) {
      btn = Object.assign(document.createElement('button'), { type: 'button', className: 'icon-btn lay-btn', innerHTML: `${GRID_ICON}<span class="lay-n" hidden></span>` });
      btn.dataset.learn = 'bar:arrange'; btn.setAttribute('aria-pressed', 'false'); btn.title = 'Arrange the page: move, resize and hide cards';
      if (before?.parentNode) before.parentNode.insertBefore(btn, before);
    }
    const done = Object.assign(document.createElement('button'), { type: 'button', className: 'pill lay-done', textContent: 'Done' });
    const BASE = JSON.stringify(normalize({}, page));
    const reset = Object.assign(document.createElement('button'), { type: 'button', className: 'pill lay-reset', textContent: 'Reset', title: 'Back to the layout Puddle starts with' });
    reset.onclick = () => {
      const kinds = Object.fromEntries(cards.map((c) => [c.id, size(c.id)]));
      const was = state.hidden;
      flip(() => { state = normalize({}, page); for (const c of els()) for (const x of c.querySelectorAll(':scope > .lay-ctl, :scope > .lay-grow')) x.remove(); });
      const sized = cards.filter((c) => (tiles ? kinds[c.id] !== size(c.id) : kinds[c.id] !== c.size)).map((c) => c.id);
      save_();
      if (was.length) { onChange(); for (const id of was) onShow(id); }
      for (const id of sized) onResize(id);
    };
    const tray = Object.assign(document.createElement('div'), { className: `lay-tray${tiles ? ' top' : ''}` }); tray.hidden = true; tray.setAttribute('role', 'region'); tray.setAttribute('aria-label', 'Hidden cards');
    if (tiles) grid.before(tray); else document.body.append(tray);
    const size = (id) => (tiles && state.pos?.[id] ? kind(state.pos[id][2], state.pos[id][3]) : state.size[id]);
    const SPECIAL = ['lay-ghost', 'lay-slot', 'lay-target'];
    const head = (c) => !c.dataset.card && !SPECIAL.some((k) => c.classList.contains(k)) && !c.hidden;
    btn.onclick = () => (arranging ? stop() : start());
    done.onclick = () => stop();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && arranging) stop(); });

    const els = () => [...grid.querySelectorAll(':scope > [data-card]')];
    const el = (id) => grid.querySelector(`:scope > [data-card="${id}"]`);
    const visible = (id) => !state.hidden.includes(id);

    function paintTray() {
      const list = state.order.filter((id) => !visible(id));
      tray.innerHTML = list.length ? `<span class="lay-tray-h">Hidden</span>${list.map((id) => `<button type="button" class="lay-chip" data-id="${id}">${GRID_ICON}<span>${byId.get(id).title}</span></button>`).join('')}`
        : `<span class="lay-tray-h">${tiles ? 'Drag a card to move it · its corner resizes it · the eye hides it' : 'Drag cards to move them · the eye hides one'}</span>`;
      reset.hidden = JSON.stringify(state) === BASE;
      tray.append(reset, done);
      const n = btn.querySelector('.lay-n'); n.hidden = !list.length; n.textContent = list.length;
      for (const c of tray.querySelectorAll('.lay-chip')) chipDrag(c);
      tray.hidden = !arranging;
    }

    function apply() {
      for (const c of grid.children) if (head(c)) c.style.order = -1;
      for (const c of els()) {
        const id = c.dataset.card;
        if (!byId.has(id)) continue;
        c.style.order = state.order.indexOf(id);
        c.dataset.size = size(id);
        c.toggleAttribute('data-off', !visible(id));
        if (arranging) controls(c); else for (const x of c.querySelectorAll(':scope > .lay-ctl, :scope > .lay-grow')) x.remove();
      }
      fill();
      paintTray();
    }
    let cols = 0;
    const count = () => { const cs = getComputedStyle(grid); return (tiles && parseInt(cs.getPropertyValue('--cols'), 10)) || cs.gridTemplateColumns.split(' ').filter(Boolean).length || 1; };
    function fill() {
      cols = count();
      const shown = els().filter((c) => byId.has(c.dataset.card) && visible(c.dataset.card) && !c.hidden).sort((a, b) => state.order.indexOf(a.dataset.card) - state.order.indexOf(b.dataset.card));
      if (tiles) return tile(shown);
      const spans = pack(shown.map((c) => ({ id: c.dataset.card, size: state.size[c.dataset.card] })), cols);
      for (const c of els()) {
        const want = spans[c.dataset.card] ? `span ${spans[c.dataset.card]}` : '';
        if (c.style.gridColumn !== want) c.style.gridColumn = want;
        if (c.style.gridRowEnd) c.style.gridRowEnd = '';
      }
      const rows = [];
      let used = cols;
      for (const c of shown) { const s = spans[c.dataset.card]; if (used + s > cols) { rows.push([]); used = 0; } rows.at(-1).push(c); used += s; }
      const list = (c) => c.querySelector(LIST);
      for (const c of els()) if (!shown.includes(c)) c.removeAttribute('data-fit');
      for (const r of rows) {
        const fit = r.some((c) => !list(c));
        for (const c of r) {
          const l = fit && list(c), body = l && [...c.children].find((x) => x.contains(l));
          c.toggleAttribute('data-fit', Boolean(body));
          for (const x of c.querySelectorAll(':scope > .fit-body')) if (x !== body) x.classList.remove('fit-body', 'fit-more');
          if (body && !body.classList.contains('fit-body')) { body.classList.add('fit-body'); body.addEventListener('scroll', () => more(body), { passive: true }); }
        }
      }
      soon();
    }
    const isWide = () => cols >= COLS;
    function tile(shown) {
      const heads = [...grid.children].filter(head);
      heads.forEach((c, i) => { c.style.gridColumn = '1 / -1'; c.style.gridRow = String(i + 1); });
      grid.style.gridTemplateRows = heads.length ? `repeat(${heads.length}, auto)` : '';
      const ids = shown.map((c) => c.dataset.card), P = state.pos;
      const at = isWide() ? (arranging ? (x) => x : rise)(Object.fromEntries(ids.map((id) => [id, { c: P[id][0], r: P[id][1], w: P[id][2], h: P[id][3] }])))
        : flow([...ids].sort((a, b) => P[a][1] - P[b][1] || P[a][0] - P[b][0]).map((id) => ({ id, w: P[id][2], h: P[id][3] })), cols);
      for (const c of els()) {
        const p = at[c.dataset.card];
        const col = p ? `${p.c + 1} / span ${p.w}` : '', row = p ? `${p.r + 1 + heads.length} / span ${p.h}` : '';
        if (c.style.gridColumn !== col) c.style.gridColumn = col;
        if (c.style.gridRow !== row) c.style.gridRow = row;
        if (p) { c.dataset.w = p.w; c.dataset.h = p.h; }
        const l = p && c.querySelector(LIST), body = l && [...c.children].find((x) => x.contains(l));
        c.toggleAttribute('data-fit', Boolean(body));
        if (body && !body.classList.contains('fit-body')) { body.classList.add('fit-body'); body.addEventListener('scroll', () => more(body), { passive: true }); }
      }
      const occ = new Set(Object.values(at).flatMap((p) => cells([p.c, p.r, p.w, p.h]))), rows = Math.max(0, ...Object.values(at).map((p) => p.r + p.h)) + (arranging ? 1 : 0);
      const want = arranging && isWide() ? [...Array(rows * cols).keys()].map((i) => [i % cols, Math.floor(i / cols)]).filter(([c, r]) => !occ.has(`${r},${c}`)) : [];
      const sig = want.map((x) => x.join(',')).join(' ') + '|' + heads.length;
      if (grid.dataset.slots !== sig) {
        grid.dataset.slots = sig;
        for (const x of grid.querySelectorAll(':scope > .lay-slot')) x.remove();
        for (const [c, r] of want) { const d = document.createElement('div'); d.className = 'lay-slot'; d.style.gridArea = `${r + 1 + heads.length} / ${c + 1} / span 1 / span 1`; grid.append(d); }
      }
      soon();
    }
    function cellAt(x, y, w = 1, h = 1) {
      const G = grid.getBoundingClientRect(), st = getComputedStyle(grid), gap = parseFloat(st.columnGap) || 0, rgap = parseFloat(st.rowGap) || 0;
      const left = G.left + parseFloat(st.paddingLeft), right = G.right - parseFloat(st.paddingRight), cw = (right - left - gap * (cols - 1)) / cols, rh = parseFloat(st.gridAutoRows) || 236;
      const last = [...grid.children].filter(head).at(-1), top = last ? last.getBoundingClientRect().bottom + rgap : G.top + parseFloat(st.paddingTop);
      return { c: Math.max(0, Math.min(cols - w, Math.round((x - left) / (cw + gap)))), r: Math.max(0, Math.min(58, Math.round((y - top) / (rh + rgap)))), w, h, cw, rh, gap, rgap };
    }
    let target = null;
    function mark(p) {
      if (!p) { target?.remove(); target = null; return; }
      if (!target) { target = Object.assign(document.createElement('div'), { className: 'lay-target' }); grid.append(target); }
      const heads = [...grid.children].filter(head).length;
      target.style.gridArea = `${p.r + 1 + heads} / ${p.c + 1} / span ${p.h} / span ${p.w}`;
    }
    function put(id, p) {
      const kinds = Object.fromEntries(state.order.map((x) => [x, size(x)]));
      flip(() => { state.pos[id] = [p.c, p.r, p.w, p.h]; settle(state.pos, state.order.filter(visible), id); });
      save_();
      for (const x of state.order) if (kinds[x] !== size(x)) onResize(x);
    }
    const LIST = '.attention, .rcs, .projects-list';
    let raf = 0;
    const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; for (const b of grid.querySelectorAll('[data-fit] > .fit-body')) more(b); }); };
    const more = (b) => b.classList.toggle('fit-more', b.scrollHeight - b.clientHeight - b.scrollTop > 4);
    const ours = (n) => n.nodeType === 1 && SPECIAL.some((k) => n.classList.contains(k));
    new MutationObserver((list) => { if (list.some((m) => (m.target === grid && [...m.addedNodes, ...m.removedNodes].some((n) => !ours(n))) || m.target.parentNode === grid)) fill(); else soon(); })
      .observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    new ResizeObserver(() => { if (count() !== cols) fill(); }).observe(grid);

    function save_() {
      edited = true;
      const all = local.read(); all[page] = state; local.write(all);
      clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; save?.(page, state); }, 800);
    }
    addEventListener('pagehide', () => { if (!saveTimer) return; clearTimeout(saveTimer); saveTimer = null; save?.(page, state, { keepalive: true }); });
    function flip(mutate) {
      const before = new Map(els().map((c) => [c, c.getBoundingClientRect()]));
      mutate(); apply();
      if (!motion()) return;
      for (const [c, a] of before) {
        if (c.hasAttribute('data-off') || c.classList.contains('lay-drag')) continue;
        const b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { ...ease('snappy', { duration: 320, easing: 'ease-out' }), composite: 'add' });
      }
    }

    function start() { arranging = true; document.body.classList.add('arranging'); btn.setAttribute('aria-pressed', 'true'); els().forEach((c, i) => c.style.setProperty('--jd', `${-(i * 97) % 500}ms`)); apply(); }
    function stop() { mark(null); arranging = false; document.body.classList.remove('arranging'); btn.setAttribute('aria-pressed', 'false'); apply(); save_(); onDone(); }
    function controls(c) {
      if (c.querySelector(':scope > .lay-ctl')) return;
      const id = c.dataset.card, def = byId.get(id);
      const ctl = Object.assign(document.createElement('div'), { className: 'lay-ctl' });
      ctl.innerHTML = `<button type="button" class="lay-eye" title="Hide ${def.title}" aria-label="Hide ${def.title}">${EYE}</button>${!tiles && def.sizes.length > 1 ? `<span class="lay-sizes" role="group" aria-label="Size">${def.sizes.map((s) => `<button type="button" data-s="${s}" aria-pressed="${state.size[id] === s}">${LABEL[s]}</button>`).join('')}</span>` : ''}`;
      ctl.querySelector('.lay-eye').onclick = () => hide(id);
      for (const b of ctl.querySelectorAll('[data-s]')) b.onclick = () => { flip(() => { state.size[id] = b.dataset.s; }); for (const x of ctl.querySelectorAll('[data-s]')) x.setAttribute('aria-pressed', String(x === b)); save_(); onResize(id); };
      c.prepend(ctl);
      if (tiles) { const g = Object.assign(document.createElement('button'), { type: 'button', className: 'lay-grow', title: `Resize ${def.title}`, innerHTML: GROW }); g.setAttribute('aria-label', `Resize ${def.title}`); c.append(g); growDrag(c, g); }
      c.tabIndex = 0; c.setAttribute('aria-roledescription', 'movable card');
      c.onkeydown = (e) => {
        if (!arranging || e.target !== c) return;
        const dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0, dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
        if (tiles && (dx || dy)) {
          e.preventDefault();
          const [x, y, w, h] = state.pos[id];
          const p = e.shiftKey ? { c: x, r: y, w: Math.max(1, Math.min(COLS - x, w + dx)), h: Math.max(1, Math.min(MAXH, h + dy)) } : { c: Math.max(0, Math.min(COLS - w, x + dx)), r: Math.max(0, y + dy), w, h };
          put(id, p); c.focus(); return;
        }
        const k = dx || dy;
        if (k) { e.preventDefault(); move(id, k); c.focus(); } else if (e.key === 'h' || e.key === 'H') hide(id);
      };
      cardDrag(c);
    }
    function move(id, step) {
      const shown = state.order.filter(visible), i = shown.indexOf(id), j = i + step;
      if (j < 0 || j >= shown.length) return;
      flip(() => { const o = state.order; o.splice(o.indexOf(id), 1); o.splice(o.indexOf(shown[j]) + (step > 0 ? 1 : 0), 0, id); });
      save_();
    }

    function hide(id) {
      const c = el(id); if (!c) return;
      const from = c.getBoundingClientRect(), ghost = motion() ? c.cloneNode(true) : null;
      flip(() => { state.hidden.push(id); });
      save_(); onChange();
      const chip = tray.querySelector(`.lay-chip[data-id="${id}"]`);
      if (!ghost || !chip) return;
      ghost.querySelector('.lay-ctl')?.remove();
      Object.assign(ghost.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: 0, zIndex: 80, pointerEvents: 'none', transformOrigin: '0 0', order: '' });
      ghost.removeAttribute('data-off'); ghost.classList.add('lay-ghost'); document.body.append(ghost);
      chip.style.visibility = 'hidden';
      const to = chip.getBoundingClientRect(), sx = to.width / from.width, sy = to.height / from.height;
      ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${sx}, ${sy})`, opacity: 0 }],
        { duration: 260, easing: 'cubic-bezier(.4, 0, .2, 1)' }).finished.then(() => { ghost.remove(); chip.style.visibility = ''; chip.animate([{ transform: 'scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.2, 0, 0, 1)' }); }, () => ghost.remove());
    }
    function show(id, beforeId = null, cell = null) {
      flip(() => {
        state.hidden = state.hidden.filter((x) => x !== id);
        if (tiles) {
          const [, , w, h] = state.pos[id] || [0, 0, ...(UNIT[byId.get(id).size] || UNIT.s)];
          const at = cell ? [Math.min(cell.c, COLS - w), cell.r] : spot(taken(state.pos, state.order.filter((x) => visible(x) && x !== id)), w, h);
          state.pos[id] = [at[0], at[1], w, h]; settle(state.pos, state.order.filter(visible), id);
        }
        if (beforeId && beforeId !== id) { const o = state.order; o.splice(o.indexOf(id), 1); o.splice(o.indexOf(beforeId), 0, id); }
      });
      save_(); onChange(); onShow(id);
      const c = el(id); if (!c) return;
      if (!motion()) { c.scrollIntoView({ block: 'nearest' }); return; }
      c.style.opacity = '0';
      c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      let fired = false;
      const arrive = () => { if (fired) return; fired = true; c.style.opacity = '';
        c.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'scale(1.015)', offset: 0.6 }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2, 0, 0, 1)' }); };
      addEventListener('scrollend', arrive, { once: true }); setTimeout(arrive, 380);
    }

    const targetAt = (x, y, self) => {
      for (const n of document.elementsFromPoint(x, y)) { const c = n.closest?.('[data-card]'); if (c && c !== self && grid.contains(c) && !c.hasAttribute('data-off')) return c; }
      return null;
    };
    function cardDrag(c) {
      c.onpointerdown = (e) => {
        if (!arranging || e.button > 0 || e.target.closest('.lay-ctl, .lay-grow, a, input, select')) return;
        const id = c.dataset.card, x0 = e.clientX, y0 = e.clientY;
        let on = false, grab = null, last = null, edge = 0;
        const scroll = () => { if (!on) return; if (edge) { scrollBy(0, edge); if (last) moveTo(last, true); } requestAnimationFrame(scroll); };
        const moveTo = (ev, again = false) => {
          if (!again) { last = { clientX: ev.clientX, clientY: ev.clientY }; edge = ev.clientY < 70 ? -14 : ev.clientY > innerHeight - 70 ? 14 : 0; }
          if (!on) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; on = true; c.setPointerCapture(e.pointerId); c.classList.add('lay-drag'); const r = c.getBoundingClientRect(); grab = { x: x0 - r.left, y: y0 - r.top }; requestAnimationFrame(scroll); }
          const t = tiles ? null : targetAt(ev.clientX, ev.clientY, c);
          if (tiles) { const [, , w, h] = state.pos[id]; mark(isWide() ? cellAt(ev.clientX - grab.x, ev.clientY - grab.y, Math.min(w, cols), h) : null); }
          if (t) {
            const r = t.getBoundingClientRect(), after = ev.clientY > r.top + r.height / 2 && ev.clientX > r.left + r.width / 3;
            const o = state.order, at = o.indexOf(t.dataset.card) + (after ? 1 : 0);
            if (o.indexOf(id) !== at && o.indexOf(id) !== at - 1) flip(() => { const was = o.indexOf(id); o.splice(was, 1); o.splice(at > was ? at - 1 : at, 0, id); });
          }
          c.style.transform = ''; const r = c.getBoundingClientRect();
          c.style.transform = `translate(${ev.clientX - grab.x - r.left}px, ${ev.clientY - grab.y - r.top}px) scale(1.03)`;
        };
        const end = () => {
          removeEventListener('pointermove', moveTo); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
          if (!on) return;
          on = false;
          if (tiles) {
            const [, , w, h] = state.pos[id], other = isWide() ? null : targetAt(last.clientX, last.clientY, c);
            const p = isWide() ? cellAt(last.clientX - grab.x, last.clientY - grab.y, w, h) : null;
            mark(null);
            const from = c.getBoundingClientRect(); c.classList.remove('lay-drag'); c.style.transform = '';
            if (p) put(id, p);
            else if (other) { const o = other.dataset.card, a = state.pos[id], b = state.pos[o]; flip(() => { [a[0], a[1], b[0], b[1]] = [b[0], b[1], a[0], a[1]]; a[0] = Math.min(a[0], COLS - a[2]); b[0] = Math.min(b[0], COLS - b[2]); settle(state.pos, state.order.filter(visible), id); }); save_(); }
            const to = c.getBoundingClientRect();
            if (motion()) c.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], ease('snappy', { duration: 260, easing: 'ease-out' }));
            return;
          }
          const from = c.getBoundingClientRect(); c.classList.remove('lay-drag'); c.style.transform = '';
          const to = c.getBoundingClientRect();
          if (motion()) c.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], ease('snappy', { duration: 260, easing: 'ease-out' }));
          save_();
        };
        addEventListener('pointermove', moveTo); addEventListener('pointerup', end); addEventListener('pointercancel', end);
      };
    }
    function growDrag(c, g) {
      g.onpointerdown = (e) => {
        if (!arranging || e.button > 0) return;
        e.preventDefault(); e.stopPropagation();
        const id = c.dataset.card, r0 = c.getBoundingClientRect();
        g.setPointerCapture(e.pointerId); c.classList.add('lay-sizing');
        const [x, y] = state.pos[id], wide = isWide();
        const at = (ev) => {
          const m = cellAt(0, 0);
          const right = wide ? COLS - x : cols - Math.round((r0.left - grid.getBoundingClientRect().left) / (m.cw + m.gap));
          return { c: x, r: y, w: Math.max(1, Math.min(right, Math.round((ev.clientX - r0.left + m.gap) / (m.cw + m.gap)))), h: Math.max(1, Math.min(MAXH, Math.round((ev.clientY - r0.top + m.rgap) / (m.rh + m.rgap)))) };
        };
        let p = null;
        const moveTo = (ev) => { p = at(ev); if (wide) mark(p); else { c.style.gridColumn = `span ${p.w}`; c.style.gridRow = `span ${p.h}`; } };
        const end = () => {
          g.removeEventListener('pointermove', moveTo); g.removeEventListener('pointerup', end); g.removeEventListener('pointercancel', end);
          c.classList.remove('lay-sizing'); mark(null);
          if (p) put(id, p); else fill();
        };
        g.addEventListener('pointermove', moveTo); g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
      };
    }
    function chipDrag(chip) {
      chip.onpointerdown = (e) => {
        if (e.button > 0) return;
        const id = chip.dataset.id, x0 = e.clientX, y0 = e.clientY;
        let ghost = null;
        const moveTo = (ev) => {
          if (!ghost) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; ghost = chip.cloneNode(true); ghost.classList.add('lay-chip-drag'); document.body.append(ghost); }
          ghost.style.transform = `translate(${ev.clientX - 20}px, ${ev.clientY - 16}px)`;
        };
        const end = (ev) => {
          removeEventListener('pointermove', moveTo); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
          if (!ghost) { show(id); return; }
          ghost.remove();
          const t = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY, null) : null;
          const on = grid.contains(document.elementFromPoint(ev.clientX, ev.clientY));
          if (tiles && on && isWide()) { const [, , w, h] = state.pos[id] || UNIT.s; show(id, null, cellAt(ev.clientX - 20, ev.clientY - 20, w, h)); }
          else if (t || on) show(id, t?.dataset.card || null);
        };
        addEventListener('pointermove', moveTo); addEventListener('pointerup', end); addEventListener('pointercancel', end);
      };
    }

    const ready = Promise.race([(load?.() || Promise.resolve(null)).then((all) => {
      if (!all?.[page] || edited || arranging) return;
      const next = normalize(all[page], page);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      const back = state.hidden.filter((id) => !next.hidden.includes(id)), changed = state.hidden.join() !== next.hidden.join();
      state = next; const l = local.read(); l[page] = state; local.write(l); apply();
      if (changed) onChange();
      for (const id of back) onShow(id);
    }).catch(() => {}), new Promise((ok) => setTimeout(ok, 1500))]);

    apply();
    return {
      apply,
      ready,
      visible,
      size,
      hidden: () => [...state.hidden],
      arranging: () => arranging,
    };
  }

  const account = {
    load: () => fetch('/api/me/layout').then((r) => (r.ok ? r.json() : null)),
    save: (page, layout, { keepalive = false } = {}) => fetch('/api/me/layout', { method: 'POST', keepalive, headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify({ page, layout }) }).catch(() => {}),
  };

  globalThis.Layout = { PAGES, SIZES, normalize, pack, place, settle, flow, mount, account };
})();
