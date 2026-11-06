(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--muted)'];
  const fmt = (n) => { const a = Math.abs(n); return a >= 10_000 ? `${(n / 1000).toFixed(0)}k` : a >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); };
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const short = (n) => n.replace(/^github\.com\//, '');

  globalThis.mountCodeLines = (el, projects, { from, now = Date.now(), hover = () => {}, rows = () => '' } = {}) => {
    if (!el) return;
    now = Math.max(now, from + 60_000);
    const days = [], mids = [];
    for (let d = new Date(from); d.setHours(0, 0, 0, 0), d.getTime() <= now; d.setDate(d.getDate() + 1)) { days.push(key(d)); if (d.getTime() > from) mids.push(d.getTime()); }
    const endOf = (k) => { const d = new Date(k + 'T00:00:00'); d.setDate(d.getDate() + 1); return Math.min(now, d.getTime()); };
    const series = projects.map((p, i) => {
      const at = new Map(p.days.map((d) => [d.day, d])); let run = 0;
      return { ...p, color: COLORS[i % COLORS.length], points: [[from, 0], ...days.map((day) => { const d = at.get(day); run += d ? d.added - d.removed : 0; return [endOf(day), run]; })] };
    });
    const all = series.flatMap((s) => s.points.map((p) => p[1])).concat(0), lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
    const W = 600, H = 170, P = 6, x = (t) => P + ((t - from) / (now - from)) * (W - 2 * P), y = (v) => H - P - ((v - lo) / span) * (H - 2 * P);
    const path = (pts) => pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const startName = new Date(from).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `<div class="cl">
      <div class="cl-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Net lines per project over the range">
        ${mids.map((t) => `<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="0" y2="${H}" class="cl-day"/>`).join('')}
        <line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="cl-zero"/>
        ${series.map((s) => `<path d="${path(s.points)}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join('')}
        <line class="cl-cursor" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>
      </svg>
      <div class="cl-axis"><span>${esc(startName)}</span><span>now</span></div></div>
      <ul class="cl-keys">${series.map((s) => `<li><i style="background:${s.color}"></i><span class="cl-n" title="${esc(s.name)}">${esc(short(s.name))}</span><b class="add">+${fmt(s.added)}</b><b class="del">−${fmt(s.removed)}</b></li>`).join('')}</ul>
    </div>`;
    const svg = el.querySelector('svg'), cur = el.querySelector('.cl-cursor');
    const dayAt = (e) => { const r = svg.getBoundingClientRect(), t = from + ((e.clientX - r.left) / r.width) * (now - from); const d = new Date(Math.max(from, Math.min(now, t))); return { k: key(d), t }; };
    hover(svg, (e) => {
      const { k, t } = dayAt(e), cx = x(Math.max(from, Math.min(now, t))); cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); cur.setAttribute('visibility', 'visible');
      const lines = series.map((s) => { const d = s.days.find((z) => z.day === k); return d ? [short(s.name), `+${fmt(d.added)} −${fmt(d.removed)}`, s.color] : null; }).filter(Boolean);
      return `<b>${esc(globalThis.calDayName ? globalThis.calDayName(k) : k)}</b>` + (lines.length ? rows(lines) : '<div>No changes that day</div>');
    });
    svg.addEventListener('mouseleave', () => cur.setAttribute('visibility', 'hidden'));
  };
})();
