/**
 * theMountOrderGuardIsInstalled.guard.test.ts — the Reanimated that cannot update a view before it is made.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reanimated 4.1 ran its waiting prop updates whenever an event arrived on the UI thread. An
 * image that finished loading (expo-image's onLoad, from its cache) arrived between React making
 * a view and Android mounting it, and Reanimated's commit updated view 2644 before the batch that
 * created it: "Unable to find viewState for tag 2644", and React was destroyed (Sealed E2E
 * 39642840944, shard 1, the log probe). From 4.2 a UI-thread pass first keeps only the tags whose
 * views are mounted (preserveMountedTags), and from the fix to issue 9636 a view still being made
 * is treated as not mounted rather than thrown on.
 *
 * Expo SDK 54 pins ~4.1, so `npx expo install --fix` would quietly take this back to the crash.
 * This reads the installed library and the manifest, and fails if either loses the guard.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const LIB = join(MOBILE, 'node_modules', 'react-native-reanimated');
/** The installed library's file, in the language it ships it: Kotlin from Reanimated 4.5, Java and Groovy before. */
const either = (...paths: string[][]) => {
  const at = paths.map((p) => join(LIB, ...p)).find((p) => existsSync(p));
  if (!at) throw new Error(`none of ${paths.map((p) => p.join('/')).join(', ')} in the installed Reanimated`);
  return readFileSync(at, 'utf8');
};
const PROXY = ['android', 'src', 'main', 'java', 'com', 'swmansion', 'reanimated'];
const proxy = either([...PROXY, 'NativeProxy.kt'], [...PROXY, 'NativeProxy.java']);
const installed = JSON.parse(readFileSync(join(LIB, 'package.json'), 'utf8')).version as string;
const asked = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8')).dependencies['react-native-reanimated'] as string;

const atLeast = (v: string, [maj, min, pat]: [number, number, number]) => {
  const [a = 0, b = 0, c = 0] = v.replace(/^[~^]/, '').split('.').map(Number);
  return a !== maj ? a > maj : b !== min ? b > min : c >= pat;
};

it('the installed Reanimated keeps only mounted views in a UI-thread pass', () => {
  expect(proxy).toMatch(/public boolean preserveMountedTags\(int\[\] tags\)|fun preserveMountedTags\(tags: IntArray\): Boolean/);
});

it('and treats a view still being made as not mounted, never throwing on it', () => {
  const body = proxy.slice(proxy.indexOf('preserveMountedTags('));
  expect(body).toMatch(/catch \(IllegalViewOperationException e\)|catch \(e: IllegalViewOperationException\)/);
});

it('the manifest asks for a Reanimated with both, not the SDK pin', () => {
  expect([asked, atLeast(asked, [4, 3, 4])]).toEqual([asked, true]);
  expect([installed, atLeast(installed, [4, 3, 4])]).toEqual([installed, true]);
});

/*
 * And the same crash from the other side (Sealed E2E 39763329848, shard 1, lounge_flow): an animation
 * frame committed view 538's props from the UI thread while React's own commit removed it, on
 * Android's push model nothing orders the two, and React Native 0.81 throws on the update (it logs
 * instead from 0.86, react-native 56147). With ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS the props a
 * frame most often animates (opacity, transform, colours, radii) go straight to the view by
 * React Native's own path, which skips a view already gone; only layout props still commit.
 */
it('Android writes a frame\'s opacity and transform straight to the view, where a removed view is skipped', () => {
  const flags = (JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8')).reanimated ?? {}).staticFeatureFlags ?? {};
  expect(flags.ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS).toBe(true);
  // The library's build reads the app's package.json for them: Groovy before 4.5, Kotlin from it.
  const gradle = either(['android', 'build.gradle.kts'], ['android', 'build.gradle']);
  expect(gradle).toMatch(/packageJson\.reanimated\?\.staticFeatureFlags|packageJson\["reanimated"\][^\n]*\n[^\n]*get\("staticFeatureFlags"\)/);
});
