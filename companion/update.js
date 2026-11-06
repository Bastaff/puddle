import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));

export const currentVersion = () => { try { return fs.readFileSync(path.join(HERE, 'VERSION'), 'utf8').trim() || null; } catch { return null; } };
export const currentBuilt = () => { try { return Number(fs.readFileSync(path.join(HERE, 'BUILT'), 'utf8').trim()) || null; } catch { return null; } };
export const appBundle = (execPath = process.execPath) => {
  const m = execPath.match(/^(.*\.app)\/Contents\/MacOS\/[^/]+$/);
  return m && !m[1].includes('/AppTranslocation/') ? m[1] : null;
};

export const TEAM = 'QTZU933VL4';
export const TEAM_REQUIREMENT = `=anchor apple generic and certificate leaf[subject.OU] = "${TEAM}"`;
export const signedByTeam = (app) => run('/usr/bin/codesign', ['--verify', '-R', TEAM_REQUIREMENT, app]).then(() => true, () => false);

export const placeFor = (bundle, fresh) => path.join(path.dirname(bundle), path.basename(fresh));

export const AUTO_AFTER = 24 * 3600_000;
export function makeUpdater({ serviceUrl, log = () => {}, fetchImpl = fetch, current = currentVersion(), built = currentBuilt(), bundle = appBundle(), dir = null, now = () => Date.now() }) {
  const state = { current, latest: null, available: false, status: 'idle', error: null, checked: null, since: null, staged: false, autoDue: false };
  const seenFile = dir ? path.join(dir, 'update.json') : null;
  const seen = () => { try { return JSON.parse(fs.readFileSync(seenFile, 'utf8')); } catch { return {}; } };
  let staged = null;
  try {
    for (const n of fs.readdirSync(os.tmpdir())) {
      if (!n.startsWith('puddle-update-') && !n.startsWith('joule-update-')) continue;
      const p = path.join(os.tmpdir(), n);
      if (now() - fs.statSync(p).mtimeMs > 10 * 60_000) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
  async function check() {
    const base = serviceUrl();
    if (!base || !current) return state;
    try {
      const r = await fetchImpl(`${base}/api/app/latest`, { signal: AbortSignal.timeout(15_000) });
      const d = await r.json();
      state.latest = d.version || null;
      state.available = Boolean(d.version && d.version !== current && (built ? Number(d.built) > built : true));
      state.checked = Date.now();
      if (state.available && seenFile) {
        const sv = seen();
        if (sv.version !== d.version) { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(seenFile, JSON.stringify({ version: d.version, since: now() })); } catch {} }
        state.since = sv.version === d.version ? sv.since : now();
      }
      state.autoDue = Boolean(state.available && state.since && now() - state.since >= AUTO_AFTER);
      if (state.available && bundle && !staged && state.status === 'idle') stage().catch((e) => log(`update download: ${e.message}`));
    } catch (e) { log(`update check: ${e.message}`); }
    return state;
  }
  async function install() {
    if (!state.available || state.status === 'installing') return state;
    if (!bundle) { state.error = 'This copy of Puddle can\'t update itself. Download the new one from the Get Puddle page.'; return state; }
    state.status = 'installing'; state.error = null;
    let work = null;
    try {
      const st = staged?.version === state.latest && fs.existsSync(staged.app) ? staged : await stage();
      work = st.work;
      const fresh = st.app, v = st.version, place = placeFor(bundle, fresh);
      const old = path.join(work, 'old.app');
      fs.renameSync(bundle, old);
      if (place !== bundle && fs.existsSync(place)) fs.renameSync(place, path.join(work, 'other.app'));
      try { await run('/usr/bin/ditto', [fresh, place]); } catch (e) { fs.rmSync(place, { recursive: true, force: true }); fs.renameSync(old, bundle); throw e; }
      log(`updated ${current} → ${v}; restarting`);
      state.status = 'restarting';
      spawn('/bin/sh', ['-c', `sleep 2; /usr/bin/open "${place.replace(/"/g, '\\"')}"`], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => { try { process.kill(process.ppid, 'SIGTERM'); } catch {} process.exit(0); }, 300);
    } catch (e) {
      state.status = 'idle'; state.error = `Update failed: ${e.message}`; log(state.error);
      if (work) fs.rmSync(work, { recursive: true, force: true });
      staged = null; state.staged = false;
    }
    return state;
  }
  async function stage() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'puddle-update-'));
    try {
      const r = await fetchImpl(`${serviceUrl()}/download/mac`, { signal: AbortSignal.timeout(10 * 60_000) });
      if (!r.ok) throw new Error(`download failed (${r.status})`);
      const zip = path.join(work, 'download.zip');
      fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
      await run('/usr/bin/ditto', ['-x', '-k', zip, work]);
      const apps = fs.readdirSync(work).filter((f) => f.endsWith('.app'));
      if (apps.length !== 1) throw new Error(`expected one app in the download, found ${apps.length}`);
      const app = path.join(work, apps[0]);
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
      if (bundle && (await signedByTeam(bundle)) && !(await signedByTeam(app))) throw new Error('the download isn\'t signed by Puddle\'s developer: not installed');
      const version = fs.readFileSync(path.join(app, 'Contents/Resources/app/companion/VERSION'), 'utf8').trim();
      if (version !== state.latest) throw new Error(`downloaded version ${version}, expected ${state.latest}`);
      if (staged?.work && staged.work !== work) fs.rmSync(staged.work, { recursive: true, force: true });
      staged = { version, app, work }; state.staged = true;
      return staged;
    } catch (e) { fs.rmSync(work, { recursive: true, force: true }); throw e; }
  }
  return { state, check, install, stage };
}
