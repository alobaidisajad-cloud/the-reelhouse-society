/**
 * A salon's cover is its host's to choose (P4.4).
 *
 * A link may name any salon, and a pick changes the cover on screen at once, before the house
 * could refuse it: the picker is drawn for the host alone, and anyone else is told plainly.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import CoverPicker from '../cover-picker';
import { useAuthStore } from '@/src/stores/auth';
import { useLoungeStore } from '@/src/stores/lounge';

jest.mock('expo-router', () => ({ ...require('@/test-utils/expoRouterMock').expoRouterMock(), useLocalSearchParams: () => ({ loungeId: 'room' }) }));
jest.mock('@/src/components/log/LogSearchEngine', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View, { testID: 'cover-search' }) };
});

const salon = (host: string) => ({ id: 'room', name: 'The Back Row', creator_id: host });

beforeEach(() => useAuthStore.setState({ user: { id: 'me' } as never }));
afterEach(() => { useAuthStore.setState({ user: null }); useLoungeStore.setState({ lounges: [] }); });

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

it('draws no picker for a salon it does not know at all', async () => {
  const r = await render(<CoverPicker />);
  expect(r.queryByTestId('cover-search')).toBeNull();
  expect(r.getByText('Not Yours to Change')).toBeTruthy();
});
