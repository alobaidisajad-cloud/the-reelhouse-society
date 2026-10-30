/**
 * A GENERATOR, not a test. The Initiation card a new member meets first, with the member stamp at
 * its longest: a 30-letter handle (the longest a handle may be) and a four-figure serial. No
 * generator drew it, so CI never measured it at the largest text, where the stamp's one line was
 * cut (largest-text run 40847116101); it is drawn here at every text size CI lays out.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';
import { whenRendering, writeScreen } from '@/mockups/paths';

jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children, style }: any) => mockReact.createElement(View, { style: [{ flex: 1 }, style] }, children),
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, ...require('@/mockups/paths').PHONE }),
  };
});
// Drawn at rest: with motion on, the card's words are drawn at their first frame, unseen, and the
// layout tool measures nothing it cannot see.
jest.mock('@/src/hooks/useReduceMotion', () => ({ useReduceMotion: () => true }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: () => ({ ...require('@/mockups/paths').PHONE, scale: 3, fontScale: 1 }),
}));

// eslint-disable-next-line import/first
import InitiationModal, { stampLines } from '@/src/components/InitiationModal';

const LONGEST = 'the_cinematheque_night_keeper_'.slice(0, 30);

whenRendering('initiation generator', () => {
  it('writes the Initiation card with the longest stamp, and with a handle alone', async () => {
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<InitiationModal visible username={LONGEST} memberNo={1234} onComplete={jest.fn()} />); });
    // Found or the run fails: a plate written without the stamp would pass as if it held it.
    for (const line of stampLines(`@${LONGEST.toUpperCase()}`)) expect(r.getByText(line)).toBeTruthy();
    expect(r.getByText('MEMBER Nº 1234')).toBeTruthy();
    writeScreen('initiation', toHtml(r.toJSON()));
    r.unmount();
    await act(async () => { r = render(<InitiationModal visible username="vera" memberNo={null} onComplete={jest.fn()} />); });
    expect(r.queryByText(/MEMBER Nº/)).toBeNull();
    writeScreen('initiation-handle-alone', toHtml(r.toJSON()));
  });
});
