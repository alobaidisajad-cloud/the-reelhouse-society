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
import InitiationModal, { STAMP_LINE, stampLines } from '../InitiationModal';

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

it('stamps the handle, and the real serial beneath it, read aloud as one stamp', () => {
  const r = open();
  expect([r.getByText('@VERA'), r.getByText('MEMBER Nº 0012')].every(Boolean)).toBe(true);
  expect(r.getByLabelText('@VERA · MEMBER Nº 0012')).toBeTruthy();
});

it('stamps the handle alone while the serial has not landed, never a number it does not have', () => {
  const r = render(<InitiationModal visible username="vera" memberNo={null} onComplete={jest.fn()} />);
  expect(r.getByLabelText('@VERA')).toBeTruthy();
  expect(r.queryByText(/MEMBER Nº/)).toBeNull();
});

it('sets a handle on one line, and a long one on two, after its own separator nearest the middle', () => {
  expect(stampLines('@VERA')).toEqual(['@VERA']);
  expect(stampLines(`@${'A'.repeat(STAMP_LINE - 1)}`)).toEqual([`@${'A'.repeat(STAMP_LINE - 1)}`]);
  expect(stampLines('@THE_CINEMATHEQUE_NIGHT_KEEPER_')).toEqual(['@THE_CINEMATHEQUE_', 'NIGHT_KEEPER_']);
  expect(stampLines('@NIGHT.KEEPER_OF_THE_FILM_VAULTS')).toEqual(['@NIGHT.KEEPER_OF_', 'THE_FILM_VAULTS']);
  // No separator of its own: broken at the middle, never left to the phone.
  expect(stampLines(`@${'K'.repeat(29)}`)).toEqual([`@${'K'.repeat(14)}`, 'K'.repeat(15)]);
});

it('draws a long handle as its two lines, still read aloud as one stamp', () => {
  const r = render(<InitiationModal visible username="the_cinematheque_night_keeper_" memberNo={1234} onComplete={jest.fn()} />);
  expect([r.getByText('@THE_CINEMATHEQUE_'), r.getByText('NIGHT_KEEPER_')].every(Boolean)).toBe(true);
  expect(r.getByLabelText('@THE_CINEMATHEQUE_NIGHT_KEEPER_ · MEMBER Nº 1234')).toBeTruthy();
});
