(() => {
  const SIZES = ['s', 'm', 'l', 'full'], LABEL = { s: 'S', m: 'M', l: 'L', full: 'Full' };
  const PAGES = {
    team: [
      { id: 'kpis', title: 'At a glance', sizes: ['full'], size: 'full' },
      { id: 'people', title: 'Team', sizes: ['l', 'full'], size: 'l' },
      { id: 'prompts', title: 'Prompt by prompt', sizes: ['m', 'l', 'full'], size: 'full' },
      { id: 'issues', title: 'Needs a look', sizes: ['s', 'm', 'l'], size: 's' },
      { id: 'map', title: 'Where the team is', sizes: ['s', 'm'], size: 's' },
      { id: 'models', title: 'Models · effort · client', sizes: ['s', 'm'], size: 's' },
      { id: 'recent', title: 'Active Projects', sizes: ['s', 'm', 'l', 'full'], size: 'l' },
      { id: 'lines', title: 'Code changes', sizes: ['m', 'l', 'full'], size: 'l' },
      { id: 'calendar', title: 'Tokens per day', sizes: ['s', 'm', 'l', 'full'], size: 'l' },
      { id: 'features', title: 'Features in use', sizes: ['m', 'l', 'full'], size: 'l' },
    ],
    person: [
      { id: 'tiles', title: 'At a glance', sizes: ['full'], size: 'full' },
      { id: 'work', title: 'What the agent worked on', sizes: ['m', 'l', 'full'], size: 'l' },
      { id: 'plan', title: 'Plan limits', sizes: ['s', 'm'], size: 's' },
      { id: 'size', title: 'Conversation size', sizes: ['s', 'm'], size: 's' },
      { id: 'flags', title: 'Needs a look', sizes: ['s', 'm', 'l'], size: 's' },
      { id: 'hands', title: 'Task size', sizes: ['s', 'm'], size: 's' },
      { id: 'recent', title: 'Recent conversations', sizes: ['s', 'm', 'l', 'full'], size: 'l' },
      { id: 'lines', title: 'Code changes', sizes: ['m', 'l', 'full'], size: 'l' },
      { id: 'today', title: 'Today', sizes: ['m', 'l', 'full'], size: 'l' },
      { id: 'prompts', title: 'Prompt by prompt', sizes: ['m', 'l', 'full'], size: 'l' },
      { id: 'calendar', title: 'Tokens per day', sizes: ['s', 'm', 'l', 'full'], size: 'full' },
    ],
  };

  function normalize(saved, page) {
    const cards = PAGES[page] || [], ids = cards.map((c) => c.id), byId = new Map(cards.map((c) => [c.id, c]));
    const s = saved && typeof saved === 'object' ? saved : {};
    const order = [...new Set((Array.isArray(s.order) ? s.order : []).filter((id) => byId.has(id)))];
    ids.forEach((id, i) => { if (order.includes(id)) return; const before = ids.slice(0, i).reverse().find((x) => order.includes(x)); order.splice(before ? order.indexOf(before) + 1 : 0, 0, id); });
    const size = {};
    for (const c of cards) { const want = s.size?.[c.id]; size[c.id] = c.sizes.includes(want) ? want : c.size; }
    const hidden = [...new Set((Array.isArray(s.hidden) ? s.hidden : []).filter((id) => byId.has(id)))];
    return { v: 1, order, size, hidden };
  }

  const KEY = 'joule-layout';
  const local = { read: () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } },
    write: (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} } };
  const motion = () => !globalThis.Motion || Motion.any();
  const ease = (name, fallback) => (globalThis.Motion ? Motion.ease(name) : fallback);
  const EYE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="currentColor" opacity=".3"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M4 20 20 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const GRID_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="11" height="8" rx="2.4"/><rect x="16" y="3" width="5" height="8" rx="2" opacity=".55"/><rect x="3" y="13" width="5" height="8" rx="2" opacity=".55"/><rect x="10" y="13" width="11" height="8" rx="2.4"/></svg>';

  function mount(page, grid, { before = null, save = null, load = null, onShow = () => {}, onChange = () => {}, onDone = () => {}, onResize = () => {}, fixed = null } = {}) {
    const cards = PAGES[page], byId = new Map(cards.map((c) => [c.id, c]));
    const shown = Array.isArray(fixed) ? fixed : fixed?.cards || [], own = Array.isArray(fixed) ? null : fixed?.layout || null;
    let state = fixed ? normalize({ order: own?.order, size: own?.size, hidden: cards.map((c) => c.id).filter((id) => !shown.includes(id)) }, page)
      : normalize(local.read()[page], page), arranging = false, saveTimer = null, edited = false;
    if (fixed) { save = null; load = null; }
    grid.classList.add('lgrid');

    let btn = fixed ? null : document.getElementById('arrange-btn');
    if (!btn) {
      btn = Object.assign(document.createElement('button'), { type: 'button', className: 'icon-btn lay-btn', innerHTML: `${GRID_ICON}<span class="lay-n" hidden></span>` });
      btn.dataset.learn = 'bar:arrange'; btn.setAttribute('aria-pressed', 'false'); btn.title = 'Arrange the page: move, resize and hide cards';
      if (before?.parentNode) before.parentNode.insertBefore(btn, before);
    }
    const done = Object.assign(document.createElement('button'), { type: 'button', className: 'pill lay-done', textContent: 'Done' });
    const tray = Object.assign(document.createElement('div'), { className: 'lay-tray' }); tray.hidden = true; tray.setAttribute('role', 'region'); tray.setAttribute('aria-label', 'Hidden cards');
    if (!fixed) document.body.append(tray);
    btn.onclick = () => (arranging ? stop() : start());
    done.onclick = () => stop();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && arranging) stop(); });

    const els = () => [...grid.querySelectorAll(':scope > [data-card]')];
    const el = (id) => grid.querySelector(`:scope > [data-card="${id}"]`);
    const visible = (id) => !state.hidden.includes(id);

    function paintTray() {
      const list = state.order.filter((id) => !visible(id));
      tray.innerHTML = list.length ? `<span class="lay-tray-h">Hidden</span>${list.map((id) => `<button type="button" class="lay-chip" data-id="${id}">${GRID_ICON}<span>${byId.get(id).title}</span></button>`).join('')}`
        : '<span class="lay-tray-h">Drag cards to move them · the eye hides one</span>';
      tray.append(done);
      const n = btn.querySelector('.lay-n'); n.hidden = !list.length; n.textContent = list.length;
      for (const c of tray.querySelectorAll('.lay-chip')) chipDrag(c);
      tray.hidden = !arranging;
      place();
    }
    function place() {
      if (tray.hidden) return;
      const at = btn.offsetWidth ? btn : document.getElementById('more-btn') || btn;
      const r = at.getBoundingClientRect();
      tray.style.top = `${Math.round(r.bottom + 8)}px`;
      tray.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - tray.offsetWidth - 8, r.left + r.width / 2 - tray.offsetWidth / 2)))}px`;
    }
    addEventListener('resize', place); addEventListener('scroll', place, { passive: true });

    function apply() {
      for (const c of grid.children) if (!c.dataset.card && !c.classList.contains('lay-ghost')) { c.style.order = -1; heights.observe(c); }
      for (const c of els()) {
        const id = c.dataset.card;
        if (!byId.has(id)) continue;
        c.style.order = state.order.indexOf(id);
        c.dataset.size = state.size[id];
        c.toggleAttribute('data-off', !visible(id));
        if (arranging) controls(c); else c.querySelector(':scope > .lay-ctl')?.remove();
        heights.observe(c);
      }
      for (const c of measured) if (c.parentNode !== grid) { heights.unobserve(c); measured.delete(c); }
      for (const c of grid.children) measured.add(c);
      paintTray();
    }
    const measured = new Set();
    const ROW = 8;
    const heights = new ResizeObserver((entries) => {
      const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
      for (const e of entries) { const c = e.target; const h = c.getBoundingClientRect().height; c.style.gridRowEnd = `span ${Math.max(1, Math.ceil((h + gap) / (ROW + gap)))}`; }
    });

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
    function stop() { arranging = false; document.body.classList.remove('arranging'); btn.setAttribute('aria-pressed', 'false'); apply(); save_(); onDone(); }
    function controls(c) {
      if (c.querySelector(':scope > .lay-ctl')) return;
      const id = c.dataset.card, def = byId.get(id);
      const ctl = Object.assign(document.createElement('div'), { className: 'lay-ctl' });
      ctl.innerHTML = `<button type="button" class="lay-eye" title="Hide ${def.title}" aria-label="Hide ${def.title}">${EYE}</button>${def.sizes.length > 1 ? `<span class="lay-sizes" role="group" aria-label="Size">${def.sizes.map((s) => `<button type="button" data-s="${s}" aria-pressed="${state.size[id] === s}">${LABEL[s]}</button>`).join('')}</span>` : ''}`;
      ctl.querySelector('.lay-eye').onclick = () => hide(id);
      for (const b of ctl.querySelectorAll('[data-s]')) b.onclick = () => { flip(() => { state.size[id] = b.dataset.s; }); for (const x of ctl.querySelectorAll('[data-s]')) x.setAttribute('aria-pressed', String(x === b)); save_(); onResize(id); };
      c.prepend(ctl);
      c.tabIndex = 0; c.setAttribute('aria-roledescription', 'movable card');
      c.onkeydown = (e) => {
        if (!arranging || e.target !== c) return;
        const k = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
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
    function show(id, beforeId = null) {
      flip(() => {
        state.hidden = state.hidden.filter((x) => x !== id);
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
        if (!arranging || e.button > 0 || e.target.closest('.lay-ctl, a, input, select')) return;
        const id = c.dataset.card, x0 = e.clientX, y0 = e.clientY;
        let on = false, grab = null, last = null, edge = 0;
        const scroll = () => { if (!on) return; if (edge) { scrollBy(0, edge); if (last) moveTo(last, true); } requestAnimationFrame(scroll); };
        const moveTo = (ev, again = false) => {
          if (!again) { last = { clientX: ev.clientX, clientY: ev.clientY }; edge = ev.clientY < 70 ? -14 : ev.clientY > innerHeight - 70 ? 14 : 0; }
          if (!on) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; on = true; c.setPointerCapture(e.pointerId); c.classList.add('lay-drag'); const r = c.getBoundingClientRect(); grab = { x: x0 - r.left, y: y0 - r.top }; requestAnimationFrame(scroll); }
          const t = targetAt(ev.clientX, ev.clientY, c);
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
          const from = c.getBoundingClientRect(); c.classList.remove('lay-drag'); c.style.transform = '';
          const to = c.getBoundingClientRect();
          if (motion()) c.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], ease('snappy', { duration: 260, easing: 'ease-out' }));
          save_();
        };
        addEventListener('pointermove', moveTo); addEventListener('pointerup', end); addEventListener('pointercancel', end);
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
          if (t || grid.contains(document.elementFromPoint(ev.clientX, ev.clientY))) show(id, t?.dataset.card || null);
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
      hidden: () => [...state.hidden],
      arranging: () => arranging,
    };
  }

  const account = {
    load: () => fetch('/api/me/layout').then((r) => (r.ok ? r.json() : null)),
    save: (page, layout, { keepalive = false } = {}) => fetch('/api/me/layout', { method: 'POST', keepalive, headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify({ page, layout }) }).catch(() => {}),
  };

  globalThis.Layout = { PAGES, SIZES, normalize, mount, account };
})();
