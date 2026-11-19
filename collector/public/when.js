(() => {
  const HOUR = 36e5, DAY = 864e5;
  const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
  const step = (span) => (span <= 26 * HOUR ? HOUR : span <= 8 * DAY ? 4 * HOUR : DAY);
  globalThis.PuddleWhen = {
    step,
    window(days, now = Date.now()) {
      if (days <= 1) { const d = new Date(now); d.setMinutes(0, 0, 0); const to = d.getTime() + HOUR; return { from: to - DAY, to, step: HOUR }; }
      const to = addDays(midnight(now), 1);
      const from = addDays(to, -days);
      return { from, to, step: step(to - from) };
    },
    midnight,
    addDays,
  };
})();
