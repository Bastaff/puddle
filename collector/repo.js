// One name per repository, everywhere: "github.com/acme/web".
// git@github.com:Acme/Web.git, https://user:token@github.com/acme/web/ and ssh://git@github.com/acme/web
// all become the same key. Credentials never survive. null when it isn't a remote URL.
export function canonicalRepo(url) {
  if (!url) return null;
  const m = String(url).trim().match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  const parts = m[2].split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return `${m[1].toLowerCase()}/${parts.join('/').toLowerCase()}`;
}

// "github.com/acme/web" → { host: "github.com", owner: "acme", name: "web", group: "github.com/acme" }
export function repoParts(key) {
  if (!key) return null;
  const parts = key.split('/');
  if (parts.length < 3) return null;
  return { host: parts[0], owner: parts.slice(1, -1).join('/'), name: parts.at(-1), group: parts.slice(0, -1).join('/') };
}
