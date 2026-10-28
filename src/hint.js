// src/hint.js — a cheap client-side PREVIEW of what Smart Capture will parse.
//
// Pure, regex-only, zero network: runs on every keystroke in the popup so the
// chips appear as you type. It is NOT authoritative — the server's parse (an
// AI call with the user's real lists and tags) decides, and the saved state
// shows what the server understood. The preview's job is to make the syntax
// discoverable, so it is deliberately conservative: when unsure, no chip.
//
// Exported for tests (node). No DOM, no chrome.*.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS   = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function labelFor(d, now) {
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return SHORT[d.getDay()];
  return SHORT[d.getDay()] + ' ' + MONTHS[d.getMonth()].replace(/^./, (c) => c.toUpperCase()) + ' ' + d.getDate();
}

/** The due date the text implies, or null. Returns {label, iso}. */
export function hintDate(text, now = new Date()) {
  const t = ' ' + text.toLowerCase() + ' ';
  let d = null;
  let m;
  if (/\b(today|tonight)\b/.test(t)) d = now;
  else if (/\btomorrow\b/.test(t)) d = addDays(now, 1);
  else if ((m = t.match(/\bin (\d{1,2}) (day|days|week|weeks)\b/))) d = addDays(now, Number(m[1]) * (m[2].startsWith('week') ? 7 : 1));
  else if ((m = t.match(/\b(next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/))) {
    const name = m[2];
    const idx = WEEKDAYS.findIndex((w) => w.startsWith(name.slice(0, 3)));
    let delta = (idx - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;                  // "Friday" on a Friday = next Friday
    if (m[1]) delta += delta < 7 ? 7 : 0;        // "next Friday" = the one after this coming one
    d = addDays(now, delta);
  }
  else if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  else if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* (\d{1,2})\b/))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    d = new Date(now.getFullYear(), mi, Number(m[2]));
    if (d < addDays(now, -1)) d = new Date(now.getFullYear() + 1, mi, Number(m[2]));   // past → next year
  }
  if (!d || isNaN(d)) return null;
  return { label: labelFor(d, now), iso: iso(d) };
}

/** 'high' | 'low' | null — only on explicit markers or unambiguous words. */
export function hintPriority(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  if (/(^|\s)(!high|!!+|!h)(\s|$)/.test(t) || /\b(urgent|asap|important|critical)\b/.test(t)) return 'high';
  if (/(^|\s)(!low|!l)(\s|$)/.test(t) || /\b(whenever|someday|low priority|no rush)\b/.test(t)) return 'low';
  return null;
}

/** #tags, deduped, without the hash. */
export function hintTags(text) {
  const seen = new Set(); const out = [];
  for (const m of text.matchAll(/(^|\s)#([\w-]{1,50})/g)) {
    const k = m[2].toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(m[2]); }
  }
  return out;
}

/** @List matched against the user's lists (case-insensitive, prefix OK); the list object or null. */
export function hintList(text, lists = []) {
  const m = text.match(/(^|\s)@([\w-]{1,60})/);
  if (!m) return null;
  const want = m[2].toLowerCase();
  return lists.find((l) => l.name.toLowerCase() === want)
      || lists.find((l) => l.name.toLowerCase().startsWith(want))
      || null;
}

export function hintRecurrence(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  if (/\b(every day|daily)\b/.test(t)) return 'daily';
  if (/\b(every (other|two|2) weeks?|biweekly|fortnightly)\b/.test(t)) return 'biweekly';
  if (/\b(every week|weekly)\b/.test(t)) return 'weekly';
  if (/\b(every month|monthly)\b/.test(t)) return 'monthly';
  if (/\b(every year|yearly|annually)\b/.test(t)) return 'yearly';
  return null;
}

/** The whole preview. */
export function parseHint(text, lists = [], now = new Date()) {
  return {
    date:       hintDate(text, now),
    priority:   hintPriority(text),
    tags:       hintTags(text),
    list:       hintList(text, lists),
    recurrence: hintRecurrence(text),
  };
}
