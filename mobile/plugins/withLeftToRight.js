/**
 * The house lays out left to right on every phone, locked natively before React Native starts
 * (Decision 7). `I18nManager.allowRTL(false)` from JavaScript only takes effect at the NEXT launch,
 * so on a phone set to Arabic or Hebrew the first launch after an install would come up mirrored.
 * Here the same switches are set where the app starts: on Android in MainApplication.onCreate
 * (React Native's I18nUtil, before loadReactNative) with the manifest's supportsRtl off, on iOS at
 * the top of AppDelegate's didFinishLaunching (RCTI18nUtil, before the factory starts React Native).
 * A member's words still read in their own direction: that is the text's, not the layout's.
 *
 * Proven by plugins/__tests__/withLeftToRight.test.ts on the files prebuild generates, and on the
 * emulator by the right-to-left E2E run.
 */
const { withAndroidManifest, withAppDelegate, withMainApplication } = require('expo/config-plugins');

const MARK = 'reelhouse: laid out left to right, locked before React Native starts (plugins/withLeftToRight.js)';

/** MainApplication's source with RTL switched off after super.onCreate(); unchanged if done. */
function lockMainApplication(src, language) {
  if (src.includes(MARK)) return src;
  if (language !== 'kt') {
    throw new Error(`withLeftToRight: MainApplication is ${language}, not Kotlin. Read the generated file and update this plugin.`);
  }
  const found = [...src.matchAll(/^([ \t]*)super\.onCreate\(\)[ \t]*(?=\r?$)/gm)];
  if (found.length !== 1) {
    throw new Error(`withLeftToRight: MainApplication has ${found.length} super.onCreate() lines, not one. Read the generated file and update this plugin.`);
  }
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const pad = found[0][1];
  const util = 'com.facebook.react.modules.i18nmanager.I18nUtil.instance';
  const lines = [`${pad}// ${MARK}`, `${pad}${util}.allowRTL(this, false)`, `${pad}${util}.forceRTL(this, false)`];
  const at = found[0].index + found[0][0].length;
  return `${src.slice(0, at)}${eol}${lines.join(eol)}${src.slice(at)}`;
}

/** AppDelegate's source with RTL switched off first thing in didFinishLaunching; unchanged if done. */
function lockAppDelegate(src, language) {
  if (src.includes(MARK)) return src;
  if (language !== 'swift') {
    throw new Error(`withLeftToRight: AppDelegate is ${language}, not Swift. Read the generated file and update this plugin.`);
  }
  const start = src.indexOf('didFinishLaunchingWithOptions launchOptions');
  const open = start < 0 ? -1 : src.indexOf(') -> Bool {', start);
  if (start < 0 || open < 0 || src.indexOf('didFinishLaunchingWithOptions launchOptions', start + 1) >= 0) {
    throw new Error('withLeftToRight: AppDelegate has no single didFinishLaunching to lock in. Read the generated file and update this plugin.');
  }
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = [`    // ${MARK}`, '    RCTI18nUtil.sharedInstance().allowRTL(false)', '    RCTI18nUtil.sharedInstance().forceRTL(false)'];
  const at = open + ') -> Bool {'.length;
  return `${src.slice(0, at)}${eol}${lines.join(eol)}${src.slice(at)}`;
}

const withLeftToRight = (config) => {
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (!app) throw new Error('withLeftToRight: the manifest has no application. Read the generated manifest and update this plugin.');
    app.$['android:supportsRtl'] = 'false';
    return c;
  });
  config = withMainApplication(config, (c) => {
    c.modResults.contents = lockMainApplication(c.modResults.contents, c.modResults.language);
    return c;
  });
  return withAppDelegate(config, (c) => {
    c.modResults.contents = lockAppDelegate(c.modResults.contents, c.modResults.language);
    return c;
  });
};

module.exports = withLeftToRight;
module.exports.lockMainApplication = lockMainApplication;
module.exports.lockAppDelegate = lockAppDelegate;
module.exports.MARK = MARK;
