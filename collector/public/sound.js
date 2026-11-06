globalThis.PuddleSound = (() => {
  let ctx = null, out = null;
  let on = false;
  try { on = localStorage.getItem('cu-sound') === '1'; } catch { on = false; }
  const last = {};
  let lastAny = 0;
  const PERSON = [[0, 'sine'], [5, 'triangle'], [-5, 'sine'], [7, 'triangle'], [3, 'sine'], [-3, 'triangle'], [10, 'sine'], [-7, 'triangle'], [12, 'sine'], [2, 'triangle']];
  let cur = { r: 1, type: null };

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.3;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -30; comp.ratio.value = 4;
      out = ctx.createGain(); out.gain.value = 0.8;
      out.connect(lp).connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  let gestured = false;
  function ready() {
    const tap = navigator.userActivation ? navigator.userActivation.isActive : gestured;
    if (!ctx && !tap) return null;
    if (!ensure()) return null;
    return ctx.state === 'running' || tap ? ctx : null;
  }
  function note(freq, at, len, { gain = 0.03, type = 'sine', to = null } = {}) {
    freq *= cur.r; if (to) to *= cur.r;
    if (cur.type && type === 'sine') { type = cur.type; gain *= cur.type === 'triangle' ? 0.8 : 1; }
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + len + 0.02);
  }
  const voices = {
    prompt:  () => { note(659.3, 0, 0.22, { gain: 0.028 }); note(987.8, 0.07, 0.28, { gain: 0.022 }); },
    request: () => note(1318.5, 0, 0.14, { gain: 0.014 }),
    tool:    () => note(880, 0, 0.09, { gain: 0.016, type: 'triangle' }),
    fail:    () => { note(392, 0, 0.26, { gain: 0.03 }); note(329.6, 0.1, 0.32, { gain: 0.026 }); },
    recover: () => [783.9, 987.8, 1174.7].forEach((f, i) => note(f, i * 0.07, 0.34, { gain: 0.016 })),
    success: () => [523.3, 659.3, 783.9].forEach((f, i) => note(f, i * 0.08, 0.4, { gain: 0.024 })),
    remove:  () => note(440, 0, 0.3, { gain: 0.03, to: 220 }),
    toggle:  () => note(1046.5, 0, 0.08, { gain: 0.014 }),
  };
  function play(name, delay = 0, who = null, always = false) {
    if (delay) { setTimeout(() => play(name, 0, who, always), delay); return; }
    if ((!on && !always) || !voices[name] || (document.visibilityState === 'hidden' && name === 'request')) return;
    const now = performance.now(), key = name + '|' + who;
    if (now - (last[key] || 0) < 600 || now - lastAny < 140) return;
    if (!ready()) return;
    last[key] = lastAny = now;
    const v = who == null || who < 0 ? null : PERSON[who % PERSON.length];
    cur = v ? { r: Math.pow(2, v[0] / 12), type: v[1] } : { r: 1, type: null };
    try { voices[name](); } catch {}
    cur = { r: 1, type: null };
  }
  const unlock = () => { gestured = true; if (on) ensure(); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { once: true, capture: true, passive: true });
  return {
    play,
    unlock: () => ensure(),
    get on() { return on; },
    set on(v) { on = v; try { localStorage.setItem('cu-sound', v ? '1' : '0'); } catch {} },
  };
})();
