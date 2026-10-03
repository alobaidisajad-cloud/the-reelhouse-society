/**
 * EmptyStates.test.tsx — Component Tests
 * ───────────────────────────────────────
 * FLAW-07: Tests the empty-state base + the live preset variant.
 * (Six orphaned sibling variants were deleted with the dead ledger route.)
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { EmptyState, EmptyOffline } from '../EmptyStates';

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

    it('draws Buster, in the mood asked for, where the icon would be', () => {
      const { getByTestId, queryByTestId } = render(<EmptyState title="T" buster="suspicious" />);
      expect(getByTestId('buster-suspicious', { includeHiddenElements: true })).toBeTruthy();
      // Without one, no Buster: the icon or glyph stands there instead.
      const plain = render(<EmptyState title="T" />);
      expect(plain.queryByTestId('buster-suspicious', { includeHiddenElements: true })).toBeNull();
      expect(queryByTestId('buster-suspicious')).toBeNull(); // drawn, never spoken
    });
  });

  describe('Preset variants', () => {
    it('EmptyOffline renders with correct title', () => {
      const { getByText } = render(<EmptyOffline />);
      expect(getByText('Transmission Interrupted')).toBeTruthy();
    });

    it('EmptyOffline shows Buster dimmed: the house gone dark, not crying', () => {
      const { getByTestId } = render(<EmptyOffline />);
      expect(getByTestId('buster-dimmed', { includeHiddenElements: true })).toBeTruthy();
    });
  });
});
