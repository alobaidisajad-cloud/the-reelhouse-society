#!/usr/bin/env node
/**
 * floor-app.mjs — the framework's own floor: an empty app built exactly as ours is, to measure what
 * no tuning of ours can beat (e2e/limits.json, the framework's floor).
 *
 *   node e2e/lab/floor-app.mjs write <dir>      the empty app, ready for `npm install`, prebuild and Gradle
 *   node e2e/lab/floor-app.mjs judge <dir>      its timed starts (feel.sh's start-<n>.am and .mem), as a record
 *
 * Written from ours each time, so it can never drift from it: the exact versions of expo, react and
 * react-native in mobile/package-lock.json; app.json's native settings (orientation, the interface
 * style, the Android and iOS keys that shape a build) and the plugins that shape the release build
 * itself (BUILD_PLUGINS, copied from mobile/plugins), under its own name and package. What it
 * leaves out is the app: no router, no screens, no services — one View on the house's ink, which
 * says it is ready in the device log as ours does (`[floor] ready`), so a start is timed the same way.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The plugins that shape how the release build is made, not what the app does. */
export const BUILD_PLUGINS = ['withShrunkRelease', 'withOneNdk', 'withGwpAsanOff'];
export const FLOOR_PACKAGE = 'com.reelhouse.floor';

/** The installed version of a package, as the lockfile pins it. */
const pinned = (lock, name) => {
  const v = lock.packages?.[`node_modules/${name}`]?.version;
  if (!v) throw new Error(`mobile/package-lock.json pins no ${name}`);
  return v;
};

/** The floor app's files: { path: text }, from ours. */
export function floorFiles(appJson = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')), lock = JSON.parse(readFileSync(join(MOBILE, 'package-lock.json'), 'utf8'))) {
  const ours = appJson.expo;
  const pkg = { name: 'reelhouse-floor', private: true, main: 'index.js',
    dependencies: Object.fromEntries(['expo', 'react', 'react-native'].map((n) => [n, pinned(lock, n)])) };
  const android = { package: FLOOR_PACKAGE, ...Object.fromEntries(['softwareKeyboardLayoutMode', 'predictiveBackGestureEnabled', 'edgeToEdgeEnabled'].filter((k) => k in (ours.android ?? {})).map((k) => [k, ours.android[k]])) };
  const ios = { bundleIdentifier: FLOOR_PACKAGE, ...Object.fromEntries(['supportsTablet'].filter((k) => k in (ours.ios ?? {})).map((k) => [k, ours.ios[k]])) };
  const app = { expo: { name: 'Floor', slug: 'reelhouse-floor', version: ours.version, orientation: ours.orientation, userInterfaceStyle: ours.userInterfaceStyle,
    android, ios, plugins: BUILD_PLUGINS.map((p) => `./plugins/${p}`), ...(ours.experiments ? { experiments: { ...ours.experiments, typedRoutes: undefined } } : {}) } };
  const index = [
    "import { AppRegistry, View } from 'react-native';",
    '',
    '// One View on the house\'s ink; ready in the device log as soon as it first lays out.',
    "const Floor = () => <View style={{ flex: 1, backgroundColor: '#0D0B09' }} onLayout={() => console.warn('[floor] ready')} />;",
    "AppRegistry.registerComponent('main', () => Floor);",
    '',
  ].join('\n');
  return { 'package.json': `${JSON.stringify(pkg, null, 2)}\n`, 'app.json': `${JSON.stringify(app, null, 2)}\n`, 'index.js': index };
}

/** A start's numbers from feel.sh's files: { totalMs, pssKb, nativeKb }, each null when unread. */
export function startOf(am, mem) {
  const n = (re, t) => { const m = re.exec(t ?? ''); return m ? Number(m[1]) : null; };
  return { totalMs: n(/TotalTime: (\d+)/, am), pssKb: n(/TOTAL(?: PSS)?:\s+(\d+)/, mem), nativeKb: n(/Native Heap:\s+(\d+)/, mem) };
}

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, dir] = process.argv.slice(2);
  if (cmd === 'write' && dir) {
    mkdirSync(join(dir, 'plugins'), { recursive: true });
    for (const [f, text] of Object.entries(floorFiles())) writeFileSync(join(dir, f), text);
    for (const p of BUILD_PLUGINS) copyFileSync(join(MOBILE, 'plugins', `${p}.js`), join(dir, 'plugins', `${p}.js`));
    console.log(`the floor app written to ${dir}`);
  } else if (cmd === 'judge' && dir) {
    const starts = [];
    for (let n = 1; existsSync(join(dir, `start-${n}.am`)); n++) {
      starts.push(startOf(readFileSync(join(dir, `start-${n}.am`), 'utf8'), existsSync(join(dir, `start-${n}.mem`)) ? readFileSync(join(dir, `start-${n}.mem`), 'utf8') : ''));
    }
    if (!starts.length) { console.error(`no timed start of the floor app in ${dir}`); process.exit(1); }
    const rec = { starts: starts.length, coldStartMs: median(starts.map((s) => s.totalMs)), pssKb: median(starts.map((s) => s.pssKb)), nativeKb: median(starts.map((s) => s.nativeKb)) };
    console.log(JSON.stringify(rec));
    process.exit(rec.coldStartMs == null ? 1 : 0);
  } else {
    console.error('usage: node e2e/lab/floor-app.mjs write <dir> | judge <dir>');
    process.exit(2);
  }
}
