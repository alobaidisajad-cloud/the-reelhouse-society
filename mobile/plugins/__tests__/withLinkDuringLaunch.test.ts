/**
 * withLinkDuringLaunch.test.ts — a link that reaches the app while it starts is the one it opens.
 *
 * The plugin is run on MainActivity.kt exactly as `expo prebuild` generates it for this app
 * (fixtures/MainActivity.kt), through the same withMainActivity mod prebuild calls, after the
 * splash plugin as app.json orders them.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const plugin = require('../withLinkDuringLaunch');
const { addLinkDuringLaunch, MARK } = plugin;
const { addSplashWithoutHandoff } = require('../withSplashWithoutHandoff');

const MOBILE = join(__dirname, '..', '..');
const GENERATED = readFileSync(join(__dirname, 'fixtures', 'MainActivity.kt'), 'utf8');
const ADDED = [
  `  // ${MARK}`,
  '  override fun onNewIntent(intent: android.content.Intent) {',
  '    setIntent(intent)',
  '    super.onNewIntent(intent)',
  '  }',
];

describe('the generated MainActivity', () => {
  const out = addLinkDuringLaunch(GENERATED, 'kt');
  const lines = out.split('\n');

  it('keeps each new intent as the activity\'s own, then hands it on, first in the class', () => {
    const at = lines.findIndex((l: string) => l === 'class MainActivity : ReactActivity() {');
    expect(lines.slice(at + 1, at + 1 + ADDED.length)).toEqual(ADDED);
  });

  it('changes nothing else, and is done once however often prebuild runs it', () => {
    // The block, and a blank line between it and the generated onCreate.
    expect(out.split(`\n${ADDED.join('\n')}\n\n`)).toHaveLength(2);
    expect(out.replace(`\n${ADDED.join('\n')}\n`, '')).toBe(GENERATED);
    expect(addLinkDuringLaunch(out, 'kt')).toBe(out);
  });

  it('keeps a file\'s CRLF line ends, and goes with the splash plugin in either order', () => {
    expect(addLinkDuringLaunch(GENERATED.replace(/\n/g, '\r\n'), 'kt')).toBe(out.replace(/\n/g, '\r\n'));
    expect(addLinkDuringLaunch(addSplashWithoutHandoff(GENERATED, 'kt'), 'kt')).toBe(addSplashWithoutHandoff(out, 'kt'));
  });
});

it('writes Java for a Java MainActivity', () => {
  const java = ['public class MainActivity extends ReactActivity {', '  @Override', '  protected String getMainComponentName() { return "main"; }', '}'].join('\n');
  expect(addLinkDuringLaunch(java, 'java').split('\n').slice(1, 7)).toEqual([
    `  // ${MARK}`,
    '  @Override',
    '  public void onNewIntent(android.content.Intent intent) {',
    '    setIntent(intent);',
    '    super.onNewIntent(intent);',
    '  }',
  ]);
});

it('stops the build when it cannot add onNewIntent alone — never a silent no-op', () => {
  expect(() => addLinkDuringLaunch('object Nothing', 'kt')).toThrow(/has 0 class lines it can read, not one/);
  expect(() => addLinkDuringLaunch(`${GENERATED}\n  override fun onNewIntent(intent: Intent) {}`, 'kt')).toThrow(/already has an onNewIntent/);
});

it('is the mod prebuild runs: withMainActivity hands it MainActivity and keeps what it returns', async () => {
  const config = plugin({ name: 'reelhouse', slug: 'reelhouse' });
  const mod = config.mods.android.mainActivity;
  const result = await mod({ ...config, modResults: { contents: GENERATED, language: 'kt' }, modRequest: { platform: 'android' } });
  expect(result.modResults.contents).toBe(addLinkDuringLaunch(GENERATED, 'kt'));
});

it('is in every build: app.json lists it, and the path is this plugin', () => {
  const plugins: unknown[] = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo.plugins;
  const names = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  const ours = names.indexOf('./plugins/withLinkDuringLaunch');
  expect(ours).toBeGreaterThanOrEqual(0);
  expect(require.resolve(resolve(MOBILE, names[ours] as string))).toBe(require.resolve('../withLinkDuringLaunch'));
});
