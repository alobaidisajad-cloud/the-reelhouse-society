/**
 * theStoreIsNeverBackedUp.test.ts — the phone's encrypted store never leaves in a backup (P4.14).
 *
 * The store's key lives in the Android Keystore, which no backup carries. A store restored
 * without it, to a new phone by Google's cloud backup or a phone-to-phone transfer, could not be
 * read: the launch would take it for a store never encrypted and recrypt bytes it cannot read.
 * So the store is never in a backup at all. expo-secure-store's plugin writes the app's backup
 * rules (Android 11 and lower: full-backup-content; 12 and up: data-extraction-rules, cloud and
 * device transfer both) as INCLUDE lists of shared preferences alone, SecureStore's excluded;
 * MMKV keeps the store under the app's files (domain "file"), which no include names. Proven
 * here on the rules that plugin ships, and on this app's config keeping them in force.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { files, rel } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..');
const SECURE_STORE = join(MOBILE, 'node_modules', 'expo-secure-store');
const rules = (name: string) => readFileSync(join(SECURE_STORE, 'android', 'src', 'main', 'res', 'xml', `${name}.xml`), 'utf8');

/** Each include and exclude in a rules file, as [section, tag, domain, path]. */
function entries(xml: string): [string, string, string, string][] {
  const out: [string, string, string, string][] = [];
  const sections = [...xml.matchAll(/<(cloud-backup|device-transfer|full-backup-content)[^>]*>([\s\S]*?)<\/\1>/g)];
  for (const [, section, body] of sections) {
    for (const [, tag, domain, path] of body!.matchAll(/<(include|exclude)\s+domain="([^"]+)"\s+path="([^"]*)"\s*\/>/g)) {
      out.push([section!, tag!, domain!, path!]);
    }
  }
  return out;
}

const plugin = readFileSync(join(SECURE_STORE, 'plugin', 'build', 'withSecureStore.js'), 'utf8');
const app = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;

describe('a backup of the app', () => {
  it('names only shared preferences, and never SecureStore, on every Android', () => {
    const all = { full: entries(rules('secure_store_backup_rules')), extraction: entries(rules('secure_store_data_extraction_rules')) };
    expect(all).toEqual({
      full: [['full-backup-content', 'include', 'sharedpref', '.'], ['full-backup-content', 'exclude', 'sharedpref', 'SecureStore']],
      extraction: [
        ['cloud-backup', 'include', 'sharedpref', '.'], ['cloud-backup', 'exclude', 'sharedpref', 'SecureStore'],
        ['device-transfer', 'include', 'sharedpref', '.'], ['device-transfer', 'exclude', 'sharedpref', 'SecureStore'],
      ],
    });
  });

  it('is ruled by those files: the plugin points the manifest at them unless told not to', () => {
    expect(plugin).toContain("const BACKUP_RULES_PATH = '@xml/secure_store_backup_rules'");
    expect(plugin).toContain("const EXTRACTION_RULES_PATH = '@xml/secure_store_data_extraction_rules'");
    expect(plugin).toMatch(/configureAndroidBackup = true/);
  });

  it('this app keeps them: the plugin listed, never told not to, and nothing else writing backup rules', () => {
    const secureStore = (app.plugins as unknown[]).filter((p) => p === 'expo-secure-store' || (Array.isArray(p) && p[0] === 'expo-secure-store'));
    expect(secureStore).toHaveLength(1);
    const options = Array.isArray(secureStore[0]) ? (secureStore[0] as [string, Record<string, unknown>])[1] : {};
    expect(options.configureAndroidBackup).not.toBe(false);
    const plugins = files('scripts', { ext: ['.js'] }).filter((p) => rel(p).startsWith('plugins/'));
    expect(plugins.length).toBeGreaterThanOrEqual(5);
    const ours = plugins.filter((p) => /fullBackupContent|dataExtractionRules|allowBackup/.test(readFileSync(p, 'utf8')));
    expect(ours).toEqual([]);
    expect(JSON.stringify(app.android ?? {})).not.toMatch(/fullBackupContent|dataExtractionRules/);
  });

  it('reads a rule that would carry the store (the check can say NO)', () => {
    const carried = entries('<data-extraction-rules><cloud-backup><include domain="file" path="mmkv"/></cloud-backup></data-extraction-rules>');
    expect(carried).toEqual([['cloud-backup', 'include', 'file', 'mmkv']]);
  });
});
