// src/auth.js — OAuth 2.1 authorization-code flow with PKCE, as a public client.
//
// Tasqs' own OAuth server (tasqs.com/oauth/*) issues the tokens; the extension
// is a first-party PUBLIC client, so there is no client secret — the PKCE
// verifier proves at exchange time that whoever got the code is whoever
// started the flow. Tokens live in chrome.storage.local (per-extension; web
// pages can't read it). Access tokens last 1 hour; the refresh token rotates
// on every refresh and is swept server-side after 90 days unused.
//
// invalid_grant on refresh means the grant is genuinely dead (revoked in
// Connected apps, or 90 days idle): we sign out locally and never loop.

import { BASE_URL, CLIENT_ID, SCOPES, RESOURCE, STORAGE_AUTH } from './config.js';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));           // 64 chars, within 43–128
  const digest   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

export function redirectUri() {
  return chrome.identity.getRedirectURL();   // https://<extension-id>.chromiumapp.org/
}

export async function getAuth() {
  const { [STORAGE_AUTH]: auth } = await chrome.storage.local.get(STORAGE_AUTH);
  return auth || null;
}

export async function isSignedIn() {
  const a = await getAuth();
  return !!(a && a.refresh_token);
}

async function storeTokens(json, prev) {
  const auth = {
    access_token:  json.access_token,
    refresh_token: json.refresh_token || (prev && prev.refresh_token) || null,
    expires_at:    Date.now() + Math.max(60, (json.expires_in || 3600) - 30) * 1000,   // refresh 30s early
    scope:         json.scope || SCOPES,
    user:          (prev && prev.user) || null,
  };
  await chrome.storage.local.set({ [STORAGE_AUTH]: auth });
  return auth;
}

/** Interactive sign-in: opens Tasqs' consent page in the identity window. */
export async function signIn() {
  if (!CLIENT_ID || CLIENT_ID.startsWith('REPLACE')) {
    throw new Error('This build has no OAuth client id configured (src/config.js).');
  }
  const { verifier, challenge } = await pkcePair();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const url = new URL(BASE_URL + '/oauth/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
  }).toString();

  const back = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
  if (!back) throw new Error('Sign-in was cancelled.');
  const q = new URL(back).searchParams;
  if (q.get('error')) throw new Error(q.get('error_description') || q.get('error'));
  if (q.get('state') !== state) throw new Error('Sign-in state mismatch; try again.');
  const code = q.get('code');
  if (!code) throw new Error('No authorization code returned.');

  const res = await fetch(BASE_URL + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: CLIENT_ID,
      code_verifier: verifier,
      resource: RESOURCE,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || 'Token exchange failed.');
  return storeTokens(json, null);
}

let refreshing = null;   // single-flight: concurrent 401s share one refresh

/** Refresh the access token (rotating refresh). Returns the new auth, or null if the grant is dead. */
export async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const prev = await getAuth();
    if (!prev || !prev.refresh_token) return null;
    const res = await fetch(BASE_URL + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: prev.refresh_token,
        client_id: CLIENT_ID,
        resource: RESOURCE,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.access_token) return storeTokens(json, prev);
    if (json.error === 'invalid_grant') {        // dead grant: revoked or expired → signed out
      await signOut();
      return null;
    }
    // Server fault (5xx) or network: keep the old tokens; the caller retries later.
    return prev;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/** A usable access token, refreshing if it is about to expire. Null when signed out. */
export async function accessToken() {
  const a = await getAuth();
  if (!a || !a.refresh_token) return null;
  if (a.access_token && a.expires_at > Date.now()) return a.access_token;
  const r = await refresh();
  return r && r.access_token ? r.access_token : null;
}

export async function setUser(user) {
  const a = await getAuth();
  if (!a) return;
  await chrome.storage.local.set({ [STORAGE_AUTH]: { ...a, user } });
}

/** Local sign-out. Server-side revocation is the Connected apps card on tasqs.com. */
export async function signOut() {
  await chrome.storage.local.remove([STORAGE_AUTH, 'lists']);
}
