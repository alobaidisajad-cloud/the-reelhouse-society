/**
 * theVaultSaysWhenItCouldNotOpen.test.tsx — a member's own log, when their
 * Vault could not be opened.
 *
 * The page drew the note only when it had one, so a Vault that could not be
 * read (a cold start with no signal) left the record looking as though no note
 * had ever been written. The composer already said "Opens when you're back
 * online"; the record now says it could not be opened, and asks again.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LogReviewBody from '../LogReviewBody';

const base = { review: 'Every corridor is a held breath.', isAuteur: false, isSpoiler: false };

describe('the Vault, on the record', () => {
  it('that could not be opened says so to its owner, and asks again', async () => {
    const reread = jest.fn();
    const r = render(<LogReviewBody {...base} isOwner note="" noteUnreachable onRereadNote={reread} />);
    expect(r.getByText('The Vault could not be opened.')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByLabelText('Open the Vault again')); });
    expect(reread).toHaveBeenCalled();
  });

  it('even on a log with no words, where the section would otherwise draw nothing', () => {
    const r = render(<LogReviewBody isAuteur={false} isOwner note="" noteUnreachable />);
    expect(r.getByText('The Vault could not be opened.')).toBeTruthy();
  });

  it('says nothing of it to a visitor, whose device never asks', () => {
    const r = render(<LogReviewBody {...base} isOwner={false} note="" noteUnreachable />);
    expect(r.queryByText('The Vault could not be opened.')).toBeNull();
  });

  it('and nothing once the note is in hand', () => {
    const r = render(<LogReviewBody {...base} isOwner note="Watched it the week she left." noteUnreachable />);
    expect(r.queryByText('The Vault could not be opened.')).toBeNull();
  });
});
