/**
 * aSwipeBackIsHeard.test.tsx — nav's history hears every way back.
 *
 * nav keeps its own history to break circular pushes (a fourth copy of one
 * screen REPLACES rather than stacks). It heard only nav.back(): never the iOS
 * swipe or Android's back button, because nothing called nav.syncState. So a
 * member who opened one film and swiped back four times had their fourth open
 * replace the screen they came from, and back then led somewhere else.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { PathTracker } from '../PathTracker';
import { nav } from '@/src/utils/typedRouter';

const router = jest.requireMock('expo-router').router as { push: jest.Mock; replace: jest.Mock };
const usePathname = jest.requireMock('expo-router').usePathname as jest.Mock;

it('four trips to one film by swipe-back open it four times, and replace nothing', async () => {
  router.push.mockClear();
  router.replace.mockClear();
  usePathname.mockReturnValue('/');
  const r = await render(<PathTracker />);
  for (let i = 0; i < 4; i++) {
    nav.push('/film/19');
    usePathname.mockReturnValue('/film/19');
    await r.rerender(<PathTracker />);
    // The swipe: the phone goes back, and nav is not told.
    usePathname.mockReturnValue('/');
    await r.rerender(<PathTracker />);
  }
  expect(router.push).toHaveBeenCalledTimes(4);
  expect(router.replace).not.toHaveBeenCalled();
});
