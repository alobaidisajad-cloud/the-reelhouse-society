/**
 * withOneNdk.test.ts — every Android library builds its native code with the project's one NDK.
 *
 * The plugin is run on the root build.gradle exactly as `expo prebuild` generates it for this app
 * (fixtures/build.gradle), through the same withProjectBuildGradle mod prebuild calls.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const plugin = require('../withOneNdk');
const { addOneNdk, BLOCK } = plugin;

const MOBILE = join(__dirname, '..', '..');
const GENERATED = readFileSync(join(__dirname, 'fixtures', 'build.gradle'), 'utf8');

describe('the generated root build.gradle', () => {
  const out: string = addOneNdk(GENERATED, 'groovy');

  it("hands every Android library the project's NDK, after the root plugin that sets it", () => {
    expect(out.endsWith(`\n${BLOCK.join('\n')}\n`)).toBe(true);
    expect(out.indexOf('apply plugin: "expo-root-project"')).toBeLessThan(out.indexOf(BLOCK[0]));
    expect(BLOCK).toContain('    sub.android.ndkVersion = rootProject.ext.ndkVersion');
  });

  it('changes nothing else, and is done once however often prebuild runs it', () => {
    expect(out.startsWith(GENERATED)).toBe(true);
    expect(addOneNdk(out, 'groovy')).toBe(out);
  });

  it('keeps a Windows prebuild\'s line ends', () => {
    const crlf = GENERATED.replace(/\n/g, '\r\n');
    const done: string = addOneNdk(crlf, 'groovy');
    expect(done.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('refuses a build file it cannot read rather than passing it on unchanged', () => {
    expect(() => addOneNdk(GENERATED, 'kt')).toThrow(/not groovy/);
    expect(() => addOneNdk(GENERATED.replace('apply plugin: "expo-root-project"', ''), 'groovy')).toThrow(/expo-root-project/);
  });
});

describe('the app', () => {
  it('runs the plugin at prebuild', () => {
    const { expo } = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8'));
    expect(expo.plugins).toContain('./plugins/withOneNdk');
  });

  it('builds with one NDK: the one CI installs, named where the root plugin reads it', () => {
    const { packages } = require('../../scripts/android-packages.cjs');
    expect(packages().filter((p: string) => p.startsWith('ndk;'))).toHaveLength(1);
  });
});
