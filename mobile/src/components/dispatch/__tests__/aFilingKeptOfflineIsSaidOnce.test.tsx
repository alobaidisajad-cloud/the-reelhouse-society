/**
 * aFilingKeptOfflineIsSaidOnce.test.tsx — review round 10 (B4)
 * ─────────────────────────────────────────────────────────────────────────────
 * A take filed with no connection is kept for the queue and goes out when the wire is back. The
 * member was told so twice: the store said "Filed. It goes out when the wire is back." and the desk
 * that filed it said it again, and the toast bus queued the copy. Now the store says nothing and
 * the desk speaks, once. Driven through the real store and the real desk, the house unreachable.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { ComposeShortScreen } from '@/src/components/dispatch/ComposeDesks';
import { useDispatch } from '@/src/stores/dispatch';
import { useAuthStore } from '@/src/stores/auth';
import reelToast from '@/src/utils/reelToast';

const ME = '33333333-3333-4333-8333-333333333333';
const UNREACHABLE = { code: '', message: 'Failed to fetch' };

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
// Kept for the queue, and never replayed here: the replay is the queue's own, read elsewhere.
jest.mock('@/src/utils/offlineQueue', () => ({
  ...jest.requireActual('@/src/utils/offlineQueue'),
  enqueueMutation: jest.fn(() => true),
  flushOfflineQueue: jest.fn(),
}));
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; success: jest.Mock };

/** Everything said, in the order it was said, whatever its kind. */
const said = () => [...toast.mock.calls, ...toast.success.mock.calls, ...toast.error.mock.calls].map((c) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  mockHouse = supabaseFake({ rows: { dispatch_posts: [] }, fail: { dispatch_posts: UNREACHABLE } });
  useAuthStore.setState({ user: { id: ME, username: 'me', member_no: 7, avatar_url: null } as never, isAuthenticated: true } as never);
  useDispatch.setState({ filings: [], unsent: [] } as never);
});

it('a take filed with no connection is said kept once, by the desk, never twice', async () => {
  const r = render(<ComposeShortScreen kind="take" />);
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Your take'), 'Ozu never once stood up.'); });
  await act(async () => { await fireEvent.press(r.getByLabelText('File it')); });

  // Kept: on the page as unsent, and asked of the house once.
  expect(useDispatch.getState().unsent.map((f) => f.body)).toEqual(['Ozu never once stood up.']);
  expect(mockHouse.asked.filter((a) => a.table === 'dispatch_posts' && a.op === 'insert')).toHaveLength(1);
  expect(said()).toEqual(['Filed. It goes out when the wire is back.']);
});

it('the store keeps a filing made offline without a word of its own: the desk that filed it speaks', async () => {
  let res: { id: string; offline?: boolean } | null = null;
  await act(async () => { res = await useDispatch.getState().file({ kind: 'take', body: 'A take kept.', spoilerLabel: null, source: null, film: null }); });
  expect(res).toEqual(expect.objectContaining({ offline: true }));
  expect(said()).toEqual([]);
});
