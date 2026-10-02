/**
 * theInitiationTellsTheTruth.test.tsx — a new member's first words from the
 * house promise only what a new member has.
 *
 * The induction told every new member their record held "private notes and
 * all" (the Vault, an Archivist's) and that the Lounge stood "behind the brass
 * key" — the house's mark for a locked door, which the Lounge is not: every
 * member walks in and listens, and speaking is the Archivist's.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import InitiationModal from '../InitiationModal';

const open = () => render(
  <InitiationModal visible username="vera" memberNo={12} onComplete={jest.fn()} />,
);

// A press is debounced against the clock, so the clock moves between them.
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const beat = async (r: ReturnType<typeof open>, n: number) => {
  for (let i = 0; i < n; i++) {
    await act(async () => { await fireEvent.press(r.getByLabelText('Next')); });
    await act(async () => { jest.advanceTimersByTime(1000); });
  }
};

it('the ledger promises no private notes', async () => {
  const r = open();
  await beat(r, 1);
  expect(r.getByText(/Log what you watch/)).toBeTruthy();
  expect(r.queryByText(/private notes/i)).toBeNull();
});

it('the Lounge is open to listen, and the seat to speak is the Archivist\'s', async () => {
  const r = open();
  await beat(r, 2);
  const rooms = r.getByText(/The Reel, where the society talks/);
  expect(rooms.props.children).toMatch(/The Lounge, where all listen and Archivists speak\./);
  expect(r.queryByText(/brass key/i)).toBeNull();
});
