// Motion: spring physics for every animation, and a budget that turns motion
// down when it would waste battery.
//
// Springs are simulated once and handed to the browser as a CSS `linear()`
// easing (or as keyframes), so they run on the compositor with no JavaScript
// per frame. The budget is:
//   full  normal
//   lite  power saving (frame rate capped, or battery low): short, purposeful
//         motion only, no looping pulses, no particles, no flights
//   off   tab in the background or "reduce motion" is on: nothing moves
'use strict';

const Motion = (() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let fpsLow = false, batteryLow = false, level = 'full';
  const listeners = new Set();

  function compute() {
    const next = reduced.matches || document.hidden ? 'off' : fpsLow || batteryLow ? 'lite' : 'full';
    if (next === level && root.dataset.motion === next) return;
    level = next;
    root.dataset.motion = next;
    for (const f of listeners) f(next);
  }

  // Low Power Mode on iPhone/iPad/Mac caps animation frames at 30 per second.
  // A one-second sample every two minutes (only while visible) detects it; the
  // median frame time ignores the odd slow frame from a busy render.
  function probe() {
    if (document.hidden) return;
    const gaps = [];
    let last = null;
    const step = (t) => {
      if (last != null) gaps.push(t - last);
      last = t;
      if (gaps.length < 40) requestAnimationFrame(step);
      else {
        gaps.sort((a, b) => a - b);
        fpsLow = gaps[gaps.length >> 1] > 24; // slower than ~42 fps
        compute();
      }
    };
    requestAnimationFrame(step);
  }
  setTimeout(probe, 2500);
  setInterval(probe, 120_000);

  // Battery (Chromium only): on battery and at 20% or less.
  navigator.getBattery?.().then((b) => {
    const f = () => { batteryLow = !b.charging && b.level <= 0.2; compute(); };
    b.addEventListener('levelchange', f); b.addEventListener('chargingchange', f); f();
  }).catch(() => {});

  document.addEventListener('visibilitychange', compute);
  reduced.addEventListener?.('change', compute);
  compute();

  // ---- springs ----------------------------------------------------------------
  // Damped harmonic oscillator from 0 to 1. Returns the samples, the time it
  // takes to settle, and a CSS linear() easing that replays it.
  const cache = new Map();
  function spring({ stiffness = 170, damping = 26, mass = 1, velocity = 0 } = {}) {
    const key = `${stiffness}|${damping}|${mass}|${velocity}`;
    if (cache.has(key)) return cache.get(key);
    const dt = 1 / 240;
    let x = 0, v = velocity, t = 0;
    const pts = [0];
    while (t < 3) {
      const a = (-stiffness * (x - 1) - damping * v) / mass;
      v += a * dt; x += v * dt; t += dt;
      if (Math.round(t / dt) % 4 === 0) pts.push(x);
      if (Math.abs(x - 1) < 0.0005 && Math.abs(v) < 0.005) break;
    }
    pts[pts.length - 1] = 1;
    const step = Math.max(1, Math.floor(pts.length / 48));
    const sampled = pts.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== 1) sampled.push(1);
    const out = { duration: Math.round(t * 1000), easing: `linear(${sampled.map((p) => +p.toFixed(4)).join(', ')})`, samples: sampled };
    cache.set(key, out);
    return out;
  }
  const linearOK = window.CSS?.supports?.('transition-timing-function', 'linear(0, 1)');
  const SPRINGS = {
    // Calm, nearly critically damped: weight and follow-through, barely any bounce.
    snappy: { stiffness: 300, damping: 31 },   // UI that should feel instant
    gentle: { stiffness: 140, damping: 23 },   // bars and numbers settling
    bouncy: { stiffness: 220, damping: 25 },   // things arriving (≈2% overshoot)
  };
  function ease(name) {
    const s = spring(SPRINGS[name]);
    return linearOK ? { easing: s.easing, duration: s.duration } : { easing: 'cubic-bezier(.2,.8,.2,1)', duration: Math.min(600, s.duration) };
  }
  // Expose springs to CSS: var(--spring-gentle) and var(--spring-gentle-d).
  for (const n of Object.keys(SPRINGS)) {
    const e = ease(n);
    root.style.setProperty(`--spring-${n}`, e.easing);
    root.style.setProperty(`--spring-${n}-d`, `${e.duration}ms`);
  }

  // An impulse: something at rest gets a kick and wobbles back (a landing,
  // a nudge). Returns keyframes of the offset from rest, starting and ending at 0.
  function impulse({ amplitude = 1, frequency = 9, decay = 7, duration = 520, steps = 26 } = {}) {
    const k = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (duration / 1000);
      k.push(i === steps ? 0 : amplitude * Math.exp(-decay * t) * Math.sin(2 * Math.PI * frequency * t));
    }
    return k;
  }

  // A thrown object under gravity from a to b: keyframes of [x, y, tilt].
  function arc([x0, y0], [x1, y1], { lift = 90, steps = 28 } = {}) {
    const top = Math.min(y0, y1) - lift;
    // parabola through both ends with its vertex at `top`
    const h0 = y0 - top, h1 = y1 - top;
    const r = Math.sqrt(h0) / (Math.sqrt(h0) + Math.sqrt(h1) || 1); // share of time rising
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = x0 + (x1 - x0) * u;
      const y = u <= r ? top + h0 * ((r - u) / r) ** 2 : top + h1 * ((u - r) / (1 - r)) ** 2;
      const dy = u <= r ? -2 * h0 * (r - u) / (r * r) : 2 * h1 * (u - r) / ((1 - r) ** 2);
      const tilt = Math.max(-6, Math.min(6, Math.atan2(dy, (x1 - x0) || 1) * 57.3 * 0.07));
      pts.push([x, y, tilt]);
    }
    return pts;
  }

  return {
    get level() { return level; },
    full: () => level === 'full',
    any: () => level !== 'off',
    onChange: (f) => listeners.add(f),
    spring, ease, impulse, arc,
  };
})();
