const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const hm = (min) => { min = Math.max(0, Math.round(min || 0)); return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; };
const WD1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

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

export function dayChart(el, typical, today, nowHour) {
  const W = 600, H = 110, slot = W / 24, max = Math.max(1, ...typical, ...today), x = (h) => h * slot, y = (m) => H - (m / max) * (H - 18);
  const bars = Array.from({ length: 24 }, (_, h) => {
    const u = typical[h] || 0, t = today[h] || 0, ahead = h > nowHour;
    return (u > 0 ? `<rect x="${x(h) + 1.5}" y="${y(u)}" width="${slot - 3}" height="${H - y(u)}" rx="3" class="b-usual${ahead ? ' ahead' : ''}"/>` : '')
      + (t > 0 ? `<rect x="${x(h) + slot * 0.22}" y="${y(t)}" width="${slot * 0.56}" height="${H - y(t)}" rx="2.5" class="b-today"/>` : '');
  }).join('');
  const ticks = [0, 6, 12, 18].map((h) => `<text x="${x(h) + 2}" y="${H + 14}" class="tick">${hh(h)}</text>`).join('') + `<text x="${W}" y="${H + 14}" class="tick" text-anchor="end">24:00</text>`;
  const nx = (nowHour / 24) * W;
  el.innerHTML = `<svg viewBox="0 -14 ${W} ${H + 32}" role="img" aria-label="Today hour by hour, against your usual day">
    <line x1="0" x2="${W}" y1="${H}" y2="${H}" class="base"/>${bars}
    <line x1="${nx}" x2="${nx}" y1="-2" y2="${H}" class="now"/><text x="${nx}" y="-5" class="now-l" text-anchor="middle">now</text>${ticks}</svg>`;
}

export function weekCard(w) {
  const max = Math.max(1, ...w.days.map((d) => Math.max(d.minutes, d.projected?.high || 0)));
  const bar = (d, i) => {
    const pct = (m) => `${Math.round((m / max) * 100)}%`;
    const ghost = d.projected && d.kind !== 'done' ? `<i class="ghost" style="height:${pct(d.projected.mid)}" title="likely ${hm(d.projected.mid)}"></i>` : '';
    return `<div class="wbar ${d.kind}"><div class="col">${ghost}<i class="solid" style="height:${pct(d.minutes)}"></i></div><small>${WD1[i]}</small><span>${d.minutes ? hm(d.minutes) : d.projected ? '~' + hm(d.projected.mid) : ''}</span></div>`;
  };
  const line = w.projected ? `Likely <b>${hm(w.projected.mid)}</b> this week${w.usual != null ? `, your usual is ${hm(w.usual)}` : ''}.` : '<span class="muted">The week forecast starts after 3 weeks of history.</span>';
  return `<section class="card you-week">
    <header><h2>This week</h2><span class="muted">${hm(w.minutes)} so far</span></header>
    <p>${line}</p>
    <div class="wbars">${w.days.map(bar).join('')}</div>
  </section>`;
}

export const tokensCard = () => `<section class="card you-cal"><header><h2>Tokens per day</h2></header><div class="cal you-cal-g"></div></section>`;
export function mountTokens(el, d) {
  const g = el.querySelector('.you-cal-g'); if (!g || !globalThis.mountCalendar) return;
  globalThis.mountCalendar(g, d.daily || [], { from: (d.now || Date.now()) - 89 * 864e5, now: d.now || Date.now(), onDraw: (byDay) => {
    for (const c of g.querySelectorAll('.cal-g .cal-d')) { const x = byDay.get(c.dataset.day) || {}; c.title = `${globalThis.calDayName(c.dataset.day)} · ${globalThis.calTok(x.tokens)} tokens`; }
  } });
}

export function habitsCard(r) {
  const weeks = r.activeDaysPerWeek.map((w) => `<i style="height:${w.days == null ? 0 : Math.max(6, (w.days / 7) * 100)}%" class="${w.days == null ? 'none' : ''}" title="${w.days ?? 0} active days"></i>`).join('');
  return `<section class="card you-habits">
    <header><h2>Habits</h2><span class="muted">active days per week, last 12 weeks</span></header>
    <div class="wk">${weeks}</div>
  </section>`;
}

export function renderYou(el, data) {
  el.innerHTML = todayCard(data.today, { typical: data.typicalDay, nowHour: ((data.now + data.tz * 60_000) % 864e5) / 36e5 }) + weekCard(data.week) + habitsCard(data) + tokensCard();
  const nowHour = ((data.now + data.tz * 60_000) % 864e5) / 36e5;
  dayChart(el.querySelector('#you-day'), data.typicalDay, data.today.byHour, nowHour);
  mountTokens(el, data);
}

export const sinceText = (since) => (since ? new Date(since).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export { esc };
