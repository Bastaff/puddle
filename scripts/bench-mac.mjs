#!/usr/bin/env node
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { freePort } from '../test/port.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const which = argv.find((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--')) || 'all';
const LABEL = arg('label', 'now'), LOGS = Number(arg('logs', 5)), MB = Number(arg('mb', 20));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-bench-'));
const kids = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const r1 = (n) => (n == null ? '—' : Math.round(n * 10) / 10);

let cleaned = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  for (const c of kids) { try { process.kill(-c.pid, 'SIGKILL'); } catch {} try { c.kill('SIGKILL'); } catch {} }
  fs.rmSync(T, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { cleanup(); process.exit(130); });
const track = (c) => { kids.add(c); c.on('exit', () => kids.delete(c)); return c; };

let seq = 0;
const filler = (n) => 'x'.repeat(n);
function step(sid, ts, outBytes = 20_000) {
  const tu = `toolu_${sid}_${++seq}`, rid = `req_${sid}_${seq}`;
  return [
    { type: 'assistant', sessionId: sid, requestId: rid, timestamp: new Date(ts).toISOString(), cwd: '/tmp/bench', version: '2.1.306', entrypoint: 'cli',
      message: { model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id: tu, name: 'Bash', input: { command: 'echo ' + seq } }],
        usage: { input_tokens: 3, output_tokens: 40, cache_read_input_tokens: 30000, cache_creation_input_tokens: 200 } } },
    { type: 'user', sessionId: sid, promptId: `p_${sid}`, timestamp: new Date(ts + 50).toISOString(), cwd: '/tmp/bench',
      permissionDecision: { decision: 'accept', source: 'config' },
      message: { content: [{ type: 'tool_result', tool_use_id: tu, is_error: false, content: filler(outBytes) }] } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n';
}
const prompt = (sid, ts) => JSON.stringify({ type: 'user', sessionId: sid, promptId: `p_${sid}`, timestamp: new Date(ts).toISOString(), cwd: '/tmp/bench',
  version: '2.1.306', entrypoint: 'cli', message: { role: 'user', content: 'do the thing' } }) + '\n';
function makeLogs(projects) {
  const dir = path.join(projects, '-tmp-bench'); fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let i = 0; i < LOGS; i++) {
    const sid = `bench-${i}`, file = path.join(dir, `${sid}.jsonl`), fd = fs.openSync(file, 'w');
    let ts = Date.now() - 3 * 3600_000, size = 0;
    const one = prompt(sid, ts); fs.writeSync(fd, one); size += one.length;
    while (size < MB * 1e6) { let chunk = ''; for (let k = 0; k < 20; k++) chunk += step(sid, (ts += 8000), 2000 + ((seq * 7919) % 36000)); fs.writeSync(fd, chunk); size += chunk.length; }
    fs.closeSync(fd); files.push({ sid, file });
  }
  return files;
}

async function startHelper(home, extraEnv = {}) {
  const port = await freePort(2), started = Date.now();
  const env = { ...process.env, HOME: home, PUDDLE_DIR: path.join(home, '.puddle'), PUDDLE_DEV: '1', PUDDLE_LOOP_STATS: '1', PORT: String(port),
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'), CODEX_HOME: path.join(home, '.codex'), ...extraEnv };
  for (const k of Object.keys(env)) if (/^(JOULE_|PUDDLE_(URL|TOKEN|ALLOWED))/.test(k)) delete env[k];
  const child = track(spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'companion', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true }));
  const loop = [];
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.startsWith('loop ')) loop.push(JSON.parse(l.slice(5))); } });
  child.stderr.on('data', () => {});
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/api/choices`); break; } catch { await sleep(100); } }
  const updates = [];
  const ac = new AbortController();
  fetch(`http://127.0.0.1:${port + 1}/api/stream`, { signal: ac.signal }).then(async (res) => {
    const dec = new TextDecoder(); for await (const c of res.body) if (dec.decode(c).includes('event: update')) updates.push(Date.now());
  }).catch(() => {});
  return { child, port, loop, updates, started, stop: () => { ac.abort(); try { process.kill(-child.pid, 'SIGKILL'); } catch {} } };
}
function usage(pid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,time=,rss='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/));
  const kidsOf = new Map(); for (const [p, pp] of rows) { if (!kidsOf.has(pp)) kidsOf.set(pp, []); kidsOf.get(pp).push(p); }
  const tree = new Set([String(pid)]); for (const p of tree) for (const k of kidsOf.get(p) || []) tree.add(k);
  let cpu = 0, rss = 0;
  for (const [p, , t, r] of rows) if (tree.has(p)) {
    const parts = t.split(/[:-]/).map(Number); let s = 0; for (const x of parts) s = s * 60 + x;
    cpu += s; rss += Number(r) * 1024;
  }
  return { cpu, rss };
}
function sampler(pid) {
  const pts = []; const t0 = Date.now(), u0 = usage(pid);
  const timer = setInterval(() => { try { pts.push({ t: Date.now(), ...usage(pid) }); } catch {} }, 1000);
  return { pts, stop() { clearInterval(timer); const u = usage(pid); return { seconds: (Date.now() - t0) / 1000, cpu: u.cpu - u0.cpu, peakRss: Math.max(u.rss, ...pts.map((p) => p.rss)) }; } };
}
function menuBar(port) {
  const ms = []; let on = true;
  (async () => { while (on) { const t = performance.now(); try { await (await fetch(`http://127.0.0.1:${port}/api/today`)).json(); ms.push(performance.now() - t); } catch {} await sleep(10_000); } })();
  return { ms, stop() { on = false; } };
}
function yourWork() {
  const code = `const c=require('crypto');let b=Buffer.alloc(1<<20,1);const t=process.hrtime.bigint();for(let i=0;i<300;i++)b=c.createHash('sha256').update(b).digest().length?b:b;console.log(Number(process.hrtime.bigint()-t)/1e6)`;
  const ms = []; let on = true;
  (async () => { while (on) { ms.push(Number(execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' }))); await sleep(500); } })();
  return { ms, stop() { on = false; } };
}
function signedIn(port) {
  let on = true; (async () => { while (on) { try { await fetch(`http://127.0.0.1:${port}/api/scan`); } catch {} await sleep(30_000); } })();
  return { stop() { on = false; } };
}

const results = { label: LABEL, at: new Date().toISOString(), mac: `${os.cpus()[0].model}, ${os.cpus().length} cores`, logs: LOGS, mb: MB, scenarios: {} };
let baseline = null;
async function measureBaseline() {
  const w = yourWork(); await sleep(12_000); w.stop(); await sleep(1500);
  baseline = pct(w.ms, 50); results.yourWorkAloneMs = baseline;
}

async function scenario(name, drive, { home, files, signed = true, settle = 0, env = {} } = {}) {
  process.stdout.write(`\n${name}: `);
  const h = await startHelper(home, env);
  await sleep(1000);
  const s0 = sampler(h.child.pid);
  const firstDone = async () => { const r = (await fetch(`http://127.0.0.1:${h.port + 1}/api/live`).then((x) => x.json()).catch(() => ({}))).health?.recovery; return r && !r.running && r.lastRun >= h.started; };
  for (let i = 0; i < 1200 && !(await firstDone()); i++) await sleep(500);
  const startup = s0.stop();
  h.loop.length = 0;
  const s = sampler(h.child.pid), mb = menuBar(h.port), w = yourWork(), si = signed ? signedIn(h.port) : null;
  const t0 = Date.now();
  const extra = await drive({ h, files, t0 }) || {};
  if (settle) await sleep(settle);
  const u = s.stop(); mb.stop(); w.stop(); si?.stop();
  const lp99 = h.loop.map((x) => x.p99), lmax = h.loop.map((x) => x.max);
  const r = {
    startupCpu: r1(startup.cpu), startupS: r1(startup.seconds), seconds: r1(u.seconds), helperCpu: r1(u.cpu), helperCpuPerMin: r1((u.cpu / u.seconds) * 60), helperCorePct: r1((u.cpu / u.seconds) * 100),
    peakRssMb: Math.round(u.peakRss / 1e6), loopP99Ms: r1(pct(lp99, 50)), loopWorstMs: r1(Math.max(0, ...lmax)), stallsOver100ms: lmax.filter((x) => x > 100).length,
    menuBarP50Ms: r1(pct(mb.ms, 50)), menuBarWorstMs: r1(Math.max(0, ...mb.ms)),
    yourWorkMs: r1(pct(w.ms, 50)), yourWorkSlowerPct: baseline ? r1(((pct(w.ms, 50) - baseline) / baseline) * 100) : null,
    firstMeUpdateAfterS: (() => { const t = h.updates.find((x) => x > t0); return t ? r1((t - t0) / 1000) : null; })(),
    ...extra,
  };
  h.stop(); await sleep(500);
  results.scenarios[name] = r;
  console.log(JSON.stringify(r));
  return r;
}

async function synthetic() {
  const home = path.join(T, 'home'); fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'bench', emailAddress: 'bench@example.com', organizationUuid: 'org-bench' } }));
  process.stdout.write(`writing ${LOGS} session logs of ${MB} MB… `);
  const files = makeLogs(path.join(home, '.claude', 'projects'));
  console.log('done');
  const o = { home, files };
  if (['all', 'idle'].includes(which)) await scenario('idle (big logs, no new work)', () => sleep(120_000), o);
  if (['all', 'burst'].includes(which)) await scenario('burst (5 sessions × 100 tool calls/s for 30 s)', async ({ files }) => {
    let n = 0;
    for (let s = 0; s < 30; s++) {
      const t = Date.now();
      for (const f of files) { let chunk = ''; for (let k = 0; k < 100; k++) chunk += step(f.sid, t + k * 10, 300); fs.appendFileSync(f.file, chunk); n += 100; }
      await sleep(Math.max(0, 1000 - (Date.now() - t)));
    }
    return { toolCalls: n };
  }, { ...o, settle: 90_000 });
  if (['all', 'statusline'].includes(which)) await scenario('status line (5 sessions × 3 runs/s for 60 s)', async ({ h }) => statusStorm(home, h.port), o);
}

async function statusStorm(home, port, seconds = 60) {
  const dir = path.join(home, '.puddle'); fs.mkdirSync(dir, { recursive: true });
  const sh = path.join(dir, 'statusline.sh');
  fs.writeFileSync(sh, `#!/bin/sh\nexport PUDDLE_DIR="${dir}" PUDDLE_PORT=${port}\nexec "${process.execPath}" "${path.join(ROOT, 'plugin', 'bin', 'statusline.cjs')}"\n`, { mode: 0o755 });
  const input = (i) => JSON.stringify({ session_id: `bench-${i}`, session_name: 'bench', model: { display_name: 'Sonnet' },
    rate_limits: { five_hour: { used_percentage: 42, resets_at: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: 18 } } });
  const wall = [], cpu = [];
  const one = (i) => new Promise((done) => {
    const t = performance.now();
    const c = spawn('/usr/bin/time', ['-p', '/bin/sh', sh], { env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude') }, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; c.stderr.on('data', (d) => (err += d));
    c.on('exit', () => { wall.push(performance.now() - t); const m = err.match(/user\s+([\d.]+)\s+sys\s+([\d.]+)/); if (m) cpu.push((+m[1] + +m[2]) * 1000); done(); });
    c.stdin.end(input(i));
  });
  const end = Date.now() + seconds * 1000, running = [];
  while (Date.now() < end) { const t = Date.now(); for (let i = 0; i < 5; i++) running.push(one(i)); await sleep(Math.max(0, 333 - (Date.now() - t))); }
  await Promise.all(running);
  return { statusRuns: wall.length, statusWallP50Ms: r1(pct(wall, 50)), statusWallP95Ms: r1(pct(wall, 95)), statusCpuMsEach: r1(pct(cpu, 50)),
    statusCpuCoreSecondsPerMin: r1((cpu.reduce((a, b) => a + b, 0) / 1000 / seconds) * 60) };
}

const TASK = `You are in an empty scratch folder. This is a load test, so work quickly and use many small shell commands.
1. Create a Node.js project "bench-shop": package.json (type module, "test": "node --test"), src/ with 40 modules (products, cart, pricing, tax, users, orders, inventory, discounts, shipping, …), each exporting a few small pure functions, and test/ with a node:test file per module.
2. Generate data/ with 150 JSON fixture files using a shell loop, then list, count and grep them with separate commands.
3. Run the tests. Fix every failure, re-running the tests after each fix.
4. Run at least 100 separate quick shell commands (wc, grep, head, ls, node -e) to inspect the project, one per tool call.
5. Add a feature: coupon codes across pricing, cart and orders, with tests; run the tests until they pass.
6. Finish with a short summary. Only touch files inside this folder.`;

async function real() {
  const cfg = arg('claude-config');
  if (!cfg || !fs.existsSync(cfg)) { console.log(`\nreal: needs --claude-config <dir> you've logged in to (CLAUDE_CONFIG_DIR=<dir> claude, then /login)`); return; }
  const minutes = Number(arg('minutes', 10)), model = arg('model', 'sonnet'), budget = arg('budget', '3');
  const home = path.join(T, 'real-home'); fs.mkdirSync(home, { recursive: true });
  for (const mode of ['on', 'off']) {
    const project = path.join(T, `bench-shop-${mode}`); fs.mkdirSync(project);
    const sink = { requests: 0, bytes: 0, records: 0, points: 0, byPath: {} };
    const sinkPort = await freePort(1);
    const srv = http.createServer((req, res) => {
      let n = 0; const parts = [];
      req.on('data', (d) => { n += d.length; parts.push(d); });
      req.on('end', () => {
        sink.requests++; sink.bytes += n; sink.byPath[req.url] = (sink.byPath[req.url] || 0) + 1;
        try { const b = JSON.parse(Buffer.concat(parts));
          for (const rl of b.resourceLogs || []) for (const sl of rl.scopeLogs || []) sink.records += (sl.logRecords || []).length;
          for (const rm of b.resourceMetrics || []) for (const sm of rm.scopeMetrics || []) for (const m of sm.metrics || []) sink.points += (m.sum || m.gauge || m.histogram || {}).dataPoints?.length || 0;
        } catch {}
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}');
      });
    }).listen(sinkPort, '127.0.0.1');
    const telemetry = mode === 'on' ? { CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_LOGS_EXPORTER: 'otlp', OTEL_METRICS_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${sinkPort}`, OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer bench', OTEL_METRIC_EXPORT_INTERVAL: '10000',
      OTEL_LOGS_EXPORT_INTERVAL: '5000', OTEL_METRICS_INCLUDE_VERSION: 'true', OTEL_METRICS_INCLUDE_REPOSITORY: '1', OTEL_LOG_USER_PROMPTS: '0', OTEL_LOG_ASSISTANT_RESPONSES: '0' } : {};
    await scenario(`real claude, telemetry ${mode}`, async ({ h, t0 }) => {
      const sl = path.join(home, '.puddle', 'statusline.sh'); fs.mkdirSync(path.dirname(sl), { recursive: true });
      const runs = path.join(home, `statusline-runs-${mode}`);
      fs.writeFileSync(sl, `#!/bin/sh\nprintf . >> "${runs}"\nexport PUDDLE_DIR="${path.join(home, '.puddle')}" PUDDLE_PORT=${h.port}\nexec "${process.execPath}" "${path.join(ROOT, 'plugin', 'bin', 'statusline.cjs')}"\n`, { mode: 0o755 });
      const settings = path.join(T, `settings-${mode}.json`);
      fs.writeFileSync(settings, JSON.stringify({ statusLine: { type: 'command', command: `/bin/sh ${sl}` } }));
      const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg, ...telemetry };
      for (const k of Object.keys(env)) if (/^(OTEL_|CLAUDE_CODE_ENABLE_TELEMETRY)/.test(k) && !(k in telemetry)) delete env[k];
      const c = track(spawn('/usr/bin/time', ['-l', 'claude', '-p', TASK, '--model', model, '--max-budget-usd', budget, '--permission-mode', 'bypassPermissions',
        '--setting-sources', 'project', '--settings', settings, '--output-format', 'json'], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true }));
      let out = '', err = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
      await sleep(1500);
      const claudePid = Number(execFileSync('pgrep', ['-P', String(c.pid)], { encoding: 'utf8' }).trim().split('\n')[0]);
      const cs = sampler(claudePid);
      const timeout = setTimeout(() => { try { process.kill(claudePid, 'SIGINT'); } catch {} }, minutes * 60_000);
      await new Promise((r) => c.on('exit', r)); clearTimeout(timeout);
      const cu = cs.stop();
      const m = err.match(/([\d.]+) real\s+([\d.]+) user\s+([\d.]+) sys/), maxRss = err.match(/(\d+)\s+maximum resident set size/);
      let tools = 0; for (const f of fs.readdirSync(path.join(cfg, 'projects'), { recursive: true })) if (String(f).endsWith('.jsonl') && fs.statSync(path.join(cfg, 'projects', f)).mtimeMs > t0) {
        for (const l of fs.readFileSync(path.join(cfg, 'projects', f), 'utf8').split('\n')) if (l.includes('"tool_use"')) tools += (l.match(/"type":"tool_use"/g) || []).length;
      }
      let cost = null; try { cost = JSON.parse(out).total_cost_usd; } catch {}
      const mins = cu.seconds / 60;
      let statusRuns = 0; try { statusRuns = fs.statSync(runs).size; } catch {}
      return { toolCalls: tools, costUsd: cost, statusRuns, statusRunsPerMin: r1(statusRuns / mins), claudeWallS: m ? +m[1] : r1(cu.seconds), claudeCpuS: r1(cu.cpu), claudeCpuPerToolCallMs: tools ? r1((cu.cpu / tools) * 1000) : null,
        claudeTreeCpuS: m ? r1(+m[2] + +m[3]) : null, claudePeakRssMb: Math.round(cu.peakRss / 1e6), claudeTreeMaxRssMb: maxRss ? Math.round(+maxRss[1] / 1e6) : null,
        telemetryRequestsPerMin: r1(sink.requests / mins), telemetryKbPerMin: r1(sink.bytes / 1024 / mins), telemetryRecords: sink.records, telemetryPoints: sink.points, telemetryKbPerToolCall: tools ? r1(sink.bytes / 1024 / tools) : null };
    }, { home, signed: true, env: { CLAUDE_CONFIG_DIR: cfg } }).catch((e) => console.log('real run failed:', e.message));
    srv.close();
  }
}
try {
  await measureBaseline();
  console.log(`your work alone: ${r1(baseline)} ms per piece`);
  if (which !== 'real') await synthetic();
  if (['all', 'real'].includes(which)) await real();
  const out = path.join(ROOT, 'bench', `mac-${LABEL}.json`); fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\nsaved ${path.relative(ROOT, out)}`);
} finally { cleanup(); }
