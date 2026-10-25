/**
 * Every Android library in the build compiles its native code with the project's one NDK.
 *
 * Expo's root project plugin sets the NDK from React Native's version catalogue, and Expo's module
 * plugin hands each module the SDK versions but not the NDK. A module that builds native code and
 * names none gets the Android plugin's own default: expo-updates 57 builds C++ (its CMakeLists.txt)
 * and asked for NDK 27.0.12077973 beside the project's 27.1.12297006. CI installs only the project's
 * (scripts/android-packages.cjs) and builds with android.builder.sdkDownload=false, so the E2E app's
 * build stopped there ("NDK not configured", Sealed E2E run 40226076302). Here each library takes
 * the project's NDK as its plugin is applied; a library that names its own still sets it after.
 *
 * Proven by plugins/__tests__/withOneNdk.test.ts on the root build.gradle exactly as prebuild
 * generates it, and by the E2E app's build.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARK = 'reelhouse: every Android library builds with the project\'s one NDK (plugins/withOneNdk.js)';
const BLOCK = [
  `// ${MARK}`,
  'subprojects { sub ->',
  '  sub.plugins.withId("com.android.library") {',
  '    sub.android.ndkVersion = rootProject.ext.ndkVersion',
  '  }',
  '}',
];

/** The root build.gradle with the block at its end; unchanged if done. */
function addOneNdk(src, language) {
  if (language !== 'groovy') {
    throw new Error(`withOneNdk: the root build file is ${language}, not groovy. Read the generated file and update this plugin.`);
  }
  if (src.includes(MARK)) return src;
  if (!src.includes('apply plugin: "expo-root-project"')) {
    throw new Error('withOneNdk: the root build.gradle does not apply expo-root-project, which sets ndkVersion. Read the generated file and update this plugin.');
  }
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const body = src.endsWith(eol) ? src : src + eol;
  return `${body}${eol}${BLOCK.join(eol)}${eol}`;
}

function withOneNdk(config) {
  return withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = addOneNdk(mod.modResults.contents, mod.modResults.language);
    return mod;
  });
}

module.exports = withOneNdk;
module.exports.addOneNdk = addOneNdk;
module.exports.BLOCK = BLOCK;
module.exports.MARK = MARK;
