/**
 * Android removes its own splash screen; the app never takes it over.
 *
 * expo-splash-screen registers an exit-animation listener (to fade the splash
 * itself), and an app with that listener makes Android HAND its splash over:
 * the system copies the splash into the app and waits at most 2 s
 * (ActivityRecord's TRANSFER_SPLASH_SCREEN_TIMEOUT) for the app's busy main
 * thread to take it. When the first screen keeps that thread longer, Android
 * gives up and runs its own exit on a splash it already handed away while the
 * app removes the same splash, and the app's main window is left animating
 * (starting_reveal) until it is relaunched. Sealed E2E run 37201431874 caught
 * it: "Activity transferring splash screen timeout … MainActivity", then every
 * injected key held 10 s.
 *
 * Android asks whether the app takes the splash over when the activity resumes
 * (isHandleSplashScreenExit: is a listener registered?). So the listener is
 * cleared in onCreate, after super.onCreate(null) and expo-splash-screen's own
 * line before it, and Android removes the splash itself with its standard exit,
 * as every app without that listener does. Android 11 and below hand nothing
 * over, so they are left as they are; iOS is not touched.
 *
 * Proven three ways: plugins/__tests__/withSplashWithoutHandoff.test.ts on the
 * real generated MainActivity, the E2E build's check that the line follows
 * super.onCreate(null), and e2e/splash-handoff.mjs on every E2E run's log.
 */
const { withMainActivity } = require('expo/config-plugins');

const MARK = 'reelhouse: Android removes its own splash (plugins/withSplashWithoutHandoff.js)';
// The line itself, whatever ends it (a prebuild on Windows writes CRLF).
const ANCHOR = /^([ \t]*)super\.onCreate\(null\)[ \t]*;?[ \t]*(?=\r?$)/gm;

/** MainActivity's source with the listener cleared right after super.onCreate(null); unchanged if done. */
function addSplashWithoutHandoff(src, language) {
  if (src.includes(MARK)) return src;
  const found = [...src.matchAll(ANCHOR)];
  if (found.length !== 1) {
    throw new Error(
      `withSplashWithoutHandoff: MainActivity has ${found.length} \`super.onCreate(null)\` lines, not one, ` +
      'so the splash listener cannot be cleared after it. Read the generated MainActivity and update this plugin.'
    );
  }
  const [anchor, indent] = found[0];
  const sdk = 'android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S';
  const clear = language === 'java'
    ? `if (${sdk}) getSplashScreen().clearOnExitAnimationListener();`
    : `if (${sdk}) splashScreen.clearOnExitAnimationListener()`;
  const at = found[0].index + anchor.length;
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  return `${src.slice(0, at)}${eol}${indent}// ${MARK}${eol}${indent}${clear}${src.slice(at)}`;
}

function withSplashWithoutHandoff(config) {
  return withMainActivity(config, (mod) => {
    mod.modResults.contents = addSplashWithoutHandoff(mod.modResults.contents, mod.modResults.language);
    return mod;
  });
}

module.exports = withSplashWithoutHandoff;
module.exports.addSplashWithoutHandoff = addSplashWithoutHandoff;
module.exports.MARK = MARK;
