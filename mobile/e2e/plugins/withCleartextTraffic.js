/**
 * Lets the E2E build speak plain http, to the local backend on the runner (all there is).
 *
 * Android refuses cleartext by default. Used only by app.config.js when E2E=1;
 * no real build ever includes this plugin (appConfig.guard.test.ts).
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (!app) throw new Error('withCleartextTraffic: the manifest has no <application>');
    app.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
};
