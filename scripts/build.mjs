#!/usr/bin/env node
// scripts/build.mjs — produce dist/chrome.zip (and dist/firefox.zip) from the source tree.
//
// No bundler: the extension is plain ES modules. The build only (1) copies
// the files the manifest references, (2) STRIPS the "key" from the store
// manifest — the Chrome Web Store assigns the published ID itself and
// rejects a manifest that carries a key — and (3) writes a Firefox variant
// (background.scripts + gecko id) so an AMO submission is a follow-up, not
// a port. Run: node scripts/build.mjs   →   dist/chrome.zip, dist/firefox.zip
//
// The dev ID (from the key) and the store ID are DIFFERENT; both redirect
// URIs are registered on the OAuth client. See README "Two extension ids".

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const copyTree = (dir) => {
  mkdirSync(dir, { recursive: true });
  cpSync(resolve(root, 'src'), resolve(dir, 'src'), { recursive: true });
  cpSync(resolve(root, 'assets'), resolve(dir, 'assets'), { recursive: true });
  if (existsSync(resolve(root, 'LICENSE'))) cpSync(resolve(root, 'LICENSE'), resolve(dir, 'LICENSE'));
};

// Chrome / Edge / Brave: same build, no key.
const chromeDir = resolve(dist, 'chrome');
copyTree(chromeDir);
const chromeManifest = { ...manifest };
delete chromeManifest.key;
writeFileSync(resolve(chromeDir, 'manifest.json'), JSON.stringify(chromeManifest, null, 2) + '\n');

// Firefox: background scripts instead of a service worker; gecko id; no key.
const ffDir = resolve(dist, 'firefox');
copyTree(ffDir);
const ffManifest = { ...manifest };
delete ffManifest.key;
delete ffManifest.minimum_chrome_version;
ffManifest.background = { scripts: ['src/background.js'], type: 'module' };
ffManifest.browser_specific_settings = { gecko: { id: 'quick-add@tasqs.com', strict_min_version: '121.0' } };
writeFileSync(resolve(ffDir, 'manifest.json'), JSON.stringify(ffManifest, null, 2) + '\n');

for (const [name, dir] of [['chrome', chromeDir], ['firefox', ffDir]]) {
  execSync(`cd "${dir}" && zip -qr "../${name}.zip" .`, { stdio: 'inherit' });
  console.log(`dist/${name}.zip  (v${manifest.version})`);
}
