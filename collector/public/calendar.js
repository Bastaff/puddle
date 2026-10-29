// Tokens per day as a small calendar: one block per month (label only, days 1… in rows of 7, no weekday
// rows), darker beige for no use, then paler to deeper blue for more tokens. The range picker's days are
// full strength; when the card is wider than the range needs, earlier months fill it, dimmed. Nothing after
// today. Hover a day for its numbers (callers attach their own tooltips to `.cal-d[data-day]`).
// Plain script (the team dashboard isn't a module): globalThis.mountCalendar(el, daily, { from, now, onDraw }).
(() => {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const local = (t) => { const d = new Date(t); return key(d.getFullYear(), d.getMonth(), d.getDate()); };
  const GAP = 3, MIN = 16, MAX = 28, BLOCK_GAP = 18;

  function draw(el, daily, { from, now = Date.now(), onDraw }) {
    const byDay = new Map((daily || []).map((r) => [r.day, r]));
    const today = new Date(now), fromKey = local(from), todayKey = local(now);
    const start = new Date(from);
    const need = (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth() + 1;
    // as many months as fit at the smallest square, never fewer than the range needs, at most a year
    const width = el.clientWidth || 600, blockMin = 7 * MIN + 6 * GAP;
    const fit = Math.max(1, Math.floor((width + BLOCK_GAP) / (blockMin + BLOCK_GAP)));
    const months = Math.min(12, Math.max(need, fit));
    // squares grow to use the width (all months in one row when they fit)
    const perRow = Math.min(months, fit);
    const cell = Math.max(MIN, Math.min(MAX, Math.floor(((width - (perRow - 1) * BLOCK_GAP) / perRow - 6 * GAP) / 7)));
    const shown = [];
    for (let i = months - 1; i >= 0; i--) { const d = new Date(today.getFullYear(), today.getMonth() - i, 1); shown.push([d.getFullYear(), d.getMonth()]); }
    // colour levels: quantiles of the days that had any use, so a few huge days don't wash out the rest
    const vals = [];
    for (const [y, m] of shown) for (let d = 1; d <= 31; d++) { const r = byDay.get(key(y, m, d)); if (r && r.tokens > 0) vals.push(r.tokens); }
    vals.sort((a, b) => a - b);
    const cut = [0.2, 0.4, 0.6, 0.8].map((q) => vals[Math.floor(q * (vals.length - 1))] ?? 0);
    const level = (v) => (!(v > 0) ? 0 : 1 + cut.filter((c) => v > c).length);
    el.style.setProperty('--cell', cell + 'px');
    el.innerHTML = `<div class="cal-months">${shown.map(([y, m]) => {
      const days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let d = 1; d <= days; d++) {
        const k = key(y, m, d); if (k > todayKey) break;
        const r = byDay.get(k), lv = level(r?.tokens);
        cells += `<i class="cal-d l${lv}${k < fromKey ? ' out' : ''}${k === todayKey ? ' today' : ''}" data-day="${k}"></i>`;
      }
      return `<div class="cal-m"><b>${MONTHS[m]}${y !== today.getFullYear() ? ` ${String(y).slice(2)}` : ''}</b><div class="cal-g">${cells}</div></div>`;
    }).join('')}</div>
    <div class="cal-key" aria-hidden="true"><span>Less</span>${[0, 1, 2, 3, 4, 5].map((l) => `<i class="cal-d l${l}"></i>`).join('')}<span>More</span></div>`;
    onDraw?.(byDay);
  }

  globalThis.mountCalendar = (el, daily, opts) => {
    if (!el) return;
    el._cal = [daily, opts];
    draw(el, daily, opts);
    if (!el._ro && typeof ResizeObserver !== 'undefined') {
      let w = el.clientWidth;
      el._ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) < 8) return; w = el.clientWidth; draw(el, ...el._cal); });
      el._ro.observe(el);
    }
  };
  // 3.2M tokens, 410K tokens
  globalThis.calTok = (n) => { n = Number(n) || 0; return n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n); };
  // "Tue 14 Oct"
  globalThis.calDayName = (k) => new Date(k + 'T12:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
})();
