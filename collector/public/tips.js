const LEARN = globalThis.LEARN || { on: false, explain: () => '' };
let tip = document.getElementById('tip');
if (!tip) { tip = document.createElement('div'); tip.id = 'tip'; tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.append(tip); }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function showTip(e, html) {
  if (LEARN.on) {
    const x = LEARN.explain(e.target?.closest?.('[data-learn]')?.dataset.learn);
    if (x) html = (html || '') + `<div class="learn-x">${x}</div>`;
  }
  if (!html) return hideTip();
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
export const hideTip = () => { tip.hidden = true; };
export const rows = (pairs) => pairs.map(([k, v, c]) => `<div class="row"><span>${c ? `<i style="background:${c}"></i>` : ''}${esc(k)}</span><span>${v}</span></div>`).join('');
export function hover(el, html) {
  if (!el) return;
  el.onmousemove = (e) => showTip(e, typeof html === 'function' ? html(e) : html);
  el.onmouseleave = hideTip;
  el.ontouchstart = (e) => showTip(e.touches[0], typeof html === 'function' ? html(e.touches[0]) : html);
}
export const learn = LEARN;
addEventListener('scroll', hideTip, { passive: true });
let learnTip = false;
const ownTip = (n) => { for (; n && n !== document.body; n = n.parentElement) { if (n.onmousemove) return true; if (n.dataset?.learn) return false; } return false; };
document.addEventListener('mousemove', (e) => {
  if (!LEARN.on || ownTip(e.target)) return;
  if (e.target.closest?.('[data-learn]')) { showTip(e, ''); learnTip = true; } else if (learnTip) { hideTip(); learnTip = false; }
});
