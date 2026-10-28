// test/run.mjs — the pure parts: the hint parser and the manifest's shape.
//   node test/run.mjs
import { parseHint, hintDate, hintPriority, hintTags, hintList, hintRecurrence } from '../src/hint.js';
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

// ── manifest sanity ──
const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
ok(m.manifest_version === 3, 'MV3');
ok(typeof m.key === 'string' && m.key.length > 100, 'manifest key pinned (stable dev id)');
ok(!m.permissions.includes('tabs') && !(m.host_permissions || []).some((h) => h.includes('<all_urls>')), 'no tabs permission, no <all_urls>');
ok(JSON.stringify(m.permissions.slice().sort()) === JSON.stringify(['activeTab', 'contextMenus', 'identity', 'scripting', 'storage']), 'exact permission set');
ok(m.commands._execute_action.suggested_key.default === 'Alt+Shift+T', 'shortcut Alt+Shift+T (not the Ctrl+Shift+T reopen-tab family)');
ok(!m.content_scripts, 'no persistent content script');

console.log('\n' + (fail ? fail + ' FAILED' : 'all passed'));
process.exit(fail ? 1 : 0);
