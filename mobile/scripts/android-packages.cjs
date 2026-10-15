/**
 * android-packages.cjs — the Android SDK packages a build of this app needs, as sdkmanager names them.
 *
 * Gradle installs a missing NDK, build tools, platform or CMake itself, inside the build, with no
 * second try: one broken download of the NDK failed the E2E app's build (run 38808612272, "Archive is
 * not a ZIP archive"). CI installs these first, in a step tried once more alone, and runs Gradle with
 * android.builder.sdkDownload=false, so a package left off this list fails the build at once, by name,
 * instead of being downloaded where nothing tries it again.
 *
 * The versions are read where the build reads them: React Native's gradle/libs.versions.toml (which
 * Expo's root project plugin takes the NDK, build tools and SDK from), and the CMake version the native
 * libraries ask for (Reanimated and Worklets name it; the others take the Android plugin's default).
 *
 *   node scripts/android-packages.cjs     prints them on one line, for sdkmanager --install
 */
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const MOBILE = join(__dirname, '..');
const CATALOG = 'node_modules/react-native/gradle/libs.versions.toml';
const CMAKE_NAMERS = ['node_modules/react-native-reanimated/android/build.gradle', 'node_modules/react-native-worklets/android/build.gradle'];

/** One version from the catalog's [versions] table, or an error naming it. */
function version(toml, key) {
  const m = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm').exec(toml);
  if (!m) throw new Error(`${CATALOG} names no ${key}`);
  return m[1];
}

/** The packages, from the files under `root` (mobile/ by default). */
function packages(root = MOBILE) {
  const toml = readFileSync(join(root, CATALOG), 'utf8');
  const cmake = new Set();
  for (const f of CMAKE_NAMERS) {
    if (!existsSync(join(root, f))) continue;
    for (const m of readFileSync(join(root, f), 'utf8').matchAll(/CMAKE_VERSION"\)\s*\?:\s*"(\d+\.\d+\.\d+)"/g)) cmake.add(m[1]);
  }
  if (!cmake.size) throw new Error(`no CMake version named in ${CMAKE_NAMERS.join(' or ')}`);
  return [
    `ndk;${version(toml, 'ndkVersion')}`,
    `build-tools;${version(toml, 'buildTools')}`,
    `platforms;android-${version(toml, 'compileSdk')}`,
    ...[...cmake].sort().map((v) => `cmake;${v}`),
  ];
}

if (require.main === module) {
  try {
    console.log(packages().join(' '));
  } catch (e) {
    console.error(`android-packages: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { packages };
