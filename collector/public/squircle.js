(() => {
  if (!window.CSS || CSS.supports('corner-shape', 'squircle') || typeof ResizeObserver === 'undefined') return;
  const SEL = '.card, .kpi, .lay-tray, .sheet, .menu, .pick, .pcard, .p-today, .srow';
  const SMOOTH = 0.6;
  const rad = (deg) => (deg * Math.PI) / 180;

  function corner(R, budget) {
    let s = SMOOTH, p = (1 + s) * R;
    if (p > budget) { s = Math.max(0, budget / R - 1); p = Math.min(p, budget); }
    const arc = 90 * (1 - s), L = Math.sin(rad(arc / 2)) * R * Math.SQRT2;
    const alpha = (90 - arc) / 2, p3p4 = R * Math.tan(rad(alpha / 2)), beta = 45 * s;
    const c = p3p4 * Math.cos(rad(beta)), d = c * Math.tan(rad(beta));
    const b = (p - L - c - d) / 3, a = 2 * b;
    return { R, p, L, a, b, c, d };
  }
  function path(w, h, r) {
    const R = Math.min(r, w / 2, h / 2);
    if (R <= 0) return `M0 0H${w}V${h}H0Z`;
    const { p, L, a, b, c, d } = corner(R, Math.min(w, h) / 2), n = (x) => +x.toFixed(2);
    const e = n(a + b + c);
    return [`M${n(w - p)} 0`, `c${n(a)} 0 ${n(a + b)} 0 ${e} ${n(d)}`, `a${n(R)} ${n(R)} 0 0 1 ${n(L)} ${n(L)}`, `c${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${e}`,
      `L${w} ${n(h - p)}`, `c0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${e}`, `a${n(R)} ${n(R)} 0 0 1 ${n(-L)} ${n(L)}`, `c${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${-e} ${n(d)}`,
      `L${n(p)} ${h}`, `c${n(-a)} 0 ${n(-(a + b))} 0 ${-e} ${n(-d)}`, `a${n(R)} ${n(R)} 0 0 1 ${n(-L)} ${n(-L)}`, `c${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${-e}`,
      `L0 ${n(p)}`, `c0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${-e}`, `a${n(R)} ${n(R)} 0 0 1 ${n(L)} ${n(-L)}`, `c${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${e} ${n(-d)}`, 'Z'].join('');
  }
  const shadows = (box) => (!box || box === 'none' ? '' : box.split(/,(?![^(]*\))/).filter((x) => !/inset/.test(x)).map((x) => {
    const color = (x.match(/rgba?\([^)]*\)|#[0-9a-f]+/i) || ['rgba(0,0,0,.1)'])[0], len = x.replace(color, '').trim().split(/\s+/).slice(0, 3);
    return `drop-shadow(${len.join(' ')} ${color})`;
  }).join(' '));

  const drawn = new WeakMap();
  let queue = new Set(), frame = 0;
  const paint = (el) => { queue.add(el); frame ||= requestAnimationFrame(flush); };
  function flush() {
    const list = [...queue].filter((el) => el.isConnected); queue = new Set(); frame = 0;
    for (const el of list) if (drawn.has(el)) { const st = el.style; st.backgroundImage = st.backgroundColor = st.backgroundSize = st.backgroundRepeat = st.backgroundOrigin = st.boxShadow = st.filter = ''; }
    const reads = list.map((el) => { const cs = getComputedStyle(el); return { el, w: el.offsetWidth, h: el.offsetHeight, r: parseFloat(cs.borderTopLeftRadius) || 0,
      pctR: cs.borderTopLeftRadius.includes('%'), img: cs.backgroundImage, bg: cs.backgroundColor, box: cs.boxShadow }; });
    for (const { el, w, h, r, pctR, img, bg, box } of reads) {
      if (!w || !h || r < 8 || img !== 'none' || bg === 'rgba(0, 0, 0, 0)' || pctR) { drawn.delete(el); continue; }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${path(w, h, r)}" fill="${bg}"/></svg>`;
      Object.assign(el.style, { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundColor: 'transparent', backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat', backgroundOrigin: 'border-box', boxShadow: 'none', filter: shadows(box) });
      drawn.set(el, `${w}x${h}`);
    }
  }

  const sizes = new ResizeObserver((es) => { for (const e of es) { const el = e.target, b = e.borderBoxSize?.[0]; const key = b ? `${Math.round(b.inlineSize)}x${Math.round(b.blockSize)}` : null; if (!key || drawn.get(el) !== key) paint(el); } });
  const classes = new MutationObserver((ms) => { for (const m of ms) paint(m.target); });
  const seen = new WeakSet();
  const watch = (el) => { if (seen.has(el)) return; seen.add(el); sizes.observe(el); classes.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
    el.addEventListener('pointerenter', () => paint(el)); el.addEventListener('pointerleave', () => paint(el));
    paint(el); };
  const scan = (root) => { if (root.matches?.(SEL)) watch(root); for (const el of root.querySelectorAll?.(SEL) || []) watch(el); };
  const drop = (root) => { const list = root.matches?.(SEL) ? [root] : []; for (const el of root.querySelectorAll?.(SEL) || []) list.push(el);
    for (const el of list) if (seen.has(el) && !el.isConnected) { sizes.unobserve(el); seen.delete(el); queue.delete(el); } };
  const all = () => { for (const el of document.querySelectorAll(SEL)) paint(el); };
  new MutationObserver((ms) => { for (const m of ms) { for (const n of m.removedNodes) if (n.nodeType === 1) drop(n); for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); } }).observe(document.documentElement, { childList: true, subtree: true });
  new MutationObserver(all).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', all);
  const start = () => scan(document.body);
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
})();
