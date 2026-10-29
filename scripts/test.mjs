#!/usr/bin/env node
// npm test: the tests with a temp folder of their own, removed afterwards (a run leaves ~3 GB of databases and
// downloads behind otherwise, and a full disk fails tests in confusing ways). Arguments pass through to node --test.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joule-tests-'));
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('test').filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', f));
const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', ...files], { stdio: 'inherit', env: { ...process.env, TMPDIR: tmp } });
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(r.status ?? 1);
