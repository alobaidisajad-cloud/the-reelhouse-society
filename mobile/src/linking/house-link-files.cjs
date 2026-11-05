#!/usr/bin/env node
/**
 * house-link-files.cjs — the website's two link files, made from the app's own list (P4.20).
 *
 *   node mobile/src/linking/house-link-files.cjs --team <Apple Team ID> --sha256 <Play app-signing SHA-256> --out <dir>
 *
 * Writes <dir>/apple-app-site-association and <dir>/assetlinks.json, for the website's
 * public/.well-known/. The paths the iPhone opens in the app are housePaths.json's claimed ones,
 * as Android's intent filters (app.json) are, so the two phones and the website claim one list.
 * Both name the app's saved passwords as the website's too (webcredentials, get_login_creds).
 * The fingerprint is the Play app-signing key's, read in Play Console (Test and release → App
 * integrity → App signing), never the upload key's: Play re-signs the app, and a link file naming
 * the upload key verifies nothing. The two values exist only at launch prep; until then nothing
 * is written to the website.
 */
const fs = require('fs');
const path = require('path');
const table = require('./housePaths.json');
const app = require('../../app.json').expo;

const BUNDLE = app.ios.bundleIdentifier;
const PACKAGE = app.android.package;

/** A claimed web path as the iPhone's file names it: each named part, and all after it, a wildcard. */
function componentOf(web) {
  const fixed = web.split('/').filter((s) => s && !s.startsWith(':'));
  return web.includes(':') ? { '/': `/${fixed.join('/')}/*` } : { '/': `/${fixed.join('/')}` };
}

/** apple-app-site-association for this team's app. */
function appleFile(team) {
  if (!/^[A-Z0-9]{10}$/.test(team ?? '')) throw new Error('house-link-files: an Apple Team ID is ten capital letters and digits.');
  const id = `${team}.${BUNDLE}`;
  return {
    applinks: { details: [{ appIDs: [id], components: table.paths.filter((p) => p.app !== null).map((p) => componentOf(p.web)) }] },
    webcredentials: { apps: [id] },
  };
}

/** Android's link file, for the app Play signs with this key. */
function androidFile(sha256) {
  if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(sha256 ?? '')) throw new Error('house-link-files: a SHA-256 fingerprint is 32 pairs of capital hex digits joined by colons.');
  return [{
    relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
    target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: [sha256] },
  }];
}

module.exports = { appleFile, androidFile, componentOf };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  const out = opt('out');
  if (!out) { console.error('house-link-files: --out <dir> is needed.'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'apple-app-site-association'), `${JSON.stringify(appleFile(opt('team')), null, 2)}\n`);
  fs.writeFileSync(path.join(out, 'assetlinks.json'), `${JSON.stringify(androidFile(opt('sha256')), null, 2)}\n`);
  console.log(`wrote ${out}/apple-app-site-association and ${out}/assetlinks.json`);
}
