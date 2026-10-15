/**
 * expoImagePatch.guard.test.ts — the installed expo-image holds the app's
 * patch: on Android, a prefetch with 'disk' only downloads (prefetchPictures).
 *
 * `postinstall` runs patch-package before jest ever runs, so the installed copy
 * is already patched: the patch is checked by applying it BACKWARDS, dry, with
 * patch-package's own code. It must come off cleanly, and the installed Kotlin
 * prefetch must call downloadOnly. A package update would install an unpatched
 * copy under another version, so package.json pins expo-image exactly, and that
 * version, the installed one and the one the patch's file name names are one.
 *
 * Whether the compiled app calls it is read from the APK by the E2E build
 * (e2e/prefetch-download-only.mjs): this test cannot see Gradle.
 */
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import ignore from 'ignore';

const MOBILE = join(__dirname, '..', '..', '..');
const NM = join(MOBILE, 'node_modules');
const pkg = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8'));
const installed = (name: string) => JSON.parse(readFileSync(join(NM, name, 'package.json'), 'utf8')).version as string;
const patches = readdirSync(join(MOBILE, 'patches'));
const PATCH = patches.find((f) => f.startsWith('expo-image+'));
const KT = join(NM, 'expo-image', 'android', 'src', 'main', 'java', 'expo', 'modules', 'image', 'ExpoImageModule.kt');

/** The body of the module's prefetch function, up to the next function it defines. */
const prefetchBody = (kt: string) => {
  const at = kt.indexOf('AsyncFunction("prefetch")');
  const next = kt.indexOf('AsyncFunction(', at + 1);
  return at < 0 ? '' : kt.slice(at, next < 0 ? undefined : next);
};

describe('the expo-image patch', () => {
  it('is the one patch, named for the version package.json pins and npm installed', () => {
    expect(patches).toEqual([PATCH]);
    expect(pkg.dependencies['expo-image']).toMatch(/^\d+\.\d+\.\d+$/);
    const named = /^expo-image\+(\d+\.\d+\.\d+)\.patch$/.exec(PATCH ?? '')?.[1];
    expect({ pinned: pkg.dependencies['expo-image'], installed: installed('expo-image'), named })
      .toEqual({ pinned: named, installed: named, named: expect.any(String) });
  });

  it('is applied on every install, by the pinned patch-package, failing the install if it cannot', () => {
    expect(pkg.scripts.postinstall).toBe('patch-package --error-on-fail');
    expect(pkg.devDependencies['patch-package']).toBe('8.0.1');
    expect(installed('patch-package')).toBe('8.0.1');
  });

  it('goes up with an EAS build: with no patch to find, patch-package installs nothing and passes', () => {
    const easignore = ignore().add(readFileSync(join(MOBILE, '..', '.easignore'), 'utf8'));
    expect(easignore.ignores(`mobile/patches/${PATCH}`)).toBe(false);
  });

  it('is stored with LF line ends, whatever the checkout does to text', () => {
    const attr = execFileSync('git', ['check-attr', 'eol', '--', `patches/${PATCH}`], { cwd: MOBILE, encoding: 'utf8' });
    expect(attr.trim()).toBe(`patches/${PATCH}: eol: lf`);
    expect(readFileSync(join(MOBILE, 'patches', PATCH!), 'utf8')).not.toContain('\r');
  });

  it('is in the installed copy: it comes off cleanly, and the installed prefetch calls downloadOnly', () => {
    const { readPatch } = require(join(NM, 'patch-package', 'dist', 'patch', 'read'));
    const { reversePatch } = require(join(NM, 'patch-package', 'dist', 'patch', 'reverse'));
    const { executeEffects } = require(join(NM, 'patch-package', 'dist', 'patch', 'apply'));
    const patch = readPatch({ patchFilePath: join(MOBILE, 'patches', PATCH!), patchDetails: null, patchDir: 'patches' });
    expect(patch.map((p: { path: string }) => p.path)).toEqual(['node_modules/expo-image/android/src/main/java/expo/modules/image/ExpoImageModule.kt']);
    expect(() => executeEffects(reversePatch(patch), { dryRun: true, cwd: MOBILE, bestEffort: false })).not.toThrow();
    const body = prefetchBody(readFileSync(KT, 'utf8'));
    expect(body).toContain('if (cachePolicy == CachePolicy.DISK) {');
    expect(body).toContain('.downloadOnly()');
  });
});
