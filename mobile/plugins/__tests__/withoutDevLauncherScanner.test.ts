/**
 * withoutDevLauncherScanner.test.ts — the store build does not ask Google Play
 * services for the dev launcher's code scanner.
 *
 * The plugin is run through the same withAndroidManifest mod prebuild calls, on
 * an app manifest in prebuild's shape, and its output read back as XML; the
 * library entry it removes is read from the installed expo-dev-launcher, so
 * the plugin goes when the entry does.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const plugin = require('../withoutDevLauncherScanner');
const { removeDevLauncherScanner, SCANNER } = plugin;
const { XML } = require('expo/config-plugins');
const { checkManifest } = require('../../scripts/release-guard.cjs');

const MOBILE = join(__dirname, '..', '..');

const APP_MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET"/>
  <application android:name=".MainApplication" android:allowBackup="true">
    <meta-data android:name="expo.modules.updates.ENABLED" android:value="true"/>
    <activity android:name=".MainActivity" android:exported="true"/>
  </application>
</manifest>`;

const REMOVE = `<meta-data android:name="${SCANNER}" tools:node="remove"/>`;

const run = async (xml: string) => {
  const config = plugin({ name: 'reelhouse', slug: 'reelhouse' });
  const result = await config.mods.android.manifest({
    ...config, modResults: await XML.parseXMLAsync(xml), modRequest: { platform: 'android' },
  });
  return XML.format(result.modResults) as string;
};

it('is the mod prebuild runs: the app manifest marks the scanner for removal, and declares the tools namespace', async () => {
  const out = await run(APP_MANIFEST);
  expect(out).toContain('xmlns:tools="http://schemas.android.com/tools"');
  expect(out).toContain(REMOVE);
  // What was there stays.
  expect(out).toContain('<meta-data android:name="expo.modules.updates.ENABLED" android:value="true"/>');
  expect(out).toContain('<activity android:name=".MainActivity" android:exported="true"/>');
  expect(checkManifest(out)).toEqual([]);
});

it('marks it once, however often prebuild runs it, and replaces an entry that asked for it', async () => {
  const twice = await run(await run(APP_MANIFEST));
  expect(twice.split(SCANNER).length - 1).toBe(1);
  const asking = APP_MANIFEST.replace('</application>', `<meta-data android:name="${SCANNER}" android:value="barcode_ui"/></application>`);
  expect(checkManifest(asking).join('\n')).toContain('code scanner');
  const out = await run(asking);
  expect(out.split(SCANNER).length - 1).toBe(1);
  expect(out).toContain(REMOVE);
});

it('throws on a manifest with no application, rather than pass it unmarked', () => {
  expect(() => removeDevLauncherScanner({ manifest: { $: {} } })).toThrow();
});

it('removes what the installed dev launcher asks for: its own main manifest names the scanner', () => {
  const library = readFileSync(require.resolve('expo-dev-launcher/android/src/main/AndroidManifest.xml', { paths: [MOBILE] }), 'utf8');
  expect(library).toMatch(new RegExp(`android:name="${SCANNER.replace(/\./g, '\\.')}"\\s+android:value="barcode_ui"`));
});

it('is in every build: app.json lists it, and the path is this plugin', () => {
  const plugins: unknown[] = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo.plugins;
  const names = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  const ours = names.find((n) => n === './plugins/withoutDevLauncherScanner') as string;
  expect(require.resolve(resolve(MOBILE, ours))).toBe(require.resolve('../withoutDevLauncherScanner'));
});
