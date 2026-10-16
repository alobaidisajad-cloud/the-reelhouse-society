/**
 * A real build is app.json exactly; only the E2E build differs, and only as it says.
 * ─────────────────────────────────────────────────────────────────────────────
 * app.config.js exists for the sealed E2E build (e2e.yml sets E2E=1). The risk
 * it brings is a store build that quietly allows plain http or turns updates
 * off — so both halves are proved here, along with the one place the E2E
 * backend address may appear.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const appConfig = require('../../../app.config.js') as (ctx: { config: Record<string, unknown> }) => Record<string, unknown>;
const appJson = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;

const withE2E = <T,>(value: string | undefined, fn: () => T): T => {
  const before = process.env.E2E;
  if (value === undefined) delete process.env.E2E;
  else process.env.E2E = value;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.E2E;
    else process.env.E2E = before;
  }
};

it('without E2E, the config IS app.json — nothing added, nothing changed', () => {
  for (const value of [undefined, '', '0', 'true']) {
    const config = withE2E(value, () => appConfig({ config: structuredClone(appJson) }));
    expect(config).toEqual(appJson);
  }
});

it('with E2E=1, only updates, the cleartext plugin and the trace switch change', () => {
  const config = withE2E('1', () => appConfig({ config: structuredClone(appJson) }));
  const { updates, plugins, extra, ...rest } = config as { updates: { enabled: boolean }; plugins: unknown[]; extra: Record<string, unknown> };
  const { updates: u0, plugins: p0, extra: x0, ...rest0 } = appJson;
  expect(rest).toEqual(rest0);
  expect(updates).toEqual({ ...u0, enabled: false });
  expect(plugins).toEqual([...p0, './e2e/plugins/withCleartextTraffic']);
  expect(extra).toEqual({ ...x0, e2e: true });
});

const withProfile = <T,>(value: string | undefined, fn: () => T): T => {
  const before = process.env.EAS_BUILD_PROFILE;
  if (value === undefined) delete process.env.EAS_BUILD_PROFILE;
  else process.env.EAS_BUILD_PROFILE = value;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = before;
  }
};
const profiles = Object.keys(JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8')).build);

it('every build profile but development is app.json exactly', () => {
  const others = profiles.filter((p) => p !== 'development');
  expect(others).toEqual(expect.arrayContaining(['production', 'internal', 'preview']));
  for (const profile of [...others, undefined]) {
    expect([profile, withProfile(profile, () => withE2E(undefined, () => appConfig({ config: structuredClone(appJson) })))])
      .toEqual([profile, appJson]);
  }
});

it('the development build gets back only the dev client\'s scheme and iOS\'s local-network allowance', () => {
  expect(profiles).toContain('development');
  const config = withProfile('development', () => withE2E(undefined, () => appConfig({ config: structuredClone(appJson) })));
  const { plugins, ios, ...rest } = config as { plugins: unknown[]; ios: { infoPlist: Record<string, unknown> } };
  const { plugins: p0, ios: i0, ...rest0 } = appJson;
  expect(rest).toEqual(rest0);
  expect(plugins).toEqual(p0.map((p: unknown) => (Array.isArray(p) && p[0] === 'expo-dev-client' ? 'expo-dev-client' : p)));
  expect(plugins).not.toEqual(p0);
  expect(ios).toEqual({ ...i0, infoPlist: { ...i0.infoPlist, NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true } } });
});

it('no real build carries the trace switch', () => {
  expect(appJson.extra?.e2e).toBeUndefined();
});

const entry = (name: string): unknown => appJson.plugins.find((p: unknown) => (Array.isArray(p) ? p[0] : p) === name);

it('no real build carries the development client\'s way in, or a route the house did not write', () => {
  // Without these, expo-dev-client adds an exp+reelhouse scheme and expo-router
  // a /_sitemap route; scripts/release-guard.cjs reads the built result.
  expect(entry('expo-dev-client')).toEqual(['expo-dev-client', expect.objectContaining({ addGeneratedScheme: false })]);
  expect(entry('expo-router')).toEqual(['expo-router', expect.objectContaining({ sitemap: false })]);
  expect(entry('./plugins/withoutDevLauncherScanner')).toBe('./plugins/withoutDevLauncherScanner');
});

it('iOS allows plain http to no host: the template\'s local-network exception is turned off', () => {
  expect(appJson.ios.infoPlist.NSAppTransportSecurity).toEqual({ NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: false });
});

it('EAS uploads the commit alone, numbered as committed', () => {
  // requireCommit: EAS uploads a clone of what is committed, so no ignored or
  // untracked file travels, and a dirty tree is refused. No autoIncrement: with
  // the number kept in app.json, EAS would write a new one during the build,
  // after every check had passed without it.
  const eas = JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8'));
  expect(eas.cli).toEqual(expect.objectContaining({ appVersionSource: 'local', requireCommit: true }));
  const bumping = Object.entries(eas.build as Record<string, Record<string, unknown>>)
    .filter(([, p]) => 'autoIncrement' in p || ['ios', 'android'].some((os) => 'autoIncrement' in ((p[os] as object) ?? {})));
  expect(bumping.map(([name]) => name)).toEqual([]);
  expect(appJson.ios.buildNumber).toMatch(/^[1-9][0-9]*$/);
  expect(Number.isInteger(appJson.android.versionCode) && appJson.android.versionCode > 0).toBe(true);
});

/**
 * The build's identity as the services hold it: Expo's `eas project:info` (the account's own
 * spelling), and the Sentry organization its API knows. A change here is made at the service first.
 */
const IDENTITY = {
  owner: 'thereehouse.society',
  slug: 'reelhouse',
  projectId: '9527b5a1-c663-4262-883c-7b85e6aa748d',
  bundle: 'com.reelhouse.society',
  sentry: { organization: 'the-reelhouse-society', project: 'react-native' },
};

it('names the project as Expo holds it, and asks that project alone for updates (CI-20)', () => {
  expect({ owner: appJson.owner, slug: appJson.slug, projectId: appJson.extra?.eas?.projectId })
    .toEqual({ owner: IDENTITY.owner, slug: IDENTITY.slug, projectId: IDENTITY.projectId });
  // A phone asks this address for updates: another project's would be a feed nobody publishes to.
  expect(appJson.updates.url).toBe(`https://u.expo.dev/${IDENTITY.projectId}`);
  expect([appJson.ios.bundleIdentifier, appJson.android.package]).toEqual([IDENTITY.bundle, IDENTITY.bundle]);
});

it('sends crashes, and the maps that make them readable, to the Sentry project the house reads (CI-20)', () => {
  expect(entry('@sentry/react-native')).toEqual(['@sentry/react-native', { url: 'https://sentry.io/', ...IDENTITY.sentry }]);
  // Metro's Sentry wrapper writes the maps the plugin uploads; switching the upload off leaves every crash minified.
  expect(readFileSync(join(MOBILE, 'metro.config.js'), 'utf8')).toMatch(/= getSentryExpoConfig\(__dirname\b/);
  const easText = readFileSync(join(MOBILE, 'eas.json'), 'utf8');
  expect(easText).not.toMatch(/SENTRY_DISABLE_AUTO_UPLOAD/);
  const eas = JSON.parse(easText);
  expect(eas.build.production.env.EXPO_PUBLIC_SENTRY_DSN).toMatch(/^https:\/\/[0-9a-f]{32}@o\d+\.ingest\.(us\.|de\.)?sentry\.io\/\d+$/);
  expect(eas.build.internal.extends).toBe('production');
});

it('no real build profile sets E2E, or points at a local backend', () => {
  const eas = readFileSync(join(MOBILE, 'eas.json'), 'utf8');
  expect(eas).not.toMatch(/"E2E"/);
  expect(eas).not.toMatch(/10\.0\.2\.2|127\.0\.0\.1|localhost|\.test\b/);
});
