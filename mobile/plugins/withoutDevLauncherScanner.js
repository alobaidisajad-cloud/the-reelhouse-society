/**
 * The dev launcher's barcode scanner stays out of the store build's manifest.
 *
 * expo-dev-launcher is linked into every Android build, release too, and its
 * own main manifest asks for ML Kit's code scanner
 * (`com.google.mlkit.vision.DEPENDENCIES` = barcode_ui), which Google Play
 * services downloads for an app once it is installed. The scanner is the
 * launcher's, for opening a development server by its QR code, and no release
 * build has a launcher. So the app's manifest marks the entry for removal
 * (tools:node="remove"), and Gradle's manifest merger leaves it out.
 *
 * scripts/release-guard.cjs fails a merged release manifest that still holds it.
 */
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SCANNER = 'com.google.mlkit.vision.DEPENDENCIES';

/** The manifest with the scanner's entry marked for removal; unchanged if it is marked already. */
function removeDevLauncherScanner(manifest) {
  AndroidConfig.Manifest.ensureToolsAvailable(manifest);
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const others = (app['meta-data'] ?? []).filter((m) => m.$?.['android:name'] !== SCANNER);
  app['meta-data'] = [...others, { $: { 'android:name': SCANNER, 'tools:node': 'remove' } }];
  return manifest;
}

module.exports = function withoutDevLauncherScanner(config) {
  return withAndroidManifest(config, (mod) => {
    mod.modResults = removeDevLauncherScanner(mod.modResults);
    return mod;
  });
};
module.exports.removeDevLauncherScanner = removeDevLauncherScanner;
module.exports.SCANNER = SCANNER;
