/**
 * OfflineBanner.test.tsx — Component Tests
 * ─────────────────────────────────────────
 * FLAW-07: Tests offline banner visibility based on network state.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import OfflineBanner from '../OfflineBanner';

// Mock NetInfo
const mockUseNetInfo = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => mockUseNetInfo(),
  __esModule: true,
  default: { fetch: jest.fn().mockResolvedValue({ isConnected: true }) },
}));

// Mock safe area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock PressableScale
jest.mock('../PressableScale', () => {
  const { Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }: Record<string, unknown>) => (
      <Pressable {...props}>{children}</Pressable>
    ),
  };
});

describe('OfflineBanner', () => {
  it('returns null when connected', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: true });
    const { toJSON } = render(<OfflineBanner />);
    expect(toJSON()).toBeNull();
  });

  it('renders banner when disconnected', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: false });
    const { getByText } = render(<OfflineBanner />);
    expect(getByText(/OPERATING IN ISOLATION/)).toBeTruthy();
  });

  it('says it is offline, not only what pressing it does', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: false });
    const { getByLabelText } = render(<OfflineBanner />);
    expect(getByLabelText('Offline. Check the connection again')).toBeTruthy();
  });

  it('counts the time offline in the house measure', async () => {
    jest.useFakeTimers();
    try {
      mockUseNetInfo.mockReturnValue({ isConnected: false });
      const r = render(<OfflineBanner />);
      await act(async () => { jest.advanceTimersByTime(150_000); });
      expect(r.getByText('OPERATING IN ISOLATION · 2 MIN.')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a check still settling when the banner goes takes its timer with it', async () => {
    jest.useFakeTimers();
    try {
      mockUseNetInfo.mockReturnValue({ isConnected: false });
      const set = jest.spyOn(global, 'setTimeout');
      const r = render(<OfflineBanner />);
      await act(async () => { await fireEvent.press(r.getByLabelText('Offline. Check the connection again')); });
      expect(r.getByLabelText('Checking the connection')).toBeTruthy();
      const settle = set.mock.calls.findIndex((c) => c[1] === 1000);
      expect(settle).toBeGreaterThan(-1);
      const id = set.mock.results[settle].value;
      const clear = jest.spyOn(global, 'clearTimeout');
      r.unmount();
      expect(clear).toHaveBeenCalledWith(id);
    } finally {
      jest.restoreAllMocks();
      jest.useRealTimers();
    }
  });
});
