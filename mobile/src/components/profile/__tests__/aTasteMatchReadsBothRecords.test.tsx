/**
 * aTasteMatchReadsBothRecords.test.tsx — TASTE COMPATIBILITY, on everything.
 *
 * The card compared the viewer's loaded page with the first page of the other
 * member's: two members with thousands of films each were matched on a
 * hundred. It now asks get_taste_match for both whole records. A record the
 * viewer may not read gives no card; a comparison that could not be read says
 * so and can be asked again, never shown as no match.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = jest.fn();
jest.mock('@/src/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock('@/src/stores/auth', () => {
  const state = { isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as any).getState = () => state;
  return { useAuthStore };
});

// eslint-disable-next-line import/first
import { TasteMatch } from '../TasteMatch';
// eslint-disable-next-line import/first
import { readTasteMatch, tasteMatchOf, type TasteShape } from '../tasteMatchRead';

const shape = (logs: number, ratings: number[], decades: Record<string, number>): TasteShape => ({ logs, ratings, decades });
const seventies = shape(2000, [0, 0, 100, 900, 1000], { '1970': 1800, '1990': 200 });

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((res) => setTimeout(res, 0)); });
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const r = render(<QueryClientProvider client={client}><TasteMatch userId="them" theirUsername="vesper" /></QueryClientProvider>);
  await settle();
  return r;
}

beforeEach(() => mockRpc.mockReset());

describe('the comparison', () => {
  it('finds two identical records wholly alike', () => {
    expect(tasteMatchOf(seventies, seventies)).toBe(100);
  });

  it('weighs the whole record, not a page of it', () => {
    // The same first hundred films; the rest of each record is another era entirely.
    const other = shape(2000, [0, 0, 100, 900, 1000], { '1990': 200, '2010': 1800 });
    expect(tasteMatchOf(seventies, other)).toBeLessThan(70);
  });

  it('has nothing to say under five logs on either side', () => {
    expect(tasteMatchOf(seventies, shape(4, [0, 0, 0, 4, 0], { '1970': 4 }))).toBeNull();
  });
});

describe('the read', () => {
  it('asks for both records by the member', async () => {
    mockRpc.mockResolvedValue({ data: { mine: seventies, theirs: seventies }, error: null });
    await expect(readTasteMatch('them')).resolves.toEqual({ mine: seventies, theirs: seventies });
    expect(mockRpc).toHaveBeenCalledWith('get_taste_match', { p_user_id: 'them' });
  });

  it('a record the viewer may not read is no comparison; a failed read is thrown', async () => {
    mockRpc.mockResolvedValueOnce({ data: { error: 'forbidden' }, error: null });
    await expect(readTasteMatch('them')).resolves.toBeNull();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'connection lost' } });
    await expect(readTasteMatch('them')).rejects.toEqual({ message: 'connection lost' });
  });
});

describe('the card', () => {
  it('shows the match over both whole records', async () => {
    mockRpc.mockResolvedValue({ data: { mine: seventies, theirs: seventies }, error: null });
    const r = await mount();
    expect(r.getByText('100%')).toBeTruthy();
    expect(r.getByText('KINDRED SPIRITS')).toBeTruthy();
  });

  it('says it is comparing while the records are read', async () => {
    mockRpc.mockReturnValue(new Promise(() => {}));
    const r = await mount();
    expect(r.getByText('Comparing your records…')).toBeTruthy();
  });

  it('says when the records could not be compared, and compares them when asked again', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'connection lost' } });
    const r = await mount();
    expect(r.getByText('Your records could not be compared just now.')).toBeTruthy();
    expect(r.queryByText('100%')).toBeNull();
    mockRpc.mockResolvedValueOnce({ data: { mine: seventies, theirs: seventies }, error: null });
    await act(async () => { fireEvent.press(r.getByLabelText('Try again')); });
    await settle();
    expect(r.getByText('100%')).toBeTruthy();
  });

  it('draws nothing for a record the viewer may not read', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'forbidden' }, error: null });
    const r = await mount();
    expect(mockRpc).toHaveBeenCalledWith('get_taste_match', { p_user_id: 'them' });
    expect(r.toJSON()).toBeNull();
  });
});
