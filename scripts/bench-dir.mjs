import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BESIDE = path.join(ROOT, '..', 'bench');
export const BENCH = process.env.PUDDLE_BENCH || (path.basename(ROOT) === 'code' && fs.existsSync(BESIDE) ? BESIDE : path.join(os.homedir(), '.puddle-bench'));
export const COPY = path.join(BENCH, 'copy');
export const SEED = path.join(BENCH, 'seed');
export const RUN = path.join(BENCH, 'run');
export const RESULTS = path.join(BENCH, 'results');
