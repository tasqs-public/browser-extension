#!/usr/bin/env node
// scripts/preview.mjs — render the popup's states in headless Chromium with a
// stubbed chrome.* and a mocked API, and save screenshots to dist/preview/.
// A visual smoke check for CSS/layout; NOT a substitute for loading the real
// extension (auth, activeTab, context menus need Chrome itself).
//   node scripts/preview.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'dist/preview'), { recursive: true });

const stub = `
  const mem = { local: { auth: { access_token: 'tqo_x', refresh_token: 'tqr_x', expires_at: Date.now() + 3600e3, scope: 'tasks:capture tasks:summary', user: { name: 'Tim' } } }, session: {} };
  const area = (k) => ({
    get: async (keys) => { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((x) => { if (x in mem[k]) out[x] = mem[k][x]; }); return out; },
    set: async (o) => Object.assign(mem[k], o),
    remove: async (keys) => (Array.isArray(keys) ? keys : [keys]).forEach((x) => delete mem[k][x]),
  });
  window.chrome = {
    storage: { local: area('local'), session: area('session') },
    tabs: { query: async () => [{ id: 1, title: 'Pricing - Acme Corp', url: 'https://acme.com/pricing', windowId: 1 }], create: () => {} },
    scripting: { executeScript: async () => [{ result: 'Team plan: $12 per user per month, billed annually.' }] },
    runtime: { sendMessage: async () => ({ ok: true }), openOptionsPage: () => {}, getManifest: () => ({ version: '1.0.0' }) },
    identity: { getRedirectURL: () => 'https://abc.chromiumapp.org/' },
  };
  const realFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.endsWith('/v1/me/summary')) return new Response(JSON.stringify({ date: '2026-10-28', user: { name: 'Tim' }, due_today: 3, overdue: 1, shortlist_remaining: 2, lists: [{ id: 1, name: 'Work', color: '#2E90FA' }, { id: 2, name: 'Personal', color: '#12B76A' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/v1/capture')) { const b = JSON.parse(opts.body); return new Response(JSON.stringify({ task: { id: 'a'.repeat(32), title: b.text.replace(/\\s*(by thursday|!high|#\\w+|@\\w+)/gi, '').trim() || b.page_title, status: 'open' }, parsed: { due_date: '2026-10-29', priority: 'high', list: { id: 1, name: 'Work' }, tags: ['research'], recurrence: null, link: b.attach_link ? b.url : null }, fallback: false, fallback_reason: null }), { status: 201, headers: { 'Content-Type': 'application/json' } }); }
    return realFetch(url, opts);
  };
`;

// ES modules won't load over file:// (CORS), so serve the tree locally.
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png' };
const server = createServer((req, res) => {
  const f = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[f.split('.').pop()] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 380, height: 640 }, deviceScaleFactor: 2 });
await page.addInitScript(stub);
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[page]', m.text()));
await page.goto(base + '/src/popup.html');
await page.waitForFunction(() => document.getElementById('app').dataset.state === 'form');
await page.screenshot({ path: resolve(root, 'dist/preview/1-opened.png') });

await page.fill('#text', 'Compare Acme pricing against ours by Thursday !high #research @Work');
await page.waitForTimeout(100);
await page.screenshot({ path: resolve(root, 'dist/preview/2-typed.png') });

await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('app').dataset.state === 'done');
await page.mouse.move(100, 300);   // stop the auto-close
await page.screenshot({ path: resolve(root, 'dist/preview/3-saved.png') });

// Signed-out state.
await page.addInitScript(() => { window.__signedOut = true; });
const page2 = await browser.newPage({ viewport: { width: 380, height: 420 }, deviceScaleFactor: 2 });
await page2.addInitScript(stub.replace("auth: { access_token: 'tqo_x', refresh_token: 'tqr_x'", "auth: { access_token: null, refresh_token: null"));
await page2.goto(base + '/src/popup.html');
await page2.waitForFunction(() => document.getElementById('app').dataset.state === 'signedout');
await page2.screenshot({ path: resolve(root, 'dist/preview/0-signedout.png') });

await browser.close();
server.close();
console.log('dist/preview/{0-signedout,1-opened,2-typed,3-saved}.png');
