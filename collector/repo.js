export function canonicalRepo(url) {
  if (!url) return null;
  const m = String(url).trim().match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  const parts = m[2].split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return `${m[1].toLowerCase()}/${parts.join('/').toLowerCase()}`;
}

export function repoParts(key) {
  if (!key) return null;
  const parts = key.split('/');
  if (parts.length < 3) return null;
  return { host: parts[0], owner: parts.slice(1, -1).join('/'), name: parts.at(-1), group: parts.slice(0, -1).join('/') };
}
