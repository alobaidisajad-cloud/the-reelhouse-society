/**
 * Integration Test Setup
 * ────────────────────────────────────────────────────────────────
 * Scoped setup for integration tests. Imports and re-exports all
 * shared helpers, and sets up common mocks specific to integration tests.
 *
 * Individual test files import from this module:
 *   import { createMockSupabase, resetStores, createMockNetwork, createSentrySpy } from './setup';
 */

// ── Re-export all helpers ───────────────────────────────────────────────────
export {
    createMockNetwork, createMockSupabase, createMockUser, createSentrySpy, resetStores
} from './helpers';

export type {
    MockedSupabaseChain,
    NetworkController,
    SentrySpy
} from './helpers';

// ── Integration-scoped mocks ────────────────────────────────────────────────
// These mirror jest.setup.ts patterns but are imported explicitly by integration
// tests that need them. They don't run automatically — test files opt in.

/**
 * Sets up the Sentry mock with startSpan support for integration tests.
 * Call in beforeAll/beforeEach when your test needs Sentry span assertions.
 */
export function setupSentryMock(): void {
  const Sentry = require('@sentry/react-native');
  // jest.setup.ts mocks basic Sentry methods but may not include startSpan
  if (!Sentry.startSpan) {
    Sentry.startSpan = jest.fn((_opts: unknown, fn: () => unknown) => fn());
  }
  if (!Sentry.setMeasurement) {
    Sentry.setMeasurement = jest.fn();
  }
}

/**
 * Sets up the MMKV storage mock for integration tests.
 * Returns the mock store object for direct inspection in tests.
 */
export function setupMMKVMock(): Record<string, string> {
  // The jest.setup.ts already mocks mmkv-storage globally.
  // This returns a reference pattern for tests that need to inspect stored values.
  const mmkvStorage = require('@/src/stores/mmkv-storage');
  return mmkvStorage.storage;
}

/**
 * Sets up expo-crypto mock with deterministic UUID generation.
 * Useful for integration tests that need predictable IDs.
 */
export function setupDeterministicUUIDs(prefix = 'test'): void {
  const crypto = require('expo-crypto');
  let counter = 0;
  crypto.randomUUID.mockImplementation(
    () => `${prefix}-${String(++counter).padStart(4, '0')}-0000-0000-000000000000`
  );
}

/**
 * Resets the deterministic UUID counter. Call in beforeEach for predictable test ordering.
 */
export function resetDeterministicUUIDs(prefix = 'test'): void {
  const crypto = require('expo-crypto');
  let counter = 0;
  crypto.randomUUID.mockImplementation(
    () => `${prefix}-${String(++counter).padStart(4, '0')}-0000-0000-000000000000`
  );
}
