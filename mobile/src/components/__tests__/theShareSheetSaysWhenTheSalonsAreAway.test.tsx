/**
 * theShareSheetSaysWhenTheSalonsAreAway.test.tsx — sharing to a salon, when
 * the salons could not be read.
 *
 * It said "You haven't joined any lounges yet." to a member of five, whose
 * salons simply had not arrived. Now it says they could not be reached, and
 * offers to ask again.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as any).getState = () => s;
  return { useAuthStore };
});
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
/** How many times a sheet read the Lounge store while rendering. */
let mockLoungeReads = 0;
jest.mock('@/src/stores/lounge', () => {
  const actual = jest.requireActual('@/src/stores/lounge');
  const counted = Object.assign((...a: unknown[]) => { mockLoungeReads++; return actual.useLoungeStore(...a); }, actual.useLoungeStore);
  return { ...actual, useLoungeStore: counted };
});

// eslint-disable-next-line import/first
import ShareToLoungeModal from '../ShareToLoungeModal';
// eslint-disable-next-line import/first
import { useLoungeStore } from '@/src/stores/lounge';

const fetchLounges = jest.fn(async () => {});

async function open() {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<ShareToLoungeModal visible onClose={() => {}} filmTitle="Sunrise" filmId={631} posterPath={null} />); });
  return r;
}

beforeEach(() => fetchLounges.mockClear());

it('salons it could not read are not "you have joined none" — and it asks again', async () => {
  useLoungeStore.setState({ lounges: [], loungesFailed: true, loading: false, fetchLounges } as never);
  const r = await open();
  expect(r.queryByText(/haven.t joined any lounges/)).toBeNull();
  expect(r.getByText('The salons could not be reached.')).toBeTruthy();
  fetchLounges.mockClear();
  await act(async () => { fireEvent.press(r.getByLabelText('Ask for the salons again')); });
  expect(fetchLounges).toHaveBeenCalledTimes(1);
});

it('a member of none is still told so', async () => {
  useLoungeStore.setState({ lounges: [], loungesFailed: false, loading: false, fetchLounges } as never);
  const r = await open();
  expect(r.getByText(/haven.t joined any lounges/)).toBeTruthy();
});

const room = (id: string, over: Record<string, unknown>) =>
  ({ id, name: id, description: '', is_private: false, creator_id: 'host', created_at: '2026-09-01', member_count: 3, ...over });

it('offers only the salons the house lets this member speak in', async () => {
  // The server's rule is "Approved members can send": a pending or muted seat is refused.
  useLoungeStore.setState({
    lounges: [
      room('Seated', { membership_status: 'approved', unread_count: 0 }),
      room('Asked', { membership_status: 'pending', unread_count: 0 }),
      room('Hushed', { membership_status: 'muted', unread_count: 0 }),
      room('JustFounded', { is_member: true, unread_count: 0 }),
      room('Passing', {}),
    ],
    loungesFailed: false, loading: false, fetchLounges,
  } as never);
  const r = await open();
  expect(r.getByText('Seated')).toBeTruthy();
  expect(r.getByText('JustFounded')).toBeTruthy();
  for (const refused of ['Asked', 'Hushed', 'Passing']) expect(r.queryByText(refused)).toBeNull();
});

it('says which salon is chosen, as chosen rather than unavailable', async () => {
  useLoungeStore.setState({
    lounges: [room('Seated', { membership_status: 'approved', unread_count: 0 })],
    loungesFailed: false, loading: false, fetchLounges,
  } as never);
  const r = await open();
  await act(async () => { fireEvent.press(r.getByText('Seated')); });
  const chosen = r.getByRole('button', { name: 'Seated' });
  expect(chosen.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
});

it('closed, as it sits in every feed card, reads no store at all', async () => {
  // It lives in each card's action bar: a closed sheet that subscribed re-rendered every card on any change.
  mockLoungeReads = 0;
  await act(async () => { render(<ShareToLoungeModal visible={false} onClose={() => {}} filmTitle="Sunrise" filmId={631} posterPath={null} />); });
  expect(mockLoungeReads).toBe(0);
  await open();
  expect(mockLoungeReads).toBeGreaterThan(0);
});

it('a share that crashes says the house\'s sentence, never the code\'s', async () => {
  const reelToast = jest.requireActual('@/src/utils/reelToast').default;
  const said = jest.spyOn(reelToast, 'error').mockImplementation(() => undefined);
  const sendMessage = jest.fn(() => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'id')")));
  useLoungeStore.setState({
    lounges: [room('Seated', { membership_status: 'approved', unread_count: 0 })],
    loungesFailed: false, loading: false, fetchLounges, sendMessage,
  } as never);
  const r = await open();
  await act(async () => { fireEvent.press(r.getByText('Seated')); });
  await act(async () => { fireEvent.press(r.getByText('SHARE TO LOUNGE')); });
  expect(sendMessage).toHaveBeenCalled();
  expect(said).toHaveBeenCalledWith('Signal failed to transmit. Try again.');
  said.mockRestore();
});
