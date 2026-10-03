/**
 * Your own followers, and whom you follow, are said to you.
 *
 * An empty list said "No one follows this member yet." to the member it was
 * about, on their own file. A member's own circle speaks to them; anyone
 * else's speaks of "this member".
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';

import SocialModal from '../social-modal';
import { ProfileService } from '@/src/services/ProfileWriteService';

afterEach(async () => { await act(async () => { await Promise.resolve(); }); });

let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  router: { dismiss: jest.fn(), back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/services/ProfileWriteService', () => ({
  ProfileService: { getSocialConnections: jest.fn() },
}));
jest.mock('@/src/services/LoungeService', () => ({ LoungeService: { getUserLounges: jest.fn() } }));
jest.mock('@/src/stores/lounge', () => ({ useLoungeStore: { getState: jest.fn(() => ({ sendMessage: jest.fn() })) } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me', username: 'cinephile' } }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { BlurView: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children) };
});

beforeEach(() => {
  jest.clearAllMocks();
  (ProfileService.getSocialConnections as jest.Mock).mockResolvedValue({ profiles: [], hasMore: false });
});

describe('an empty circle', () => {
  it.each([
    ['followers', 'me', 'No one follows you yet.'],
    ['following', 'me', 'You haven\'t followed anyone yet.'],
    ['followers', 'someone-else', 'No one follows this member yet.'],
    ['following', 'someone-else', 'This member hasn\'t followed anyone yet.'],
  ])('%s of %s says: %s', async (type, userId, line) => {
    mockParams = { type, userId };
    const r = render(<SocialModal />);
    await waitFor(() => expect(r.getByText(line)).toBeTruthy());
  });
});
