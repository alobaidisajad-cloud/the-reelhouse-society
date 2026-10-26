/**
 * The app runs without Android's sampled GWP-ASan, which crashes Hermes.
 *
 * From Android 14 an app whose manifest names no gwpAsanMode runs GWP-ASan, in its recoverable
 * mode, on a share of its launches: a freed allocation it sampled is given a backtrace, read by
 * chasing frame pointers. Hermes (React Native 0.86's) runs JavaScript on a stack of its own, and
 * the chase runs past its end into a page it may not read: SIGSEGV on the main thread, the app
 * gone (Sealed E2E run 40232504480 on the sdk57 branch, during auth_flow, the trace ending at
 * hoost_make_fcontext in libhermesvm.so). It is Hermes's (facebook/hermes 1873, 2225), fixed on
 * its main line and not in the stable line this React Native ships, so here the app says never.
 * Recoverable GWP-ASan reports the native memory faults it samples and lets the app run on; with
 * it off, those reports are what is lost.
 *
 * Proven by plugins/__tests__/withGwpAsanOff.test.ts on the AndroidManifest.xml prebuild
 * generates; the same test fails once React Native reaches the version said to carry the fix,
 * so this is read again then.
 */
const { withAndroidManifest } = require('expo/config-plugins');

/** React Native's first version said to carry Hermes's fix: from it, this plugin is read again. */
const FIXED_IN = '0.88.0';

/** The manifest's application, told never to run GWP-ASan. */
function turnGwpAsanOff(manifest) {
  const application = manifest.manifest?.application?.[0];
  if (!application) {
    throw new Error('withGwpAsanOff: the manifest has no application. Read the generated manifest and update this plugin.');
  }
  application.$ = { ...application.$, 'android:gwpAsanMode': 'never' };
  return manifest;
}

function withGwpAsanOff(config) {
  return withAndroidManifest(config, (mod) => {
    mod.modResults = turnGwpAsanOff(mod.modResults);
    return mod;
  });
}

module.exports = withGwpAsanOff;
module.exports.turnGwpAsanOff = turnGwpAsanOff;
module.exports.FIXED_IN = FIXED_IN;
