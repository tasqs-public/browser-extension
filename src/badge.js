// src/badge.js — the toolbar badge: today's count, painted from /v1/me/summary.
//
// One painter, called wherever a summary arrives (api.js summary() — so a
// popup open, a list refresh and the 15-minute alarm all keep it current).
// Source is a preference: due today (default) | open Shortlist items | off.
// Zero → no badge. Signed out → no badge. Yellow on dark, like the app.
//
// No chrome.alarms here: the alarm and the refresh-on-event logic live in
// background.js; this module only knows how to paint.

import { STORAGE_PREFS } from './config.js';

export const BADGE_SOURCES = {
  due_today: 'Tasks due today',
  shortlist: 'Shortlist items left today',
  off:       'Off',
};
export const BADGE_DEFAULT = 'due_today';

const BG   = '#FFD60A';
const FG   = '#111318';
const FLASH_OK  = { bg: '#12B76A', fg: '#FFFFFF' };
const FLASH_ERR = { bg: '#D92D20', fg: '#FFFFFF' };

const action = () => (typeof chrome !== 'undefined' && chrome.action) ? chrome.action : null;

export async function badgeSource() {
  const { [STORAGE_PREFS]: prefs } = await chrome.storage.local.get(STORAGE_PREFS);
  const s = prefs && prefs.badge;
  return s && BADGE_SOURCES[s] ? s : BADGE_DEFAULT;
}

/** The number the badge should show for this summary, per the preference (0 = none). */
export function badgeValue(summary, source) {
  if (!summary || source === 'off') return 0;
  const n = source === 'shortlist' ? summary.shortlist_remaining : summary.due_today;
  return Math.max(0, Number(n) || 0);
}

/** Badge text for a count: '' for 0, '99+' past two digits (the badge fits ~4 chars). */
export function badgeText(n) {
  if (!n || n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

export async function paintBadge(summary) {
  const a = action(); if (!a) return;
  const source = await badgeSource();
  const n = badgeValue(summary, source);
  try {
    await a.setBadgeBackgroundColor({ color: BG });
    if (a.setBadgeTextColor) await a.setBadgeTextColor({ color: FG });
    await a.setBadgeText({ text: badgeText(n) });
    const label = source === 'off' ? '' : (n ? ' · ' + n + (source === 'shortlist' ? ' on your Shortlist' : ' due today') : '');
    await a.setTitle({ title: 'Add to Tasqs' + label });
  } catch (e) {
    console.warn('[Tasqs] badge paint failed', e && e.message);
  }
}

export async function clearBadge() {
  const a = action(); if (!a) return;
  try { await a.setBadgeText({ text: '' }); await a.setTitle({ title: 'Add to Tasqs' }); }
  catch (e) { console.warn('[Tasqs] badge clear failed', e && e.message); }
}

/**
 * A short confirmation on the badge (the omnibox has no UI of its own):
 * '✓' green on a save, '!' red on a failure. `restore` repaints afterwards.
 */
export async function flashBadge(kind, restore, ms = 2000) {
  const a = action(); if (!a) return;
  const c = kind === 'ok' ? FLASH_OK : FLASH_ERR;
  try {
    await a.setBadgeBackgroundColor({ color: c.bg });
    if (a.setBadgeTextColor) await a.setBadgeTextColor({ color: c.fg });
    await a.setBadgeText({ text: kind === 'ok' ? '✓' : '!' });
  } catch (e) {
    console.warn('[Tasqs] badge flash failed', e && e.message);
  }
  setTimeout(() => { Promise.resolve(restore && restore()).catch(() => {}); }, ms);
}
