(() => {
  const IDLE = 20_000;
  const decide = ({ mine, running, hidden, idleMs, tries }) => Boolean(mine && running && running !== mine && tries < 2 && (hidden || idleMs >= IDLE));
  globalThis.puddleHealDecision = decide;
  if (typeof document === 'undefined') return;

  const mine = document.querySelector('meta[name="puddle-version"]')?.content || null;
  let running = null, lastTouch = Date.now(), timer = null;
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input']) addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true, capture: true });
  const triesKey = () => `puddle-heal:${running}`;
  const tries = () => { try { return Number(sessionStorage.getItem(triesKey())) || 0; } catch { return 9; } };
  const check = () => {
    if (!decide({ mine, running, hidden: document.hidden, idleMs: Date.now() - lastTouch, tries: tries() })) return false;
    try { sessionStorage.setItem(triesKey(), String(tries() + 1)); sessionStorage.setItem('puddle-heal-scroll', String(scrollY)); } catch {}
    location.reload();
    return true;
  };
  document.addEventListener('visibilitychange', () => { if (running) check(); });
  globalThis.PuddleHeal = {
    saw(v) {
      if (!v || v === mine) return;
      running = String(v);
      if (!check() && !timer) timer = setInterval(() => { if (check()) clearInterval(timer); }, 2000);
    },
  };
  let backTo = 0;
  try { backTo = Number(sessionStorage.getItem('puddle-heal-scroll')) || 0; sessionStorage.removeItem('puddle-heal-scroll'); } catch {}
  globalThis.PuddleHeal.drawn = () => { if (backTo) { const y = backTo; backTo = 0; requestAnimationFrame(() => scrollTo(0, y)); } };
})();
