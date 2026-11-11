/**
 * A salon's cover is its host's to choose (P4.4).
 *
 * A link may name any salon, and a pick changes the cover on screen at once, before the house
 * could refuse it: the picker is drawn for the host alone, and anyone else is told plainly. A cold
 * link (and the return after a sign-in) finds the corridor unread: the salon's host is read from
 * the house, so the host is never told "not yours" (P4.21).
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import CoverPicker from '../cover-picker';
import { useAuthStore } from '@/src/stores/auth';
import { useLoungeStore } from '@/src/stores/lounge';
import { supabase } from '@/src/lib/supabase';

/** The house's answer for the salon's row, as the picker asks for it. */
const house = (answer: { data: unknown; error: unknown }) => {
  const asked: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  chain.select = (...a: unknown[]) => { asked.push(['select', ...a]); return chain; };
  chain.eq = (...a: unknown[]) => { asked.push(['eq', ...a]); return chain; };
  chain.maybeSingle = () => Promise.resolve(answer);
  jest.spyOn(supabase, 'from').mockImplementation(((table: string) => { asked.push(['from', table]); return chain; }) as never);
  return asked;
};

jest.mock('expo-router', () => ({ ...require('@/test-utils/expoRouterMock').expoRouterMock(), useLocalSearchParams: () => ({ loungeId: '00000011-0000-4000-8000-000000000011' }) }));
jest.mock('@/src/components/log/LogSearchEngine', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View, { testID: 'cover-search' }) };
});

const salon = (host: string) => ({ id: '00000011-0000-4000-8000-000000000011', name: 'The Back Row', creator_id: host });

beforeEach(() => useAuthStore.setState({ user: { id: 'me' } as never }));
afterEach(() => { useAuthStore.setState({ user: null }); useLoungeStore.setState({ lounges: [] }); jest.restoreAllMocks(); });

it('draws the picker for the salon’s host', async () => {
  useLoungeStore.setState({ lounges: [salon('me')] as never });
  const r = await render(<CoverPicker />);
  expect(r.getByTestId('cover-search')).toBeTruthy();
  expect(r.queryByText('Not Yours to Change')).toBeNull();
});

it('tells a member who does not host it, and draws no picker', async () => {
  useLoungeStore.setState({ lounges: [salon('them')] as never });
  const r = await render(<CoverPicker />);
  expect(r.getByText('Not Yours to Change')).toBeTruthy();
  expect(r.queryByTestId('cover-search')).toBeNull();
  expect(r.getByLabelText('Close')).toBeTruthy();
});

it('opened signed out: asked in, never told "not yours"; signed in as its host, the picker is drawn (P4.19)', async () => {
  useAuthStore.setState({ user: null });
  useLoungeStore.setState({ lounges: [salon('me')] as never });
  const r = await render(<CoverPicker />);
  expect(r.getByText('For Members')).toBeTruthy();
  expect(r.getByLabelText('Identify yourself. Sign in.')).toBeTruthy();
  expect(r.queryByText('Not Yours to Change')).toBeNull();
  await act(async () => { useAuthStore.setState({ user: { id: 'me' } as never }); });
  expect(r.getByTestId('cover-search')).toBeTruthy();
});

describe('a cold link: the corridor unread', () => {
  it('reads the salon’s host from the house, and draws the picker for its host', async () => {
    const asked = house({ data: { creator_id: 'me' }, error: null });
    const r = await render(<CoverPicker />);
    expect(await r.findByTestId('cover-search')).toBeTruthy();
    expect(asked).toEqual([['from', 'lounges'], ['select', 'creator_id'], ['eq', 'id', '00000011-0000-4000-8000-000000000011']]);
    expect(r.queryByText('Not Yours to Change')).toBeNull();
  });

  it('tells a member who does not host it', async () => {
    house({ data: { creator_id: 'them' }, error: null });
    const r = await render(<CoverPicker />);
    expect(await r.findByText('Not Yours to Change')).toBeTruthy();
    expect(r.queryByTestId('cover-search')).toBeNull();
  });

  it('a salon the house does not have: a path that leads nowhere, never "not yours"', async () => {
    house({ data: null, error: null });
    const r = await render(<CoverPicker />);
    expect(await r.findByText('ROUTE NOT IN THE ARCHIVE')).toBeTruthy();
    expect([r.queryByTestId('cover-search'), r.queryByText('Not Yours to Change')]).toEqual([null, null]);
  });

  it('a read that fails: said, with the way to ask again and a way out', async () => {
    house({ data: null, error: { message: 'fetch failed' } });
    const r = await render(<CoverPicker />);
    expect(await r.findByText('The salon could not be reached.')).toBeTruthy();
    expect(r.getByLabelText('Close')).toBeTruthy();
    expect([r.queryByTestId('cover-search'), r.queryByText('Not Yours to Change')]).toEqual([null, null]);
  });
});
