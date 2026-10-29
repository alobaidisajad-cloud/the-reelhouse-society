/**
 * REDUCE MOTION, CHANGED WHILE THE APP IS OPEN (P4.40).
 *
 * Reanimated's useReducedMotion is the setting as it stood at launch, read once: a member who
 * turned Reduce Motion on with the app open was still moved until they quit it. The house reads
 * it through useReduceMotion, which starts from the setting at launch and follows every change
 * the phone reports after; and nothing in the app reads Reanimated's own any more.
 */
import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useReduceMotion } from '../useReduceMotion';
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

let mockChanged: ((on: boolean) => void) | null = null;
beforeAll(() => {
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, fn: (on: boolean) => void) => {
    if (event === 'reduceMotionChanged') mockChanged = fn;
    return { remove: () => {} };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
});
afterAll(() => { jest.restoreAllMocks(); });

it('starts from the setting at launch, and follows it as it changes, both ways', async () => {
  jest.mocked(useReducedMotion).mockReturnValue(false);
  const { result } = await renderHook(() => useReduceMotion());
  expect(result.current).toBe(false);
  await act(async () => { mockChanged!(true); });
  expect(result.current).toBe(true);
  await act(async () => { mockChanged!(false); });
  expect(result.current).toBe(false);
});

it('nothing in the app reads Reanimated\'s own, which never changes after launch', () => {
  const readers = files('appCode').map(rel)
    .filter((f) => f !== 'src/hooks/useReduceMotion.tsx')
    .filter((f) => /\buseReducedMotion\b/.test(readCode(f)));
  expect(readers).toEqual([]);
  // The finder reads the app: the hook itself is found by it.
  expect(/\buseReducedMotion\b/.test(readCode('src/hooks/useReduceMotion.tsx'))).toBe(true);
});
