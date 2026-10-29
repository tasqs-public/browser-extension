#!/usr/bin/env node
// scripts/store-assets.mjs — the Chrome Web Store listing images, rendered
// from the REAL popup (served locally with a stubbed chrome.* and a mocked
// API, like preview.mjs) inside a drawn browser frame. Output: dist/store/.
//
//   1280x800 screenshots (the store's native size, no alpha):
//     1-popup.png        the popup over a page, chips previewing the parse
//     2-saved.png        the saved state: what Tasqs understood
//     3-omnibox.png      `tq` in the address bar with the suggestion row
//     4-right-click.png  the context-menu entry on a selection
//     5-badge.png        the toolbar badge + the Settings badge section
//   440x280 small promo tile:  tile-440x280.png
//
//   PLAYWRIGHT_MODULE=/path/to/playwright node scripts/store-assets.mjs
//
// The page shown is an invented one ("Northwind Analytics" pricing); no real
// brand appears. The browser chrome is drawn, not a real Chrome window, so
// the omnibox and context-menu shots depict the feature faithfully without
// needing a desktop session.

import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/store');
mkdirSync(out, { recursive: true });

// ── The same chrome.* stub + API mock as preview.mjs (applies to iframes too) ──
const stub = `
  const mem = { local: { auth: { access_token: 'tqo_x', refresh_token: 'tqr_x', expires_at: Date.now() + 3600e3, scope: 'tasks:capture tasks:summary', user: { name: 'Tim' } } }, session: {} };
  const area = (k) => ({
    get: async (keys) => { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((x) => { if (x in mem[k]) out[x] = mem[k][x]; }); return out; },
    set: async (o) => Object.assign(mem[k], o),
    remove: async (keys) => (Array.isArray(keys) ? keys : [keys]).forEach((x) => delete mem[k][x]),
  });
  window.chrome = {
    storage: { local: area('local'), session: area('session') },
    tabs: { query: async () => [{ id: 1, title: 'Pricing – Northwind Analytics', url: 'https://northwind-analytics.example/pricing', windowId: 1 }], create: () => {} },
    scripting: { executeScript: async () => [{ result: 'Team plan: $12 per user per month, billed annually. Includes shared dashboards and SSO.' }] },
    runtime: { sendMessage: async () => ({ ok: true }), openOptionsPage: () => {}, getManifest: () => ({ version: '1.0.0' }) },
    identity: { getRedirectURL: () => 'https://abc.chromiumapp.org/' },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {}, setTitle: async () => {} },
  };
  const realFetch = window.fetch;
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.endsWith('/v1/me/summary')) return new Response(JSON.stringify({ date: '2026-10-28', user: { name: 'Tim' }, due_today: 3, overdue: 1, shortlist_remaining: 2, lists: [{ id: 1, name: 'Work', color: '#2E90FA' }, { id: 2, name: 'Personal', color: '#12B76A' }, { id: 3, name: 'Errands', color: '#F79009' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/v1/capture')) { const b = JSON.parse(opts.body); return new Response(JSON.stringify({ task: { id: 'a'.repeat(32), title: 'Compare Northwind pricing against ours', status: 'open' }, parsed: { due_date: '2026-10-29', priority: 'high', list: { id: 1, name: 'Work' }, tags: ['research'], recurrence: null, link: b.attach_link ? b.url : null }, fallback: false, fallback_reason: null }), { status: 201, headers: { 'Content-Type': 'application/json' } }); }
    return realFetch(url, opts);
  };
`;

// ── Serve the tree (ES modules won't load over file://) ───────────────────
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png' };
const server = createServer((req, res) => {
  const f = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[f.split('.').pop()] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const base = 'http://127.0.0.1:' + server.address().port;
const icon = 'data:image/png;base64,' + readFileSync(resolve(root, 'assets/icons/icon-32.png')).toString('base64');
const icon128 = 'data:image/png;base64,' + readFileSync(resolve(root, 'assets/icons/icon-128.png')).toString('base64');

// ── The stage: headline band + drawn browser frame + invented page ────────
const FONT = `"Inter", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
function stage({ headline, sub, omnibox = null, badge = '', menu = null, popup = true, selection = false, body = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; } html, body { margin: 0; }
  body { width: 1280px; height: 800px; overflow: hidden; background: #111318; font-family: ${FONT}; color: #111318; }
  .band { height: 118px; padding: 30px 48px 0; color: #fff; }
  .band h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -.5px; }
  .band p { margin: 6px 0 0; font-size: 16px; color: #9AA0B2; }
  .band .mark { display: inline-flex; width: 30px; height: 30px; border-radius: 8px; background: #FFD60A; color: #111318; font-weight: 800; align-items: center; justify-content: center; vertical-align: -6px; margin-right: 10px; }
  .frame { position: absolute; left: 48px; top: 118px; width: 1184px; height: 720px; background: #fff; border-radius: 14px 14px 0 0; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
  .tabs { height: 40px; background: #DEE1E6; display: flex; align-items: flex-end; padding: 0 12px; gap: 6px; }
  .tab { height: 32px; padding: 0 16px; background: #fff; border-radius: 8px 8px 0 0; display: flex; align-items: center; font-size: 12px; color: #3C4043; gap: 8px; }
  .tab .fav { width: 14px; height: 14px; border-radius: 3px; background: #4F46E5; }
  .bar { height: 46px; background: #fff; border-bottom: 1px solid #DADCE0; display: flex; align-items: center; padding: 0 12px; gap: 10px; }
  .nav { display: flex; gap: 2px; color: #5F6368; font-size: 18px; } .nav span { width: 30px; text-align: center; }
  .omni { flex: 1; height: 32px; background: #F1F3F4; border-radius: 16px; display: flex; align-items: center; padding: 0 14px; font-size: 14px; color: #202124; gap: 10px; position: relative; }
  .omni .kw { background: #E8EAED; border-radius: 6px; padding: 3px 9px; font-size: 12px; color: #3C4043; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .omni .kw img { width: 14px; height: 14px; border-radius: 3px; }
  .omni .caret { width: 1px; height: 18px; background: #202124; margin-left: -8px; }
  .ext { width: 34px; height: 32px; display: flex; align-items: center; justify-content: center; position: relative; border-radius: 8px; }
  .ext.on { background: #E8EAED; }
  .ext img { width: 20px; height: 20px; border-radius: 5px; }
  .ext .badge { position: absolute; right: 1px; bottom: 1px; min-width: 16px; height: 14px; padding: 0 3px; background: #FFD60A; color: #111318; font-size: 10px; font-weight: 800; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1.5px solid #fff; }
  .dots { color: #5F6368; font-size: 18px; width: 30px; text-align: center; }
  .page { position: absolute; top: 86px; left: 0; right: 0; bottom: 0; background: #fff; overflow: hidden; }
  .pnav { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 72px; border-bottom: 1px solid #EEF0F3; }
  .pnav .logo { font-weight: 800; font-size: 18px; letter-spacing: -.3px; color: #1D2433; display: flex; align-items: center; gap: 10px; }
  .pnav .logo i { width: 26px; height: 26px; border-radius: 7px; background: #4F46E5; display: inline-block; }
  .pnav .links { display: flex; gap: 28px; font-size: 14px; color: #5A6075; }
  .hero { padding: 56px 72px 0; max-width: 820px; }
  .hero h2 { margin: 0; font-size: 42px; line-height: 1.1; letter-spacing: -1px; color: #1D2433; font-weight: 800; }
  .hero p { margin: 18px 0 0; font-size: 18px; line-height: 1.55; color: #5A6075; max-width: 640px; }
  .hero p mark { background: #B4D5FE; color: #1D2433; padding: 1px 0; }
  .plans { display: flex; gap: 20px; padding: 44px 72px 0; }
  .plan { flex: 1; max-width: 300px; border: 1px solid #E4E6EC; border-radius: 14px; padding: 22px; }
  .plan.hi { border-color: #4F46E5; box-shadow: 0 8px 30px rgba(79,70,229,.12); }
  .plan h3 { margin: 0; font-size: 15px; color: #5A6075; font-weight: 600; }
  .plan .price { font-size: 34px; font-weight: 800; letter-spacing: -1px; color: #1D2433; margin: 8px 0 2px; }
  .plan .price small { font-size: 13px; font-weight: 500; color: #9AA0B2; letter-spacing: 0; }
  .plan ul { margin: 14px 0 0; padding: 0; list-style: none; font-size: 13px; color: #5A6075; line-height: 1.9; }
  .plan ul li::before { content: '✓  '; color: #12B76A; font-weight: 700; }
  .popup { position: absolute; right: 56px; top: 50px; width: 380px; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,.18), 0 18px 48px rgba(0,0,0,.28); background: #fff; }
  .popup iframe { display: block; width: 380px; height: 640px; border: 0; }
  .popup::before { content: ''; position: absolute; }
  .sugg { position: absolute; left: 82px; top: 86px; width: 1070px; background: #fff; border-radius: 0 0 16px 16px; box-shadow: 0 6px 24px rgba(0,0,0,.22); padding: 6px 0 10px; z-index: 5; font-size: 14px; }
  .sugg .row { display: flex; align-items: center; gap: 12px; padding: 9px 16px; color: #202124; }
  .sugg .row.sel { background: #E8F0FE; }
  .sugg .row img { width: 18px; height: 18px; border-radius: 4px; }
  .sugg .row b { font-weight: 600; } .sugg .row .dim { color: #5F6368; }
  .sugg .row .hint { margin-left: auto; color: #5F6368; font-size: 12px; }
  .ctx { position: absolute; background: #fff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,.2), 0 10px 30px rgba(0,0,0,.25); padding: 6px 0; width: 400px; font-size: 13px; color: #202124; z-index: 6; white-space: nowrap; }
  .zoom { position: absolute; right: 70px; top: 60px; width: 210px; background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.18); padding: 18px; text-align: center; z-index: 6; }
  .zoom .big { position: relative; display: inline-block; } .zoom .big img { width: 64px; height: 64px; border-radius: 16px; }
  .zoom .big .badge { position: absolute; right: -10px; bottom: -8px; min-width: 34px; height: 30px; padding: 0 8px; background: #FFD60A; color: #111318; font-size: 20px; font-weight: 800; border-radius: 9px; display: flex; align-items: center; justify-content: center; border: 3px solid #fff; }
  .zoom p { margin: 16px 0 0; font-size: 13px; color: #5A6075; line-height: 1.4; }
  .ctx div { padding: 7px 14px 7px 36px; position: relative; }
  .ctx div.hi { background: #4F46E5; color: #fff; }
  .ctx div.sep { height: 1px; background: #E4E6EC; padding: 0; margin: 5px 0; }
  .ctx div img { position: absolute; left: 11px; top: 7px; width: 16px; height: 16px; border-radius: 4px; }
  .ctx div .k { float: right; color: inherit; opacity: .6; }
  .tip { position: absolute; background: #202124; color: #fff; font-size: 12px; padding: 7px 10px; border-radius: 6px; z-index: 6; }
  </style></head><body>
  <div class="band"><h1><span class="mark">T</span>${headline}</h1><p>${sub}</p></div>
  <div class="frame">
    <div class="tabs"><div class="tab"><span class="fav"></span>Pricing – Northwind Analytics</div></div>
    <div class="bar">
      <div class="nav"><span>‹</span><span>›</span><span>↻</span></div>
      <div class="omni">${omnibox !== null
        ? `<span class="kw"><img src="${icon}">Tasqs Quick Add</span><span>${omnibox}</span><span class="caret"></span>`
        : `<span style="color:#5F6368">🔒</span> northwind-analytics.example/pricing`}</div>
      <div class="ext${popup ? ' on' : ''}"><img src="${icon}">${badge ? `<span class="badge">${badge}</span>` : ''}</div>
      <div class="dots">⋮</div>
    </div>
    ${omnibox !== null ? `<div class="sugg">
      <div class="row sel"><img src="${icon}"><span>Add to Tasqs: <b>${omnibox.replace(/\s*(@\w+|#\w+|!\w+)/g, '')}</b> <span class="dim">· ${describe(omnibox)}</span></span><span class="hint">Press Enter to add</span></div>
    </div>` : ''}
    <div class="page">
      <div class="pnav"><div class="logo"><i></i>Northwind Analytics</div><div class="links"><span>Product</span><span>Pricing</span><span>Docs</span><span>Sign in</span></div></div>
      ${body || `<div class="hero"><h2>Plans for every team size</h2><p>${selection ? '<mark>Team plan: $12 per user per month, billed annually. Includes shared dashboards and SSO.</mark>' : 'Team plan: $12 per user per month, billed annually. Includes shared dashboards and SSO.'} Enterprise pricing is available on request, with a dedicated success manager and a 99.9% uptime SLA.</p></div>
      <div class="plans">
        <div class="plan"><h3>Starter</h3><div class="price">$0<small> /mo</small></div><ul><li>3 dashboards</li><li>1 seat</li><li>Community support</li></ul></div>
        <div class="plan hi"><h3>Team</h3><div class="price">$12<small> /user/mo</small></div><ul><li>Unlimited dashboards</li><li>Shared workspaces</li><li>SSO &amp; audit log</li></ul></div>
        <div class="plan"><h3>Enterprise</h3><div class="price">Custom</div><ul><li>Dedicated manager</li><li>99.9% SLA</li><li>Custom contracts</li></ul></div>
      </div>`}
      ${popup ? `<div class="popup"><iframe src="${base}/src/popup.html"></iframe></div>` : ''}
      ${menu ? `<div class="ctx" style="left:${menu.x}px;top:${menu.y}px">
        <div>Copy<span class="k">Ctrl+C</span></div>
        <div>Search the web for "Team plan: $12 per…"</div>
        <div>Print…<span class="k">Ctrl+P</span></div>
        <div class="sep"></div>
        <div class="hi"><img src="${icon}">Add to Tasqs: "Team plan: $12 per user per…"</div>
        <div class="sep"></div>
        <div>Inspect</div>
      </div>` : ''}
      ${badge && !popup ? `<div class="tip" style="right:58px;top:6px">Add to Tasqs · ${badge} due today</div><div class="zoom"><div class="big"><img src="${icon128}"><span class="badge">${badge}</span></div><p>Due today, or Shortlist items left. Blank at zero.</p></div>` : ''}
    </div>
  </div>
  </body></html>`;
}
function describe(text) {
  const parts = [];
  if (/\btomorrow\b/i.test(text)) parts.push('Tomorrow');
  if (/!high/i.test(text)) parts.push('High');
  for (const m of text.matchAll(/#(\w+)/g)) parts.push('#' + m[1]);
  const l = text.match(/@(\w+)/); if (l) parts.push(l[1]);
  return parts.join(' · ');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await page.addInitScript(stub);
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[page]', m.text()));

async function show(html) {
  await page.setContent(html, { waitUntil: 'load' });
  const fr = page.frames().find((f) => f.url().includes('popup.html'));
  if (fr) {
    await fr.waitForFunction(() => document.getElementById('app').dataset.state === 'form');
    await fr.addStyleTag({ content: `body { font-family: ${FONT}; }` });
  }
  return fr;
}
/** Size an iframe to its document, like a real popup (no blank tail). */
async function fit(fr, selector) {
  await fr.waitForTimeout(80);
  const h = await fr.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));   // not scrollHeight: that is never smaller than the iframe
  await page.evaluate(([sel, h]) => { document.querySelector(sel).style.height = h + 'px'; }, [selector, h]);
}

// 1 — the popup, typed, chips previewing the parse
let fr = await show(stage({ headline: 'Add a task from any page', sub: 'Toolbar button or Alt+Shift+T. The page’s title and link come along; type naturally and the date, priority, tag and list are parsed.' }));
await fr.fill('#text', 'Compare Northwind pricing against ours by Thursday !high #research @Work');
await fit(fr, '.popup iframe');
await page.screenshot({ path: resolve(out, '1-popup.png') });

// 2 — saved
await fr.press('#text', 'Enter');
await fr.waitForFunction(() => document.getElementById('app').dataset.state === 'done');
await fr.hover('#done');   // stops the auto-close
await fit(fr, '.popup iframe');
await page.evaluate(() => { document.querySelector('.band h1').lastChild.textContent = 'See what Tasqs understood'; document.querySelector('.band p').textContent = 'Saved in one keystroke. The due date, priority, tag, list and page link are confirmed, with one button to open the task.'; });
await page.screenshot({ path: resolve(out, '2-saved.png') });

// 3 — omnibox
await show(stage({ headline: 'Or just type tq in the address bar', sub: 'tq, a space, the task, Enter. The suggestion row previews the parse as you type; the toolbar icon flashes a check when it’s saved.', omnibox: 'buy milk tomorrow @Errands', popup: false }));
await page.screenshot({ path: resolve(out, '3-omnibox.png') });

// 4 — right-click on a selection
await show(stage({ headline: 'Right-click anything', sub: 'Selected text, a link, or the page. The popup opens pre-filled so you can fix the title before it saves.', popup: false, selection: true, menu: { x: 330, y: 150 } }));
await page.screenshot({ path: resolve(out, '4-right-click.png') });

// 5 — the badge + Settings
const optionsBody = `<div style="position:absolute;inset:0;background:#F3F4F7"><div style="position:absolute;left:50%;top:40px;transform:translateX(-50%);width:600px;background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.08);overflow:hidden"><iframe id="opt" src="${base}/src/options.html" style="display:block;width:600px;height:560px;border:0"></iframe></div></div>`;
await show(stage({ headline: 'A badge with today’s count', sub: 'Tasks due today, or what’s left on your Shortlist. Refreshes every 15 minutes and after every save. Off is one click away.', popup: false, badge: '3', body: optionsBody }));
const of = page.frames().find((f) => f.url().includes('options.html'));
await of.waitForFunction(() => document.getElementById('status').textContent === 'Signed in');
await of.addStyleTag({ content: `body { font-family: ${FONT}; } .opt { gap: 14px; } .opt section:nth-of-type(2), .opt section:nth-of-type(4) { display: none; }` });
await fit(of, '#opt');
await page.screenshot({ path: resolve(out, '5-badge.png') });

// Promo tile 440x280
const tile = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await tile.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; } html, body { margin: 0; }
  body { width: 440px; height: 280px; background: #111318; font-family: ${FONT}; color: #fff; display: flex; flex-direction: column; justify-content: center; padding: 0 36px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .mark { width: 52px; height: 52px; border-radius: 14px; background: #FFD60A; color: #111318; font-weight: 800; font-size: 30px; display: flex; align-items: center; justify-content: center; flex: none; }
  .name { font-size: 27px; font-weight: 800; letter-spacing: -.6px; }
  .tag { margin-top: 20px; font-size: 16px; line-height: 1.5; color: #C9CDD8; }
  .tag code { font-family: ui-monospace, Menlo, Consolas, monospace; background: #1F2330; padding: 1px 7px; border-radius: 5px; color: #FFD60A; font-size: 15px; }
  .fine { margin-top: 18px; font-size: 13px; color: #7A8194; }
</style></head><body>
  <div class="brand"><div class="mark">T</div><div class="name">Tasqs Quick Add</div></div>
  <div class="tag">Add a task from any page.<br>Toolbar button · Alt+Shift+T · right-click · <code>tq</code> in the address bar.</div>
  <div class="fine">Free on every plan · tasqs.com</div>
</body></html>`);
await tile.screenshot({ path: resolve(out, 'tile-440x280.png') });

await browser.close();
server.close();
console.log('dist/store/{1-popup,2-saved,3-omnibox,4-right-click,5-badge}.png + tile-440x280.png');
