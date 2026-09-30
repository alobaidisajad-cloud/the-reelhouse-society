/**
 * theArchiveSaysWhenItCouldNotRead.test.tsx — a film's log archive, when the
 * reviews could not be read.
 *
 * The page never looked at the error: with no signal it said "The projection
 * box awaits." of a film with forty reviews. Now it says they could not be
 * reached, and asks again when told.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

let mockAnswer: { data: unknown; error: unknown } = { data: [], error: null };
jest.mock('@/src/lib/supabase', () => {
  const chain: any = {};
  for (const k of ['select', 'eq', 'not', 'neq', 'order']) chain[k] = () => chain;
  chain.range = () => Promise.resolve(mockAnswer);
  return { supabase: { from: () => chain } };
});
// As the router hands it over: decoded (useLocalSearchParams decodes each param).
let mockTitle = 'The Film';
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '631', title: mockTitle }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/src/components/layout/CinematicFlashList', () => ({
  CinematicFlashList: require('@/mockups/tabs/flashListMock').makeFlashListMock().FlashList,
}));
jest.mock('@/src/components/feed/ActivityCard', () => ({
  ActivityCard: ({ item }: { item: { film_title: string } }) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, item.film_title);
  },
}));

// eslint-disable-next-line import/first
import FilmReviewsScreen from '../[id]';

const ROW = {
  id: '11111111-1111-4111-8111-111111111111', film_id: 631, film_title: 'Sunrise', poster_path: null, rating: 5,
  review: 'A song of two humans.', drop_cap: false, status: 'watched', abandoned_reason: null,
  created_at: '2026-09-01T00:00:00Z', year: 1927, user_id: '22222222-2222-4222-8222-222222222222',
  editorial_header: null, pull_quote: null, watched_with: null, is_autopsied: false, autopsy: null, is_spoiler: false,
  profiles: { username: 'morpho', avatar_url: null, role: 'cinephile' },
  certify_count: [{ count: 0 }], critique_count: [{ count: 0 }],
};

async function mount() {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<FilmReviewsScreen />); });
  return r;
}

it('reviews it could not read are not "the projection box awaits" — said, and asked again', async () => {
  mockAnswer = { data: null, error: { message: 'Network request failed' } };
  const r = await mount();
  expect(r.queryByText('The projection box awaits.')).toBeNull();
  expect(r.getByText('Transmission Interrupted')).toBeTruthy();
  mockAnswer = { data: [], error: null };
  await act(async () => { fireEvent.press(r.getByLabelText('Try again')); });
  expect(r.getByText('The projection box awaits.')).toBeTruthy();
});

it('a film with no reviews still says so', async () => {
  mockAnswer = { data: [], error: null };
  const r = await mount();
  expect(r.getByText('The projection box awaits.')).toBeTruthy();
  expect(r.queryByText('Transmission Interrupted')).toBeNull();
});

it('and draws the reviews it read', async () => {
  mockAnswer = { data: [ROW], error: null };
  const r = await mount();
  expect(r.getAllByText('Sunrise').length).toBeGreaterThan(0);
});

it('a title with a percent sign is its title — decoding it a second time threw', async () => {
  mockTitle = '100% Wolf';
  mockAnswer = { data: [], error: null };
  try {
    const r = await mount();
    expect(r.getByText('100% Wolf')).toBeTruthy();
  } finally {
    mockTitle = 'The Film';
  }
});
