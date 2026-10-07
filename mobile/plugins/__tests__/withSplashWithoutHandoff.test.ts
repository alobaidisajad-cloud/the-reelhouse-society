/**
 * withSplashWithoutHandoff.test.ts — the app never takes Android's splash over.
 *
 * The plugin is run on MainActivity.kt exactly as `expo prebuild` generates it
 * for this app (fixtures/MainActivity.kt, copied from a prebuild of this
 * config), through the same withMainActivity mod prebuild calls. And nothing in
 * the app may re-arm the takeover: SplashScreen.setOptions re-registers
 * expo-splash-screen's exit listener, and with it Android's 2 s handover.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const plugin = require('../withSplashWithoutHandoff');
const { addSplashWithoutHandoff, MARK } = plugin;

const MOBILE = join(__dirname, '..', '..');
const GENERATED = readFileSync(join(__dirname, 'fixtures', 'MainActivity.kt'), 'utf8');
const CLEAR_KT = 'if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) splashScreen.clearOnExitAnimationListener()';

describe('the generated MainActivity', () => {
  const out = addSplashWithoutHandoff(GENERATED, 'kt');
  const lines = out.split('\n');
  const at = (text: string) => lines.findIndex((l: string) => l.trim() === text);

  it('clears the listener on the line after super.onCreate(null), which follows expo-splash-screen’s own line', () => {
    const superAt = at('super.onCreate(null)');
    expect(at('SplashScreenManager.registerOnActivity(this)')).toBeLessThan(superAt);
    expect(lines.slice(superAt, superAt + 4)).toEqual([
      '    super.onCreate(null)',
      `    // ${MARK}`,
      `    ${CLEAR_KT}`,
      '  }',
    ]);
  });

  it('changes nothing else', () => {
    const added = [`    // ${MARK}`, `    ${CLEAR_KT}`];
    expect(lines.filter((l: string) => !added.includes(l)).join('\n')).toBe(GENERATED);
  });

  it('is done once, however often prebuild runs it', () => {
    expect(addSplashWithoutHandoff(out, 'kt')).toBe(out);
  });

  it('keeps a file’s CRLF line ends', () => {
    const crlf = GENERATED.replace(/\n/g, '\r\n');
    const result = addSplashWithoutHandoff(crlf, 'kt');
    expect(result).toBe(out.replace(/\n/g, '\r\n'));
  });
});

it('writes Java for a Java MainActivity', () => {
  const java = [
    '  @Override',
    '  protected void onCreate(Bundle savedInstanceState) {',
    '    SplashScreenManager.registerOnActivity(this);',
    '    super.onCreate(null);',
    '  }',
  ].join('\n');
  expect(addSplashWithoutHandoff(java, 'java').split('\n').slice(3, 6)).toEqual([
    '    super.onCreate(null);',
    `    // ${MARK}`,
    '    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) getSplashScreen().clearOnExitAnimationListener();',
  ]);
});

it('stops the build when there is no single super.onCreate(null) to follow — never a silent no-op', () => {
  expect(() => addSplashWithoutHandoff('class MainActivity : ReactActivity() {}', 'kt'))
    .toThrow(/has 0 `super.onCreate\(null\)` lines, not one/);
  expect(() => addSplashWithoutHandoff('    super.onCreate(null)\n    super.onCreate(null)\n', 'kt'))
    .toThrow(/has 2 `super.onCreate\(null\)` lines, not one/);
});

it('is the mod prebuild runs: withMainActivity hands it MainActivity and keeps what it returns', async () => {
  const config = plugin({ name: 'reelhouse', slug: 'reelhouse' });
  const mod = config.mods.android.mainActivity;
  const result = await mod({ ...config, modResults: { contents: GENERATED, language: 'kt' }, modRequest: { platform: 'android' } });
  expect(result.modResults.contents).toBe(addSplashWithoutHandoff(GENERATED, 'kt'));
});

it('is in every build: app.json lists it, after expo-splash-screen, and the path is this plugin', () => {
  const plugins: unknown[] = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo.plugins;
  const names = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  const ours = names.indexOf('./plugins/withSplashWithoutHandoff');
  expect(ours).toBeGreaterThan(names.indexOf('expo-splash-screen'));
  expect(names.indexOf('expo-splash-screen')).toBeGreaterThanOrEqual(0);
  expect(require.resolve(resolve(MOBILE, names[ours] as string))).toBe(require.resolve('../withSplashWithoutHandoff'));
});

describe('nothing in the app re-arms the takeover', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { if (!['node_modules', '__tests__'].includes(e)) walk(p, out); } else if (/\.tsx?$/.test(e)) out.push(p);
    }
    return out;
  };
  const importers = [...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src'))]
    .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
    .filter(({ text }) => /from ['"]expo-splash-screen['"]/.test(text));

  it('finds the files that use expo-splash-screen — it is not passing on none', () => {
    expect(importers.map(({ f }) => f.slice(MOBILE.length + 1).replace(/\\/g, '/'))).toContain('app/_layout.tsx');
  });

  it('none calls setOptions, which re-registers the exit listener and with it the 2 s handover', () => {
    expect(importers.filter(({ text }) => /\.setOptions\s*\(/.test(text)).map(({ f }) => f)).toEqual([]);
  });
});
