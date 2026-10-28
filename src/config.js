// src/config.js — the few values the extension needs to know about Tasqs.
//
// CLIENT_ID is the public OAuth client seeded on the server with
//   php tools/create-oauth-client.php --public --first-party "Tasqs Quick Add" \
//       "https://<extension-id>.chromiumapp.org/"
// It is a public identifier (no secret exists for a public client; PKCE is
// the proof), so it is fine to ship here. The redirect URI is derived from
// the extension id, which the manifest "key" pins — do not change the key.

export const BASE_URL   = 'https://tasqs.com';
export const CLIENT_ID  = '7291a13b99824299fbe971c9bb409e54';   // 32 hex, from the seeder (public identifier)
export const SCOPES     = 'tasks:capture tasks:summary';
export const RESOURCE   = 'https://tasqs.com';        // RFC 8707 resource indicator
export const APP_NAME   = 'Tasqs Quick Add';

// Storage keys (chrome.storage.local — per-extension, never shared with pages).
export const STORAGE_AUTH   = 'auth';     // {access_token, refresh_token, expires_at, scope, user?}
export const STORAGE_PREFS  = 'prefs';    // {lastList, attachLink}
export const STORAGE_LISTS  = 'lists';    // {at, lists:[{id,name,color}]}

export const LISTS_TTL_MS = 15 * 60 * 1000;
