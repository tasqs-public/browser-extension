// src/background.js — MV3 service worker: context menus, sign-in, message hub.
//
// Kept thin on purpose. The popup talks to the API itself (ES modules); the
// worker exists for the things a popup can't do: run the OAuth window
// (the popup closes the moment focus leaves it, taking its promise with it),
// own the right-click menu, and hand a right-click capture to the popup.

import { signIn, signOut, isSignedIn, setUser } from './auth.js';
import { APP_NAME } from './config.js';

const MENU = { selection: 'tasqs-add-selection', link: 'tasqs-add-link', page: 'tasqs-add-page' };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.selection, title: 'Add to Tasqs: "%s"', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.link,      title: 'Add link to Tasqs',   contexts: ['link'] });
    chrome.contextMenus.create({ id: MENU.page,      title: 'Add this page to Tasqs', contexts: ['page'] });
  });
});

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

// Message hub for the popup/options pages.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'signIn':   { const a = await signIn(); sendResponse({ ok: true, signedIn: !!a }); break; }
        case 'signOut':  { await signOut(); sendResponse({ ok: true }); break; }
        case 'status':   { sendResponse({ ok: true, signedIn: await isSignedIn() }); break; }
        case 'setUser':  { await setUser(msg.user); sendResponse({ ok: true }); break; }
        default:         sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();
  return true;   // async sendResponse
});
