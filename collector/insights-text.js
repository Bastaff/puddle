// What a team lead can rightly read from usage, in plain words. Pure functions over the numbers
// queries.js team() already computes: same input, same sentences, every one with its evidence.
// Never a score or a ranking: time and tokens are not value, and we never see content.

// Named thresholds, so every sentence can say why it was written.
export const T = {
  minPrompts: 5,          // below this, a period says too little about someone's habits
  outside: 0.5,           // half or more of active time outside 08–19 on weekdays
  closeSecond: 0.6,       // name two of evening / night / weekend when the second is 60%+ of the first
  longRun: 20,            // tool steps in one prompt: a task handed over
  longRunShare: 0.15,     // 15%+ of prompts are long runs → "hands over long tasks"
  chatShare: 0.5,         // half of prompts use no tool → "mostly asks questions"
  autoApproved: 0.97,     // 97%+ of actions run without a manual "no" (and 50+ decisions)
  byHandPerPrompt: 2,     // 2+ manual approvals per prompt → approves step by step
  smoothOk: 0.9,          // 90%+ of prompts without a failed step
  nearLimit: 80,          // % of the 5-hour or weekly plan limit
  dominant: 0.4,          // a kind of work with 40%+ of tool calls defines the profile
  fewEdits: 0.1,          // under 10% file edits → "little code editing"
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
const hrs = (min) => (min >= 60 ? `${(min / 60).toFixed(min >= 600 ? 0 : 1).replace(/\.0$/, '')} h` : `${Math.round(min)} min`);
const shareOf = (mix, k) => { const tot = Object.values(mix || {}).reduce((a, b) => a + b, 0); return tot ? (mix[k] || 0) / tot : 0; };
const topKind = (mix) => {
  const tot = Object.values(mix || {}).reduce((a, b) => a + b, 0);
  if (!tot) return null;
  const [k, n] = Object.entries(mix).filter(([c]) => KIND[c]).sort((a, b) => b[1] - a[1])[0] || [];
  return k ? { k, share: n / tot } : null;
};
export const firstName = (p) => String(p.name || p.email?.split('@')[0] || 'Someone').split(/[\s.]/)[0].replace(/^./, (c) => c.toUpperCase());

// A warning, in two or three words (the full text stays in "Needs a look").
const FLAG_WORDS = { quiet: 'stopped using it', stuck: 'stuck on a tool', broken: 'a tool keeps failing', failures: 'many failed steps', ratelimit: 'rate-limited',
  auth: 'sign-in errors', limit: 'at a plan limit', hook: 'a hook keeps failing', rejects: 'often says no to the agent', context: 'conversations run out of room',
  heavy: 'much heavier use than usual', version: 'old Claude Code', friction: 'approves step by step' };
export const listNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

// When outside office hours: the biggest of evening / night / weekend, or the two biggest when close.
const outsideWhen = (h) => {
  const parts = [['evening', h.evening], ['weekend', h.weekend], ['late-night', h.night]].sort((a, b) => b[1] - a[1]);
  return parts[1][1] >= parts[0][1] * T.closeSecond ? `${parts[0][0]} & ${parts[1][0]}` : parts[0][0];
};

// One person → a handful of facts, each { key, text, evidence }. Rhythm and kind read as one phrase
// ("evening operator"), the rest as short clauses.
// ctx.common: fact keys most of the team shares (they say nothing about one person, so the line skips them)
export function profile(p, ctx = {}) {
  const facts = [];
  const hours = p.hours || {};
  const enough = p.prompts >= T.minPrompts;
  const kind = topKind(p.mix);
  // when + what: "evening operator", "daytime builder"
  if (enough && (kind || hours.total)) {
    const when = hours.total ? (hours.outside / hours.total >= T.outside ? outsideWhen(hours) : 'daytime') : '';
    const who = kind && kind.share >= T.dominant ? KIND[kind.k].who : 'all-round user';
    facts.push({ key: 'style', text: [when, who].filter(Boolean).join(' '),
      evidence: [hours.total ? `${pct(hours.outside / hours.total)} of active time outside 08–19 on weekdays` : null, kind ? `${pct(kind.share)} of tool calls are ${KIND[kind.k].what}` : null].filter(Boolean).join(' · ') });
  }
  // how much is handed over
  if (enough && p.runs) {
    const { long = 0, chat = 0, prompts = p.prompts, longest = 0 } = p.runs;
    if (long / prompts >= T.longRunShare) facts.push({ key: 'delegates', text: 'long hands-off runs', evidence: `${long} of ${prompts} prompts ran ${T.longRun}+ steps on their own (longest ${longest})` });
    else if (chat / prompts >= T.chatShare) facts.push({ key: 'delegates', text: 'mostly asks questions', evidence: `${chat} of ${prompts} prompts used no tools` });
    else facts.push({ key: 'delegates', text: 'short tasks', evidence: `${(p.toolsPerPrompt || 0).toFixed(1)} tool steps per prompt` });
  }
  // trust: how often a person steps in
  if (enough && p.decisions >= 50 && p.autoApproved != null && p.autoApproved >= T.autoApproved) facts.push({ key: 'autoapprove', text: `${Math.floor(p.autoApproved * 100)}% auto-approved`, evidence: `${p.rejects} of ${p.decisions} actions stopped by hand` });
  else if (p.prompts >= T.minPrompts && p.asks / p.prompts >= T.byHandPerPrompt) facts.push({ key: 'byhand', text: 'approves step by step', evidence: `${p.asks} manual approvals for ${p.prompts} prompts` });
  // plan limits (subscriptions: an allowance per 5 hours and per week)
  if (p.week_pct >= T.nearLimit) facts.push({ key: 'limit', text: 'near weekly limit', evidence: `${Math.round(p.week_pct)}% of the weekly allowance used` });
  else if (p.five_pct >= T.nearLimit) facts.push({ key: 'limit', text: 'hits the 5-hour limit', evidence: `${Math.round(p.five_pct)}% of the 5-hour allowance used` });
  // the most important thing that needs a look, if any
  const flag = (p.flags || []).find((f) => f.level === 'warn' && !f.acknowledged);
  if (flag) facts.push({ key: 'flag', text: FLAG_WORDS[flag.kind] || 'needs a look', evidence: flag.text, level: 'warn' });
  if (!enough && !flag) facts.push({ key: 'light', text: p.prompts ? 'light use this period' : 'no use this period', evidence: `${p.prompts} prompt${p.prompts === 1 ? '' : 's'}` });
  const common = ctx.common || new Set();
  return { facts, line: facts.filter((f) => !common.has(f.key)).map((f) => f.text).join(' · ') };
}

// The team in 3–5 sentences, most useful first. Names appear only for things to act on.
export function teamSummary(people, { prevMinutes = null } = {}) {
  const out = [];
  const active = people.filter((p) => p.prompts > 0);
  const n = people.length;
  if (!n) return out;
  // adoption
  const stopped = people.filter((p) => (p.flags || []).some((f) => f.kind === 'quiet' && !f.acknowledged));
  out.push({ key: 'adoption', text: `${active.length} of ${n} ${n === 1 ? 'person' : 'people'} used agents in this period${stopped.length ? `; ${listNames(stopped.map(firstName))} stopped` : ''}.`,
    evidence: active.map(firstName).join(', ') || 'nobody yet' });
  if (!active.length) return out;
  // time
  const minutes = people.reduce((a, p) => a + (p.activeMinutes || 0), 0);
  if (minutes >= 1) {
    const change = prevMinutes ? (minutes - prevMinutes) / prevMinutes : null;
    out.push({ key: 'time', text: `${hrs(minutes)} of active work with agents${change == null ? '' : Math.abs(change) < 0.1 ? ', about the same as before' : `, ${change > 0 ? 'up' : 'down'} from ${hrs(prevMinutes)}`}.`,
      evidence: 'Active time counts the stretches between events less than 5 minutes apart; parallel conversations count once.' });
  }
  // what for
  const mix = {}; for (const p of people) for (const [k, v] of Object.entries(p.mix || {})) mix[k] = (mix[k] || 0) + v;
  const kinds = Object.entries(mix).filter(([k, v]) => KIND[k] && v).sort((a, b) => b[1] - a[1]);
  if (kinds.length) {
    const tot = Object.values(mix).reduce((a, b) => a + b, 0);
    const [k1, v1] = kinds[0], second = kinds[1];
    const edits = shareOf(mix, 'edit');
    out.push({ key: 'work', text: `Mostly ${KIND[k1].what} (${pct(v1 / tot)})${second && second[1] / tot >= 0.15 ? ` and ${KIND[second[0]].what} (${pct(second[1] / tot)})` : ''}${k1 !== 'edit' && edits < T.fewEdits ? `; little code editing (${pct(edits)})` : ''}.`,
      evidence: kinds.map(([k, v]) => `${KIND[k].what} ${pct(v / tot)}`).join(' · ') });
  }
  // delegation
  const prompts = people.reduce((a, p) => a + (p.runs?.prompts || 0), 0), long = people.reduce((a, p) => a + (p.runs?.long || 0), 0);
  if (prompts >= T.minPrompts) {
    const share = long / prompts;
    out.push({ key: 'delegation', text: share >= 0.05 ? `About 1 in ${Math.max(2, Math.round(1 / share))} prompts is a task handed over: ${T.longRun}+ steps without the person stepping in.` : `Agents mostly get short tasks: few prompts run ${T.longRun}+ steps on their own.`,
      evidence: `${long} of ${prompts} prompts ran ${T.longRun}+ tool steps` });
  }
  // trust: when (almost) everyone lets the agent run, say it once for the team
  const trusting = active.filter((p) => p.decisions >= 50 && p.autoApproved >= T.autoApproved);
  if (active.length >= 3 && trusting.length > active.length / 2) out.push({ key: 'trust', text: `${trusting.length === active.length ? 'Everyone' : 'Most people'} let the agent act without stepping in (${T.autoApproved * 100}%+ of actions).`,
    evidence: trusting.map((p) => `${firstName(p)} ${Math.floor(p.autoApproved * 100)}%`).join(' · ') });
  // smooth running
  const smooth = people.reduce((a, p) => a + (p.runs?.smooth || 0), 0);
  const needs = people.filter((p) => (p.flags || []).some((f) => f.level === 'warn' && !f.acknowledged && f.kind !== 'quiet'));
  if (prompts >= T.minPrompts) out.push({ key: 'smooth', text: `${pct(smooth / prompts)} of prompts ran without a failed step${needs.length ? `; ${listNames(needs.map(firstName))} ${needs.length === 1 ? 'has' : 'have'} something to look at below` : ''}.`,
    evidence: `${smooth} of ${prompts} prompts had no failed tool call` });
  // plan limits
  const limited = people.filter((p) => p.week_pct >= T.nearLimit || p.five_pct >= T.nearLimit);
  if (limited.length) out.push({ key: 'limits', text: `${listNames(limited.map(firstName))} ${limited.length === 1 ? 'is' : 'are'} close to a plan limit.`, evidence: limited.map((p) => `${firstName(p)}: 5-hour ${Math.round(p.five_pct ?? 0)}%, week ${Math.round(p.week_pct ?? 0)}%`).join(' · ') });
  // hours
  const total = people.reduce((a, p) => a + (p.hours?.total || 0), 0), outside = people.reduce((a, p) => a + (p.hours?.outside || 0), 0);
  if (total >= 30 && outside / total >= 0.25) out.push({ key: 'hours', text: `${pct(outside / total)} of agent time is in the evening, at night or at the weekend.`, evidence: 'Outside 08–19 on weekdays, in each person\'s own time zone.' });
  return out;
}

// Fact keys (with the same text) that more than half of a team of 3+ active people share.
export function commonFacts(people) {
  const active = people.filter((p) => p.profile && p.prompts >= T.minPrompts);
  const count = new Map();
  for (const p of active) for (const f of p.profile.facts) if (f.key === 'autoapprove') count.set(f.key, (count.get(f.key) || 0) + 1);
  return new Set(active.length >= 3 ? [...count].filter(([, n]) => n > active.length / 2).map(([k]) => k) : []);
}
