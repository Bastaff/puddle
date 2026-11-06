const PRICES = [
  ['claude-fable-5-1', 10, 50, 0.25],
  ['claude-fable-5', 10, 50, 0.25],
  ['claude-mythos-5', 10, 50, 0.25],
  ['claude-opus-5-5', 4, 20, 0.2],
  ['claude-opus-5', 5, 25, 0.5],
  ['claude-opus-4-8', 5, 25, 0.5],
  ['claude-opus-4-7', 5, 25, 0.5],
  ['claude-opus-4-6', 5, 25, 0.5],
  ['claude-sonnet-5-5', 2, 10, 0.2],
  ['claude-sonnet-5', 2, 10, 0.2],
  ['claude-sonnet-4-6', 3, 15, 0.3],
  ['claude-haiku-5-5', 0.1, 0.5, 0.01],
  ['claude-haiku-4-5', 1, 5, 0.1],
  ['gpt-6.1-sol', 2, 10, 0.1],
  ['gpt-6-astra', 10, 50, 1],
  ['gpt-6-sol', 2, 10, 0.2],
  ['gpt-6-luna', 0.1, 0.5, 0.01],
  ['gpt-5.6-cyber', 12.5, 75, 1.25],
  ['gpt-5.6-sol', 4, 20, 0.4],
  ['gpt-5.6-terra', 2, 12, 0.2],
  ['gpt-5.6-luna', 0.2, 1.2, 0.02],
  ['gpt-5.5-cyber', 12.5, 75, 1.25],
  ['gpt-5.5-pro', 30, 180, 30],
  ['gpt-5.5', 5, 30, 0.5],
  ['gpt-5.4-pro', 30, 180, 30],
  ['gpt-5.4-mini', 0.75, 4.5, 0.075],
  ['gpt-5.4-nano', 0.2, 1.25, 0.02],
  ['gpt-5.4', 2.5, 15, 0.25],
  ['gpt-5.3-codex', 1.75, 14, 0.175],
  ['gpt-5-mini', 0.25, 2, 0.025],
  ['gpt-5', 1.25, 10, 0.125],
  ['o4-mini', 1.1, 4.4, 0.275],
  ['o3', 2, 8, 0.5],
];

const OPENAI_LONG = { over: 272_000, input: 2, output: 1.5 };
const LONG_PROMPT = { 'claude-haiku-5-5': { over: 100_000, input: 5, output: 5 },
  ...Object.fromEntries(['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-pro'].map((m) => [m, OPENAI_LONG])) };

export function priceFor(model) {
  const id = String(model || '').toLowerCase().replace(/\[.*\]$/, '');
  return PRICES.find(([p]) => id === p || id.startsWith(p + '-') || id.startsWith(p + '@')) || null;
}

export function estimateCost(model, usage) {
  const p = priceFor(model);
  if (!p || !usage) return null;
  let [name, input, output, read] = p;
  const cw = usage.cache_creation || {};
  const w1h = cw.ephemeral_1h_input_tokens ?? 0;
  const w5m = cw.ephemeral_5m_input_tokens ?? Math.max(0, (usage.cache_creation_input_tokens || 0) - w1h);
  const promptTokens = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const long = LONG_PROMPT[name];
  if (long && promptTokens > long.over) { input *= long.input; read *= long.input; output *= long.output; }
  const factor = usage.speed === 'fast' ? 2 : 1;
  const cost =
    (usage.input_tokens || 0) * input +
    (usage.output_tokens || 0) * output +
    (usage.cache_read_input_tokens || 0) * read +
    w5m * input * 1.25 +
    w1h * input * 2;
  return (cost * factor) / 1e6;
}

export function contextWindow(model) {
  const id = String(model || '').toLowerCase();
  if (/haiku-4-5|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0|3-/.test(id) && !id.includes('[1m]')) return 200_000;
  if (/^(gpt|o\d|codex)/.test(id)) return 258_400;
  return 1_000_000;
}
