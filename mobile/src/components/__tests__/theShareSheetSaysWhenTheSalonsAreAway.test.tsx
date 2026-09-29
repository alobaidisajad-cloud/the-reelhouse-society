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
