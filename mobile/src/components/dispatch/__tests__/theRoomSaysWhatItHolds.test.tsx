/**
 * theRoomSaysWhatItHolds.test.tsx — the two places an unfinished piece was
 * invisible.
 * ─────────────────────────────────────────────────────────────────────────────
 * The writing room keeps ONE unfinished dossier. Nothing said so, so beginning a
 * second essay overwrote the first without a word: the limit was a surprise
 * rather than a fact.
 *
 * And a member can reach the DOOR holding one — an Auteur may pay on the first
 * day and still be two days and five films short of filing. Told nothing, they
 * would reasonably assume the essay had been thrown away for being unfilable.
 *
 * Neither of these is the room narrating its own plumbing. There is no save
 * mark anywhere and there is not going to be one. Both of these are the app
 * answering a question a member cannot answer for themselves: where did my
 * writing go.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

import { PaperPicker, PaperDoor, FORMS } from '@/src/components/dispatch/paper/PaperMore';

describe('the picker admits the one slot', () => {
  it('says IN PROGRESS on the form that has one', () => {
    // `locked: false` because a member who HAS an unfinished dossier is by
    // definition an Auteur — the lock and the notice are answers to different
    // questions, and the lock wins where both apply (see below).
    const { getByText, getByLabelText } = render(
      <PaperPicker
        forms={FORMS.map((f) => ({ ...f, locked: false, inProgress: f.kind === 'dossier' }))}
      />,
    );
    expect(getByText('IN PROGRESS')).toBeTruthy();
    // And a screen reader hears it as part of the row rather than as a stray
    // label after it.
    expect(getByLabelText(/ESSAY\. One in progress\./)).toBeTruthy();
  });

  it('says nothing when there is nothing unfinished', () => {
    const { queryByText } = render(<PaperPicker forms={FORMS} />);
    expect(queryByText('IN PROGRESS')).toBeNull();
  });

  it('does not replace the AUTEURS lock, which is a different fact', () => {
    // A locked form is locked whether or not something is half-written in it,
    // and the lock is the one that decides whether the row can be pressed.
    const { getByLabelText } = render(
      <PaperPicker forms={FORMS.map((f) => ({ ...f, locked: true, inProgress: true }))} />,
    );
    expect(getByLabelText(/ESSAY\. Auteurs only\./)).toBeTruthy();
  });

  it('still opens the form it names', async () => {
    const onPick = jest.fn();
    const { getByLabelText } = render(
      <PaperPicker
        forms={FORMS.map((f) => ({ ...f, locked: false, inProgress: f.kind === 'dossier' }))}
        onPick={onPick}
      />,
    );
    await act(async () => { fireEvent.press(getByLabelText(/ESSAY\. One in progress\./)); });
    expect(onPick).toHaveBeenCalledWith('dossier');
  });
});

describe('the door says the work is kept', () => {
  const bars = { films: 3, filmsNeeded: 5, days: 1, daysNeeded: 2 };

  it('when they are holding one', () => {
    const { getByText, queryByText } = render(<PaperDoor {...bars} held />);
    expect(getByText('WHAT YOU HAVE WRITTEN IS KEPT')).toBeTruthy();
    expect(queryByText('NOTHING IS HIDDEN FROM YOU MEANWHILE')).toBeNull();
  });

  it('and keeps its own line when they are not', () => {
    // The ordinary door is about READING, and that sentence is what stops the
    // whole screen reading as a punishment.
    const { getByText } = render(<PaperDoor {...bars} />);
    expect(getByText('NOTHING IS HIDDEN FROM YOU MEANWHILE')).toBeTruthy();
  });

  it('still counts what remains, either way', () => {
    const { getByText } = render(<PaperDoor {...bars} held />);
    expect(getByText('3 OF 5')).toBeTruthy();
    expect(getByText('1 OF 2')).toBeTruthy();
  });
});
