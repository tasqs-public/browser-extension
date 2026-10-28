// src/omnibox.js — the address-bar keyword's suggestion text, as pure functions.
//
// Type `tq`, a space, then the task. The default suggestion row previews the
// parse from hint.js ("Call dentist · Tomorrow · High · #errands · Work") so
// the syntax is discoverable before Enter. Chrome renders the description as
// a strict XML fragment with three tags — <match>, <dim>, <url> — and REJECTS
// an unescaped & < > " ', so everything user-typed goes through escapeXml.
//
// No chrome.* here: background.js wires these to chrome.omnibox; tests run
// them in node.

import { parseHint } from './hint.js';

export const OMNIBOX_KEYWORD = 'tq';
export const OMNIBOX_EXAMPLE = 'call dentist tomorrow #errands @Personal !high';

export function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

/** The title with the explicit markers (!prio, #tag, @list) removed; date words stay (the server decides). */
export function cleanTitle(text) {
  return String(text)
    .replace(/(^|\s)(![\w!]+|#[\w-]+|@[\w-]+)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The dim trailer: what the preview understood, in display order. */
export function describeParse(h) {
  const parts = [];
  if (h.date)       parts.push(h.date.label);
  if (h.priority)   parts.push(h.priority === 'high' ? 'High' : 'Low');
  for (const t of h.tags) parts.push('#' + t);
  if (h.list)       parts.push(h.list.name);
  if (h.recurrence) parts.push('Repeats ' + h.recurrence);
  return parts;
}

/**
 * The default-suggestion description for the typed text.
 *   signedIn=false → one line pointing at sign-in (Enter opens the settings page)
 *   empty text     → the hint with an example
 *   otherwise      → "Add to Tasqs: <match>title</match> <dim>· a · b · c</dim>"
 */
export function describeCapture(text, lists = [], { signedIn = true, now = new Date() } = {}) {
  if (!signedIn) return 'Sign in to Tasqs to add tasks from here <dim>· press Enter to open settings</dim>';
  const raw = String(text || '').trim();
  if (!raw) return 'Add to Tasqs: type a task and press Enter <dim>· e.g. ' + escapeXml(OMNIBOX_EXAMPLE) + '</dim>';
  const h = parseHint(raw, lists, now);
  const title = cleanTitle(raw) || raw;
  const parts = describeParse(h);
  return 'Add to Tasqs: <match>' + escapeXml(title.slice(0, 120)) + '</match>'
       + (parts.length ? ' <dim>· ' + escapeXml(parts.join(' · ')) + '</dim>' : '');
}
