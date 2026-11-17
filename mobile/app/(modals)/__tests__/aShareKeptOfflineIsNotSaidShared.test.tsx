/**
 * aShareKeptOfflineIsNotSaidShared.test.tsx — review round 10 (B5, the share sheet's half)
 * ─────────────────────────────────────────────────────────────────────────────
 * A film shared to a salon with no connection is kept for the wire, and the store says so
 * ("Message saved offline. Will send when connected."). The share sheet then said "Shared to lounge"
 * under it, of a share the house did not have. Now the sheet marks the salon (so it is not shared
 * twice) and says "Shared to lounge" only when the store answers that the house has it.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import SocialModal from '../social-modal';
import { LoungeService } from '@/src/services/LoungeService';
import { useLoungeStore } from '@/src/stores/lounge';
import reelToast from '@/src/utils/reelToast';

afterEach(async () => { await act(async () => { await Promise.resolve(); }); });

jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  router: { dismiss: jest.fn(), back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ shareFilmId: '550', shareFilmTitle: 'Fight Club' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/services/ProfileWriteService', () => ({ ProfileService: { getSocialConnections: jest.fn() } }));
jest.mock('@/src/services/LoungeService', () => ({ LoungeService: { getUserLounges: jest.fn() } }));
jest.mock('@/src/stores/lounge', () => ({ useLoungeStore: { getState: jest.fn(() => ({ sendMessage: jest.fn() })) } }));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => { const s = { user: { id: 'u1', username: 'cinephile' } }; return sel ? sel(s) : s; },
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'stranger', rank: 'archivist', open: jest.fn() }) }));
jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { BlurView: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; success: jest.Mock };
const mockTmdb = jest.requireMock('@/src/lib/tmdb') as { tmdb: { detail: jest.Mock } };

beforeEach(() => {
  jest.clearAllMocks();
  mockTmdb.tmdb.detail.mockResolvedValue({ id: 550, title: 'Fight Club', release_date: '1999-10-15', poster_path: '/fc.jpg' });
  (LoungeService.getUserLounges as jest.Mock).mockResolvedValue([{ lounge_id: 'l1', lounges: { id: 'l1', name: 'The Booth' } }]);
});

const shareTo = async (answer: boolean | 'queued') => {
  const sendMessage = jest.fn().mockResolvedValue(answer);
  (useLoungeStore.getState as jest.Mock).mockReturnValue({ sendMessage });
  const screen = render(<SocialModal />);
  await fireEvent.press(await screen.findByLabelText('Share to The Booth'));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
  return screen;
};

it('a share kept for the wire marks the salon and never says "Shared to lounge"; one the house took says it', async () => {
  const screen = await shareTo('queued');
  // Marked, so a second tap cannot share it twice.
  expect(await screen.findByLabelText('Already shared to this lounge')).toBeTruthy();
  expect([toast.mock.calls, toast.success.mock.calls, toast.error.mock.calls]).toEqual([[], [], []]);
  screen.unmount();

  const taken = await shareTo(true);
  expect(await taken.findByLabelText('Already shared to this lounge')).toBeTruthy();
  expect(toast.success.mock.calls).toEqual([['Shared to lounge']]);
});
