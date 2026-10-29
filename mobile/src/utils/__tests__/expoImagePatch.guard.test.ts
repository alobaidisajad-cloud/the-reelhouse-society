/**
 * expoImagePatch.guard.test.ts — the installed packages hold the app's patches.
 *
 *   expo-image    on Android, a prefetch with 'disk' only downloads (prefetchPictures).
 *   query-string  decodes with decode-uri-component 0.5.1 (GHSA-qr28-fpjm-wq7f), an ES module
 *                 whose function is its default export (package.json `overrides`).
 *
 * `postinstall` runs patch-package before jest ever runs, so the installed copy
 * is already patched: each patch is checked by applying it BACKWARDS, dry, with
 * patch-package's own code. It must come off cleanly, and the installed code
 * must say what the patch says. A package update would install an unpatched
 * copy under another version, so the version each patch's file name names is
 * the installed one (and expo-image's is the one package.json pins exactly);
 * `--error-on-fail` fails the install of any other.
 *
 * Whether the compiled app calls expo-image's is read from the APK by the E2E
 * build (e2e/prefetch-download-only.mjs): this test cannot see Gradle.
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
/** Each patch's package and the version its file name names. */
const named = patches.map((f) => /^(.+)\+(\d+\.\d+\.\d+)\.patch$/.exec(f)).map((m) => ({ name: m?.[1], version: m?.[2] }));
const PATCH = patches.find((f) => f.startsWith('expo-image+'));
const KT = join(NM, 'expo-image', 'android', 'src', 'main', 'java', 'expo', 'modules', 'image', 'ExpoImageModule.kt');

/** The body of the module's prefetch function, up to the next function it defines. */
const prefetchBody = (kt: string) => {
  const at = kt.indexOf('AsyncFunction("prefetch")');
  const next = kt.indexOf('AsyncFunction(', at + 1);
  return at < 0 ? '' : kt.slice(at, next < 0 ? undefined : next);
};

/** Applies a patch backwards, dry, with patch-package's own code: throws if it does not come off. */
const comesOff = (file: string) => {
  const { readPatch } = require(join(NM, 'patch-package', 'dist', 'patch', 'read'));
  const { reversePatch } = require(join(NM, 'patch-package', 'dist', 'patch', 'reverse'));
  const { executeEffects } = require(join(NM, 'patch-package', 'dist', 'patch', 'apply'));
  const patch = readPatch({ patchFilePath: join(MOBILE, 'patches', file), patchDetails: null, patchDir: 'patches' });
  executeEffects(reversePatch(patch), { dryRun: true, cwd: MOBILE, bestEffort: false });
  return patch.map((p: { path: string }) => p.path) as string[];
};

describe('the app’s package patches', () => {
  it('are the two the app needs, each named for the version npm installed', () => {
    expect(named.map((n) => n.name).sort()).toEqual(['expo-image', 'query-string']);
    for (const n of named) expect({ [n.name!]: installed(n.name!) }).toEqual({ [n.name!]: n.version });
  });

  it('are applied on every install, by the pinned patch-package, failing the install if one cannot', () => {
    expect(pkg.scripts.postinstall).toBe('patch-package --error-on-fail');
    expect(pkg.devDependencies['patch-package']).toBe('8.0.1');
    expect(installed('patch-package')).toBe('8.0.1');
  });

  it('go up with an EAS build: with no patch to find, patch-package installs nothing and passes', () => {
    const easignore = ignore().add(readFileSync(join(MOBILE, '..', '.easignore'), 'utf8'));
    expect(patches.filter((f) => easignore.ignores(`mobile/patches/${f}`))).toEqual([]);
  });

  it('are stored with LF line ends, whatever the checkout does to text', () => {
    for (const f of patches) {
      const attr = execFileSync('git', ['check-attr', 'eol', '--', `patches/${f}`], { cwd: MOBILE, encoding: 'utf8' });
      expect(attr.trim()).toBe(`patches/${f}: eol: lf`);
      expect(readFileSync(join(MOBILE, 'patches', f), 'utf8')).not.toContain('\r');
    }
  });
});

describe('the expo-image patch', () => {
  it('pins the version package.json names exactly', () => {
    expect(pkg.dependencies['expo-image']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies['expo-image']).toBe(installed('expo-image'));
  });

  it('is in the installed copy: it comes off cleanly, and the installed prefetch calls downloadOnly', () => {
    expect(comesOff(PATCH!)).toEqual(['node_modules/expo-image/android/src/main/java/expo/modules/image/ExpoImageModule.kt']);
    const body = prefetchBody(readFileSync(KT, 'utf8'));
    expect(body).toContain('if (cachePolicy == CachePolicy.DISK) {');
    expect(body).toContain('.downloadOnly()');
  });
});

describe('the query-string patch', () => {
  it('is in the installed copy, which decodes with the fixed decode-uri-component', () => {
    expect(comesOff(patches.find((f) => f.startsWith('query-string+'))!)).toEqual(['node_modules/query-string/index.js']);
    expect(pkg.overrides['query-string']).toEqual({ 'decode-uri-component': '0.5.1' });
    // query-string is its only user, so npm keeps the one copy at the top.
    expect(installed('decode-uri-component')).toBe('0.5.1');
  });
});
