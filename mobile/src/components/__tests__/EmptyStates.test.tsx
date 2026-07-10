/**
 * EmptyStates.test.tsx — Component Tests
 * ───────────────────────────────────────
 * FLAW-07: Tests the empty-state base + the live preset variant.
 * (Six orphaned sibling variants were deleted with the dead ledger route.)
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { EmptyState, EmptyOffline } from '../EmptyStates';

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
    it('EmptyOffline renders with correct title', () => {
      const { getByText } = render(<EmptyOffline />);
      expect(getByText('Transmission Interrupted')).toBeTruthy();
    });
  });
});
