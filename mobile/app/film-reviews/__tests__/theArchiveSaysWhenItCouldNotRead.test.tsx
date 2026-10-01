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
/** Each read's answer in turn, when a test asks for more than one; else mockAnswer. */
let mockAnswers: { data: unknown; error: unknown }[] = [];
/** The cursor each read was asked from (null: the first page). */
const mockFrom: (string | null)[] = [];
jest.mock('@/src/lib/supabase', () => {
  const read = () => {
    let from: string | null = null;
    const chain: any = {};
    for (const k of ['select', 'eq', 'not', 'neq', 'order']) chain[k] = () => chain;
    chain.or = (f: string) => { from = f; return chain; };
    chain.limit = () => { mockFrom.push(from); return Promise.resolve(mockAnswers.shift() ?? mockAnswer); };
    return chain;
  };
  return { supabase: { from: () => read() } };
});
// As the router hands it over: decoded (useLocalSearchParams decodes each param).
let mockTitle = 'The Film';
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '631', title: mockTitle }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
/** The list's own "reached the end", as the last render handed it over. */
let mockEndReached: (() => void) | null = null;
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const List = require('@/mockups/tabs/flashListMock').makeFlashListMock().FlashList;
  const R = require('react');
  return {
    CinematicFlashList: (p: { onEndReached?: () => void }) => {
      mockEndReached = p.onEndReached ?? null;
      return R.createElement(List, p);
    },
  };
});
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

describe('more critiques', () => {
  const row = (n: number, at: string) => ({
    ...ROW, id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`, film_title: `Film ${n}`, created_at: at,
  });
  /** Twenty rows, the last two filed in the same second: a page that is full. */
  const FULL = Array.from({ length: 20 }, (_, i) => row(100 - i, i < 18 ? `2026-09-${String(28 - i).padStart(2, '0')}T00:00:00+00:00` : '2026-09-01T00:00:00+00:00'));
  const more = async (_r: ReturnType<typeof render>) => {
    await act(async () => { mockEndReached!(); });
  };

  beforeEach(() => { mockFrom.length = 0; mockAnswers = []; });

  it('are asked for from where the page ended — its time, then its id — never by offset', async () => {
    mockAnswers = [{ data: FULL, error: null }, { data: [row(1, '2026-08-01T00:00:00+00:00')], error: null }];
    const r = await mount();
    await more(r);
    const last = FULL[19];
    expect(mockFrom).toEqual([null,
      `created_at.lt."${last.created_at}",and(created_at.eq."${last.created_at}",id.lt."${last.id}")`]);
    expect(r.getAllByText('Film 1').length).toBeGreaterThan(0);
  });

  it('never draws a critique twice', async () => {
    mockAnswers = [{ data: FULL, error: null }, { data: [FULL[19], row(1, '2026-08-01T00:00:00+00:00')], error: null }];
    const r = await mount();
    await more(r);
    expect(r.getAllByText('Film 81')).toHaveLength(1);
  });

  it('that could not be reached keep the critiques drawn, say so, and ask again', async () => {
    mockAnswers = [{ data: FULL, error: null }, { data: null, error: { message: 'Network request failed' } }];
    const r = await mount();
    await more(r);
    expect(r.getAllByText('Film 100').length).toBeGreaterThan(0);
    expect(r.getByText('More critiques could not be reached.')).toBeTruthy();
    mockAnswers = [{ data: [row(1, '2026-08-01T00:00:00+00:00')], error: null }];
    await act(async () => { fireEvent.press(r.getByLabelText('Ask for more critiques')); });
    expect(r.queryByText('More critiques could not be reached.')).toBeNull();
    expect(r.getAllByText('Film 1').length).toBeGreaterThan(0);
  });
});
