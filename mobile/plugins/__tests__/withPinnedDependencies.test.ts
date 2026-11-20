/**
 * withPinnedDependencies.test.ts — no Android build reads a version list: every range is pinned, and
 * any other range fails the build by name.
 *
 * The plugin is run on the root build.gradle exactly as `expo prebuild` generates it for this app
 * (fixtures/build.gradle). Gradle itself is the proof that the block works: a release build with it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const plugin = require('../withPinnedDependencies');
const { addPins, block, PINNED } = plugin as { addPins: (s: string, l: string) => string; block: () => string[]; PINNED: Record<string, string> };

const MOBILE = join(__dirname, '..', '..');
const GENERATED = readFileSync(join(__dirname, 'fixtures', 'build.gradle'), 'utf8');

describe('the generated root build.gradle', () => {
  const out = addPins(GENERATED, 'groovy');

  it('pins each range for every configuration of every project, and refuses any other range', () => {
    expect(out.endsWith(`\n${block().join('\n')}\n`)).toBe(true);
    expect(block()).toEqual(expect.arrayContaining(['allprojects {', '  configurations.configureEach {', '      failOnDynamicVersions()', '          details.useVersion(version)']));
    for (const [module, version] of Object.entries(PINNED)) expect(out).toContain(`'${module}': '${version}'`);
  });

  it('changes nothing else, and is done once however often prebuild runs it', () => {
    expect(out.startsWith(GENERATED)).toBe(true);
    expect(addPins(out, 'groovy')).toBe(out);
  });

  it("keeps a Windows prebuild's line ends", () => {
    expect(addPins(GENERATED.replace(/\n/g, '\r\n'), 'groovy').replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('refuses a build file it cannot read rather than passing it on unchanged', () => {
    expect(() => addPins(GENERATED, 'kt')).toThrow(/not groovy/);
    expect(() => addPins(GENERATED.replace('allprojects {', 'everyproject {'), 'groovy')).toThrow(/allprojects/);
  });
});

describe('the app', () => {
  it('runs the plugin at prebuild', () => {
    const { expo } = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8'));
    expect(expo.plugins).toContain('./plugins/withPinnedDependencies');
  });

  it("pins bcprov to the version of the bcutil expo-updates names, which asks for that version's range", () => {
    // bcutil-jdk15to18 X asks for bcprov-jdk15to18 [X, X+0.01): the pin follows expo-updates' own choice.
    const gradle = readFileSync(join(MOBILE, 'node_modules', 'expo-updates', 'android', 'build.gradle'), 'utf8');
    const bcutil = /org\.bouncycastle:bcutil-jdk15to18:([\d.]+)/.exec(gradle);
    expect(bcutil).not.toBeNull();
    expect(PINNED['org.bouncycastle:bcprov-jdk15to18']).toBe(bcutil?.[1]);
  });
});
