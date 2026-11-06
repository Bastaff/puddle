export function parseRollout(text) {
  const out = { session: null, prompts: [], reqs: [], steps: [], lines: [], compactions: [] };
  let model = null, effort = null, n = -1;
  const userItems = [], userMsgs = [];
  for (const line of text.split('\n')) {
    n++;
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const ts = Date.parse(r.timestamp), p = r.payload || {};
    if (r.type === 'session_meta') {
      out.session = { id: p.id || p.session_id || null, entrypoint: p.originator || null, version: p.cli_version || null, cwd: p.cwd || null };
      continue;
    }
    if (!ts || !out.session?.id) continue;
    const sid = out.session.id, key = (k) => `cx:${sid}:${k}:${n}`;
    if (r.type === 'turn_context') { model = p.model || p.collaboration_mode?.settings?.model || model; effort = p.effort || p.reasoning_effort || effort; continue; }
    if (r.type === 'response_item' && p.type === 'message' && p.role === 'user') {
      const t = (p.content || []).filter((b) => b?.type === 'input_text' && !String(b.text || '').startsWith('<')).map((b) => b.text).join('');
      if (t) userMsgs.push({ key: key('up'), ts, length: t.length, id: `${sid}:p${n}` });
      continue;
    }
    if (r.type === 'event_msg' && p.type === 'token_count' && p.info?.last_token_usage) {
      const u = p.info.last_token_usage, cached = Number(u.cached_input_tokens) || 0;
      out.reqs.push({ key: key('api'), ts, model, effort, line: n, input: Math.max(0, (Number(u.input_tokens) || 0) - cached), cached,
        cacheWrite: Number(u.cache_write_input_tokens) || 0, output: Number(u.output_tokens) || 0,
        thinking: Number(u.reasoning_output_tokens) || 0, window: Number(p.info.model_context_window) || null });
      continue;
    }
    if (r.type === 'event_msg' && p.type === 'item_completed' && p.item) {
      const it = p.item, ms = it.duration ? (Number(it.duration.secs) || 0) * 1000 + Math.round((Number(it.duration.nanos) || 0) / 1e6) : null;
      if (it.type === 'UserMessage') {
        const t = (it.content || []).filter((b) => b?.type === 'text').map((b) => b.text || '').join('');
        if (t) userItems.push({ key: key('up'), ts, length: t.length, id: it.id || null });
      } else if (it.type === 'CommandExecution') {
        const kind = it.parsed_cmd?.[0]?.type;
        const tool = kind === 'read' ? 'Read' : kind === 'search' ? 'Grep' : kind === 'list_files' ? 'Glob' : 'Bash';
        out.steps.push({ key: key('tr'), ts, tool, ok: it.exit_code === 0 || (it.exit_code == null && it.status === 'completed'), ms });
      } else if (it.type === 'McpToolCall') {
        out.steps.push({ key: key('tr'), ts, tool: `mcp__${String(it.server || 'tool').replace(/[^\w-]/g, '_')}__${String(it.tool || 'call').replace(/[^\w-]/g, '_')}`, ok: !it.result?.isError && it.status !== 'failed', ms });
      } else if (it.type === 'FileChange') {
        out.steps.push({ key: key('tr'), ts, tool: 'Edit', ok: it.status !== 'failed', ms });
        let added = 0, removed = 0;
        for (const c of Object.values(it.changes || {})) {
          if (c?.unified_diff) for (const l of String(c.unified_diff).split('\n')) { if (l.startsWith('+') && !l.startsWith('+++')) added++; else if (l.startsWith('-') && !l.startsWith('---')) removed++; }
          else if (c?.content != null) { const k = String(c.content).split('\n').length; if (c.type === 'delete') removed += k; else added += k; }
        }
        if (added || removed) out.lines.push({ key: key('cl'), ts, added, removed });
      } else if (it.type === 'ContextCompaction') out.compactions.push({ key: key('cc'), ts });
    }
  }
  out.prompts = userItems.length ? userItems : userMsgs;
  const ps = out.prompts.filter((p) => p.id).sort((a, b) => a.ts - b.ts);
  for (const r of out.reqs) { let best = null; for (const p of ps) { if (p.ts > r.ts) break; best = p.id; } r.prompt_id = best; delete r.line; }
  return out;
}
