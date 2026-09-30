/**
 * The Pulse says "the screening room is dark" only of a wire that arrived empty.
 *
 * It said it — "When a member logs their first film, it will appear here" —
 * whenever nothing was left to draw, including when the wire's only log was
 * the Lead Story on the same screen, held back so one film does not fill both.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import type { PulseActivity } from '../types';

jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());
jest.mock('@/src/stores/auth', () => {
  const state = { user: null };
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  return { useAuthStore };
});
jest.mock('../PulseCardItem', () => ({ PulseCardItem: () => null }));

// eslint-disable-next-line import/first
import { SocialPulseSection } from '../SocialPulse';

const DARK = 'The screening room is dark.';
const lead = { id: 'log-1' } as PulseActivity;

it('a wire that arrived empty is dark', () => {
  const r = render(<SocialPulseSection activities={[]} />);
  expect(r.getByText(DARK)).toBeTruthy();
});

it('a wire whose only log is the Lead Story is not "dark": that log is on the page', () => {
  const r = render(<SocialPulseSection activities={[lead]} featuredId="log-1" />);
  expect(r.queryByText(DARK)).toBeNull();
});

it('a wire still on its way draws nothing', () => {
  const r = render(<SocialPulseSection activities={undefined} />);
  expect(r.queryByText(DARK)).toBeNull();
});
