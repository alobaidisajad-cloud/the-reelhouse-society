/**
 * Android's own dialogs in the house's colours.
 *
 * React Native's Alert on Android is AppCompat's AlertDialog, built from the activity's theme
 * (react-native AlertFragment: `AlertDialog.Builder(activityContext)`), and the app's theme named
 * no accent and no dialog theme: every alert — Depart the Society, a discard, a delete — drew in
 * Android's stock grey with teal buttons (the route walk, 2026-10-21), the one place the house
 * looked like any app. Here the theme gives its dialogs the house's card, its parchment words and
 * its brass buttons, and the accent every native control reads (a text field's cursor and
 * handles) is brass, not teal. iOS draws its own alerts and is not touched.
 *
 * Proven by plugins/__tests__/withHouseDialogs.test.ts on the styles and colours prebuild writes,
 * and on the emulator by the route walk's sign-out alert (dark and plain).
 */
const { withAndroidColors, withAndroidStyles } = require('expo/config-plugins');

/** The house's colours, as Android resources (src/theme/theme.ts: sepia, soot, parchment, bone). */
const HOUSE = { houseBrass: '#B8891A', houseCard: '#1E1914', houseParchment: '#E8DFD0', houseBone: '#C2B492' };
const DIALOG = 'Theme.House.Dialog';

/** colors.xml with the house's four colours, each once. */
function addHouseColors(xml) {
  const resources = xml.resources ?? (xml.resources = {});
  const list = resources.color ?? (resources.color = []);
  for (const [name, value] of Object.entries(HOUSE)) {
    const had = list.find((c) => c.$?.name === name);
    if (had) had._ = value;
    else list.push({ $: { name }, _: value });
  }
  return xml;
}

const setItem = (style, name, value) => {
  const items = style.item ?? (style.item = []);
  const had = items.find((i) => i.$?.name === name);
  if (had) had._ = value;
  else items.push({ $: { name }, _: value });
};

/** styles.xml with the app's theme pointing its dialogs and its accent at the house, and the dialog theme itself. */
function addHouseDialogs(xml) {
  const styles = xml.resources?.style;
  const app = styles?.find((s) => s.$?.name === 'AppTheme');
  if (!app) throw new Error('withHouseDialogs: styles.xml has no AppTheme. Read the generated styles.xml and update this plugin.');
  for (const name of ['colorAccent', 'colorControlActivated', 'android:colorAccent']) setItem(app, name, '@color/houseBrass');
  setItem(app, 'alertDialogTheme', `@style/${DIALOG}`);
  setItem(app, 'android:alertDialogTheme', `@style/${DIALOG}`);
  let dialog = styles.find((s) => s.$?.name === DIALOG);
  if (!dialog) { dialog = { $: { name: DIALOG, parent: 'Theme.AppCompat.Dialog.Alert' }, item: [] }; styles.push(dialog); }
  for (const [name, value] of [
    ['colorAccent', '@color/houseBrass'],
    ['android:colorAccent', '@color/houseBrass'],
    ['colorBackgroundFloating', '@color/houseCard'],
    // the card the dialog's own inset drawable is filled with (a flat window background would lose its inset and corners)
    ['android:colorBackgroundFloating', '@color/houseCard'],
    ['android:textColorPrimary', '@color/houseParchment'],
    ['android:textColorSecondary', '@color/houseBone'],
  ]) setItem(dialog, name, value);
  return xml;
}

function withHouseDialogs(config) {
  config = withAndroidColors(config, (mod) => { mod.modResults = addHouseColors(mod.modResults); return mod; });
  return withAndroidStyles(config, (mod) => { mod.modResults = addHouseDialogs(mod.modResults); return mod; });
}

module.exports = withHouseDialogs;
module.exports.addHouseColors = addHouseColors;
module.exports.addHouseDialogs = addHouseDialogs;
module.exports.HOUSE = HOUSE;
module.exports.DIALOG = DIALOG;
