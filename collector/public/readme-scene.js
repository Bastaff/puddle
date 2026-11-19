import { CARDS } from '/craft.js';
import { scene } from '/showcase.js';

const LOOP = 10_000, START = 0.27, END = 0.95, PLAY = 0.9;
const POS = { today: 'sc-today', squares: 'sc-days', shipped: 'sc-ship', agent: 'sc-agent', leverage: 'sc-lev', handsoff: 'sc-hands' };
const root = document.querySelector('.scene');
const rows = scene.buildRows(root.querySelector('.sc-rows'));
const issues = root.querySelector('.sc-issues');
const smooth = (x) => x * x * (3 - 2 * x);
const dayAt = (u) => (u < PLAY ? START + (END - START) * (u / PLAY) : END - (END - START) * smooth((u - PLAY) / (1 - PLAY)));

scene.flag([
  { i: 3, kind: 'limit', level: 'warn', text: 'Plan almost used up: 91%' },
  { i: 1, kind: 'stuck', level: 'warn', text: 'Claude kept retrying the same failing step in 5 prompts' },
]);
scene.paintFlags(issues, false);
await scene.drawMap(root.querySelector('.sc-map'));

function team(progress) {
  const utc = progress * 24;
  for (const p of scene.people) {
    let minutes = 0;
    for (let h = 0; h < utc; h += 0.25) if (scene.working(p, h)) minutes += 15 * Math.min(1, (utc - h) / 0.25);
    p.on = scene.working(p, utc);
    p.minutes = minutes;
    p.kind = scene.KINDS[(p.i * 2 + Math.floor(utc / 1.5)) % scene.KINDS.length];
    p.limit = Math.min(92, 22 + p.i * 9 + minutes * 0.04);
  }
  scene.paintRows(rows);
  scene.paintMap();
}

function me(progress) {
  const ctx = scene.meContext(progress);
  for (const slot of root.querySelectorAll('[data-id]')) {
    const id = slot.dataset.id, box = document.createElement('div');
    box.innerHTML = CARDS[id].html({ ...ctx, size: slot.dataset.size }).trim();
    const card = box.firstElementChild; if (!card) continue;
    card.classList.add(POS[id]); card.dataset.id = id; card.dataset.size = slot.dataset.size;
    slot.replaceWith(card);
    CARDS[id].draw?.(card, ctx, { hover: () => {}, rows: () => '' });
  }
}

globalThis.sceneAt = (u, ms = u * 9000) => {
  const progress = dayAt(u);
  team(progress);
  me(progress);
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
};

if (new URLSearchParams(location.search).has('shot')) {
  root.classList.add('sc-shot');
  globalThis.sceneAt(0);
  document.body.dataset.ready = '1';
} else {
  let last = 0;
  const frame = (t) => {
    requestAnimationFrame(frame);
    if (t - last < 33) return;
    last = t;
    const progress = dayAt((t % LOOP) / LOOP);
    team(progress);
    me(progress);
  };
  requestAnimationFrame(frame);
}
