# Chrome Web Store listing — Tasqs Quick Add

Everything the developer dashboard asks for, in the order its tabs ask for it. Images come from `node scripts/store-assets.mjs` → `dist/store/`. The upload is `node scripts/build.mjs` → `dist/chrome.zip` (key stripped; the store assigns the id).

---

## Upload day, in order

1. `node test/run.mjs` → all passed. `node scripts/build.mjs` → `dist/chrome.zip`.
2. Dashboard → **New item** → upload `dist/chrome.zip`. The store now shows the item's **ID** (32 lowercase letters). Copy it.
3. On the Tasqs server (before anyone installs): `php tools/add-oauth-redirect.php 7291a13b99824299fbe971c9bb409e54 https://<store-id>.chromiumapp.org/` — the store-installed copy signs in through this redirect; the pinned dev id keeps working alongside.
4. Fill the tabs below. Visibility **Unlisted** for the first submission.
5. Submit for review. Permission changes re-trigger review later, so the permission set is final for 1.0.
6. When it's published: install from the store link in a fresh profile → sign in → capture from a page → `tq` → badge. Then set visibility **Public**.
7. Site copy (tasqs repo): the store URL into the footer "Quick Add" link, `guide.php#browser-extension` (replace "coming soon"), `pricing.php`; purge Cloudflare. Brief §12 changelog.

---

## Store listing tab

**Name** (from the manifest): Tasqs Quick Add

**Summary** (from the manifest, ≤132): Add a task to Tasqs from any page: toolbar button, Alt+Shift+T, right-click, or type tq in the address bar. Free on every plan.

**Description**

```
Capture a task the moment it occurs to you, without leaving the page you're on.

Tasqs Quick Add puts five ways to add a task into your browser:

• Toolbar button — click the Tasqs icon. The page's title and link come along, and any text you had selected can become the description.
• Keyboard — Alt+Shift+T opens Quick Add while the browser has focus (change it, or make it global, at chrome://extensions/shortcuts).
• Right-click — "Add to Tasqs" on selected text, a link, or the page. The popup opens pre-filled so you can fix the title before it saves.
• Address bar — type tq, a space, then the task, and press Enter. It saves straight away; the suggestion row previews what Tasqs will understand as you type.
• Badge — the toolbar icon shows how many tasks are due today (or what's left on your Shortlist). Blank at zero. Off is one click away.

Type naturally. "call dentist tomorrow 2pm #errands @Personal !high" becomes a task with a due date, a tag, a list and a priority — the same Smart Capture parse as the Tasqs app. If your monthly AI allowance is used up, the task still saves exactly as typed; capture never fails because the AI did.

Built for privacy. There is no content script: nothing is read from a page until you invoke Quick Add on it, and then only that page's title, address and selected text, sent to tasqs.com over HTTPS to fill in your task. No browsing history is collected, and there are no analytics. Sign-in is OAuth with PKCE against Tasqs' own server; the extension receives a token that can only add tasks and read today's counts — it cannot read, edit or delete your tasks — and it appears in your profile's Connected apps, where you can revoke it any time.

Free on every Tasqs plan. Requires a Tasqs account (free at tasqs.com).

Open source: github.com/tasqs-public/browser-extension
```

**Category:** Productivity → Workflow & Planning
**Language:** English (United States)

**Icon:** `assets/icons/icon-128.png` (128×128)

**Screenshots** (1280×800, upload in this order; the store shows the first one in search):

| File | What it shows |
|---|---|
| `dist/store/1-popup.png` | The popup over a page, chips previewing the parse, the page card |
| `dist/store/2-saved.png` | The saved state: what Tasqs understood, Open task |
| `dist/store/3-omnibox.png` | `tq` in the address bar with the suggestion row |
| `dist/store/4-right-click.png` | The context-menu entry on a selection |
| `dist/store/5-badge.png` | The badge and the Settings page |

**Small promo tile** (440×280): `dist/store/tile-440x280.png`. Marquee (1400×560) — skip; optional.

**Official URL:** https://tasqs.com (verify the site in Search Console if the dashboard asks — it's the same Google account)
**Homepage URL:** https://tasqs.com/guide.php#browser-extension
**Support URL:** https://tasqs.com/contact.php

---

## Privacy tab

**Single purpose description**

```
Add tasks to the user's Tasqs account from the current page: a toolbar popup, keyboard shortcut, context-menu entries and an address-bar keyword that each create one task via Tasqs' API, plus a toolbar badge showing the user's count of tasks due today.
```

**Permission justifications** (one line each; the form has a box per permission)

| Permission | Justification |
|---|---|
| `activeTab` | Read the title, URL and selected text of the tab the user invokes Quick Add on — only at that moment, to pre-fill the task. |
| `scripting` | One `executeScript` call on the active tab, at invocation, to read the current text selection (`window.getSelection()`). No persistent content script. |
| `contextMenus` | The "Add to Tasqs" entries on selected text, links and the page. |
| `omnibox` | The `tq` address-bar keyword that adds a task on Enter. |
| `alarms` | Refresh the toolbar badge count every 15 minutes (can be turned off in the extension's settings). |
| `storage` | Keep the user's sign-in token and preferences (chosen list, badge source) locally. |
| `identity` | `launchWebAuthFlow` for OAuth sign-in against tasqs.com (authorization code + PKCE). |
| Host `https://tasqs.com/*` | The Tasqs API the extension creates tasks through and reads today's counts from. No other host. |

**Are you using remote code?** No. All code is in the package; no external scripts, no eval, no WebAssembly from the network.

**Data usage** — tick:

- ☑ **Authentication information** — an OAuth access/refresh token issued by tasqs.com, stored in `chrome.storage.local`, used only to call tasqs.com.
- ☑ **Website content** — the current tab's title, URL and selected text, only when the user invokes Quick Add, sent to tasqs.com to pre-fill the task the user is creating.
- ☐ Personally identifiable information (the user's name is shown in the popup header but comes from their own Tasqs account; the extension collects nothing)
- ☐ Health · ☐ Financial and payment · ☐ Personal communications · ☐ Location · ☐ Web history · ☐ User activity

**Certifications** — tick all three:
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://tasqs.com/privacy.php (the "Quick add" paragraph covers the extension: what it reads, when, where it goes, token stored locally, no analytics).

---

## Distribution tab

**Visibility:** Unlisted (first submission) → Public after the smoke test.
**Regions:** All regions.
**Pricing:** Free.
**Mature content:** No.

---

## Account settings (one-time)

- Developer email: the one you registered with (shown publicly on the listing — use hello@tasqs.com if the account allows, else the registered one).
- Trader / non-trader: Indigo Holdings, Inc. is a trader (a company distributing software). Give the business address exactly as the A2P registration has it: Indigo Holdings, Inc. · 5931 Greenville Ave, Dallas, TX 75206.
- Publisher display name: Tasqs.

---

## Edge Add-ons (optional, same zip)

https://partner.microsoft.com/dashboard/microsoftedge — a separate free developer account; upload the same `dist/chrome.zip`, same copy, same screenshots (Edge accepts 1280×800). Edge assigns **another** extension id, so after the first upload run `tools/add-oauth-redirect.php` once more with `https://<edge-id>.chromiumapp.org/`. Edge users can also install straight from the Chrome Web Store, so this is for ranking in Edge's own search, not reach.

---

## Review notes (if the form offers a "notes for reviewer" box)

```
Testing: create a free account at https://tasqs.com/register.php (email verification required), then click the extension icon → Sign in to Tasqs → Allow. Type "call dentist tomorrow #errands" and press Enter; the task appears at https://tasqs.com/dashboard.php. The address-bar keyword is "tq" (type tq, Space, the task, Enter). The badge shows the count of tasks due today.
No content script; the page is read only via activeTab + a single scripting.executeScript at invocation. Source: https://github.com/tasqs-public/browser-extension
```
