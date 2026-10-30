/**
 * aDraftTakenUpSaysWhenItWasKept.test.tsx — the line over a draft a writing room took up.
 *
 * It names when the words were kept, from the app's own tables (never Intl), and names no time it
 * cannot read rather than inventing one; START CLEAN lets the draft go. When what was kept could
 * not be read, it says so in crimson, with nothing to undo.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TakenUpLine, whenKept } from '../TakenUpLine';

// Local time, as the line reads it: Tuesday 27 October 2026, 21:40.
const KEPT = new Date(2026, 9, 27, 21, 40).toISOString();

it('names the day and hour the words were kept, and no time it cannot read', () => {
  expect([whenKept(KEPT), whenKept('not a date'), whenKept('')]).toEqual(['TUESDAY · 21:40', '', '']);
});

it('says the words were taken up, when, and offers to start clean', async () => {
  const startClean = jest.fn();
  const view = render(<TakenUpLine savedAt={KEPT} onStartClean={startClean} />);
  expect(view.getByText('TAKEN UP WHERE YOU LEFT IT · TUESDAY · 21:40')).toBeTruthy();
  expect(view.getByLabelText('Taken up where you left it, TUESDAY · 21:40.')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Start clean, and discard what was here'));
  expect(startClean.mock.calls.length).toBe(1);
});

it('a draft kept with no time is taken up without one', () => {
  const view = render(<TakenUpLine savedAt={null} onStartClean={jest.fn()} />);
  expect(view.getByText('TAKEN UP WHERE YOU LEFT IT')).toBeTruthy();
});

it('what could not be read is said, with nothing to start clean from', () => {
  const view = render(<TakenUpLine unreadable onStartClean={jest.fn()} />);
  expect(view.getByText('WHAT WAS HERE COULD NOT BE READ')).toBeTruthy();
  expect(view.queryByLabelText('Start clean, and discard what was here')).toBeNull();
  expect(view.getByLabelText('What was here could not be read. The room has cleared it.')).toBeTruthy();
});
