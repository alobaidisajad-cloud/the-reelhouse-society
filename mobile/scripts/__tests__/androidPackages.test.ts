/**
 * androidPackages.test.ts — the Android packages CI installs before Gradle are
 * the ones the build reads, so Gradle never needs to download one itself.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const { packages, missing } = require('../android-packages.cjs') as {
  packages: (root?: string) => string[];
  missing: (pkgs: string[], sdk: string) => string[];
};

/** A mobile/ folder holding only the files the script reads. */
function root(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'android-packages-'));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
}

const CATALOG = 'node_modules/react-native/gradle/libs.versions.toml';
const TOML = '[versions]\nminSdk = "24"\ntargetSdk = "36"\ncompileSdk = "36"\nbuildTools = "36.0.0"\nndkVersion = "27.1.12297006"\n';
const NAMES_CMAKE = (v: string) => `cmake {\n  version = System.getenv("CMAKE_VERSION") ?: "${v}"\n}\n`;

it('names the NDK, build tools, platform and CMake the installed packages ask for', () => {
  const list = packages();
  expect(list).toHaveLength(4);
  expect(list[0]).toMatch(/^ndk;\d+\.\d+\.\d+$/);
  expect(list.slice(1, 3)).toEqual([expect.stringMatching(/^build-tools;\d+\.\d+\.\d+$/), expect.stringMatching(/^platforms;android-\d+$/)]);
  expect(list[3]).toMatch(/^cmake;\d+\.\d+\.\d+$/);
});

it('reads each version from the catalog and the libraries, and every CMake version they name', () => {
  const dir = root({
    [CATALOG]: TOML,
    'node_modules/react-native-reanimated/android/build.gradle': NAMES_CMAKE('3.22.1'),
    'node_modules/react-native-worklets/android/build.gradle.kts': NAMES_CMAKE('3.31.6'),
  });
  try {
    expect(packages(dir)).toEqual(['ndk;27.1.12297006', 'build-tools;36.0.0', 'platforms;android-36', 'cmake;3.22.1', 'cmake;3.31.6']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('finds a package installed only when sdkmanager wrote its package.xml: a download that broke leaves none', () => {
  const sdk = root({
    'ndk/27.1.12297006/package.xml': '<x/>',
    'system-images/android-34/google_apis/x86_64/source.properties': 'half-written',
  });
  try {
    expect(missing(['ndk;27.1.12297006', 'system-images;android-34;google_apis;x86_64', 'platform-tools'], sdk))
      .toEqual(['system-images;android-34;google_apis;x86_64', 'platform-tools']);
  } finally { rmSync(sdk, { recursive: true, force: true }); }
});

it('says no when the catalog names no NDK; with no library naming a CMake, takes the one they named until then', () => {
  const noNdk = root({ [CATALOG]: TOML.replace(/ndkVersion.*\n/, ''), 'node_modules/react-native-reanimated/android/build.gradle': NAMES_CMAKE('3.22.1') });
  const noCmake = root({ [CATALOG]: TOML });
  try {
    expect(() => packages(noNdk)).toThrow(/names no ndkVersion/);
    expect(packages(noCmake).filter((p: string) => p.startsWith('cmake;'))).toEqual(['cmake;3.22.1']);
  } finally {
    rmSync(noNdk, { recursive: true, force: true });
    rmSync(noCmake, { recursive: true, force: true });
  }
});
