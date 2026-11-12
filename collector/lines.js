import fs from 'node:fs';

export const CHUNK = 32 * 1048576;

function lineEnd(fd, from, size) {
  const b = Buffer.alloc(1048576);
  for (let at = from; at < size;) {
    const k = fs.readSync(fd, b, 0, Math.min(b.length, size - at), at);
    if (!k) break;
    const i = b.subarray(0, k).indexOf(10);
    if (i >= 0) return at + i + 1;
    at += k;
  }
  return null;
}

export function newLines(file, from, size, max = CHUNK) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(Math.max(0, Math.min(size - from, max))); let n = 0;
    while (n < b.length) { const k = fs.readSync(fd, b, n, b.length - n, from + n); if (!k) break; n += k; }
    let end = b.subarray(0, n).lastIndexOf(10) + 1;
    if (end < n && from + n >= size) try { JSON.parse(b.subarray(end, n).toString('utf8')); end = n; } catch {}
    if (!end && n === max) return { text: '', end: lineEnd(fd, from + n, size) ?? from };
    return { text: b.subarray(0, end).toString('utf8'), end: from + end };
  } finally { fs.closeSync(fd); }
}

export function makeFollower(start, max = CHUNK) {
  const logs = new Map();
  return {
    logs,
    follow(file, st, { again = false } = {}) {
      let s = logs.get(file);
      if (again || !s || s.ino !== st.ino || st.size < s.offset) logs.set(file, (s = { ino: st.ino, offset: 0, ...start() }));
      if (st.size <= s.offset) return { s, text: '', bytes: 0, more: false };
      const { text, end } = newLines(file, s.offset, st.size, max), bytes = end - s.offset;
      s.offset = end;
      return { s, text, bytes, more: bytes > 0 && end < st.size };
    },
    keepOnly(seen) { for (const f of logs.keys()) if (!seen.has(f)) logs.delete(f); },
  };
}
