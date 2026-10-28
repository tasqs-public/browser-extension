// src/popup.js — the Quick Add popup.
//
// Opens → reads the active tab (title, URL, selection — only now, only this
// tab: activeTab) or a pending right-click capture → shows the form with
// chips previewing the parse → Enter posts /v1/capture → the saved state
// shows what the SERVER understood (the preview was only a hint) → closes
// in a few seconds unless the pointer moves. Signed out → one Sign in button
// (the OAuth window runs in the service worker; see background.js).

import { isSignedIn, getAuth, setUser } from './auth.js';
import { capture, lists as loadLists, ApiError } from './api.js';
import { parseHint } from './hint.js';
import { STORAGE_PREFS, BASE_URL } from './config.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const els = {
  who: $('who'), signin: $('signin'), signinBtn: $('signinBtn'), signinErr: $('signinErr'),
  form: $('form'), text: $('text'), chips: $('chips'), hint: $('hint'), list: $('list'), listDot: $('listDot'), listNote: $('listNote'),
  page: $('page'), fav: $('fav'), pageTitle: $('pageTitle'), pageUrl: $('pageUrl'), attach: $('attach'), selRow: $('selRow'), useSel: $('useSel'), selQuote: $('selQuote'),
  err: $('err'), save: $('save'), done: $('done'), doneTitle: $('doneTitle'), doneNote: $('doneNote'), doneTask: $('doneTask'), doneChips: $('doneChips'),
  openTask: $('openTask'), again: $('again'), bar: $('bar'), closing: $('closing'),
};

let ctx = { title: '', url: '', selection: '' };   // the page we were invoked on
let userLists = [];

function setState(s) { app.dataset.state = s; }
function showErr(el, msg, html = false) { if (html) el.innerHTML = msg; else el.textContent = msg; el.classList.add('show'); }
function hideErr(el) { el.classList.remove('show'); el.textContent = ''; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function hostOf(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } }
function closeSoon() { window.close(); }   // a popup and the fallback window both close this way

// ── Context: pending right-click capture, else the active tab ─────────────
async function readContext() {
  const { pending } = await chrome.storage.session.get('pending');
  if (pending && Date.now() - pending.at < 60_000) {
    await chrome.storage.session.remove('pending');
    return { title: pending.page_title || '', url: pending.url || '', selection: pending.selection || '', text: pending.text || '', fromMenu: true };
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return { title: '', url: '', selection: '', text: '' };
    let selection = '';
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(window.getSelection ? window.getSelection() : '').trim().slice(0, 2000) });
      selection = (r && r.result) || '';
    } catch (e) {
      console.warn('[Tasqs] no selection access on this page (expected on chrome://, PDFs, the Web Store)', e && e.message);
    }
    return { title: tab.title || '', url: tab.url, selection, text: '' };
  } catch (e) {
    console.warn('[Tasqs] tab context unavailable', e && e.message);
    return { title: '', url: '', selection: '', text: '' };
  }
}

// ── Chips preview (client-side hint; the server decides) ──────────────────
function renderChips() {
  const h = parseHint(els.text.value, userLists);
  const out = [];
  if (h.date)       out.push(`<span class="chip chip--date">${esc(h.date.label)}</span>`);
  if (h.priority)   out.push(`<span class="chip chip--${h.priority}">${h.priority === 'high' ? 'High' : 'Low'}</span>`);
  for (const t of h.tags) out.push(`<span class="chip chip--tag">#${esc(t)}</span>`);
  if (h.recurrence) out.push(`<span class="chip">Repeats ${esc(h.recurrence)}</span>`);
  els.chips.innerHTML = out.join('');
  els.hint.style.display = out.length ? 'none' : '';
  if (h.list) {
    els.list.value = h.list.name;
    els.listNote.textContent = '· from @' + h.list.name;
  } else {
    els.listNote.textContent = '';
  }
  paintListDot();
}

function paintListDot() {
  const l = userLists.find((x) => x.name === els.list.value);
  els.listDot.style.background = l && l.color ? l.color : 'var(--muted-2)';
  if (!els.save.disabled) els.save.innerHTML = 'Add to ' + esc(l ? l.name : 'Tasqs') + ' <span class="qa__key">⏎</span>';
}

function niceDate(isoDate) {   // '2026-10-29' → 'Thu, Oct 29' (today/tomorrow when they apply)
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d), now = new Date();
  const diff = Math.round((dt - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

async function fillLists() {
  try { userLists = await loadLists(); } catch (e) { userLists = []; console.warn('[Tasqs] lists unavailable', e && e.message); }
  const { [STORAGE_PREFS]: prefs } = await chrome.storage.local.get(STORAGE_PREFS);
  els.list.innerHTML = '<option value="">Let Tasqs pick</option>' +
    userLists.map((l) => `<option value="${esc(l.name)}">${esc(l.name)}</option>`).join('');
  if (prefs && prefs.lastList && userLists.some((l) => l.name === prefs.lastList)) els.list.value = prefs.lastList;
  if (prefs && typeof prefs.attachLink === 'boolean') els.attach.checked = prefs.attachLink;
  paintListDot();
}

// ── Save ──────────────────────────────────────────────────────────────────
async function save(e) {
  e.preventDefault();
  hideErr(els.err);
  const text = els.text.value.trim();
  if (!text && !ctx.title) { els.text.focus(); return; }
  els.save.disabled = true; els.save.textContent = 'Adding…';
  const input = {
    text,
    url: ctx.url || '',
    page_title: ctx.title || '',
    selection: (ctx.selection && els.useSel.checked) ? ctx.selection : '',
    list: els.list.value || '',
    attach_link: ctx.url ? els.attach.checked : null,
  };
  try {
    const r = await capture(input);
    await chrome.storage.local.set({ [STORAGE_PREFS]: { lastList: els.list.value || '', attachLink: els.attach.checked } });
    showDone(r);
  } catch (err) {
    els.save.disabled = false; paintListDot();
    if (err instanceof ApiError && err.code === 'signed_out') { setState('signedout'); return; }
    let msg = esc(err.message || 'Something went wrong. Try again.');
    if (err instanceof ApiError && err.upgrade) msg += ` <a href="${BASE_URL}/pricing.php" target="_blank" rel="noopener">See plans</a>`;
    if (err instanceof ApiError && err.code === 'rate_limited') msg = 'You have added 60 tasks in the last hour. Give it a little while.';
    showErr(els.err, msg, true);
  }
}

function showDone(r) {
  const p = r.parsed || {};
  els.doneTitle.textContent = 'Added to ' + (p.list && p.list.name ? p.list.name : 'Tasqs');
  els.doneNote.textContent = r.fallback
    ? (r.fallback_reason === 'ai_limit'
        ? 'Saved as typed — your monthly AI allowance is used up, so the date and priority were not parsed.'
        : 'Saved as typed — Tasqs could not parse the date this time.')
    : 'Here is what Tasqs understood.';
  els.doneTask.textContent = r.task.title;
  const chips = [];
  if (p.due_date)   chips.push(`<span class="chip chip--date">${esc(niceDate(p.due_date))}</span>`);
  if (p.priority && p.priority !== 'medium') chips.push(`<span class="chip chip--${esc(p.priority)}">${esc(p.priority[0].toUpperCase() + p.priority.slice(1))}</span>`);
  for (const t of (p.tags || [])) chips.push(`<span class="chip chip--tag">#${esc(t)}</span>`);
  if (p.recurrence) chips.push(`<span class="chip">Repeats ${esc(p.recurrence)}</span>`);
  if (p.link)       chips.push(`<span class="chip chip--link">${esc(hostOf(p.link) || 'link')}</span>`);
  els.doneChips.innerHTML = chips.join('');
  els.openTask.href = BASE_URL + '/dashboard.php?ref=' + encodeURIComponent(r.task.id);
  setState('done');

  // Auto-close in 3s unless the pointer moves (a hovering user is reading).
  let left = 3; let stopped = false;
  els.closing.textContent = 'Closing in 3s';
  requestAnimationFrame(() => { els.bar.style.transitionDuration = '3s'; els.bar.style.width = '100%'; });
  const t = setInterval(() => {
    if (stopped) return;
    left -= 1;
    if (left <= 0) { clearInterval(t); closeSoon(); } else els.closing.textContent = 'Closing in ' + left + 's';
  }, 1000);
  const stop = () => { stopped = true; clearInterval(t); els.closing.textContent = ''; els.bar.style.transitionDuration = '0s'; els.bar.style.width = '0'; };
  els.done.addEventListener('mousemove', stop, { once: true });
  els.done.addEventListener('keydown', stop, { once: true });
}

function resetForm() {
  els.text.value = ''; els.chips.innerHTML = ''; els.hint.style.display = ''; els.listNote.textContent = '';
  els.save.disabled = false; paintListDot();
  setState('form'); els.text.focus();
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('shortcutLink').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
  els.signinBtn.addEventListener('click', async () => {
    hideErr(els.signinErr); els.signinBtn.disabled = true; els.signinBtn.textContent = 'Opening Tasqs…';
    const r = await chrome.runtime.sendMessage({ type: 'signIn' }).catch((e) => ({ ok: false, error: e.message }));
    els.signinBtn.disabled = false; els.signinBtn.textContent = 'Sign in to Tasqs';
    if (r && r.ok) { await boot(); } else showErr(els.signinErr, (r && r.error) || 'Sign-in failed.');
  });
  els.form.addEventListener('submit', save);
  els.text.addEventListener('input', renderChips);
  els.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); els.form.requestSubmit(); } });
  els.list.addEventListener('change', paintListDot);
  els.again.addEventListener('click', resetForm);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSoon(); });

  if (!(await isSignedIn())) { setState('signedout'); return; }
  const auth = await getAuth();
  els.who.textContent = 'tasqs.com' + (auth && auth.user && auth.user.name ? ' · ' + auth.user.name : '');

  ctx = await readContext();
  if (ctx.url) {
    els.page.hidden = false;
    const host = hostOf(ctx.url);
    els.fav.textContent = (host || 'W')[0].toUpperCase();
    els.pageTitle.textContent = ctx.title || host;
    els.pageUrl.textContent = host + (() => { try { return new URL(ctx.url).pathname.replace(/\/$/, ''); } catch { return ''; } })();
    if (ctx.selection) { els.selRow.hidden = false; els.selQuote.textContent = '“' + ctx.selection.slice(0, 140) + (ctx.selection.length > 140 ? '…' : '') + '”'; }
  }
  // Pre-fill: a right-click capture's text, else the page title (editable).
  els.text.value = ctx.text || ctx.title || '';
  setState('form');
  await fillLists();
  renderChips();
  els.text.focus();
  els.text.setSelectionRange(els.text.value.length, els.text.value.length);
}

boot().catch((e) => { console.warn('[Tasqs] popup boot failed', e); setState('signedout'); });
