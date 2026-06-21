/**
 * AuthGuard.test.tsx — Component Tests
 * ─────────────────────────────────────
 * FLAW-07: Tests authentication gating behavior —
 * loading skeleton, redirect, and pass-through.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import AuthGuard from '../AuthGuard';
import { useAuthStore } from '../../stores/auth';

// Mock SkeletonPulse as a simple View
jest.mock('../SkeletonPulse', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => <View testID="skeleton" {...props} />,
  };
});

// Mock expo-router Redirect to avoid navigation context requirement
jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{`Redirect:${href}`}</Text>,
    useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() })),
    useLocalSearchParams: jest.fn(() => ({})),
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  };
});


describe('AuthGuard', () => {
  afterEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false });
  });

  it('renders children when authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true, loading: false });

    const { getByText } = render(
      <AuthGuard>
        <Text>Protected content</Text>
      </AuthGuard>
    );

    expect(getByText('Protected content')).toBeTruthy();
  });

  it('renders skeleton while auth is loading', () => {
    useAuthStore.setState({ isAuthenticated: false, loading: true });

    const { getAllByTestId } = render(
      <AuthGuard>
        <Text>Protected content</Text>
      </AuthGuard>
    );

    expect(getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('redirects when not authenticated and not loading', () => {
    useAuthStore.setState({ isAuthenticated: false, loading: false });

    const { queryByText, getByTestId } = render(
      <AuthGuard>
        <Text>Protected content</Text>
      </AuthGuard>
    );

    expect(queryByText('Protected content')).toBeNull();
    expect(getByTestId('redirect')).toBeTruthy();
  });
});
