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
      // Every Text drawn, hidden ones too: an empty subtitle line is still a line.
      const texts = (el: React.ReactElement) => {
        let n = 0;
        const walk = (node: unknown) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(walk); return; }
          const j = node as { type: string; children: unknown[] | null };
          if (j.type === 'Text') n++;
          (j.children ?? []).forEach(walk);
        };
        walk(render(el).toJSON());
        return n;
      };
      const without = render(<EmptyState title="T" />);
      expect(without.getByText('T')).toBeTruthy();
      // The same state with a subtitle draws exactly one Text more: without one, nothing stands in its place.
      expect(texts(<EmptyState title="T" subtitle="Sub text" />) - texts(<EmptyState title="T" />)).toBe(1);
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
