// A port (or a run of ports) free right now, for a test server. Test files run side by side, so fixed ranges picked at
// random collided now and then (two files in 47000-47899 at once); here every port of the span is checked free first.
//   const PORT = await freePort();        // one server
//   const PORT = await freePort(502);     // a service at PORT and Puddle's helper at PORT + 500 (and + 501, its Me)
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
