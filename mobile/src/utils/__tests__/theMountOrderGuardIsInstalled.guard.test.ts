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
import { readFileSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const LIB = join(MOBILE, 'node_modules', 'react-native-reanimated');
const proxy = readFileSync(join(LIB, 'android', 'src', 'main', 'java', 'com', 'swmansion', 'reanimated', 'NativeProxy.java'), 'utf8');
const installed = JSON.parse(readFileSync(join(LIB, 'package.json'), 'utf8')).version as string;
const asked = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8')).dependencies['react-native-reanimated'] as string;

const atLeast = (v: string, [maj, min, pat]: [number, number, number]) => {
  const [a = 0, b = 0, c = 0] = v.replace(/^[~^]/, '').split('.').map(Number);
  return a !== maj ? a > maj : b !== min ? b > min : c >= pat;
};

it('the installed Reanimated keeps only mounted views in a UI-thread pass', () => {
  expect(proxy).toMatch(/public boolean preserveMountedTags\(int\[\] tags\)/);
});

it('and treats a view still being made as not mounted, never throwing on it', () => {
  const body = proxy.slice(proxy.indexOf('preserveMountedTags('));
  expect(body).toMatch(/catch \(IllegalViewOperationException e\)/);
});

it('the manifest asks for a Reanimated with both, not the SDK pin', () => {
  expect([asked, atLeast(asked, [4, 3, 4])]).toEqual([asked, true]);
  expect([installed, atLeast(installed, [4, 3, 4])]).toEqual([installed, true]);
});
