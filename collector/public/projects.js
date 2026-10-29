// What the work was about, the same on Me, a person's page and the team page. recentHTML: the latest
// conversations, a row each. promptSpark: a conversation's prompts as a small chart (the project page uses it).
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // a repo by its own name (gitlab.com/acme/green-point-web-app → green-point-web-app); the full path on hover
  const repoName = (n) => (/^[a-z0-9.-]+\.[a-z]+\/.+\/.+/i.test(n) ? n.split('/').pop() : n);
  // a conversation nobody named (and no app gave a title): the day it was last worked on
  const untitled = (c) => (c.last ? `Conversation on ${new Date(c.last).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Conversation');
  // A project's prompts in order as a small chart: a column per prompt, as tall as what it spent, in the colour of
  // whoever sent it; the line is the context its calls ran at. Each scaled to the project's own largest.
  const spark = (series, colorOf) => {
    const pts = (series || []).filter((x) => x.cost > 0);
    if (pts.length < 2) return '<span class="pj-spark empty"></span>';
    const W = 200, H = 30, n = pts.length, step = W / n, bw = Math.max(1.5, step * 0.62);
    const maxC = Math.max(...pts.map((x) => x.cost)), ctxs = pts.map((x) => x.ctx || 0), maxX = Math.max(1, ...ctxs);
    const cols = pts.map((x, i) => { const h = Math.max(1.5, (x.cost / maxC) * (H - 4)); return `<rect x="${(i * step + (step - bw) / 2).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${colorOf(x.u)}"/>`; }).join('');
    const line = ctxs.map((c, i) => `${(i * step + step / 2).toFixed(1)},${(H - 2 - (c / maxX) * (H - 6)).toFixed(1)}`).join(' ');
    return `<svg class="pj-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${cols}<polyline points="${line}" fill="none" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity=".75"/></svg>`;
  };
  globalThis.promptSpark = spark; // the project page draws its conversations the same way
  // What everyone is on: a row per conversation (on the team page each person's latest; on a person's page their last
  // few), newest first: who, its title, the project, how long it was worked on, when. A row opens the conversation on
  // its project's page; "See all" opens every conversation, a page at a time (work.html).
  // opts: { avatar(user_key) → html, nameOf(user_key) → text (or null to leave names out), time(min) → text,
  //         ago(ts) → text, href(row) → link, seeAll → link (or null) }
  globalThis.recentHTML = (rows, { avatar = () => '', nameOf = null, time, ago, href = null, seeAll = null } = {}) => {
    const tag = (c, inner) => (href ? `<a class="rc" href="${esc(href(c))}" title="${esc(c.project)}">${inner}</a>` : `<span class="rc" title="${esc(c.project)}">${inner}</span>`);
    return `<div class="rcs">${rows.map((c) => tag(c, `${avatar(c.user_key)}<span class="rc-t"><b>${esc(c.title || untitled(c))}</b>`
      + `<small>${nameOf ? `${esc(nameOf(c.user_key))} · ` : ''}${esc(repoName(c.project))}</small></span><span class="rc-m">${time(c.minutes)}</span><span class="rc-a">${ago(c.last)} ago</span>`)).join('')}</div>`
      + (seeAll ? `<a class="rc-all" href="${esc(seeAll)}">See all conversations ›</a>` : '');
  };
})();
