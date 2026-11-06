((light, dark, opened) => {
  const nav = performance.getEntriesByType('navigation')[0];
  if (window.top !== window || history.length > 1 || (nav && nav.type !== 'navigate') || Date.now() - opened > 8000) return;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
  host.setAttribute('aria-hidden', 'true');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .pz { position: fixed; inset: 0; display: grid; place-items: center; background: #fbfbfb; transition: opacity .45s ease; }
    .logo { transition: transform .45s ease, opacity .35s ease; }
    .logo svg { display: block; width: min(420px, 70vw); height: auto; }
    .dark { display: none; }
    @media (prefers-color-scheme: dark) { .pz { background: #161a21; } .light { display: none; } .dark { display: block; } }
    .pz.out { opacity: 0; }
    .pz.out .logo { transform: scale(1.04); opacity: 0; }
    @media (prefers-reduced-motion: reduce) { .pz.out .logo { transform: none; } }
  </style><div class="pz"><div class="logo light">${light}</div><div class="logo dark">${dark}</div></div>`;
  const put = () => (document.documentElement ? document.documentElement.appendChild(host) : requestAnimationFrame(put));
  put();

  const shown = performance.now();
  let gone = false;
  const hide = () => {
    if (gone) return; gone = true;
    setTimeout(() => {
      root.querySelector('.pz').classList.add('out');
      setTimeout(() => { host.remove(); try { location.href = '/__joule/splash_done'; } catch {} }, 500);
    }, Math.max(0, 600 - (performance.now() - shown)));
  };
  document.addEventListener('puddle:drawn', hide, { once: true });
  addEventListener('load', () => setTimeout(hide, window.PuddlePerf ? 4000 : 300), { once: true });
  setTimeout(hide, 10_000);
})
