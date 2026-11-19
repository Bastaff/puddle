export const T = {
  minPrompts: 5,
  outside: 0.5,
  closeSecond: 0.6,
  longRun: 20,
  longRunShare: 0.15,
  chatShare: 0.5,
  autoApproved: 0.97,
  byHandPerPrompt: 2,
  smoothOk: 0.9,
  nearLimit: 80,
  dominant: 0.4,
  fewEdits: 0.1,
};

export const KIND = {
  run: { who: 'operator', what: 'running commands' },
  edit: { who: 'builder', what: 'editing code' },
  read: { who: 'explorer', what: 'reading code' },
  web: { who: 'researcher', what: 'web research' },
  agent: { who: 'delegator', what: 'handing work to sub-agents' },
  mcp: { who: 'integrator', what: 'using connected tools' },
};

const pct = (x) => `${Math.round(x * 100)}%`;
const topKind = (mix) => {
  const tot = Object.values(mix || {}).reduce((a, b) => a + b, 0);
  if (!tot) return null;
  const [k, n] = Object.entries(mix).filter(([c]) => KIND[c]).sort((a, b) => b[1] - a[1])[0] || [];
  return k ? { k, share: n / tot } : null;
};
export const firstName = (p) => String(p.name || p.email?.split('@')[0] || 'Someone').split(/[\s.]/)[0].replace(/^./, (c) => c.toUpperCase());

const FLAG_WORDS = { quiet: 'stopped using it', stuck: 'stuck on a tool', broken: 'a tool keeps failing', failures: 'many failed steps', ratelimit: 'rate-limited',
  auth: 'sign-in errors', limit: 'at a plan limit', hook: 'a hook keeps failing', rejects: 'often says no to the agent', context: 'conversations run out of room',
  heavy: 'much heavier use than usual', version: 'old Claude Code', friction: 'approves step by step' };

const outsideWhen = (h) => {
  const parts = [['evening', h.evening], ['weekend', h.weekend], ['late-night', h.night]].sort((a, b) => b[1] - a[1]);
  return parts[1][1] >= parts[0][1] * T.closeSecond ? `${parts[0][0]} & ${parts[1][0]}` : parts[0][0];
};

export function profile(p, ctx = {}) {
  const facts = [];
  const hours = p.hours || {};
  const enough = p.prompts >= T.minPrompts;
  const kind = topKind(p.mix);
  if (enough && (kind || hours.total)) {
    const when = hours.total ? (hours.outside / hours.total >= T.outside ? outsideWhen(hours) : 'daytime') : '';
    const who = kind && kind.share >= T.dominant ? KIND[kind.k].who : 'all-round user';
    facts.push({ key: 'style', text: [when, who].filter(Boolean).join(' '),
      evidence: [hours.total ? `${pct(hours.outside / hours.total)} of active time outside 08–19 on weekdays` : null, kind ? `${pct(kind.share)} of tool calls are ${KIND[kind.k].what}` : null].filter(Boolean).join(' · ') });
  }
  if (enough && p.runs) {
    const { long = 0, chat = 0, prompts = p.prompts, longest = 0 } = p.runs;
    if (long / prompts >= T.longRunShare) facts.push({ key: 'delegates', text: 'long hands-off runs', evidence: `${long} of ${prompts} prompts ran ${T.longRun}+ steps on their own (longest ${longest})` });
    else if (chat / prompts >= T.chatShare) facts.push({ key: 'delegates', text: 'mostly asks questions', evidence: `${chat} of ${prompts} prompts used no tools` });
    else facts.push({ key: 'delegates', text: 'short tasks', evidence: `${(p.toolsPerPrompt || 0).toFixed(1)} tool steps per prompt` });
  }
  if (enough && p.decisions >= 50 && p.autoApproved != null && p.autoApproved >= T.autoApproved) facts.push({ key: 'autoapprove', text: `${Math.floor(p.autoApproved * 100)}% auto-approved`, evidence: `${p.rejects} of ${p.decisions} actions stopped by hand` });
  else if (p.prompts >= T.minPrompts && p.asks / p.prompts >= T.byHandPerPrompt) facts.push({ key: 'byhand', text: 'approves step by step', evidence: `${p.asks} manual approvals for ${p.prompts} prompts` });
  if (p.week_pct >= T.nearLimit) facts.push({ key: 'limit', text: 'near weekly limit', evidence: `${Math.round(p.week_pct)}% of the weekly allowance used` });
  else if (p.five_pct >= T.nearLimit) facts.push({ key: 'limit', text: 'hits the 5-hour limit', evidence: `${Math.round(p.five_pct)}% of the 5-hour allowance used` });
  const flag = (p.flags || []).find((f) => f.level === 'warn' && !f.acknowledged);
  if (flag) facts.push({ key: 'flag', text: FLAG_WORDS[flag.kind] || 'needs a look', evidence: flag.text, level: 'warn' });
  if (!enough && !flag) facts.push({ key: 'light', text: p.prompts ? 'light use this period' : 'no use this period', evidence: `${p.prompts} prompt${p.prompts === 1 ? '' : 's'}` });
  const common = ctx.common || new Set();
  return { facts, line: facts.filter((f) => !common.has(f.key)).map((f) => f.text).join(' · ') };
}

export function commonFacts(people) {
  const active = people.filter((p) => p.profile && p.prompts >= T.minPrompts);
  const count = new Map();
  for (const p of active) for (const f of p.profile.facts) if (f.key === 'autoapprove') count.set(f.key, (count.get(f.key) || 0) + 1);
  return new Set(active.length >= 3 ? [...count].filter(([, n]) => n > active.length / 2).map(([k]) => k) : []);
}
