/**
 * withGwpAsanOff.test.ts — the app runs without Android's sampled GWP-ASan, which crashes Hermes.
 *
 * The plugin is run on AndroidManifest.xml exactly as `expo prebuild` generates it for this app
 * (fixtures/AndroidManifest.xml), read and written by the same parser prebuild uses.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const { AndroidConfig } = require('expo/config-plugins');
const plugin = require('../withGwpAsanOff');
const { turnGwpAsanOff, FIXED_IN } = plugin;

const MOBILE = join(__dirname, '..', '..');
const FIXTURE = join(__dirname, 'fixtures', 'AndroidManifest.xml');

/** A version as numbers, to be compared. */
const numbers = (v: string) => v.split('.').map(Number);
const atLeast = (v: string, floor: string) => {
  const [a, b] = [numbers(v), numbers(floor)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

describe('the generated AndroidManifest.xml', () => {
  it('tells the application never to run GWP-ASan, and keeps everything else it says', async () => {
    const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(FIXTURE);
    const before = { ...manifest.manifest.application[0].$ };
    const out = turnGwpAsanOff(manifest);
    expect(out.manifest.application[0].$).toEqual({ ...before, 'android:gwpAsanMode': 'never' });
    expect(before['android:gwpAsanMode']).toBeUndefined();
  });

  it('refuses a manifest with no application rather than passing it on unchanged', () => {
    expect(() => turnGwpAsanOff({ manifest: {} })).toThrow(/no application/);
  });
});

describe('the app', () => {
  it('runs the plugin at prebuild', () => {
    const { expo } = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8'));
    expect(expo.plugins).toContain('./plugins/withGwpAsanOff');
  });

  it('is read again once React Native carries Hermes\'s fix', () => {
    const { version } = JSON.parse(readFileSync(join(MOBILE, 'node_modules', 'react-native', 'package.json'), 'utf8'));
    // Failing here: React Native has reached the version said to carry the fix. Run the Sealed E2E
    // without this plugin; if no launch crashes in GWP-ASan, delete the plugin and this test.
    expect(atLeast(version, FIXED_IN)).toBe(false);
  });
});
