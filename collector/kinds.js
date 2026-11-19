const RANK = ['push', 'commit', 'deploy', 'build', 'test'];
const RUNNERS = /^(npm|pnpm|yarn|bun|npx|bunx|deno|make|just|gradle|gradlew|mvn|go|dotnet|uv|poetry|hatch|tox|rake|bundle|mix)$/;
const TESTS = /^(pytest|jest|vitest|mocha|ava|tap|rspec|phpunit|playwright|cypress|ctest)$/;
const CLOUD = /^(gcloud|vercel|netlify|fly|flyctl|wrangler|heroku|firebase|kubectl|helm|terraform|pulumi|eas|fastlane|railway|render)$/;
const LEAD = /^(\w+=\S*\s+)+|^(nice|time|sudo|env|caffeinate|timeout|nohup)(\s+-\S+(\s+\d+)?)*\s+/;

function one(part) {
  let s = part.trim();
  for (let i = 0; i < 4 && LEAD.test(s); i++) s = s.replace(LEAD, '');
  const w = s.split(/\s+/), a = (w[0] || '').split('/').pop(), rest = w.slice(1).filter((x) => !x.startsWith('-'));
  const b = rest[0] || '', c = rest[1] || '';
  if (a === 'git') return b === 'commit' ? 'commit' : b === 'push' ? 'push' : null;
  if (a === 'gh') return b === 'pr' && c === 'create' ? 'push' : b === 'release' ? 'deploy' : null;
  if (TESTS.test(a)) return 'test';
  if (a === 'xcodebuild') return /\btest\b/.test(s) ? 'test' : 'build';
  if (a === 'swift' || a === 'cargo') return b === 'test' ? 'test' : b === 'build' ? 'build' : null;
  if (a === 'docker') return b === 'build' ? 'build' : b === 'push' ? 'deploy' : null;
  if (CLOUD.test(a)) return /\b(deploy|publish|apply|release|submit|push|up)\b/.test(s) || a === 'vercel' ? 'deploy' : null;
  if (RUNNERS.test(a) || a === 'node' || a === 'python' || a === 'python3') {
    const words = [b, c].join(' ');
    if (/\btest/.test(words) || /(^|[/.])test/.test(b)) return 'test';
    if (/\bbuild\b/.test(words)) return 'build';
    if (/\b(deploy|publish|release)\b/.test(words)) return 'deploy';
  }
  return null;
}

export function commandKind(cmd) {
  if (Array.isArray(cmd) && /(^|\/)(ba|z)?sh$/.test(cmd[0] || '') && /^-l?c$/.test(cmd[1] || '')) return commandKind(cmd.slice(2).join(' '));
  const text = Array.isArray(cmd) ? cmd.join(' ') : typeof cmd === 'string' ? cmd : '';
  if (!text) return null;
  const inner = /^\s*(?:\/\S*\/)?(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1\s*$/.exec(text);
  if (inner) return commandKind(inner[2]);
  const found = text.split(/&&|\|\||;|\n|\|/).map(one).filter(Boolean);
  return RANK.find((k) => found.includes(k)) || 'other';
}

const EXT = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'md', 'mdx', 'html', 'css', 'scss', 'swift', 'kt', 'java', 'rs', 'go', 'py', 'rb', 'php', 'c', 'h', 'cpp', 'cs', 'sh', 'sql', 'json', 'yaml', 'yml', 'toml', 'vue', 'svelte', 'dart', 'lua', 'ex', 'zig']);

export function fileExt(file) {
  if (typeof file !== 'string' || !file) return null;
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(file.split(/[\\/]/).pop());
  const e = m && m[1].toLowerCase();
  return e && EXT.has(e) ? e : 'other';
}
