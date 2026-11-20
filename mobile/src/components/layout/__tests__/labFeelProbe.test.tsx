/**
 * labFeelProbe.test.tsx — the feel probe times what it says (LabFeelProbe.tsx): a touch from the
 * phone's stamp to the end of the first commit after it, a touch no commit answers by its first
 * sight alone, a stamp on another clock as unmeasured, and each second's commits. That it is
 * nothing in any other build: labFeelProbeOff.test.tsx.
 */
import React, { useState } from 'react';
import { Pressable, Text, type GestureResponderEvent } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { ANSWER_WAIT_MS, CLOCKS_APART_MS, FeelProfiler, feelTouch } from '../LabFeelProbe';

jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: jest.fn(), E2E_BUILD: true, LAB_BUILD: true, FEEL_BUILD: true }));

const touchAt = (msAgo: number) => ({ nativeEvent: { timestamp: globalThis.performance.now() - msAgo } }) as unknown as GestureResponderEvent;
const lines = (event: string) => jest.mocked(e2eTrace).mock.calls.filter(([e]) => e === event).map(([, d]) => d as Record<string, unknown>);

function Counter() {
  const [n, setN] = useState(0);
  return <Pressable onPress={() => setN(n + 1)}><Text>{`PRESSED ${n}`}</Text></Pressable>;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(e2eTrace).mockClear();
  jest.mocked(usePathname).mockReturnValue('/reels');
});
afterEach(() => { jest.useRealTimers(); });

it('times a touch from its stamp to the end of the commit that answers it', async () => {
  const page = render(<FeelProfiler><Counter /></FeelProfiler>);
  expect(feelTouch).toBeDefined();
  feelTouch?.(touchAt(5));
  await fireEvent.press(page.getByText('PRESSED 0'));
  expect(page.getByText('PRESSED 1')).toBeTruthy();
  const [tap] = lines('feel.tap');
  expect(tap).toMatchObject({ path: '/reels' });
  expect(tap?.js as number).toBeGreaterThanOrEqual(5);
  expect(tap?.answer as number).toBeGreaterThanOrEqual(tap?.js as number);
  expect(typeof tap?.commit).toBe('number');
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lines('feel.commits')[0]).toMatchObject({ path: '/reels' });
  expect((lines('feel.commits')[0]?.n as number)).toBeGreaterThanOrEqual(1);
});

it('says when no commit answered a touch, by the JS thread\'s first sight of it alone', async () => {
  render(<FeelProfiler><Text>STILL</Text></FeelProfiler>);
  jest.mocked(e2eTrace).mockClear();
  feelTouch?.(touchAt(3));
  await act(async () => { jest.advanceTimersByTime(ANSWER_WAIT_MS); });
  expect(lines('feel.tap')).toEqual([expect.objectContaining({ answer: null, commit: null })]);
});

it('refuses a stamp on another clock: unmeasured, never a fast tap', () => {
  render(<FeelProfiler><Text>STILL</Text></FeelProfiler>);
  feelTouch?.(touchAt(CLOCKS_APART_MS + 1000));
  feelTouch?.({ nativeEvent: { timestamp: globalThis.performance.now() + 50 } } as unknown as GestureResponderEvent);
  expect(lines('feel.tap').map((t) => t.clocks)).toEqual(['apart', 'apart']);
});
