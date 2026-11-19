(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => Math.round(n || 0).toLocaleString();
  const short = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : nf(n));
  const pc = (v) => `${Math.max(0, Math.min(100, +v || 0)).toFixed(2)}%`;
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hm = (m) => { m = Math.max(0, Math.round(m || 0)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : s < 172800 ? 'yesterday' : `${Math.floor(s / 86400)}d ago`; };
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const dayLong = (k) => new Date(`${k}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const dayShort = (k) => new Date(`${k}T12:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
  const repo = (n) => (/^[a-z0-9.-]+\.[a-z]+\/.+\/.+/i.test(n || '') ? n.split('/').pop() : n || 'Other');
  const took = (ms) => (!ms ? '—' : ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))}s` : hm(ms / 60000));

  const tip = (title, pairs = []) => `data-t="${esc(JSON.stringify([String(title ?? ''), pairs.map(([k, v]) => [String(k ?? ''), String(v ?? '')])]))}"`;
  const tipHTML = (raw) => {
    let t; try { t = JSON.parse(raw); } catch { return ''; }
    const [title, pairs] = t;
    return `<b>${esc(title)}</b>${pairs.length ? `<dl class="mt-dl">${pairs.map(([k, v]) => (k ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : `<dd class="w">${esc(v)}</dd>`)).join('')}</dl>` : ''}`;
  };
  const tile = (size, id, label, right, body, cls = '') => `<section class="card mt ${size} ${cls}" data-card="${id}"><header class="mt-lbl"><h2>${esc(label)}</h2>${right ? `<span>${right}</span>` : ''}</header>${body}</section>`;
  const big = (n, unit = '', cls = '') => `<div class="mt-big ${cls}">${esc(n)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>`;
  const line = (t) => `<div class="mt-line">${t}</div>`;
  const axis = (marks) => `<div class="mt-axis">${marks.map(([at, t]) => `<span style="left:${at}%">${esc(t)}</span>`).join('')}</div>`;
  const fact = (v, k, t) => `<div tabindex="0" ${tip(k[0].toUpperCase() + k.slice(1), [['', t]])}><dd>${esc(v)}</dd><dt>${esc(k)}</dt></div>`;
  const grad = (id, col) => `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".42"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>`;

  function windowDays(win) {
    const out = []; const d = new Date(win.from); d.setHours(12, 0, 0, 0);
    while (d.getTime() <= win.to) { out.push(dayKey(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  function lines(codeLines, win) {
    if (!codeLines?.length) return '';
    const days = windowDays(win), by = new Map(days.map((k) => [k, { a: 0, r: 0, p: [] }]));
    let A = 0, R = 0;
    for (const pr of codeLines) for (const d of pr.days || []) { const x = by.get(d.day); if (!x) continue; x.a += d.added; x.r += d.removed; A += d.added; R += d.removed; if (d.added || d.removed) x.p.push([repo(pr.name), d.added, d.removed]); }
    let ca = 0, cr = 0;
    const run = days.map((k) => { const x = by.get(k); ca += x.a; cr += x.r; return [ca, cr]; }), top = Math.max(1, ca), n = days.length;
    const X = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100), Y = (v) => 100 - (v / top) * 96;
    const path = (j) => run.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)} ${Y(v[j]).toFixed(2)}`).join(' ');
    const svg = `<svg class="mt-lnsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grad('mt-g-lines', 'var(--s3)')}<path d="${path(0)} L100 100 L0 100 Z" fill="url(#mt-g-lines)"/><path d="${path(0)}" fill="none" stroke="var(--s3)" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><path d="${path(1)}" fill="none" stroke="var(--s8)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
    const cols = days.map((k, i) => { const x = by.get(k);
      return `<div class="mt-hit" ${tip(dayLong(k), [['Added', `+${nf(x.a)} lines`], ['Removed', `−${nf(x.r)} lines`], ['So far', `+${nf(run[i][0])} −${nf(run[i][1])}`], ...x.p.sort((m, q) => q[1] + q[2] - m[1] - m[2]).slice(0, 3).map(([nm, a, r]) => [nm, `+${nf(a)} −${nf(r)}`])])}><b style="top:clamp(.3125rem, ${pc(Y(run[i][0]))}, calc(100% - .3125rem))"></b><b class="r" style="top:clamp(.3125rem, ${pc(Y(run[i][1]))}, calc(100% - .3125rem))"></b></div>`; }).join('');
    return big(`+${short(A)}`, `−${short(R)} lines`) + line('<i class="mt-key" style="background:var(--s3)"></i>added <i class="mt-key" style="background:var(--s8)"></i>removed')
      + `<div class="mt-pic mt-fill bl"><div class="mt-ch mt-grow"><div class="mt-ln" style="--h:9rem">${svg}<div class="mt-hits">${cols}</div></div>${axis([[0, dayShort(days[0])], [100, 'Today']])}</div></div>`;
  }

  function cal(daily, win, more = () => []) {
    if (!daily) return '';
    const days = windowDays(win), by = new Map(daily.map((d) => [d.day, d])), toks = days.map((k) => Number(by.get(k)?.tokens) || 0), total = toks.reduce((a, b) => a + b, 0), max = Math.max(1, ...toks);
    const steps = ['var(--cal0)', 'var(--seq1)', 'var(--seq2)', 'var(--seq3)', 'var(--seq4)', 'var(--seq5)', 'var(--seq6)'];
    const off = (new Date(`${days[0]}T12:00:00`).getDay() + 6) % 7;
    const pairs = (k, i) => { const d = by.get(k) || {}; return [['Tokens', toks[i] ? short(toks[i]) : 'none'], ['Prompts', nf(d.prompts)], ...(d.sessions != null ? [['Conversations', nf(d.sessions)]] : []), ...(d.tools != null ? [['Agent steps', nf(d.tools)]] : []), ...(total ? [['Share of period', `${((toks[i] / total) * 100).toFixed(1)}%`]] : []), ...more(k)]; };
    const cell = (k, i) => { const lv = toks[i] ? Math.min(6, 1 + Math.floor((toks[i] / max) * 5.999)) : 0;
      return `<i style="background:${steps[lv]}" ${tip(dayLong(k), pairs(k, i))}></i>`; };
    const bar = (k, i) => `<div class="mt-col" ${tip(dayLong(k), pairs(k, i))}>${toks[i] ? `<i style="height:${pc(Math.max(3, (toks[i] / max) * 100))};background:var(--seq4)"></i>` : ''}</div>`;
    const pic = days.length <= 14
      ? `<div class="mt-ch mt-grow"><div class="mt-rk mt-tk" style="--h:10rem">${days.map(bar).join('')}</div><div class="mt-days">${days.map((k) => `<span>${new Date(`${k}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' })}</span>`).join('')}</div></div>`
      : `<div class="mt-cal${days.length > 40 ? ' wide' : ''}">${['M', '', 'W', '', 'F', '', 'S'].map((t) => `<span class="wd">${t}</span>`).join('')}${'<s></s>'.repeat(off)}${days.map(cell).join('')}</div>`;
    return big(short(total), 'tokens') + `<div class="mt-pic mt-fill${days.length <= 14 ? ' bl' : ''}">${pic}</div>`;
  }

  const WIN = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 };
  const SLOTS_OF = { '15m': [15, 60_000, 'minute'], '1h': [6, 600_000, '10 minutes'], '6h': [6, 3_600_000, 'hour'], '24h': [24, 3_600_000, 'hour'] };
  const slotEnd = (step) => { if (step < 3_600_000) return Math.ceil(Date.now() / step) * step; const d = new Date(); d.setMinutes(0, 0, 0); return d.getTime() + 3_600_000; };
  const seg = (win) => `<span class="mt-seg" role="group" aria-label="Window">${Object.keys(WIN).map((k) => `<button type="button" data-win="${k}" aria-pressed="${k === win}">${k}</button>`).join('')}</span>`;

  function conversations(all, win, { colorOf = null, who = null, pill = '' } = {}) {
    const [n, step] = SLOTS_OF[win], end = slotEnd(step), start = end - n * step, list = all.filter((x) => x.ts >= start);
    const slots = Array.from({ length: n }, () => []);
    for (const x of list) slots[Math.min(n - 1, Math.max(0, Math.floor((x.ts - start) / step)))].push(x);
    const tok = (q) => q.reduce((a, x) => a + (x.tokens || 0), 0), max = Math.max(1, ...slots.map(tok));
    const ctxs = slots.map((q) => q.reduce((m, x) => (x.context != null && x.context > (m ?? -1) ? x.context : m), null));
    const rank = new Map();
    if (colorOf) { const t = new Map(); for (const x of list) t.set(x.user, (t.get(x.user) || 0) + (x.tokens || 0)); [...t].sort((a, b) => b[1] - a[1]).forEach(([u], i) => rank.set(u, i)); }
    const cols = slots.map((q, i) => {
      const from = start + i * step, ctx = ctxs[i], t = tok(q), one = q.length === 1 ? q[0] : null;
      const byWho = colorOf ? [...q.reduce((m, x) => m.set(x.user, (m.get(x.user) || 0) + (x.tokens || 0)), new Map())].sort((a, b) => (rank.get(a[0]) ?? 99) - (rank.get(b[0]) ?? 99)) : [];
      const people = colorOf && byWho.length ? byWho.map(([u, v]) => [who?.(u) || 'Someone', v ? short(v) : 'still answering']) : [];
      const pairs = one ? [...(people.length ? [['Who', people[0][0]]] : []), ['Model', one.model || '—'], ['Tokens', `${short(one.tokens)}${one.output ? ` (${short(one.output)} written)` : ''}`], ['Steps', nf(one.steps)], ['Took', took(one.took)], ...(one.cost != null ? [['Cost', `$${one.cost.toFixed(2)}`]] : []), ...(one.len != null ? [['Prompt length', `${nf(one.len)} characters`]] : []), ...(one.context != null ? [['Conversation', `${one.context}% full`]] : [])]
        : q.length ? [...people, ['Prompts', nf(q.length)], ['Tokens', short(t)], ['Steps', nf(q.reduce((a, x) => a + (x.steps || 0), 0))], ...(ctx != null ? [['Fullest conversation', `${ctx}% full`]] : []), ['Models', [...new Set(q.map((x) => x.model).filter(Boolean))].join(', ') || '—']] : [['', 'No prompts']];
      const title = one ? `Prompt at ${clock(one.ts)}` : step >= 300_000 ? `${clock(from)}–${clock(from + step)}` : clock(from);
      let fill = '';
      if (t && colorOf) {
        let at = 0; const parts = byWho.filter(([, v]) => v);
        fill = parts.map(([u, v], k) => { const h = Math.max(3, (t / max) * 100) * (v / t), s = `<i class="${k < parts.length - 1 ? 'flat' : ''}" style="bottom:${pc(at)};height:${pc(h)};background:${colorOf(u)}"></i>`; at += h; return s; }).join('');
      } else if (t) fill = `<i style="height:${pc(Math.max(3, (t / max) * 100))}"></i>`;
      return `<div class="mt-col" ${tip(title, pairs)}>${fill}</div>`; }).join('');
    const X = (i) => ((i + 0.5) / n) * 100, Y = (v) => 100 - v * 0.96 - 2, w = 50 / n;
    const pts = ctxs.map((v, i) => [i, v]).filter(([, v]) => v != null);
    const area = pts.length > 1 ? `M${X(pts[0][0]).toFixed(2)} 100 ${pts.map(([i, v]) => `L${X(i).toFixed(2)} ${Y(v).toFixed(2)}`).join(' ')} L${X(pts.at(-1)[0]).toFixed(2)} 100 Z` : '';
    const d = pts.length === 1 ? `M${(X(pts[0][0]) - w).toFixed(2)} ${Y(pts[0][1]).toFixed(2)} L${(X(pts[0][0]) + w).toFixed(2)} ${Y(pts[0][1]).toFixed(2)}` : pts.map(([i, v], j) => `${j ? 'L' : 'M'}${X(i).toFixed(2)} ${Y(v).toFixed(2)}`).join(' ');
    const hot = ctxs.some((v) => v >= 90), col = hot ? 'var(--critical)' : 'var(--s4)';
    const ctxHits = ctxs.map((v) => `<div class="mt-hit" ${tip(v == null ? 'No prompts' : `${v}% full`, v == null ? [] : [['', 'How full the fullest conversation got'], ...(v >= 90 ? [['', 'Past 90%, answers slow down and lose detail']] : [])])}></div>`).join('');
    const cx = `<div class="mt-cx"><svg class="mt-lnsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grad('mt-g-ctx', col)}${area ? `<path d="${area}" fill="url(#mt-g-ctx)"/>` : ''}${d ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>` : ''}</svg><div class="mt-hits">${ctxHits}</div></div>`;
    return `<div class="mt-big">${nf(list.length)}<small>prompts · ${short(tok(list))} tokens</small>${pill}</div>`
      + `<div class="mt-pic mt-fill bl"><div class="mt-ch mt-grow"><div class="mt-stack"><div class="mt-rk mt-ppc" style="--h:8rem">${cols}</div>${cx}</div>${axis([[0, clock(start)], [50, clock(start + (n / 2) * step)], [100, 'Now']])}</div></div>`;
  }

  function wire(el, { showTip, hideTip }) {
    let on = null, touchT = null, gapT = null;
    const show = (t, x, y) => { showTip({ clientX: x, clientY: y, target: t }, tipHTML(t.dataset.t)); if (on !== t) { on?.classList.remove('on'); on = t; t.classList.add('on'); } };
    const hide = () => { clearTimeout(touchT); clearTimeout(gapT); if (!on) return; hideTip(); on.classList.remove('on'); on = null; };
    addEventListener('scroll', hide, { passive: true });
    el.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; const t = e.target.closest('[data-t]'); clearTimeout(gapT); if (t) show(t, e.clientX, e.clientY); else if (on) gapT = setTimeout(hide, 120); });
    el.addEventListener('pointerleave', hide);
    el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; const t = e.target.closest('[data-t]'); if (t) { show(t, e.clientX, e.clientY); clearTimeout(touchT); touchT = setTimeout(hide, 5000); } else hide(); });
    el.addEventListener('focusin', (e) => { const t = e.target.closest('[data-t]'); if (!t || !t.matches(':focus-visible')) return; const b = t.getBoundingClientRect(); show(t, b.left + Math.min(b.width / 2, 40), b.top); });
    el.addEventListener('focusout', hide);
    addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    return { hide, active: () => on };
  }

  globalThis.PuddleTiles = { esc, nf, short, pc, pad, clock, hm, ago, dayKey, dayLong, dayShort, repo, took, tip, tipHTML, tile, big, line, axis, fact, grad, windowDays, lines, cal, conversations, WIN, SLOTS_OF, slotEnd, seg, wire };
})();
