// src/options.js — sign-in state and pointers. The OAuth window runs in the
// service worker (background.js) so it survives this page losing focus.

import { getAuth } from './auth.js';

const $ = (id) => document.getElementById(id);

async function render() {
  const auth = await getAuth();
  const signedIn = !!(auth && auth.refresh_token);
  $('status').textContent = signedIn ? 'Signed in' : 'Not signed in';
  $('status').className = 'status' + (signedIn ? ' ok' : '');
  $('statusNote').textContent = signedIn
    ? (auth.user && auth.user.name ? 'as ' + auth.user.name + ' · ' : '') + 'scopes: ' + (auth.scope || '')
    : 'Sign in to start adding tasks.';
  $('signin').hidden = signedIn;
  $('signout').hidden = !signedIn;
}

$('signin').addEventListener('click', async () => {
  $('err').classList.remove('show');
  $('signin').disabled = true;
  const r = await chrome.runtime.sendMessage({ type: 'signIn' }).catch((e) => ({ ok: false, error: e.message }));
  $('signin').disabled = false;
  if (!r || !r.ok) { $('err').textContent = (r && r.error) || 'Sign-in failed.'; $('err').classList.add('show'); }
  render();
});
$('signout').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'signOut' });
  render();
});
$('shortcuts').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
$('version').textContent = chrome.runtime.getManifest().version;
render();
