import { fromPuddle } from '../collector/env.js';
import fs from 'node:fs';
import path from 'node:path';

const MODES = ['auto', 'light', 'dark'];
export const readTheme = (dir) => { try { const t = fs.readFileSync(path.join(dir, 'theme'), 'utf8').trim(); return MODES.includes(t) ? t : 'auto'; } catch { return 'auto'; } };
export function writeTheme(dir, t) {
  if (!MODES.includes(t)) return false;
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'theme'), t); return true; } catch { return false; }
}
export async function themeRoute(req, res, dir, json) {
  if (req.method !== 'POST') return json(res, 200, { theme: readTheme(dir) });
  if (!fromPuddle(req) || (req.headers.origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin))) return json(res, 403, { error: 'forbidden' });
  let b = ''; for await (const c of req) { b += c; if (b.length > 1000) break; }
  let t = null; try { t = JSON.parse(b || '{}').theme; } catch {}
  return writeTheme(dir, t) ? json(res, 200, { theme: t }) : json(res, 400, { error: 'auto, light or dark' });
}
