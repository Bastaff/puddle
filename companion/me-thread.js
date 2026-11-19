import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { makeMeAnswers } from './me-answers.js';

if (!isMainThread && workerData?.meAnswers) {
  const db = new DatabaseSync(workerData.file);
  db.exec('PRAGMA busy_timeout = 10000;');
  const me = makeMeAnswers(db, { log: (m) => parentPort.postMessage({ log: m }) });
  parentPort.on('message', async (m) => {
    if (m.close) { db.close(); process.exit(0); }
    const began = Date.now();
    try { parentPort.postMessage({ id: m.id, r: await me[m.job.kind](m.job), ms: Date.now() - began }); }
    catch (e) { parentPort.postMessage({ id: m.id, error: e?.message || String(e) }); }
  });
}

export function meThread({ file, log = () => {} }) {
  let worker = null, n = 0, closed = false;
  const waiting = new Map();
  const start = () => {
    worker = new Worker(new URL(import.meta.url), { workerData: { meAnswers: true, file } });
    worker.unref();
    worker.on('message', (m) => { if (m.log) return log(m.log); const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); if (m.error) w.no(new Error(m.error)); else w.ok(m.r); });
    worker.on('error', (e) => { log(`me thread: ${e.message}`); for (const w of waiting.values()) w.no(e); waiting.clear(); });
    worker.on('exit', () => { worker = null; for (const w of waiting.values()) w.no(new Error('me thread stopped')); waiting.clear(); });
  };
  return {
    ask(job) {
      if (closed) return Promise.reject(new Error('closed'));
      if (!worker) start();
      const id = ++n;
      return new Promise((ok, no) => { waiting.set(id, { ok, no }); worker.postMessage({ id, job }); });
    },
    close() { closed = true; try { worker?.postMessage({ close: true }); } catch {} setTimeout(() => worker?.terminate(), 1000).unref?.(); },
  };
}
