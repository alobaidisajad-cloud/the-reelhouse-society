/**
 * OfflineBanner.test.tsx — Component Tests
 * ─────────────────────────────────────────
 * FLAW-07: Tests offline banner visibility based on network state.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
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

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }: Record<string, unknown>) => <View {...props}>{children}</View>,
    },
    FadeInUp: { duration: () => ({}) },
    FadeOutUp: { duration: () => ({}) },
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

  it('has accessible retry button', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: false });
    const { getByLabelText } = render(<OfflineBanner />);
    expect(getByLabelText('Retry connection')).toBeTruthy();
  });
});
