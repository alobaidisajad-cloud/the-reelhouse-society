/**
 * The stub — one control, five states, and the two things about it that are
 * easy to get wrong and invisible when you do.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FilmStub } from '../FilmStub';
import { STUB_HEIGHT } from '../filmStubMetrics';

const base = {
  existingLog: null,
  isWatchlisted: false,
  watchedLabel: null,
  open: false,
  onPress: jest.fn(),
  bottomInset: 34,
};

/** The rendered tree as text — the convention the rest of this suite uses. */
const textOf = (tree: ReturnType<typeof render>) => JSON.stringify(tree.toJSON());

describe('the stub states what is true, and only what is true', () => {
  it('invites when you have never seen it', () => {
    const t = render(<FilmStub {...base} />);
    expect(textOf(t)).toContain('LOG THIS FILM');
  });

  it('still invites when it is only shelved — the glyph carries that, not a row', () => {
    const t = render(<FilmStub {...base} isWatchlisted />);
    const visible = t.getAllByText('LOG THIS FILM');
    expect(visible).toHaveLength(1);
    // One control, one line: no second row announcing the watchlist.
    expect(t.queryByText(/ON THE WATCHLIST/)).toBeNull();
  });

  /**
   * The defect this caught: the stub DISPLAYED "LOG THIS FILM" and was READ
   * OUT as "On the watchlist". A sighted member and a blind one were told two
   * different things by the same control, and no screenshot would ever show it.
   */
  it('announces what it displays, and adds the standing it has no room to show', () => {
    const t = render(<FilmStub {...base} isWatchlisted />);
    const label = t.getByTestId('film-stub').props.accessibilityLabel;
    expect(label).toMatch(/^Log this film/);
    expect(label).toMatch(/on the watchlist/);
    expect(label).toMatch(/Opens film actions/);
  });

  it('becomes a record once you have logged it', () => {
    const t = render(<FilmStub {...base} existingLog={{ status: 'watched', rating: 4 }} watchedLabel="JUL 21" />);
    const text = textOf(t);
    expect(text).toContain('SEEN');
    expect(text).toContain('JUL 21');
    expect(text).not.toContain('LOG THIS FILM');
  });

  it('counts the rewatches instead of repeating the word', () => {
    const t = render(<FilmStub {...base} existingLog={{ status: 'rewatched', rating: 4, viewCount: 3 }} />);
    expect(textOf(t)).toContain('SEEN ×3');
  });

  /**
   * The state the first design of this control would have lied about: it would
   * have printed SEEN over a film the member gave up on.
   */
  it('says ABANDONED when that is the truth', () => {
    const t = render(<FilmStub {...base} existingLog={{ status: 'abandoned' }} watchedLabel="JUL 21" />);
    const text = textOf(t);
    expect(text).toContain('ABANDONED');
    expect(text).not.toContain('SEEN');
  });

  it('shows no reels for a log that carries no rating', () => {
    // A rating of zero is "not rated", not "zero reels". Drawing an empty rail
    // would read as a verdict of nothing.
    const t = render(<FilmStub {...base} existingLog={{ status: 'watched', rating: 0 }} />);
    expect(t.queryByLabelText(/reels?/i)).toBeNull();
  });
});

describe('one brass object on screen at a time', () => {
  /**
   * With the tray open, a brass stub reading LOG THIS FILM sat directly under a
   * brass row reading LOG THIS FILM. Open, the stub is only the handle.
   */
  it('stops inviting while the tray is open, and states your standing instead', () => {
    const closed = render(<FilmStub {...base} />);
    expect(textOf(closed)).toContain('LOG THIS FILM');

    const open = render(<FilmStub {...base} open />);
    const text = textOf(open);
    expect(text).not.toContain('LOG THIS FILM');
    expect(text).toContain('NOT YET SEEN');
  });

  it('says where a shelved film stands, rather than repeating the act', () => {
    const t = render(<FilmStub {...base} isWatchlisted open />);
    expect(textOf(t)).toContain('ON THE WATCHLIST');
  });
});

describe('the things that are invisible when wrong', () => {
  /**
   * PressableScale back-fills any omitted hitSlop side with 15pt. The stub sits
   * directly beneath the scrolling page, so vertical reach would steal taps
   * from whatever is above it — and a stolen tap looks like a dead control,
   * not like a hitSlop bug.
   */
  it('takes no vertical hitSlop, because it would come out of the page above', () => {
    const t = render(<FilmStub {...base} />);
    const slop = t.getByTestId('film-stub').props.hitSlop;
    expect(slop.top).toBe(0);
    expect(slop.bottom).toBe(0);
  });

  it('is a 52pt target — far past the 44pt minimum, so it needs no reach', () => {
    expect(STUB_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('announces where you stand AND what pressing does', () => {
    // "Seen, four reels" alone gives a blind member no reason to press it.
    const t = render(<FilmStub {...base} existingLog={{ status: 'watched', rating: 4 }} watchedLabel="21 July" />);
    const label = t.getByTestId('film-stub').props.accessibilityLabel;
    expect(label).toMatch(/SEEN/);
    expect(label).toMatch(/rated 4/);
    expect(label).toMatch(/21 July/);
    expect(label).toMatch(/Opens film actions/i);
  });

  it('tells the reader it is expanded once the tray is up', () => {
    const t = render(<FilmStub {...base} open />);
    // PressableScale merges its own disabled flag in, so match rather than equal.
    expect(t.getByTestId('film-stub').props.accessibilityState).toMatchObject({ expanded: true });
    expect(t.getByTestId('film-stub').props.accessibilityLabel).toMatch(/Closes film actions/i);
  });

  it('never formats a date itself', async () => {
    // Dates are formatted by the caller. Hermes may ship without Intl, and a
    // component that reaches for it fails silently on exactly one platform.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'FilmStub.tsx'), 'utf8');
    expect(src).not.toMatch(/toLocaleDateString|Intl\./);
  });

  it('presses once per press', async () => {
    const onPress = jest.fn();
    const t = render(<FilmStub {...base} onPress={onPress} />);
    await fireEvent.press(t.getByTestId('film-stub'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
