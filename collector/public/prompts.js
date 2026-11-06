(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MIN = 60_000, HOUR = 36e5;
  const WINDOWS = { '15m': ['15 min', 15 * MIN, 5 * MIN, 'the last 15 minutes'], '1h': ['1 h', HOUR, 15 * MIN, 'the last hour'],
    '6h': ['6 h', 6 * HOUR, HOUR, 'the last 6 hours'], '24h': ['24 h', 24 * HOUR, 6 * HOUR, 'the last 24 hours'] };
  const SIZES = [MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR];
  const slotsFor = (span, width) => (span <= 15 * MIN ? span / MIN : span / (SIZES.find((z) => (width / (span / z)) >= 14) || HOUR));
  const slotName = (sl) => {
    if (sl.to - sl.from > MIN + 1) return `${clock(sl.from)}–${clock(sl.to)}`;
    const ago = Math.round((Date.now() - sl.to) / MIN);
    return ago <= 0 ? 'The last minute' : `${ago} min ago`;
  };
  globalThis.promptSlots = (prompts, to, span, n) => {
    const size = span / n, from = to - span;
    const slots = Array.from({ length: n }, (_, i) => ({ from: from + i * size, to: i === n - 1 ? to : from + (i + 1) * size, prompts: [], tokens: 0, output: 0, context: null }));
    for (const q of prompts) {
      if (q.ts < from || q.ts > to) continue;
      const sl = slots[Math.min(n - 1, Math.floor((q.ts - from) / size))]; sl.prompts.push(q); sl.tokens += q.tokens || 0; sl.output += q.output || 0;
      if (q.context != null) sl.context = Math.max(sl.context ?? 0, q.context);
    }
    return { from, to, slots };
  };
  const KEY = 'pv-prompts-window';
  let win = '15m';
  try { const w = localStorage.getItem(KEY); if (WINDOWS[w]) win = w; } catch {}
  const tok = (n) => globalThis.calTok?.(n) ?? String(n);
  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const H = 100, GAP = 30, C = 44;
  const mounted = new Set();

  function draw(card) {
    const { ld, opt } = card._prompts, [, span, step, words] = WINDOWS[win];
    const n = slotsFor(span, card._prompts.w || card.clientWidth - 40 || 600);
    const { from, to, slots } = globalThis.promptSlots(ld?.prompts || [], Date.now(), span, n);
    const list = slots.flatMap((sl) => sl.prompts), sum = list.reduce((a, q) => a + q.tokens, 0);
    const seg = Object.entries(WINDOWS).map(([k, [l]]) => `<button type="button" data-w="${k}" aria-pressed="${k === win}">${l}</button>`).join('');
    const ctl = card.querySelector(':scope > .lay-ctl');
    card.innerHTML = `<header><h2${opt.learn ? ` data-learn="${opt.learn}"` : ''}>Prompt by prompt</h2>
      <span class="muted pr-sum">${ld ? `${list.length.toLocaleString()} prompt${list.length === 1 ? '' : 's'} · ${tok(sum)} tokens` : ''}</span>
      <nav class="seg small pr-win" aria-label="Time window">${seg}</nav></header>
      ${!ld ? '<div class="pr-chart pr-wait"></div>' : `<div class="you-day pr-chart${opt.colorOf ? ' by-person' : ''}"></div>`}`;
    if (ctl) card.prepend(ctl);
    for (const b of card.querySelectorAll('.pr-win button')) b.onclick = () => {
      win = b.dataset.w;
      try { localStorage.setItem(KEY, win); } catch {}
      for (const c of mounted) if (c.isConnected) draw(c);
    };
    const el = card.querySelector('.you-day.pr-chart');
    if (!el) return;
    const W = Math.max(260, Math.round(el.clientWidth || 600));
    if (Math.abs(W - (card._prompts.w || 0)) > 8) { card._prompts.w = W; return draw(card); }
    const x = (t) => ((t - from) / span) * W, sw = W / n, gap = Math.max(2, Math.min(6, sw * 0.3)), bw = sw - gap;
    const max = Math.max(1, ...slots.map((sl) => sl.tokens)), y = (v) => H - (v / max) * H;
    const cy0 = H + GAP, cy = (v) => cy0 + C - (v / 100) * C, r = Math.min(3, bw / 2);
    const per = opt.colorOf ? new Map() : null;
    if (per) for (const q of list) if (q.tokens) per.set(q.user, (per.get(q.user) || 0) + q.tokens);
    const order = per ? [...per.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u) : [];
    const OTHERS = '\u0000others', taken = new Set(), group = new Map();
    for (const u of order) { const c = opt.colorOf?.(u); group.set(u, taken.has(c) ? OTHERS : u); taken.add(c); }
    const colorOf = (g) => (g === OTHERS ? 'var(--axis)' : opt.colorOf(g));
    const groups = [...new Set(order.map((u) => group.get(u)))].sort((a, b) => (a === OTHERS) - (b === OTHERS));
    const bars = slots.map((sl, i) => {
      if (!sl.prompts.length) return '';
      const bx = (i * sw + gap / 2).toFixed(1), w = bw.toFixed(1);
      const ctx = sl.context != null ? `<rect x="${bx}" y="${cy(sl.context)}" width="${w}" height="${Math.max(3, cy0 + C - cy(sl.context))}" rx="${r}" class="b-ctx${sl.context >= 90 ? ' full' : ''}"/>` : '';
      if (!sl.tokens) return `<rect x="${bx}" y="${H - 3}" width="${w}" height="3" rx="${r}" class="b-wait"/>` + ctx;
      if (!per) { const th = Math.max(3, H - y(sl.tokens)); return `<rect x="${bx}" y="${H - th}" width="${w}" height="${th}" rx="${r}" class="b-today"/>` + ctx; }
      const mine = new Map(); for (const q of sl.prompts) if (q.tokens) mine.set(group.get(q.user), (mine.get(group.get(q.user)) || 0) + q.tokens);
      const tall = (g) => (mine.get(g) / max) * H >= 3;
      const parts = groups.filter((g) => mine.has(g) && g !== OTHERS && tall(g));
      const rest = [...mine.keys()].filter((g) => !parts.includes(g)).reduce((a, g) => a + mine.get(g), 0);
      if (rest) parts.push(OTHERS), mine.set(OTHERS, rest);
      let top = H, out = '';
      parts.forEach((g, k) => {
        const h = Math.max(2, (mine.get(g) / max) * H - (k ? 1 : 0));
        top -= h + (k ? 1 : 0);
        out += `<rect x="${bx}" y="${top.toFixed(1)}" width="${w}" height="${h.toFixed(1)}" rx="${k === parts.length - 1 ? r : 0}" style="fill:${colorOf(g)}"/>`;
      });
      return out + ctx;
    }).join('');
    const off = -new Date().getTimezoneOffset() * MIN, ticks = [];
    for (let t = Math.ceil((from + off) / step) * step - off; t < to - span * 0.08; t += step) ticks.push(`<text x="${x(t)}" y="${cy0 + C + 16}" class="tick" text-anchor="middle">${clock(t)}</text>`);
    el.innerHTML = `<svg viewBox="0 -16 ${W} ${cy0 + C + 34}" role="img" aria-label="Prompts in ${words}, in ${n} slots: the tokens they took, and how full the conversation got">
      <text x="0" y="-5" class="tick lab">Tokens${list.length ? ` · up to ${tok(max)}` : ''}</text>
      ${list.length ? '' : `<text x="${W / 2}" y="${H / 2 + 4}" class="tick" text-anchor="middle">No prompts in ${words}</text>`}
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" class="base"/>
      <text x="0" y="${cy0 - 7}" class="tick lab">Context · how full the conversation got</text>
      <line x1="0" x2="${W}" y1="${cy(90)}" y2="${cy(90)}" class="ctx-90"/><text x="${W}" y="${cy0 - 7}" class="tick" text-anchor="end">dashed: 90%</text>
      <line x1="0" x2="${W}" y1="${cy0 + C}" y2="${cy0 + C}" class="base"/>${bars}${ticks.join('')}
      <text x="${W}" y="${cy0 + C + 16}" class="tick" text-anchor="end">now</text></svg>`;
    opt.hover?.(el, (e) => {
      const b = el.getBoundingClientRect(), sl = slots[Math.floor(((e.clientX - b.left) / b.width) * n)];
      if (!sl) return '';
      if (!sl.prompts.length) return `<b>${slotName(sl)}</b><div class="muted">No prompts</div>`;
      const mine = new Map(); for (const q of sl.prompts) mine.set(q.user, (mine.get(q.user) || 0) + (q.tokens || 0));
      const people = per && mine.size > 1 ? [...mine.entries()].sort((a, b) => b[1] - a[1]) : null;
      const who = !people && opt.who ? [...mine.keys()].map((u) => opt.who(u)).filter(Boolean) : [];
      const models = [...new Set(sl.prompts.map((q) => q.model).filter(Boolean))].map((m) => m.replace('claude-', ''));
      return `<b>${slotName(sl)}</b>${who.length ? `<div class="muted">${esc(who.join(', '))}</div>` : ''}` + opt.rows([
        ...(people ? people.map(([u, t]) => [esc(opt.who?.(u) || 'Someone'), t ? tok(t) : 'still answering', colorOf(group.get(u) ?? u)]) : []),
        ['Prompts', sl.prompts.length.toLocaleString()],
        ['Tokens', sl.tokens ? `${tok(sl.tokens)}${sl.output ? ` (${tok(sl.output)} written)` : ''}` : 'still answering', per ? null : 'var(--s2)'],
        ['Context', sl.context == null ? '—' : `${sl.context}% full`, sl.context >= 90 ? 'var(--critical)' : 'var(--s1)'],
        ...(models.length ? [['Model', esc(models.join(', '))]] : [])]);
    });
  }

  globalThis.mountPrompts = (card, lastDay, opt = {}) => {
    if (!card) return;
    card._prompts = { ld: lastDay || null, opt };
    if (!mounted.has(card)) { mounted.add(card); sized?.observe(card); }
    draw(card);
  };
  const sized = 'ResizeObserver' in globalThis ? new ResizeObserver((es) => {
    for (const e of es) { const c = e.target, w = c.querySelector('.pr-chart')?.clientWidth; if (c._prompts?.w && w && Math.abs(w - c._prompts.w) > 8) draw(c); }
  }) : null;
  setInterval(() => {
    if ((win !== '15m' && win !== '1h') || document.body.classList.contains('arranging')) return;
    for (const c of mounted) { if (!c.isConnected) { mounted.delete(c); sized?.unobserve(c); } else if (!c.matches(':hover')) draw(c); }
  }, 15_000);
})();
