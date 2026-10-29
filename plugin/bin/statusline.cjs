// Puddle's Claude Code status line. Claude Code hands every status line its session JSON on stdin; Puddle
// keeps only the plan limits (5-hour and weekly % used, a Claude apps gateway's spend limit, when each resets,
// and which windows came) and the conversation's name (session_name: the one set with /rename, otherwise the
// generated title) with its session id, and passes them to Puddle on this Mac. With limits it also reads which
// Claude account this is (the organization id in Claude Code's own config), so the reading lands on the right
// account. What you see is your own status line if you had one (run with the same input, its output
// unchanged), otherwise a short "5h 42% · week 18%". Never blocks Claude Code; nothing else is read.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const DIR = process.env.JOULE_DIR || path.join(os.homedir(), '.joule');
const PORT = Number(process.env.JOULE_PORT) || 4600;

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let s = {};
  try { s = JSON.parse(input); } catch {}
  const rl = s.rate_limits || {};
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  // a gateway's spend limit is the month window (Claude Code has no other); its period rides along for the label
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

// the Claude account Claude Code runs as: its config dir's .claude.json (CLAUDE_CONFIG_DIR, else ~/.claude.json)
function account() {
  const dir = process.env.CLAUDE_CONFIG_DIR, home = os.homedir();
  for (const f of dir ? [path.join(dir, '.claude.json')] : [path.join(home, '.claude.json'), path.join(home, '.claude', '.claude.json')]) {
    try { const id = JSON.parse(fs.readFileSync(f, 'utf8'))?.oauthAccount?.organizationUuid; if (id) return String(id).slice(0, 100); } catch {}
  }
  return null;
}

// which windows came and with which fields ("five_hour:resets_at,used_percentage seven_day:used_percentage"):
// names only, so a missing reset time or week can be told from Puddle's log
function shape(rl) {
  return Object.keys(rl).sort().map((k) => `${k}:${rl[k] && typeof rl[k] === 'object' ? Object.keys(rl[k]).sort().join(',') : typeof rl[k]}`).join(' ').slice(0, 300);
}

// to Puddle on this Mac; gives up after 250 ms (Puddle not running is fine)
function send(reading) {
  return new Promise((done) => {
    const body = JSON.stringify(reading);
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/statusline', method: 'POST', timeout: 250,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-joule': '1' } }, (res) => { res.resume(); res.on('end', () => done()); });
    req.on('timeout', () => { req.destroy(); done(); });
    req.on('error', () => done());
    req.end(body);
  });
}

// your previous status line, with the same input; its output and exit code pass through
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
