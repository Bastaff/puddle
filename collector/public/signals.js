// Three small signs after a person's name (team rows, Me, a person's page): the app they work in, their effort
// level as a little rev counter, and how full their conversations get. Solid two-tone like the other icons.
// Plain script: globalThis.signalsHTML(p) → markup; globalThis.signalTip(kind, p) → tooltip HTML for that sign.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = (body) => `<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">${body}</svg>`;

  // the app, from Claude Code's entrypoint or Codex's originator
  const APP = {
    app: { label: 'the desktop app', icon: S('<rect x="1" y="2" width="14" height="12" rx="3" opacity=".3"/><rect x="1" y="2" width="14" height="3.6" rx="1.8"/><circle cx="3.4" cy="3.8" r=".8" opacity=".5"/>') },
    terminal: { label: 'the terminal', icon: S('<rect x="1" y="2" width="14" height="12" rx="3" opacity=".3"/><path d="M4.3 5.4 7 8l-2.7 2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.3" y="9.7" width="4.2" height="2" rx="1"/>') },
    editor: { label: 'an editor', icon: S('<rect x="1" y="2" width="14" height="12" rx="3" opacity=".3"/><path d="M6.2 5.2 3.6 8l2.6 2.8M9.8 5.2 12.4 8l-2.6 2.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>') },
    scripts: { label: 'scripts and automation', icon: S('<circle cx="8" cy="8" r="6.6" opacity=".3"/><path d="M9 1.8 4.6 8.9h3.2L7 14.2l4.4-7.1H8.2z"/>') },
  };
  // the client (Claude Code's entrypoint, Codex's originator) from the agent catalogue (/agents.js)
  const kindOf = (c) => globalThis.JouleAgents?.client(c)?.kind || null;
  const appName = (c) => { const x = globalThis.JouleAgents?.client(c); return !x ? String(c || '') : x.kind === 'scripts' && x.unknown ? 'scripts' : x.label; };

  // effort: a rev counter whose needle points from low to max
  const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
  const effortIcon = (e) => {
    const i = Math.max(0, LEVELS.indexOf(String(e || '').toLowerCase())), a = -70 + i * 35; // degrees from straight up
    return S(`<path d="M1.6 11.6a6.4 6.4 0 0 1 12.8 0z" opacity=".3"/><rect x="7.1" y="4.4" width="1.8" height="7.2" rx=".9" transform="rotate(${a} 8 11.4)"/><circle cx="8" cy="11.4" r="2"/>`);
  };

  // context: a little meter filled to the usual peak
  const ctxIcon = (c) => {
    const h = Math.max(1.5, Math.round((c.typical / 100) * 11 * 10) / 10);
    return S(`<rect x="3.5" y="1.5" width="9" height="13" rx="2.6" opacity=".3"/><rect x="3.5" y="${(14.5 - h).toFixed(1)}" width="9" height="${h}" rx="2.6"/>`);
  };
  const ctxLevel = (c) => (c.full >= 2 || c.max >= 98 ? 'hot' : c.typical >= 70 || c.full ? 'warm' : '');

  globalThis.signalsHTML = (p) => {
    const out = [], k = kindOf(p.client);
    if (k) out.push(`<span class="sig sig-app" data-sig="app">${APP[k].icon}</span>`);
    if (p.effortNow) out.push(`<span class="sig sig-effort" data-sig="effort" data-level="${esc(p.effortNow)}">${effortIcon(p.effortNow)}</span>`);
    if (p.context) out.push(`<span class="sig sig-ctx ${ctxLevel(p.context)}" data-sig="ctx">${ctxIcon(p.context)}</span>`);
    return out.length ? `<span class="sigs">${out.join('')}</span>` : '';
  };
  const pct = (part, all) => (all ? Math.round((part / all) * 100) : 0);
  globalThis.signalTip = (kind, p) => {
    if (kind === 'app') {
      const total = (p.clients || []).reduce((a, c) => a + c.sessions, 0);
      const others = (p.clients || []).filter((c) => c.client !== p.client).slice(0, 2).map((c) => `${appName(c.client)} ${pct(c.sessions, total)}%`).join(', ');
      return `<b>Works in ${esc(appName(p.client))}</b><div>${others ? `Also: ${esc(others)}` : 'Every conversation in this period.'}</div>`;
    }
    if (kind === 'effort') {
      const mix = Object.entries(p.effort || {}).filter(([k]) => k !== 'default'), total = mix.reduce((a, [, n]) => a + n, 0);
      return `<b>Effort: ${esc(p.effortNow)} now</b>${total ? `<div>This period: ${mix.sort((a, b) => b[1] - a[1]).map(([k, n]) => `${pct(n, total)}% ${esc(k)}`).join(', ')}</div>` : ''}`;
    }
    const c = p.context;
    return `<b>Conversations usually reach ${c.typical}% of what the model can hold</b><div>${c.full ? `${c.full} of ${c.sessions} got close to full (90%+)` : `None got close to full (largest ${c.max}%)`}${p.compactions ? `; Claude squeezed ${p.compactions} to make room` : ''}.</div>`;
  };
})();
