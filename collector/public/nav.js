(async () => {
  if (!globalThis.PuddleBar) return;
  try { const r = await fetch('/api/me/nav'); if (r.ok) PuddleBar.nav(await r.json()); } catch {  }
})();
