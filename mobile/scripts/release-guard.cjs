#!/usr/bin/env node
/**
 * release-guard.cjs — what ships holds the house's rules: no E2E switch, door
 * or test host in it, and no development tooling.
 *
 * Its inputs are a real build's, never the sealed E2E APK (it refuses an APK,
 * and refuses to run with E2E set):
 *
 *   --config <app.config>    the public config the native build embeds, which
 *                            Constants.expoConfig reads on the phone (written
 *                            by expo-constants' own script, as the build does)
 *   --bundles <dir>          the production bundles `expo export` made
 *                            (scripts/bundle-size.js --keep <dir>)
 *   --manifest <xml>         the merged release AndroidManifest.xml
 *   --plist <Info.plist>     the iOS app's Info.plist, XML or binary
 *
 * Or an EAS build's own download, before it is submitted, from mobile/ (with
 * `npm run release:guard --` in front):
 *
 *   --aab <file> --bundletool <bundletool.jar>
 *                            its manifest (read by `bundletool dump manifest`),
 *                            its embedded config and its bundle
 *   --ipa <file>             its Info.plist, embedded config and bundle
 *
 * Prints what each input held; exits 1 on any finding, or with nothing to read.
 */
const { Buffer } = require('buffer');
const { spawnSync } = require('child_process');
const { existsSync, readdirSync, readFileSync, statSync } = require('fs');
const { join, relative } = require('path');

const MOBILE = join(__dirname, '..');

/** The one written exception (P4.45): the admin-only test-crash control, by its file and label. */
const TEST_CRASH = { file: 'src/features/settings/SettingsScreen.tsx', label: 'Send a test crash' };

/** The production backend, as eas.json gives the production build. */
function productionBackend() {
  const env = JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8')).build.production.env;
  return { url: env.EXPO_PUBLIC_SUPABASE_URL, key: env.EXPO_PUBLIC_SUPABASE_ANON_KEY };
}

// ── Reading the inputs ──────────────────────────────────────────────────────

/** An XML file's elements as a tree of { name, attrs, children }, its comments skipped. */
function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (const m of text.matchAll(tag)) {
    if (!m[2]) continue;
    const [, closing, name, rawAttrs, selfClosing] = m;
    if (closing) {
      if (stack.length > 1 && stack[stack.length - 1].name === name) stack.pop();
      else throw new Error(`the XML closes <${name}> where it is not open`);
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unescapeXml(a[2] ?? a[3]);
    const el = { name, attrs, children: [] };
    stack[stack.length - 1].children.push(el);
    if (!selfClosing) stack.push(el);
  }
  if (stack.length !== 1) throw new Error(`the XML leaves <${stack[stack.length - 1].name}> open`);
  return root;
}

function unescapeXml(s) {
  return s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (_, e) => {
    const named = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[e.toLowerCase()];
    if (named) return named;
    return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

/** Every element under a tree, depth first. */
function* elements(node) {
  for (const child of node.children) { yield child; yield* elements(child); }
}

/** An XML property list's value: dicts as objects, arrays as arrays. */
function parseXmlPlist(text) {
  const tokens = [...text.matchAll(/<(\/?)(dict|array|key|string|integer|real|date|data|true|false)\s*(\/?)>([^<]*)/g)];
  let i = 0;
  const value = () => {
    const [, closing, name, empty, body] = tokens[i++];
    if (closing) throw new Error(`the plist closes <${name}> where a value belongs`);
    if (name === 'true' || name === 'false') return name === 'true';
    if (name === 'dict') {
      const out = {};
      if (empty) return out;
      while (!(tokens[i][1] && tokens[i][2] === 'dict')) {
        if (tokens[i][2] !== 'key') throw new Error('the plist has a dict value with no key');
        const key = unescapeXml(tokens[i][4]);
        i += 2; // <key>…, then its </key>
        out[key] = value();
      }
      i++;
      return out;
    }
    if (name === 'array') {
      const out = [];
      if (empty) return out;
      while (!(tokens[i][1] && tokens[i][2] === 'array')) out.push(value());
      i++;
      return out;
    }
    if (empty) return '';
    i++; // its closing tag
    if (name === 'integer') return Number(body.trim());
    if (name === 'real') return Number(body.trim());
    return unescapeXml(body);
  };
  const start = tokens.findIndex((t) => !t[1] && (t[2] === 'dict' || t[2] === 'array'));
  if (start < 0) throw new Error('the plist has no dict');
  i = start;
  return value();
}

/** A binary property list's value (the format Xcode writes into a built app). */
function parseBinaryPlist(buf) {
  const trailer = buf.length - 32;
  const offsetSize = buf[trailer + 6];
  const refSize = buf[trailer + 7];
  const count = Number(buf.readBigUInt64BE(trailer + 8));
  const top = Number(buf.readBigUInt64BE(trailer + 16));
  const table = Number(buf.readBigUInt64BE(trailer + 24));
  const uint = (at, size) => { let n = 0; for (let k = 0; k < size; k++) n = n * 256 + buf[at + k]; return n; };
  const offsets = Array.from({ length: count }, (_, k) => uint(table + k * offsetSize, offsetSize));
  const read = (ref, depth) => {
    if (depth > 64) throw new Error('the plist nests too deep');
    const at = offsets[ref];
    const marker = buf[at];
    const kind = marker >> 4;
    let length = marker & 0x0f;
    let body = at + 1;
    if ([0x4, 0x5, 0x6, 0xa, 0xc, 0xd].includes(kind) && length === 0x0f) {
      const size = 1 << (buf[body] & 0x0f);
      length = uint(body + 1, size);
      body += 1 + size;
    }
    switch (kind) {
      case 0x0: return marker === 0x09 ? true : marker === 0x08 ? false : null;
      case 0x1: return uint(body, 1 << length);
      case 0x2: return length === 3 ? buf.readDoubleBE(body) : buf.readFloatBE(body);
      case 0x3: return buf.readDoubleBE(body);
      case 0x4: return buf.subarray(body, body + length);
      case 0x5: return buf.toString('latin1', body, body + length);
      case 0x6: return Buffer.from(buf.subarray(body, body + length * 2)).swap16().toString('utf16le');
      case 0x8: return uint(body, length + 1);
      case 0xa: case 0xc:
        return Array.from({ length }, (_, k) => read(uint(body + k * refSize, refSize), depth + 1));
      case 0xd: {
        const out = {};
        for (let k = 0; k < length; k++) {
          out[read(uint(body + k * refSize, refSize), depth + 1)] = read(uint(body + (length + k) * refSize, refSize), depth + 1);
        }
        return out;
      }
      default: throw new Error(`the plist holds an object of unknown kind 0x${marker.toString(16)}`);
    }
  };
  return read(top, 0);
}

function parsePlist(buf) {
  return buf.subarray(0, 8).toString('latin1') === 'bplist00' ? parseBinaryPlist(buf) : parseXmlPlist(buf.toString('utf8'));
}

// ── The rules ───────────────────────────────────────────────────────────────

/** The E2E world's addresses and key, as the E2E build carries them (e2e.yml, e2e/anon-key.mjs): the house, and the fault proxy before it. */
const E2E_HOSTS = ['10.0.2.2', ':54321', ':54330'];
/** The start of the local stack's anon key: a token over {"iss":"supabase-demo", … }. */
const E2E_KEY = Buffer.from('{"iss":"supabase-demo",').toString('base64url').slice(0, 28);

const DEV_PACKAGES = ['expo.modules.devlauncher.', 'expo.modules.devmenu.', 'com.facebook.react.devsupport.'];
const SCANNER = 'com.google.mlkit.vision.DEPENDENCIES';
const COMPONENTS = ['activity', 'activity-alias', 'service', 'receiver', 'provider'];
/** What the app's own activity takes in place, so a member's place survives a turn, a fold or a split-screen resize. */
const KEPT_IN_PLACE = ['orientation', 'screenSize', 'screenLayout', 'smallestScreenSize'];
/** Every way an iPad may hold the app: decision 8, and iPad multitasking asks for all four. */
const IPAD_TURNS = ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];

/** Findings in the public config the build embeds (and an update would carry). */
function checkConfig(config) {
  const found = [];
  if (config?.extra?.e2e !== undefined) {
    found.push(`extra.e2e is ${JSON.stringify(config.extra.e2e)}: the E2E trace's switch (src/utils/e2eTrace.ts) is in the build`);
  }
  for (const p of config?.plugins ?? []) {
    const name = Array.isArray(p) ? p[0] : p;
    if (typeof name === 'string' && /(^|[\\/])e2e[\\/]/.test(name)) found.push(`the plugin ${name} is the E2E build's`);
  }
  if (config?.extra?.router?.sitemap !== false) {
    found.push("extra.router.sitemap is not false: expo-router adds a /_sitemap route the house did not write");
  }
  return found;
}

/** Findings in a merged Android manifest, as XML text. */
function checkManifest(xml) {
  const found = [];
  const tree = parseXml(xml);
  const all = [...elements(tree)];
  const app = all.filter((e) => e.name === 'application');
  if (app.length !== 1) return [`the manifest has ${app.length} <application> elements, not one: is this a manifest?`];
  const a = app[0].attrs;
  if (a['android:usesCleartextTraffic'] === 'true') found.push('<application> allows plain http (android:usesCleartextTraffic="true")');
  if (a['android:networkSecurityConfig']) {
    found.push(`<application> names a network security config (${a['android:networkSecurityConfig']}), which this guard cannot read: it can open plain http or trust other certificates`);
  }
  if (a['android:debuggable'] === 'true') found.push('<application> is debuggable');
  if (a['android:testOnly'] === 'true') found.push('<application> is test-only');
  for (const e of all) {
    if (e.name === 'instrumentation') found.push(`an <instrumentation> (${e.attrs['android:name'] ?? 'unnamed'}): a test runner is declared`);
    if (e.name === 'uses-library' && /^android\.test\./.test(e.attrs['android:name'] ?? '')) found.push(`<uses-library ${e.attrs['android:name']}>: a test library`);
    const name = e.attrs['android:name'] ?? '';
    if (COMPONENTS.includes(e.name) && DEV_PACKAGES.some((p) => name.startsWith(p))) found.push(`<${e.name} ${name}>: development tooling`);
    if (e.name === 'meta-data' && name === SCANNER && e.attrs['tools:node'] !== 'remove') {
      found.push(`<meta-data ${SCANNER}="${e.attrs['android:value']}">: the dev launcher's code scanner`);
    }
    const scheme = e.name === 'data' ? e.attrs['android:scheme'] ?? '' : '';
    if (scheme.startsWith('exp+') || scheme === 'expo-dev-launcher') found.push(`the scheme ${scheme}: development tooling's way in`);
  }
  const main = all.filter((e) => e.name === 'activity' && /(^|\.)MainActivity$/.test(e.attrs['android:name'] ?? ''));
  if (main.length !== 1) found.push(`${main.length} MainActivity elements, not one: the app's own activity cannot be read`);
  else {
    const kept = (main[0].attrs['android:configChanges'] ?? '').split('|');
    const lost = KEPT_IN_PLACE.filter((c) => !kept.includes(c));
    if (lost.length) found.push(`MainActivity rebuilds the app on ${lost.join(', ')} (android:configChanges): a turn, a fold or a split-screen resize loses the member's place`);
  }
  for (const host of E2E_HOSTS) if (xml.includes(host)) found.push(`the E2E host ${host}`);
  return found;
}

/** Findings in an iOS Info.plist, as its parsed value. */
function checkPlist(plist) {
  const found = [];
  for (const type of plist.CFBundleURLTypes ?? []) {
    for (const scheme of type.CFBundleURLSchemes ?? []) {
      if (String(scheme).startsWith('exp+')) found.push(`the URL scheme ${scheme}: development tooling's way in`);
    }
  }
  const ats = plist.NSAppTransportSecurity ?? {};
  for (const key of ['NSAllowsArbitraryLoads', 'NSAllowsArbitraryLoadsForMedia', 'NSAllowsArbitraryLoadsInWebContent', 'NSAllowsLocalNetworking']) {
    if (ats[key] === true) found.push(`NSAppTransportSecurity.${key} is true: plain http is allowed`);
  }
  if (ats.NSExceptionDomains) found.push(`NSAppTransportSecurity.NSExceptionDomains names ${Object.keys(ats.NSExceptionDomains).join(', ')}: an exception to https`);
  for (const key of Object.keys(plist)) if (/^(DEV_CLIENT_|EXDevMenu)/.test(key)) found.push(`${key}: a development client setting`);
  const turns = plist['UISupportedInterfaceOrientations~ipad'] ?? [];
  const locked = IPAD_TURNS.filter((o) => !turns.includes(o));
  if (locked.length) found.push(`the iPad cannot hold the app ${locked.join(', ')} (UISupportedInterfaceOrientations~ipad): decision 8, every iPad window works`);
  if (plist.UIRequiresFullScreen === true) found.push('UIRequiresFullScreen is true: the iPad refuses the app Split View and Slide Over (decision 8)');
  const text = JSON.stringify(plist);
  for (const host of E2E_HOSTS) if (text.includes(host)) found.push(`the E2E host ${host}`);
  return found;
}

/**
 * Findings in a production JavaScript bundle (Hermes bytecode or plain): its
 * strings are read as bytes, where Hermes keeps them whole.
 */
function checkBundle(buf, backend = productionBackend()) {
  const found = [];
  const text = buf.toString('latin1');
  for (const host of E2E_HOSTS) if (text.includes(host)) found.push(`the E2E host ${host}: the E2E backend is built in`);
  if (text.includes(E2E_KEY)) found.push("the local stack's anon key: the E2E backend is built in");
  if (!text.includes(backend.url)) found.push(`no ${backend.url}: the production backend is not the one built in`);
  if (!text.includes(backend.key)) found.push("not the production anon key: the production backend's key is not the one built in");
  const crashes = [...text.matchAll(/test crash/gi)].filter((m) => text.slice(m.index - 7, m.index + 10) !== TEST_CRASH.label);
  if (crashes.length) found.push(`"test crash" ${crashes.length} time(s) outside the one written exception ("${TEST_CRASH.label}", ${TEST_CRASH.file})`);
  return found;
}

/** Why an input may not be read, or null: the guard reads real builds only. */
function refusal(paths, env = process.env) {
  if (env.E2E === '1') return 'E2E is set: this guard reads only what is built without it';
  const apk = paths.find((p) => /\.apk$/i.test(p) || /[\\/]outputs[\\/]apk[\\/]/.test(p) || /e2e-app/.test(p));
  return apk ? `${apk} is the E2E app, or an APK: this guard reads the release manifest, the bundles and the store artifacts` : null;
}

// ── Running it ──────────────────────────────────────────────────────────────

/** Every bundle under an export folder. */
function bundlesIn(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(hbc|js)$/.test(e.name) && /[\\/]_expo[\\/]static[\\/]js[\\/]/.test(p)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** The named files in a zip (an AAB or IPA), by a test on each entry's path. */
async function fromZip(file, wanted) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(readFileSync(file));
  const out = {};
  for (const [key, test] of Object.entries(wanted)) {
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && test(n));
    if (names.length !== 1) throw new Error(`${file}: ${names.length} entries for ${key}, not one`);
    out[key] = { name: names[0], data: await zip.files[names[0]].async('nodebuffer') };
  }
  return out;
}

/** The AAB's manifest as XML, through bundletool. */
function bundletoolManifest(aab, jar) {
  const r = spawnSync('java', ['-jar', jar, 'dump', 'manifest', '--bundle', aab], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.error) throw new Error(`java could not run bundletool (${r.error.message}): install a JDK, and pass --bundletool <bundletool.jar>`);
  if (r.status !== 0) throw new Error(`bundletool failed: ${r.stderr.trim()}`);
  return r.stdout;
}

/**
 * Each input, read and checked: [{ what, path, findings }]. `dumpManifest`
 * reads an AAB's manifest (bundletool in real use).
 */
async function guard(opts, { dumpManifest = bundletoolManifest, backend } = {}) {
  const results = [];
  const add = (what, path, findings) => results.push({ what, path, findings });
  if (opts.config) add('config', opts.config, checkConfig(JSON.parse(readFileSync(opts.config, 'utf8'))));
  if (opts.bundles) {
    const files = bundlesIn(opts.bundles);
    if (!files.length) add('bundles', opts.bundles, ['no bundle under _expo/static/js: nothing was read']);
    for (const f of files) add('bundle', f, checkBundle(readFileSync(f), backend));
  }
  if (opts.manifest) add('manifest', opts.manifest, checkManifest(readFileSync(opts.manifest, 'utf8')));
  if (opts.plist) add('plist', opts.plist, checkPlist(parsePlist(readFileSync(opts.plist))));
  if (opts.aab) {
    if (!opts.bundletool && dumpManifest === bundletoolManifest) throw new Error('--aab needs --bundletool <bundletool.jar> to read its manifest');
    const z = await fromZip(opts.aab, {
      config: (n) => n === 'base/assets/app.config',
      bundle: (n) => n === 'base/assets/index.android.bundle',
    });
    add('manifest', `${opts.aab} (base)`, checkManifest(dumpManifest(opts.aab, opts.bundletool)));
    add('config', `${opts.aab}:${z.config.name}`, checkConfig(JSON.parse(z.config.data.toString('utf8'))));
    add('bundle', `${opts.aab}:${z.bundle.name}`, checkBundle(z.bundle.data, backend));
  }
  if (opts.ipa) {
    const z = await fromZip(opts.ipa, {
      plist: (n) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(n),
      config: (n) => /^Payload\/[^/]+\.app\/EXConstants\.bundle\/app\.config$/.test(n),
      bundle: (n) => /^Payload\/[^/]+\.app\/main\.jsbundle$/.test(n),
    });
    add('plist', `${opts.ipa}:${z.plist.name}`, checkPlist(parsePlist(z.plist.data)));
    add('config', `${opts.ipa}:${z.config.name}`, checkConfig(JSON.parse(z.config.data.toString('utf8'))));
    add('bundle', `${opts.ipa}:${z.bundle.name}`, checkBundle(z.bundle.data, backend));
  }
  return results;
}

const FLAGS = ['config', 'bundles', 'manifest', 'plist', 'aab', 'ipa', 'bundletool'];

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i].replace(/^--/, '');
    if (!FLAGS.includes(flag) || !argv[i + 1]) throw new Error(`unknown or empty argument ${argv[i]} (takes --${FLAGS.join(', --')})`);
    opts[flag] = argv[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inputs = FLAGS.filter((f) => f !== 'bundletool' && opts[f]).map((f) => opts[f]);
  if (!inputs.length) throw new Error(`nothing to read: pass any of --${FLAGS.join(', --')}`);
  const no = refusal(inputs);
  if (no) { console.log(`REFUSED: ${no}`); process.exit(1); }
  for (const p of inputs) if (!existsSync(p) || (statSync(p).isDirectory() !== (p === opts.bundles))) throw new Error(`${p} is not there`);
  const results = await guard(opts);
  let bad = 0;
  for (const r of results) {
    const shown = r.path.startsWith(MOBILE) ? relative(MOBILE, r.path) : r.path;
    if (!r.findings.length) { console.log(`held    ${r.what.padEnd(8)} ${shown}`); continue; }
    bad += r.findings.length;
    console.log(`FAILED  ${r.what.padEnd(8)} ${shown}`);
    for (const f of r.findings) console.log(`          ${f}`);
  }
  console.log(bad ? `\n${bad} finding(s): this build breaks the release rules.` : '\nEvery rule held.');
  process.exit(bad ? 1 : 0);
}

module.exports = {
  TEST_CRASH, E2E_HOSTS, E2E_KEY,
  parseXml, parsePlist, checkConfig, checkManifest, checkPlist, checkBundle, refusal, guard, parseArgs,
};

if (require.main === module) {
  main().catch((e) => { console.log(`ERROR: ${e.message}`); process.exit(1); });
}
