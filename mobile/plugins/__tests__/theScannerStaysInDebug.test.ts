/**
 * theScannerStaysInDebug.test.ts — the store build does not ask Google Play services for the
 * dev launcher's code scanner.
 *
 * Up to SDK 56, expo-dev-launcher's MAIN manifest asked for ML Kit's code scanner
 * (`com.google.mlkit.vision.DEPENDENCIES` = barcode_ui), so every release build carried it, and a
 * plugin of ours (withoutDevLauncherScanner) marked it for removal. From SDK 57 the launcher asks
 * for it in its DEBUG manifest alone, so no release build merges it, and the plugin went. This holds
 * the installed launcher to that: should its main manifest ask for the scanner again, the plugin
 * comes back. scripts/release-guard.cjs still fails a merged release manifest that holds it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..');
const SCANNER = 'com.google.mlkit.vision.DEPENDENCIES';
const manifest = (set: 'main' | 'debug') =>
  readFileSync(require.resolve(`expo-dev-launcher/android/src/${set}/AndroidManifest.xml`, { paths: [MOBILE] }), 'utf8');

it('the installed dev launcher asks for the scanner in its debug manifest, and not in its main one', () => {
  // Anchored: the debug manifest is read and does name it, so a wrong path cannot pass for "absent".
  expect(manifest('debug')).toContain(`android:name="${SCANNER}"`);
  expect(manifest('main')).not.toContain(SCANNER);
});

it('the release guard still refuses a merged manifest that asks for it', () => {
  const { checkManifest } = require('../../scripts/release-guard.cjs');
  const asking = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application>
    <meta-data android:name="${SCANNER}" android:value="barcode_ui"/></application></manifest>`;
  expect(checkManifest(asking).join('\n')).toContain('code scanner');
});
