/**
 * androidPackages.test.ts — the Android packages CI installs before Gradle are
 * the ones the build reads, so Gradle never needs to download one itself.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const { packages } = require('../android-packages.cjs') as { packages: (root?: string) => string[] };

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
    'node_modules/react-native-worklets/android/build.gradle': NAMES_CMAKE('3.31.6'),
  });
  try {
    expect(packages(dir)).toEqual(['ndk;27.1.12297006', 'build-tools;36.0.0', 'platforms;android-36', 'cmake;3.22.1', 'cmake;3.31.6']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('says no when the catalog names no NDK, or no library names a CMake version', () => {
  const noNdk = root({ [CATALOG]: TOML.replace(/ndkVersion.*\n/, ''), 'node_modules/react-native-reanimated/android/build.gradle': NAMES_CMAKE('3.22.1') });
  const noCmake = root({ [CATALOG]: TOML });
  try {
    expect(() => packages(noNdk)).toThrow(/names no ndkVersion/);
    expect(() => packages(noCmake)).toThrow(/no CMake version named/);
  } finally {
    rmSync(noNdk, { recursive: true, force: true });
    rmSync(noCmake, { recursive: true, force: true });
  }
});
