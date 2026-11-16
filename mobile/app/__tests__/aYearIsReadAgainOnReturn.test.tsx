/**
 * aYearIsReadAgainOnReturn.test.tsx — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * Year in Cinema read the member's year as it opened, and only then. A member with no film yet
 * pressed LOG YOUR FIRST FILM, sealed the log, and came back to "A Blank Reel": the screen beneath
 * the Log sheet was never closed, so it never read again. Now every return to it reads the year
 * again; the opening reads it once.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import YearInCinemaScreen from '../year-in-cinema';
import { useAuthStore } from '@/src/stores/auth';
import type { YearLogInput } from '@/src/services/YearInCinemaService';

jest.mock('@/src/services/YearInCinemaService', () => ({
  ...jest.requireActual('@/src/services/YearInCinemaService'),
  fetchYearLogs: jest.fn(),
}));
/** Each screen's focus, as the navigator gives it: a return to the screen runs them again. */
const mockFocused = new Set<() => unknown>();
jest.mock('expo-router', () => {
  const mockReact = jest.requireActual('react');
  return {
    ...require('@/test-utils/expoRouterMock').expoRouterMock(),
    useFocusEffect: (cb: () => (() => void) | void) => mockReact.useEffect(() => {
      mockFocused.add(cb);
      const undo = cb();
      return () => { mockFocused.delete(cb); if (typeof undo === 'function') undo(); };
    }, [cb]),
  };
});
const { fetchYearLogs } = jest.requireMock('@/src/services/YearInCinemaService') as { fetchYearLogs: jest.Mock };

const log = (watchedDate: string, n: number): YearLogInput =>
  ({ id: n, title: `Film ${n}`, poster: null, rating: 4, watchedDate, createdAt: watchedDate });

const realNow = Date.now.bind(Date);
beforeEach(() => {
  const from = realNow();
  jest.spyOn(Date, 'now').mockImplementation(() => new Date('2027-03-10T12:00:00').getTime() + (realNow() - from));
  fetchYearLogs.mockReset();
  mockFocused.clear();
  useAuthStore.setState({ user: { id: 'me', username: 'member' } as never });
});
afterEach(() => jest.restoreAllMocks());

it('a return to the screen reads the year again, so a film logged meanwhile is counted', async () => {
  fetchYearLogs.mockResolvedValue([]);
  const screen = await render(<YearInCinemaScreen />);
  expect(await screen.findByText('A Blank Reel')).toBeTruthy();
  // The opening reads it once.
  expect(fetchYearLogs).toHaveBeenCalledTimes(1);

  // A film is logged from the Log sheet over it, and the member comes back.
  fetchYearLogs.mockResolvedValue([log('2027-03-09', 1)]);
  await act(async () => { mockFocused.forEach((focus) => { focus(); }); });
  expect(fetchYearLogs).toHaveBeenCalledTimes(2);
  expect(await screen.findByText('2027')).toBeTruthy();
  expect(screen.queryByText('A Blank Reel')).toBeNull();
});
