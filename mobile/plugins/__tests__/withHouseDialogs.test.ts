/**
 * withHouseDialogs.test.ts — Android's dialogs drawn in the house's colours.
 *
 * The plugin is run on styles.xml and colors.xml in the shape prebuild parses them to, the app's
 * theme as this app's prebuild writes it, through the mods prebuild calls.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { colors } from '@/src/theme/theme';

const plugin = require('../withHouseDialogs');
const { addHouseColors, addHouseDialogs, HOUSE, DIALOG } = plugin;
const MOBILE = join(__dirname, '..', '..');

/** styles.xml as this app's prebuild writes it, parsed. */
const styles = () => ({
  resources: {
    style: [
      { $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' }, item: [
        { $: { name: 'android:enforceNavigationBarContrast' }, _: 'true' },
        { $: { name: 'colorPrimary' }, _: '@color/colorPrimary' },
      ] },
      { $: { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' }, item: [] },
    ],
  },
});
const item = (style: { item: { $: { name: string }; _: string }[] }, name: string) => style.item.find((i) => i.$.name === name)?._;

it('gives the app’s theme the house’s accent and its dialog theme, keeping what it had', () => {
  const xml = addHouseDialogs(styles());
  const app = xml.resources.style.find((s: { $: { name: string } }) => s.$.name === 'AppTheme');
  expect([item(app, 'colorAccent'), item(app, 'android:colorAccent'), item(app, 'colorControlActivated')]).toEqual(['@color/houseBrass', '@color/houseBrass', '@color/houseBrass']);
  expect([item(app, 'alertDialogTheme'), item(app, 'android:alertDialogTheme')]).toEqual([`@style/${DIALOG}`, `@style/${DIALOG}`]);
  expect([item(app, 'colorPrimary'), item(app, 'android:enforceNavigationBarContrast')]).toEqual(['@color/colorPrimary', 'true']);
});

it('draws the dialog on the house’s card, its words in parchment and bone, its buttons in brass', () => {
  const xml = addHouseDialogs(styles());
  const dialog = xml.resources.style.find((s: { $: { name: string } }) => s.$.name === DIALOG);
  expect(dialog.$.parent).toBe('Theme.AppCompat.Dialog.Alert');
  expect(Object.fromEntries(dialog.item.map((i: { $: { name: string }; _: string }) => [i.$.name, i._]))).toEqual({
    colorAccent: '@color/houseBrass',
    'android:colorAccent': '@color/houseBrass',
    colorBackgroundFloating: '@color/houseCard',
    'android:colorBackgroundFloating': '@color/houseCard',
    'android:textColorPrimary': '@color/houseParchment',
    'android:textColorSecondary': '@color/houseBone',
  });
});

it('is done once however often prebuild runs it, and stops a build whose styles have no AppTheme', () => {
  const once = addHouseDialogs(styles());
  expect(addHouseDialogs(JSON.parse(JSON.stringify(once)))).toEqual(once);
  expect(() => addHouseDialogs({ resources: { style: [] } })).toThrow(/no AppTheme/);
  const c = addHouseColors(addHouseColors({ resources: { color: [{ $: { name: 'colorPrimary' }, _: '#023c69' }] } }));
  expect(c.resources.color.map((x: { $: { name: string } }) => x.$.name)).toEqual(['colorPrimary', ...Object.keys(HOUSE)]);
});

it('names the house’s own colours, as the theme has them', () => {
  expect(HOUSE).toEqual({ houseBrass: colors.sepia, houseCard: colors.soot, houseParchment: colors.parchment, houseBone: colors.bone });
});

it('is the mods prebuild runs, and in every build: app.json lists it, and the path is this plugin', async () => {
  const config = plugin({ name: 'reelhouse', slug: 'reelhouse' });
  const st = await config.mods.android.styles({ ...config, modResults: styles(), modRequest: { platform: 'android' } });
  expect(st.modResults).toEqual(addHouseDialogs(styles()));
  const names = (JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo.plugins as unknown[]).map((p) => (Array.isArray(p) ? p[0] : p));
  const ours = names.indexOf('./plugins/withHouseDialogs');
  expect(ours).toBeGreaterThanOrEqual(0);
  expect(require.resolve(resolve(MOBILE, names[ours] as string))).toBe(require.resolve('../withHouseDialogs'));
});
