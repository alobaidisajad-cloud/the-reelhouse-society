/**
 * Android's release is shrunk and its names obfuscated (R8), its unused resources dropped (P4.25a).
 *
 * The template switches both off: a release APK and AAB carried every unused class under its
 * readable name. SDK 57's app/build.gradle reads them from gradle.properties
 * (android.enableMinifyInReleaseBuilds, android.enableShrinkResourcesInReleaseBuilds), which this
 * sets at prebuild. Keep rules are the libraries' own (React Native, Hermes, Reanimated, RevenueCat,
 * MMKV, Sentry ship them) plus the template's proguard-rules.pro; one is added only where a run
 * proves a class is reached by name. Sentry's Android Gradle plugin (app.json, the Sentry plugin's
 * experimental_android) uploads each build's R8 mapping, so a crash still reads; CI builds set
 * SENTRY_DISABLE_AUTO_UPLOAD. Every Sealed E2E flow runs on the shrunk release.
 *
 * KEEP is what the release is read for by name: Sealed E2E reads the built APK's code to prove
 * Glide logs errors only and the picture prefetch downloads without decoding (e2e/glide-log-level.mjs,
 * e2e/prefetch-download-only.mjs). Renamed or folded into a caller, those methods could not be read,
 * and the first shrunk build failed there (run of 211009e5). Kept whole, each check reads a real
 * method, and the rest of the app is shrunk as before.
 *
 * Proven by plugins/__tests__/withShrunkRelease.test.ts and the appConfig guard.
 */
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SETTINGS = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

/** The keep rules for what the release checks read, each the whole of what its check names. */
const KEEP = [
  '-keep class expo.modules.image.ExpoImageAppGlideModule { *** applyOptions(...); }',
  '-keep class com.bumptech.glide.GlideBuilder { *** setLogLevel(int); }',
  '-keep class expo.modules.image.ExpoImageModule { *; }',
  '-keep class expo.modules.image.ExpoImageModule$** { *; }',
  '-keep class expo.modules.image.records.CachePolicy { *; }',
  '-keep class com.bumptech.glide.load.model.GlideUrl',
  '-keep class com.bumptech.glide.RequestManager { *** downloadOnly(); }',
  '-keep class com.bumptech.glide.RequestBuilder { *** submit(...); }',
];
const START = '# reelhouse: kept for the release checks (plugins/withShrunkRelease.js)';
const END = '# reelhouse: end of the release checks\' keep rules';

/** proguard-rules.pro with the keep block written once, at its end, in place of any earlier one. */
function withKeep(text) {
  const at = text.indexOf(START);
  const end = text.indexOf(END);
  const rest = at === -1 || end === -1 ? text : text.slice(0, at) + text.slice(end + END.length);
  return `${rest.trimEnd()}\n\n${[START, ...KEEP, END].join('\n')}\n`;
}

/** gradle.properties' items with each setting set once, to its value. */
function shrink(items) {
  const rest = items.filter((i) => !(i.type === 'property' && i.key in SETTINGS));
  return [...rest, ...Object.entries(SETTINGS).map(([key, value]) => ({ type: 'property', key, value }))];
}

const withShrunkRelease = (config) => withDangerousMod(withGradleProperties(config, (c) => {
  c.modResults = shrink(c.modResults);
  return c;
}), ['android', async (c) => {
  const rules = path.join(c.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
  fs.writeFileSync(rules, withKeep(fs.existsSync(rules) ? fs.readFileSync(rules, 'utf8') : ''));
  return c;
}]);

module.exports = withShrunkRelease;
module.exports.shrink = shrink;
module.exports.withKeep = withKeep;
module.exports.KEEP = KEEP;
module.exports.SETTINGS = SETTINGS;
