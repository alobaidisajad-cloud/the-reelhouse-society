/**
 * hookTestHelpers.ts — Shared test utilities for hook testing.
 * ─────────────────────────────────────────────────────────────
 * Provides QueryClient-wrapped renderHook and common mock factories.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, type RenderHookOptions } from '@testing-library/react-native';
import React from 'react';

/**
 * Creates an isolated QueryClient for testing (no retries, instant GC).
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders a hook wrapped in QueryClientProvider for hooks that depend on React Query.
 */
export function renderHookWithQuery<T>(
  hook: () => T,
  options?: Omit<RenderHookOptions<T>, 'wrapper'>
) {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(hook, { ...options, wrapper }), queryClient };
}
