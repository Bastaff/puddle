// Pages keep up with the site by themselves: each page knows the version it was served with (<meta
// name="joule-version">); the live stream says which version is running now. When they differ, the page reloads
// itself unnoticed: at once while it's hidden, otherwise once nobody has touched it for a while, never mid-click.
// What you were looking at stays (range and focus are already remembered; scroll position is kept here).
// Pages call JouleHeal.saw(version) whenever the stream tells them the running version.
(() => {
  const IDLE = 20_000;
  // the decision on its own (tests call it): reload now?
  const decide = ({ mine, running, hidden, idleMs, tries }) => Boolean(mine && running && running !== mine && tries < 2 && (hidden || idleMs >= IDLE));
  globalThis.jouleHealDecision = decide;
  if (typeof document === 'undefined') return;

  const mine = document.querySelector('meta[name="joule-version"]')?.content || null;
  let running = null, lastTouch = Date.now(), timer = null;
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input']) addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true, capture: true });
  const triesKey = () => `joule-heal:${running}`;
  const tries = () => { try { return Number(sessionStorage.getItem(triesKey())) || 0; } catch { return 9; } };
  const check = () => {
    if (!decide({ mine, running, hidden: document.hidden, idleMs: Date.now() - lastTouch, tries: tries() })) return false;
    try { sessionStorage.setItem(triesKey(), String(tries() + 1)); sessionStorage.setItem('joule-heal-scroll', String(scrollY)); } catch {}
    location.reload();
    return true;
  };
  document.addEventListener('visibilitychange', () => { if (running) check(); });
  globalThis.JouleHeal = {
    saw(v) {
      if (!v || v === mine) return;
      running = String(v);
      if (!check() && !timer) timer = setInterval(() => { if (check()) clearInterval(timer); }, 2000);
    },
  };
  // after a self-refresh: back to where the page was, once its content is drawn (pages call JouleHeal.drawn())
  let backTo = 0;
  try { backTo = Number(sessionStorage.getItem('joule-heal-scroll')) || 0; sessionStorage.removeItem('joule-heal-scroll'); } catch {}
  globalThis.JouleHeal.drawn = () => { if (backTo) { const y = backTo; backTo = 0; requestAnimationFrame(() => scrollTo(0, y)); } };
})();
