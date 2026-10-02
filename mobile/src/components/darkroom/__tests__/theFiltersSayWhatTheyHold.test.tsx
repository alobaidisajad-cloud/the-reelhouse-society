/**
 * theFiltersSayWhatTheyHold.test.tsx — the Darkroom's filter controls speak.
 *
 * The toggle said EXPAND or HIDE in its words but was no button to a screen
 * reader, said nothing of being open, and read its count badge as a bare
 * number after them; CLEAR beside it had no role and no name of its own.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { DarkroomHeader } from '../DarkroomHeader';
import { useDiscoverStore } from '@/src/stores/discover';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: jest.fn(async () => ({ results: [] })), detail: jest.fn() } }));

it('the toggle is a button that says it is closed, and how many filters it holds', () => {
  useDiscoverStore.setState({
    inputVal: '', query: '', mood: null,
    filters: { genreId: 18, decade: null, sortBy: 'popularity.desc', language: 'fr', minRating: 0, yearFrom: null, yearTo: null },
  } as never);
  const r = render(<DarkroomHeader />);
  const toggle = r.getByRole('button', { name: /^Show the filters/ });
  expect(toggle.props.accessibilityLabel).toMatch(/^Show the filters, \d+ applied$/);
  expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
  expect(r.getByLabelText('Clear the filters')).toBeTruthy();
});
