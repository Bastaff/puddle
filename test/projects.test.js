import test from 'node:test';
import assert from 'node:assert/strict';
import { topConversations } from '../collector/queries.js';
import { workFromScan } from '../companion/server.js';

test('a project keeps its top 8 conversations and totals the rest', () => {
  const list = Array.from({ length: 11 }, (_, i) => ({ title: `c${i}`, minutes: i + 1 }));
  const { conversations, more } = topConversations(list);
  assert.deepEqual(conversations.map((c) => c.title), ['c10', 'c9', 'c8', 'c7', 'c6', 'c5', 'c4', 'c3']);
  assert.deepEqual(more, { count: 3, minutes: 1 + 2 + 3 });
  assert.equal(topConversations(list.slice(0, 2)).more, null, 'nothing hidden, no "other" row');
});

test('this Mac: projects from the scan, each conversation with its own time', () => {
  const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const now = Date.now(), today = day(now);
  const sessions = Array.from({ length: 10 }, (_, i) => ({ repo: 'github.com/a/web', title: `t${i}`, byDay: { [today]: 10 + i }, end: now }));
  sessions.push({ folder: 'notes', title: null, byDay: { [today]: 5 }, end: now }, { folder: 'old', byDay: { '2000-01-01': 50 } });
  const work = workFromScan({ sessions }, now - 864e5);
  assert.deepEqual(work.map((x) => x.name), ['github.com/a/web', 'notes'], 'days before the range don\'t count');
  assert.equal(work[0].conversations.length, 8);
  assert.deepEqual(work[0].more, { count: 2, minutes: 10 + 11 });
  assert.equal(work[0].minutes, work[0].conversations.reduce((a, c) => a + c.minutes, 0) + work[0].more.minutes, 'bars add up to the project');
});

test('latest conversations: a repo by its own name (the full path on hover), the title or the day, a link to it, See all', async () => {
  const fs = await import('node:fs'), vm = await import('node:vm');
  const ctx = {}; vm.runInNewContext(fs.readFileSync(new URL('../collector/public/projects.js', import.meta.url), 'utf8'), ctx);
  const rows = [
    { user_key: 'u1', session_id: 's1', title: 'Fix login', project: 'gitlab.com/production3002117/green-point-web-app', last: Date.parse('2026-10-20T10:00:00Z'), minutes: 18 },
    { user_key: 'u2', session_id: 's2', title: null, project: 'GreenPoint', last: Date.parse('2026-10-19T10:00:00Z'), minutes: 6 },
  ];
  const html = ctx.recentHTML(rows, { time: (m) => `${m}m`, ago: () => '1h', nameOf: (u) => ({ u1: 'Ana', u2: 'Boris' })[u], href: (c) => `/project?p=${c.project}&c=${c.session_id}`, seeAll: '/work?range=7d' });
  const shown = [...html.matchAll(/class="rc" href="([^"]*)" title="([^"]*)">.*?<b>([^<]*)<\/b><small>([^<]*)<\/small>/g)].map((m) => m.slice(1))
    .map(([a, b, t, c]) => [a, b, t.startsWith('Conversation on ') ? 'Conversation on <day>' : t, c]);
  assert.deepEqual(shown, [
    ['/project?p=gitlab.com/production3002117/green-point-web-app&amp;c=s1', 'gitlab.com/production3002117/green-point-web-app', 'Fix login', 'Ana · green-point-web-app'],
    ['/project?p=GreenPoint&amp;c=s2', 'GreenPoint', 'Conversation on <day>', 'Boris · GreenPoint'],
  ], 'short names, the full path on hover, the day when untitled, each opens its conversation');
  assert.match(html, /class="rc-all" href="\/work\?range=7d"/, 'See all');
  assert.doesNotMatch(ctx.recentHTML(rows, { time: String, ago: String }), /rc-all|<a /, 'no links where there is nowhere to go (Puddle\'s own Me)');
});
