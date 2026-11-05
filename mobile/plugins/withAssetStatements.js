/**
 * The app's half of the link with the house's website, on Android (decision 9, P4.20).
 *
 * Android shares a password saved in the app with the website, and the website's with the app,
 * only when each names the other: the website in its /.well-known/assetlinks.json, the app in a
 * string resource `asset_statements` that points at that file, named by a meta-data entry under
 * <application> (Google's Smart Lock for Passwords steps). The quotes are escaped as a string
 * resource needs them, or Android drops them and the statement is not JSON. iOS names the house
 * in `ios.associatedDomains` (app.json) and needs nothing here.
 *
 * Proven by plugins/__tests__/withAssetStatements.test.ts on the strings and manifest prebuild
 * writes.
 */
const { withAndroidManifest, withStringsXml } = require('expo/config-plugins');
const { host } = require('../src/linking/housePaths.json');

const NAME = 'asset_statements';
const STATEMENT = `[{\\"include\\": \\"https://${host}/.well-known/assetlinks.json\\"}]`;

/** strings.xml with the statement, once. */
function addStatementString(xml) {
  const resources = xml.resources ?? (xml.resources = {});
  const list = resources.string ?? (resources.string = []);
  const had = list.find((s) => s.$?.name === NAME);
  if (had) had._ = STATEMENT;
  else list.push({ $: { name: NAME, translatable: 'false' }, _: STATEMENT });
  return xml;
}

/** The manifest with <application> naming the statement, once. */
function addStatementMetaData(manifest) {
  const application = manifest.manifest?.application?.[0];
  if (!application) throw new Error('withAssetStatements: the manifest has no <application>. Read the generated AndroidManifest.xml and update this plugin.');
  const list = application['meta-data'] ?? (application['meta-data'] = []);
  if (!list.some((m) => m.$?.['android:name'] === NAME)) {
    list.push({ $: { 'android:name': NAME, 'android:resource': `@string/${NAME}` } });
  }
  return manifest;
}

function withAssetStatements(config) {
  config = withStringsXml(config, (mod) => { mod.modResults = addStatementString(mod.modResults); return mod; });
  return withAndroidManifest(config, (mod) => { mod.modResults = addStatementMetaData(mod.modResults); return mod; });
}

module.exports = withAssetStatements;
module.exports.addStatementString = addStatementString;
module.exports.addStatementMetaData = addStatementMetaData;
module.exports.STATEMENT = STATEMENT;
