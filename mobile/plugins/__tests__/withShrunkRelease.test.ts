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

describe('the keep rules for what the release checks read', () => {
  const { withKeep, KEEP } = plugin as { withKeep: (t: string) => string; KEEP: string[] };
  const TEMPLATE_RULES = '# Add any project specific keep options here:\n-keep class com.facebook.react.turbomodule.** { *; }\n';

  it('are written once, at the end, and an earlier copy is replaced, never doubled', () => {
    const once = withKeep(TEMPLATE_RULES);
    expect(once.startsWith(TEMPLATE_RULES.trimEnd())).toBe(true);
    expect(KEEP.every((rule) => once.split(rule).length === 2)).toBe(true);
    expect(withKeep(once)).toBe(once);
    expect(withKeep('')).toContain(KEEP.join('\n'));
  });

  it('keep every class the checks read by name, so a check never reads a renamed one', () => {
    const checks = ['e2e/glide-log-level.mjs', 'e2e/prefetch-download-only.mjs'].map((f) => readFileSync(join(MOBILE, f), 'utf8')).join('\n');
    // dexdump's spelling in the checks' patterns (Lcom\/a\/B;) and their method names (com.a.B.method:).
    const spelt = [...checks.matchAll(/L(?<name>(?:com|expo|android)\\\/[A-Za-z\\\/]+);/g)].map((m) => (m.groups?.name ?? '').split('\\/').join('.'));
    const named = [...checks.matchAll(/'(?<name>expo\.modules\.[A-Za-z.]+?)(?:\.[a-z]\w*:)?'/g)].map((m) => m.groups?.name ?? '');
    const classes = [...new Set([...spelt, ...named])];
    expect(classes.length).toBeGreaterThanOrEqual(6);
    expect(classes.filter((c) => !KEEP.some((rule) => rule.startsWith(`-keep class ${c} `) || rule === `-keep class ${c}`))).toEqual([]);
  });

  it('are what prebuild writes into the app\'s proguard-rules.pro', async () => {
    const fs = require('fs') as typeof import('fs');
    const os = require('os') as typeof import('os');
    const root = fs.mkdtempSync(join(os.tmpdir(), 'shrunk-'));
    fs.mkdirSync(join(root, 'app'));
    fs.writeFileSync(join(root, 'app', 'proguard-rules.pro'), TEMPLATE_RULES);
    const config = plugin({ name: 'reelhouse', slug: 'reelhouse' });
    await config.mods.android.dangerous({ ...config, modResults: {}, modRequest: { platform: 'android', platformProjectRoot: root } });
    expect(fs.readFileSync(join(root, 'app', 'proguard-rules.pro'), 'utf8')).toBe(withKeep(TEMPLATE_RULES));
    fs.rmSync(root, { recursive: true, force: true });
  });
});
