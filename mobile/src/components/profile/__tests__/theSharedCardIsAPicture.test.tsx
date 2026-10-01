/**
 * theSharedCardIsAPicture.test.tsx — the fingerprint's off-screen share card.
 *
 * Drawn off screen for the share button to capture, it sat in the reading
 * order: a screen reader read the genres twice (the strip, then the card) and
 * "DOCUMENT CLASSIFIED". And its words grew with the member's text size, so a
 * fixed 1080-wide picture came out different, and overflowed, at large text.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { TasteDNAExportCanvas } from '../TasteDNAExportCanvas';

const genres: [string, number][] = [['Drama', 40], ['Horror', 12]];

it('is never reached by a screen reader', () => {
  const r = render(<TasteDNAExportCanvas genres={genres} username="kane" memberNo="0042" />);
  expect(r.queryByText('DRAMA')).toBeNull();
  expect(r.getAllByText('DRAMA', { includeHiddenElements: true })).toHaveLength(1);
});

it('keeps every word at its drawn size, whatever the text size', () => {
  const r = render(<TasteDNAExportCanvas genres={genres} username="kane" memberNo="0042" />);
  for (const word of ['TASTE DNA', 'DRAMA', 'THE REELHOUSE SOCIETY', 'DOSSIER: KANE']) {
    expect(r.getByText(word, { includeHiddenElements: true }).props.allowFontScaling).toBe(false);
  }
});
