import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { scan } from './scan.js';

if (!isMainThread && workerData?.scan) {
  parentPort.on('message', (m) => {
    if (m.close) process.exit(0);
    let data = null, error = null;
    try { data = scan({ home: workerData.home, env: workerData.env, titles: m.titles || null }); } catch (e) { error = e.message; }
    parentPort.postMessage({ data, error });
  });
}

export function scanThread({ home, env, log = () => {} }) {
  let worker = null, waiting = [], busy = false, closed = false;
  const start = () => {
    worker = new Worker(new URL(import.meta.url), { workerData: { scan: true, home, env: { ...env } } });
    worker.unref();
    worker.on('message', ({ data, error }) => {
      const done = waiting; waiting = []; busy = false;
      if (error) log(`scan: ${error}`);
      for (const w of done) w(data);
    });
    worker.on('error', (e) => { log(`scan thread: ${e.message}`); const done = waiting; waiting = []; busy = false; for (const w of done) w(null); });
    worker.on('exit', () => { worker = null; busy = false; });
  };
  const send = (titles) => { if (!worker) start(); busy = true; worker.postMessage({ titles }); };
  return {
    request(titles) {
      if (closed) return Promise.resolve(null);
      return new Promise((r) => { waiting.push(r); if (!busy) send(titles); });
    },
    close() { closed = true; if (worker) { worker.postMessage({ close: true }); const w = worker; setTimeout(() => w.terminate(), 2000).unref?.(); } },
  };
}
