// "Code changes": how each project grows or shrinks. One line per project, the running net lines (added − removed)
// day by day over the chosen range; beside it each project's +added / −removed. Hover a day for every project's
// changes that day. Plain script: globalThis.mountCodeLines(el, projects, { from, now, hover, rows }).
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--muted)'];
  const fmt = (n) => { const a = Math.abs(n); return a >= 10_000 ? `${(n / 1000).toFixed(0)}k` : a >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); };
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const short = (n) => n.replace(/^github\.com\//, '');

  globalThis.mountCodeLines = (el, projects, { from, now = Date.now(), hover = () => {}, rows = () => '' } = {}) => {
    if (!el) return;
    // the range's days (from its start, or the first day with changes when the range is longer than the data)
    const first = projects.flatMap((p) => p.days.map((d) => d.day)).sort()[0];
    const days = [];
    for (let d = new Date(Math.max(from, first ? Date.parse(first + 'T00:00:00') : from)); d <= new Date(now); d.setDate(d.getDate() + 1)) days.push(key(d));
    if (days.length < 2) days.unshift(key(new Date(Date.parse(days[0] + 'T12:00:00') - 864e5)));
    const series = projects.map((p, i) => {
      const at = new Map(p.days.map((d) => [d.day, d])); let run = 0;
      return { ...p, color: COLORS[i % COLORS.length], points: days.map((day) => { const d = at.get(day); run += d ? d.added - d.removed : 0; return run; }) };
    });
    const all = series.flatMap((s) => s.points).concat(0), lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
    const W = 600, H = 170, P = 6, x = (i) => P + (i / (days.length - 1)) * (W - 2 * P), y = (v) => H - P - ((v - lo) / span) * (H - 2 * P);
    const path = (pts) => pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    el.innerHTML = `<div class="cl">
      <div class="cl-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Net lines per project over time">
        <line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="cl-zero"/>
        ${series.map((s) => `<path d="${path(s.points)}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join('')}
        <line class="cl-cursor" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>
      </svg>
      <div class="cl-axis"><span>${esc(globalThis.calDayName ? globalThis.calDayName(days[0]) : days[0])}</span><span>today</span></div></div>
      <ul class="cl-keys">${series.map((s) => `<li><i style="background:${s.color}"></i><span class="cl-n" title="${esc(s.name)}">${esc(short(s.name))}</span><b class="add">+${fmt(s.added)}</b><b class="del">−${fmt(s.removed)}</b></li>`).join('')}</ul>
    </div>`;
    // hover anywhere on the chart: that day, each project's +/−
    const svg = el.querySelector('svg'), cur = el.querySelector('.cl-cursor');
    const dayAt = (e) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(days.length - 1, Math.round(((e.clientX - r.left) / r.width) * (days.length - 1)))); };
    hover(svg, (e) => {
      const i = dayAt(e); cur.setAttribute('x1', x(i)); cur.setAttribute('x2', x(i)); cur.setAttribute('visibility', 'visible');
      const lines = series.map((s) => { const d = s.days.find((z) => z.day === days[i]); return d ? [short(s.name), `+${fmt(d.added)} −${fmt(d.removed)}`, s.color] : null; }).filter(Boolean);
      return `<b>${esc(globalThis.calDayName ? globalThis.calDayName(days[i]) : days[i])}</b>` + (lines.length ? rows(lines) : '<div>No changes that day</div>');
    });
    svg.addEventListener('mouseleave', () => cur.setAttribute('visibility', 'hidden'));
  };
})();
