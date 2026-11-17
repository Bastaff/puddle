import os from 'node:os';
import path from 'node:path';

export const BENCH = process.env.PUDDLE_BENCH || path.join(os.homedir(), '.puddle-bench');
export const COPY = path.join(BENCH, 'copy');
export const SEED = path.join(BENCH, 'seed');
export const RUN = path.join(BENCH, 'run');
export const RESULTS = path.join(BENCH, 'results');
