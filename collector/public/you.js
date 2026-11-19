const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const hm = (min) => { min = Math.max(0, Math.round(min || 0)); return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; };

export function spark(values, color) {
  const v = values.length ? values : [0];
  const max = Math.max(...v, 1e-9);
  const x = (i) => (v.length === 1 ? 50 : (i / (v.length - 1)) * 100);
  const y = (n) => 28 - (n / max) * 24;
  const line = v.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(n).toFixed(2)}`).join('');
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <path d="${line}L100,30L0,30Z" fill="${color}" opacity="0.14"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
export const kpiTiles = (tiles) => tiles.map((t) => `<div class="kpi"${t.tip ? ` title="${esc(t.tip)}"` : ''}><div class="k"><span>${esc(t.label)}</span></div><div class="v${String(t.value).length > 8 ? ' long' : ''}"><span class="val">${esc(t.value)}</span>${t.unit ? `<small class="unit">${esc(t.unit)}</small>` : ''}</div><div class="sp">${t.spark || ''}</div></div>`).join('');

export function todayCard(t, { typical = null, nowHour = null } = {}) {
  let pill = '';
  if (typical && typical.some((m) => m > 0) && nowHour != null) {
    const h = Math.floor(nowHour);
    const usual = typical.slice(0, h).reduce((a, b) => a + b, 0) + (typical[h] || 0) * (nowHour - h);
    const d = t.minutes - usual;
    pill = Math.abs(d) < 5 ? `<span class="pill-cmp eq">≈ like a usual day so far</span>`
      : d > 0 ? `<span class="pill-cmp up">▲ ${hm(d)} h more than usual by now</span>` : `<span class="pill-cmp dn">▼ ${hm(-d)} h less than usual by now</span>`;
  }
  return `<section class="card you-today">
    <header><h2>Today</h2><span class="day-legend"><i class="sw today"></i>today <i class="sw usual"></i>usual day</span></header>
    <div class="day-head"><b class="num">${hm(t.minutes)}<small> h</small></b>${pill}</div>
    <div class="you-day" id="you-day"></div>
  </section>`;
}

export { esc };
