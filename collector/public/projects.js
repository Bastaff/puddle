(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const repoName = (n) => (/^[a-z0-9.-]+\.[a-z]+\/.+\/.+/i.test(n) ? n.split('/').pop() : n);
  const untitled = (c) => (c.last ? `Conversation on ${new Date(c.last).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Conversation');
  const spark = (series, colorOf) => {
    const pts = (series || []).filter((x) => x.cost > 0);
    if (pts.length < 2) return '<span class="pj-spark empty"></span>';
    const W = 200, H = 30, n = 24, from = Math.min(...pts.map((x) => x.t)), to = Math.max(...pts.map((x) => x.t)), span = Math.max(1, to - from), step = W / n, bw = step * 0.66;
    const slots = Array.from({ length: n }, () => ({ cost: 0, ctx: 0, u: null }));
    for (const x of pts) { const sl = slots[Math.min(n - 1, Math.floor(((x.t - from) / span) * n))]; sl.cost += x.cost; sl.ctx = Math.max(sl.ctx, x.ctx || 0); sl.u = sl.u ?? x.u; }
    const maxC = Math.max(...slots.map((sl) => sl.cost)), maxX = Math.max(1, ...slots.map((sl) => sl.ctx));
    const cols = slots.map((sl, i) => { if (!sl.cost) return ''; const h = Math.max(1.5, (sl.cost / maxC) * (H - 4)); return `<rect x="${(i * step + (step - bw) / 2).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${colorOf(sl.u)}"/>`; }).join('');
    const line = slots.map((sl, i) => (sl.cost ? `${(i * step + step / 2).toFixed(1)},${(H - 2 - (sl.ctx / maxX) * (H - 6)).toFixed(1)}` : '')).filter(Boolean).join(' ');
    return `<svg class="pj-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${cols}<polyline points="${line}" fill="none" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity=".75"/></svg>`;
  };
  globalThis.promptSpark = spark;
  globalThis.recentHTML = (rows, { avatar = () => '', nameOf = null, time, ago, href = null, seeAll = null } = {}) => {
    const tag = (c, inner) => (href ? `<a class="rc" href="${esc(href(c))}" title="${esc(c.project)}">${inner}</a>` : `<span class="rc" title="${esc(c.project)}">${inner}</span>`);
    return `<div class="rcs">${rows.map((c) => tag(c, `${avatar(c.user_key)}<span class="rc-t"><b>${esc(c.title || untitled(c))}</b>`
      + `<small>${nameOf ? `${esc(nameOf(c.user_key))} · ` : ''}${esc(repoName(c.project))}</small></span><span class="rc-m">${time(c.minutes)}</span><span class="rc-a">${ago(c.last)} ago</span>`)).join('')}</div>`
      + (seeAll ? `<a class="rc-all" href="${esc(seeAll)}">See all conversations ›</a>` : '');
  };
})();
