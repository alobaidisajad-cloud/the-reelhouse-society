/**
 * SectionErrorBoundary.test.tsx — Component Tests
 * ──────────────────────────────────────────────────
 * FLAW-07: First-ever component test coverage.
 * Validates crash recovery, retry logic, and exhaustion behavior.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SectionErrorBoundary } from '../SectionErrorBoundary';

// Suppress console.error from React's error boundary logging
const originalConsoleError = console.error;
beforeAll(() => { console.error = jest.fn(); });
afterAll(() => { console.error = originalConsoleError; });

// Component that throws on demand
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Boom!');
  return <Text>All good</Text>;
}

describe('SectionErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <SectionErrorBoundary section="test">
        <Text>Child content</Text>
      </SectionErrorBoundary>
    );
    expect(getByText('Child content')).toBeTruthy();
  });

  it('renders fallback UI when child throws', () => {
    const { getByText } = render(
      <SectionErrorBoundary section="test">
        <Bomb shouldThrow={true} />
      </SectionErrorBoundary>
    );
    expect(getByText(/encountered an error/i)).toBeTruthy();
  });

  it('shows custom fallback message when provided', () => {
    const { getByText } = render(
      <SectionErrorBoundary section="test" fallbackMessage="Custom crash message">
        <Bomb shouldThrow={true} />
      </SectionErrorBoundary>
    );
    expect(getByText('Custom crash message')).toBeTruthy();
  });

  it('shows retry button with correct count', () => {
    const { getByText } = render(
      <SectionErrorBoundary section="test">
        <Bomb shouldThrow={true} />
      </SectionErrorBoundary>
    );
    expect(getByText(/RETRY \(2 left\)/)).toBeTruthy();
  });

  it('shows exhaustion message after max retries', async () => {
    // It used to assert the first render's "2 left" and call that exhaustion.
    // Now the retries are spent: the section throws again on every remount.
    const { getByText, getByLabelText, queryByLabelText, queryByText } = render(
      <SectionErrorBoundary section="reels">
        <Bomb shouldThrow={true} />
      </SectionErrorBoundary>
    );
    await act(async () => { fireEvent.press(getByLabelText('Retry loading the reels')); });
    expect(getByText(/RETRY \(1 left\)/)).toBeTruthy();
    await act(async () => { fireEvent.press(getByLabelText('Retry loading the reels')); });

    expect(getByText('This section could not recover. Try restarting the app.')).toBeTruthy();
    expect(queryByLabelText('Retry loading the reels')).toBeNull();
    expect(queryByText(/encountered an error/i)).toBeNull();
  });

});
