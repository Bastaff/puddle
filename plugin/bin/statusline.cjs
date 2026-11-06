const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const DIR = process.env.PUDDLE_DIR || process.env.JOULE_DIR || (fs.existsSync(path.join(os.homedir(), '.puddle')) || !fs.existsSync(path.join(os.homedir(), '.joule')) ? path.join(os.homedir(), '.puddle') : path.join(os.homedir(), '.joule'));
const PORT = Number(process.env.PUDDLE_PORT || process.env.JOULE_PORT) || 4600;

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let s = {};
  try { s = JSON.parse(input); } catch {}
  const rl = s.rate_limits || {};
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const plan = { agent: 'claude-code', five_pct: num(rl.five_hour?.used_percentage), five_reset: rl.five_hour?.resets_at ?? null,
    week_pct: num(rl.seven_day?.used_percentage), week_reset: rl.seven_day?.resets_at ?? null,
    month_pct: num(rl.spend_limit?.used_percentage), month_reset: rl.spend_limit?.resets_at ?? null };
  const jobs = [];
  const limits = plan.five_pct != null || plan.week_pct != null || plan.month_pct != null;
  if (limits) Object.assign(plan, { org: account(), shape: shape(rl) });
  if (s.session_id || limits) jobs.push(send({ session_id: s.session_id || null, session_name: typeof s.session_name === 'string' ? s.session_name : null, plan: limits ? plan : null }));
  const prev = path.join(DIR, 'statusline-prev.sh');
  if (fs.existsSync(prev)) jobs.push(runPrev(prev, input));
  else {
    const parts = [];
    if (plan.five_pct != null) parts.push(`5h ${Math.round(plan.five_pct)}%`);
    if (plan.week_pct != null) parts.push(`week ${Math.round(plan.week_pct)}%`);
    if (plan.month_pct != null) parts.push(`spend ${Math.round(plan.month_pct)}%`);
    process.stdout.write(parts.join(' · ') || (s.model?.display_name || ''));
  }
  Promise.all(jobs).then((codes) => process.exit(codes.find((c) => typeof c === 'number') || 0));
});

function account() {
  const dir = process.env.CLAUDE_CONFIG_DIR, home = os.homedir();
  for (const f of dir ? [path.join(dir, '.claude.json')] : [path.join(home, '.claude.json'), path.join(home, '.claude', '.claude.json')]) {
    try { const id = JSON.parse(fs.readFileSync(f, 'utf8'))?.oauthAccount?.organizationUuid; if (id) return String(id).slice(0, 100); } catch {}
  }
  return null;
}

function shape(rl) {
  return Object.keys(rl).sort().map((k) => `${k}:${rl[k] && typeof rl[k] === 'object' ? Object.keys(rl[k]).sort().join(',') : typeof rl[k]}`).join(' ').slice(0, 300);
}

function send(reading) {
  return new Promise((done) => {
    const body = JSON.stringify(reading);
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/statusline', method: 'POST', timeout: 250,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-puddle': '1' } }, (res) => { res.resume(); res.on('end', () => done()); });
    req.on('timeout', () => { req.destroy(); done(); });
    req.on('error', () => done());
    req.end(body);
  });
}

function runPrev(file, stdin) {
  return new Promise((done) => {
    const child = spawn('/bin/sh', [file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.on('exit', (code) => { clearTimeout(kill); done(code ?? 0); });
    child.on('error', () => { clearTimeout(kill); done(0); });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}
