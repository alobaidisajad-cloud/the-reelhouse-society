/**
 * theSuggestionsSayWhenTheCatalogueIsAway.test.tsx — when the suggestions for the words in the
 * Darkroom's search could not be read, the place they would be says the catalogue is out of reach,
 * with the house's TRY AGAIN, which asks for the same words again; never an empty list. New words
 * take the old words' failure away, and an older ask that fails after newer words says nothing.
 * The sealed fault run found the silence (house_unreachable: every suggestion 503, nothing said).
 */
import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { DarkroomHeader } from '../DarkroomHeader';
import { useDiscoverStore } from '@/src/stores/discover';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
const mockSearch = jest.fn();
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: (...a: unknown[]) => mockSearch(...a), detail: jest.fn() } }));

const FOUND = { results: [{ id: 289, title: 'Casablanca', media_type: 'movie', release_date: '1943-01-23', poster_path: null }] };
const AWAY = new Error('The film catalogue could not be reached (status 503)');

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((() => ({ remove: () => {} })) as never);
  useDiscoverStore.setState({ inputVal: '', query: '' } as never);
  mockSearch.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function open() {
  const r = render(<DarkroomHeader />);
  const field = () => r.getByTestId('darkroom-search-input');
  await fireEvent(field(), 'focus');
  return {
    r,
    rows: () => r.queryAllByTestId('darkroom-suggestion-row'),
    away: () => r.queryByText('THE TELEGRAPH IS DOWN'),
    type: async (text: string) => {
      await fireEvent.changeText(field(), text);
      await act(async () => { await jest.advanceTimersByTimeAsync(450); });
    },
  };
}

it('says the catalogue is out of reach where the suggestions would be, and lists none', async () => {
  mockSearch.mockRejectedValue(AWAY);
  const d = await open();
  await d.type('casablanca');
  expect(d.away()).toBeTruthy();
  expect(d.rows()).toHaveLength(0);
});

it('asks for the same words again on TRY AGAIN, and shows what comes back', async () => {
  mockSearch.mockRejectedValueOnce(AWAY).mockResolvedValue(FOUND);
  const d = await open();
  await d.type('casablanca');
  expect(d.away()).toBeTruthy();
  await fireEvent.press(d.r.getByText('TRY AGAIN'));
  await act(async () => { await jest.advanceTimersByTimeAsync(450); });
  expect(mockSearch.mock.calls.map(([words]) => words)).toEqual(['casablanca', 'casablanca']);
  expect(d.away()).toBeNull();
  expect(d.rows()).toHaveLength(1);
});

it('takes the failure away with new words, and an older ask failing after them says nothing', async () => {
  let failOld: (e: Error) => void = () => {};
  mockSearch.mockImplementationOnce(() => new Promise((_, reject) => { failOld = reject; })).mockResolvedValue(FOUND);
  const d = await open();
  await d.type('casa');
  await d.type('casablanca');
  await act(async () => { failOld(AWAY); await Promise.resolve(); });
  expect(d.away()).toBeNull();
  expect(d.rows()).toHaveLength(1);
});
