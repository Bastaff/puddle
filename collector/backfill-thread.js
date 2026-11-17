import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { makeBackfill } from './backfill.js';

if (!isMainThread && workerData?.backfill) {
  const db = new DatabaseSync(workerData.file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 10000;');
  const b = makeBackfill(db, { home: workerData.home, notify: () => parentPort.postMessage({ notify: true }), log: (m) => parentPort.postMessage({ log: m }) });
  parentPort.on('message', (m) => {
    if (m.close) { db.close(); process.exit(0); }
    const st = b.run({ full: Boolean(m.full) });
    parentPort.postMessage({ status: JSON.parse(JSON.stringify(st)) });
  });
}

const IDLE = { running: false, lastRun: null, lastDurationMs: null, filesScanned: 0, bytesRead: 0, historyBytes: 0, settlesAt: null, lastRecovered: {}, check: null, error: null };

export function backfillThread({ file, home, notify = () => {}, log = () => {}, onStatus = () => {} }) {
  let worker = null, last = { ...IDLE }, busy = false, queued = null, closed = false;
  const start = () => {
    worker = new Worker(new URL(import.meta.url), { workerData: { backfill: true, file, home } });
    worker.unref();
    worker.on('message', (m) => {
      if (m.notify) return notify();
      if (m.log) return log(m.log);
      if (!m.status) return;
      last = m.status; busy = false;
      onStatus(last);
      if (queued && !closed) { const q = queued; queued = null; run(q); }
    });
    worker.on('error', (e) => { log(`backfill thread: ${e.message}`); last = { ...last, running: false, error: e.message }; busy = false; onStatus(last); });
    worker.on('exit', () => { worker = null; busy = false; });
  };
  function run(opts = {}) {
    if (closed) return last;
    if (busy) { queued = { full: Boolean(queued?.full || opts.full) }; return last; }
    if (!worker) start();
    busy = true; last = { ...last, running: true };
    worker.postMessage({ full: Boolean(opts.full) });
    return last;
  }
  return {
    run,
    status: () => last,
    close: () => { closed = true; if (worker) { worker.postMessage({ close: true }); const w = worker; setTimeout(() => w.terminate(), 2000).unref?.(); } },
  };
}
