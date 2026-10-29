// A public "You" page: only the parts the person chose in Settings → Sharing (time, rhythm, kinds of work).
import { kpiTiles, spark, hm, todayCard, dayChart, tokensCard, mountTokens } from '/you.js';

// a public page: only the parts the person chose in Settings → Sharing (time, rhythm, kinds of work)
const KINDS = { run: ['Running commands', 'var(--k-run)'], edit: ['Editing code', 'var(--k-edit)'], read: ['Reading code', 'var(--k-read)'], web: ['Web research', 'var(--k-web)'],
  agent: ['Sub-agents', 'var(--k-agent)'], mcp: ['Connected tools', 'var(--k-mcp)'], other: ['Planning & other', 'var(--k-other)'] };
export function renderPublic(el, d) {
  let html = '';
  if (d.today) html += `<section class="kpis headline">${kpiTiles([
    { label: 'Today', value: hm(d.today.minutes), unit: 'h', spark: spark(d.today.byHour, 'var(--s2)') },
    { label: 'This week', value: hm(d.week.minutes), unit: 'h', spark: spark(d.week.days.map((x) => x.minutes), 'var(--s1)') }])}</section>` + todayCard(d.today, { typical: d.typicalDay, nowHour: ((d.now + d.tz * 60_000) % 864e5) / 36e5 });
  if (d.mix) {
    const tot = Object.values(d.mix).reduce((a, b) => a + b, 0), kinds = Object.entries(d.mix).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
    html += `<section class="card you-work"><header><h2>What the agent works on</h2></header>${tot ? kinds.map(([k, v]) => `<div class="wk-row"><span class="wk-l">${KINDS[k][0]}</span>
      <div class="wk-b"><i style="width:${Math.round((v / kinds[0][1]) * 100)}%;background:${KINDS[k][1]}"></i></div><b>${Math.round((v / tot) * 100)}%</b><small></small></div>`).join('') : '<p class="muted">Nothing yet.</p>'}</section>`;
  }
  if (d.daily) html += tokensCard();
  el.innerHTML = html || '<p class="muted">Nothing shared here yet.</p>';
  if (d.daily) mountTokens(el, d);
  if (d.today) dayChart(el.querySelector('#you-day'), d.typicalDay || new Array(24).fill(0), d.today.byHour, ((d.now + d.tz * 60_000) % 864e5) / 36e5);
}
