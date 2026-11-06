import fs from 'node:fs';
import { openDb } from './db.js';
import { makeQueries } from './queries.js';
import { eventRow, identityOf, sessionOf } from './otlp.js';
import { estimateCost } from './pricing.js';

const DAY = 86400_000;
const HISTORY_DAYS = 35;
const OPUS = 'claude-opus-5-5', SONNET = 'claude-sonnet-5-5', HAIKU = 'claude-haiku-5-5';

export const DEMO_PEOPLE = [
  { name: 'Lena Fischer', plan: [34, 52], country: 'DE', tz: 'Europe/Berlin', hours: [9, 18], perDay: 26, holidays: [8, 9], steps: 5, len: 420, fail: 0.03, asks: 0.04, mention: 0.25, trend: 'steady',
    mix: { read: 30, edit: 40, run: 18, web: 3, agent: 5, mcp: 2, other: 2 }, models: { [OPUS]: 0.8, [SONNET]: 0.15, [HAIKU]: 0.05 }, effort: { high: 0.6, medium: 0.4 },
    client: { 'claude-desktop': 0.7, cli: 0.3 }, skills: ['frontend-design'], agents: ['Explore'], mcp: [], plugins: ['frontend-design'] },
  { name: 'Jonas Weber', plan: [61, 72], country: 'DE', tz: 'Europe/Berlin', hours: [10, 20], perDay: 34, steps: 7, len: 160, fail: 0.16, asks: 0.08, mention: 0.05, trend: 'steady', loops: 0.012,
    mix: { read: 22, edit: 18, run: 48, web: 4, agent: 3, mcp: 0, other: 5 }, models: { [OPUS]: 0.6, [SONNET]: 0.4 }, effort: { medium: 0.7, high: 0.3 },
    client: { cli: 0.85, 'claude-vscode': 0.15 }, skills: [], agents: ['general-purpose'], mcp: [], plugins: [] },
  { name: 'Amara Okafor', plan: [48, 66], country: 'GB', tz: 'Europe/London', hours: [8, 17], perDay: 14, steps: 14, len: 1400, fail: 0.04, asks: 0.02, mention: 0.4, trend: 'rising', bigContext: true,
    mix: { read: 20, edit: 20, run: 10, web: 5, agent: 40, mcp: 5, other: 0 }, models: { [OPUS]: 0.9, [HAIKU]: 0.1 }, effort: { high: 0.8, xhigh: 0.2 },
    client: { 'claude-desktop': 0.9, cli: 0.1 }, skills: ['claude-api', 'pdf'], agents: ['Explore', 'general-purpose', 'Plan'], mcp: ['linear'], plugins: ['agent-protocols'] },
  { name: 'Mateo García', plan: [18, 40], country: 'ES', tz: 'Europe/Madrid', hours: [10, 19], perDay: 18, steps: 4, len: 300, fail: 0.05, asks: 0.06, mention: 0.1, trend: 'steady', version: '2.1.271',
    mix: { read: 25, edit: 15, run: 10, web: 35, agent: 10, mcp: 0, other: 5 }, models: { [SONNET]: 0.7, [OPUS]: 0.3 }, effort: { medium: 1 },
    client: { 'claude-desktop': 1 }, skills: ['research'], agents: ['Explore'], mcp: [], plugins: [] },
  { name: 'Priya Nair', plan: [55, 38], country: 'IN', tz: 'Asia/Kolkata', hours: [10, 19], perDay: 30, steps: 6, len: 220, fail: 0.04, asks: 0.03, mention: 0.3, trend: 'steady', badHook: 'SessionStart:startup',
    mix: { read: 55, edit: 20, run: 15, web: 3, agent: 2, mcp: 5, other: 0 }, models: { [OPUS]: 0.5, [SONNET]: 0.5 }, effort: { medium: 0.5, high: 0.5 },
    client: { 'claude-vscode': 0.6, cli: 0.4 }, skills: [], agents: [], mcp: ['github'], plugins: [] },
  { name: 'Sofia Rossi', plan: [0, 9], country: 'IT', tz: 'Europe/Rome', hours: [9, 17], perDay: 12, steps: 4, len: 250, fail: 0.06, asks: 0.1, mention: 0.1, trend: 'stopped',
    mix: { read: 35, edit: 30, run: 20, web: 10, agent: 0, mcp: 0, other: 5 }, models: { [SONNET]: 1 }, effort: { medium: 1 },
    client: { 'claude-desktop': 1 }, skills: [], agents: [], mcp: [], plugins: [] },
  { name: 'Tom Becker', plan: [12, 25], country: 'DE', tz: 'Europe/Berlin', hours: [9, 18], perDay: 14, steps: 4, len: 90, fail: 0.07, asks: 0.9, mention: 0, trend: 'new',
    mix: { read: 30, edit: 30, run: 30, web: 5, agent: 0, mcp: 0, other: 5 }, models: { [SONNET]: 0.6, [HAIKU]: 0.4 }, effort: { low: 0.5, medium: 0.5 },
    client: { 'claude-desktop': 1 }, skills: [], agents: [], mcp: [], plugins: [] },
  { name: 'Yuki Tanaka', plan: [70, 58], country: 'JP', tz: 'Asia/Tokyo', hours: [9, 19], perDay: 20, steps: 6, len: 380, fail: 0.05, asks: 0.03, mention: 0.15, trend: 'steady', brokenMcp: 'slack',
    mix: { read: 25, edit: 20, run: 10, web: 5, agent: 5, mcp: 35, other: 0 }, models: { [OPUS]: 0.7, [SONNET]: 0.3 }, effort: { high: 1 },
    client: { 'claude-desktop': 0.5, cli: 0.5 }, skills: ['xlsx'], agents: ['Explore'], mcp: ['linear', 'slack', 'github'], plugins: ['linear'] },
  { name: 'Noah Brooks', plan: [96, 83], country: 'US', tz: 'America/New_York', hours: [9, 18], perDay: 22, steps: 5, len: 200, fail: 0.05, asks: 0.05, mention: 0.1, trend: 'spike', rateLimited: true,
    mix: { read: 30, edit: 30, run: 25, web: 5, agent: 5, mcp: 0, other: 5 }, models: { [HAIKU]: 0.5, [SONNET]: 0.5 }, effort: { low: 0.7, medium: 0.3 },
    client: { cli: 1 }, skills: [], agents: ['general-purpose'], mcp: [], plugins: [] },
  { name: 'Ava Martin', plan: [6, 14], country: 'FR', tz: 'Europe/Paris', hours: [10, 17], perDay: 7, attendance: 0.3, steps: 4, len: 260, fail: 0.05, asks: 0.05, mention: 0.1, trend: 'steady',
    mix: { read: 35, edit: 30, run: 20, web: 10, agent: 0, mcp: 0, other: 5 }, models: { [SONNET]: 1 }, effort: { medium: 1 },
    client: { 'claude-desktop': 1 }, skills: [], agents: [], mcp: [], plugins: [] },
].map((p) => ({ ...p, key: 'demo-' + p.name.split(' ')[0].toLowerCase(), email: p.name.split(' ')[0].toLowerCase() + '@demo.team' }));

const TOOLS = {
  read: ['Read', 'Read', 'Grep', 'Glob'], edit: ['Edit', 'Edit', 'Write'], run: ['Bash'],
  web: ['WebSearch', 'WebFetch'], agent: ['Agent'], other: ['TodoWrite', 'AskUserQuestion'],
};
const MCP_OPS = { linear: ['list_issues', 'get_issue', 'update_issue'], slack: ['search', 'post_message'], github: ['get_pull_request', 'list_commits'] };

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rnd, w) => { const e = Object.entries(w); let r = rnd() * e.reduce((a, [, v]) => a + v, 0); for (const [k, v] of e) { if ((r -= v) <= 0) return k; } return e[0][0]; };
const one = (rnd, a) => a[Math.floor(rnd() * a.length)];
const between = (rnd, a, b) => a + rnd() * (b - a);
const logn = (rnd, mean, spread = 0.6) => mean * Math.exp((rnd() + rnd() + rnd() - 1.5) * spread * 1.4);

function tzOffsetMin(tz, t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60_000) * 60_000) / 60_000);
}
export const localHourOf = (tz, t) => (((t / 3600_000 + tzOffsetMin(tz, t) / 60) % 24) + 24) % 24;

function trendFactor(p, daysAgo) {
  switch (p.trend) {
    case 'rising': return 0.35 + 1.05 * (1 - daysAgo / HISTORY_DAYS);
    case 'stopped': return daysAgo < 9 ? 0 : 1;
    case 'new': return daysAgo > 11 ? 0 : 0.7 + 0.08 * (11 - daysAgo);
    case 'spike': return daysAgo < 6 ? 3.4 : 0.9;
    default: return 1;
  }
}

export function makeSim(seed = 7) {
  const rnd = mulberry32(seed);
  let n = 0;
  const uid = (pfx) => `${pfx}-${(++n).toString(36)}-${Math.floor(rnd() * 1e9).toString(36)}`;
  const base = (p, s) => ({
    'user.email': p.email, 'user.account_uuid': p.key, 'organization.id': 'demo-org', 'user.display_name': p.name,
    'user.country': p.country, 'user.timezone': p.tz, 'session.id': s.id, 'app.entrypoint': s.client, 'app.version': p.version || '2.1.295',
  });

  function newSession(p) {
    return { id: uid('s'), client: pick(rnd, p.client), seq: 0, ctx: between(rnd, 14000, 26000), started: false };
  }

  function prompt(p, s, t0) {
    const ev = [], pts = [];
    const pid = uid('p');
    const b = base(p, s);
    const push = (t, name, a = {}) => ev.push([Math.round(t), name, { ...b, 'event.name': name, 'event.sequence': s.seq++, 'prompt.id': pid, ...a }]);
    const point = (t, name, type, value) => { const a = { ...b, type }; pts.push({ name, cumulative: false, ts: Math.round(t), value, identity: identityOf(a), session: sessionOf(a), model: null, type, attrs: a }); };
    if (!s.started) {
      s.started = true;
      for (const pl of p.plugins) push(t0 - 2000, 'plugin_loaded', { 'plugin.name': pl });
      const bad = p.badHook === 'SessionStart:startup';
      push(t0 - 1500, 'hook_execution_complete', { hook_event: 'SessionStart', hook_name: 'SessionStart:startup', num_hooks: 1, num_success: bad ? 0 : 1, num_non_blocking_error: bad ? 1 : 0 });
    }
    if (rnd() < p.mention) push(t0 - 50, 'at_mention', {});
    push(t0, 'user_prompt', { prompt_length: Math.max(4, Math.round(logn(rnd, p.len))) });
    let t = t0 + between(rnd, 120, 400);
    let mcpNext = null;
    const steps = Math.max(1, Math.round(p.steps * between(rnd, 0.4, 1.6)));
    const request = (model, extra = {}) => {
      const out = Math.round(logn(rnd, model === HAIKU ? 250 : 500)), created = Math.round(between(rnd, 800, 5000)), input = Math.round(between(rnd, 3, 40));
      const read = Math.round(s.ctx);
      s.ctx += created + out;
      const ttft = between(rnd, 600, model === OPUS ? 2600 : 1400), dur = ttft + out * between(rnd, 9, 18);
      const cost = estimateCost(model, { input_tokens: input, output_tokens: out, cache_read_input_tokens: read, cache_creation_input_tokens: created, cache_creation: { ephemeral_1h_input_tokens: created } });
      t += dur;
      push(t, 'api_request', { request_id: uid('r'), model, input_tokens: input, output_tokens: out, cache_read_tokens: read, cache_creation_tokens: created,
        cost_usd: cost, duration_ms: Math.round(dur), ttft_ms: Math.round(ttft), effort: pick(rnd, p.effort), query_source: 'main', ...extra });
    };
    for (let i = 0; i < steps; i++) {
      request(pick(rnd, p.models), mcpNext ? { 'mcp_server.name': mcpNext } : {});
      mcpNext = null;
      if (s.ctx > (p.bigContext ? 260_000 : 420_000)) { push(t, 'compaction', { trigger: 'auto', pre_tokens: Math.round(s.ctx) }); s.ctx = between(rnd, 30000, 50000); }
      if (i === steps - 1) break;
      for (let k = rnd() < 0.25 ? 2 : 1; k > 0; k--) {
        let cat = pick(rnd, p.mix);
        if (cat === 'mcp' && !p.mcp.length) cat = 'read';
        let tool = cat === 'mcp' ? null : one(rnd, TOOLS[cat]);
        if (cat === 'mcp') { mcpNext = one(rnd, p.mcp); tool = `mcp__${mcpNext}__${one(rnd, MCP_OPS[mcpNext])}`; }
        if (cat === 'agent' && p.skills.length && rnd() < 0.35) tool = 'Skill';
        const tu = uid('tu');
        const byUser = cat !== 'read' && rnd() < p.asks;
        const decision = byUser && rnd() < 0.1 ? 'reject' : 'accept';
        t += byUser ? between(rnd, 1500, 9000) : 30;
        push(t, 'tool_decision', { tool_use_id: tu, tool_name: tool, decision, source: byUser ? (rnd() < 0.7 ? 'user_temporary' : 'user_permanent') : 'config' });
        if (decision === 'reject') continue;
        let ok = rnd() > p.fail * (cat === 'run' ? 1.6 : cat === 'read' ? 0.4 : 0.8);
        if (cat === 'mcp' && mcpNext && mcpNext === p.brokenMcp) ok = rnd() > 0.7;
        if (cat === 'run' && p.loops && rnd() < p.loops) {
          for (let r = Math.round(between(rnd, 4, 7)); r > 0; r--) {
            const id = uid('tu'); t += between(rnd, 1500, 6000);
            push(t, 'tool_decision', { tool_use_id: id, tool_name: tool, decision: 'accept', source: 'config' });
            push(t, 'tool_result', { tool_use_id: id, tool_name: tool, success: false, duration_ms: 2000, error_type: 'ShellError' });
          }
        }
        let dur = { read: between(rnd, 20, 300), edit: between(rnd, 40, 250), run: logn(rnd, 6000, 0.9), web: between(rnd, 1500, 7000), agent: between(rnd, 25000, 120000), mcp: between(rnd, 600, 3500), other: between(rnd, 10, 80) }[cat];
        if (cat === 'agent' && tool === 'Skill') { push(t, 'skill_activated', { 'skill.name': one(rnd, p.skills) }); dur = between(rnd, 50, 400); }
        else if (cat === 'agent') {
          const type = one(rnd, p.agents.length ? p.agents : ['general-purpose']);
          const t1 = t;
          for (let j = Math.round(between(rnd, 2, 6)); j > 0; j--) request(rnd() < 0.5 ? HAIKU : pick(rnd, p.models), { 'agent.name': type, query_source: `agent:builtin:${type}` });
          dur = Math.max(dur, t - t1); t = t1;
          push(t1 + dur, 'subagent_completed', { agent_type: type });
        }
        t += dur;
        push(t, 'tool_result', { tool_use_id: tu, tool_name: tool, success: ok, duration_ms: Math.round(dur), ...(ok ? {} : { error_type: cat === 'run' ? 'exit_code' : 'tool_error' }) });
        if (cat === 'edit' && ok) { point(t, 'lines_of_code.count', 'added', Math.round(logn(rnd, 30))); if (rnd() < 0.6) point(t, 'lines_of_code.count', 'removed', Math.round(logn(rnd, 12))); }
        s.ctx += between(rnd, 300, cat === 'read' ? 6000 : 2000);
      }
    }
    if (rnd() < 0.006) push(t, 'api_error', { model: pick(rnd, p.models), error: 'overloaded', status_code: 529 });
    if (p.rateLimited && rnd() < 0.06) push(t, 'api_error', { model: pick(rnd, p.models), error: 'rate_limit_error', status_code: 429 });
    point(t, 'active_time.total', 'cli', (t - t0) / 1000);
    return { ev, pts, end: t };
  }

  function session(p, start, prompts, thinkMs, until) {
    const s = newSession(p), ev = [], pts = [];
    let t = start;
    for (let i = 0; i < prompts && t < until; i++) {
      const r = prompt(p, s, t);
      ev.push(...r.ev); pts.push(...r.pts);
      const think = logn(rnd, thinkMs, 0.8);
      pts.push({ ...r.pts[r.pts.length - 1], name: 'active_time.total', type: 'user', value: Math.min(think, 600_000) / 1000, ts: Math.round(r.end + think), attrs: { ...r.pts[0].attrs, type: 'user' } });
      t = r.end + think;
    }
    if (ev.some(([, n, a]) => n === 'tool_result' && /Edit|Write/.test(a.tool_name)) && rnd() < 0.5) {
      const a = { ...base(p, s), type: null };
      pts.push({ name: 'commit.count', cumulative: false, ts: Math.round(t), value: 1, identity: identityOf(a), session: sessionOf(a), model: null, type: null, attrs: a });
    }
    return { ev: ev.filter(([ts]) => ts <= until), pts: pts.filter((x) => x.ts <= until) };
  }

  function history(now) {
    const ev = [], pts = [];
    for (const p of DEMO_PEOPLE) {
      for (let d = HISTORY_DAYS; d >= 0; d--) {
        const dayT = now - d * DAY;
        const off = tzOffsetMin(p.tz, dayT) * 60_000;
        const midnight = Math.floor((dayT + off) / DAY) * DAY - off;
        const dow = new Date(midnight + off + 12 * 3600_000).getUTCDay();
        if (p.holidays?.includes(d) || (p.attendance && rnd() > p.attendance)) continue;
        let target = p.perDay * trendFactor(p, d) * between(rnd, 0.55, 1.45) * (dow === 0 || dow === 6 ? (rnd() < 0.25 ? 0.3 : 0) : 1);
        while (target >= 2) {
          const size = Math.min(Math.round(target), Math.round(between(rnd, 3, 13)));
          target -= size;
          const start = midnight + between(rnd, p.hours[0], p.hours[1] - 1) * 3600_000;
          if (start > now) continue;
          const r = session(p, start, size, 70_000, now);
          ev.push(...r.ev); pts.push(...r.pts);
        }
      }
    }
    return { ev, pts };
  }

  const live = new Map();
  function livePeople(now) {
    const can = DEMO_PEOPLE.filter((p) => p.trend !== 'stopped');
    const on = can.filter((p) => { const h = localHourOf(p.tz, now); return h >= p.hours[0] && h < p.hours[1]; });
    for (const p of can) { if (on.length >= 4) break; if (!on.includes(p)) on.push(p); }
    return on;
  }
  function step(now) {
    const ev = [], pts = [];
    const on = livePeople(now);
    for (const p of on) {
      let st = live.get(p.key);
      if (!st) { st = { queue: [], pq: [], nextAt: now + between(rnd, 0, 20_000), s: null, left: 0 }; live.set(p.key, st); }
      if (!st.queue.length && now >= st.nextAt) {
        if (!st.s || st.left <= 0) { st.s = newSession(p); st.left = Math.round(between(rnd, 4, 12)); }
        const r = prompt(p, st.s, now);
        st.left--;
        st.queue.push(...r.ev); st.pq.push(...r.pts);
        st.nextAt = r.end + logn(rnd, 25_000, 0.7);
      }
      while (st.queue.length && st.queue[0][0] <= now) ev.push(st.queue.shift());
      while (st.pq.length && st.pq[0].ts <= now) pts.push(st.pq.shift());
    }
    for (const [k, st] of live) if (!on.some((p) => p.key === k) && !st.queue.length) live.delete(k);
    return { ev, pts };
  }
  return { history, step };
}

const toRows = (ev) => ev.map(([ts, name, a]) => eventRow(name, ts, a));

export function demoHistory({ seed = 7, now = Date.now() } = {}) {
  const { ev, pts } = makeSim(seed).history(now);
  return { rows: toRows(ev), points: pts };
}

export function makeDemo(file, { notify = () => {}, log = () => {}, seed = 7, now = () => Date.now() } = {}) {
  let store = null, q = null, sim = null, timer = null, stopAt = 0, seenAt = 0;

  function open() {
    if (store) return;
    store = openDb(file, { rollup: true });
    q = makeQueries(store.db, { now, rollup: () => true });
  }
  function regenerate() {
    try { store?.close(); } catch {}
    store = null;
    for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
    open();
    const t0 = Date.now();
    sim = makeSim(seed);
    const { ev, pts } = sim.history(now() - 60_000);
    store.insertEvents(toRows(ev));
    store.insertPoints(pts);
    const ins = store.db.prepare(`INSERT OR REPLACE INTO plan_limits (user_key, agent, org_hash, five_pct, five_reset, week_pct, week_reset, ts) VALUES (?, 'claude-code', 'demo', ?, ?, ?, ?, ?)`);
    const t = now();
    DEMO_PEOPLE.forEach((p, i) => { const [five, week] = p.plan; ins.run(p.key, five, t + (1 + (i % 4)) * 3600_000, week, t + (1 + (i % 6)) * 864e5, t - 5 * 60_000); });
    store.db.exec('ANALYZE');
    log(`demo team generated: ${ev.length} events in ${Date.now() - t0}ms`);
  }
  function ensure() {
    if (!sim || Date.now() - seenAt > 30 * 60_000) regenerate();
    seenAt = Date.now();
  }
  function tick() {
    if (Date.now() > stopAt) { clearInterval(timer); timer = null; log('demo simulator paused'); return; }
    seenAt = Date.now();
    const { ev, pts } = sim.step(Date.now());
    if (!ev.length && !pts.length) return;
    store.insertEvents(toRows(ev));
    if (pts.length) store.insertPoints(pts);
    notify();
  }
  return {
    queries() { ensure(); return q; },
    keepAlive() {
      ensure();
      stopAt = Date.now() + 90_000;
      if (!timer) { timer = setInterval(tick, 1000); timer.unref?.(); log('demo simulator running'); }
    },
    reset() { regenerate(); notify(); },
    feedback(b) { ensure(); const ok = store.addFeedback(b); if (ok) notify(); return ok; },
    close() { clearInterval(timer); try { store?.close(); } catch {} },
  };
}
