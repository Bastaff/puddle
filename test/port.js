import net from 'node:net';

const free = (port) => new Promise((ok) => {
  const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
  s.listen(port, '127.0.0.1');
});

export async function freePort(span = 1) {
  for (let tries = 0; tries < 50; tries++) {
    const base = 20_000 + Math.floor(Math.random() * (60_000 - 20_000 - span));
    let ok = true;
    for (let p = base; p < base + span && ok; p++) ok = await free(p);
    if (ok) return base;
  }
  throw new Error(`no ${span} free ports in a row`);
}
