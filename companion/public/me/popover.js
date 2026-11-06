import { hm, spark, kpiTiles, todayCard, esc } from '/you.js';
import { CAT, liveState } from '/person.js';

const $ = (s) => document.querySelector(s);
const inApp = new URLSearchParams(location.search).has('app');
const act = (cmd, fallback) => { if (inApp) location.href = '/__joule/' + cmd; else if (fallback) window.open(fallback, '_blank'); };
addEventListener('keydown', (e) => { if (e.key === 'Escape') act('hide_popover'); });
const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="9.9" y="1.4" width="4.2" height="5.2" rx="1.6" transform="rotate(${a} 12 12)"/>`).join('') + '<path fill-rule="evenodd" d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 4.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z"/></svg>';
const ICON = (k) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${CAT[k]?.ic || ''}</svg>`;

function sixHours(el, l, typical) {
  if (!l?.minutes) return;
  const W = 240, H = 58, n = l.minutes.length, slot = W / n, y = (m) => H - (Math.min(15, m) / 15) * (H - 4);
  const hourOf = (i) => new Date(l.from + i * l.slot).getHours();
  const bars = l.minutes.map((m, i) => { const u = (typical?.[hourOf(i)] || 0) / 4, x = i * slot;
    return (u > 0.2 ? `<rect x="${(x + 1).toFixed(1)}" y="${y(u).toFixed(1)}" width="${(slot - 2).toFixed(1)}" height="${(H - y(u)).toFixed(1)}" rx="2" class="b-usual"/>` : '')
      + (m > 0.2 ? `<rect x="${(x + slot * 0.2).toFixed(1)}" y="${y(m).toFixed(1)}" width="${(slot * 0.6).toFixed(1)}" height="${(H - y(m)).toFixed(1)}" rx="1.5" class="b-today"/>` : ''); }).join('');
  const nowX = ((Date.now() - l.from) / (n * l.slot)) * W;
  const ticks = l.minutes.map((_, i) => i).filter((i) => new Date(l.from + i * l.slot).getMinutes() === 0 && i / n > 0.07 && i / n < 0.93)
    .map((i) => `<span style="left:${((i / n) * 100).toFixed(2)}%">${String(hourOf(i)).padStart(2, '0')}:00</span>`).join('');
  el.innerHTML = `<div class="pp-now" style="left:${((nowX / W) * 100).toFixed(2)}%">now</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The last 6 hours, against your usual pace"><line x1="0" x2="${W}" y1="${H}" y2="${H}" class="base"/>${bars}<line x1="${nowX.toFixed(1)}" x2="${nowX.toFixed(1)}" y1="0" y2="${H}" class="now"/></svg>
    <div class="pp-ticks">${ticks}</div>`;
}

let busy = false;
async function draw() {
  if (busy) return; busy = true;
  try {
    const tz = -new Date().getTimezoneOffset();
    const [r, t, pop] = await Promise.all([j(`/api/me/rhythm?tz=${tz}`), j(`/api/today?tz=${tz}`), j('/api/popover')]);
    if (!r || !t) { if (!$('#pp').children.length) $('#pp').innerHTML = '<p class="muted pp-wait">Puddle is starting…</p>'; return; }
    const p = t.person || {}, st = liveState(p);
    const nowHour = ((r.now + r.tz * 60_000) % 864e5) / 36e5;
    const mix = p.mix || {}, total = Object.values(mix).reduce((a, b) => a + b, 0);
    const kinds = Object.entries(mix).filter(([k, v]) => v && CAT[k]).sort((a, b) => b[1] - a[1]);
    const team = pop?.connected ? `<button type="button" class="btn pp-door" id="team"${navigator.onLine ? '' : ' aria-disabled="true" title="Needs an internet connection"'}>${esc(pop.team || 'Team')}</button>`
      : pop?.website ? '<button type="button" class="btn pp-door" id="team">Sign in</button>' : '';
    const u = pop?.update;
    $('#pp').innerHTML = `
      <div class="pv-bar pp-state"><span class="pv-state ${st.kind}" style="--c:${st.c}"><i></i><span>${esc(st.text)}</span></span></div>
      ${todayCard(r.today, { typical: r.typicalDay, nowHour })}
      <section class="kpis headline pp-week">${kpiTiles([{ label: 'This week', value: hm(r.week.minutes), unit: 'h', spark: spark(r.week.days.map((d) => d.minutes), 'var(--s1)') }])}</section>
      ${total ? `<section class="card pp-work"><header><h2>What the agent worked on</h2></header>
        <div class="pp-mix">${kinds.map(([k, v]) => `<i style="flex:${v};background:${CAT[k].c}"></i>`).join('')}</div>
        <div class="pp-kinds">${kinds.slice(0, 3).map(([k, v]) => `<span style="--c:${CAT[k].c}">${ICON(k)}${esc(CAT[k].short)} <b>${Math.round((v / total) * 100)}%</b></span>`).join('')}</div></section>` : ''}
      <div class="pp-doors"><button type="button" class="btn primary pp-door" id="me">Me</button>${team}<button type="button" class="btn pp-door pp-gear" id="settings" aria-label="Settings" title="Settings">${GEAR}</button></div>
      ${u?.available ? `<div class="pp-upd"><span><b>New Puddle ready</b> · ${u.error ? esc(u.error) : u.status === 'installing' ? 'installing, it restarts in a moment' : 'takes a minute'}</span>${u.status === 'installing' ? '' : '<button type="button" class="btn" id="upd">Install</button>'}</div>` : ''}
      <div class="pp-brand"><img src="/brand/icon.svg" width="15" height="15" alt=""><b>Puddle</b>${u?.current ? `<small>${esc(u.current)}</small>` : ''}</div>`;
    const day = $('#you-day'); if (day) { day.classList.add('pp-six'); sixHours(day, t.last6, r.typicalDay); }
    $('#me').onclick = () => act('open_me', '/');
    if ($('#team')) $('#team').onclick = (e) => { if (e.currentTarget.getAttribute('aria-disabled') === 'true') return; act(pop.connected ? 'open_dashboard' : 'open_settings', pop.connected ? '/go?to=team' : null); };
    $('#settings').onclick = () => act(pop?.connected ? 'open_account' : 'open_settings', '/mac');
    if ($('#upd')) $('#upd').onclick = async () => { await fetch('/api/update/install', { method: 'POST', headers: { 'x-puddle': '1' } }).catch(() => {}); draw(); setTimeout(draw, 4000); };
  } finally { busy = false; }
}
window.puddleRefresh = draw;
draw();
setInterval(() => { if (document.visibilityState === 'visible') draw(); }, 30_000);
