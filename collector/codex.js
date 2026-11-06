const TOOL_MAP = {
  shell: 'Bash', local_shell: 'Bash', exec_command: 'Bash', container_exec: 'Bash', unified_exec: 'Bash', write_stdin: 'BashOutput',
  apply_patch: 'Edit', edit_file: 'Edit', write_file: 'Write',
  read_file: 'Read', view_image: 'Read', list_dir: 'LS', grep_files: 'Grep', search_files: 'Grep', glob: 'Glob',
  web_search: 'WebSearch', web_fetch: 'WebFetch', fetch: 'WebFetch',
  spawn_agent: 'Agent', send_input: 'Agent', wait: 'Agent',
  update_plan: 'TodoWrite', request_user_input: 'AskUserQuestion',
};

import { canonicalClient } from './agents.js';
import { estimateCost } from './pricing.js';

const num = (x) => { if (x == null || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };

function common(a) {
  const out = {
    'session.id': a['conversation.id'] || null,
    'app.entrypoint': canonicalClient(a.originator) || null,
    'app.version': a['app.version'] || null,
    'user.email': a['user.email'] || null,
    'user.account_id': a['user.account_id'] || null,
    'organization.id': a['user.account_id'] || null,
    'terminal.type': a['terminal.type'] || null,
    model: a.model || null,
    agent: 'codex',
    'codex.auth_mode': a.auth_mode || null,
  };
  for (const k of Object.keys(a)) if (k.startsWith('user.') && k !== 'user.email' && k !== 'user.account_id') out[k] = a[k];
  if (a.machine) out.machine = a.machine;
  return out;
}

export function fromCodex(eventName, a) {
  const n = String(eventName).replace(/^codex\./, '');
  const base = { ...common(a), 'event.timestamp': a['event.timestamp'] };
  switch (n) {
    case 'user_prompt':
      return ['user_prompt', { ...base, prompt_length: num(a.prompt_length) }];
    case 'sse_event': {
      if (a['event.kind'] !== 'response.completed') return null;
      const input = num(a.input_token_count) ?? 0, cached = num(a.cached_token_count) ?? 0, output = num(a.output_token_count) ?? 0;
      if (output === 0) return null;
      const write = num(a.cache_write_token_count) ?? 0;
      return ['api_request', {
        ...base,
        input_tokens: Math.max(0, input - cached), cache_read_tokens: cached,
        cache_creation_tokens: write,
        output_tokens: output,
        cost_usd: estimateCost(a.model, { input_tokens: Math.max(0, input - cached - write), cache_read_input_tokens: cached, cache_creation_input_tokens: write, output_tokens: output }),
        reasoning_tokens: num(a.reasoning_token_count),
        ttft_ms: num(a.ttft_ms), duration_ms: num(a.duration_ms),
        effort: a.model_reasoning_effort || a.reasoning_effort || null,
        service_tier: a.service_tier || null,
      }];
    }
    case 'tool_result': {
      const raw = a.tool_name || 'unknown';
      const mcp = a.tool_origin === 'mcp' || a.mcp_server;
      const tool = mcp ? `mcp__${a.mcp_server || a.tool_namespace || 'mcp'}__${raw}` : (TOOL_MAP[raw] || raw);
      return ['tool_result', {
        ...base, tool_name: tool, 'codex.tool': raw, tool_use_id: a.call_id || null,
        success: a.success, duration_ms: num(a.duration_ms),
        ...(mcp ? { 'mcp_server.name': a.mcp_server || a.tool_namespace || null } : {}),
      }];
    }
    case 'tool_decision': {
      const d = String(a.decision || '').toLowerCase();
      const raw = a.tool_name || 'unknown';
      return ['tool_decision', {
        ...base, tool_name: TOOL_MAP[raw] || raw, tool_use_id: a.call_id || null,
        decision: /approv|accept|allow/.test(d) ? 'accept' : 'reject',
        source: /user/.test(String(a.source || '')) ? 'user_temporary' : (a.source || 'config'),
      }];
    }
    case 'api_request': {
      const status = num(a['http.response.status_code']);
      if (status == null || status < 400) return null;
      return ['api_error', { ...base, status_code: status, error: status === 429 ? 'rate_limit_error' : status >= 500 ? 'server_error' : 'api_error', attempt: num(a.attempt) }];
    }
    case 'turn_cost':
      return ['turn_cost', { ...base, cost_usd: num(a['usage.estimated_usd']), 'turn.id': a['turn.id'] || null }];
    case 'conversation_starts':
      return ['session_start', { ...base, effort: a.reasoning_effort || null, context_window: num(a.context_window),
        ...(base['app.entrypoint'] === 'Codex Desktop' && a.approval_policy === 'never' && /^read-only/.test(String(a.sandbox_policy || '')) ? { 'app.entrypoint': 'codex_background' } : {}) }];
    default:
      return null;
  }
}

export const isCodexEvent = (name) => String(name || '').startsWith('codex.');
