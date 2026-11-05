/**
 * withAssetStatements.test.ts — the app names the house's website as its own, on Android.
 *
 * The plugin is run on strings.xml and the manifest in the shape prebuild parses them to, and
 * app.json is read for the plugin itself: a list that lost it would build an app whose saved
 * passwords the website never sees.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const plugin = require('../withAssetStatements');
const { addStatementString, addStatementMetaData, STATEMENT } = plugin;
const MOBILE = join(__dirname, '..', '..');

/** strings.xml as prebuild writes it, parsed. */
const strings = () => ({ resources: { string: [{ $: { name: 'app_name' }, _: 'The Reelhouse Society' }] } });
/** The manifest's <application> as prebuild writes it, parsed. */
const manifest = () => ({ manifest: { application: [{ $: { 'android:name': '.MainApplication' }, 'meta-data': [{ $: { 'android:name': 'expo.modules.updates.ENABLED', 'android:value': 'true' } }] }] } });

it('names the website\'s link file, its quotes escaped as a string resource keeps them', () => {
  const xml = addStatementString(strings());
  const entry = xml.resources.string.find((s: { $: { name: string } }) => s.$.name === 'asset_statements');
  expect(entry).toEqual({ $: { name: 'asset_statements', translatable: 'false' }, _: STATEMENT });
  // Android reads the resource with each \" as a quote: what it reads is the statement Google asks for.
  expect(JSON.parse(STATEMENT.replace(/\\"/g, '"'))).toEqual([{ include: 'https://www.thereelhousesociety.com/.well-known/assetlinks.json' }]);
  expect(xml.resources.string[0]).toEqual({ $: { name: 'app_name' }, _: 'The Reelhouse Society' });
});

it('points <application> at it once, keeping what it held', () => {
  const once = addStatementMetaData(manifest());
  const twice = addStatementMetaData(once);
  const list = twice.manifest.application[0]['meta-data'];
  expect(list.filter((m: { $: Record<string, string> }) => m.$['android:name'] === 'asset_statements'))
    .toEqual([{ $: { 'android:name': 'asset_statements', 'android:resource': '@string/asset_statements' } }]);
  expect(list[0].$['android:name']).toBe('expo.modules.updates.ENABLED');
});

it('writes the statement once, however often prebuild runs', () => {
  const xml = addStatementString(addStatementString(strings()));
  expect(xml.resources.string.filter((s: { $: { name: string } }) => s.$.name === 'asset_statements')).toHaveLength(1);
});

it('refuses a manifest with no <application>, rather than build an app the website does not know', () => {
  expect(() => addStatementMetaData({ manifest: {} })).toThrow(/no <application>/);
});

it('is in the app\'s plugins', () => {
  const plugins = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo.plugins;
  expect(plugins).toContain('./plugins/withAssetStatements');
});
