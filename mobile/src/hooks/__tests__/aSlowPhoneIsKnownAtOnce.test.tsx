/**
 * aSlowPhoneIsKnownAtOnce.test.tsx — a phone spared heavy animation is spared
 * from the first frame.
 *
 * The answer used to arrive in an effect, after the first render had said
 * "no". The preloader decides on its first render, so it began its once-only
 * countdown on the very phones it meant to spare.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { useDeviceThrottling } from '../useDeviceThrottling';

// Hoisted above the imports by jest.
jest.mock('expo-device', () => ({ totalMemory: 2 * 1024 * 1024 * 1024, platformApiLevel: 33 }));

it('a 2GB phone is known on the first render', () => {
  const answers: boolean[] = [];
  function Probe() { answers.push(useDeviceThrottling()); return null; }
  render(<Probe />);
  expect(answers[0]).toBe(true);
});
