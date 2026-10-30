/**
 * withShrunkRelease.test.ts — Android's release is shrunk and obfuscated, its unused resources gone.
 *
 * The plugin is run through the gradle.properties mod prebuild calls, on the properties the
 * template writes, and app.json is read for it and for Sentry's mapping upload.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const plugin = require('../withShrunkRelease');
const { shrink, SETTINGS } = plugin;

const MOBILE = join(__dirname, '..', '..');
type Item = { type: string; key?: string; value?: string };
const TEMPLATE: Item[] = [
  { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' },
  { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
  { type: 'comment', value: 'Use this property to enable or disable the Hermes JS engine.' },
];

it('switches R8 and resource shrinking on, each once, and keeps every other line', () => {
  const out: Item[] = shrink(TEMPLATE);
  const value = (key: string) => out.filter((i) => i.key === key).map((i) => i.value);
  expect(value('android.enableMinifyInReleaseBuilds')).toEqual(['true']);
  expect(value('android.enableShrinkResourcesInReleaseBuilds')).toEqual(['true']);
  expect(value('org.gradle.jvmargs')).toEqual(['-Xmx2048m']);
  expect(out.filter((i) => i.type === 'comment')).toHaveLength(1);
  expect(shrink(out)).toEqual(out);
  expect(Object.values(SETTINGS)).toEqual(['true', 'true']);
});

it('is the mod prebuild runs', async () => {
  const config = plugin({ name: 'reelhouse', slug: 'reelhouse' });
  const result = await config.mods.android.gradleProperties({ ...config, modResults: TEMPLATE, modRequest: { platform: 'android' } });
  expect(result.modResults).toEqual(shrink(TEMPLATE));
});

it('is in every build, and Sentry uploads each build’s mapping so a crash still reads', () => {
  const plugins: unknown[] = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo.plugins;
  const names = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  const ours = names.indexOf('./plugins/withShrunkRelease');
  expect(ours).toBeGreaterThanOrEqual(0);
  expect(require.resolve(resolve(MOBILE, names[ours] as string))).toBe(require.resolve('../withShrunkRelease'));
  const sentry = plugins.find((p) => Array.isArray(p) && p.includes('@sentry/react-native')) as [string, { experimental_android?: object }] | undefined;
  expect(sentry?.slice(1)).toEqual([expect.objectContaining({ experimental_android: expect.objectContaining({ enableAndroidGradlePlugin: true, autoUploadProguardMapping: true }) })]);
});
