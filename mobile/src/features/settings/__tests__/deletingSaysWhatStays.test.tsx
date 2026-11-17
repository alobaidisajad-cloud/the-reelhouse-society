/**
 * deletingSaysWhatStays.test.tsx — the words before DELETE ACCOUNT, and the choice beside it.
 *
 * The warning said the member's critiques were "permanently destroyed"; the house kept them, and
 * every Dispatch filing and salon message, unsigned (review round 11). The owner chose to keep them
 * unsigned by default, say so, and let the member take them down in the same act. These hold the
 * words to that, and the choice to being a real, named checkbox that starts off.
 */
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { EraseWritingChoice, es } from '../EraseWritingChoice';
import {
  DELETE_GOES, DELETE_WORDS_ERASED, DELETE_WORDS_STAY, ERASE_CHOICE_LABEL, deleteAccountMessage,
} from '../deleteAccountWords';
import { DEPARTED_NAME } from '@/src/constants/departed';
import { SUPPORT_EMAIL } from '@/src/constants/support';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (p: Record<string, unknown>) => React.createElement('Icon', p) });
});

describe('the warning before DELETE', () => {
  it('names what is destroyed without calling the writing destroyed', () => {
    expect(DELETE_GOES).toMatch(/profile/);
    expect(DELETE_GOES).toMatch(/diary/);
    expect(DELETE_GOES).toMatch(/stacks/);
    expect(DELETE_GOES).not.toMatch(/critique|filing|salon message/i);
  });

  it('left alone, says the critiques, filings and salon messages stay, signed as a member departed, and how to have them erased later', () => {
    const words = deleteAccountMessage({ eraseWriting: false, paying: '' });
    expect(words).toContain(DELETE_WORDS_STAY);
    expect(words).not.toContain(DELETE_WORDS_ERASED);
    expect(DELETE_WORDS_STAY).toMatch(/stays where you wrote it/);
    expect(DELETE_WORDS_STAY).toContain(`signed “${DEPARTED_NAME}”`);
    expect(DELETE_WORDS_STAY).toMatch(/critiques, your Dispatch filings and your salon messages/);
    expect(DELETE_WORDS_STAY).toContain(SUPPORT_EMAIL);
    expect(DELETE_WORDS_STAY).toContain(`“${ERASE_CHOICE_LABEL}”`);
    expect(words).not.toMatch(/destroy[^.]*(critique|filing|message)/i);
    expect(words).toMatch(/This cannot be undone\.$/);
  });

  it('with the choice taken, says the writing goes too, each piece as the house takes it down', () => {
    const words = deleteAccountMessage({ eraseWriting: true, paying: '' });
    expect(words).toContain(DELETE_WORDS_ERASED);
    expect(words).not.toMatch(/stays where you wrote it/);
    expect(DELETE_WORDS_ERASED).toMatch(/critiques come off the page/);
    expect(DELETE_WORDS_ERASED).toMatch(/withdrawn by its author/);
    expect(DELETE_WORDS_ERASED).toMatch(/dispatch withdrawn/);
    expect(DELETE_WORDS_ERASED).toMatch(/What others wrote in reply stays/);
  });

  it('a paying member is still told the subscription goes on, at the end', () => {
    const words = deleteAccountMessage({ eraseWriting: false, paying: ' If you pay, cancel there too.' });
    expect(words).toMatch(/This cannot be undone\. If you pay, cancel there too\.$/);
  });
});

describe('the choice beside DELETE ACCOUNT', () => {
  it('is a checkbox that says its name and whether it is checked', async () => {
    const onToggle = jest.fn();
    const r = render(<EraseWritingChoice checked={false} onToggle={onToggle} />);
    const box = r.getByLabelText(ERASE_CHOICE_LABEL);
    expect(box.props.accessibilityRole).toBe('checkbox');
    expect(box.props.accessibilityState).toMatchObject({ checked: false });
    await act(async () => { await fireEvent.press(box); });
    expect(onToggle).toHaveBeenCalledTimes(1);
    r.rerender(<EraseWritingChoice checked onToggle={onToggle} />);
    expect(r.getByLabelText(ERASE_CHOICE_LABEL).props.accessibilityState).toMatchObject({ checked: true });
  });

  it('is a whole row a finger finds, 48 tall by its own geometry', () => {
    expect(StyleSheet.flatten(es.row).minHeight).toBeGreaterThanOrEqual(48);
  });
});
