/**
 * A GENERATOR, not a test. THE NITRATE FILE, the card a member shares, at its ledger line's every
 * width: a serial beside a short handle, the house's address beside an eleven-letter handle (which
 * the address ran out of one line: largest-text run 41237565336), the address beside the longest
 * handle a member may have, and a film shared with no member at all. No generator drew the card,
 * so CI never measured it; it is drawn here at every size CI lays out (its words do not scale).
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { toHtml } from '../../profile/__tests__/zz-render.lib';
import { whenRendering, writeScreen } from '@/mockups/paths';
import { NitrateFileCard, type NitrateFileData } from '../NitrateFileCard';

const FILE: NitrateFileData = {
  title: 'Sunset Boulevard',
  year: '1950',
  posterUrl: null,
  rating: 4,
  pullQuote: 'A town that eats its own, and smiles for the camera while it chews.',
  status: 'watched',
};
const LONGEST = 'the_cinematheque_night_keeper_'.slice(0, 30);

whenRendering('share card generator', () => {
  it('writes the file at each width its ledger line can take', async () => {
    const states: [string, NitrateFileData, string | null][] = [
      ['sharecard', { ...FILE, username: 'vera', memberNo: 42 }, '@VERA'],
      ['sharecard-house-handle', { ...FILE, username: 'E2E_WRITER', memberNo: null }, '@E2E_WRITER'],
      ['sharecard-house-longest', { ...FILE, username: LONGEST, memberNo: null }, `@${LONGEST.toUpperCase()}`],
      ['sharecard-film-only', { ...FILE, status: null, pullQuote: null, username: null, memberNo: null }, null],
    ];
    for (const [name, data, handle] of states) {
      let r!: ReturnType<typeof render>;
      await act(async () => { r = render(<NitrateFileCard data={data} />); });
      // Found or the run fails: a plate written without the handle would pass as if it held it.
      if (handle) expect(r.getByText(handle)).toBeTruthy();
      writeScreen(name, toHtml(r.toJSON()));
      r.unmount();
    }
  });
});
