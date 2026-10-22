/**
 * What ships holds the release rules, and the guard that says so can say no.
 * ─────────────────────────────────────────────────────────────────────────────
 * scripts/release-guard.cjs reads what a store build is made of: the merged
 * release manifest, the Info.plist, the config the build embeds and the
 * production bundles (god_tier_ci.yml), and an EAS build's own download
 * before it is submitted. Here each rule is shown failing on the thing it
 * forbids and holding on a build without it, in every format it reads; its
 * input is shown never to be the E2E app; and the facts it leans on are held
 * in the files that make them.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { readCode } from '@/test-utils/readCode';
import { files as universe, rel } from '@/test-utils/universe';

const { parseAllDocuments, parseDocument } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');
const JSZip = require('jszip');

const MOBILE = join(__dirname, '..', '..', '..');
const SCRIPT = join(MOBILE, 'scripts', 'release-guard.cjs');
const G = require(SCRIPT);

const BACKEND = { url: 'https://example-ref.supabase.co', key: 'sb_publishable_example' };

// ── Inputs in the shape of a release build ──────────────────────────────────

/** A merged release manifest, its libraries' parts in it, with `extra` inside <application>. */
const manifest = (extra = '', appAttrs = '') => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.reelhouse.society">
  <uses-permission android:name="android.permission.INTERNET"/>
  <!-- a comment with <activity android:name="expo.modules.devlauncher.X"/> in it is not an element -->
  <application android:name=".MainApplication" android:allowBackup="true"${appAttrs}>
    <meta-data android:name="expo.modules.updates.ENABLED" android:value="true"/>
    <activity android:name=".MainActivity" android:launchMode="singleTask" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.VIEW"/>
        <data android:scheme="reelhouse"/>
        <data android:scheme="com.reelhouse.society"/>
      </intent-filter>
    </activity>
    <service android:name="expo.modules.notifications.service.ExpoFirebaseMessagingService" android:exported="false"/>
    <provider android:name="expo.modules.filesystem.FileSystemFileProvider" android:authorities="a &amp; b"/>
    ${extra}
  </application>
</manifest>
`;

const PLIST = {
  CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
  CFBundleURLTypes: [{ CFBundleURLSchemes: ['reelhouse', 'com.reelhouse.society'] }],
  NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: false },
  NSCameraUsageDescription: 'Café portrait & more',
  UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
  LSRequiresIPhoneOS: true,
};

const xmlPlist = (v: unknown, pad = ''): string => {
  if (v === true || v === false) return `${pad}<${v}/>`;
  if (typeof v === 'number') return `${pad}<integer>${v}</integer>`;
  if (typeof v === 'string') return `${pad}<string>${v.replace(/&/g, '&amp;')}</string>`;
  if (Array.isArray(v)) return v.length ? `${pad}<array>\n${v.map((x) => xmlPlist(x, `${pad}  `)).join('\n')}\n${pad}</array>` : `${pad}<array/>`;
  const o = v as Record<string, unknown>;
  return `${pad}<dict>\n${Object.keys(o).map((k) => `${pad}  <key>${k}</key>\n${xmlPlist(o[k], `${pad}  `)}`).join('\n')}\n${pad}</dict>`;
};
const toXmlPlist = (v: unknown) => Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${xmlPlist(v)}
</plist>
`);

/** A binary property list, as Xcode writes into a built app: one-byte refs, two-byte offsets. */
const toBinaryPlist = (value: unknown): Buffer => {
  const objs: Buffer[] = [];
  const head = (kind: number, n: number) => Buffer.from(n < 15 ? [(kind << 4) | n] : [(kind << 4) | 0xf, 0x10, n]);
  const add = (v: unknown): number => {
    const at = objs.push(Buffer.alloc(0)) - 1;
    if (v === true || v === false) objs[at] = Buffer.from([v ? 0x09 : 0x08]);
    else if (typeof v === 'number') objs[at] = Buffer.from([0x10, v]);
    else if (typeof v === 'string') {
      const ascii = [...v].every((c) => c.charCodeAt(0) < 128);
      objs[at] = Buffer.concat([head(ascii ? 0x5 : 0x6, v.length), ascii ? Buffer.from(v, 'latin1') : Buffer.from(v, 'utf16le').swap16()]);
    } else if (Array.isArray(v)) {
      const refs = v.map(add);
      objs[at] = Buffer.concat([head(0xa, refs.length), Buffer.from(refs)]);
    } else {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).map(add);
      const vals = Object.keys(o).map((k) => add(o[k]));
      objs[at] = Buffer.concat([head(0xd, keys.length), Buffer.from([...keys, ...vals])]);
    }
    return at;
  };
  add(value);
  const offsets: number[] = [];
  let at = 8;
  for (const o of objs) { offsets.push(at); at += o.length; }
  const table = Buffer.alloc(offsets.length * 2);
  offsets.forEach((o, k) => table.writeUInt16BE(o, k * 2));
  const trailer = Buffer.alloc(32);
  trailer[6] = 2;
  trailer[7] = 1;
  trailer.writeBigUInt64BE(BigInt(objs.length), 8);
  trailer.writeBigUInt64BE(0n, 16);
  trailer.writeBigUInt64BE(BigInt(at), 24);
  return Buffer.concat([Buffer.from('bplist00', 'latin1'), ...objs, table, trailer]);
};

const CONFIG = {
  name: 'The ReelHouse Society',
  plugins: [['expo-router', { sitemap: false }], ['expo-dev-client', { addGeneratedScheme: false }], './plugins/withSplashWithoutHandoff'],
  extra: { router: { sitemap: false }, eas: { projectId: 'x' } },
};

/** A bundle's bytes: Hermes keeps its strings whole, run together. */
const bundle = (...strings: string[]) => Buffer.concat([Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0, 0]), Buffer.from(strings.join(''), 'latin1')]);
const CLEAN_BUNDLE = bundle('getDefaultHeaderHeight', 'http://localhost:8081', BACKEND.url, BACKEND.key, '[e2e] ');

/** The local stack's anon key, made as the Supabase CLI makes it (e2e/anon-key.mjs). */
const b64u = (s: string) => Buffer.from(s).toString('base64url');
const E2E_ANON = [b64u('{"alg":"HS256","typ":"JWT"}'), b64u('{"iss":"supabase-demo","role":"anon","exp":1983812996}'), 'signature'].join('.');

// ── The rules, each saying no ───────────────────────────────────────────────

describe('the merged release manifest', () => {
  it('holds when it carries no door, test runner, dev tool or E2E host', () => {
    expect(G.checkManifest(manifest())).toEqual([]);
    // The app manifest's own removal of the scanner is not the scanner.
    expect(G.checkManifest(manifest('<meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" tools:node="remove"/>'))).toEqual([]);
  });

  it.each([
    ['plain http', '', ' android:usesCleartextTraffic="true"', 'plain http'],
    ['a network security config', '', ' android:networkSecurityConfig="@xml/network_security_config"', 'network security config'],
    ['debuggable', '', ' android:debuggable="true"', 'debuggable'],
    ['test-only', '', ' android:testOnly="true"', 'test-only'],
    ['the dev launcher', '<activity android:name="expo.modules.devlauncher.launcher.DevLauncherActivity"/>', '', 'development tooling'],
    ['the dev menu', '<activity android:name="com.facebook.react.devsupport.DevSettingsActivity" android:exported="false"/>', '', 'development tooling'],
    ['the exp+ scheme', '<activity android:name=".Other"><intent-filter><data android:scheme="exp+reelhouse"/></intent-filter></activity>', '', 'exp+reelhouse'],
    ['the code scanner', '<meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui"/>', '', 'code scanner'],
    ['the E2E host', '<meta-data android:name="x" android:value="http://10.0.2.2:54321"/>', '', '10.0.2.2'],
    ['a test runner', '<uses-library android:name="android.test.runner"/>', '', 'test library'],
  ])('says no to %s', (_, extra, attrs, said) => {
    const found = G.checkManifest(manifest(extra, attrs));
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.join('\n')).toContain(said);
  });

  it('says no to an <instrumentation>, which sits outside <application>', () => {
    const xml = manifest().replace('</manifest>', '<instrumentation android:name="androidx.test.runner.AndroidJUnitRunner"/></manifest>');
    expect(G.checkManifest(xml)).toEqual(['an <instrumentation> (androidx.test.runner.AndroidJUnitRunner): a test runner is declared']);
  });

  it('refuses what is not a manifest, rather than pass it', () => {
    expect(G.checkManifest('<resources/>')).toEqual(['the manifest has 0 <application> elements, not one: is this a manifest?']);
    expect(() => G.checkManifest('<manifest><application></manifest>')).toThrow(/closes <manifest>/);
  });
});

describe('the Info.plist', () => {
  it('reads the same value from XML and from the binary format a built app holds', () => {
    expect(G.parsePlist(toXmlPlist(PLIST))).toEqual(PLIST);
    expect(G.parsePlist(toBinaryPlist(PLIST))).toEqual(PLIST);
  });

  it('holds with https only and the app\'s own schemes', () => {
    expect(G.checkPlist(PLIST)).toEqual([]);
  });

  it.each([
    ['the exp+ scheme', { CFBundleURLTypes: [...PLIST.CFBundleURLTypes, { CFBundleURLSchemes: ['exp+reelhouse'] }] }, 'exp+reelhouse'],
    ['local networking over http, as the Expo template has it', { NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true } }, 'NSAllowsLocalNetworking'],
    ['any host over http', { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } }, 'NSAllowsArbitraryLoads'],
    ['an exception domain', { NSAppTransportSecurity: { NSExceptionDomains: { localhost: { NSExceptionAllowsInsecureHTTPLoads: true } } } }, 'localhost'],
    ['a development client setting', { DEV_CLIENT_TRY_TO_LAUNCH_LAST_BUNDLE: false }, 'development client'],
  ])('says no to %s, in either format', (_, change, said) => {
    const plist = { ...PLIST, ...change };
    for (const read of [G.parsePlist(toXmlPlist(plist)), G.parsePlist(toBinaryPlist(plist))]) {
      expect(G.checkPlist(read).join('\n')).toContain(said);
    }
  });
});

describe('the config the build embeds', () => {
  it('holds with no E2E switch or plugin, and the sitemap off', () => {
    expect(G.checkConfig(CONFIG)).toEqual([]);
  });

  it('says no to the E2E trace\'s switch, the cleartext plugin, and the sitemap left on', () => {
    expect(G.checkConfig({ ...CONFIG, extra: { ...CONFIG.extra, e2e: true } })).toEqual([
      "extra.e2e is true: the E2E trace's switch (src/utils/e2eTrace.ts) is in the build",
    ]);
    expect(G.checkConfig({ ...CONFIG, plugins: [...CONFIG.plugins, './e2e/plugins/withCleartextTraffic'] })).toEqual([
      "the plugin ./e2e/plugins/withCleartextTraffic is the E2E build's",
    ]);
    expect(G.checkConfig({ ...CONFIG, extra: { ...CONFIG.extra, router: {} } }).join('\n')).toContain('/_sitemap');
  });
});

describe('the production bundle', () => {
  it('holds with the production backend built in, and a library\'s own localhost default', () => {
    expect(G.checkBundle(CLEAN_BUNDLE, BACKEND)).toEqual([]);
  });

  it('says no to the E2E backend, its key, and another backend', () => {
    expect(G.checkBundle(bundle('http://10.0.2.2:54321', E2E_ANON), BACKEND)).toEqual([
      'the E2E host 10.0.2.2: the E2E backend is built in',
      'the E2E host :54321: the E2E backend is built in',
      "the local stack's anon key: the E2E backend is built in",
      `no ${BACKEND.url}: the production backend is not the one built in`,
      "not the production anon key: the production backend's key is not the one built in",
    ]);
  });

  it('lets the one written test crash through, by its label, and no other', () => {
    expect(G.checkBundle(bundle(CLEAN_BUNDLE.toString('latin1'), G.TEST_CRASH.label), BACKEND)).toEqual([]);
    expect(G.checkBundle(bundle(CLEAN_BUNDLE.toString('latin1'), 'Throw a test crash'), BACKEND)).toEqual([
      `"test crash" 1 time(s) outside the one written exception ("${G.TEST_CRASH.label}", ${G.TEST_CRASH.file})`,
    ]);
  });
});

// ── An EAS build's own download, before it is submitted ─────────────────────

describe('an EAS build, read before it is submitted', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'release-guard-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const zip = async (name: string, files: Record<string, Buffer | string>) => {
    const z = new JSZip();
    for (const [p, data] of Object.entries(files)) z.file(p, data);
    const path = join(dir, name);
    writeFileSync(path, await z.generateAsync({ type: 'nodebuffer' }));
    return path;
  };
  const aab = (config: object, js: Buffer) => zip('build.aab', {
    'base/assets/app.config': JSON.stringify(config), 'base/assets/index.android.bundle': js, 'base/manifest/AndroidManifest.xml': 'proto',
  });
  const ipa = (config: object, js: Buffer, plist: object) => zip('build.ipa', {
    'Payload/TheReelHouseSociety.app/Info.plist': toBinaryPlist(plist),
    'Payload/TheReelHouseSociety.app/EXConstants.bundle/app.config': JSON.stringify(config),
    'Payload/TheReelHouseSociety.app/main.jsbundle': js,
    'Payload/TheReelHouseSociety.app/Frameworks/X.framework/Info.plist': toBinaryPlist({ CFBundleURLTypes: [{ CFBundleURLSchemes: ['exp+x'] }] }),
  });
  const findings = (results: { findings: string[] }[]) => results.flatMap((r) => r.findings);

  it('an AAB: its manifest through bundletool, its embedded config and its bundle', async () => {
    const asked: string[] = [];
    const dumpManifest = (file: string) => { asked.push(file); return manifest(); };
    const good = await aab(CONFIG, CLEAN_BUNDLE);
    const results = await G.guard({ aab: good }, { dumpManifest, backend: BACKEND });
    expect(results.map((r: { what: string }) => r.what)).toEqual(['manifest', 'config', 'bundle']);
    expect(findings(results)).toEqual([]);
    expect(asked).toEqual([good]);

    const bad = await aab({ ...CONFIG, extra: { ...CONFIG.extra, e2e: true } }, bundle('http://10.0.2.2:54321', BACKEND.url, BACKEND.key));
    const scheme = () => manifest('<activity android:name=".X"><intent-filter><data android:scheme="exp+reelhouse"/></intent-filter></activity>');
    expect(findings(await G.guard({ aab: bad }, { dumpManifest: scheme, backend: BACKEND }))).toEqual([
      "the scheme exp+reelhouse: development tooling's way in",
      "extra.e2e is true: the E2E trace's switch (src/utils/e2eTrace.ts) is in the build",
      'the E2E host 10.0.2.2: the E2E backend is built in',
      'the E2E host :54321: the E2E backend is built in',
    ]);
  });

  it('an IPA: the app\'s own Info.plist (binary), its embedded config and its bundle', async () => {
    const good = await ipa(CONFIG, CLEAN_BUNDLE, PLIST);
    expect(findings(await G.guard({ ipa: good }, { backend: BACKEND }))).toEqual([]);
    const bad = await ipa(CONFIG, CLEAN_BUNDLE, { ...PLIST, NSAppTransportSecurity: { NSAllowsLocalNetworking: true } });
    expect(findings(await G.guard({ ipa: bad }, { backend: BACKEND }))).toEqual(['NSAppTransportSecurity.NSAllowsLocalNetworking is true: plain http is allowed']);
  });

  it('refuses an AAB without bundletool, and a download missing its parts', async () => {
    const good = await aab(CONFIG, CLEAN_BUNDLE);
    await expect(G.guard({ aab: good })).rejects.toThrow('--aab needs --bundletool <bundletool.jar>');
    const empty = await zip('empty.ipa', { 'Payload/X.app/Info.plist': toBinaryPlist(PLIST) });
    await expect(G.guard({ ipa: empty }, { backend: BACKEND })).rejects.toThrow(/0 entries for config, not one/);
  });
});

// ── Its input is never the E2E app ──────────────────────────────────────────

describe('the input is a real build, never the E2E app', () => {
  const run = (args: string[], env: Record<string, string> = {}) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, E2E: '', ...env } });
    return { status: r.status, out: r.stdout.trim() };
  };

  it('refuses the E2E APK, any APK, and any run with E2E set, before reading anything', () => {
    expect(G.refusal(['android/app/build/outputs/apk/release/app-release.apk'], {})).toMatch(/is the E2E app, or an APK/);
    expect(G.refusal(['/tmp/e2e-app/anon-key.txt'], {})).toMatch(/is the E2E app/);
    // An APK downloaded anywhere: a store build is an AAB, so an APK is never what ships.
    expect(G.refusal(['C:/Downloads/build-1234.APK'], {})).toMatch(/is the E2E app, or an APK/);
    expect(G.refusal(['x/AndroidManifest.xml'], { E2E: '1' })).toBe('E2E is set: this guard reads only what is built without it');
    expect(G.refusal(['android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml', 'build.aab'], {})).toBeNull();
    expect(run(['--manifest', 'android/app/build/outputs/apk/release/app-release.apk'])).toEqual({
      status: 1, out: 'REFUSED: android/app/build/outputs/apk/release/app-release.apk is the E2E app, or an APK: this guard reads the release manifest, the bundles and the store artifacts',
    });
    expect(run(['--manifest', SCRIPT], { E2E: '1' })).toEqual({ status: 1, out: 'REFUSED: E2E is set: this guard reads only what is built without it' });
  });

  it('cannot pass on nothing: no input, an empty folder, or a path not there', () => {
    expect(run([])).toEqual({ status: 1, out: 'ERROR: nothing to read: pass any of --config, --bundles, --manifest, --plist, --aab, --ipa, --bundletool' });
    const empty = mkdtempSync(join(tmpdir(), 'release-guard-empty-'));
    try {
      expect(run(['--bundles', empty]).out).toContain('no bundle under _expo/static/js: nothing was read');
    } finally { rmSync(empty, { recursive: true, force: true }); }
    expect(run(['--plist', join(MOBILE, 'not-there.plist')]).out).toMatch(/^ERROR: .*not-there\.plist is not there$/);
  });

  type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, unknown> };
  type Job = { env?: Record<string, unknown>; steps: Step[] };
  const workflow = (file: string) => parseDocument(readFileSync(join(MOBILE, '..', '.github', 'workflows', file), 'utf8')).toJS() as { env?: Record<string, unknown>; jobs: Record<string, Job> };
  const WORKFLOWS = universe('workflows', { ext: ['.yml'] }).map((f) => basename(f));

  it('every CI step that runs it reads a build made without E2E, in a job that never fetches the E2E app', () => {
    const calls = WORKFLOWS.flatMap((file) => {
      const wf = workflow(file);
      return Object.entries(wf.jobs).flatMap(([id, job]) => (job.steps ?? [])
        .filter((s) => /release-guard\.cjs/.test(s.run ?? ''))
        .map((s) => ({ file, id, job, step: s, wf })));
    });
    expect(calls.map((c) => `${c.file} ${c.id}`)).toEqual(['god_tier_ci.yml bundle-size', 'god_tier_ci.yml release-build']);
    for (const { job, step, wf } of calls) {
      for (const env of [wf.env, job.env, ...job.steps.map((s) => s.env)]) expect(Object.keys(env ?? {})).not.toContain('E2E');
      expect(job.steps.filter((s) => /download-artifact/.test(s.uses ?? '')).map((s) => s.name)).toEqual([]);
      expect(job.steps.map((s) => s.run ?? '').join('\n')).not.toMatch(/\.apk\b|outputs\/apk|\bE2E=|assembleRelease/);
      expect(step.run).toMatch(/--(bundles|manifest)/);
    }
    // The native job makes what a store build starts from: both platforms,
    // and Gradle's merged release manifest.
    const native = calls.find((c) => c.id === 'release-build')!.job.steps.map((s) => s.run ?? '').join('\n');
    expect(native).toContain('npx expo prebuild --platform all --no-install --clean');
    expect(native).toContain('./gradlew :app:processReleaseManifest');
    expect(native).toContain('getAppConfig.js');
    expect(native).toMatch(/release-guard\.cjs --config "\$RUNNER_TEMP\/embedded\/app\.config" \\\s+--manifest "\$manifest" --plist "\$plist"/);
    // The bundles it reads are the ones bundle-size.js weighs and keeps.
    const bundles = calls.find((c) => c.id === 'bundle-size')!.job.steps.map((s) => s.run ?? '').join('\n');
    expect(bundles).toContain('npm run --silent bundle:size -- --keep "$RUNNER_TEMP/bundles"');
    expect(bundles).toContain('release-guard.cjs --bundles "$RUNNER_TEMP/bundles"');
    expect(readFileSync(join(MOBILE, 'scripts', 'bundle-size.js'), 'utf8')).toMatch(/if \(!keep\) fs\.rmSync\(out/);
  });
});

// ── The facts the rules lean on ─────────────────────────────────────────────

const APP_FILES = universe('appCode', { ext: ['.ts', '.tsx'] }).map(rel);

it('the E2E trace is off unless the embedded config turns it on: extra.e2e is its only switch', () => {
  // The config rule reads extra.e2e out of the build; that proves the trace
  // inert only while nothing else can turn E2E code on.
  expect(readCode('src/utils/e2eTrace.ts')).toMatch(/const ON = Constants\.expoConfig\?\.extra\?\.e2e === true;/);
  const other = APP_FILES.filter((f) => /process\.env\.E2E|EXPO_PUBLIC_E2E/.test(readCode(f)));
  expect(other).toEqual([]);
  expect(APP_FILES.length).toBeGreaterThan(200);
});

it('the one written exception names a file that exists, and its label is written in no other', () => {
  expect(existsSync(join(MOBILE, G.TEST_CRASH.file))).toBe(true);
  const elsewhere = APP_FILES.filter((f) => f !== G.TEST_CRASH.file && readFileSync(join(MOBILE, f), 'utf8').includes(G.TEST_CRASH.label));
  expect(elsewhere).toEqual([]);
});

it('an E2E flow opens reelhouse://_sitemap with the app closed, and waits for the not-found screen', () => {
  const flows = universe('runFlows').map((f) => basename(f));
  const steps = flows.flatMap((f) => {
    const docs = parseAllDocuments(readFileSync(join(MOBILE, '.maestro', f), 'utf8')).map((d) => d.toJS());
    return Array.isArray(docs[1]) ? [{ f, steps: docs[1] as unknown[] }] : [];
  });
  // Between the link and the wait, only iOS's answer to its own "Open in ...?" (an iPhone asks first).
  const iosAnswer = (x: unknown) => (x as { runFlow?: { file?: string } })?.runFlow?.file === 'subflows/open_link_on_ios.yaml';
  const SITEMAP = 'reelhouse://_sitemap';
  type Flow = { runFlow?: { when?: { platform?: string }; commands?: unknown[] } };
  /** Whether a step list is the link alone: openLink, or openLink inside one retry. */
  const linkAlone = (cs: unknown[] | undefined): boolean => cs?.length === 1 && (
    (cs[0] as { openLink?: string })?.openLink === SITEMAP
    || linkAlone((cs[0] as { retry?: { commands?: unknown[] } })?.retry?.commands));
  /** The steps after the link: the link itself, or one per platform (Android's and iOS's), each the link alone. */
  const afterLink = (s: unknown[], at: number): number | null => {
    if ((s[at] as { openLink?: string })?.openLink === SITEMAP) return at + 1;
    const pair = [s[at], s[at + 1]] as Flow[];
    const platforms = pair.map((x) => x?.runFlow?.when?.platform).sort().join(',');
    return platforms === 'Android,iOS' && pair.every((x) => linkAlone(x.runFlow?.commands)) ? at + 2 : null;
  };
  const found = steps.filter(({ steps: s }) => s.some((step, i) => {
    const next = step === 'stopApp' ? afterLink(s, i + 1) : null;
    if (next === null) return false;
    const wait = iosAnswer(s[next]) ? s[next + 1] : s[next];
    return (wait as { extendedWaitUntil?: { visible?: string } })?.extendedWaitUntil?.visible === 'ROUTE NOT IN THE ARCHIVE';
  }));
  expect(found.map((x) => x.f)).toEqual(['auth_deep_link.yaml']);
  // A platform's link left out, or anything but the link (or its one retry) in its place, is no cold open.
  const android = { runFlow: { when: { platform: 'Android' }, commands: [{ openLink: SITEMAP }] } };
  const ios = { runFlow: { when: { platform: 'iOS' }, commands: [{ retry: { maxRetries: 1, commands: [{ openLink: SITEMAP }] } }] } };
  expect(afterLink([android, ios], 0)).toBe(2);
  expect(afterLink([android, android], 0)).toBeNull();
  expect(afterLink([android, { runFlow: { when: { platform: 'iOS' }, commands: [{ launchApp: null }, { openLink: SITEMAP }] } }], 0)).toBeNull();
  // Its title is the one app/+not-found.tsx draws.
  expect(readCode('app/+not-found.tsx')).toContain('ROUTE NOT IN THE ARCHIVE');
});
