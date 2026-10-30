/**
 * withLeftToRight.test.ts — the house lays out left to right, locked before React Native starts.
 *
 * The plugin is run on MainApplication.kt exactly as `expo prebuild` generates it for this app
 * (fixtures/MainApplication.kt), on AppDelegate.swift as SDK 57's template writes it
 * (fixtures/AppDelegate.swift), and on the generated manifest, through the mods prebuild calls.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const plugin = require('../withLeftToRight');
const { lockMainApplication, lockAppDelegate, MARK } = plugin;

const MOBILE = join(__dirname, '..', '..');
const APPLICATION = readFileSync(join(__dirname, 'fixtures', 'MainApplication.kt'), 'utf8');
const DELEGATE = readFileSync(join(__dirname, 'fixtures', 'AppDelegate.swift'), 'utf8');
const UTIL = 'com.facebook.react.modules.i18nmanager.I18nUtil.instance';

describe('the generated MainApplication', () => {
  const out = lockMainApplication(APPLICATION, 'kt');
  const lines = out.split('\n');

  it('switches right-to-left off straight after super.onCreate(), before React Native loads', () => {
    const at = lines.findIndex((l: string) => l.trim() === 'super.onCreate()');
    expect(lines.slice(at + 1, at + 4)).toEqual([`    // ${MARK}`, `    ${UTIL}.allowRTL(this, false)`, `    ${UTIL}.forceRTL(this, false)`]);
    expect(lines.findIndex((l: string) => l.includes('loadReactNative(this)'))).toBeGreaterThan(at + 3);
  });

  it('changes nothing else, keeps CRLF, and is done once however often prebuild runs it', () => {
    expect(out.replace(`\n    // ${MARK}\n    ${UTIL}.allowRTL(this, false)\n    ${UTIL}.forceRTL(this, false)`, '')).toBe(APPLICATION);
    expect(lockMainApplication(out, 'kt')).toBe(out);
    expect(lockMainApplication(APPLICATION.replace(/\n/g, '\r\n'), 'kt')).toBe(out.replace(/\n/g, '\r\n'));
  });
});

describe('the template AppDelegate', () => {
  const out = lockAppDelegate(DELEGATE, 'swift');
  const lines = out.split('\n');

  it('switches right-to-left off first thing in didFinishLaunching, before the factory starts', () => {
    const at = lines.findIndex((l: string) => l.trim() === ') -> Bool {');
    expect(lines.slice(at + 1, at + 4)).toEqual([
      `    // ${MARK}`, '    RCTI18nUtil.sharedInstance().allowRTL(false)', '    RCTI18nUtil.sharedInstance().forceRTL(false)',
    ]);
    expect(lines.findIndex((l: string) => l.includes('factory.startReactNative('))).toBeGreaterThan(at + 3);
  });

  it('changes nothing else, and is done once', () => {
    expect(out.replace(`\n    // ${MARK}\n    RCTI18nUtil.sharedInstance().allowRTL(false)\n    RCTI18nUtil.sharedInstance().forceRTL(false)`, '')).toBe(DELEGATE);
    expect(lockAppDelegate(out, 'swift')).toBe(out);
  });
});

it('stops the build when it cannot lock in one place — never a silent no-op', () => {
  expect(() => lockMainApplication('class MainApplication', 'kt')).toThrow(/0 super.onCreate\(\) lines, not one/);
  expect(() => lockMainApplication(APPLICATION, 'java')).toThrow(/not Kotlin/);
  expect(() => lockAppDelegate('class AppDelegate {}', 'swift')).toThrow(/no single didFinishLaunching/);
  expect(() => lockAppDelegate(DELEGATE, 'objc')).toThrow(/not Swift/);
});

it('is the mods prebuild runs: the manifest says no right-to-left, and both files are locked', async () => {
  const config = plugin({ name: 'reelhouse', slug: 'reelhouse' });
  const manifest = await config.mods.android.manifest({
    ...config, modResults: { manifest: { application: [{ $: { 'android:supportsRtl': 'true' } }] } }, modRequest: { platform: 'android' },
  });
  expect(manifest.modResults.manifest.application[0].$['android:supportsRtl']).toBe('false');
  const app = await config.mods.android.mainApplication({ ...config, modResults: { contents: APPLICATION, language: 'kt' }, modRequest: { platform: 'android' } });
  expect(app.modResults.contents).toBe(lockMainApplication(APPLICATION, 'kt'));
  const delegate = await config.mods.ios.appDelegate({ ...config, modResults: { contents: DELEGATE, language: 'swift' }, modRequest: { platform: 'ios' } });
  expect(delegate.modResults.contents).toBe(lockAppDelegate(DELEGATE, 'swift'));
});

it('is in every build: app.json lists it, and the path is this plugin', () => {
  const plugins: unknown[] = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo.plugins;
  const names = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  const ours = names.indexOf('./plugins/withLeftToRight');
  expect(ours).toBeGreaterThanOrEqual(0);
  expect(require.resolve(resolve(MOBILE, names[ours] as string))).toBe(require.resolve('../withLeftToRight'));
});
