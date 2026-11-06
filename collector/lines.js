import fs from 'node:fs';

export function newLines(file, from, size) {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(Math.max(0, size - from)); let n = 0;
    while (n < b.length) { const k = fs.readSync(fd, b, n, b.length - n, from + n); if (!k) break; n += k; }
    let end = b.subarray(0, n).lastIndexOf(10) + 1;
    if (end < n) try { JSON.parse(b.subarray(end, n).toString('utf8')); end = n; } catch {}
    return { text: b.subarray(0, end).toString('utf8'), end: from + end };
  } finally { fs.closeSync(fd); }
}

export function makeFollower(start) {
  const logs = new Map();
  return {
    logs,
    follow(file, st, { again = false } = {}) {
      let s = logs.get(file);
      if (again || !s || s.ino !== st.ino || st.size < s.offset) logs.set(file, (s = { ino: st.ino, offset: 0, ...start() }));
      if (st.size <= s.offset) return { s, text: '', bytes: 0 };
      const { text, end } = newLines(file, s.offset, st.size), bytes = end - s.offset;
      s.offset = end;
      return { s, text, bytes };
    },
    keepOnly(seen) { for (const f of logs.keys()) if (!seen.has(f)) logs.delete(f); },
  };
}
