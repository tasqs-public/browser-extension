# Tasqs Quick Add — browser extension

Add a task to [Tasqs](https://tasqs.com) from any page: the toolbar button, `Alt+Shift+T`, or right-click **Add to Tasqs**. Type naturally (`call dentist tomorrow 2pm #errands @Personal !high`) and Tasqs parses the date, tag, list and priority. The page's title and link come along. Free on every plan.

Chrome, Edge and Brave today (Manifest V3). The code is Firefox-compatible; an AMO listing is a follow-up.

## How it works

- **No content script, no `tabs` permission.** The extension reads the current tab's title, URL and selected text only when you invoke it (`activeTab` + a one-shot `scripting` call), and sends them to `tasqs.com` over HTTPS to fill in the task. Nothing is read from pages you don't capture from.
- **Sign-in is OAuth 2.1 with PKCE** against Tasqs' own server. The extension is a *public, first-party* client: no secret, and a token that can only **add tasks** (`tasks:capture`) and **read today's counts** (`tasks:summary`). It cannot read, edit or delete your tasks. It shows up in your profile's Connected apps card, where you can revoke it.
- **Capture never fails because the AI did.** If your monthly AI allowance is used up, the task still saves exactly as typed.
- Two server endpoints: `POST /v1/capture` and `GET /v1/me/summary` — documented at [tasqs.com/api-documentation.php#quick-add](https://tasqs.com/api-documentation.php#quick-add).

## Layout

```
manifest.json        MV3; "key" pins the development extension id
src/config.js        BASE_URL, CLIENT_ID (public), scopes
src/auth.js          PKCE sign-in, single-flight refresh, sign-out
src/api.js           capture() / summary() / lists() with 401 → refresh → retry once
src/hint.js          regex preview of the parse (chips as you type) — pure, tested
src/background.js    service worker: context menus, the OAuth window, message hub
src/popup.*          the Quick Add popup
src/options.*        account + pointers
scripts/build.mjs    dist/chrome.zip + dist/firefox.zip (strips the key for the store)
test/run.mjs         node test/run.mjs
```

## Develop

1. `git clone` this repo.
2. Set `CLIENT_ID` in `src/config.js` to the public client seeded on the server (below).
3. Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → this folder.
4. The extension id is pinned by the manifest `key`: `hpjnhmjgegghpfjficngmnfbcbefmghd`, so the OAuth redirect `https://hpjnhmjgegghpfjficngmnfbcbefmghd.chromiumapp.org/` is stable on every machine.
5. `node test/run.mjs` for the pure parts; the rest is click-through (sign in, capture from a page, right-click on a selection, a link, the page; try `chrome://extensions` and a PDF — the page card should simply not appear).

### Server-side setup (once)

```
php tools/create-oauth-client.php --public --first-party "Tasqs Quick Add" \
    "https://hpjnhmjgegghpfjficngmnfbcbefmghd.chromiumapp.org/"
```
Copy the printed `client_id` into `src/config.js`.

### Two extension ids

The Chrome Web Store assigns its own id when the first version is uploaded (the store manifest must not carry a key — `scripts/build.mjs` strips it). After the first upload, read the store id from the dashboard and add its redirect URI (`https://<store-id>.chromiumapp.org/`) to the same OAuth client (`oauth_clients.redirect_uris`, newline-separated). Both ids then work: the pinned one for development, the store one for users.

## Build

```
node scripts/build.mjs      # → dist/chrome.zip (upload to the Web Store), dist/firefox.zip
```

## Licence

MIT — see `LICENSE`.
