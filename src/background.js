// src/background.js — MV3 service worker: context menus, omnibox, badge, sign-in, message hub.
//
// Kept thin on purpose. The popup talks to the API itself (ES modules); the
// worker exists for the things a popup can't do: run the OAuth window
// (the popup closes the moment focus leaves it, taking its promise with it),
// own the right-click menu and the address-bar keyword, keep the badge
// current on an alarm, and hand a pending capture to the popup.
//
// MV3 rule: every listener is registered at top level, synchronously, so a
// woken worker has them before the event is dispatched.

import { signIn, signOut, isSignedIn, setUser } from './auth.js';
import { capture, summary, ApiError } from './api.js';
import { parseHint } from './hint.js';
import { describeCapture } from './omnibox.js';   // keyword itself is manifest.json "omnibox"
import { clearBadge, flashBadge, badgeSource } from './badge.js';
import { APP_NAME, STORAGE_LISTS } from './config.js';

const MENU = { selection: 'tasqs-add-selection', link: 'tasqs-add-link', page: 'tasqs-add-page' };
const BADGE_ALARM = 'tasqs-badge';
const BADGE_PERIOD_MIN = 15;   // 96 cheap reads/day/user; the popup and list refreshes repaint in between

// ── Install / startup ─────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.selection, title: 'Add to Tasqs: "%s"', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.link,      title: 'Add link to Tasqs',   contexts: ['link'] });
    chrome.contextMenus.create({ id: MENU.page,      title: 'Add this page to Tasqs', contexts: ['page'] });
  });
  ensureBadgeAlarm();
  refreshBadge();
});
chrome.runtime.onStartup.addListener(() => { ensureBadgeAlarm(); refreshBadge(); });

// ── Badge ─────────────────────────────────────────────────────────────────
function ensureBadgeAlarm() {
  chrome.alarms.get(BADGE_ALARM, (a) => {
    if (!a) chrome.alarms.create(BADGE_ALARM, { periodInMinutes: BADGE_PERIOD_MIN });
  });
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === BADGE_ALARM) refreshBadge(); });

/** Signed in → GET /v1/me/summary (which paints the badge); signed out or badge off → no badge, no request. Never throws. */
async function refreshBadge() {
  try {
    if (!(await isSignedIn()) || (await badgeSource()) === 'off') { await clearBadge(); return; }
    await summary();
  } catch (e) {
    if (e instanceof ApiError && e.code === 'signed_out') { await clearBadge(); return; }
    console.warn('[' + APP_NAME + '] badge refresh skipped', e && e.message);   // network/5xx: keep the last number
  }
}

// ── Right-click ───────────────────────────────────────────────────────────
// A right-click capture: stash what we know, then open the popup pre-filled.
// Nothing is saved until the user presses Enter there (one keystroke to
// confirm, and a chance to fix the title).
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const pending = {
    at: Date.now(),
    source: info.menuItemId,
    text: info.menuItemId === MENU.selection ? String(info.selectionText || '').trim().slice(0, 1000)
        : info.menuItemId === MENU.link      ? String(info.linkText || info.linkUrl || '').trim().slice(0, 255)
        : String((tab && tab.title) || '').slice(0, 255),
    page_title: String((tab && tab.title) || '').slice(0, 255),
    url: info.menuItemId === MENU.link ? String(info.linkUrl || '') : String(info.pageUrl || (tab && tab.url) || ''),
    selection: info.menuItemId === MENU.selection ? String(info.selectionText || '').slice(0, 2000) : '',
  };
  await chrome.storage.session.set({ pending });
  await openPopup(tab);
});

async function openPopup(tab) {
  try {
    if (chrome.action.openPopup) { await chrome.action.openPopup(tab && tab.windowId ? { windowId: tab.windowId } : {}); return; }
  } catch (e) {
    console.warn('[' + APP_NAME + '] action.openPopup failed, falling back to a window', e);
  }
  // Older Chrome: a small popup window running the same page.
  await chrome.windows.create({ url: chrome.runtime.getURL('src/popup.html?window=1'), type: 'popup', width: 400, height: 600 });
}

// ── Omnibox: `tq <task>` ──────────────────────────────────────────────────
// The one entry point that saves on Enter (that is its point). The default
// suggestion previews the parse as you type (regex only, no network); the
// result shows on the badge (✓ / !). A failure opens the popup pre-filled
// with the text and the reason, so nothing typed is lost.
if (chrome.omnibox) {
  chrome.omnibox.onInputStarted.addListener(async () => {
    setSuggestion(describeCapture('', [], { signedIn: await isSignedIn() }));
  });
  chrome.omnibox.onInputChanged.addListener(async (text) => {
    const signedIn = await isSignedIn();
    const lists = signedIn ? await cachedLists() : [];
    setSuggestion(describeCapture(text, lists, { signedIn }));
  });
  chrome.omnibox.onInputEntered.addListener(async (text) => {
    const raw = String(text || '').trim();
    if (!(await isSignedIn())) { chrome.runtime.openOptionsPage(); return; }
    if (!raw) { await openPopup(null); return; }
    const h = parseHint(raw, await cachedLists());
    try {
      await capture({
        text: raw, url: '', page_title: '', selection: '',
        list: h.list ? h.list.name : '',     // the same explicit list the popup would send
        attach_link: null,
      });
      await flashBadge('ok', refreshBadge);
    } catch (e) {
      console.warn('[' + APP_NAME + '] omnibox capture failed', e && e.message);
      const pending = {
        at: Date.now(), source: 'omnibox', text: raw, page_title: '', url: '', selection: '',
        error: (e && e.message) || 'Something went wrong. Try again.',
        upgrade: !!(e && e.upgrade), code: (e && e.code) || 'error',
      };
      await chrome.storage.session.set({ pending });
      await flashBadge('err', refreshBadge, 3000);
      await openPopup(null);
    }
  });
}

function setSuggestion(description) {
  try {
    chrome.omnibox.setDefaultSuggestion({ description });
  } catch (e) {
    console.warn('[' + APP_NAME + '] omnibox suggestion rejected', e && e.message, description);
    chrome.omnibox.setDefaultSuggestion({ description: 'Add to Tasqs' });
  }
}

/** The list vocabulary from storage only (no network on a keystroke). */
async function cachedLists() {
  const { [STORAGE_LISTS]: cached } = await chrome.storage.local.get(STORAGE_LISTS);
  return (cached && cached.lists) || [];
}

// ── Message hub for the popup/options pages ───────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'signIn':       { const a = await signIn(); refreshBadge(); sendResponse({ ok: true, signedIn: !!a }); break; }
        case 'signOut':      { await signOut(); await clearBadge(); sendResponse({ ok: true }); break; }
        case 'status':       { sendResponse({ ok: true, signedIn: await isSignedIn() }); break; }
        case 'setUser':      { await setUser(msg.user); sendResponse({ ok: true }); break; }
        case 'badgeRefresh': { await refreshBadge(); sendResponse({ ok: true }); break; }
        default:             sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();
  return true;   // async sendResponse
});
