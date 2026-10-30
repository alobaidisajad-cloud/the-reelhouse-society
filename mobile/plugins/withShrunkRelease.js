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
 * Proven by plugins/__tests__/withShrunkRelease.test.ts and the appConfig guard.
 */
const { withGradleProperties } = require('expo/config-plugins');

const SETTINGS = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

/** gradle.properties' items with each setting set once, to its value. */
function shrink(items) {
  const rest = items.filter((i) => !(i.type === 'property' && i.key in SETTINGS));
  return [...rest, ...Object.entries(SETTINGS).map(([key, value]) => ({ type: 'property', key, value }))];
}

const withShrunkRelease = (config) => withGradleProperties(config, (c) => {
  c.modResults = shrink(c.modResults);
  return c;
});

module.exports = withShrunkRelease;
module.exports.shrink = shrink;
module.exports.SETTINGS = SETTINGS;
