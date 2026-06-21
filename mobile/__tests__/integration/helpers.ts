/**
 * Integration Test Helpers
 * ────────────────────────────────────────────────────────────────
 * Shared utilities for integration tests that exercise real Zustand stores
 * with mocked I/O boundaries (Supabase, MMKV, network state).
 *
 * KEY DIFFERENTIATOR: Unit tests mock stores. Integration tests use REAL
 * store instances and only mock the external boundaries (Supabase, network).
 */

import { useAuthStore } from '@/src/stores/auth';
import { useSocialStore } from '@/src/stores/followStore';
import { useNotificationStore } from '@/src/stores/notificationStore';

// ── MockedSupabase ──────────────────────────────────────────────────────────
// Factory that returns a fully chainable Supabase mock object.
// Each method returns `this` for chaining, with terminal methods resolving data.

export interface MockedSupabaseChain {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  or: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  rpc: jest.Mock;
  // Additional chainable methods
  upsert: jest.Mock;
  neq: jest.Mock;
  is: jest.Mock;
  not: jest.Mock;
  gt: jest.Mock;
  gte: jest.Mock;
  lt: jest.Mock;
  lte: jest.Mock;
  like: jest.Mock;
  ilike: jest.Mock;
  range: jest.Mock;
  abortSignal: jest.Mock;
  then: jest.Mock;
  /** Override the resolved data for terminal methods */
  _setData(data: unknown): void;
  /** Override the resolved error for terminal methods */
  _setError(error: unknown): void;
}

export function createMockSupabase(options?: {
  data?: unknown;
  error?: unknown;
}): MockedSupabaseChain {
  let resolvedData = options?.data ?? null;
  let resolvedError = options?.error ?? null;

  const chainable = {} as MockedSupabaseChain;

  const self = () => chainable;

  // Query builder chain methods
  chainable.select = jest.fn().mockImplementation(self);
  chainable.insert = jest.fn().mockImplementation(self);
  chainable.update = jest.fn().mockImplementation(self);
  chainable.upsert = jest.fn().mockImplementation(self);
  chainable.delete = jest.fn().mockImplementation(self);
  chainable.eq = jest.fn().mockImplementation(self);
  chainable.neq = jest.fn().mockImplementation(self);
  chainable.in = jest.fn().mockImplementation(self);
  chainable.is = jest.fn().mockImplementation(self);
  chainable.not = jest.fn().mockImplementation(self);
  chainable.or = jest.fn().mockImplementation(self);
  chainable.gt = jest.fn().mockImplementation(self);
  chainable.gte = jest.fn().mockImplementation(self);
  chainable.lt = jest.fn().mockImplementation(self);
  chainable.lte = jest.fn().mockImplementation(self);
  chainable.like = jest.fn().mockImplementation(self);
  chainable.ilike = jest.fn().mockImplementation(self);
  chainable.order = jest.fn().mockImplementation(self);
  chainable.limit = jest.fn().mockImplementation(self);
  chainable.range = jest.fn().mockImplementation(self);
  chainable.abortSignal = jest.fn().mockImplementation(self);

  // Terminal methods (resolve data)
  chainable.single = jest.fn().mockImplementation(() =>
    Promise.resolve({ data: resolvedData, error: resolvedError })
  );
  chainable.maybeSingle = jest.fn().mockImplementation(() =>
    Promise.resolve({ data: resolvedData, error: resolvedError })
  );
  chainable.rpc = jest.fn().mockImplementation(() =>
    Promise.resolve({ data: resolvedData, error: resolvedError })
  );

  // Terminal thenable — makes the builder `await`-able
  chainable.then = jest.fn((cb) =>
    Promise.resolve(
      cb({
        data: Array.isArray(resolvedData)
          ? resolvedData
          : resolvedData
            ? [resolvedData]
            : [],
        error: resolvedError,
        count: Array.isArray(resolvedData) ? resolvedData.length : 0,
      })
    )
  );

  // Mutation helpers for reconfiguring responses mid-test
  chainable._setData = (data: unknown) => {
    resolvedData = data;
  };
  chainable._setError = (error: unknown) => {
    resolvedError = error;
  };

  return chainable;
}

// ── resetStores ─────────────────────────────────────────────────────────────
// Resets all Zustand stores to their initial state between test runs.

export function resetStores(): void {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    loading: false,
  });

  useSocialStore.setState({
    following: [],
    requested: [],
    _followingIndex: new Set(),
    _requestedIndex: new Set(),
  });

  useNotificationStore.setState({
    notifications: [],
    loading: false,
    _fetching: false,
    _fetchingMore: false,
    _unreadCount: 0,
    _hasMore: true,
    _cursor: null,
  });
}

// ── mockNetwork ─────────────────────────────────────────────────────────────
// Controller object that toggles NetInfo mock to simulate online/offline state.

export interface NetworkController {
  setOnline(v: boolean): void;
  isOnline(): boolean;
}

export function createMockNetwork(): NetworkController {
  let online = true;

  function applyNetInfo(connected: boolean): void {
    const NetInfo = require('@react-native-community/netinfo');
    NetInfo.useNetInfo.mockReturnValue({
      isConnected: connected,
      isInternetReachable: connected,
      type: connected ? 'wifi' : 'none',
    });
    NetInfo.fetch.mockResolvedValue({
      isConnected: connected,
      isInternetReachable: connected,
    });
    if (NetInfo.default) {
      NetInfo.default.fetch.mockResolvedValue({ isConnected: connected });
    }
  }

  return {
    setOnline(v: boolean): void {
      online = v;
      applyNetInfo(v);
    },
    isOnline(): boolean {
      return online;
    },
  };
}

// ── sentrySpy ───────────────────────────────────────────────────────────────
// Creates a Sentry spy setup with mocked methods for integration test assertions.

export interface SentrySpy {
  captureException: jest.Mock;
  captureMessage: jest.Mock;
  startSpan: jest.Mock;
  addBreadcrumb: jest.Mock;
  /** Reset all spy call histories */
  reset(): void;
}

export function createSentrySpy(): SentrySpy {
  const Sentry = require('@sentry/react-native');

  // Ensure the mocks exist (jest.setup.ts creates most, but startSpan may be missing)
  if (!Sentry.startSpan) {
    Sentry.startSpan = jest.fn((_opts: unknown, fn: () => unknown) => fn());
  }

  const captureException: jest.Mock = Sentry.captureException;
  const captureMessage: jest.Mock = Sentry.captureMessage;
  const startSpan: jest.Mock = Sentry.startSpan;
  const addBreadcrumb: jest.Mock = Sentry.addBreadcrumb;

  return {
    captureException,
    captureMessage,
    startSpan,
    addBreadcrumb,
    reset(): void {
      captureException.mockClear();
      captureMessage.mockClear();
      startSpan.mockClear();
      addBreadcrumb.mockClear();
    },
  };
}

// ── createMockUser ──────────────────────────────────────────────────────────
// Factory for a valid user object matching the app's User type.

export function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    username: 'testuser',
    email: 'test@reelhouse.app',
    role: 'cinephile' as const,
    avatar_url: null,
    display_name: 'Test User',
    persona: 'The Cinephile',
    following: [],
    preferences: {},
    ...overrides,
  };
}
