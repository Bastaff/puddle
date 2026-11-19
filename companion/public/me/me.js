import { mountPerson } from '/person.js';
import { SHARE_PARTS } from '/share-parts.js';

const $ = (s) => document.querySelector(s);
function sure(btn, text) {
  if (btn.dataset.armed) { delete btn.dataset.armed; clearTimeout(btn._t); return true; }
  const was = btn.textContent; btn.dataset.armed = '1'; btn.textContent = text; btn.classList.add('armed');
  btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = was; btn.classList.remove('armed'); }, 4000);
  return false;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let signIn = null;
fetch('/api/site-nav').then((r) => r.json()).then((d) => {
  signIn = d.signedOut ? d.signIn || null : null;
  if (d.signedOut && !d.signIn) { const b = $('#share-live'); b?.setAttribute('aria-disabled', 'true'); b?.setAttribute('title', 'Share live needs Puddle\u2019s website, which this copy is built without'); }
  globalThis.PuddleBar?.nav(d);
}).catch(() => {});
mountPerson($('#pv'), { api: ({ from, to, tz }) => `/api/person?from=${from}&to=${to}&tz=${tz}`, stream: '/api/stream', you: true });

const clock = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const COPY_IC = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg>';
const R = (x, y, w, h, c, r = 2, o = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" style="fill:${c}"${o < 1 ? ` opacity="${o}"` : ''}/>`;
const MINI = {
  today: [10, 16, 12, 22, 8, 18, 26, 14, 20, 30, 12, 24].map((h, i) => R(4 + i * 8, 40 - h, 6, h, i === 9 ? 'var(--s2)' : 'var(--s1)', 2)).join(''),
  calendar: Array.from({ length: 30 }, (_, i) => R(5 + (i % 10) * 9.2, 6 + Math.floor(i / 10) * 11, 8, 8, i >= 25 ? 'var(--s2)' : [3, 7, 14].includes(i) ? 'var(--cal0)' : 'var(--s1)', 2.4)).join(''),
  lines: '<path d="M4 36 C20 34 28 26 40 24 S70 12 96 8" fill="none" style="stroke:var(--s3)" stroke-width="3" stroke-linecap="round"/>',
  prompts: R(30, 32, 16, 8, 'var(--axis)', 3) + R(54, 4, 16, 36, 'var(--s2)', 3),
  hands: '<circle cx="50" cy="22" r="14" fill="none" style="stroke:var(--cal0)" stroke-width="7"/><circle cx="50" cy="22" r="14" fill="none" style="stroke:var(--s3)" stroke-width="7" stroke-dasharray="80 88" stroke-linecap="round" transform="rotate(-90 50 22)"/>',
  work: [[4, 44, 'var(--s1)'], [50, 34, 'var(--s7)'], [86, 10, 'var(--s3)']].map(([x, w, c]) => R(x, 12, w - 2, 20, c, 4)).join(''),
};
for (const k in MINI) MINI[k] = `<svg viewBox="0 0 100 44" preserveAspectRatio="xMidYMid meet">${MINI[k]}</svg>`;
async function shareLive() {
  const d = document.createElement('dialog'); d.className = 'sheet share-sheet';
  const t = await fetch(`/api/today?tz=${-new Date().getTimezoneOffset()}`).then((r) => r.json()).catch(() => ({}));
  const today = clock((t.activeSeconds || 0) / 60), week = clock(t.weekMinutes || 0);
  let show = null;
  let line = '', auto = '';
  const on = () => SHARE_PARTS.filter((x) => show?.[x.id]);
  const preview = (url) => `<div class="sh-preview${url ? ' on' : ''}">
      <div class="sh-addr"><span class="sh-live" aria-hidden="true"></span><span>${url ? esc(url.replace(/^https?:\/\//, '')) : 'Your page, once you share'}</span></div>
      ${!show || show.today ? `<div class="sh-nums"><div><small>Today</small><b>${today}<small>h</small></b></div><div><small>This week</small><b>${week}<small>h</small></b></div></div>` : ''}
      <div class="sh-what">${show ? (on().length ? `${on().length} ${on().length === 1 ? 'record' : 'records'} from your last 30 days, live` : 'Nothing yet: pick what it shows below') : 'Your time with agents, live'}</div>
    </div>`;
  const lineField = () => (show ? `<label class="sh-line"><h3>Under your name</h3>
      <input id="sh-line" maxlength="80" value="${esc(line)}" placeholder="${esc(auto || 'Building with AI coding agents.')}" autocomplete="off" spellcheck="true">
      <small>${line ? 'Your words, shown under your name.' : 'Empty: Puddle writes it from your numbers. Write your own, like where you build.'}</small></label>` : '');
  const picker = () => (show ? `<div class="sh-pick"><h3>What’s on your page</h3><div class="sh-parts">${SHARE_PARTS.map((x) =>
      `<div class="sh-part" role="button" tabindex="0" data-part="${x.id}" aria-pressed="${Boolean(show[x.id])}" aria-label="${esc(`${x.title}: ${x.line}`)}">
        <span class="sh-mini" aria-hidden="true">${MINI[x.id] || ''}</span>
        <span class="sh-row"><i class="sh-tick" aria-hidden="true"></i><span class="sh-name">${esc(x.title)}</span></span></div>`).join('')}</div></div>` : '');
  const paint = (r, err) => {
    d.innerHTML = `<header><h2>Share live</h2><button class="icon-btn" data-close aria-label="Close">✕</button></header>` + (err === 'signin'
      ? preview(null) + (signIn ? `<a class="sh-go" href="${esc(signIn)}">Sign in to share</a><p class="sh-small">Sharing needs a free account. We email you a code, no password.</p>`
        : '<p class="sh-small">Sharing needs Puddle’s website, which this copy is built without.</p>')
      : err ? `<p class="sh-err">${esc(err)}</p>`
      : preview(r.url) + lineField() + picker() + (r.url
        ? `<div class="sh-link"><code>${esc(r.url)}</code><button class="sh-copy" data-a="copy">${COPY_IC}<span>Copy</span></button></div>
           <div class="sh-more"><a href="${esc(r.url)}" target="_blank" rel="noopener">Open</a><button data-a="new">New link</button><button data-a="off" class="sh-off">Turn off</button></div>`
        : `<button class="sh-go" data-a="on">Start sharing</button><p class="sh-small">You can turn it off any time; the link stops working at once.</p>`));
    d.querySelector('[data-close]').onclick = () => d.close();
  };
  document.body.append(d); d.showModal(); d.addEventListener('close', () => d.remove());
  const call = async (action, body = {}) => { const r = await fetch('/api/share', action ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-puddle': '1' }, body: JSON.stringify({ action, ...body }) } : {}); const j = await r.json().catch(() => ({}));
    if (r.ok) { show = j.show && 'today' in j.show ? j.show : null; url = j.url || null; line = typeof j.line === 'string' ? j.line : ''; auto = j.auto || ''; return action === 'line' ? null : paint(j); } return paint(null, r.status === 401 ? 'signin' : j.error || 'Something went wrong.'); };
  let url = null;
  d.addEventListener('click', async (e) => {
    const part = e.target.closest('[data-part]'); if (!part || !show) return;
    show = { ...show, [part.dataset.part]: !show[part.dataset.part] };
    part.setAttribute('aria-pressed', String(show[part.dataset.part]));
    d.querySelector('.sh-preview').outerHTML = preview(url);
    await call('show', { show });
  });
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'copy') { await navigator.clipboard.writeText(d.querySelector('.sh-link code').textContent).catch(() => {}); b.classList.add('done'); b.querySelector('span').textContent = 'Copied'; return; }
    if (b.dataset.a === 'off' && !sure(b, 'Click again to turn off')) return;
    await call(b.dataset.a);
  });
  let lineTimer = 0;
  const saveLine = () => { clearTimeout(lineTimer); const v = d.querySelector('#sh-line')?.value ?? ''; if (v.trim() === line) return; line = v.trim(); call('line', { line }); const s = d.querySelector('.sh-line small'); if (s) s.textContent = line ? 'Saved: shown under your name.' : 'Empty: Puddle writes it from your numbers.'; };
  d.addEventListener('input', (e) => { if (e.target.id === 'sh-line') { clearTimeout(lineTimer); lineTimer = setTimeout(saveLine, 900); } });
  d.addEventListener('change', (e) => { if (e.target.id === 'sh-line') saveLine(); });
  d.addEventListener('keydown', (e) => { if (e.target.id === 'sh-line' && e.key === 'Enter') { e.preventDefault(); saveLine(); } });
  d.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.sh-part')) { e.preventDefault(); e.target.click(); } });
  paint({ url: null }); d.querySelector('.sh-go')?.setAttribute('disabled', '');
  await call(null);
}
document.getElementById('share-live')?.addEventListener('click', shareLive);
fetch('/api/share-next').then((r) => r.json()).then((d) => { if (d.open) shareLive(); }).catch(() => {});
