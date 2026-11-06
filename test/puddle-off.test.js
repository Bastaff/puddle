import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../plugin/bin/puddle', import.meta.url));
const run = (home, cmd, extra = {}) => execFileSync('sh', [BIN, cmd], { env: { PATH: process.env.PATH, HOME: home, PUDDLE_DIR: path.join(home, '.puddle'), ...extra }, encoding: 'utf8' });
const setup = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-off-'));
  fs.mkdirSync(path.join(home, '.claude')); fs.mkdirSync(path.join(home, '.codex'));
  fs.writeFileSync(path.join(home, '.claude/settings.json'), '{\n  "model": "opus",\n  "statusLine": { "type": "command", "command": "echo mine" }\n}\n');
  fs.writeFileSync(path.join(home, '.codex/config.toml'), 'model = "gpt-5"\n');
  return home;
};
const files = (home) => [fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'), fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8')];

test('connect, then off: both files byte for byte as before (your own status line back)', () => {
  const home = setup(), before = files(home);
  try {
    run(home, 'connect', { PUDDLE_TOKEN: 'jl_test', PUDDLE_URL: 'http://127.0.0.1:9' });
    const [claude, codex] = files(home);
    assert.match(claude, /"PUDDLE"/); assert.match(codex, /# >>> puddle/);
    run(home, 'off');
    assert.deepEqual(files(home), before);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('off on a Mac that never connected changes nothing, not even the spacing', () => {
  const home = setup(), before = files(home);
  try { run(home, 'off'); assert.deepEqual(files(home), before); } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
