// test/run.mjs — the pure parts: the hint parser, the omnibox suggestion text,
// the badge arithmetic, the manifest's shape, and api.js' refresh-on-401 with
// a stubbed chrome.* and a mocked fetch (no network).
//   node test/run.mjs
import { parseHint, hintDate, hintPriority, hintTags, hintList, hintRecurrence } from '../src/hint.js';
import { describeCapture, cleanTitle, escapeXml, OMNIBOX_KEYWORD } from '../src/omnibox.js';
import { badgeValue, badgeText, BADGE_SOURCES } from '../src/badge.js';
import { readFileSync } from 'node:fs';

let fail = 0;
const ok = (c, label) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + label); if (!c) fail++; };

// A fixed "now": Wednesday 2026-10-28, 15:00 local.
const now = new Date(2026, 9, 28, 15, 0, 0);
const lists = [{ id: 1, name: 'Work', color: '#2E90FA' }, { id: 2, name: 'Personal', color: '#12B76A' }, { id: 3, name: 'Groceries', color: '#84CC16' }];

// ── dates ──
ok(hintDate('call dentist tomorrow', now)?.iso === '2026-10-29' && hintDate('call dentist tomorrow', now).label === 'Tomorrow', 'tomorrow');
ok(hintDate('pay rent today', now)?.label === 'Today', 'today');
ok(hintDate('finish report tonight', now)?.label === 'Today', 'tonight = today');
ok(hintDate('submit by friday', now)?.iso === '2026-10-30' && hintDate('submit by friday', now).label === 'Fri', 'friday → this coming Friday, short label within a week');
ok(hintDate('submit by wednesday', now)?.iso === '2026-11-04', 'same weekday → next week, not today');
ok(hintDate('call next friday', now)?.iso === '2026-11-06', 'next friday = the one after this coming one');
ok(hintDate('do it in 3 days', now)?.iso === '2026-10-31', 'in N days');
ok(hintDate('do it in 2 weeks', now)?.iso === '2026-11-11', 'in N weeks');
ok(hintDate('due 2026-12-01', now)?.iso === '2026-12-01', 'ISO date');
ok(hintDate('dentist on nov 3', now)?.iso === '2026-11-03' && hintDate('dentist on nov 3', now).label === 'Tue', 'month-day within a week → weekday label');
ok(hintDate('dentist on nov 10', now)?.label === 'Tue Nov 10', 'month-day beyond a week → long label');
ok(hintDate('party jan 2', now)?.iso === '2027-01-02', 'month-day in the past → next year');
ok(hintDate('buy milk', now) === null, 'no date → null');
ok(hintDate('read Monday Morning Blues the novel', now)?.iso === '2026-11-02', 'a weekday word is still a hint (server decides)');

// ── priority ──
ok(hintPriority('fix prod !high') === 'high', '!high');
ok(hintPriority('fix prod !!') === 'high', '!!');
ok(hintPriority('urgent: call bank') === 'high', 'urgent');
ok(hintPriority('read book !low') === 'low', '!low');
ok(hintPriority('clean garage someday') === 'low', 'someday');
ok(hintPriority('email john') === null, 'default → null (medium)');
ok(hintPriority('reply to a!high') === null, 'marker must be a separate token');

// ── tags ──
ok(JSON.stringify(hintTags('read #research #Research #new paper')) === '["research","new"]', 'tags deduped case-insensitively, first spelling kept');
ok(hintTags('issue#42 is not a tag').length === 0, 'inline # is not a tag');
ok(hintTags('').length === 0, 'empty');

// ── list ──
ok(hintList('buy milk @groceries', lists)?.name === 'Groceries', '@list exact, case-insensitive');
ok(hintList('buy milk @groc', lists)?.name === 'Groceries', '@list prefix');
ok(hintList('buy milk @nope', lists) === null, 'unknown @list → null');
ok(hintList('email me@work.com', lists) === null, 'an email address is not a @list');

// ── recurrence ──
ok(hintRecurrence('water plants every week') === 'weekly', 'every week');
ok(hintRecurrence('standup daily') === 'daily', 'daily');
ok(hintRecurrence('invoice every other week') === 'biweekly', 'every other week');
ok(hintRecurrence('rent monthly') === 'monthly', 'monthly');
ok(hintRecurrence('renew domain annually') === 'yearly', 'annually');
ok(hintRecurrence('one-off') === null, 'none');

// ── whole preview ──
const h = parseHint('Compare Acme pricing by Thursday !high #research @Work', lists, now);
ok(h.date?.iso === '2026-10-29' && h.priority === 'high' && h.tags[0] === 'research' && h.list?.name === 'Work' && h.recurrence === null, 'full line → date, priority, tag, list');

// ── omnibox suggestion text ──
ok(escapeXml(`a & b < c > "d" 'e'`) === 'a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;', 'escapeXml covers the five');
ok(cleanTitle('Call dentist tomorrow !high #errands @Personal') === 'Call dentist tomorrow', 'cleanTitle strips markers, keeps date words');
ok(cleanTitle('reply to a!high and issue#42') === 'reply to a!high and issue#42', 'cleanTitle leaves inline (non-token) markers alone');
ok(cleanTitle('!! fix prod') === 'fix prod', 'cleanTitle strips a leading !!');
const d1 = describeCapture('Call dentist tomorrow !high #errands @Personal', lists, { now });
ok(d1 === 'Add to Tasqs: <match>Call dentist tomorrow</match> <dim>· Tomorrow · High · #errands · Personal</dim>', 'full line → match title + dim trailer: ' + d1);
ok(describeCapture('buy milk', lists, { now }) === 'Add to Tasqs: <match>buy milk</match>', 'nothing parsed → no dim trailer');
ok(describeCapture('   ', lists, { now }).startsWith('Add to Tasqs: type a task') && describeCapture('', lists, { now }).includes('<dim>'), 'empty → the example hint');
ok(describeCapture('x', lists, { signedIn: false }).startsWith('Sign in to Tasqs'), 'signed out → sign-in line');
const d2 = describeCapture('R&D review <q> "soon" @Work', lists, { now });
ok(d2.includes('R&amp;D review &lt;q&gt; &quot;soon&quot;') && !/[^&]&[^a]/.test(d2.replace(/&(amp|lt|gt|quot|apos);/g, '')), 'user text is XML-escaped inside <match>');
ok(describeCapture('water plants every week !low', lists, { now }).endsWith('<dim>· Low · Repeats weekly</dim>'), 'priority + recurrence order');
ok(describeCapture('x'.repeat(300), lists, { now }).length < 200, 'long titles are clipped');
ok(OMNIBOX_KEYWORD === 'tq', 'keyword tq');

// ── badge ──
const sum = { due_today: 3, overdue: 1, shortlist_remaining: 2 };
ok(badgeValue(sum, 'due_today') === 3 && badgeValue(sum, 'shortlist') === 2 && badgeValue(sum, 'off') === 0, 'badge value follows the source');
ok(badgeValue(null, 'due_today') === 0 && badgeValue({ due_today: -2 }, 'due_today') === 0 && badgeValue({ due_today: 'x' }, 'due_today') === 0, 'badge value is never negative or NaN');
ok(badgeText(0) === '' && badgeText(7) === '7' && badgeText(99) === '99' && badgeText(140) === '99+', 'badge text: blank at zero, 99+ cap');
ok(Object.keys(BADGE_SOURCES).join(',') === 'due_today,shortlist,off', 'three badge sources');

// ── manifest sanity ──
const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
ok(m.manifest_version === 3, 'MV3');
ok(typeof m.key === 'string' && m.key.length > 100, 'manifest key pinned (stable dev id)');
ok(!m.permissions.includes('tabs') && !(m.host_permissions || []).some((h) => h.includes('<all_urls>')), 'no tabs permission, no <all_urls>');
ok(JSON.stringify(m.permissions.slice().sort()) === JSON.stringify(['activeTab', 'alarms', 'contextMenus', 'identity', 'omnibox', 'scripting', 'storage']), 'exact permission set (+alarms, omnibox)');
ok(m.omnibox && m.omnibox.keyword === OMNIBOX_KEYWORD, 'manifest omnibox keyword matches omnibox.js');
ok(m.commands._execute_action.suggested_key.default === 'Alt+Shift+T', 'shortcut Alt+Shift+T (not the Ctrl+Shift+T reopen-tab family)');
ok(!m.content_scripts, 'no persistent content script');
ok(m.description.length <= 132, 'manifest description within the store\'s 132 chars');

// ── api.js: 401 → one refresh (single-flight) → retry once; invalid_grant → signed out ──
{
  const mem = { auth: { access_token: 'old', refresh_token: 'r1', expires_at: Date.now() + 3600e3, scope: 'tasks:capture tasks:summary' } };
  const badge = { text: null, color: null };
  globalThis.chrome = {
    storage: { local: {
      get: async (k) => (k in mem ? { [k]: mem[k] } : {}),
      set: async (o) => Object.assign(mem, o),
      remove: async (keys) => (Array.isArray(keys) ? keys : [keys]).forEach((x) => delete mem[x]),
    } },
    action: { setBadgeText: async ({ text }) => { badge.text = text; }, setBadgeBackgroundColor: async ({ color }) => { badge.color = color; }, setBadgeTextColor: async () => {}, setTitle: async () => {} },
    identity: { getRedirectURL: () => 'https://abc.chromiumapp.org/' },
  };
  const calls = [];
  let refreshes = 0; let grantDead = false;
  globalThis.fetch = async (url, opts) => {
    const u = String(url); calls.push(u.replace(/^https:\/\/tasqs\.com/, ''));
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/oauth/token')) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 20));   // slow enough that concurrent 401s overlap
      if (grantDead) return json(400, { error: 'invalid_grant' });
      return json(200, { access_token: 'new' + refreshes, refresh_token: 'r' + (refreshes + 1), expires_in: 3600, token_type: 'Bearer' });
    }
    const tok = (opts.headers.Authorization || '').replace('Bearer ', '');
    if (tok === 'old') return json(401, { error: { code: 'invalid_token', message: 'expired' } });
    if (u.endsWith('/v1/me/summary')) return json(200, { date: '2026-10-28', user: { name: 'Tim' }, due_today: 4, overdue: 0, shortlist_remaining: 1, lists: [] });
    if (u.endsWith('/v1/capture')) return json(201, { task: { id: 'a'.repeat(32), title: JSON.parse(opts.body).text }, parsed: {}, fallback: false });
    return json(404, { error: { code: 'not_found', message: 'nope' } });
  };
  const api = await import('../src/api.js');
  const [s, c] = await Promise.all([api.summary(), api.capture({ text: 'hello' })]);
  ok(s.due_today === 4 && c.task.title === 'hello', 'both calls succeed after the 401');
  ok(refreshes === 1, 'two concurrent 401s → ONE refresh (single-flight), got ' + refreshes);
  ok(mem.auth.access_token === 'new1' && mem.auth.refresh_token === 'r2', 'rotated tokens stored');
  ok(badge.text === '4' && badge.color === '#FFD60A', 'summary() painted the badge (4, yellow)');
  ok(mem.auth.user && mem.auth.user.name === 'Tim', 'summary() stored the user');
  ok(calls.filter((x) => x === '/v1/capture').length === 2, 'capture retried exactly once');

  // Dead grant: the refresh answers invalid_grant → signed out, no retry loop.
  mem.auth.access_token = 'old'; grantDead = true; calls.length = 0;
  let err = null;
  try { await api.capture({ text: 'again' }); } catch (e) { err = e; }
  ok(err instanceof api.ApiError && err.code === 'signed_out', 'invalid_grant on refresh → signed_out error');
  ok(!mem.auth, 'invalid_grant → local tokens cleared');
  ok(calls.filter((x) => x === '/v1/capture').length === 1 && calls.filter((x) => x === '/oauth/token').length === 1, 'no retry after a dead grant, no refresh loop');
  // Signed out: no network at all.
  calls.length = 0; err = null;
  try { await api.capture({ text: 'x' }); } catch (e) { err = e; }
  ok(err && err.code === 'signed_out' && calls.length === 0, 'signed out → signed_out without a request');
}

console.log('\n' + (fail ? fail + ' FAILED' : 'all passed'));
process.exit(fail ? 1 : 0);
