import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const load = ({ hidden = false } = {}) => {
  const ctx = {
    document: { documentElement: { dataset: {}, style: { setProperty() {} } }, hidden, addEventListener() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    navigator: {}, window: { CSS: { supports: () => true } },
    setTimeout: () => 0, setInterval: () => 0, requestAnimationFrame: () => 0, Map,
  };
  vm.runInNewContext(fs.readFileSync(new URL('../collector/public/motion.js', import.meta.url), 'utf8') + '\nthis.Motion = Motion;', ctx);
  return ctx.Motion;
};
const Motion = load();

test('springs settle at their target, bouncier ones overshoot', () => {
  const soft = Motion.spring({ stiffness: 140, damping: 22 }), bouncy = Motion.spring({ stiffness: 260, damping: 15 });
  for (const s of [soft, bouncy]) { assert.equal(s.samples[0], 0); assert.equal(s.samples.at(-1), 1); assert.match(s.easing, /^linear\(0, .*, 1\)$/); }
  assert.ok(Math.max(...bouncy.samples) > 1.1, 'bouncy overshoots');
  assert.ok(Math.max(...soft.samples) < 1.02, 'soft barely overshoots');
  assert.ok(bouncy.duration > 300 && bouncy.duration < 2000);
});

test('impulses start and end at rest; arcs start and end at their points and rise above both', () => {
  const k = Motion.impulse({ amplitude: 0.2 });
  assert.equal(k[0], 0); assert.equal(k.at(-1), 0); assert.ok(Math.max(...k) > 0.05);
  const a = Motion.arc([0, 100], [300, 50], { lift: 80 });
  assert.equal(a[0][0], 0); assert.equal(a[0][1], 100);
  assert.ok(Math.abs(a.at(-1)[0] - 300) < 1e-9 && Math.abs(a.at(-1)[1] - 50) < 1e-9);
  assert.ok(Math.min(...a.map((p) => p[1])) < 50 - 70, 'goes up before coming down');
});

test('motion budget: full on a tab in view, off on one in the background', () => {
  assert.equal(Motion.level, 'full');
  assert.equal(load({ hidden: true }).level, 'off');
});
