/**
 * aStackTitleIsStruckOnTheShelf.test.tsx — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings > READING > Hide slurs struck a stack's title on its own page, the profile and the
 * Lobby, and left it whole on the Reel's STACKS shelf, drawn and spoken. The shelf's can strikes it
 * now, typed over letter for letter (so its label is measured the length it is drawn), and its
 * spoken name says "struck"; a member who did not ask reads it as written.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StackCan } from '../StackCan';
import { useAuthStore } from '@/src/stores/auth';

const STACK = { id: 'stack-1', title: 'For every retard in the stalls', films: [], curator: 'ana', certifyCount: 0 } as never;
const as = (preferences: Record<string, unknown>) =>
  useAuthStore.setState({ user: { id: 'me', username: 'me', role: 'free', preferences } as never });
afterEach(() => useAuthStore.setState({ user: null }));

const can = () => render(<StackCan stack={STACK} width={160} height={220} onPress={jest.fn()} />);

it('a member who hides slurs reads the title struck on the shelf, and hears it struck', () => {
  as({ hide_slurs: true });
  const r = can();
  expect(r.queryByText(/retard/)).toBeNull();
  expect(r.getByText('xxxxxx')).toBeTruthy();
  expect(r.getByLabelText(/^For every struck in the stalls\. /)).toBeTruthy();
});

it('a member who did not ask reads the title as written', () => {
  as({});
  const r = can();
  expect(r.getByText('For every retard in the stalls')).toBeTruthy();
  expect(r.getByLabelText(/^For every retard in the stalls\. /)).toBeTruthy();
});
