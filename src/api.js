// src/api.js — the two Tasqs calls the extension makes, with auth handling.
//
//   capture(input)  → POST /v1/capture   (scope tasks:capture)
//   summary()       → GET  /v1/me/summary (scope tasks:summary)
//
// Every call: Bearer token → on 401 refresh once (single-flight in auth.js)
// and retry once → never loop. Errors come back as {code, message, status}
// in the API's own envelope so the popup can say something useful
// (limit_reached with upgrade, rate_limited with retry_after, list_not_found
// with the real list names).

import { BASE_URL, STORAGE_LISTS, LISTS_TTL_MS } from './config.js';
import { accessToken, refresh, setUser } from './auth.js';

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message); this.status = status; this.code = code; Object.assign(this, extra);
  }
}

async function request(method, path, body) {
  let token = await accessToken();
  if (!token) throw new ApiError(401, 'signed_out', 'Sign in to Tasqs to add tasks.');
  const attempt = async (tok) => fetch(BASE_URL + '/v1/' + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + tok,
      'Accept': 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let res = await attempt(token);
  if (res.status === 401) {                     // expired/revoked access token → one refresh, one retry
    const r = await refresh();
    if (!r || !r.access_token) throw new ApiError(401, 'signed_out', 'Your Tasqs sign-in has ended. Sign in again.');
    res = await attempt(r.access_token);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json && json.error) || {};
    throw new ApiError(res.status, e.code || 'error', e.message || ('Request failed (' + res.status + ').'), {
      upgrade: !!e.upgrade,
      lists: e.lists || null,
      retryAfter: Number(res.headers.get('Retry-After') || 0) || null,
    });
  }
  return json;
}

/** input: {text, url, page_title, selection, list, attach_link} → {task, parsed, fallback, fallback_reason} */
export function capture(input) {
  return request('POST', 'capture', input);
}

/** {date, due_today, overdue, shortlist_remaining, lists:[{id,name,color}]} */
export async function summary() {
  const s = await request('GET', 'me/summary');
  await chrome.storage.local.set({ [STORAGE_LISTS]: { at: Date.now(), lists: s.lists || [] } });
  if (s.user) await setUser(s.user);   // {name} — shown in the popup header
  return s;
}

/** The list vocabulary for the picker: cached 15 min, refreshed in the background. */
export async function lists({ force = false } = {}) {
  const { [STORAGE_LISTS]: cached } = await chrome.storage.local.get(STORAGE_LISTS);
  if (!force && cached && cached.lists && Date.now() - cached.at < LISTS_TTL_MS) return cached.lists;
  try {
    const s = await summary();
    return s.lists || [];
  } catch (e) {
    if (cached && cached.lists) return cached.lists;   // stale beats empty
    throw e;
  }
}
