import fs from 'node:fs';
import path from 'node:path';

export function puddleEnv(env) {
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('JOULE_')) continue;
    const name = 'PUDDLE_' + k.slice(6);
    if (env[name] === undefined) env[name] = v;
  }
  return env;
}
puddleEnv(process.env);

export const dataDir = (home, env = process.env) => {
  if (env.PUDDLE_DIR) return env.PUDDLE_DIR;
  const now = path.join(home, '.puddle'), before = path.join(home, '.joule');
  return fs.existsSync(now) || !fs.existsSync(before) ? now : before;
};

export const fromPuddle = (req) => (req.headers['x-puddle'] ?? req.headers['x-joule']) === '1';
export const prefetching = (req) => (req.headers['x-puddle-prefetch'] ?? req.headers['x-joule-prefetch']) === '1';
