// Puddle settings merge for ~/.claude/settings.json. Runs under Node or under
// macOS JavaScript for Automation (osascript -l JavaScript), so it works on a
// Mac without Node or Python installed.
//
//   on  <settings> <backup> <env-json>  → ok; prints JOULE3:<endpoint> (exit ≠ 0) if another collector is configured
//   off <settings> <backup> <keys-json> → restores the original bytes when nothing else changed
//   get <settings> <key>                → prints env[key]
//   statusline-on  <settings> <wrapper> <prev> → Claude Code's status line runs Puddle's wrapper; a status line you
//                                                had is kept in <prev>.json (to put back) and <prev>.sh (still shown)
//   statusline-off <settings> <wrapper> <prev> → yours back (or none), only while the status line is still Puddle's

/* global ObjC, $ */
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
let io;
if (isNode) {
  const fs = require('fs');
  io = {
    args: process.argv.slice(2),
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, 'utf8'),
    write: (p, s) => fs.writeFileSync(p, s),
    remove: (p) => { try { fs.unlinkSync(p); } catch (e) { /* gone */ } },
    done: (code, msg) => { if (msg) process.stdout.write(msg + '\n'); process.exit(code); },
  };
} else {
  ObjC.import('Foundation');
  const fm = $.NSFileManager.defaultManager;
  io = {
    args: null, // set by run(argv)
    exists: (p) => fm.fileExistsAtPath(p),
    read: (p) => $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null).js,
    write: (p, s) => $(s).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null),
    remove: (p) => fm.removeItemAtPathError(p, null),
    done: (code, msg) => { throw { joule: true, code, msg: msg || '' }; },
  };
}

const OURS = (v) => typeof v === 'string' && /joule/i.test(v);
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(x) { return x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, k) => { o[k] = sortKeys(x[k]); return o; }, {}) : x; }
const parse = (p) => (io.exists(p) ? JSON.parse(io.read(p) || '{}') : {});

function main(args) {
  const [cmd, file, backup, arg] = args;
  if (cmd === 'get') { const s = parse(file); return io.done(0, String((s.env || {})[backup] || '')); }
  if (cmd === 'statusline-on' || cmd === 'statusline-off') {
    const wrapper = backup, prev = arg, s = parse(file);
    const ours = (sl) => !!(sl && typeof sl.command === 'string' && sl.command.indexOf(wrapper) >= 0);
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
    // Claude Code sends telemetry to one place; never silently take it over.
    if (endpoint && endpoint !== env.OTEL_EXPORTER_OTLP_ENDPOINT && !OURS(cur.JOULE)) return io.done(3, 'JOULE3:' + endpoint);
    if (!io.exists(backup)) io.write(backup, io.exists(file) ? io.read(file) : '');
    s.env = Object.assign({}, cur, env);
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
      // Nothing else changed since setup → put back the exact original bytes.
      if (same(s, before)) { if (orig === '') io.remove(file); else io.write(file, orig); io.remove(backup); return io.done(0); }
      io.remove(backup);
    }
    io.write(file, JSON.stringify(s, null, 2) + '\n');
    return io.done(0);
  }
  return io.done(2, 'usage: merge on|off|get …');
}

if (isNode) main(io.args);
// osascript entry point
// eslint-disable-next-line no-unused-vars
function run(argv) {
  try { main(argv); } catch (e) {
    if (e && e.joule) { if (e.code) throw new Error(e.msg || 'exit ' + e.code); return e.msg; }
    throw e;
  }
  return '';
}
