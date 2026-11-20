/**
 * labFeelProbeOff.test.tsx — outside the feel build the feel probe is nothing at all
 * (LabFeelProbe.tsx): no touch handler on the root, no Profiler, not one line, and the tree it
 * wraps works as it does without it.
 */
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { FeelProfiler, feelTouch } from '../LabFeelProbe';

jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: jest.fn(), E2E_BUILD: true, LAB_BUILD: true, FEEL_BUILD: false }));

function Counter() {
  const [n, setN] = useState(0);
  return <Pressable onPress={() => setN(n + 1)}><Text>{`PRESSED ${n}`}</Text></Pressable>;
}

it('is nothing outside the feel build: no touch handler, no Profiler, no lines', async () => {
  expect(feelTouch).toBeUndefined();
  const page = render(<FeelProfiler><Counter /></FeelProfiler>);
  await fireEvent.press(page.getByText('PRESSED 0'));
  expect(page.getByText('PRESSED 1')).toBeTruthy();
  expect(page.toJSON()).toMatchObject({ type: 'View' });
  expect(e2eTrace).not.toHaveBeenCalled();
});
