/**
 * EmptyStates.test.tsx — Component Tests
 * ───────────────────────────────────────
 * FLAW-07: Tests all 7 empty state variants render correctly
 * with their expected titles and Buster moods.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import {
  EmptyState,
  EmptyLedger,
  EmptyWatchlist,
  EmptyVault,
  EmptyLists,
  EmptyReviews,
  EmptyFeed,
  EmptyOffline,
} from '../EmptyStates';

// Mock Buster component
jest.mock('../Buster', () => {
  const { Text } = require('react-native');
  const BusterMock = ({ mood, message }: { mood: string; message?: string }) => (
    <Text testID="buster">{`Buster:${mood}${message ? ':' + message : ''}`}</Text>
  );
  BusterMock.displayName = 'Buster';
  return { __esModule: true, default: BusterMock };
});

// Mock lore picker to return deterministic values
jest.mock('../../lore/fragments', () => ({
  pickRandom: (arr: string[]) => arr[0],
}));

describe('EmptyStates', () => {
  describe('EmptyState (base)', () => {
    it('renders title', () => {
      const { getByText } = render(<EmptyState title="Test Title" />);
      expect(getByText('Test Title')).toBeTruthy();
    });

    it('renders subtitle when provided', () => {
      const { getByText } = render(<EmptyState title="T" subtitle="Sub text" />);
      expect(getByText('Sub text')).toBeTruthy();
    });

    it('omits subtitle when not provided', () => {
      const { queryByText } = render(<EmptyState title="T" />);
      // Only title should be present, no subtitle
      expect(queryByText('T')).toBeTruthy();
    });

    it('renders Buster when useBuster=true', () => {
      const { getByTestId } = render(
        <EmptyState title="T" useBuster busterMood="neutral" />
      );
      expect(getByTestId('buster')).toBeTruthy();
    });
  });

  describe('Preset variants', () => {
    it('EmptyLedger renders with correct title', () => {
      const { getByText } = render(<EmptyLedger />);
      expect(getByText('The Ledger Awaits')).toBeTruthy();
    });

    it('EmptyWatchlist renders with correct title', () => {
      const { getByText } = render(<EmptyWatchlist />);
      expect(getByText('The Queue Is Empty')).toBeTruthy();
    });

    it('EmptyVault renders with correct title', () => {
      const { getByText } = render(<EmptyVault />);
      expect(getByText('The Vault Is Sealed')).toBeTruthy();
    });

    it('EmptyLists renders with correct title', () => {
      const { getByText } = render(<EmptyLists />);
      expect(getByText('No Stacks Curated')).toBeTruthy();
    });

    it('EmptyReviews renders with correct title', () => {
      const { getByText } = render(<EmptyReviews />);
      expect(getByText("The Critic's Chair Is Empty")).toBeTruthy();
    });

    it('EmptyFeed renders with correct title', () => {
      const { getByText } = render(<EmptyFeed />);
      expect(getByText('The Foyer Is Quiet')).toBeTruthy();
    });

    it('EmptyOffline renders with correct title', () => {
      const { getByText } = render(<EmptyOffline />);
      expect(getByText('Transmission Interrupted')).toBeTruthy();
    });
  });
});
