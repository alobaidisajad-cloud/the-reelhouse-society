/**
 * AuthGuard.test.tsx — Component Tests
 * ─────────────────────────────────────
 * FLAW-07: Tests authentication gating behavior —
 * loading skeleton, redirect, and pass-through.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import AuthGuard from '../AuthGuard';
import { useAuthStore } from '../../stores/auth';

/**
 * Both components below set state one tick after render — the guard when its
 * session resolves, the list when it measures itself. Each test settles once so
 * that update lands inside act rather than after the test body.
 */

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

  it('renders children when authenticated', async () => {
    // A store write is a React update for anything subscribed to it, so it
    // belongs inside act just as much as a press does.
    await act(async () => { useAuthStore.setState({ isAuthenticated: true, loading: false }); });

    const { getByText } = render(
      <AuthGuard>
        <Text>Protected content</Text>
      </AuthGuard>
    );

    await act(async () => { await Promise.resolve(); });

    expect(getByText('Protected content')).toBeTruthy();
  });

  it('renders skeleton while auth is loading', async () => {
    await act(async () => { useAuthStore.setState({ isAuthenticated: false, loading: true }); });

    const { getAllByTestId } = render(
      <AuthGuard>
        <Text>Protected content</Text>
      </AuthGuard>
    );

    await act(async () => { await Promise.resolve(); });

    expect(getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('redirects when not authenticated and not loading', async () => {
    await act(async () => { useAuthStore.setState({ isAuthenticated: false, loading: false }); });

    const { queryByText, getByTestId } = render(
      <AuthGuard>
        <Text>Protected content</Text>
      </AuthGuard>
    );

    await act(async () => { await Promise.resolve(); });

    expect(queryByText('Protected content')).toBeNull();
    expect(getByTestId('redirect')).toBeTruthy();
  });
});
