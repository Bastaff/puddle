import { createHash } from 'node:crypto';
import { fromCodex, isCodexEvent } from './codex.js';
import { agent as agentOf } from './agents.js';

export function anyValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) return Number(v.intValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('boolValue' in v) return Boolean(v.boolValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(anyValue);
  if ('kvlistValue' in v) return attrsToObj(v.kvlistValue.values);
  if ('bytesValue' in v) return v.bytesValue;
  return null;
}

export function attrsToObj(list) {
  const out = {};
  for (const kv of list || []) out[kv.key] = anyValue(kv.value);
  return out;
}

const num = (x) => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const bool = (x) => {
  if (x == null) return null;
  if (typeof x === 'boolean') return x ? 1 : 0;
  const s = String(x).toLowerCase();
  if (s === 'true' || s === '1') return 1;
  if (s === 'false' || s === '0') return 0;
  return null;
};

const nanosToMs = (ns) => {
  if (ns == null || ns === '' || ns === '0' || ns === 0) return null;
  try { return Number(BigInt(ns) / 1000000n); } catch { return null; }
};

export function identityOf(a) {
  const account_uuid = a['user.account_uuid'] || a['user.account_id'] || null;
  const email = a['user.email'] || null;
  const user_id = a['user.id'] || null;
  const dec = (v) => { if (v == null) return null; try { return decodeURIComponent(String(v)); } catch { return String(v); } };
  return {
    key: account_uuid || email || user_id || 'unknown',
    account_uuid,
    email,
    organization_id: a['organization.id'] || null,
    user_id,
    name: dec(a['user.display_name']),
    country: a['user.country'] ? String(a['user.country']).toUpperCase().slice(0, 2) : null,
    timezone: dec(a['user.timezone']),
  };
}

export function sessionOf(a) {
  return {
    session_id: a['session.id'] || null,
    entrypoint: a['entrypoint'] || a['app.entrypoint'] || null,
    terminal_type: a['terminal.type'] || null,
    app_version: a['app.version'] || a['service.version'] || null,
  };
}

const stripPrefix = (n) => (n ? String(n).replace(/^claude_code\./, '') : n);

export function parseLogs(body) {
  const out = [];
  for (const rl of body?.resourceLogs || []) {
    const res = attrsToObj(rl.resource?.attributes);
    for (const sl of rl.scopeLogs || rl.instrumentationLibraryLogs || []) {
      for (const rec of sl.logRecords || []) {
        let a = { ...res, ...attrsToObj(rec.attributes) };
        const bodyVal = anyValue(rec.body);
        let name = a['event.name'] || (typeof bodyVal === 'string' && /^(claude_code|codex)\.[a-z_]+$/.test(bodyVal) ? bodyVal : null);
        if (!name) { out.ignored = (out.ignored || 0) + 1; continue; }
        if (isCodexEvent(name)) {
          const m = fromCodex(name, a);
          if (!m) continue;
          [name, a] = m;
        }
        name = stripPrefix(name);
        if (!name) continue;
        const ts =
          (a['event.timestamp'] && Date.parse(a['event.timestamp'])) ||
          nanosToMs(rec.timeUnixNano) ||
          nanosToMs(rec.observedTimeUnixNano) ||
          Date.now();
        out.push(eventRow(name, ts, a));
      }
    }
  }
  return out;
}

export const TEXT_KEYS = ['prompt', 'prompt_text', 'response', 'response_text', 'body', 'request_body', 'response_body'];
export const TOOL_DETAIL_KEYS = ['tool_parameters', 'tool_input', 'tool_output', 'tool_result', 'full_command', 'bash_command', 'file_path', 'error', 'arguments', 'output'];
const TOOL_EVENTS = new Set(['tool_result', 'tool_decision', 'codex.tool_result', 'codex.tool_decision']);

export function scrubPayload(body) {
  for (const rl of body?.resourceLogs || []) {
    for (const sl of rl.scopeLogs || []) {
      for (const rec of sl.logRecords || []) {
        const evName = (rec.attributes || []).find((kv) => kv.key === 'event.name')?.value?.stringValue;
        const drop = TOOL_EVENTS.has(evName) ? [...TEXT_KEYS, ...TOOL_DETAIL_KEYS] : TEXT_KEYS;
        rec.attributes = (rec.attributes || []).filter((kv) => !drop.includes(kv.key));
        const b = rec.body?.stringValue;
        if (b && !/^claude_code\.[a-z_]+$/.test(b)) rec.body = { stringValue: '<scrubbed>' };
      }
    }
  }
  return body;
}

export function dedupeKey(name, a) {
  if (name === 'api_request' && a.request_id) return 'api:' + a.request_id;
  if (name === 'tool_result' && a.tool_use_id) return 'tr:' + a.tool_use_id;
  if (name === 'tool_decision' && a.tool_use_id) return 'td:' + a.tool_use_id;
  if (name === 'user_prompt' && a['prompt.id']) return 'up:' + a['prompt.id'];
  return null;
}

export function eventRow(name, ts, a) {
  const id = identityOf(a);
  const s = sessionOf(a);
  const attrs = { ...a };
  for (const k of TEXT_KEYS) delete attrs[k];
  if (TOOL_EVENTS.has(name)) for (const k of TOOL_DETAIL_KEYS) delete attrs[k];
  const rawPrompt = [a.prompt, a.prompt_text].find((v) => typeof v === 'string' && v !== '<REDACTED>');
  const promptLen = num(a.prompt_length) ?? (rawPrompt ? rawPrompt.length : null);
  const seq = a['event.sequence'] ?? null;
  const dedupe = dedupeKey(name, a) || createHash('sha1')
    .update([s.session_id, seq, name, ts, a.prompt_id ?? a['prompt.id'] ?? '', a.tool_use_id ?? ''].join('|'))
    .digest('hex');
  return {
    dedupe,
    ts,
    name,
    identity: id,
    session: s,
    prompt_id: a['prompt.id'] || a.prompt_id || null,
    tool_name: a.tool_name || null,
    success: bool(a.success),
    duration_ms: num(a.duration_ms),
    model: a.model || null,
    input_tokens: num(a.input_tokens),
    output_tokens: num(a.output_tokens),
    cache_read: num(a.cache_read_tokens),
    cache_creation: num(a.cache_creation_tokens),
    cost_usd: num(a.cost_usd),
    prompt_length: promptLen,
    decision: a.decision || null,
    error: TOOL_EVENTS.has(name) ? (a.error_type || null) : a.error || null,
    agent: a.agent && !agentOf(a.agent).unknown ? agentOf(a.agent).id : 'claude-code',
    attrs,
  };
}

const DELTA = 1;
const CUMULATIVE = 2;
function temporality(t) {
  if (t === CUMULATIVE || t === 'AGGREGATION_TEMPORALITY_CUMULATIVE') return CUMULATIVE;
  return DELTA;
}

export function parseMetrics(body) {
  const out = [];
  for (const rm of body?.resourceMetrics || []) {
    const res = attrsToObj(rm.resource?.attributes);
    for (const sm of rm.scopeMetrics || rm.instrumentationLibraryMetrics || []) {
      for (const m of sm.metrics || []) {
        const data = m.sum || m.gauge;
        if (!data) continue;
        const temp = m.sum ? temporality(data.aggregationTemporality) : DELTA;
        for (const dp of data.dataPoints || []) {
          const a = { ...res, ...attrsToObj(dp.attributes) };
          const value = num(dp.asDouble ?? dp.asInt);
          if (value == null) continue;
          const attrsForKey = Object.keys(a).sort().map((k) => `${k}=${a[k]}`).join(',');
          out.push({
            name: stripPrefix(m.name),
            unit: m.unit || null,
            cumulative: temp === CUMULATIVE,
            start_ns: dp.startTimeUnixNano ? String(dp.startTimeUnixNano) : null,
            ts: nanosToMs(dp.timeUnixNano) || Date.now(),
            value,
            series_key: createHash('sha1').update(`${m.name}|${attrsForKey}`).digest('hex'),
            identity: identityOf(a),
            session: sessionOf(a),
            model: a.model || null,
            type: a.type || a.decision || null,
            attrs: a,
          });
        }
      }
    }
  }
  return out;
}

export function cumulativeDelta(prev, point) {
  if (!point.cumulative) return point.value;
  if (!prev) return point.value;
  if (prev.start_ns !== point.start_ns || point.value < prev.value) return point.value;
  return point.value - prev.value;
}
