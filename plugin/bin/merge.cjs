const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
let io;
if (isNode) {
  const fs = require('fs');
  io = {
    args: process.argv.slice(2),
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, 'utf8'),
    write: (p, s) => fs.writeFileSync(p, s),
    remove: (p) => { try { fs.unlinkSync(p); } catch (e) {  } },
    done: (code, msg) => { if (msg) process.stdout.write(msg + '\n'); process.exit(code); },
  };
} else {
  ObjC.import('Foundation');
  const fm = $.NSFileManager.defaultManager;
  io = {
    args: null,
    exists: (p) => fm.fileExistsAtPath(p),
    read: (p) => $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null).js,
    write: (p, s) => $(s).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null),
    remove: (p) => fm.removeItemAtPathError(p, null),
    done: (code, msg) => { throw { puddle: true, code, msg: msg || '' }; },
  };
}

const OURS = (v) => typeof v === 'string' && /puddle|joule/i.test(v);
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(x) { return x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, k) => { o[k] = sortKeys(x[k]); return o; }, {}) : x; }
const parse = (p) => (io.exists(p) ? JSON.parse(io.read(p) || '{}') : {});

function main(args) {
  const [cmd, file, backup, arg] = args;
  if (cmd === 'get') { const s = parse(file); return io.done(0, String((s.env || {})[backup] || '')); }
  if (cmd === 'statusline-on' || cmd === 'statusline-off') {
    const wrapper = backup, prev = arg, s = parse(file);
    const ours = (sl) => !!(sl && typeof sl.command === 'string' && (sl.command.indexOf(wrapper) >= 0 || /\/\.(puddle|joule)(-dev)?\/statusline\.sh/.test(sl.command)));
    if (cmd === 'statusline-on') {
      if (!ours(s.statusLine)) {
        if (s.statusLine && typeof s.statusLine.command === 'string') { io.write(prev + '.json', JSON.stringify(s.statusLine) + '\n'); io.write(prev + '.sh', s.statusLine.command + '\n'); }
        else { io.remove(prev + '.json'); io.remove(prev + '.sh'); }
      }
      s.statusLine = Object.assign({}, s.statusLine && !ours(s.statusLine) ? {} : s.statusLine || {}, { type: 'command', command: '"' + wrapper + '"' });
      if (io.exists(prev + '.json')) { const p = JSON.parse(io.read(prev + '.json')); if (p.padding != null) s.statusLine.padding = p.padding; }
      io.write(file, JSON.stringify(s, null, 2) + '\n');
      return io.done(0);
    }
    if (ours(s.statusLine)) {
      if (io.exists(prev + '.json')) s.statusLine = JSON.parse(io.read(prev + '.json')); else delete s.statusLine;
      io.write(file, JSON.stringify(s, null, 2) + '\n');
    }
    io.remove(prev + '.json'); io.remove(prev + '.sh');
    return io.done(0);
  }
  if (cmd === 'on') {
    const env = JSON.parse(arg);
    const s = parse(file);
    const cur = s.env || {};
    const endpoint = cur.OTEL_EXPORTER_OTLP_ENDPOINT || cur.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
    if (endpoint && endpoint !== env.OTEL_EXPORTER_OTLP_ENDPOINT && !OURS(cur.PUDDLE) && !OURS(cur.JOULE)) return io.done(3, 'PUDDLE3:' + endpoint);
    if (!io.exists(backup)) io.write(backup, io.exists(file) ? io.read(file) : '');
    s.env = Object.assign({}, cur, env);
    if (env.PUDDLE) delete s.env.JOULE;
    io.write(file, JSON.stringify(s, null, 2) + '\n');
    return io.done(0);
  }
  if (cmd === 'off') {
    const keys = JSON.parse(arg);
    if (!io.exists(file)) return io.done(0);
    const s = parse(file);
    if (s.env) { for (const k of keys) delete s.env[k]; if (!Object.keys(s.env).length) delete s.env; }
    if (io.exists(backup)) {
      const orig = io.read(backup);
      const before = orig.trim() ? JSON.parse(orig) : {};
      if (same(s, before)) { if (orig === '') io.remove(file); else io.write(file, orig); io.remove(backup); return io.done(0); }
      io.remove(backup);
    }
    io.write(file, JSON.stringify(s, null, 2) + '\n');
    return io.done(0);
  }
  return io.done(2, 'usage: merge on|off|get …');
}

if (isNode) main(io.args);
function run(argv) {
  try { main(argv); } catch (e) {
    if (e && e.puddle) { if (e.code) throw new Error(e.msg || 'exit ' + e.code); return e.msg; }
    throw e;
  }
  return '';
}
