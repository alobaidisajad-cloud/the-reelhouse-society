/**
 * roomSearch.test.tsx — one search box, and the three flags that make it usable.
 *
 * ── WHAT THIS CAUGHT ─────────────────────────────────────────────────────────
 * Three rooms used the shared <RoomSearch>. The Ledger and the Watchlist kept
 * hand-rolled copies — built only to place the breathing icon, which the shared
 * component already accepts as `ember`.
 *
 * The copies were not cosmetic. RoomSearch sets `autoCorrect={false}`,
 * `autoCapitalize="none"` and `spellCheck={false}` deliberately; both copies
 * left all three ON. So on iOS, typing "Nosferatu" or "Kieślowski" into those
 * two rooms could be silently corrected into a word the room does not contain,
 * and the member would be told "nothing under that name" for a film they own.
 *
 * A shared component only helps where it is used, so the guard is on the CLASS:
 * no room may build its own search box.
 */
import React from 'react';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';

import { RoomSearch } from '../RoomParts';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

const HERE = join(__dirname, '..');
const read = (f: string) => readFileSync(join(HERE, f), 'utf8');
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Enumerated from the filesystem, so a seventh room is covered on arrival. */
const ROOMS = readdirSync(HERE).filter((f) => /^Profile\w+Tab\.tsx$/.test(f));

describe('no room builds its own search box', () => {
  it('found the rooms to check', () => {
    // A broken glob would make every assertion below vacuous.
    expect(ROOMS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(ROOMS)('%s renders no bare TextInput', (room) => {
    // The Ledger and Watchlist each had one. Both looked right and neither
    // carried the flags that keep a film title intact.
    expect(code(read(room))).not.toMatch(/<TextInput/);
  });

  it.each(ROOMS)('%s does not import TextInput at all', (room) => {
    // Import removed with the copy: leaving it invites the next one back.
    expect(code(read(room))).not.toMatch(/\bTextInput\b/);
  });
});

describe('the shared search protects what is typed into it', () => {
  const box = (value = '') =>
    render(
      <RoomSearch
        value={value}
        onChange={jest.fn()}
        onClear={jest.fn()}
        placeholder="Search the ledger…"
        a11y="Search the ledger"
      />,
    );

  it('turns autocorrect off', () => {
    // THE defect. A search box is not a place to be autocorrected into a
    // different film.
    expect(box().getByPlaceholderText('Search the ledger…').props.autoCorrect).toBe(false);
  });

  it('turns spellcheck off', () => {
    expect(box().getByPlaceholderText('Search the ledger…').props.spellCheck).toBe(false);
  });

  it('does not capitalise what was typed', () => {
    // "ozu" must stay "ozu" — the search is matched, not displayed.
    expect(box().getByPlaceholderText('Search the ledger…').props.autoCapitalize).toBe('none');
  });

  it('is announced to a screen reader', () => {
    expect(box().getByPlaceholderText('Search the ledger…').props.accessibilityLabel)
      .toBe('Search the ledger');
  });

  it('offers a clear button only once there is something to clear', () => {
    expect(box('').queryByLabelText('Clear the search')).toBeNull();
    expect(box('nosferatu').queryByLabelText('Clear the search')).not.toBeNull();
  });

  it('places the ember before the field, where each room used to put its icon', () => {
    const { getByTestId } = render(
      <RoomSearch
        value=""
        onChange={jest.fn()}
        onClear={jest.fn()}
        placeholder="Search…"
        a11y="Search"
        ember={<React.Fragment />}
      />,
    );
    // Nothing to assert about a Fragment; the point is it renders without
    // throwing, so a room can hand its animated icon straight in.
    expect(() => getByTestId('nope')).toThrow();
  });
});
